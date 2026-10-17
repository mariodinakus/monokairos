// NEXUS read-only public integration endpoint for MONO Weather.
// Reports sourced weather conditions only, never fictional proprietary predictions.
const CITY={lat:40.64,lon:22.94,label:'Thessaloniki, Greece'};
module.exports=async(req,res)=>{
 if(req.method!=='GET')return res.status(405).end();
 res.setHeader('Cache-Control','public, s-maxage=600, stale-while-revalidate=600');
 const base={schema:'nexus.v1',appId:'monokairos',name:'MONO Weather',url:'https://monokairos.vercel.app',connection:'read-only',capabilities:['weather-forecast','observational-context'],notifications:[],source:'Open-Meteo',place:CITY.label};
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),4200);
 try{const u=new URL('https://api.open-meteo.com/v1/forecast');u.searchParams.set('latitude',String(CITY.lat));u.searchParams.set('longitude',String(CITY.lon));u.searchParams.set('current','temperature_2m,wind_gusts_10m');u.searchParams.set('hourly','precipitation_probability');u.searchParams.set('forecast_days','1');u.searchParams.set('timezone','Europe/Athens');const r=await fetch(u.toString(),{signal:controller.signal});if(!r.ok)throw Error('forecast');const j=await r.json();const times=j.hourly?.time||[],probs=j.hourly?.precipitation_probability||[];const now=new Date();let high=null;for(let i=0;i<times.length;i++){const when=new Date(times[i]+'+03:00');if(when>=now&&when<new Date(now.getTime()+3*3600000)&&Number.isFinite(Number(probs[i])))high=Math.max(high??0,Number(probs[i]));}
 const gust=Number(j.current?.wind_gusts_10m);base.data={temperatureC:Number.isFinite(j.current?.temperature_2m)?j.current.temperature_2m:null,windGustKmh:Number.isFinite(gust)?gust:null,rainProbabilityNext3h:high,asOf:j.current?.time||null,attribution:'Open-Meteo modeled forecast, not a MONO proprietary model.'};
 if(Number.isFinite(gust)&&gust>=65)base.notifications.push({id:'gust:'+String(j.current?.time||'').slice(0,13),title:'Strong wind gust forecast',message:`Thessaloniki: forecast gusts ${Math.round(gust)} km/h (Open-Meteo).`,severity:'warning',time:new Date().toISOString()});
 if(high!==null&&high>=80)base.notifications.push({id:'rain:'+new Date().toISOString().slice(0,13),title:'Elevated rain probability',message:`Thessaloniki: forecast rain probability reaches ${Math.round(high)}% in the next 3 hours (Open-Meteo).`,severity:'notice',time:new Date().toISOString()});
 return res.status(200).json(base)
 }catch(e){return res.status(200).json({...base,status:'unavailable',data:null,note:'Public weather upstream unavailable; no notifications fabricated.'})}finally{clearTimeout(t)}
};