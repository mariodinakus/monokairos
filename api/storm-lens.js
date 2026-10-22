/* Regional precipitation-footprint forecast grid: Open-Meteo best_match.
   Gridded precipitation area is NOT tropical-cyclone wind radius. */
'use strict';
const R=6371.0088;
function wrap(n){return ((n+180)%360+360)%360-180;}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function err(res,status,message){return res.status(status).json({error:message});}
module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=900, stale-while-revalidate=1800');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return err(res,405,'Method not allowed');}
  const lat=Number(req.query?.lat),lon=Number(req.query?.lon),radius=Number(req.query?.radius||600);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(radius)||Math.abs(lat)>76||Math.abs(lon)>180||radius<250||radius>1100)
    return err(res,400,'Use valid lat, lon and radius 250–1100 km (|lat| ≤ 76°).');
  const N=7,steps=3,stepLat=(radius/steps)/111.195,stepLon=stepLat/Math.cos(lat*Math.PI/180);
  if(stepLon>55)return err(res,400,'Sampling longitude span too large.');
  const pts=[];
  for(let y=-steps;y<=steps;y++)for(let x=-steps;x<=steps;x++){
    const la=clamp(lat+y*stepLat,-85,85),lo=wrap(lon+x*stepLon);
    pts.push({lat:+la.toFixed(4),lon:+lo.toFixed(4),row:y+steps,col:x+steps});
  }
  const u=new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude',pts.map(p=>p.lat).join(','));
  u.searchParams.set('longitude',pts.map(p=>p.lon).join(','));
  u.searchParams.set('hourly','precipitation');
  u.searchParams.set('past_hours','8');
  u.searchParams.set('forecast_hours','57');
  u.searchParams.set('timeformat','unixtime');
  u.searchParams.set('timezone','UTC');
  u.searchParams.set('cell_selection','nearest');
  let json;
  try{
    const r=await fetch(u.toString(),{signal:AbortSignal.timeout(19000),headers:{Accept:'application/json'}});
    if(!r.ok)throw Error('Open-Meteo HTTP '+r.status);
    const raw=await r.text();if(raw.length>1200000)throw Error('Unexpected oversized forecast');
    json=JSON.parse(raw);
  }catch(e){return err(res,502,'Weather forecast unavailable: '+String(e.message||e).slice(0,90));}
  const stations=Array.isArray(json)?json:[json];
  if(stations.length!==pts.length)return err(res,502,'Incomplete forecast grid.');
  const times=stations[0]?.hourly?.time||[];
  const now=Math.floor(Date.now()/3600e3)*3600;
  const horizon=[0,6,12,24,36,48];
  if(times.length<50||!times.every(t=>Number.isFinite(t)))
    return err(res,502,'Forecast timing unavailable.');
  const snapshots=[];
  for(const offset of horizon){
    const target=now+offset*3600;
    let index=times.indexOf(target);
    if(index<5){ // Need a complete, contiguous six-hour sum.
      snapshots.push({hours:offset,time:target*1000,precip:null});continue;
    }
    const precip=[];
    for(let i=0;i<pts.length;i++){
      const h=stations[i]?.hourly,p=h?.precipitation;
      if(!h||!Array.isArray(p)||!Array.isArray(h.time)||h.time.length!==times.length||
         h.time[index]!==target||p.length<=index){precip.push(null);continue;}
      let sum=0,ok=true;
      for(let j=index-5;j<=index;j++){const z=p[j];if(typeof z!=='number'||!Number.isFinite(z)||z<0){ok=false;break;}sum+=z;}
      precip.push(ok?+sum.toFixed(2):null);
    }
    snapshots.push({hours:offset,time:target*1000,precip});
  }
  if(!snapshots.some(s=>s.precip&&s.precip.filter(Number.isFinite).length>=35))
    return err(res,502,'Insufficient forecast cells.');
  const cellAreas=pts.map(p=>{
    const y0=clamp(p.lat-stepLat/2,-90,90)*Math.PI/180;
    const y1=clamp(p.lat+stepLat/2,-90,90)*Math.PI/180;
    return Math.round(R*R*(stepLon*Math.PI/180)*(Math.sin(y1)-Math.sin(y0)));
  });
  return res.status(200).json({
    source:{provider:'Open-Meteo',model:'best_match',url:'https://open-meteo.com/en/docs',basis:'hourly precipitation forecasts, 6h rolling totals'},
    checkedAt:new Date().toISOString(),center:{lat,lon},radiusKm:radius,step:{lat:stepLat,lon:stepLon},
    rows:N,columns:N,points:pts.map((p,i)=>({...p,cellKm2:cellAreas[i]})),
    horizons:snapshots,metric:'precipitation_mm_per_6h',qualification:'coarse modeled rain-band footprint; not observed cyclone wind diameter; not a warning'
  });
};