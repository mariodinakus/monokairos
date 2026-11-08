'use strict';
// NEXUS reads Open-Meteo modeled forecast from this public MONO integration endpoint.
// UTC Unix hourly timestamps avoid incorrect local comparisons when Greece changes DST.
const CITY={lat:40.64,lon:22.94,label:'Thessaloniki, Greece'};
module.exports=async(req,res)=>{
 if(req.method!=='GET')return res.status(405).end();
 res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=240');
 const base={schema:'nexus.v1',appId:'monokairos',name:'MONO Weather',url:'https://monokairos.vercel.app',connection:'read-only',status:'unavailable',capabilities:['weather-forecast','rain-alerts','wind-gusts'],notifications:[],source:'Open-Meteo via MONO',place:CITY.label,data:null};
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5500);
 try{
  const u=new URL('https://api.open-meteo.com/v1/forecast');u.searchParams.set('latitude',String(CITY.lat));u.searchParams.set('longitude',String(CITY.lon));u.searchParams.set('current','temperature_2m,wind_gusts_10m');u.searchParams.set('hourly','precipitation_probability');u.searchParams.set('forecast_days','2');u.searchParams.set('timeformat','unixtime');u.searchParams.set('timezone','Europe/Athens');
  const response=await fetch(u.toString(),{signal:controller.signal,headers:{Accept:'application/json'}});if(!response.ok)throw Error('weather fetch');const j=await response.json();const times=j.hourly?.time||[],probs=j.hourly?.precipitation_probability||[];
  let high=null;const now=Date.now()/1000;
  for(let i=0;i<times.length;i++){if(Number(times[i])>=now&&Number(times[i])<now+3*3600&&typeof probs[i]==='number'&&Number.isFinite(probs[i]))high=Math.max(high??0,probs[i])}
  const gust=typeof j.current?.wind_gusts_10m==='number'?j.current.wind_gusts_10m:null,temperature=typeof j.current?.temperature_2m==='number'?j.current.temperature_2m:null;
  base.status='ok';base.data={summary:`Thessaloniki: ${temperature??'—'}°C · gusts ${gust??'—'} km/h`,temperatureC:temperature,windGustKmh:gust,rainProbabilityNext3h:high,asOf:Number.isFinite(j.current?.time)?new Date(j.current.time*1000).toISOString():new Date().toISOString(),source:'Open-Meteo forecast/model grid (not direct station observations)'};
  const asOf=base.data.asOf;
  if(gust!==null&&gust>=65)base.notifications.push({id:`gust:${asOf.slice(0,13)}`,title:'Strong wind gusts near Thessaloniki',message:`Current modeled gust ${Math.round(gust)} km/h · Open-Meteo via MONO`,severity:'warning',time:asOf});
  if(high!==null&&high>=80)base.notifications.push({id:`rain:${asOf.slice(0,13)}`,title:'High rain probability near Thessaloniki',message:`Rain probability peaks at ${Math.round(high)}% in next 3 hours · Open-Meteo via MONO`,severity:'notice',time:asOf});
  return res.status(200).json(base)
 }catch{return res.status(200).json({...base,note:'Weather provider unavailable. No invented alerts.'})}finally{clearTimeout(timeout)}
};