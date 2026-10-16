'use strict';
// Forecast-based local alert planner. Uses Unix seconds from Open-Meteo (UTC instants).
// The app refreshes scheduled events on launch. This is not real-time remote push.
const TYPES=['rain','storm','wind','daily','air'];
const HOUR=3600e3;
const safeNumber=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const rounded=v=>Math.round(v*10)/10;
const getDay=t=>new Date(t).toLocaleDateString('en-CA'); // device local date
function planForecastAlerts({weather,air,prefs,now=Date.now()}) {
 if(!weather?.hourly?.time || !Array.isArray(weather.hourly.time)) return [];
 const w=weather.hourly, out=[], last={};
 const allowed=Object.fromEntries(TYPES.map(t=>[t,prefs?.[t]===true]));
 const add=(type,start,title,body,interval=6*HOUR)=>{
   if(!allowed[type]||!Number.isFinite(start)||start<now+60e3||start>now+48*HOUR)return;
   if(last[type] && start-last[type]<interval)return;
   last[type]=start;
   out.push({type,at:start,title,body,source:'Open-Meteo',madeAt:now});
 };
 for(let i=0;i<w.time.length;i++){
   const stamp=Number(w.time[i])*1000;
   if(!Number.isFinite(stamp)||stamp<=now||stamp>now+48*HOUR)continue;
   const p=safeNumber(w.precipitation_probability?.[i]);
   const mm=safeNumber(w.precipitation?.[i]);
   const gust=safeNumber(w.wind_gusts_10m?.[i]);
   const code=safeNumber(w.weather_code?.[i]);
   if((p!==null&&p>=60)&&(mm!==null&&mm>=.6)){
     const prevP=safeNumber(w.precipitation_probability?.[i-1])||0;
     const prevMm=safeNumber(w.precipitation?.[i-1])||0;
     if(i===0||prevP<40||prevMm<.3)
      add('rain',stamp-30*60000,'MONO · Βροχή πλησιάζει',
       'Πρόγνωση βροχής '+Math.round(p)+'% · '+rounded(mm)+' mm/ώρα. Πιθανή έναρξη περίπου σε 30 λεπτά.',5*HOUR);
   }
   if([95,96,99].includes(code)||(mm!==null&&mm>=8)){
     add('storm',stamp-40*60000,'MONO · Έντονα φαινόμενα',
       'Πρόγνωση καταιγίδας ή έντονης βροχής στην περιοχή σου. Δες την πρόγνωση πριν μετακινηθείς.',12*HOUR);
   }
   if(gust!==null&&gust>=62){
     add('wind',stamp-40*60000,'MONO · Ισχυρές ριπές ανέμου',
       'Πιθανές ριπές έως '+Math.round(gust)+' km/h. Πρόσεχε στις μετακινήσεις.',12*HOUR);
   }
 }
 if(air?.hourly?.time && Array.isArray(air.hourly.time)){
   const a=air.hourly;
   for(let i=0;i<a.time.length;i++){
     const stamp=Number(a.time[i])*1000,aqi=safeNumber(a.us_aqi?.[i]);
     if(aqi!==null&&aqi>=101){
       add('air',stamp-30*60000,'MONO · Ποιότητα αέρα',
         'Προβλέπεται δείκτης US AQI '+Math.round(aqi)+' (επιβάρυνση για ευαίσθητες ομάδες).',12*HOUR);
     }
   }
 }
 if(allowed.daily){
   const nowDate=new Date(now);
   for(let day=1;day<=2;day++){
     const morning=new Date(now);
     morning.setDate(nowDate.getDate()+day);
     morning.setHours(7,30,0,0);
     const start=morning.getTime(), targetDay=getDay(start);
     const matching=w.time.map((s,i)=>({t:Number(s)*1000,i})).filter(v=>getDay(v.t)===targetDay);
     if(matching.length<6)continue;
     const temps=matching.map(v=>safeNumber(w.temperature_2m?.[v.i])).filter(v=>v!==null);
     const rain=matching.map(v=>safeNumber(w.precipitation_probability?.[v.i])).filter(v=>v!==null);
     const low=temps.length?Math.round(Math.min(...temps)):null;
     const high=temps.length?Math.round(Math.max(...temps)):null;
     const maxRain=rain.length?Math.max(...rain):null;
     const body=(low!==null?'Θερμοκρασία '+low+'–'+high+'°C. ':'')+
        (maxRain!==null?'Μέγιστη πιθανότητα βροχής '+Math.round(maxRain)+'%. ':'')+
        'Πρόγνωση από την τελευταία ανανέωση MONO.';
     add('daily',start,'MONO · Καλημέρα! Η πρόγνωσή σου',body,16*HOUR);
   }
 }
 return out.sort((a,b)=>a.at-b.at).slice(0,16);
}
module.exports={planForecastAlerts};
