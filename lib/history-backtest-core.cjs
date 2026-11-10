/* MONO Historical Accuracy server-side service.
 * Shared/edge-cacheable calibration trained on real Previous Runs vs ERA5.
 * The browser must not issue 10+ separate archive requests per visitor.
 * No synthetic history, no test data reuse in fitting or selection. */
'use strict';
const M=require('../model.js');
const ExperimentalML=require('./experimental-ml.cjs');
const IDS=['ecmwf_ifs','ncep_gfs_seamless','dwd_icon_seamless'];
const KEYS=['temperature_2m','precipitation','wind_speed_10m'];
const LEADS=[0,1,2,3,4,5];
const fin=Number.isFinite;
const dateOffset=(n,now=Date.now())=>new Date(now+n*86400e3).toISOString().slice(0,10);
function hourlyFields(){
  return LEADS.flatMap(k=>KEYS.map(v=>v+(k?'_previous_day'+k:'')));
}
function options(lat,lon,days,now=Date.now()){
  return {latitude:lat.toFixed(2),longitude:lon.toFixed(2),start_date:dateOffset(-days,now),end_date:dateOffset(-6,now),timezone:'UTC',timeformat:'unixtime'};
}
function isoZone(v){
  if(typeof v!=='string'||v.length>64||!/^[A-Za-z_]+(?:\/[A-Za-z_+-]+)*$/.test(v))return 'UTC';
  try{new Intl.DateTimeFormat('en',{timeZone:v});return v}catch{return 'UTC'}
}
function localHours(times,zone){
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:isoZone(zone),hourCycle:'h23',hour:'2-digit'});
 return times.map(t=>Number(fmt.format(new Date(t))));
}
async function fetchJSON(endpoint,query,fetcher=fetch){
 const url=endpoint+'?'+new URLSearchParams(query);
 const response=await fetcher(url,{signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}});
 if(!response.ok){
  const err=new Error('Historical provider HTTP '+response.status);
  err.status=response.status;throw err;
 }
 const body=await response.json();
 if(body?.error||!body?.hourly?.time)throw new Error('Historical provider returned invalid archive data');
 return body;
}
function align(hourly,src,referenceTime){
 const byTime=new Map((hourly.time||[]).map((t,i)=>[t,i]));
 return referenceTime.map(t=>{
   const i=byTime.get(t);
   if(i===undefined||!Array.isArray(src))return null;
   const v=src[i];return fin(v)?v:null;
 });
}
function extract(reference,forecast,ids=IDS){
 const times=reference?.hourly?.time;
 if(!Array.isArray(times)||times.length<200)throw Error('ERA5 reference lacks 200 hourly observations');
 const r=reference.hourly,p=forecast?.hourly||{};
 if(!Array.isArray(r.temperature_2m)||!Array.isArray(p.time))throw Error('Historical forecast or ERA5 missing');
 const modelSets={temp:{},wind:{},precip:{},cloud:{}};
 let covered=0;
 ids.forEach((id,index)=>{
  let valid=false;
  for(const [variable,base] of [['temp','temperature_2m'],['wind','wind_speed_10m'],['precip','precipitation']]){
    const leads={};
    for(const k of LEADS){
      const name=base+(k?'_previous_day'+k:'');
      const raw=p[name+'_'+id]||(ids.length===1?p[name]:null);
      if(!Array.isArray(raw))continue;
      const series=align(p,raw,times);
      if(series.filter(fin).length>=200){leads[k]=series;valid=true;}
    }
    if(Object.keys(leads).length)modelSets[variable][id]=leads;
  }
  if(valid)covered++;
 });
 if(!Object.keys(modelSets.temp).length)throw Error('No usable archived temperature models');
 const result={times:times.map(t=>t*1000),models:modelSets,
    truth:{temp:r.temperature_2m,wind:r.wind_speed_10m,precip:r.precipitation,cloud:r.cloud_cover}};
 return {result,covered};
}
function fit(extracted,zone){
 const {times,models,truth}=extracted.result;
 const hours=localHours(times,zone);
 const input=(key)=>({times,hours,truth:truth[key],models:models[key]});
 const temp=M.fitVariable(input('temp'));
 const wind=M.fitVariable(input('wind'),{nonNegative:true});
 const precip=M.fitRain(input('precip'));
 const cloud=Object.keys(models.cloud).length&&Array.isArray(truth.cloud)?M.fitVariable(input('cloud')):{leads:{}};
 if(!Object.keys(temp.leads).length)throw Error('No valid historical temperature holdout');
 return {temp,wind,precip,cloud,hours:times.length,models:extracted.covered};
}
async function compute({lat,lon,days=62,zone='UTC',now=Date.now(),fetcher=fetch}){
 if(!fin(lat)||!fin(lon)||Math.abs(lat)>90||Math.abs(lon)>180||![62,180,365].includes(days))throw Error('Invalid history request');
 const base=options(lat,lon,days,now);
 const fArgs={...base,models:IDS.join(','),hourly:hourlyFields().join(',')};
 const tArgs={...base,models:'era5',hourly:'temperature_2m,precipitation,wind_speed_10m,cloud_cover'};
 const [forecast,truth]=await Promise.all([
   fetchJSON('https://previous-runs-api.open-meteo.com/v1/forecast',fArgs,fetcher),
   fetchJSON('https://archive-api.open-meteo.com/v1/archive',tArgs,fetcher)
 ]);
 const extracted=extract(truth,forecast);
 const trained=fit(extracted,zone);
 let experimentalML=null;
 try{experimentalML=ExperimentalML.evaluate(extracted.result,localHours(extracted.result.times,zone));}catch(error){console.warn('[MONO] Experimental ML unavailable:',error.message);}
 return {v:'4.6',days,start:base.start_date,end:base.end_date,at:now,
   source:'Open-Meteo Previous Runs / ERA5',reference:'ERA5 reanalysis',
   modelIds:Object.keys(extracted.result.models.temp),experimentalML,...trained};
}
module.exports={compute,fit,extract,align,localHours,isoZone,options,hourlyFields,fetchJSON,IDS};
