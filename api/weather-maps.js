const {guard,coordinates,limitedText}=require('../lib/server.cjs');
const Core=require('../forecast-core.js');
const cache=new Map(),pending=new Map();
const MODELS={ecmwf:'ecmwf_ifs025',gfs:'gfs_global'};
module.exports=async(req,res)=>{
 if(!guard(req,res))return;
 const q=new URL(req.url,'https://monokairos.vercel.app').searchParams,region=q.get('region')||'greece',model=q.get('model')||'ecmwf';
 if(!['greece','europe','local'].includes(region)||!Object.hasOwn(MODELS,model)){res.status(400).json({error:'Invalid region or model'});return;}
 const c=region==='local'?coordinates(req):{lat:40,lon:23};if(!c){res.status(400).json({error:'Invalid coordinates'});return;}
 const g=Core.grid(region,c.lat,c.lon),key=g.key+':'+model,hit=cache.get(key);
 res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=600');
 if(hit&&Date.now()-hit.at<3600000){res.status(200).json(hit);return;}
 if(!pending.has(key)&&pending.size>=3){res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','15');res.status(429).json({error:'Map service busy'});return;}
 try{
  if(!pending.has(key))pending.set(key,(async()=>{
   const p=new URLSearchParams({latitude:g.points.map(x=>x.lat).join(','),longitude:g.points.map(x=>x.queryLon).join(','),models:MODELS[model],forecast_days:'8',past_days:'1',timezone:'UTC',timeformat:'unixtime',hourly:'temperature_2m,precipitation,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,snowfall'});
   const r=await fetch('https://api.open-meteo.com/v1/forecast?'+p,{signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error('upstream');
   const data=Core.mapData(JSON.parse(await limitedText(r,4000000)),g);data.model=model;data.source=(model==='ecmwf'?'ECMWF IFS 0.25°':'NOAA GFS')+' via Open-Meteo';
   if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(key,data);return data;
  })().finally(()=>pending.delete(key)));
  res.status(200).json(await pending.get(key));
 }catch{res.setHeader('Cache-Control','no-store');res.status(502).json({error:'Forecast map unavailable'});}
};
