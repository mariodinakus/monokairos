/* MONO SPACE CONTROL — additive Space tab panels; no changes to the app shell.
 * Orbital data are SGP4 model positions, NOT observed live telemetry.
 * Sun-Earth journey diagram is illustrative, NOT an actual CME trajectory.
 */
(function(root){
'use strict';
const fin=Number.isFinite,H=3600000;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=(n,d=0)=>fin(n)?Number(n).toLocaleString('el-GR',{maximumFractionDigits:d}):'—';
const text=(el,en,lang)=>lang==='en'?en:el;
const cols={ISS:'#f5c979',station:'#c9aaff',weather:'#52d6f0',starlink:'#9dbeff'};
let data=null,cityKey='',at=0,loading=false,seq=0,chosen='25544',simMin=15;
let globe=null,timer=null,options=null,loader=null,token=0;
function time(t,o){try{return new Date(t).toLocaleString(o.lang==='en'?'en-GB':'el-GR',{timeZone:o.zone||'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}catch{return '—';}}
function skyWindows(o){
 const A=root.Astronomy;
 if(!A||!root.MonoSky||!fin(o.lat)||!fin(o.lon))return [];
 let obs,moon;
 try{obs=new A.Observer(o.lat,o.lon,0);moon=root.MonoSky.snapshot({lat:o.lat,lon:o.lon})?.illumination??0;}catch{return [];}
 const now=Date.now(),rows=o.rows||[];
 return rows.filter(r=>fin(r.t)&&r.t>=now&&r.t<now+40*H&&fin(r.cloud)).map(r=>{
  let sunAlt;
  try{sunAlt=root.MonoSky.position('Sun',new Date(r.t),obs).altitude;}catch{return null;}
  if(!fin(sunAlt)||sunAlt>-12)return null;
  const cloud=Math.max(0,Math.min(100,r.cloud));
  const pop=fin(r.pop)?Math.max(0,Math.min(1,r.pop)):0;
  const rain=fin(r.amount)&&r.amount>0.1?12:0;
  const score=Math.max(0,Math.round(100-.78*cloud-20*pop-rain-9*moon));
  return {t:r.t,score,cloud};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.t-b.t).slice(0,7);
}
function skyCard(o){
 const X=(a,b)=>text(a,b,o.lang),win=skyWindows(o),best=win[0];
 return '<section class="section sc-panel" id="sc-sky-window">'+
 '<div class="sc-kicker">03 / SKY WINDOW</div><h2>'+X('Πότε αξίζει να κοιτάξεις τον ουρανό;','When is the sky worth watching?')+'</h2>'+
 '<p class="sc-muted">'+X('Η πρόγνωση νεφών του MONO συναντά τον Ήλιο και τη Σελήνη.','MONO cloud forecasts meet the Sun and Moon.')+'</p>'+
 '<div class="sc-window-summary"><div><small>'+X('ΚΑΛΥΤΕΡΗ ΥΠΟΨΗΦΙΑ ΩΡΑ','BEST CANDIDATE HOUR')+'</small><strong>'+(best?time(best.t,o):'—')+'</strong><span>'+X('Για την επιλεγμένη περιοχή','For the selected location')+'</span></div><div class="sc-window-score"><b>'+(best?best.score:'—')+'<small>/100</small></b><span>'+X('Δείκτης παρατήρησης','Viewing index')+'</span></div></div>'+
 (best?'<div class="sc-window-hours">'+win.slice(0,5).map(v=>'<div class="sc-hour"><span>'+time(v.t,o)+'</span><div class="sc-meter"><i style="width:'+v.score+'%"></i></div><b>'+v.score+'</b><span>☁ '+fmt(v.cloud)+'%</span></div>').join('')+'</div>':
 '<p class="sc-muted">'+X('Δεν υπάρχουν ακόμη πλήρη δεδομένα για τις νυχτερινές ώρες του επόμενου 40ώρου.','No complete night-time cloud forecast in the next 40 hours yet.')+'</p>')+
 '<p class="sc-foot">'+X('Σχετική καταλληλότητα, όχι μετρημένη πιθανότητα καθαρού ουρανού. Δεν περιλαμβάνει φωτορύπανση ή ομίχλη.','Relative suitability, not a measured probability of clear sky. Light pollution and fog are not included.')+'</p></section>';
}
function solarCard(feed,o){
 const X=(a,b)=>text(a,b,o.lang);
 const s=root.MonoSpaceWeather?.snapshot?.(feed);
 const kp=s?.kp?.fresh?s.kp.value:null,wind=s?.wind?.fresh?s.wind.value:null,bz=s?.bz?.fresh?s.bz.value:null;
 const travel=fin(wind)&&wind>=250&&wind<=1500?1500000/wind/60:null;
 const forecast=(s?.forecast||[]).slice(0,5);
 return '<section class="section sc-panel" id="sc-sun-earth"><div class="sc-kicker">01 / SOLAR JOURNEY · NOAA</div>'+
 '<h2>'+X('Από τον Ήλιο στη Γη','From Sun to Earth')+'</h2>'+
 '<p class="sc-muted">'+X('Παρακολουθούμε τον ηλιακό άνεμο και τη γεωμαγνητική δραστηριότητα με πραγματικές μετρήσεις.','Tracking the solar wind and geomagnetic activity with observed NOAA data.')+'</p>'+
 '<div class="sc-solar-art" role="img" aria-label="'+X('Σχηματική απεικόνιση ηλιακού ανέμου από τον Ήλιο προς τη Γη','Schematic solar wind journey from Sun to Earth')+'"><div class="sc-star">☀</div><div class="sc-stream"><i></i><i></i><i></i><i></i><i></i></div><div class="sc-planet">🌍</div><div class="sc-illustration">'+X('ΣΧΗΜΑ · ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΘΕΣΗ CME','ILLUSTRATION · NOT A TRACKED CME')+'</div></div>'+
 '<div class="sc-metrics"><div><small>NOAA Kp</small><b>'+fmt(kp,1)+'</b><span>'+X('Γεωμαγνητικός δείκτης','Geomagnetic index')+'</span></div><div><small>'+X('Ηλιακός άνεμος L1','Solar wind at L1')+'</small><b>'+fmt(wind)+' <em>km/s</em></b><span>'+X('Πραγματική μέτρηση','Observed measurement')+'</span></div><div><small>Bz</small><b>'+fmt(bz,1)+' <em>nT</em></b><span>'+X('Νότιο Bz ευνοεί διαταραχές','Southward Bz supports storms')+'</span></div><div><small>L1 → '+X('Γη','Earth')+'</small><b>'+(fin(travel)?'~'+fmt(travel):'—')+' <em>min</em></b><span>'+X('Ενδεικτικός χρόνος, όχι πρόγνωση άφιξης CME','Illustrative advection, not a CME ETA')+'</span></div></div>'+
 '<div class="sc-kpstrip"><span>'+X('ΠΡΟΓΝΩΣΗ NOAA Kp','NOAA Kp FORECAST')+'</span><div>'+(forecast.length?forecast.map(r=>'<span title="'+esc(time(r.time,o))+'">Kp '+fmt(r.value,1)+'</span>').join(''):'—')+'</div></div>'+
 '<p class="sc-foot">'+X('Για πραγματικές προσομοιώσεις εκτοξεύσεων μάζας (CME):','For official CME propagation forecasts:')+' <a href="https://www.swpc.noaa.gov/products/wsa-enlil-solar-wind-prediction" target="_blank" rel="noopener noreferrer">NOAA WSA-Enlil ↗</a>. '+X('Δεν επινοούνται τροχιές CME ή χρόνοι πρόσκρουσης.','No fabricated CME tracks or impact times.')+'</p></section>';
}
function pointAt(s,t){
 if(!s?.track?.length)return null;
 const ps=s.track;
 if(t<=ps[0].t)return ps[0];if(t>=ps[ps.length-1].t)return ps[ps.length-1];
 let lo=0,hi=ps.length-1;
 while(hi-lo>1){const m=(lo+hi)>>1;if(ps[m].t<t)lo=m;else hi=m;}
 const a=ps[lo],b=ps[hi],frac=(t-a.t)/(b.t-a.t);
 const delta=((b.lon-a.lon+540)%360)-180;
 return {lat:a.lat+(b.lat-a.lat)*frac,lon:((a.lon+delta*frac+540)%360)-180,alt:a.alt+(b.alt-a.alt)*frac};
}
function satDetail(s,o){
 const X=(a,b)=>text(a,b,o.lang);
 if(!s)return '<p class="sc-muted">'+X('Περιμένουμε στοιχεία CelesTrak.','Waiting for CelesTrak orbital elements.')+'</p>';
 const p=s.passes?.[0];
 return '<div class="sc-sat-title"><strong>'+esc(s.name)+'</strong><small>NORAD '+esc(s.id)+'</small></div>'+
 '<div class="sc-specs"><div><small>'+X('Ύψος','Altitude')+'</small><b>'+fmt(s.alt)+' km</b></div><div><small>'+X('Περίοδος','Period')+'</small><b>'+fmt(s.period,1)+' min</b></div></div>'+
 '<div class="sc-pass"><small>'+X('ΕΠΟΜΕΝΗ ΔΙΕΛΕΥΣΗ ΠΑΝΩ ΑΠΟ 15°','NEXT PASS ABOVE 15°')+'</small>'+
 (p?'<strong>'+time(p.start,o)+'</strong><span>'+X('Μέγιστο ύψος','Peak elevation')+' '+fmt(p.maxElevation)+'°</span>':
 '<strong>'+X('Καμία στο επόμενο 24ωρο','No pass in next 24 hours')+'</strong>')+'</div>'+
 '<p class="sc-foot">'+X('Υπολογισμός γεωμετρικής διέλευσης, όχι βεβαιωμένη οπτική θέαση. Παίζουν ρόλο ο φωτισμός του δορυφόρου και τα σύννεφα.','Geometric pass only, not guaranteed visibility; satellite illumination and clouds matter.')+'</p>';
}
function orbitInner(o){
 const X=(a,b)=>text(a,b,o.lang),sats=data?.satellites||[];
 if(sats.length&&!sats.some(s=>s.id===chosen))chosen=sats[0].id;
 const selected=sats.find(s=>s.id===chosen);
 const message=loading?X('Λήψη τροχιών…','Loading trajectories…'):X('Δεν βρέθηκαν πρόσφατα τροχιακά δεδομένα.','No recent orbital elements available.');
 return '<div class="sc-orbit-layout"><div class="sc-globe-column"><div id="sc-globe" class="sc-globe" aria-label="'+X('Διαδραστική τρισδιάστατη υδρόγειος τροχιών','Interactive 3D orbit globe')+'"><span class="sc-globe-empty">◎<small>'+message+'</small></span></div>'+
 '<div class="sc-scrub"><label for="sc-clock-range">'+X('Χρονογραμμή τροχιάς','Orbit timeline')+'</label><input type="range" id="sc-clock-range" min="0" max="180" value="'+simMin+'" step="3"><time id="sc-clock">'+(data?time(data.at+(simMin-15)*60000,o):'—')+'</time></div>'+
 '<button type="button" class="sc-inline-btn" data-sc="now">'+X('↺ Επιστροφή στο τώρα','↺ Back to now')+'</button></div>'+
 '<div class="sc-sat-column"><div class="sc-sat-list">'+(sats.length?sats.map(s=>'<button type="button" class="sc-sat '+(s.id===chosen?'active':'')+'" data-sc="sat" data-id="'+esc(s.id)+'"><i style="background:'+(cols[s.type]||'#94baf6')+'"></i><span><b>'+esc(s.name)+'</b><small>'+esc(s.type.toUpperCase())+' · '+fmt(s.alt)+' km</small></span>›</button>').join(''):'<p class="sc-muted">'+message+'</p>')+'</div><div id="sc-sat-info">'+satDetail(selected,o)+'</div></div></div>';
}
function orbitCard(o){
 const X=(a,b)=>text(a,b,o.lang);
 return '<section class="section sc-panel" id="sc-orbit-live"><div class="sc-kicker">02 / ORBIT LIVE · SGP4</div>'+
 '<h2>'+X('Δορυφόροι σε πραγματικές τροχιές','Satellites on computed orbits')+'</h2>'+
 '<p class="sc-muted">'+X('ISS, επιλεγμένοι μετεωρολογικοί και Starlink όπου υπάρχουν πρόσφατα στοιχεία. Γύρισε τη Γη ή άλλαξε τον χρόνο.','ISS, selected weather satellites and Starlink when recent orbital elements are available. Rotate the Earth or move time.')+'</p>'+
 '<div id="sc-orbit-content">'+orbitInner(o)+'</div>'+
 '<p class="sc-foot">'+X('Στοιχεία CelesTrak GP/OMM και υπολογισμοί SGP4. Δεν πρόκειται για ζωντανή τηλεμετρία ή πλήρη κατάλογο δορυφόρων.','CelesTrak GP/OMM elements and SGP4 propagation. Not live spacecraft telemetry or a complete fleet catalog.')+'</p></section>';
}
function render(feed,o={}){
 options=o;
 const X=(a,b)=>text(a,b,o.lang);
 return '<div class="sc-control" id="space-control"><div class="sc-title"><span>MONO / SPACE CONTROL</span><h2>'+X('Διάστημα σε κίνηση','Space in motion')+'</h2><p>'+X('Νέα διαδραστικά εργαλεία μέσα στην υπάρχουσα ενότητα Διάστημα.','Interactive additions inside the existing Space section.')+'</p></div>'+
 solarCard(feed,o)+orbitCard(o)+skyCard(o)+'</div>';
}
function tracks(s){
 const out=[],points=s?.track||[];
 let segment=[],last=null;
 for(const p of points){
  if(last&&Math.abs(p.lon-last.lon)>180){if(segment.length>1)out.push({points:segment,color:cols[s.type]||'#65cef5'});segment=[];}
  segment.push({lat:p.lat,lon:p.lon});last=p;
 }
 if(segment.length>1)out.push({points:segment,color:cols[s.type]||'#65cef5'});
 return out;
}
function draw(){
 if(!globe||!data||!options)return;
 const sat=(data.satellites||[]).find(s=>s.id===chosen);
 const t=data.at+(simMin-15)*60000,p=pointAt(sat,t);
 try{
  globe.pathsData(sat?tracks(sat):[]);
  globe.pointsData(p?[{...p,color:cols[sat.type]||'#f9d98f'}]:[]);
  const clock=root.document.getElementById('sc-clock');if(clock)clock.textContent=time(t,options);
 }catch{}
}
function releaseGlobe(){
 if(timer){clearInterval(timer);timer=null;}
 if(globe){try{globe._destructor?.();}catch{}try{globe.renderer?.().dispose();}catch{}globe=null;}
}
function destroy(){token++;releaseGlobe();}
async function globeMount(){
 const current=++token,el=root.document.getElementById('sc-globe');
 if(!el||!data?.satellites?.length||!loader)return;
 try{
  if(!root.Globe)await loader('https://cdn.jsdelivr.net/npm/globe.gl@2.45.3/dist/globe.gl.min.js');
  if(current!==token||!root.document.getElementById('sc-globe')||el!==root.document.getElementById('sc-globe'))return;
  globe=new root.Globe(el,{animateIn:false})
   .width(el.clientWidth).height(el.clientHeight).backgroundColor('rgba(0,0,0,0)')
   .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
   .showAtmosphere(true).atmosphereColor('#74b4ee').atmosphereAltitude(.14)
   .pointLat('lat').pointLng('lon').pointColor('color').pointRadius(.55).pointAltitude(.03)
   .pathPoints('points').pathPointLat('lat').pathPointLng('lon').pathColor('color').pathStroke(.7);
  globe.controls().autoRotate=true;globe.controls().autoRotateSpeed=.35;globe.controls().enableDamping=true;
  globe.pointOfView({lat:options.lat,lng:options.lon,altitude:2.2},0);
  draw();
 }catch{releaseGlobe();const el2=root.document.getElementById('sc-globe');if(el2)el2.textContent=options.lang==='en'?'3D viewer unavailable; orbital passes remain below.':'Η 3D προβολή δεν είναι διαθέσιμη · οι διελεύσεις φαίνονται δίπλα.';}
}
function refreshPanel(){
 if(!root.document.getElementById('sc-orbit-content')||!options)return;
 releaseGlobe();root.document.getElementById('sc-orbit-content').innerHTML=orbitInner(options);
 globeMount();
}
async function load(force=false){
 if(!options||!fin(options.lat)||!fin(options.lon))return;
 const key=options.lat.toFixed(3)+','+options.lon.toFixed(3),now=Date.now();
 if(!force&&key===cityKey&&now-at<30*60000&&data)return;
 if(loading)return;
 cityKey=key;loading=true;
 const id=++seq;refreshPanel();
 try{
  const r=await fetch('/api/space-weather?'+new URLSearchParams({mode:'orbits',lat:options.lat,lon:options.lon}),{signal:AbortSignal.timeout(21000)});
  if(!r.ok)throw Error('orbit api');
  const d=await r.json();
  if(id!==seq)return;
  if(d&&Array.isArray(d.satellites)){data=d;at=Date.now();}
 }catch{if(key!==cityKey)data=null;}
 finally{if(id===seq){loading=false;refreshPanel();}}
}
function mount(loadScript,o={}){
 loader=loadScript;options=o;
 if(root.document.getElementById('sc-orbit-content')){
  refreshPanel();load();
 }
}
function action(action,element){
 if(!root.document.getElementById('sc-orbit-live'))return false;
 if(action==='now'){simMin=15;const r=root.document.getElementById('sc-clock-range');if(r)r.value=15;draw();return true;}
 if(action==='sat'){
  chosen=element.dataset.id||chosen;
  const info=root.document.getElementById('sc-sat-info');
  const sat=data?.satellites?.find(x=>x.id===chosen);
  if(info)info.innerHTML=satDetail(sat,options||{});
  root.document.querySelectorAll('.sc-sat').forEach(b=>b.classList.toggle('active',b.dataset.id===chosen));
  draw();return true;
 }
 return false;
}
function slider(v){if(!fin(v))return;simMin=Math.max(0,Math.min(180,v));draw();}
root.MONOSpaceControl={render,mount,load,destroy,action,slider,skyWindows,pointAt};
if(typeof module!=='undefined'&&module.exports)module.exports=root.MONOSpaceControl;
})(typeof window!=='undefined'?window:globalThis);
