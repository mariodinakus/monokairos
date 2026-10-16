/* Animated model maps, model signals and extended outlook. Leaflet is loaded locally. */
(function(root){
'use strict';
const Core=root.MonoForecastCore,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const layers={rain:{index:0,el:'Βροχή',en:'Rain',unit:'mm / 6h',stops:[[0,'#294464'],[1,'#36a9d8'],[5,'#3dcba8'],[10,'#f0d54c'],[20,'#f49342'],[40,'#ee4b6d'],[60,'#9b55d9']]},wind:{index:2,el:'Ριπές ανέμου',en:'Wind gusts',unit:'km/h · max 6h',stops:[[0,'#344866'],[20,'#62b9d7'],[40,'#40c3b0'],[62,'#e5cc4f'],[80,'#f28d49'],[110,'#d34b7a']]},temp:{index:1,el:'Θερμοκρασία',en:'Temperature',unit:'°C · 2m',stops:[[-20,'#9b75e5'],[-10,'#527bdc'],[0,'#65bdde'],[10,'#73c5a7'],[20,'#e1ce63'],[30,'#eb9348'],[40,'#c64d65']]},pressure:{index:3,el:'Βαρομετρικά',en:'Pressure',unit:'hPa',stops:[[970,'#a365d9'],[990,'#5c7bd0'],[1005,'#6bb4d6'],[1015,'#78b3a7'],[1025,'#d4c479'],[1040,'#dc985e']]},cloud:{index:4,el:'Σύννεφα',en:'Cloud',unit:'%',stops:[[0,'#3b5369'],[25,'#7b91a6'],[60,'#b5c1cd'],[100,'#f2f3f4']]},snow:{index:5,el:'Χιόνι',en:'Snow',unit:'cm / 6h',stops:[[0,'#445477'],[0.2,'#9cc8e4'],[1,'#79a6ee'],[3,'#837fe3'],[8,'#c56dd6'],[15,'#e6a0da']]}};
let context=null,map=null,motion=null,marks=null,mapData=null,outlook=null,slot=0,layer='wind',region='world',model='ecmwf',timer=null,generation=0,mapRequest=0,panel='map',mapBusy=false,outlookBusy=false,ctxKey='',speed=1,flow=true,detailCenter=null,locationKey='',pendingFit=false;
const cache=new Map(),monthCache=new Map(),frameCache=new Map();
const X=(a,b)=>context?.lang==='en'?b:a,locale=()=>context?.lang==='en'?'en-GB':'el-GR';
const key=o=>[o.lat,o.lon,o.lang,o.theme].join(',');
const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString(locale(),{maximumFractionDigits:d}):'—';
const signed=(v,d=1)=>Number.isFinite(v)?(v>0?'+':'')+fmt(v,d):'—';
const time=t=>new Date(t).toLocaleString(locale(),{timeZone:context?.zone||'UTC',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const day=t=>new Date(t).toLocaleDateString(locale(),{timeZone:'UTC',day:'numeric',month:'short'});
const set=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};
function isMounted(o){return !!map&&!!document.getElementById('forecast-explorer')&&ctxKey===key(o);}
function stop(){if(timer)clearInterval(timer);timer=null;document.getElementById('forecast-explorer')?.classList.remove('fm-playing');const b=document.getElementById('fm-play');if(b){b.textContent='▶ '+X('Κίνηση','Play');b.setAttribute('aria-pressed','false');}}
function play(){
 if(!mapData?.times.length)return;stop();timer=setInterval(()=>{if(document.hidden||!document.getElementById('forecast-map')){stop();return;}slot=(slot+1)%mapData.times.length;paint(true);},2000/speed);
 document.getElementById('forecast-explorer').classList.add('fm-playing');document.getElementById('fm-play').textContent='Ⅱ '+X('Παύση','Pause');document.getElementById('fm-play').setAttribute('aria-pressed','true');
}
function destroy(){generation++;mapRequest++;stop();motion?.destroy();motion=null;if(map){map.remove();map=null;}marks=null;mapBusy=outlookBusy=false;}
function render(options){
 context=options;
 return `<section id="forecast-explorer" class="fm-explorer"><div class="fm-horizons" aria-label="${X('Ορίζοντας πρόγνωσης','Forecast horizon')}">${[['map',X('Χάρτες 7 ημερών','7-day maps'),'01'],['signals',X('Έρχεται κακοκαιρία;','Storms ahead?'),'02'],['month',X('Μήνας & 6 εβδομάδες','Month & 6 weeks'),'03']].map(([id,title,n])=>`<button data-fm-tab="${id}" aria-pressed="${panel===id}"><small>${n}</small><b>${title}</b><span>${id==='map'?X('Ο κόσμος σε κίνηση','The world in motion'):id==='signals'?X('Ενδείξεις & επίσημες πηγές','Signals & official sources'):X('Γενικές τάσεις, μικρότερη βεβαιότητα','Broad trends, lower certainty')}</span></button>`).join('')}</div>
 <div data-fm-panel="map" ${panel!=='map'?'hidden':''}><div class="card fm-mapcard"><div class="fm-atlas-head"><div><span class="label">MONO / WORLD ATLAS</span><h2>${X('Ένας πλανήτης. Επτά ημέρες.','One planet. Seven days.')}</h2><p>${X('Σύρε τον χάρτη, εξερεύνησε τις ηπείρους και δες τον καιρό να εξελίσσεται.','Drag the map, explore continents and watch the weather evolve.')}</p></div><span class="fm-orbit" aria-hidden="true">◎</span></div>
 <div class="fm-views" aria-label="${X('Γρήγορη μετάβαση','Quick view')}">${[['world',X('◎ Κόσμος','◎ World')],['europe',X('Ευρώπη','Europe')],['americas',X('Αμερική','Americas')],['africa',X('Αφρική','Africa')],['asia',X('Ασία','Asia')],['pacific',X('Ειρηνικός','Pacific')]].map(([id,title])=>`<button class="chip" data-fm-view="${id}">${title}</button>`).join('')}<button class="chip fm-detail" data-fm-detail>⌖ ${X('Λεπτομέρεια εδώ','Detail here')}</button></div>
 <div class="fm-toolbar"><div class="fm-layers" aria-label="${X('Στρώμα χάρτη','Map layer')}">${Object.entries(layers).map(([id,l])=>`<button class="chip ${layer===id?'active':''}" data-fm-layer="${id}" aria-pressed="${layer===id}">${context.lang==='en'?l.en:l.el}</button>`).join('')}</div><div class="fm-selects"><label>${X('Κάλυψη','Coverage')}<select id="fm-region"><option value="world">${X('Παγκόσμιος','Worldwide')}</option><option value="greece">${X('Ελλάδα & γύρω','Greece & nearby')}</option><option value="europe">${X('Ευρώπη & Μεσόγειος','Europe & Mediterranean')}</option><option value="local">${X('Τοπική λεπτομέρεια','Local detail')}</option></select></label><label>${X('Μοντέλο','Model')}<select id="fm-model"><option value="ecmwf">ECMWF IFS</option><option value="gfs">NOAA GFS</option></select></label></div></div>
 <div class="fm-valid"><div><span class="label" id="fm-layer-title"></span><strong id="fm-valid-time">${X('Φόρτωση πρόγνωσης…','Loading forecast…')}</strong></div><span class="fm-model-badge" id="fm-horizon"></span></div><div class="fm-map-wrap"><div id="forecast-map" class="fm-map" aria-label="${X('Παγκόσμιος χάρτης πρόγνωσης καιρού','Worldwide weather forecast map')}"></div><span class="fm-map-caption" id="fm-map-caption">${X('ΠΑΓΚΟΣΜΙΑ ΠΡΟΓΝΩΣΗ','GLOBAL FORECAST')}</span><button class="fm-flow-toggle" id="fm-flow" aria-pressed="${flow}" ${layer!=='wind'?'hidden':''}>≋ ${X('Ίχνη ανέμου','Wind trails')}</button></div>
 <div class="fm-timebar"><button id="fm-play" class="outline-btn" aria-pressed="false">▶ ${X('Κίνηση','Play')}</button><input id="fm-slider" type="range" min="0" max="0" value="0" aria-label="${X('Χρόνος πρόγνωσης','Forecast time')}" disabled><button class="chip fm-speed" id="fm-speed" aria-label="${X('Ταχύτητα κίνησης','Playback speed')}">${speed}×</button><span id="fm-step">—</span></div><div class="fm-days">${[0,1,2,3,4,5,6,7].map(d=>`<button class="chip" data-fm-day="${d}">${d? '+'+d+'d':X('Πρώτο καρέ','First frame')}</button>`).join('')}</div><div id="fm-legend" class="fm-legend"></div><p id="fm-map-status" class="fm-status" role="status"></p><div id="fm-near" class="fm-near"></div></div>
 <p class="notice">${X('Παγκόσμια εικόνα έως ±85° γεωγραφικού πλάτους, σε αραιό πλέγμα με εξομάλυνση. Για μικρότερη περιοχή πάτησε «Λεπτομέρεια εδώ». Μπορεί να χαθούν τοπικές καταιγίδες και ορεινά φαινόμενα. Βροχή/χιόνι: σύνολο των 6 ωρών πριν από το καρέ. Ριπές: μέγιστο 6ώρου. Τα ίχνη δείχνουν τη ροή ανέμου στα 10 m· η ταχύτητα της κίνησής τους είναι οπτική αναπαράσταση, όχι πραγματικός χρόνος.','Worldwide overview to ±85° latitude on a smoothed coarse grid. Choose “Detail here” for a smaller area. Local storms and mountain effects can be missed. Rain/snow: the 6 hours ending at the frame. Gusts: 6-hour maximum. Trails show 10 m wind flow; their animation speed is illustrative, not real time.')}</p><div class="fm-source-links"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo · CC BY 4.0 ↗</a><a href="https://charts.ecmwf.int/" target="_blank" rel="noopener noreferrer">${X('Επίσημοι χάρτες ECMWF','Official ECMWF charts')} ↗</a><button class="chip" data-action="goto" data-page="radar">${X('Πραγματικό ραντάρ','Observed radar')} ↗</button></div></div>
 <div data-fm-panel="signals" ${panel!=='signals'?'hidden':''}><div id="fm-signals"></div></div>
 <div data-fm-panel="month" ${panel!=='month'?'hidden':''}><div class="fm-outlook-intro"><span class="label">ECMWF EC46 / SEAS5</span><h2>${X('Ο επόμενος μήνας, σε μεγάλες γραμμές','The next month, in broad strokes')}</h2><p>${X('Θερμότερα ή ψυχρότερα; Πιο υγρά ή πιο ξηρά; Εδώ βλέπεις τάσεις, όχι συγκεκριμένες ημέρες κακοκαιρίας έναν μήνα μπροστά.','Warmer or colder? Wetter or drier? These are broad trends, not exact storm dates a month ahead.')}</p></div><div id="fm-outlook"><p class="notice">${X('Φόρτωση τάσεων…','Loading outlook…')}</p></div><p class="notice">${X('Οι αποκλίσεις συγκρίνονται με το κλίμα του ίδιου μοντέλου, όχι με μετρήσεις σταθμού. Τα δεδομένα είναι περίπου 36 km, χωρίς διόρθωση τοπικής μεροληψίας. Η αβεβαιότητα μεγαλώνει με τον ορίζοντα.','Anomalies use the model’s own climate, not station observations. Data are approximately 36 km, without local bias correction. Uncertainty grows with lead time.')}</p><a class="env-source" href="https://open-meteo.com/en/docs/seasonal-forecast-api" target="_blank" rel="noopener noreferrer">Open-Meteo / ECMWF EC46 & SEAS5 ↗</a></div></section>`;
}
async function mount(options,loadLeaflet){
 destroy();context=options;ctxKey=key(options);const gen=generation,location=options.lat+','+options.lon;if(location!==locationKey){detailCenter={lat:options.lat,lon:options.lon};locationKey=location;}
 const rootEl=document.getElementById('forecast-explorer');if(!rootEl)return;rootEl.addEventListener('click',onClick);
 document.getElementById('fm-region').value=region;document.getElementById('fm-model').value=model;
 document.getElementById('fm-region').addEventListener('change',e=>{region=e.target.value;if(region==='local')detailCenter={lat:context.lat,lon:context.lon};loadMap(true);});
 document.getElementById('fm-model').addEventListener('change',e=>{model=e.target.value;loadMap(false);});
 document.getElementById('fm-slider').addEventListener('input',e=>{stop();slot=+e.target.value;paint();});
 document.getElementById('fm-play').addEventListener('click',()=>timer?stop():play());
 document.getElementById('fm-speed').addEventListener('click',()=>{speed=speed===.5?1:speed===1?2:.5;set('fm-speed',speed+'×');if(timer)play();});
 document.getElementById('fm-flow').addEventListener('click',()=>{flow=!flow;document.getElementById('fm-flow').setAttribute('aria-pressed',String(flow));motion?.flow(flow);});
 update(options);if(panel==='month')loadOutlook();
 try{
  await loadLeaflet();if(gen!==generation||!document.getElementById('forecast-map'))return;const L=root.L;
  map=L.map('forecast-map',{zoomControl:true,scrollWheelZoom:false,worldCopyJump:true,zoomSnap:.25,minZoom:1,maxZoom:10}).setView([20,0],1.5);baseMap(L,options.theme);motion=root.MonoForecastMotion.create(map,{theme:options.theme});motion.flow(flow);motion.show(panel==='map');marks=L.layerGroup().addTo(map);
  L.circleMarker([options.lat,options.lon],{radius:5,color:options.theme==='dark'?'#fff':'#111',weight:2,fillOpacity:1}).addTo(map).bindTooltip(esc(options.city));
  map.on('click',e=>showPoint(nearest(e.latlng.lat,e.latlng.lng),e.latlng));map.on('moveend',sampleCenter);await loadMap(true);
 }catch{set('fm-map-status',X('Ο χάρτης δεν φορτώθηκε.','Map could not load.'));}
}
function baseMap(L, theme) {
  const target = map;
  const name = theme === 'dark' ? 'Dark_Gray' : 'Light_Gray';
  const root = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${name}`;
  const base = L.tileLayer(root + '_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 13, maxNativeZoom: 12, keepBuffer: 1,
    attribution: '© Esri, HERE, Garmin and contributors'
  }).addTo(target);
  const labels = L.tileLayer(root + '_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 13, maxNativeZoom: 12, pane: 'overlayPane', zIndex: 3
  }).addTo(target);
  let errors = 0, fallback = false;
  base.on('tileerror', () => {
    if (target !== map || fallback || ++errors < 3) return;
    fallback = true;
    target.removeLayer(base);
    target.removeLayer(labels);
    const services = ['World_Topo_Map', 'World_Street_Map'];
    function next(i) {
      if (target !== map || i >= services.length) return;
      const alternative = L.tileLayer(
        `https://server.arcgisonline.com/ArcGIS/rest/services/${services[i]}/MapServer/tile/{z}/{y}/{x}`, {
          maxZoom: 13, maxNativeZoom: 13, keepBuffer: 1,
          attribution: '© Esri, HERE, Garmin, USGS and contributors'
        }).addTo(target).bringToBack();
      let misses = 0;
      alternative.on('tileerror', () => {
        if (target !== map || !target.hasLayer(alternative) || ++misses < 3) return;
        target.removeLayer(alternative);
        next(i + 1);
      });
    }
    next(0);
  });
}
function update(options){const zoneChanged=context?.zone!==options.zone;context=options;if(document.getElementById('fm-signals'))set('fm-signals',signalsHTML(options));if(zoneChanged){if(mapData&&map&&panel==='map')paint();if(outlook&&panel==='month')paintOutlook();}if(map&&mapData&&!mapBusy&&Date.now()-mapData.at>(mapData.ttl||3600)*1000)loadMap(false);}
const views={world:[[-60,-180],[78,180]],europe:[[28,-20],[66,45]],americas:[[-57,-165],[73,-30]],africa:[[-36,-22],[38,57]],asia:[[-12,43],[72,160]],pacific:[[-53,110],[57,245]]};
function frameBounds(data,animate=false){if(!map||!data)return;const [s,w,n,e]=data.bounds,b=data.region==='world'?views.world:[[s,w],[n,e]],reduced=root.matchMedia('(prefers-reduced-motion: reduce)').matches;if(animate&&!reduced)map.flyToBounds(b,{padding:[16,16],duration:1.1});else map.fitBounds(b,{padding:[16,16],animate:false});}
function onClick(e){
 const tab=e.target.closest('[data-fm-tab]');if(tab){panel=tab.dataset.fmTab;document.querySelectorAll('[data-fm-panel]').forEach(p=>p.hidden=p.dataset.fmPanel!==panel);document.querySelectorAll('[data-fm-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.fmTab===panel)));stop();if(panel!=='map')motion?.show(false);if(panel==='month')loadOutlook();if(panel==='map'&&map)requestAnimationFrame(()=>{if(!map)return;map.invalidateSize();motion?.show(true);if(mapData){if(pendingFit){frameBounds(mapData);pendingFit=false;}paint();}});return;}
 const l=e.target.closest('[data-fm-layer]');if(l){layer=l.dataset.fmLayer;document.querySelectorAll('[data-fm-layer]').forEach(b=>{b.classList.toggle('active',b.dataset.fmLayer===layer);b.setAttribute('aria-pressed',String(b.dataset.fmLayer===layer));});paint(true);return;}
 const view=e.target.closest('[data-fm-view]');if(view&&map){stop();map.closePopup();if(region!=='world'){region='world';document.getElementById('fm-region').value=region;loadMap(false);}const b=views[view.dataset.fmView];if(root.matchMedia('(prefers-reduced-motion: reduce)').matches)map.fitBounds(b,{padding:[16,16],animate:false});else map.flyToBounds(b,{padding:[16,16],duration:1.2});document.querySelectorAll('[data-fm-view]').forEach(b=>b.classList.toggle('active',b===view));return;}
 if(e.target.closest('[data-fm-detail]')&&map){const c=map.getCenter();detailCenter={lat:Math.max(-80,Math.min(80,Math.round(c.lat/2)*2)),lon:((Math.round(c.lng/2)*2+180)%360+360)%360-180};region='local';document.getElementById('fm-region').value=region;loadMap(true);return;}
 const d=e.target.closest('[data-fm-day]');if(d&&mapData){stop();const target=Date.now()+ +d.dataset.fmDay*86400e3;slot=mapData.times.reduce((best,t,i)=>Math.abs(t-target)<Math.abs(mapData.times[best]-target)?i:best,0);paint(true);return;}
 if(e.target.closest('[data-fm-retry]'))loadMap(false);if(e.target.closest('[data-fm-outlook-retry]'))loadOutlook(true);
}
async function json(url,ms){const r=await fetch(url,{signal:AbortSignal.timeout(ms)});if(!r.ok)throw new Error('unavailable');return r.json();}
async function loadMap(fit){
 if(!map)return;stop();const current=generation,ticket=++mapRequest,c=detailCenter||context,lat=Math.round(c.lat/2)*2,lon=Math.round(c.lon/2)*2,chosen=region+':'+model+(region==='local'?':'+lat+','+lon:'');
 const req=new URLSearchParams({region,model});if(region==='local'){req.set('lat',String(lat));req.set('lon',String(lon));}
 const target=mapData?.times[slot]||Date.now();mapBusy=true;document.getElementById('forecast-map').classList.add('fm-loading');set('fm-map-status',X('Φόρτωση πλέγματος πρόγνωσης…','Loading model grid…'));document.getElementById('fm-slider').disabled=true;ctxKey=key(context);
 try{
  const hit=cache.get(chosen),raw=hit&&Date.now()-hit.at<(hit.ttl||3600)*1000?hit:await json('/api/weather-maps?'+req,35000);if(current!==generation||ticket!==mapRequest||!map)return;
  const data=Core.futureMap(raw);cache.set(chosen,raw);if(cache.size>12)cache.delete(cache.keys().next().value);mapData=data;slot=data.times.reduce((best,t,i)=>Math.abs(t-target)<Math.abs(data.times[best]-target)?i:best,0);document.getElementById('fm-slider').max=data.times.length-1;document.getElementById('fm-slider').disabled=false;
  if(fit)pendingFit=true;if(panel==='map'){if(pendingFit){frameBounds(data,true);pendingFit=false;}paint(true);}
 }catch(error){console.warn('Forecast map:',error.message);if(current===generation&&ticket===mapRequest)set('fm-map-status',`${X('Δεν φορτώθηκε η πρόγνωση. Δοκίμασε ξανά ή επίλεξε άλλο μοντέλο.','Forecast unavailable. Retry or choose another model.')} <button class="chip" data-fm-retry>${X('Ξανά','Retry')}</button>`);}
 finally{if(current===generation&&ticket===mapRequest){mapBusy=false;document.getElementById('forecast-map')?.classList.remove('fm-loading');}}
}
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
function color(v,l){const s=l.stops;if(v<=s[0][0])return rgb(s[0][1]);for(let i=1;i<s.length;i++)if(v<=s[i][0]){const f=(v-s[i-1][0])/(s[i][0]-s[i-1][0]),a=rgb(s[i-1][1]),b=rgb(s[i][1]);return a.map((x,j)=>Math.round(x+(b[j]-x)*f));}return rgb(s.at(-1)[1]);}
function raster(){
 const d=mapData,l=layers[layer],k=[d.at,d.model,d.region,d.bounds.join(','),d.times[slot],layer].join(':');if(frameCache.has(k))return frameCache.get(k);const canvas=document.createElement('canvas');canvas.width=d.region==='world'?720:400;canvas.height=d.region==='world'?440:300;
 const c=canvas.getContext('2d'),im=c.createImageData(canvas.width,canvas.height),[south,,north]=d.bounds,ys=Array.from({length:canvas.height},(_,y)=>Math.max(0,Math.min(d.ny-1,(Core.rasterLatitude(y/(canvas.height-1),south,north)-south)/(north-south)*(d.ny-1))));
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
  const fx=x/(canvas.width-1)*(d.nx-1),fy=ys[y],x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(x0+1,d.nx-1),y1=Math.min(y0+1,d.ny-1),a=fx-x0,b=fy-y0,samples=[[y0*d.nx+x0,(1-a)*(1-b)],[y0*d.nx+x1,a*(1-b)],[y1*d.nx+x0,(1-a)*b],[y1*d.nx+x1,a*b]];let v=0,valid=true;
  for(const [i,w] of samples){if(w<1e-9)continue;const n=d.points[i]?.frames?.[slot]?.[l.index];if(!Number.isFinite(n)){valid=false;break;}v+=n*w;}
  if(!valid||(layer==='rain'||layer==='snow')&&v<.1)continue;const at=(y*canvas.width+x)*4,col=color(v,l);im.data[at]=col[0];im.data[at+1]=col[1];im.data[at+2]=col[2];im.data[at+3]=layer==='cloud'?Math.round(150*v/100):165;
 }
 c.putImageData(im,0,0);const uri=canvas.toDataURL();frameCache.set(k,uri);if(frameCache.size>36)frameCache.delete(frameCache.keys().next().value);return uri;
}
function nearest(lat,lon){if(!mapData)return -1;let best=0,min=Infinity;mapData.points.forEach((p,i)=>{const dl=((p.lon-lon+540)%360)-180,dist=(p.lat-lat)**2+(dl*Math.cos(lat*Math.PI/180))**2;if(dist<min){min=dist;best=i;}});return best;}
function showPoint(i,latlng){if(i<0||!mapData||!map)return;const p=mapData.points[i],f=p.frames[slot];root.L.popup().setLatLng(latlng||[p.lat,p.lon]).setContent(`<div class="fm-popup"><b>${X('Σημείο πλέγματος','Model grid point')} ${fmt(p.lat,2)}°, ${fmt(p.queryLon,2)}°</b><small>${time(mapData.times[slot])}</small>${Object.values(layers).map(l=>`<div><span>${context.lang==='en'?l.en:l.el}</span><strong>${fmt(f[l.index])} ${l.unit}</strong></div>`).join('')}</div>`).openOn(map);}
function sampleCenter(){
 if(!mapData||!map)return;const c=map.getCenter(),p=mapData.points[nearest(c.lat,c.lng)],f=p?.frames[slot];if(!f)return;set('fm-near',`<span>${X('Δείγμα πλέγματος στο κέντρο','Grid sample at centre')}: ${fmt(p.lat,2)}°, ${fmt(p.queryLon,2)}°</span><b>${fmt(f[1])}°</b><b>☂ ${fmt(f[0])} mm/6h</b><b>↝ ${fmt(f[2],0)} km/h</b>`);
}
function paint(animate=false){
 if(!mapData||!map||!motion)return;map.closePopup();const d=mapData,l=layers[layer],t=d.times[slot];document.getElementById('fm-slider').value=slot;motion.draw(d,slot,layer,raster(),{animate,duration:Math.min(1000,1500/speed)});marks.clearLayers();
 if(layer==='pressure'){const valid=d.points.map(p=>({p,v:p.frames[slot][3]})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>a.v-b.v);for(const [x,label] of [[valid[0],'L'],[valid.at(-1),'H']])if(x)root.L.marker([x.p.lat,x.p.lon],{icon:root.L.divIcon({className:'fm-pressure '+label.toLowerCase(),html:`<b>${label}</b><small>${fmt(x.v,0)}</small>`,iconSize:[44,42]})}).addTo(marks).bindTooltip(X('Ελάχιστο/μέγιστο πλέγματος · όχι εντοπισμός κυκλώνα','Grid minimum/maximum · not cyclone detection'));}
 document.getElementById('fm-flow').hidden=layer!=='wind';set('fm-map-caption',d.region==='world'?X('ΠΑΓΚΟΣΜΙΑ ΠΡΟΓΝΩΣΗ','GLOBAL FORECAST'):X('ΠΕΡΙΦΕΡΕΙΑΚΗ ΠΡΟΓΝΩΣΗ','REGIONAL FORECAST'));
 set('fm-layer-title',(context.lang==='en'?l.en:l.el)+' · '+l.unit);set('fm-valid-time',time(t));set('fm-horizon','+'+Math.max(0,Math.round((t-Date.now())/3600e3))+'h · '+(d.model==='gfs'?'GFS':'ECMWF'));set('fm-step',(slot+1)+' / '+d.times.length);
 set('fm-legend',l.stops.map(([v,c])=>`<span><i style="background:${c}"></i>${v}${v===l.stops.at(-1)[0]?'+':''}</span>`).join('')+`<small>${l.unit}</small>`);
 set('fm-map-status',`${esc(d.source)} · ${X('Λήψη','Retrieved')}: ${time(d.at)} · ${X('Πλέγμα','Grid')}: ${fmt(d.dy,1)}° × ${fmt(d.dx,1)}° · ${X('Ώρες','Times')}: ${esc(context.zone||'UTC')}`);sampleCenter();
 document.querySelectorAll('[data-fm-day]').forEach(b=>b.classList.toggle('active',Math.round((t-Date.now())/86400e3)===+b.dataset.fmDay));
}

function signalsHTML(o){
 const C=Core.signals(o.rows),labels={rain:X('Αυξημένη βροχή','Elevated rainfall'),wind:X('Ισχυρές ριπές','Strong gusts'),storm:X('Ένδειξη καταιγίδων','Thunderstorm signal'),snow:X('Ένδειξη χιονιού','Snow signal')},units={rain:'mm / 24h',wind:'km/h',storm:'%',snow:'%'};
 const warnings=Array.isArray(o.warnings)?o.warnings.filter(w=>Number.isFinite(w.expires)&&w.expires>Date.now()).slice(0,6):[];
 const news=(o.news||[]).filter(n=>Number.isFinite(n.t)&&Date.now()-n.t<3*86400e3&&/κακοκαιρ|επιδείνω|επιδεινω|ψυχρ|καύσων|καυσων|\bstorm|\bcold snap|\bheatwave/i.test(n.title||'')&&/^https?:\/\//i.test(n.link||'')).slice(0,5);
 return `<article class="card fm-risk-intro"><span class="label">${esc(o.city)} · MONO · ${X('επόμενες 7 ημέρες','next 7 days')}</span><h2>${C.events.length?X('Περίοδοι που θέλουν παρακολούθηση','Periods to watch'):C.coverage>=72?X('Δεν ξεχωρίζει ισχυρό σήμα προς το παρόν','No strong signal stands out yet'):X('Συγκεντρώνουμε την πρόγνωση','Gathering the forecast')}</h2><p>${X('Αυτόματη ένδειξη από την πρόγνωση της τοποθεσίας, όχι επίσημη προειδοποίηση ή ονομασία κακοκαιρίας. Ο χρονισμός και η ένταση μπορούν να αλλάξουν.','Automatic signal from the location forecast, not an official warning or a named storm. Timing and intensity can change.')}</p>${C.coverage<72?`<p class="notice">${X('Περιορισμένη κάλυψη δεδομένων','Limited data coverage')}: ${C.coverage}h</p>`:''}</article><div class="fm-risk-grid">${C.events.map(e=>`<article class="card fm-risk fm-risk${e.level}"><span class="label">${labels[e.type]}</span><strong>${fmt(e.value)} <small>${units[e.type]}</small></strong><b>${time(e.time)}</b><p>${e.type==='rain'?X('Αναμενόμενο σύνολο στο επόμενο 24ωρο από αυτή την ώρα.','Expected accumulation in the 24 hours starting at this time.'):X('Ένδειξη για αυτή την ώρα πρόγνωσης.','Signal for this forecast hour.')}</p></article>`).join('')}</div><article class="card fm-official"><span class="label">Meteoalarm / ${esc(o.country||'')}</span><h3>${X('Επίσημες προειδοποιήσεις χώρας','Official country warnings')}</h3>${warnings.length?warnings.map(w=>`<div class="fm-warning ${esc(w.color)}"><b>${esc(w.event)}</b><span>${esc((w.areas||[]).slice(0,2).join(' · '))}</span><small>${time(w.onset)} → ${time(w.expires)}</small></div>`).join(''):`<p>${Array.isArray(o.warnings)?X('Δεν βρέθηκαν ενεργές προειδοποιήσεις στην πηγή. Έλεγξε και την εθνική υπηρεσία.','No active warnings were found in this feed. Check the national service too.'):X('Η πηγή προειδοποιήσεων δεν είναι διαθέσιμη ακόμη.','The warnings feed is not yet available.')}</p>`}<a class="env-source" href="https://meteoalarm.org/" target="_blank" rel="noopener noreferrer">Meteoalarm ↗</a><p class="notice">${X('Οι περιοχές αναφέρονται στην προειδοποίηση· δεν αφορούν όλες απαραίτητα την πόλη σου.','Warning areas are listed above; not every warning necessarily applies to your city.')}</p></article><article class="card fm-official"><span class="label">${X('Τι αναφέρουν οι πηγές','What sources are reporting')}</span><h3>${X('Πρόσφατες αναφορές κακοκαιρίας','Recent severe-weather reports')}</h3>${news.map(n=>`<a class="fm-news" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer"><b>${esc(n.title)}</b><small>${esc(n.source)} · ${time(n.t)} ↗</small></a>`).join('')||`<p>${X('Δεν έχει φορτωθεί σχετικός πρόσφατος τίτλος.','No relevant recent headline is loaded.')}</p>`}<p class="notice">${X('Δημοσιεύματα, όχι επιβεβαίωση πρόγνωσης. Μπορεί να αφορούν άλλη περιοχή ή συμβάν που ήδη πέρασε.','News reports are not forecast confirmation. They may concern another area or a past event.')}</p></article>`;
}
function compact(o){
 context=o;const s=Core.signals(o.rows);if(!s.coverage)return '';
 return `<section class="card fm-compact section"><div><span class="label">${X('Τι έρχεται','What is coming')}</span><h2>${s.events.length?X('Δες τις περιόδους που ξεχωρίζουν','See the periods that stand out'):X('Παρακολούθησε την εξέλιξη του καιρού','Follow the weather ahead')}</h2><p>${X('Χάρτες βροχής, ανέμου, βαρομετρικών και τάσεις μήνα.','Rain, wind and pressure maps plus monthly trends.')}</p></div><button class="outline-btn" data-action="goto" data-page="maps">${X('Χάρτες & τάσεις','Maps & outlook')} ↗</button></section>`;
}
async function loadOutlook(force=false){
 if(outlookBusy)return;const current=generation,k=Math.round(context.lat*2)/2+','+Math.round(context.lon*2)/2,hit=monthCache.get(k);
 if(!force&&hit&&Date.now()-hit.at<21600000){outlook=hit;paintOutlook();return;}
 outlookBusy=true;set('fm-outlook',`<p class="notice">${X('Φόρτωση τάσεων ECMWF…','Loading ECMWF outlook…')}</p>`);
 try{const data=await json('/api/outlook?'+new URLSearchParams({lat:String(context.lat),lon:String(context.lon)}),22000);if(current!==generation)return;monthCache.set(k,data);if(monthCache.size>12)monthCache.delete(monthCache.keys().next().value);outlook=data;paintOutlook();}
 catch{if(current===generation)set('fm-outlook',`<article class="card"><p>${X('Η μακροπρόθεσμη τάση δεν φορτώθηκε. Δεν αντικαθίσταται με υποθετική πρόγνωση.','The extended outlook could not load. No hypothetical forecast is substituted.')}</p><button class="outline-btn" data-fm-outlook-retry>${X('Δοκίμασε ξανά','Retry')}</button></article>`);}
 finally{if(current===generation)outlookBusy=false;}
}
function paintOutlook(){
 if(!outlook)return;const o=outlook,parts=new Intl.DateTimeFormat('en-GB',{timeZone:context.zone||'UTC',year:'numeric',month:'numeric'}).formatToParts(new Date()),Y=+parts.find(p=>p.type==='year').value,M=+parts.find(p=>p.type==='month').value-1;
 const months=[Date.UTC(Y,M,1),Date.UTC(Y,M+1,1)].map((t,i)=>{const d=new Date(t),record=o.monthly.find(m=>new Date(m.time).getUTCFullYear()===d.getUTCFullYear()&&new Date(m.time).getUTCMonth()===d.getUTCMonth());return {time:t,record,index:i};});
 const monthName=t=>new Date(t).toLocaleDateString(locale(),{timeZone:'UTC',month:'long',year:'numeric'});
 const tempWord=v=>!Number.isFinite(v)?X('Μη διαθέσιμο','Unavailable'):v>0.5?X('Θερμότερος από το σύνηθες','Warmer than usual'):v< -0.5?X('Ψυχρότερος από το σύνηθες','Colder than usual'):X('Κοντά στο σύνηθες','Near usual');
 set('fm-outlook',`<div class="fm-months">${months.map(({time:t,record:r,index:i})=>`<article class="card fm-month"><span class="label">${i?X('Επόμενος μήνας','Next month'):X('Τρέχων μήνας · ολόκληρος','Current month · whole month')}</span><h3>${esc(monthName(t))}</h3>${r?`<strong class="${r.tempAnomaly>0?'warm':'cool'}">${signed(r.tempAnomaly)}<small>°C</small></strong><b>${tempWord(r.tempAnomaly)}</b><div class="fm-month-rain"><span>${X('Απόκλιση συνολικού υετού','Total precipitation anomaly')}</span><b>${signed(r.rainAnomaly)} mm</b></div>`:`<p>${X('Δεν υπάρχουν διαθέσιμα στοιχεία για αυτόν τον ημερολογιακό μήνα.','No data are available for this calendar month.')}</p>`}<p>${X('SEAS5 · μηνιαία τάση έναντι κλίματος μοντέλου.','SEAS5 · monthly trend versus model climate.')}${i?'':' '+X('Δεν περιγράφει μόνο τις ημέρες που απομένουν.','This does not describe only the remaining days.')}</p></article>`).join('')}</div><article class="card fm-weekly"><div class="panelhead"><div><span class="label">EC46 · ${esc(context.city)}</span><h3>${X('Η τάση ανά εβδομάδα','Week by week')}</h3></div></div><div class="fm-week-grid">${o.weekly.map((w,i)=>`<div class="fm-week"><span>${day(w.time)} → ${day(w.end-86400e3)}</span><small>${w.time<Date.now()?X('Εβδομάδα σε εξέλιξη','Week in progress'):X('Εβδομάδα','Week')+' '+(i+1)}</small><strong class="${w.tempAnomaly>0?'warm':'cool'}">${signed(w.tempAnomaly)}°C</strong><b>${X('Θερμοκρασιακή απόκλιση','Temperature anomaly')}</b><div class="fm-anomaly-track"><i style="width:${Math.min(50,Math.abs(w.tempAnomaly||0)/4*50)}%;${w.tempAnomaly<0?'right:50%':'left:50%'};background:${w.tempAnomaly<0?'#669fde':'#e4a06c'}"></i></div><p>${X('Υετός εβδομάδας','Weekly precipitation')}: <b>${fmt(w.rain)} mm</b><br>Δ ${signed(w.rainAnomaly)} mm</p>${Number.isFinite(w.rainEfi)&&w.rainEfi>=0.8?`<small class="fm-efi">${X('Αυξημένο σήμα ασυνήθιστα υγρής εβδομάδας','Elevated unusually wet week signal')} · EFI ${fmt(w.rainEfi,2)}</small>`:''}</div>`).join('')||`<p class="notice">${X('Δεν υπάρχουν διαθέσιμες εβδομάδες.','No weeks are available.')}</p>`}</div><p class="notice">${X('Η πρώτη εβδομάδα μπορεί να περιλαμβάνει ημέρες που ήδη πέρασαν. Ο εβδομαδιαίος υετός περιλαμβάνει όλη την περίοδο. Το EFI δεν είναι πιθανότητα σε % ούτε προειδοποίηση για συγκεκριμένη καταιγίδα.','The first week can include past days. Weekly precipitation covers the whole period. EFI is not a percentage probability or a warning for a specific storm.')}</p></article><small class="env-meta">${esc(o.source)} · ${X('Ανάκτηση','Retrieved')}: ${time(o.at)}</small>`);
}
function refresh(){cache.clear();monthCache.clear();frameCache.clear();loadMap(false);if(panel==='month')loadOutlook(true);}
root.MonoForecast={render,mount,update,isMounted,destroy,compact,refresh};
})(window);
