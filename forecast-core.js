/* Forecast transformations shared by the browser and fixed-source API handlers. */
(function(root){
'use strict';
const HOUR=3600e3,DAY=24*HOUR,finite=Number.isFinite;
const value=v=>typeof v==='number'&&finite(v)?v:null;
const sum=a=>a.length&&a.every(finite)?a.reduce((x,y)=>x+y,0):null;
const maximum=a=>a.length&&a.every(finite)?Math.max(...a):null;
const round=v=>finite(v)?Math.round(v*100)/100:null;
const wrap=x=>((x+180)%360+360)%360-180;
// Leaflet image overlays use Web Mercator, while forecast rows are equally spaced in latitude.
function rasterLatitude(fraction,south,north){const m=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));return Math.atan(Math.sinh(m(north)+(m(south)-m(north))*fraction))*180/Math.PI;}
function grid(region,lat=40,lon=23){
 let bounds,ny,nx;
 if(region==='greece'){bounds=[34,18,43,30];ny=7;nx=9;}
 else if(region==='europe'){bounds=[30,-20,65,45];ny=9;nx=11;}
 else if(region==='local'&&finite(lat)&&finite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){const a=Math.max(-80,Math.min(80,Math.round(lat/2)*2)),b=Math.round(lon/2)*2;bounds=[a-4.5,b-6,a+4.5,b+6];ny=7;nx=9;}
 else throw new Error('Invalid region');
 const [south,west,north,east]=bounds,dy=(north-south)/(ny-1),dx=(east-west)/(nx-1),points=[];
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)points.push({lat:round(south+y*dy),lon:round(west+x*dx),queryLon:round(wrap(west+x*dx))});
 return {region,bounds,nx,ny,dx,dy,points,key:region==='local'?`local:${bounds.join(',')}`:region};
}
function mapData(raw,g,now=Date.now()){
 const list=Array.isArray(raw)?raw:[raw];
 if(list.length!==g.points.length)throw new Error('Incomplete forecast grid');
 const times=list[0]?.hourly?.time;if(!Array.isArray(times)||!times.length)throw new Error('No forecast times');
 if(times.some((t,i)=>!finite(t)||(i&&t-times[i-1]!==3600)))throw new Error('Non-hourly forecast times');
 const slots=times.filter(t=>finite(t)&&t*1000>=now&&t*1000<=now+7*DAY&&t%21600===0);
 if(!slots.length)throw new Error('No future forecast');
 const index=new Map(times.map((t,i)=>[t,i]));
 const points=list.map((d,j)=>{
  const h=d?.hourly;if(!h?.time||h.time.length!==times.length||h.time.some((t,i)=>t!==times[i]))throw new Error('Mismatched grid times');
  return {...g.points[j],frames:slots.map(t=>{const i=index.get(t),win=k=>{const a=i>=5?h[k]?.slice(i-5,i+1).map(value)||[]:[];return a.length===6?a:[];};return [round(sum(win('precipitation'))),round(value(h.temperature_2m?.[i])),round(maximum(win('wind_gusts_10m'))),round(value(h.pressure_msl?.[i])),round(value(h.cloud_cover?.[i])),round(sum(win('snowfall'))),round(value(h.wind_direction_10m?.[i])),round(value(h.wind_speed_10m?.[i]))];})};
 });
 if(!points.some(p=>p.frames.some(f=>f.some(finite))))throw new Error('Empty grid');
 return {at:now,bounds:g.bounds,nx:g.nx,ny:g.ny,dx:g.dx,dy:g.dy,times:slots.map(t=>t*1000),points,fields:['rain6h','temp','gust6h','pressure','cloud','snow6h','direction','wind']};
}
function outlookData(raw,now=Date.now()){
 const w=raw?.weekly,m=raw?.monthly;
 const weekly=Array.isArray(w?.time)?w.time.map((t,i)=>({time:t*1000,end:(t+604800)*1000,temp:value(w.temperature_2m_mean?.[i]),tempAnomaly:value(w.temperature_2m_anomaly?.[i]),rain:value(w.precipitation_mean?.[i]),rainAnomaly:value(w.precipitation_anomaly?.[i]),rainEfi:value(w.precipitation_efi?.[i]),tempEfi:value(w.temperature_2m_efi?.[i])})).filter(r=>finite(r.time)&&r.end>now&&r.time<now+46*DAY&&[r.temp,r.tempAnomaly,r.rain,r.rainAnomaly].some(finite)).slice(0,6):[];
 const monthly=Array.isArray(m?.time)?m.time.map((t,i)=>{const d=new Date(t*1000);return {time:t*1000,end:Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1),tempAnomaly:value(m.temperature_2m_anomaly?.[i]),rainAnomaly:value(m.precipitation_anomaly?.[i])};}).filter(r=>finite(r.time)&&r.end>now&&[r.tempAnomaly,r.rainAnomaly].some(finite)).slice(0,3):[];
 if(!weekly.length&&!monthly.length)throw new Error('No outlook');
 return {at:now,source:'ECMWF EC46 / SEAS5 via Open-Meteo',weekly,monthly,units:{temp:'°C',tempAnomaly:'°C',rain:'mm',rainAnomaly:'mm'}};
}
function signals(input,now=Date.now()){
 const rows=(Array.isArray(input)?input:[]).filter(r=>finite(r.t)&&r.t>=now&&r.t<=now+7*DAY).sort((a,b)=>a.t-b.t),found=[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i],window=rows.slice(i,i+24),full=window.length===24&&window.every((x,j)=>x.t===r.t+j*HOUR),rain=full?sum(window.map(x=>value(x.amount))):null;
  const gust=value(r.gust),storm=value(r.pStorm),snow=value(r.pSnow);
  if(rain!==null&&rain>=20)found.push({type:'rain',time:r.t,end:r.t+24*HOUR,value:round(rain),level:rain>=40?2:1});
  if(gust!==null&&gust>=62)found.push({type:'wind',time:r.t,end:r.t+HOUR,value:round(gust),level:gust>=80?2:1});
  if(storm!==null&&storm>=0.5)found.push({type:'storm',time:r.t,end:r.t+HOUR,value:Math.round(storm*100),level:storm>=0.75?2:1});
  if(snow!==null&&snow>=0.5)found.push({type:'snow',time:r.t,end:r.t+HOUR,value:Math.round(snow*100),level:1});
 }
 const best=[];for(const type of ['rain','wind','storm','snow']){const e=found.filter(x=>x.type===type).sort((a,b)=>b.level-a.level||b.value-a.value||a.time-b.time)[0];if(e)best.push(e);}
 return {coverage:new Set(rows.filter(r=>[r.amount,r.gust,r.pStorm,r.pSnow].some(finite)).map(r=>r.t)).size,events:best.sort((a,b)=>a.time-b.time)};
}
const api={grid,mapData,outlookData,signals,value,sum,rasterLatitude};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MonoForecastCore=api;
})(typeof globalThis==='undefined'?this:globalThis);
