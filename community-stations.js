(function(root){
'use strict';
const finite=Number.isFinite;
const km=(a,b)=>{const r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;
 const h=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(h)));};
function radius(point){return point?.cc==='GR'&&Math.abs(point.lat-40.6401)<0.45&&Math.abs(point.lon-22.9444)<0.5?30:12;}
function parse(boxes,point,now=Date.now()){
 if(!Array.isArray(boxes)||!finite(point?.lat)||!finite(point?.lon))return [];
 return boxes.map(b=>{
  const [lon,lat]=b?.currentLocation?.coordinates||[];
  if(!finite(lat)||!finite(lon)||b.exposure==='indoor'||b.exposure==='mobile')return null;
  let temp=null,rh=null,t=null;
  for(const s of b.sensors||[]){
   const m=s.lastMeasurement,ts=Date.parse(m?.createdAt),raw=m?.value;
   if(raw===null||raw===undefined||String(raw).trim()===''||!finite(ts)||ts>now+300000||now-ts>2*3600000)continue;
   const v=Number(raw),title=String(s.title||'').toLowerCase();if(!finite(v))continue;
   if((/temperatur|temperature|θερμοκρασ/.test(title))&&/°?c/i.test(s.unit||'')&&v>=-60&&v<=65){temp=v;t=ts;}
   else if(/humidity|luftfeucht|υγρασ/.test(title)&&s.unit==='%'&&v>=0&&v<=100)rh=v;
  }
  if(!finite(temp)||!t)return null;
  const dist=km(point,{lat,lon});if(dist>radius(point))return null;
  return {id:/^[0-9a-f]{24}$/i.test(b._id||'')?b._id:null,name:String(b.name||'openSenseMap').slice(0,120),
   lat,lon,dist:Math.round(dist*10)/10,temp,rh,t};
 }).filter(Boolean).sort((a,b)=>a.dist-b.dist).slice(0,80);
}

function parseRain(boxes,point,now=Date.now()){
 if(!Array.isArray(boxes)||!Number.isFinite(point?.lat)||!Number.isFinite(point?.lon))return [];
 const out=[];
 for(const box of boxes){
  const [lon,lat]=box?.currentLocation?.coordinates||[];
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||box.exposure==='indoor'||box.exposure==='mobile')continue;
  const dist=km(point,{lat,lon});if(dist>radius(point))continue;
  for(const sensor of box.sensors||[]){
   const title=String(sensor.title||'').toLowerCase();
   if(!/rain|precip|niederschlag|regen|βροχ|υετ/.test(title))continue;
   const unit=String(sensor.unit||'').toLowerCase().replace(/\s+/g,'');
   const rate=/mm\/h|mm\/hr|mmh-1|l\/m(?:²|2)\/h/.test(unit);
   const volume=/^mm$|^l\/m(?:²|2)$|^mm\/(?:24h|day)$/.test(unit);
   if(!rate&&!volume)continue;
   const m=sensor.lastMeasurement,t=Date.parse(m?.createdAt),v=Number(m?.value);
   if(m?.value==null||String(m.value).trim()===''||!Number.isFinite(t)||t>now+300000||now-t>90*60000||
      !Number.isFinite(v)||v<0||v>(rate?300:500))continue;
   const period=rate?'rate':/24\s*h|24\s*hour|24\s*stund/.test(title+' '+unit)?'24h':
     /today|heute|tages|daily|ημερ|σήμερα/.test(title)?'today':
     /month|monat|μήν/.test(title)?'month':/hour|stund|ωρια/.test(title)?'hour':'unknown';
   out.push({id:String(box._id||''),name:String(box.name||'openSenseMap').slice(0,120),
     title:String(sensor.title||'').slice(0,90),lat,lon,dist:Math.round(dist*10)/10,
     value:v,unit:rate?'mm/h':'mm',period,t});
  }
 }
 return out.sort((a,b)=>a.dist-b.dist||b.t-a.t).slice(0,40);
}

root.MONOCommunityStations={parse,parseRain,radius};
if(typeof module!=='undefined'&&module.exports)module.exports={parse,parseRain,radius};
})(typeof window!=='undefined'?window:globalThis);
