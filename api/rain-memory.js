/* Shared, privacy-preserving meteorological calibration for curated cities.
 * Server only: Vercel Blob stores public scientific statistics, no visitor records.
 * Reference truth is ERA5 reanalysis, NOT rainfall-gauge or satellite observation. */
'use strict';
const {guard,coordinates}=require('../lib/server.cjs');
const CITIES=[
 ['thessaloniki',40.6401,22.9444],['athens',37.9838,23.7275],['patras',38.2466,21.7346],
 ['heraklion',35.3387,25.1442],['larisa',39.639,22.4191],['volos',39.3667,22.9458],
 ['ioannina',39.665,20.8537],['chania',35.5138,24.018],['kavala',40.936,24.4129],
 ['rhodes',36.434,28.2176],['alexandroupoli',40.8457,25.8739],['corfu',39.6243,19.9217]
];
const fin=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function km(lat,lon,a,b){const R=Math.PI/180,dlat=(a-lat)*R,dlon=(b-lon)*R,h=Math.sin(dlat/2)**2+Math.cos(lat*R)*Math.cos(a*R)*Math.sin(dlon/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(h)));}
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const round=(v,d=3)=>fin(v)?+v.toFixed(d):null;
async function request(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{'User-Agent':'MONO Weather rain calibration'}});
 if(!r.ok)throw Error('Weather data unavailable');
 const d=await r.json();if(!Array.isArray(d?.hourly?.time))throw Error('Missing hourly data');
 return d.hourly;
}
async function compute(city){
 const [id,lat,lon]=city,end=new Date(Date.now()-10*86400e3),start=new Date(end.getTime()-34*86400e3);
 const iso=t=>t.toISOString().slice(0,10);
 const common={latitude:String(lat),longitude:String(lon),timezone:'UTC',timeformat:'unixtime',start_date:iso(start),end_date:iso(end)};
 const u=(host,params)=>host+'?'+new URLSearchParams({...common,...params});
 const [truth,e,g]=await Promise.all([
  request(u('https://archive-api.open-meteo.com/v1/archive',{models:'era5',hourly:'precipitation,cloud_cover'})),
  request(u('https://previous-runs-api.open-meteo.com/v1/forecast',{models:'ecmwf_ifs025',hourly:'precipitation_previous_day1,cloud_cover_previous_day1'})),
  request(u('https://previous-runs-api.open-meteo.com/v1/forecast',{models:'gfs_global',hourly:'precipitation_previous_day1,cloud_cover_previous_day1'}))
 ]);
 const byTime=h=>new Map(h.time.map((t,i)=>[t,i])), E=byTime(e),G=byTime(g);
 const rows=[];
 for(let i=0;i<truth.time.length;i++){
  const j=E.get(truth.time[i]),k=G.get(truth.time[i]);if(j==null||k==null)continue;
  const yR=truth.precipitation?.[i],yC=truth.cloud_cover?.[i];
  const er=e.precipitation_previous_day1?.[j],gr=g.precipitation_previous_day1?.[k],ec=e.cloud_cover_previous_day1?.[j],gc=g.cloud_cover_previous_day1?.[k];
  rows.push({yR,yC,er,gr,ec,gc});
 }
 const validR=rows.filter(r=>[r.yR,r.er,r.gr].every(fin)&&r.yR>=0&&r.er>=0&&r.gr>=0);
 const validC=rows.filter(r=>[r.yC,r.ec,r.gc].every(fin));
 if(validR.length<120&&validC.length<120)throw Error('Insufficient matching historical data');
 const error=(rows,y,p)=>rows.length?round(mean(rows.map(r=>Math.abs(r[p]-r[y]))),3):null;
 const skillR=[{id:'ecmwf',mae:error(validR,'yR','er')},{id:'gfs',mae:error(validR,'yR','gr')}];
 const skillC=[{id:'ecmwf',mae:error(validC,'yC','ec')},{id:'gfs',mae:error(validC,'yC','gc')}];
 const weight=s=>{const w=s.map(x=>fin(x.mae)?1/Math.max(x.mae,0.05):0),total=w.reduce((a,b)=>a+b,0);return total?w.map(v=>v/total):[.5,.5];};
 const wr=weight(skillR),wc=weight(skillC);
 const predRain=r=>r.er*wr[0]+r.gr*wr[1],predCloud=r=>r.ec*wc[0]+r.gc*wc[1];
 const rTruth=validR.reduce((s,r)=>s+r.yR,0),rPred=validR.reduce((s,r)=>s+predRain(r),0);
 const scale=rPred>1?clamp(rTruth/rPred,0.65,1.4):1;
 const cloudBias=validC.length?clamp(mean(validC.map(r=>r.yC-predCloud(r))),-15,15):0;
 const rMae=validR.length?mean(validR.map(r=>Math.abs(predRain(r)*scale-r.yR))):null;
 const cloudMae=validC.length?mean(validC.map(r=>Math.abs(predCloud(r)+cloudBias-r.yC))):null;
 return {version:1,city:id,at:Date.now(),period:[iso(start),iso(end)],source:'ERA5 reanalysis / Previous Runs (24h horizon)',
  rain:{n:validR.length,mae:round(rMae),scale:round(scale),ecmwf:skillR[0],gfs:skillR[1],weights:wr.map(x=>round(x))},
  cloud:{n:validC.length,mae:round(cloudMae),bias:round(cloudBias),ecmwf:skillC[0],gfs:skillC[1],weights:wc.map(x=>round(x))}};
}
module.exports=async(req,res)=>{
 if(!guard(req,res))return;
 const c=coordinates(req);
 if(!c){res.status(400).json({error:'Invalid coordinates'});return;}
 const city=CITIES.map(v=>({v,dist:km(c.lat,c.lon,v[1],v[2])})).sort((a,b)=>a.dist-b.dist)[0];
 if(!city||city.dist>25){res.setHeader('Cache-Control','s-maxage=21600');res.status(200).json({available:false,reason:'city_not_supported'});return;}
 if(!process.env.BLOB_READ_WRITE_TOKEN){res.setHeader('Cache-Control','no-store');res.status(503).json({available:false,reason:'shared_storage_not_configured'});return;}
 try{
  const {get,put}=require('@vercel/blob'),path='rain-learning/'+city.v[0]+'.json';
  let cached=null;
  try{const b=await get(path,{access:'private'});if(b?.stream)cached=await new Response(b.stream).json();}catch{}
  if(cached?.version===1&&Date.now()-cached.at<24*3600e3){
   res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=1800');
   res.status(200).json({available:true,shared:true,...cached});return;
  }
  try{
   const next=await compute(city.v);
   await put(path,JSON.stringify(next),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
   res.setHeader('Cache-Control','s-maxage=3600');
   res.status(200).json({available:true,shared:true,...next});
  }catch{
   if(cached?.version===1){res.setHeader('Cache-Control','s-maxage=300');res.status(200).json({available:true,shared:true,stale:true,...cached});}
   else{res.setHeader('Cache-Control','no-store');res.status(503).json({available:false,reason:'historical_data_unavailable'});}
  }
 }catch{res.setHeader('Cache-Control','no-store');res.status(503).json({available:false,reason:'storage_unavailable'});}
};
module.exports.compute=compute;
module.exports.CITIES=CITIES;
