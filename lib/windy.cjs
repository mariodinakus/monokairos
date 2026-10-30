/* Windy Stations v2: server-rendered inline Open station observations.
 * Secrets remain server-side. Never distribute Windy raw data as an API.
 * One small catalogue fetch per user view; observations only on click.
 */
const base='https://stations.windy.com/api/v2/opendata/station';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const coord=(s,k)=>number(s?.[k]??s?.location?.[k]??s?.coords?.[k]??s?.coordinates?.[k]);
const dist=(a,b)=>{const p=Math.PI/180,x=(b.lat-a.lat)*p,y=(b.lon-a.lon)*p,z=Math.sin(x/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(y/2)**2;return 12742*Math.asin(Math.sqrt(Math.min(1,z)))};
function list(root){
 if(Array.isArray(root))return root;
 for(const x of [root?.stations,root?.items,root?.results,root?.content,root?.data,
 root?.data?.stations,root?.data?.items,root?.data?.results,root?.data?.data,root?.result?.stations]){
  if(Array.isArray(x))return x;
 }
 return [];
}
function catalogue(j,point,radius){
 return list(j).map(s=>{
  const lat=coord(s,'lat')??coord(s,'latitude')??number(Array.isArray(s.location)?s.location[1]:null);
  const lon=coord(s,'lon')??coord(s,'longitude')??number(s.lng??(Array.isArray(s.location)?s.location[0]:null));
  const id=String(s.id??s._id??s.stationId??s.station_id??'').replace(/^pws-/,'');
  if(lat===null||lon===null||!/^[a-z0-9_-]{4,48}$/i.test(id))return null;
  if(s.shareOption&&String(s.shareOption).toLowerCase()!=='open')return null;
  const d=dist(point,{lat,lon});if(d>radius)return null;
  return {id,d,name:String(s.name??s.stationName??s.title??'Windy station').slice(0,105)};
 }).filter(Boolean).sort((a,b)=>a.d-b.d).slice(0,24);
}
const time=v=>{const n=Number(v);if(Number.isFinite(n)&&n>1e9)return n>1e12?n:n*1000;
 const t=Date.parse(v);return Number.isFinite(t)?t:null;};
function latest(j){
 for(const a of [j?.data?.observations,j?.observations,j?.data?.records,j?.data?.data,j?.data,j?.items,j?.records]){
  if(Array.isArray(a)&&a.length)return a.at(-1);
  if(a&&typeof a==='object'&&!Array.isArray(a)){
   const stamps=a.ts||a.time;
   if(Array.isArray(stamps)&&stamps.length){
    const k=stamps.length-1,r={ts:stamps[k]};
    for(const [key,val] of Object.entries(a))if(Array.isArray(val))r[key]=val[k];
    return r;
   }
   if(Object.keys(a).some(k=>['temp','wind','humidity','precip','rain'].includes(k)))return a;
  }
 }
 return j||{};
}
function measurements(raw,now=Date.now()){
 const x=latest(raw),t=time(x.ts??x.timestamp??x.time??x.date??x.observedAt);
 if(t==null||t>now+300000||now-t>3*3600000)return {old:true,t,items:[]};
 const keys=[['temp','Θερμοκρασία','°C',-60,65],['humidity','Υγρασία','%',0,100],
 ['wind','Άνεμος','m/s',0,120],['gust','Ριπές','m/s',0,160],['winddir','Διεύθυνση ανέμου','°',0,360],
 ['pressure','Πίεση','Pa',80000,110000],['precip','Βροχόπτωση','mm (περίοδος Windy)',0,300],
 ['uv','UV','',0,18],['solarradiation','Ηλιακή ακτινοβολία','W/m²',0,1500]];
 const items=keys.map(([key,label,unit,min,max])=>{
  const value=number(x[key]);return value!==null&&value>=min&&value<=max?{label,unit,value,key}:null;
 }).filter(Boolean);
 return {old:false,t,items};
}
const source='<p class="wd-foot">Πηγή: <a href="https://stations.windy.com/" target="_blank" rel="noopener noreferrer">Windy Stations — Open</a>. '+
 'Οι μετρήσεις ανήκουν στον επιλεγμένο σταθμό και δεν αποτελούν πρόγνωση. '+
 '<a href="https://stations.windy.com/" target="_blank" rel="noopener noreferrer">Καταχώριση σταθμού ↗</a></p>';
const output=(res,html)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex');res.setHeader('Access-Control-Allow-Origin','null');
 res.status(200).send('<div class="wd-content">'+html+source+'</div>')};
async function upstream(url,key){
 const r=await fetch(url,{headers:{'windy-api-key':key,accept:'application/json'},signal:AbortSignal.timeout(10000)});
 return r.ok?{value:await r.json()}:{error:r.status};
}
async function handler(req,res){
 const q=req.query||{},key=process.env.WINDY_STATIONS_API_KEY,english=q.lang==='en';
 if(req.method!=='GET'||req.headers?.['sec-fetch-site']==='cross-site'){res.status(403).end();return;}
 const lat=number(q.lat),lon=number(q.lon),radius=number(q.radius)??45;
 if(lat===null||lon===null||Math.abs(lat)>85||Math.abs(lon)>180||radius<1||radius>50){res.status(400).end();return;}
 if(!key){output(res,'<p class="notice">Windy API key not configured for this deployment.</p>');return;}
 const id=String(q.id||'');
 try{
  if(id){
   if(!/^[a-z0-9_-]{4,48}$/i.test(id)){res.status(400).end();return;}
   const from=Math.floor(Date.now()/1000)-7200;
   const r=await upstream(base+'/'+encodeURIComponent(id)+'/observation?fromTs='+from,key);
   if(r.error){output(res,'<p class="notice">Windy observations not available (HTTP '+r.error+').</p>');return;}
   const obs=measurements(r.value);
   const label=obs.t?new Date(obs.t).toLocaleString(english?'en-GB':'el-GR',{timeZone:'Europe/Athens',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
   const metrics=obs.old?'<p class="notice">Δεν υπάρχουν πρόσφατα δεδομένα από αυτόν τον σταθμό.</p>':obs.items.length?
    '<div class="wd-metrics">'+obs.items.map(v=>'<div><small>'+escape(v.label)+'</small><b>'+
    escape(v.value.toLocaleString(english?'en-GB':'el-GR',{maximumFractionDigits:1}))+' '+escape(v.unit)+'</b></div>').join('')+'</div>':
    '<p class="notice">Ο σταθμός δεν διαθέτει αναγνωρίσιμες μετρήσεις.</p>';
   output(res,'<div class="wd-back"><button type="button" data-action="windyBack">← '+
   (english?'All stations':'Πίσω στους σταθμούς')+'</button><a href="https://www.windy.com/station/pws-'
   +encodeURIComponent(id)+'" target="_blank" rel="noopener noreferrer">Windy / '+escape(id)+' ↗</a></div>'+
   '<p class="wd-time">'+(english?'Last observation: ':'Τελευταία μέτρηση: ')+escape(label)+'</p>'+metrics);
   return;
  }
  // Exactly one localized catalogue request. Never page through the global catalogue.
  const dx=radius/111,dy=radius/(111*Math.max(.2,Math.cos(lat*Math.PI/180)));
  const qs='?lat='+lat+'&lon='+lon+'&radius='+Math.round(radius*1000)+
   '&bbox='+[lon-dy,lat-dx,lon+dy,lat+dx].map(x=>x.toFixed(4)).join('%2C')+'&limit=100';
  const r=await upstream(base+qs,key);
  if(r.error){output(res,'<p class="notice">Windy catalogue HTTP '+r.error+
   '. <a href="https://stations.windy.com/api-reference" target="_blank" rel="noopener noreferrer">API Reference</a></p>');return;}
  const stations=catalogue(r.value,{lat,lon},radius);
  output(res,stations.length?'<div class="wd-list">'+stations.map(x=>
   '<div class="wd-station"><div><b>'+escape(x.name)+'</b><small>'+x.d.toFixed(1)+
   ' km · Windy Open</small></div><button type="button" data-action="windySelect" data-id="'+escape(x.id)+'">'+
   (english?'Measurements':'Μετρήσεις')+'</button></div>').join('')+'</div>':
   '<p class="notice">'+(english?'No nearby Open stations in this limited API response. Other Windy stations may exist.':
   'Δεν βρέθηκαν κοντινοί σταθμοί Open στην περιορισμένη απόκριση του API. Μπορεί να υπάρχουν περισσότεροι στο Windy.')+'</p>');
 }catch(e){output(res,'<p class="notice">Το Windy δεν ανταποκρίνεται αυτή τη στιγμή. Δοκίμασε ξανά.</p>');}
}
module.exports=handler;
module.exports.test={catalogue,measurements,latest};
