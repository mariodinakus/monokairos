/* MONO / Gravity Observatory. Idealized Newtonian tides, NOT measured gravity. */
(function(root){
'use strict';
const AU=149597870700,R=6371008.8,GMm=4.9048695e12,GMs=1.32712440018e20,H=3600000;
let horizon=48,offset=0,cache='',samples=[],lastOpts=null;
const fmt=(n,d,lang)=>Number.isFinite(n)?n.toLocaleString(lang==='en'?'en-GB':'el-GR',{maximumFractionDigits:d}):'—';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const surfaceGravity=9.80665, gAt=km=>surfaceGravity*(R/(R+1000*km))**2;
const radialTide=(GM,d,alt)=>GM*R/d**3*(3*Math.sin(alt*Math.PI/180)**2-1)/1e-8;
function readings(lat,lon,now=Date.now()){
 const A=root.Astronomy;if(!A?.GeoMoon||!A?.GeoVector||!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 const start=Math.floor(now/600000)*600000,key=lat.toFixed(4)+':'+lon.toFixed(4)+':'+start;
 if(key===cache&&samples.length===73)return samples;
 try{
  const obs=new A.Observer(lat,lon,0),out=[];
  for(let i=0;i<=72;i++){
   const t=start+i*H,date=new Date(t),md=A.GeoMoon(date).Length()*AU,sd=A.GeoVector('Sun',date,false).Length()*AU;
   const alt=body=>{const q=A.Equator(body,date,obs,false,true);return A.Horizon(date,obs,q.ra,q.dec,'none').altitude;};
   const moon=radialTide(GMm,md,alt('Moon')),sun=radialTide(GMs,sd,alt('Sun'));
   out.push({t,moon,sun,total:moon+sun,moonKm:md/1000});
  }
  cache=key;samples=out;return out;
 }catch{return null;}
}
function graph(data,n,lang){
 const ww=700,hh=188,li=30,ri=12,t=20,b=22,pts=data.slice(0,n+1);
 const mx=Math.max(40,Math.ceil(Math.max(...pts.flatMap(p=>[Math.abs(p.moon),Math.abs(p.sun),Math.abs(p.total)]))/20)*20);
 const x=i=>li+(ww-li-ri)*i/n,y=v=>t+(hh-t-b)/2-v/mx*(hh-t-b)/2;
 const path=k=>pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p[k]).toFixed(1)).join(' ');
 const lines=[-mx,0,mx].map(v=>'<line x1="'+li+'" x2="'+(ww-ri)+'" y1="'+y(v)+'" y2="'+y(v)+'" class="go-grid"/><text x="'+(li-4)+'" y="'+(y(v)-3)+'" text-anchor="end" class="go-tick">'+v+'</text>').join('');
 const ticks=Array.from({length:Math.floor(n/12)+1},(_,i)=>i*12).map(i=>'<text x="'+x(i)+'" y="'+(hh-6)+'" text-anchor="middle" class="go-tick">+'+i+'h</text>').join('');
 return '<svg viewBox="0 0 '+ww+' '+hh+'" role="img" aria-label="Calculated lunar and solar tidal gravity">'+lines+
 '<path class="go-line go-moon" d="'+path('moon')+'"/><path class="go-line go-sun" d="'+path('sun')+'"/><path class="go-line go-total" d="'+path('total')+'"/>'+
 '<line data-go-cursor x1="'+x(offset)+'" x2="'+x(offset)+'" y1="'+t+'" y2="'+(hh-b)+'" class="go-cursor"/>'+ticks+'</svg>';
}
function render(o={}){
 lastOpts=o;const data=readings(o.lat,o.lon,o.now);const el=o.lang!=='en',lang=el?'el':'en',X=(a,b)=>el?a:b;
 if(!data)return '<section class="section card go-panel" id="gravity-observatory"><b>'+X('Βαρύτητα & τροχιές','Gravity & orbits')+'</b><p>'+X('Οι υπολογισμοί δεν είναι διαθέσιμοι.','Calculations unavailable.')+'</p></section>';
 offset=Math.min(offset,horizon);const p=data[offset];
 const item=(id,label,value,detail)=>'<article><small>'+label+'</small><b data-go="'+id+'">'+value+'</b><span>'+detail+'</span></article>';
 const f=(v,n=1)=>fmt(v,n,lang);
 const at=new Date(p.t).toLocaleString(el?'el-GR':'en-GB',{timeZone:o.zone||'UTC',weekday:'short',hour:'2-digit',minute:'2-digit'});
 const buttons=[24,48,72].map(h=>'<button type="button" data-go-h="'+h+'" class="'+(h===horizon?'active':'')+'" aria-pressed="'+(h===horizon)+'">'+h+'h</button>').join('');
 const grav=gAt(400);
 return '<section class="section card go-panel" id="gravity-observatory"><span class="go-eyebrow">MONO / GRAVITY OBSERVATORY · '+X('ΥΠΟΛΟΓΙΣΜΟΣ','CALCULATION')+'</span>'+
 '<h2>'+X('Η αόρατη βαρύτητα Σελήνης & Ήλιου','The invisible gravity of Moon & Sun')+'</h2>'+
 '<p class="go-intro">'+X('Δείχνουμε πώς οι αστρονομικές θέσεις αλλάζουν ελάχιστα την παλιρροϊκή βαρυτική επίδραση στην περιοχή σου. Δεν πρόκειται για μέτρηση βαρυτόμετρου ούτε για ηλιακή καταιγίδα.',
 'Astronomical positions determine tiny tidal-gravity variations at your location. This is not a gravimeter reading or a solar storm.')+'</p>'+
 '<div class="go-metrics">'+item('moonKm',X('Απόσταση Σελήνης','Moon distance'),f(p.moonKm,0)+' km',X('Από το κέντρο της Γης','From Earth’s centre'))+
 item('moon',X('Σελήνη','Moon'),f(p.moon)+' µGal',X('Τοπική κατακόρυφη επίδραση','Local vertical tide term'))+
 item('sun',X('Ήλιος','Sun'),f(p.sun)+' µGal',X('Τοπική κατακόρυφη επίδραση','Local vertical tide term'))+
 item('total',X('Συνδυασμός','Combined'),f(p.total)+' µGal',X('Θεωρητικό άθροισμα','Theoretical sum'))+'</div>'+
 '<div class="go-head"><div><b>'+X('Βαρυτική παλίρροια: οι επόμενες ώρες','Gravitational tide: coming hours')+'</b><small>'+X('µGal · μοντέλο, όχι καταγεγραμμένα δεδομένα','µGal · calculated, not measured')+'</small></div><div class="go-tabs">'+buttons+'</div></div>'+
 '<div class="go-legend"><span class="go-lmoon">'+X('Σελήνη','Moon')+'</span><span class="go-lsun">'+X('Ήλιος','Sun')+'</span><span class="go-ltotal">'+X('Σύνολο','Total')+'</span></div>'+
 '<div class="go-chart">'+graph(data,horizon,lang)+'</div>'+
 '<div class="go-sliderhead"><b>'+X('Μετακίνηση στον χρόνο','Move through time')+'</b><time data-go-time>'+escape(at)+'</time></div>'+
 '<input id="go-hour" type="range" min="0" max="'+horizon+'" value="'+offset+'" step="1" aria-label="'+X('Ώρες μπροστά','Hours ahead')+'"/>'+
 '<p class="go-disclaimer">'+X('1 µGal = 10⁻⁸ m/s². Το πρόσημο δείχνει τη φορά της υπολογισμένης κατακόρυφης επίδρασης, όχι απώλεια της βαρύτητας. Δεν περιλαμβάνονται ελαστική παραμόρφωση της Γης, ωκεάνια φόρτιση ή τοπικά όργανα. Δεν είναι πρόγνωση παλίρροιας στη θάλασσα, σεισμών ή διαστημικού κινδύνου.',
 '1 µGal = 10⁻⁸ m/s². Sign indicates direction of the theoretical vertical tide, not loss of gravity. Earth deformation, ocean loading and local instrument readings are excluded. This does not predict sea level, earthquakes or space-weather danger.')+'</p>'+
 '<div class="go-orbit"><div><span class="go-eyebrow">GRAVITY VS ORBIT</span><h3>'+X('Υπάρχει βαρύτητα στα 400 χλμ.;','Is there gravity 400 km up?')+'</h3>'+
 '<p>'+X('Ναι! Οι αστροναύτες αιωρούνται λόγω συνεχούς ελεύθερης πτώσης μαζί με τον σταθμό — όχι επειδή εξαφανίζεται η βαρύτητα.',
 'Yes! Astronauts float because they and their spacecraft are in continuous free fall together, not because gravity disappears.')+'</p></div><strong>'+f(grav,2)+' <small>m/s²</small><span>'+f(grav/surfaceGravity*100,0)+'% '+X('της βαρύτητας εδάφους','of surface gravity')+'</span></strong></div>'+
 '<p class="go-cites">'+X('Υπολογισμοί τροχιών:','Ephemerides:')+' <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener noreferrer">Astronomy Engine</a> · '+
 '<a href="https://science.nasa.gov/moon/tides/" target="_blank" rel="noopener noreferrer">NASA Tides</a> · '+
 '<a href="https://www.spaceweather.gov/impacts/satellite-drag" target="_blank" rel="noopener noreferrer">NOAA Satellite Drag</a></p></section>';
}
function update(v){
 if(!samples.length)return;offset=Math.max(0,Math.min(horizon,Number(v)||0));
 const panel=root.document.getElementById('gravity-observatory');if(!panel)return;
 const p=samples[offset],lang=lastOpts?.lang==='en'?'en':'el',f=(n,d)=>fmt(n,d,lang);
 const map={moonKm:f(p.moonKm,0)+' km',moon:f(p.moon,1)+' µGal',sun:f(p.sun,1)+' µGal',total:f(p.total,1)+' µGal'};
 for(const k of Object.keys(map)){const e=panel.querySelector('[data-go="'+k+'"]');if(e)e.textContent=map[k];}
 const clock=panel.querySelector('[data-go-time]');
 if(clock)clock.textContent=new Date(p.t).toLocaleString(lang==='en'?'en-GB':'el-GR',{timeZone:lastOpts?.zone||'UTC',weekday:'short',hour:'2-digit',minute:'2-digit'});
 const line=panel.querySelector('[data-go-cursor]');if(line){const x=30+(700-30-12)*offset/horizon;line.setAttribute('x1',String(x));line.setAttribute('x2',String(x));}
}
if(root.document){
 root.document.addEventListener('input',e=>{if(e.target.id==='go-hour')update(e.target.value);});
 root.document.addEventListener('click',e=>{
  const button=e.target.closest?.('[data-go-h]');if(!button||!lastOpts)return;
  const n=Number(button.dataset.goH);if(![24,48,72].includes(n))return;
  horizon=n;offset=Math.min(offset,horizon);
  const old=root.document.getElementById('gravity-observatory');if(old)old.outerHTML=render(lastOpts);
 });
}
const api={render,readings,radialTide,gAt};
root.MONOGravity=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);