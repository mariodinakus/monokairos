'use strict';
/* MONO Space Control — CelesTrak GP/OMM, satellite.js SGP4. No API keys.
 * GEOLOGICAL NOTE: ground tracks are modelled positions, not ground observations.
 * Fair-use: 3 bounded public GP catalog fetches, cached 2h in process and 10m at CDN.
 */
const sat=require('satellite.js');
const SOURCES=[
  ['stations','https://celestrak.org/NORAD/elements/gp.php?GROUP=STATIONS&FORMAT=JSON'],
  ['weather','https://celestrak.org/NORAD/elements/gp.php?GROUP=WEATHER&FORMAT=JSON'],
  ['starlink','https://celestrak.org/NORAD/elements/gp.php?INTDES=2019-074&FORMAT=JSON']
];
const H=3600000, fin=Number.isFinite;
const cache=new Map();
const deg=x=>x*180/Math.PI;
const round=(x,n=2)=>+x.toFixed(n);
function coords(req){
 const p=new URL(req.url,'https://mono.local').searchParams;
 const lat=Number(p.get('lat')),lon=Number(p.get('lon'));
 if(!p.has('lat')||!p.has('lon')||!fin(lat)||!fin(lon)||Math.abs(lat)>85||Math.abs(lon)>180)return null;
 return {lat,lon};
}
async function catalog(kind,url,fetcher=fetch,now=Date.now()){
 const c=cache.get(kind);
 if(c&&now-c.at<2*H)return c.data;
 try{
  const r=await fetcher(url,{signal:AbortSignal.timeout(11500),headers:{'User-Agent':'MONO Weather / orbit visualization (monokairos.vercel.app)','Accept':'application/json'}});
  if(!r.ok)throw Error('catalog '+r.status);
  const list=await r.json();
  if(!Array.isArray(list))throw Error('invalid OMM response');
  const data=list.filter(x=>x&&typeof x.OBJECT_NAME==='string'&&fin(+x.MEAN_MOTION)&&fin(Date.parse(x.EPOCH))&&fin(+x.NORAD_CAT_ID));
  cache.set(kind,{at:now,data});
  return data;
 }catch(e){return c?.data||[];}
}
function pick(catalogs,now){
 const chosen=[],ids=new Set();
 const add=(v,type)=>{
  if(!v||ids.has(String(v.NORAD_CAT_ID)))return;
  const epoch=Date.parse(v.EPOCH);
  if(!fin(epoch)||epoch>now+H||now-epoch>5*24*H||+v.MEAN_MOTION<9||+v.MEAN_MOTION>18)return;
  try{const rec=sat.json2satrec(v);if(rec.error)return;chosen.push({rec,omm:v,type});ids.add(String(v.NORAD_CAT_ID));}catch{}
 };
 add(catalogs.stations?.find(x=>+x.NORAD_CAT_ID===25544),'ISS');
 for(const s of (catalogs.stations||[]).filter(x=>+x.NORAD_CAT_ID!==25544).slice(0,2))add(s,'station');
 for(const s of (catalogs.weather||[]).filter(x=>/NOAA|METOP|SUOMI|JPSS|FENGYUN/i.test(x.OBJECT_NAME)).slice(0,12)){
  if(chosen.filter(x=>x.type==='weather').length>=2)break;
  add(s,'weather');
 }
 for(const s of (catalogs.starlink||[]).filter(x=>/^STARLINK-/i.test(x.OBJECT_NAME)).slice(0,30)){
  if(chosen.filter(x=>x.type==='starlink').length>=3)break;
  add(s,'starlink');
 }
 return chosen.slice(0,8);
}
function position(rec,t){
 try{
  const pv=sat.propagate(rec,new Date(t));
  if(!pv||!pv.position||!fin(pv.position.x))return null;
  const gmst=sat.gstime(new Date(t)),geo=sat.eciToGeodetic(pv.position,gmst);
  const lat=deg(geo.latitude),lon=deg(geo.longitude),alt=geo.height;
  if(![lat,lon,alt].every(fin)||alt<120||alt>5000)return null;
  return {t,lat:round(lat),lon:round(lon),alt:round(alt,1),eci:pv.position,gmst};
 }catch{return null;}
}
function passes(rec,where,now){
 const observer={latitude:where.lat*Math.PI/180,longitude:where.lon*Math.PI/180,height:0};
 const result=[];let active=null;
 // Geometric horizon > 15deg; no claim of visibility, sunlight or weather.
 for(let t=now;t<=now+24*H;t+=2*60000){
  const p=position(rec,t);
  let elevation=-90;
  if(p){
   const look=sat.ecfToLookAngles(observer,sat.eciToEcf(p.eci,p.gmst));
   elevation=deg(look.elevation);
  }
  if(elevation>=15){
   if(!active)active={start:t,end:t,maxElevation:elevation,maxAt:t,ongoing:t===now};
   else{active.end=t;if(elevation>active.maxElevation){active.maxElevation=elevation;active.maxAt=t;}}
  }else if(active){result.push(active);active=null;}
  if(result.length>=4)break;
 }
 if(active)result.push(active);
 return result.map(x=>({...x,maxElevation:round(x.maxElevation,0)})).slice(0,3);
}
function convert(item,where,now){
 const {rec,omm,type}=item;
 const points=[];
 for(let t=now-15*60000;t<=now+3*H;t+=3*60000){
  const p=position(rec,t);if(p)points.push({t:p.t,lat:p.lat,lon:p.lon,alt:p.alt});
 }
 const p=position(rec,now);
 if(!p||points.length<18)return null;
 return {id:String(omm.NORAD_CAT_ID),name:String(omm.OBJECT_NAME).slice(0,80),
  type,epoch:Date.parse(omm.EPOCH),at:now,alt:p.alt,
  lat:p.lat,lon:p.lon,period:round(1440/+omm.MEAN_MOTION,1),
  track:points,passes:passes(rec,where,now)};
}
async function build(where,now=Date.now(),fetcher=fetch){
 const pairs=await Promise.all(SOURCES.map(async([kind,url])=>[kind,await catalog(kind,url,fetcher,now)]));
 const c=Object.fromEntries(pairs),picked=pick(c,now);
 const satellites=picked.map(p=>convert(p,where,now)).filter(Boolean);
 return {source:'CelesTrak GP/OMM · SGP4 satellite.js',at:now,
  type:'modelled-orbit',forecastHours:3,passHorizonHours:24,
  city:{lat:where.lat,lon:where.lon},satellites,
  coverage:{stations:c.stations.length,weather:c.weather.length,starlinkSample:c.starlink.length},
  note:'Trajectories computed from orbital elements; visibility requires satellite illumination, dark skies and clear weather. Starlink list shows a selected sample, not the complete constellation.'};
}
module.exports=async(req,res)=>{
 const where=coords(req);
 if(!where){res.setHeader('Cache-Control','no-store');return res.status(400).json({error:'invalid_coordinates'});}
 try{
  const result=await build(where);
  res.setHeader('Cache-Control',result.satellites.length?'public,s-maxage=600,stale-while-revalidate=1200':'no-store');
  return res.status(200).json(result);
 }catch{return res.status(503).json({error:'orbits_unavailable',satellites:[]});}
};
module.exports.build=build;
module.exports.coords=coords;
module.exports.pick=pick;
module.exports.position=position;
module.exports.passes=passes;
