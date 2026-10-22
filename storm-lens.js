(function (root) {
'use strict';
/* Storm Lens: sampled Open-Meteo precipitation band, NOT a cyclone boundary. */
const R=6371.0088;
const S={center:null,name:'',radius:600,manualRadius:300,threshold:5,hours:12,mode:'forecast',
  armed:false,loading:false,playing:false,error:'',data:null,token:0};
let playTimer=null;
const horizons=[0,6,12,24,36,48];
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function wrap(v){return ((v+180)%360+360)%360-180;}
function valid(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=76&&Math.abs(lon)<=180;}
function distance(a,b){
  const φ1=a.lat*Math.PI/180,φ2=b.lat*Math.PI/180,dφ=φ2-φ1;
  const dλ=(wrap(b.lon-a.lon))*Math.PI/180;
  const x=Math.sin(dφ/2)**2+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));
}
function centerOf(parts,data){
  let lat=0,sin=0,cos=0,w=0,area=0,max=0;
  for(const idx of parts){
    const pt=data.points[idx],a=pt.cellKm2||0;
    lat+=pt.lat*a;sin+=Math.sin(pt.lon*Math.PI/180)*a;
    cos+=Math.cos(pt.lon*Math.PI/180)*a;w+=a;area+=a;
  }
  for(const idx of parts)max=Math.max(max,data._values[idx]||0);
  return {lat:w?lat/w:0,lon:wrap(Math.atan2(sin,cos)*180/Math.PI),areaKm2:Math.round(area),maxMm6h:+max.toFixed(1),count:parts.length,indices:parts};
}
function clusters(data,snapshot,threshold){
  if(!snapshot||!Array.isArray(snapshot.precip))return [];
  data._values=snapshot.precip;
  const active=snapshot.precip.map(v=>Number.isFinite(v)&&v>=threshold);
  const seen=new Set(),out=[];
  for(let i=0;i<active.length;i++){
    if(!active[i]||seen.has(i))continue;
    const queue=[i],component=[];seen.add(i);
    for(let n=0;n<queue.length;n++){
      const idx=queue[n];component.push(idx);
      const row=Math.floor(idx/data.columns),col=idx%data.columns;
      for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const r=row+dr,c=col+dc,ni=r*data.columns+c;
        if(r<0||c<0||r>=data.rows||c>=data.columns||!active[ni]||seen.has(ni))continue;
        seen.add(ni);queue.push(ni);
      }
    }
    out.push(centerOf(component,data));
  }
  return out.sort((a,b)=>b.areaKm2-a.areaKm2);
}
function forecastTrack(){
  const data=S.data;if(!data||!S.center)return [];
  const sequence=[];let prev=S.center,had=false;
  for(const step of horizons){
    const snap=data.horizons.find(s=>s.hours===step);
    const groups=clusters(data,snap,S.threshold);
    if(!groups.length){sequence.push({hours:step,blob:null,time:snap?.time||null});continue;}
    const closest=groups.map(g=>({g,d:distance(prev,g)})).sort((a,b)=>a.d-b.d)[0];
    const max=had?Math.max(360,(step-sequence.filter(x=>x.blob).at(-1)?.hours)*85):S.radius*1.22;
    if(closest.d>max){sequence.push({hours:step,blob:null,time:snap?.time||null});continue;}
    sequence.push({hours:step,blob:closest.g,time:snap?.time||null});
    prev=closest.g;had=true;
  }
  return sequence;
}
function current(){
  const item=forecastTrack().find(x=>x.hours===S.hours);
  return item?.blob||null;
}
function circle(lat,lon,radius){
  const pts=[],angular=radius/R,φ=lat*Math.PI/180,λ=lon*Math.PI/180;
  for(let k=0;k<=72;k++){
    const b=k*2*Math.PI/72;
    const φ2=Math.asin(Math.sin(φ)*Math.cos(angular)+Math.cos(φ)*Math.sin(angular)*Math.cos(b));
    const λ2=λ+Math.atan2(Math.sin(b)*Math.sin(angular)*Math.cos(φ),Math.cos(angular)-Math.sin(φ)*Math.sin(φ2));
    pts.push([wrap(λ2*180/Math.PI),φ2*180/Math.PI]);
  }
  return {type:'Polygon',coordinates:[pts]};
}
function radiusArea(km){return Math.round(2*Math.PI*R*R*(1-Math.cos(km/R)));}
function polygons(){
  if(!S.center)return [];
  if(S.mode==='radius')return [{id:'storm-manual-radius',geometry:circle(S.center.lat,S.center.lon,S.manualRadius),
    factor:'lens',color:'rgba(74,178,235,.17)',outline:'#69d1f5',label:'USER-DEFINED radius '+S.manualRadius+' km — NOT a measured cyclone boundary'}];
  const blob=current();if(!blob||!S.data)return [];
  const data=S.data,step=data.step;return blob.indices.map(i=>{
    const p=data.points[i],v=data.horizons.find(x=>x.hours===S.hours)?.precip[i]||0;
    const lat0=p.lat-step.lat/2,lat1=p.lat+step.lat/2;
    const lon0=p.lon-step.lon/2,lon1=p.lon+step.lon/2;
    return {id:'lens-'+i,geometry:{type:'Polygon',coordinates:[[[lon0,lat0],[lon1,lat0],[lon1,lat1],[lon0,lat1],[lon0,lat0]]]},
      factor:'lens',color:v>=20?'rgba(199,54,74,.62)':v>=10?'rgba(244,134,49,.52)':'rgba(235,183,70,.46)',
      outline:'#f2c36b',label:'Open-Meteo forecast ≥'+S.threshold+' mm / 6h · '+v.toFixed(1)+' mm / 6h. Approximate cell; not a cyclone wind radius.'};
  });
}
function arcs(){
  if(S.mode!=='forecast'||!S.data)return [];
  const series=forecastTrack().filter(x=>x.blob),a=[];
  for(let i=1;i<series.length;i++){
    const x=series[i-1],y=series[i];
    if(y.hours-x.hours>18)continue;
    a.push({startLat:x.blob.lat,startLng:x.blob.lon,endLat:y.blob.lat,endLng:y.blob.lon,
      color:'#ffce7e',name:'Open-Meteo estimated movement of contiguous precipitation zone +'+x.hours+'h → +'+y.hours+'h, NOT a cyclone-center forecast.'});
  }
  return a;
}
function marks(){
  if(!S.center)return [];
  const out=[{kind:'lens-center',id:'storm-lens-center',lat:S.center.lat,lon:S.center.lon,symbol:'⌖',text:'Selected analysis center'}];
  if(S.mode==='forecast'&&S.data){
    const track=forecastTrack();
    for(const step of track)if(step.blob)out.push({kind:'lens-forecast',id:'lens-'+step.hours,lat:step.blob.lat,lon:step.blob.lon,
      symbol:'+'+step.hours+'h',text:'Modeled rain-band centroid +'+step.hours+'h'});
  }
  return out;
}
function update(){if(typeof root.MONOStormLens.onRefresh==='function')root.MONOStormLens.onRefresh();}
async function fetchForecast(force=false){
  if(!S.center)return;
  const token=++S.token;
  S.loading=true;S.error='';if(force)S.data=null;update();
  try{
    const url='/api/storm-lens?lat='+S.center.lat.toFixed(3)+'&lon='+S.center.lon.toFixed(3)+'&radius='+S.radius;
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),28000);
    let res;try{res=await fetch(url,{signal:ctl.signal,cache:'no-store'});}finally{clearTimeout(timer);}
    const json=await res.json();
    if(!res.ok)throw Error(json?.error||'HTTP '+res.status);
    if(!Array.isArray(json.points)||json.points.length!==49||!Array.isArray(json.horizons)||
       !Array.isArray(json.horizons[0]?.precip)||json.horizons[0].precip.length!==49)
      throw Error('Incomplete forecast grid');
    if(token!==S.token)return;
    S.data=json;
  }catch(e){if(token===S.token){S.data=null;S.error=String(e.message||e).slice(0,140);}}
  finally{if(token===S.token){S.loading=false;update();}}
}
function pause(){if(playTimer){clearInterval(playTimer);playTimer=null;}S.playing=false;update();}
function play(){
  if(S.playing){pause();return;}
  if(!S.center||!S.data||S.mode!=='forecast')return;
  S.playing=true;
  playTimer=setInterval(()=>{
    if(document.visibilityState==='hidden'){pause();return;}
    const index=horizons.indexOf(S.hours);
    S.hours=horizons[(index+1)%horizons.length];update();
  },1300);
  update();
}
function pick(lat,lon,name=''){
  if(S.playing)pause();
  if(!valid(lat,lon)){S.error='Coverage requires |latitude| ≤ 76°';update();return false;}
  S.center={lat:+lat.toFixed(3),lon:+lon.toFixed(3)};S.name=String(name||'').slice(0,85);S.mode='forecast';S.armed=false;S.data=null;
  if(typeof root.MONOStormLens.onPick==='function')root.MONOStormLens.onPick(lat,lon);
  fetchForecast(true);
  return true;
}
function togglePick(){S.armed=!S.armed;update();}
function setMode(m){if(m==='forecast'||m==='radius'){if(S.playing)pause();S.mode=m;update();}}
function setHours(h){const n=Number(h);if(horizons.includes(n)){if(S.playing)pause();S.hours=n;update();}}
function setThreshold(v){const n=Number(v);if([1,3,5,10,20].includes(n)){S.threshold=n;update();}}
function setManualRadius(v){const n=Number(v);if(Number.isFinite(n)&&n>=100&&n<=1200){S.manualRadius=n;update();}}
function setRadius(v){const n=Number(v);if([300,450,600,800,1000].includes(n)){S.radius=n;S.data=null;if(S.center)fetchForecast(true);else update();}}
function panel(l){
  const en=l==='en',q=S.center,blob=current();
  const mode=(k,a,b)=>'<button type="button" data-action="lensMode" data-v="'+k+'" class="lens-switch '+(S.mode===k?'active':'')+'">'+(en?b:a)+'</button>';
  const option=(items,action,sel)=>items.map(([v,el,eng])=>'<button type="button" data-action="'+action+'" data-v="'+v+'" class="lens-option '+(String(sel)===String(v)?'active':'')+'">'+(en?eng:el)+'</button>').join('');
  const centre=q?(S.name?esc(S.name)+' · ':'')+q.lat.toFixed(2)+'°, '+q.lon.toFixed(2)+'°':(en?'No center selected':'Δεν έχει επιλεγεί κέντρο');
  const note=S.mode==='radius'?
    (en?'User-defined geometric radius. Area is mathematical, NOT an observed cyclone extent.':'Γεωμετρική ακτίνα που ορίζεις εσύ. Η έκταση ΔΕΝ είναι παρατηρημένη έκταση κυκλώνα.'):
    (en?'Coarse 7×7 Open-Meteo grid. Area measures one connected 6-hour rain zone, not the whole cyclone or a guaranteed storm track.':'Αραιό πλέγμα 7×7 Open-Meteo. Η έκταση αφορά μία συνεκτική ζώνη βροχής 6ώρου, όχι ολόκληρο κυκλώνα ή βέβαιη τροχιά.');
  const area=S.mode==='radius'?(q?radiusArea(S.manualRadius):null):(blob?blob.areaKm2:null);
  return '<section class="lens-wrap"><div class="lens-title"><div><span class="earth-kicker">MONO / STORM LENS</span><h3>'+(en?'Measure storm footprint & forecast motion':'Έκταση κακοκαιρίας & προβλεπόμενη πορεία')+'</h3></div><button class="lens-pick '+(S.armed?'active':'')+'" type="button" data-action="lensPick" aria-pressed="'+S.armed+'">'+(S.armed?(en?'Tap the globe…':'Πάτησε στην υδρόγειο…'):(en?'⌖ Select on globe':'⌖ Επιλογή στον χάρτη'))+'</button></div>'+
    '<div class="lens-place">'+centre+'</div>'+
    '<div class="lens-switches">'+mode('forecast','Μοντέλο υετού · 48 ώρες','Rain model · 48h')+mode('radius','Ακτίνα / εμβαδόν','Radius / area')+'</div>'+
    (S.mode==='forecast'?
      '<div class="lens-play-row"><button type="button" data-action="lensPlay" class="lens-play" '+(!S.data||S.loading?'disabled':'')+'>'+(S.playing?(en?'Ⅱ Pause':'Ⅱ Παύση'):(en?'▶ Animate the next 48h':'▶ Κίνηση πρόγνωσης 48ώρου'))+'</button></div>'+ 
      '<div class="lens-label">'+(en?'Forecast hour':'Προγνωστική ώρα')+'</div><div class="lens-options">'+option(horizons.map(x=>[x,'+'+x+'ω','+'+x+'h']),'lensHours',S.hours)+'</div>'+
      '<div class="lens-label">'+(en?'Rain threshold (mm / 6h)':'Όριο βροχής (mm / 6ωρο)')+'</div><div class="lens-options">'+option([1,3,5,10,20].map(x=>[x,x+' mm',x+' mm']),'lensThreshold',S.threshold)+'</div>'+
      '<div class="lens-label">'+(en?'Sampled radius':'Ακτίνα δειγματοληψίας')+'</div><div class="lens-options">'+option([300,450,600,800,1000].map(x=>[x,x+' km',x+' km']),'lensSampling',S.radius)+'</div>'
      :'<label class="lens-label" for="lensRadius">'+(en?'Defined radius':'Ακτίνα μέτρησης')+': <strong>'+S.manualRadius+' km</strong></label><input id="lensRadius" type="range" min="100" max="1200" step="50" value="'+S.manualRadius+'">')+
    '<div class="lens-stats"><div><small>'+(en?'Estimated area':'Εκτιμώμενη έκταση')+'</small><strong>'+(area===null?'—':area.toLocaleString(en?'en-GB':'el-GR')+' km²')+'</strong></div>'+
    '<div><small>'+(S.mode==='radius'?(en?'Diameter':'Διάμετρος'):(en?'Max sampled rain / 6h':'Μέγιστος υετός / 6ωρο'))+'</small><strong>'+(S.mode==='radius'?(q?2*S.manualRadius+' km':'—'):(blob?blob.maxMm6h.toFixed(1)+' mm':'—'))+'</strong></div></div>'+
    (S.loading?'<p class="lens-working">'+(en?'Loading forecast grid…':'Φόρτωση προγνωστικού πλέγματος…')+'</p>':'')+
    (S.error?'<p class="lens-error">'+esc(S.error)+'</p>':'')+
    (q&&S.mode==='forecast'&&S.data&&!blob?'<p class="lens-working">'+(en?'No connected rain area exceeds this threshold at selected time.':'Δεν εντοπίζεται συνεκτική ζώνη πάνω από το όριο την επιλεγμένη ώρα.')+'</p>':'')+
    '<p class="lens-note">'+note+'</p>'+
    '<div class="lens-footer"><span>Open-Meteo · best_match'+(S.data?.checkedAt?' · '+new Date(S.data.checkedAt).toLocaleTimeString(en?'en-GB':'el-GR',{hour:'2-digit',minute:'2-digit'}):'')+'</span>'+
    '<button type="button" data-action="lensReload" '+(!q||S.loading?'disabled':'')+'>'+(en?'Refresh ↻':'Ανανέωση ↻')+'</button></div></section>';
}
root.MONOStormLens={state:S,pick,togglePick,setMode,setHours,setThreshold,setRadius,setManualRadius,
  polygons,arcs,marks,panel,current,forecastTrack,radiusArea,clusters,distance,play,pause,onPick:null,onRefresh:null,load:fetchForecast};
})(window);