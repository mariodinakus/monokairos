const {guard,coordinates,limitedText}=require('../lib/server.cjs');
const Core=require('../forecast-core.js');
const cache=new Map(),pending=new Map();
module.exports=async(req,res)=>{
 if(!guard(req,res))return;
 const c=coordinates(req);if(!c){res.status(400).json({error:'Invalid coordinates'});return;}
 const lat=Math.round(c.lat*2)/2,lon=Math.round(c.lon*2)/2,key=lat+','+lon,hit=cache.get(key);
 res.setHeader('Cache-Control','s-maxage=21600, stale-while-revalidate=3600');
 if(hit&&Date.now()-hit.at<21600000){res.status(200).json(hit);return;}
 if(!pending.has(key)&&pending.size>=4){res.setHeader('Retry-After','15');res.setHeader('Cache-Control','no-store');res.status(429).json({error:'Outlook service busy'});return;}
 try{
  if(!pending.has(key))pending.set(key,(async()=>{
   const q=new URLSearchParams({latitude:String(lat),longitude:String(lon),models:'ecmwf_seasonal_ensemble_mean_seamless',forecast_days:'62',timezone:'UTC',timeformat:'unixtime',weekly:'temperature_2m_mean,temperature_2m_anomaly,precipitation_mean,precipitation_anomaly,precipitation_efi,temperature_2m_efi',monthly:'temperature_2m_anomaly,precipitation_anomaly'});
   const r=await fetch('https://seasonal-api.open-meteo.com/v1/seasonal?'+q,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('upstream');
   const data=Core.outlookData(JSON.parse(await limitedText(r)));data.latitude=lat;data.longitude=lon;
   if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,data);return data;
  })().finally(()=>pending.delete(key)));
  res.status(200).json(await pending.get(key));
 }catch{res.setHeader('Cache-Control','no-store');res.status(502).json({error:'Extended outlook unavailable'});}
};
