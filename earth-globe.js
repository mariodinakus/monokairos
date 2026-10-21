(function earthGlobeModule(root) {
  'use strict';
  var enabled = {enso:true, quakes:true, storms:true, nao:false, iod:false, mjo:false, polar:false};
  try { var prior=JSON.parse(localStorage.getItem('mono_earth_layers')||'{}'); for(var k in enabled)if(typeof prior[k]==='boolean') enabled[k]=prior[k]; } catch(e){}
  var year = null, choice = {kind:'enso',id:'greece',factor:'enso'}, globeApi=null;
  var palette={enso:'#e06a40',nao:'#d4a547',iod:'#26a7a3',mjo:'#a387f7',polar:'#61b5df',quakes:'#ff725e',storms:'#e7bf64'};
  var names={el:{enso:'El Niño / La Niña',nao:'NAO',iod:'IOD',mjo:'MJO',polar:'Πολικός στρόβιλος',quakes:'Σεισμοί 24ώρου',storms:'Τροπικοί κυκλώνες',observed:'Μετρήσεις',schematic:'Σχηματική απεικόνιση',layers:'Επίπεδα φαινομένων',data:'Δεδομένα και πηγές',current:'Τώρα',region:'Κλιματικές επιδράσεις',history:'Ιστορική σύγκριση',unavailable:'Χωρίς επαληθευμένη τρέχουσα μέτρηση',forecast:'Επίσημη πρόγνωση',season:'Περίοδος',source:'Πηγή',see:'Ανάλυση περιοχής',note:'Οι ζώνες NAO/IOD/MJO/στρόβιλου είναι εκπαιδευτικά σχήματα, όχι δορυφορική παρατήρηση.'},en:{enso:'El Niño / La Niña',nao:'NAO',iod:'IOD',mjo:'MJO',polar:'Polar vortex',quakes:'Earthquakes (24h)',storms:'Tropical cyclones',observed:'Observed',schematic:'Schematic',layers:'Phenomenon layers',data:'Data and sources',current:'Now',region:'Climate impacts',history:'Historical comparison',unavailable:'No verified current measurement',forecast:'Official forecast',season:'Period',source:'Source',see:'Regional analysis',note:'NAO/IOD/MJO/vortex zones are educational schematics, not live satellite observations.'}};
  var centers=[
    {id:'pacific-east',lat:-6,lon:-82},
    {id:'indonesia',lat:-6,lon:122},
    {id:'eastafrica',lat:1,lon:38},
    {id:'america-south',lat:-32,lon:-59},
    {id:'usa',lat:35,lon:-101},
    {id:'cyclones',lat:17,lon:-57},
    {id:'greece',lat:38,lon:24}
  ];
  var additionalRegions=[
    {factor:'nao',id:'north-europe',lat:57,lon:12},
    {factor:'nao',id:'med',lat:39,lon:19},
    {factor:'iod',id:'iod-west',lat:1,lon:43},
    {factor:'iod',id:'iod-east',lat:-18,lon:132},
    {factor:'mjo',id:'tropics',lat:-10,lon:100},
    {factor:'mjo',id:'midlat',lat:39,lon:63},
    {factor:'polar',id:'arctic',lat:76,lon:-70},
    {factor:'polar',id:'europe',lat:45,lon:26}
  ];
  var nodes=[
    {factor:'nao',id:'nao-azores',lat:38,lon:-29,symbol:'H/L',name:'Azores',nameEl:'Αζόρες'},
    {factor:'nao',id:'nao-iceland',lat:64,lon:-21,symbol:'H/L',name:'Iceland',nameEl:'Ισλανδία'},
    {factor:'iod',id:'iod-west',lat:-4,lon:55,symbol:'IOD',name:'West Indian Ocean',nameEl:'Δυτικός Ινδικός'},
    {factor:'iod',id:'iod-east',lat:-6,lon:100,symbol:'IOD',name:'East Indian Ocean',nameEl:'Ανατολικός Ινδικός'},
    {factor:'mjo',id:'tropics',lat:2,lon:88,symbol:'MJO',name:'Tropical convection (schematic)',nameEl:'Τροπική κυκλοφορία (σχήμα)'},
    {factor:'polar',id:'arctic',lat:79,lon:0,symbol:'PV',name:'Polar vortex (schematic)',nameEl:'Πολικός στρόβιλος (σχήμα)'}
  ];
  var esc = function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};

  // Scale-aware globe inspector. Data descriptions come only from existing official observations.
  function quakeStrength(m,l) {
    var english=l==='en', labels=english
      ? ['Minor','Light','Moderate','Strong','Major','Great']
      : ['Μικρού μεγέθους','Ασθενής','Μέτριος','Ισχυρός','Πολύ ισχυρός','Εξαιρετικά ισχυρός'];
    return labels[m<4?0:m<5?1:m<6?2:m<7?3:m<8?4:5];
  }
  function stormLevel(kt,l) {
    if(!Number.isFinite(kt))return l==='en'?'Not reported':'Δεν αναφέρεται';
    if(kt>=137)return (l==='en'?'Category 5':'Κατηγορία 5')+' · Saffir–Simpson';
    if(kt>=113)return (l==='en'?'Category 4':'Κατηγορία 4')+' · Saffir–Simpson';
    if(kt>=96)return (l==='en'?'Category 3':'Κατηγορία 3')+' · Saffir–Simpson';
    if(kt>=83)return (l==='en'?'Category 2':'Κατηγορία 2')+' · Saffir–Simpson';
    if(kt>=64)return (l==='en'?'Category 1':'Κατηγορία 1')+' · Saffir–Simpson';
    if(kt>=34)return l==='en'?'Tropical-storm wind range':'Εύρος ανέμων τροπικής καταιγίδας';
    return l==='en'?'Below tropical-storm wind range':'Κάτω από το όριο τροπικής καταιγίδας';
  }
  function compass(d,l) {
    var el=['Β','ΒΑ','Α','ΝΑ','Ν','ΝΔ','Δ','ΒΔ'],en=['N','NE','E','SE','S','SW','W','NW'];
    return (l==='en'?en:el)[Math.round(((d%360)+360)%360/45)%8];
  }
  // Straight-line *illustration* from reported heading + speed; never an official forecast track.
  function projectStorm(q,hours) {
    if(!q||!Number.isFinite(q.lat)||!Number.isFinite(q.lon)||
       !Number.isFinite(q.movementDir)||!Number.isFinite(q.movementMph)||
       q.movementMph<2||q.movementMph>80||!Number.isFinite(q.time))return null;
    var age=Date.now()-q.time;
    if(age< -15*60*1000||age>18*60*60*1000)return null;
    var km=q.movementMph*1.609344*hours, delta=km/6371,
        bearing=q.movementDir*Math.PI/180, phi=q.lat*Math.PI/180, lam=q.lon*Math.PI/180;
    var phi2=Math.asin(Math.sin(phi)*Math.cos(delta)+Math.cos(phi)*Math.sin(delta)*Math.cos(bearing));
    var lam2=lam+Math.atan2(Math.sin(bearing)*Math.sin(delta)*Math.cos(phi),
                           Math.cos(delta)-Math.sin(phi)*Math.sin(phi2));
    return {lat:phi2*180/Math.PI,lon:((lam2*180/Math.PI+540)%360)-180,km:km};
  }
  function inspectorHtml(marker,l) {
    var en=l==='en',kind=marker.kind,q=marker.record,part='';
    if(kind==='quake'&&q&&Number.isFinite(q.mag)){
      part='<span class="earth-h-eyebrow">USGS · '+(en?'Observed earthquake':'Καταγεγραμμένος σεισμός')+'</span>'+
        '<h4>'+esc(q.place||'—')+'</h4><div class="earth-h-number">M '+q.mag.toFixed(1)+'</div>'+
        '<div class="earth-h-grade">'+esc(quakeStrength(q.mag,l))+'</div>'+
        '<div class="earth-h-line">'+(en?'Depth':'Εστιακό βάθος')+': <b>'+(Number.isFinite(q.depth)?q.depth.toFixed(0)+' km':'—')+'</b></div>'+
        '<small>'+(en?'Magnitude is logarithmic, not a damage prediction.':'Το μέγεθος είναι λογαριθμικό, όχι εκτίμηση ζημιών.')+'</small>';
    } else if(kind==='storm'&&q){
      var wind=Number.isFinite(q.windKt)?Math.round(q.windKt*1.852):null,
          projected=projectStorm(q,6),
          speed=Number.isFinite(q.movementMph)?Math.round(q.movementMph*1.609344):null;
      part='<span class="earth-h-eyebrow">NOAA NHC · '+(en?'Reported observation':'Δηλωμένη παρατήρηση')+'</span>'+
        '<h4>'+esc(q.name||'—')+' <span>'+esc(q.classification||'')+'</span></h4>'+
        '<div class="earth-h-number">'+(wind===null?'—':wind)+' <em>km/h</em></div>'+
        '<div class="earth-h-grade">'+esc(stormLevel(q.windKt,l))+'</div>'+
        '<div class="earth-h-line">'+(en?'Reported motion':'Δηλωμένη κίνηση')+': <b>'+
          (Number.isFinite(q.movementDir)?compass(q.movementDir,l)+' ('+Math.round(q.movementDir)+'°)':'—')+
          (speed===null?'':' · '+speed+' km/h')+'</b></div>'+
        (Number.isFinite(q.pressureMb)?'<div class="earth-h-line">'+(en?'Pressure':'Πίεση')+': <b>'+Math.round(q.pressureMb)+' hPa</b></div>':'')+
        (projected?'<div class="earth-h-projection">'+(en?'Dotted line: illustrative +6h, ~':'Διακεκομμένη γραμμή: ενδεικτικά +6 ώρες, ~')+
          Math.round(projected.km)+' km. <strong>'+(en?'NOT an official forecast.':'ΟΧΙ επίσημη πρόγνωση.')+'</strong></div>':
         '<small>'+(en?'Official future track: consult NHC.':'Επίσημη μελλοντική τροχιά: ανατρέξτε στο NHC.')+'</small>');
    } else {
      var f=marker.factor||'enso',name=marker.text||f,
          r=(root.MONOEarth&&root.MONOEarth.latest()||{}).roni||[],recent=r.length?r[r.length-1]:null,
          climate=marker.kind==='region'?(root.MONOEarth&&root.MONOEarth.regionData(f,marker.id,l)):null;
      part='<span class="earth-h-eyebrow">'+(en?'Climate context':'Κλιματικό πλαίσιο')+' · '+esc(f.toUpperCase())+'</span>'+
        '<h4>'+esc(climate&&climate.name||name)+'</h4>'+
        (f==='enso'&&recent?'<div class="earth-h-number">'+(recent.value>=0?'+':'')+Number(recent.value).toFixed(2)+' <em>°C RONI</em></div>':'')+
        '<small>'+(marker.kind==='region'
          ?(en?'Typical regional climate link, not a local weather forecast.':'Τυπική κλιματική συσχέτιση, όχι τοπική πρόγνωση.')
          :(en?'Schematic position; no verified live intensity or future track.':'Σχηματική θέση, χωρίς επαληθευμένη ζωντανή ένταση ή τροχιά.'))+'</small>';
    }
    return part;
  }
  var hoverTip=null,hoverPoint=null,hoverFrame=0;
  function ensureHoverTip(){
    var host=document.querySelector('.earth-globecard');
    if(!host)return null;
    if(!hoverTip||!hoverTip.isConnected||hoverTip.parentNode!==host){
      hoverTip=document.createElement('div');
      hoverTip.className='earth-hover-card';
      hoverTip.setAttribute('role','tooltip');
      hoverTip.setAttribute('aria-hidden','true');
      host.appendChild(hoverTip);
    }
    return hoverTip;
  }
  function positionHover(ev,anchor){
    var tip=ensureHoverTip();
    if(!tip)return;
    var r=tip.parentNode.getBoundingClientRect(),b=anchor&&anchor.getBoundingClientRect(),
        x=ev&&Number.isFinite(ev.clientX)?ev.clientX:(b?b.left+b.width/2:0),
        y=ev&&Number.isFinite(ev.clientY)?ev.clientY:(b?b.top:0);
    hoverPoint={x:x,y:y,left:r.left,top:r.top,width:r.width,height:r.height};
    if(hoverFrame)return;
    var paint=function(){
      hoverFrame=0;
      if(!hoverPoint||!hoverTip)return;
      var p=hoverPoint,w=hoverTip.offsetWidth||270,h=hoverTip.offsetHeight||180,
          tx=Math.max(9,Math.min(p.width-w-9,p.x-p.left+17)),
          ty=p.y-p.top+16;
      if(ty+h>p.height-9)ty=p.y-p.top-h-18;
      hoverTip.style.left=Math.round(tx)+'px';
      hoverTip.style.top=Math.round(Math.max(9,ty))+'px';
    };
    hoverFrame=root.requestAnimationFrame?root.requestAnimationFrame(paint):(paint(),0);
  }
  function showHover(marker,l,ev,anchor){
    if(!ensureHoverTip())return;
    hoverTip.innerHTML=inspectorHtml(marker,l);
    hoverTip.classList.add('visible');
    hoverTip.setAttribute('aria-hidden','false');
    positionHover(ev,anchor);
  }
  function hideHover(){
    if(hoverTip){hoverTip.classList.remove('visible');hoverTip.setAttribute('aria-hidden','true');}
    hoverPoint=null;
  }

  function lang(l){return names[l==='en'?'en':'el'];}
  function save(){try{localStorage.setItem('mono_earth_layers',JSON.stringify(enabled));}catch(e){}}
  function toggle(k){if(!(k in enabled))return;enabled[k]=!enabled[k];save();}
  function isActive(k){return !!enabled[k];}
  function setYear(v){var y=Number(v), curr=new Date().getUTCFullYear();year=Number.isFinite(y)&&y>=1950&&y<=curr?Math.floor(y):null;}
  function getRONI(){var raw=root.MONOEarth&&root.MONOEarth.latest(), a=raw&&raw.roni||[];return year == null ? a[a.length-1]||null : (a.filter(function(x){return x.year===year;}).slice(-1)[0]||null);}
  function rect(lat0,lat1,lon0,lon1){return {type:'Polygon',coordinates:[[[lon0,lat0],[lon1,lat0],[lon1,lat1],[lon0,lat1],[lon0,lat0]]]};}
  function cap(lat){var pts=[];for(var i=0;i<=72;i++){var phi=i*5*Math.PI/180;pts.push([Math.cos(phi)*180,Math.max(-90,Math.min(90,lat+Math.sin(phi)*0))]);}return rect(lat,89,-180,180);}
  function polygons(){
    var out=[],r=getRONI();
    if(enabled.enso){
      var c=r?(r.value>0.5?'rgba(235,92,59,.44)':r.value<-.5?'rgba(41,134,239,.44)':'rgba(138,143,149,.23)'):'rgba(138,143,149,.18)';
      out.push({id:'enso',factor:'enso',geometry:rect(-5,5,-170,-120),color:c,label:'Niño 3.4 · '+(r ? r.season+' '+r.year+' · '+r.value.toFixed(2)+' °C':'NOAA data unavailable'),outline:'#fcba8a'});
    }
    if(enabled.iod){
      out.push({id:'iod-west',factor:'iod',geometry:rect(-10,10,50,70),color:'rgba(39,170,175,.19)',label:'IOD · Western Indian Ocean (schematic)',outline:'#39bdb5'});
      out.push({id:'iod-east',factor:'iod',geometry:rect(-10,0,90,110),color:'rgba(238,143,53,.18)',label:'IOD · Eastern Indian Ocean (schematic)',outline:'#f6ae60'});
    }
    if(enabled.polar)out.push({id:'polar',factor:'polar',geometry:rect(70,89,-180,180),color:'rgba(106,176,243,.15)',label:'Polar vortex · schematic location, NOT live strength',outline:'#89bded'});
    return out;
  }
  function arcs(){
    var a=[];
    if(enabled.nao)a.push({startLat:38,startLng:-29,endLat:64,endLng:-21,color:'#ecb957',name:'NAO pressure dipole (schematic)'});
    if(enabled.iod)a.push({startLat:-5,startLng:56,endLat:-5,endLng:98,color:'#3cc6b5',name:'IOD east–west sea temperature contrast (schematic)'});
    if(enabled.mjo){
      a.push({startLat:0,startLng:65,endLat:2,endLng:115,color:'#a48afb',name:'MJO eastward propagation (schematic)'});
      a.push({startLat:2,startLng:115,endLat:0,endLng:162,color:'#a48afb',name:'MJO continuation (schematic)'});
    }

    var live=root.MONOEarth&&root.MONOEarth.latest();
    if(enabled.storms && live && Array.isArray(live.storms))live.storms.forEach(function(q){
      if(!Number.isFinite(q.movementDir) || !Number.isFinite(q.lat) || !Number.isFinite(q.lon))return;
      var projected=projectStorm(q,6);
      if(projected){
        a.push({startLat:q.lat,startLng:q.lon,endLat:projected.lat,endLng:projected.lon,
          color:'#e0b65c',name:'NHC reported direction and speed: illustrative +6h straight-line extension (~'+Math.round(projected.km)+' km). NOT a forecast track'});
        return;
      }
      // Direction-only arrow when speed/freshness is insufficient: constant 2° is NOT a distance scale.
      var bearing=q.movementDir*Math.PI/180, radians=q.lat*Math.PI/180, delta=2*Math.PI/180;
      var endLat=Math.asin(Math.sin(radians)*Math.cos(delta)+Math.cos(radians)*Math.sin(delta)*Math.cos(bearing));
      var endLon=q.lon*Math.PI/180+Math.atan2(Math.sin(bearing)*Math.sin(delta)*Math.cos(radians),Math.cos(delta)-Math.sin(radians)*Math.sin(endLat));
      var d=180/Math.PI;
      a.push({startLat:q.lat,startLng:q.lon,endLat:endLat*d,endLng:((endLon*d+540)%360)-180,
        color:'#e0b65c',name:'NHC reported movement direction — visual arrow only, no speed/distance scale, NOT a forecast track'});
    });
    return a;
  }
  function marks(){
    var out=[],data=root.MONOEarth&&root.MONOEarth.latest();
    if(enabled.enso)centers.forEach(function(p){
      var region=root.MONOEarth&&root.MONOEarth.regionData('enso',p.id,'el');
      if(region)out.push({kind:'region',factor:'enso',id:p.id,lat:p.lat,lon:p.lon,symbol:'◈',text:region.name});
    });
    additionalRegions.filter(function(p){return enabled[p.factor];}).forEach(function(p){
      var region=root.MONOEarth&&root.MONOEarth.regionData(p.factor,p.id,'el');
      if(region)out.push({kind:'region',factor:p.factor,id:p.id,lat:p.lat,lon:p.lon,symbol:'◈',text:region.name});
    });
    if(enabled.nao||enabled.iod||enabled.mjo||enabled.polar)nodes.filter(function(p){return enabled[p.factor];}).forEach(function(p){
      out.push({kind:'node',factor:p.factor,id:p.id,lat:p.lat,lon:p.lon,symbol:p.symbol,text:p.name});
    });
    if(enabled.quakes && data && Array.isArray(data.earthquakes))data.earthquakes.filter(function(q){return Number.isFinite(q.lat)&&Number.isFinite(q.lon);}).slice(0,12).forEach(function(q){
      out.push({kind:'quake',id:q.id,lat:q.lat,lon:q.lon,symbol:'M'+q.mag.toFixed(1),text:q.place,record:q});
    });
    if(enabled.storms && data && Array.isArray(data.storms))data.storms.forEach(function(q){
      out.push({kind:'storm',id:q.id,lat:q.lat,lon:q.lon,symbol:'◉',text:q.name,record:q});
    });
    return out;
  }
  function select(m){choice=m?{kind:m.kind||'node',factor:m.factor||'enso',id:m.id||'',record:m.record||null}:null;return choice;}
  function selected(){return choice;}
  function detail(l){
    var t=lang(l),m=choice,r=getRONI();
    if(!m)return '<p>'+esc(t.note)+'</p>';
    if(m.kind==='quake'){
      var q=m.record;return '<div class="earth-drawer-kicker">'+t.observed+' · USGS</div><h3>M '+Number(q.mag).toFixed(1)+'</h3><p>'+esc(q.place)+'</p><div class="earth-inline-meta">'+new Date(q.time).toLocaleString(l==='en'?'en-GB':'el-GR')+' · '+(Number.isFinite(q.depth)?q.depth.toFixed(0)+' km':'')+'</div><a href="'+esc(q.url||'https://earthquake.usgs.gov/')+'" target="_blank" rel="noopener noreferrer">USGS ↗</a>';
    }
    if(m.kind==='storm'){
      var x=m.record;return '<div class="earth-drawer-kicker">'+t.observed+' · NOAA NHC</div><h3>'+esc(x.name)+'</h3><p>'+esc(x.classification)+' · '+(Number.isFinite(x.windKt)?x.windKt+' kt':'—')+'</p><p>'+(Number.isFinite(x.movementDir)?((l==='el'?'Δηλωμένη διεύθυνση κίνησης: ':'Reported motion direction: ')+x.movementDir+'° · '+(Number.isFinite(x.movementMph)?x.movementMph+' mph · ':'')+(l==='el'?'όχι πρόγνωση τροχιάς':'not a forecast track')):'')+'</p><div class="earth-inline-meta">'+(x.time?new Date(x.time).toLocaleString(l==='en'?'en-GB':'el-GR'):'—')+'</div><a href="https://www.nhc.noaa.gov/" target="_blank" rel="noopener noreferrer">'+t.forecast+' ↗</a>';
    }
    if(m.kind==='region'){
      var z=root.MONOEarth&&root.MONOEarth.regionData(m.factor,m.id,l),en=m.factor==='enso'&&r&&r.value<-.5?'la':'el';
      if(!z)return '<p>'+t.unavailable+'</p>';
      return '<div class="earth-drawer-kicker">'+t.region+' · '+esc(t.schematic)+'</div><h3>'+esc(z.name)+'</h3><p>'+esc(z[en])+'</p><div class="earth-inline-meta">'+esc(z.season)+' · '+esc(z.conf)+'</div><button type="button" class="earth-button" data-action="eOpenImpact" data-v="'+esc(m.factor+':'+m.id)+'">'+t.see+' ↗</button>';
    }
    if(m.factor==='enso'){
      return '<div class="earth-drawer-kicker">NOAA CPC / '+t.observed+'</div><h3>Niño 3.4</h3><p>'+ (r?((r.value>=0?'+':'')+r.value.toFixed(2)+' °C · RONI '+r.season+' '+r.year):t.unavailable)+'</p><p>'+t.note+'</p><a href="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/" target="_blank" rel="noopener noreferrer">NOAA RONI ↗</a>';
    }
    var lookup={nao:['Βόρειος Ατλαντικός','North Atlantic','https://www.cpc.ncep.noaa.gov/products/precip/CWlink/pna/nao.shtml'],iod:['Ινδικός Ωκεανός','Indian Ocean','https://www.bom.gov.au/climate/enso/'],mjo:['Τροπική ατμόσφαιρα','Tropical atmosphere','https://www.cpc.ncep.noaa.gov/products/precip/CWlink/MJO/mjo.shtml'],polar:['Αρκτική','Arctic','https://www.cpc.ncep.noaa.gov/products/stratosphere/strat-trop/']};
    var p=lookup[m.factor]||lookup.nao;
    return '<div class="earth-drawer-kicker">'+t.schematic+'</div><h3>'+esc(l==='en'?p[1]:p[0])+'</h3><p>'+t.note+'</p><p>'+t.unavailable+'</p><a href="'+p[2]+'" target="_blank" rel="noopener noreferrer">'+t.source+' ↗</a>';
  }
  function timeline(l){
    var t=lang(l),r=getRONI(), now=new Date().getUTCFullYear();
    return '<div class="earth-timeline-head"><strong>'+t.history+' · NOAA RONI</strong><span>'+ (r?(''+r.season+' '+r.year+' · '+(r.value>=0?'+':'')+r.value.toFixed(2)+' °C'):t.unavailable)+'</span></div>'+
      '<input id="eYearRange" type="range" min="1950" max="'+(now+1)+'" value="'+(year==null?now+1:year)+'" aria-label="'+t.history+'">'+
      '<div class="earth-timeline-ticks"><span>1950</span><span>1982</span><span>1997</span><span>2015</span><span>'+t.current+'</span></div>';
  }
  function toolbar(l){
    var t=lang(l), keys=['enso','quakes','storms','nao','iod','mjo','polar'];
    var badges=keys.map(function(k){
      var special=(k==='nao'||k==='iod'||k==='mjo'||k==='polar'),state=enabled[k]?'active':'';
      return '<button type="button" data-action="eLayer" data-v="'+k+'" aria-pressed="'+enabled[k]+'" class="earth-layer-chip '+state+'"><i style="background:'+palette[k]+'"></i><span>'+esc(t[k])+'</span><small>'+(special?'◇':'●')+'</small></button>';
    }).join('');
    return '<div class="earth-layer-head"><b>'+t.layers+'</b><span>● '+t.observed+' · ◇ '+t.schematic+'</span></div><div class="earth-layer-wrap">'+badges+'</div><div class="earth-hover-hint">'+(l==='en'?'Hover over a marker for scale and motion · tap to open details':'Πέρασε το ποντίκι πάνω από ένα σύμβολο για ένταση και πορεία · πάτησε για λεπτομέρειες')+'</div>';
  }
  function info(l){
    var t=lang(l),d=root.MONOEarth&&root.MONOEarth.latest(),r=getRONI(), ts=d&&d.checkedAt ? new Date(d.checkedAt).toLocaleString(l==='en'?'en-GB':'el-GR',{dateStyle:'short',timeStyle:'short'}) :'—';
    return '<div class="earth-drawer-top"><span class="earth-kicker">'+t.data+'</span><small>'+esc(ts)+'</small></div>'+
      '<div class="earth-drawer-content">'+detail(l)+'</div>'+
      '<div class="earth-drawer-foot"><p>'+t.note+'</p><a href="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/" target="_blank" rel="noopener noreferrer">NOAA CPC ↗</a> · <a href="https://earthquake.usgs.gov/" target="_blank" rel="noopener noreferrer">USGS ↗</a> · <a href="https://www.nhc.noaa.gov/" target="_blank" rel="noopener noreferrer">NHC ↗</a></div>';
  }
  function sync(g){
    if(!g)return;
    globeApi=g;
    if(typeof g.polygonsData==='function')g.polygonGeoJsonGeometry('geometry').polygonAltitude(.009).polygonCapColor(function(p){return p.color;}).polygonSideColor(function(){return 'rgba(0,0,0,.025)';}).polygonStrokeColor(function(p){return p.outline;}).polygonLabel(function(p){return esc(p.label);}).onPolygonClick(function(p){select({kind:'zone',id:p.id,factor:p.factor});refresh();}).polygonsData(polygons());
    if(typeof g.arcsData==='function')g.arcStartLat('startLat').arcStartLng('startLng').arcEndLat('endLat').arcEndLng('endLng').arcColor('color').arcAltitude(.09).arcDashLength(.28).arcDashGap(.17).arcDashAnimateTime(4000).arcStroke(.55).arcLabel(function(p){return esc(p.name);}).arcsData(arcs());
  }
  function refresh(){if(typeof root.MONOEarthGlobe.onRefresh==='function')root.MONOEarthGlobe.onRefresh();}
  function makeMarker(marker,l){
    var elt=document.createElement('button');elt.type='button';elt.className='earth-planet-pin earth-pin-'+marker.kind+' earth-pin-'+marker.factor;elt.textContent=marker.symbol;elt.title=marker.text+(marker.kind==='node'?' · '+lang(l).schematic:'');
    elt.setAttribute('aria-label',elt.title);elt.style.setProperty('--pin',palette[marker.kind==='quake'?'quakes':marker.kind==='storm'?'storms':marker.factor]||'#8ba1cf');
    elt.addEventListener('pointerenter',function(ev){if(ev.pointerType!=='touch')showHover(marker,l,ev,elt);});
    elt.addEventListener('pointermove',function(ev){if(ev.pointerType!=='touch'&&hoverTip&&hoverTip.classList.contains('visible'))positionHover(ev,elt);});
    elt.addEventListener('pointerleave',hideHover);
    elt.addEventListener('focus',function(){showHover(marker,l,null,elt);});
    elt.addEventListener('blur',hideHover);
    elt.onclick=function(ev){ev.stopPropagation();hideHover();select(marker);if(globeApi&&globeApi.pointOfView)globeApi.pointOfView({lat:marker.lat,lng:marker.lon,altitude:2.1},700);refresh();};return elt;
  }
  function embellish(l,html){
    return html.concat(marks().map(function(p){return {earth:true,c:{lat:p.lat,lon:p.lon},marker:p};}));
  }
  function openImpact(factor,id){if(root.MONOEarth&&root.MONOEarth.openRegion)root.MONOEarth.openRegion(factor,id); }
  function focus(lat,lon){if(globeApi&&globeApi.pointOfView)globeApi.pointOfView({lat:lat,lng:lon,altitude:2.1},950);}
  root.MONOEarthGlobe={enabled:enabled,toggle:toggle,isActive:isActive,select:select,selected:selected,setYear:setYear,getRONI:getRONI,polygons:polygons,arcs:arcs,marks:marks,toolbar:toolbar,timeline:timeline,detail:detail,info:info,sync:sync,embellish:embellish,makeMarker:makeMarker,openImpact:openImpact,focus:focus,onRefresh:null};
})(window);
