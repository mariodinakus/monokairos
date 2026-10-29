(function(root){
'use strict';
const finite=Number.isFinite;
const km=(a,b)=>{const r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;
 const h=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(h)));};
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
  const dist=km(point,{lat,lon});if(dist>12)return null;
  return {id:/^[0-9a-f]{24}$/i.test(b._id||'')?b._id:null,name:String(b.name||'openSenseMap').slice(0,120),
   lat,lon,dist:Math.round(dist*10)/10,temp,rh,t};
 }).filter(Boolean).sort((a,b)=>a.dist-b.dist).slice(0,40);
}
root.MONOCommunityStations={parse};
if(typeof module!=='undefined'&&module.exports)module.exports={parse};
})(typeof window!=='undefined'?window:globalThis);
