/* MONO station-network v1: observations only, never extrapolated forecasts.
 * Sources: openSenseMap public-domain data + NOAA METAR + WMO SYNOP +
 * Netatmo when user-provided access is configured. Each observation retains
 * its own timestamp and original measurement period. */
(function(root){
'use strict';
const fin=Number.isFinite,hour=3600000;
const distance=(a,b)=>{const q=Math.PI/180,dlat=(b.lat-a.lat)*q,dlon=(b.lon-a.lon)*q;
 const v=Math.sin(dlat/2)**2+Math.cos(a.lat*q)*Math.cos(b.lat*q)*Math.sin(dlon/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(v)))};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={el:{all:'Όλα',temp:'Θερμοκρασία',humidity:'Υγρασία',rain:'Βροχή',wind:'Άνεμος',cloud:'Νέφωση',pressure:'Πίεση',solar:'Ήλιος / UV'},
 en:{all:'All',temp:'Temperature',humidity:'Humidity',rain:'Rain',wind:'Wind',cloud:'Cloud',pressure:'Pressure',solar:'Sun / UV'}};
const options=['all','rain','wind','temp','humidity','cloud','pressure','solar'];
const valid=(v,lo,hi)=>fin(v)&&v>=lo&&v<=hi;
const nearAge=(t,now,maxHours=3)=>fin(t)&&t<=now+300000&&now-t<=maxHours*hour;
function metric(v,t,unit,kind,period){
 return {v,t,unit,kind:kind||'direct',period:period||null};
}
function deduce(s){
 const title=String(s.title||'').toLowerCase();
 const unit=String(s.unit||'').trim().toLowerCase().replace(/\s+/g,'');
 const raw=Number(s.lastMeasurement?.value),t=Date.parse(s.lastMeasurement?.createdAt||'');
 if(s.lastMeasurement?.value==null||String(s.lastMeasurement.value).trim()===''||!fin(t)||!fin(raw))return null;
 let key=null,value=raw,u='',period=null;
 if(/cloud\s*cover|cloudiness|bewölk|νεφω|νέφω/.test(title)&&unit==='%'&&valid(raw,0,100)){
  key='cloud';u='%';
 }else if(/temperature|temperatur|θερμοκρασ/.test(title)&&!/(heatindex|soil|ground|boden|surface|water|dew|punkt|έδαφ|νερ)/.test(title)){
  if(/°?c|celsius/.test(unit)&&valid(raw,-60,65)){key='temp';u='°C';}
  else if(/°?f|fahrenheit/.test(unit)&&valid(raw,-76,149)){key='temp';value=(raw-32)*5/9;u='°C';}
 }else if(/humidity|feucht|υγρασ/.test(title)&&unit==='%'&&valid(raw,0,100)){
  key='humidity';u='%';
 }else if(/pressure|luftdruck|atm.*πίεσ|βαρομετρ/.test(title)){
  if(/hpa|mbar/.test(unit)&&valid(raw,850,1100)){key='pressure';u='hPa';}
  else if(unit==='pa'&&valid(raw,85000,110000)){key='pressure';value=raw/100;u='hPa';}
 }else if(/wind.*gust|gust.*wind|windbö|ριπ/.test(title)){
  key='gust';
 }else if(/wind.*dir|direction.*wind|windrichtung|διεύθ.*ανέμ/.test(title)){
  if(/°|deg|grad/.test(unit)&&valid(raw,0,360)){key='direction';u='°';}
 }else if(/wind|anemo|άνεμ|ταχύτητα ανέμ/.test(title)&&!/(direction|richtung|gust|ριπ)/.test(title)){
  key='wind';
 }else if(/rain|precip|niederschlag|regen|βροχ|υετ/.test(title)){
  const rate=/mm\/h|mm\/hr|mmh-1|l\/m(?:²|2)\/h/.test(unit);
  const amount=/^mm$|^l\/m(?:²|2)$|^mm\/(?:24h|day)$/.test(unit);
  if((rate||amount)&&valid(raw,0,rate?300:500)){
    key=rate?'rainrate':'rain';u=rate?'mm/h':'mm';
    period=rate?'rate':/24\s*h|24\s*hour|24\s*stund/.test(title+' '+unit)?'24h':
      /today|heute|tages|daily|ημερ|σήμερ/.test(title)?'today':
      /month|monat|μήν/.test(title)?'month':/hour|stund|ωρια/.test(title)?'hour':'unknown';
  }
 }else if(/solar|radiation|strahlung|ηλιακ/.test(title)&&/w\/m(?:²|2)/.test(unit)&&valid(raw,0,1500)){
  key='solar';u='W/m²';
 }else if(/uv.*index|uv.index|δείκτης.*uv/.test(title)&&valid(raw,0,16)){
  key='uv';u='UV';
 }
 if(key==='wind'||key==='gust'){
  if(/km\/h|kmh|kph/.test(unit)){value=raw;}
  else if(/m\/s|ms-1/.test(unit)){value=raw*3.6;}
  else if(/kn|kt|knot/.test(unit)){value=raw*1.852;}
  else if(/mph/.test(unit)){value=raw*1.609344;}
  else return null;
  if(!valid(value,0,300))return null;
  u='km/h';
 }
 return key?{key,value:metric(value,t,u,'direct',period)}:null;
}
function fromOpenSenseMap(boxes,point,now=Date.now(),radiusKm=45){
 if(!Array.isArray(boxes)||!fin(point?.lat)||!fin(point?.lon))return [];
 const result=[];
 for(const b of boxes){
  const [lon,lat]=b?.currentLocation?.coordinates||[];
  if(!fin(lon)||!fin(lat)||b.exposure==='indoor'||b.exposure==='mobile')continue;
  const dist=distance(point,{lat,lon});if(dist>radiusKm)continue;
  const vals={};let freshest=null;
  for(const sensor of b.sensors||[]){
   const o=deduce(sensor);
   if(!o||!nearAge(o.value.t,now,2))continue;
   if(!vals[o.key]||vals[o.key].t<o.value.t) vals[o.key]=o.value;
   freshest=Math.max(freshest??0,o.value.t);
  }
  if(!Object.keys(vals).length)continue;
  const id=/^[0-9a-f]{24}$/i.test(b._id||'')?b._id:null;
  result.push({id:id?'sense:'+id:'sense:'+lat+':'+lon,name:String(b.name||'openSenseMap').slice(0,100),
   src:'openSenseMap',lat,lon,dist,at:freshest,metrics:vals,link:id?'https://opensensemap.org/explore/'+id:null});
 }
 return result;
}
function fromOfficial(stations,point,now=Date.now()){
 const out=[];
 for(const s of stations||[]){
  if(!fin(s.lat)||!fin(s.lon)||!Array.isArray(s.list))continue;
  const o=[...s.list].reverse().find(r=>nearAge(r.t,now,3));
  if(!o)continue;
  const v={},t=o.t;
  const add=(key,x,unit,lo,hi,kind)=>{if(valid(x,lo,hi))v[key]=metric(x,t,unit,kind||'direct')};
  add('temp',o.temp,'°C',-60,65);
  add('wind',o.wspd,'km/h',0,300);
  add('gust',o.wgst,'km/h',0,300);
  add('direction',o.wdir,'°',0,360);
  add('pressure',o.pres,'hPa',850,1100);
  add('humidity',o.rh,'%',0,100);
  if(!v.humidity&&fin(o.dewp)&&fin(o.temp)&&o.temp>=-60&&o.dewp<=o.temp+2){
   const rh=100*Math.exp((17.625*o.dewp)/(243.04+o.dewp)-(17.625*o.temp)/(243.04+o.temp));
   add('humidity',rh,'%',0,100,'derived-from-dewpoint');
  }
  if(valid(o.cloud,0,100))v.cloud=metric(o.cloud,t,'%',s.src==='metar'?'METAR-cloud-code':'SYNOP-oktas');
  // A present-weather code is a spot observation, NOT a rain gauge.
  const wx=(o.wx||[]).map(String);
  if(wx.some(w=>/(?:RA|DZ|TS|SN|SH)/.test(w)))v.weather=metric(1,t,'','present-weather');
  const report=[...(s.list||[]),...(s.rainReports||[])].filter(r=>
   valid(r.prcp,0,500)&&valid(r.prcpH,1,24)&&nearAge(r.t,now,24)).sort((x,y)=>y.t-x.t)[0];
  if(report){
   v.rain=metric(report.prcp,report.t,'mm','direct',String(report.prcpH)+'h');
  }
  const dist=distance(point,s);
  if(Object.keys(v).length)out.push({id:(s.src||'metar')+':'+s.id,name:s.name||s.id,
   src:s.src==='synop'?'WMO SYNOP':'NOAA METAR',lat:s.lat,lon:s.lon,dist,at:t,metrics:v});
 }
 return out;
}
function fromNetatmo(data,point,now=Date.now()){
 const rows=[];
 for(const s of data?.stations||[]){
  if(!nearAge(s.t,now,2)||!fin(s.lat)||!fin(s.lon))continue;
  const v={};const a=(k,x,unit,low,high,period)=>{if(valid(x,low,high))v[k]=metric(x,s.t,unit,'direct',period)};
  a('temp',s.temp,'°C',-60,65);a('humidity',s.rh,'%',0,100);
  a('pressure',s.pres,'hPa',850,1100);
  a('wind',s.wspd,'km/h',0,300);a('gust',s.wgst,'km/h',0,300);
  a('direction',s.wdir,'°',0,360);
  a('rain',s.rain24h,'mm',0,500,'24h');a('rain1h',s.rain1h,'mm',0,200,'1h');
  if(Object.keys(v).length)rows.push({id:'netatmo:'+s.id,name:'Netatmo '+(s.id||''),src:'Netatmo',
   lat:s.lat,lon:s.lon,dist:distance(point,s),at:s.t,metrics:v});
 }
 return rows;
}
function combine({boxes,stations,pws,point,now=Date.now(),radiusKm=45}={}){
 if(!point)return [];
 const r=[...fromOpenSenseMap(boxes,point,now,radiusKm),...fromOfficial(stations,point,now),...fromNetatmo(pws,point,now)];
 return r.filter(x=>x.dist<=radiusKm&&Object.keys(x.metrics).length).sort((a,b)=>a.dist-b.dist||a.name.localeCompare(b.name));
}
const groupOf=k=>k==='rain'||k==='rainrate'||k==='rain1h'||k==='weather'?'rain':k==='wind'||k==='gust'||k==='direction'?'wind':
 k==='solar'||k==='uv'?'solar':k;
function hasMetric(row,filter){return filter==='all'||Object.keys(row.metrics).some(k=>groupOf(k)===filter);}
function render({rows=[],filter='all',limit=35,lang='el',radius=45,zone=null}={}){
 const el=lang==='el',tr=names[el?'el':'en'];
 if(!options.includes(filter))filter='all';
 const filtered=rows.filter(x=>hasMetric(x,filter));
 const printed=filtered.slice(0,Math.max(1,Math.min(300,limit)));
 const fmt=(v,d=1)=>v.toLocaleString(el?'el-GR':'en-GB',{maximumFractionDigits:d});
 const labels=el?{temp:'Θερμ.',humidity:'Υγρασία',wind:'Άνεμος',gust:'Ριπές',direction:'Διεύθ.',
  rain:'Βροχή',rainrate:'Ένταση',rain1h:'Βροχή 1h',pressure:'Πίεση',cloud:'Νέφωση',solar:'Ακτινοβ.',uv:'UV',weather:'Φαινόμενο'}:
 {temp:'Temp.',humidity:'Humidity',wind:'Wind',gust:'Gusts',direction:'Direction',rain:'Rain',rainrate:'Rain rate',rain1h:'Rain 1h',pressure:'Pressure',
 cloud:'Cloud cover',solar:'Radiation',uv:'UV',weather:'Weather'};
 const kindLabel={cloud:'',};
 const metadata=(m,key)=>{
  if(m.kind==='METAR-cloud-code')return el?'Προσεγγιστικό ποσοστό από κώδικα METAR':'Approximate value from METAR cloud category';
  if(m.kind==='SYNOP-oktas')return el?'Εκτίμηση από όγδοα νεφών SYNOP':'Estimated from SYNOP oktas';
  if(m.kind==='derived-from-dewpoint')return el?'Υπολογισμός από θερμοκρασία και σημείο δρόσου':'Calculated from temperature and dew point';
  if(key==='rain'&&m.period==='unknown')return el?'Άγνωστη περίοδος: όχι ημερήσιο σύνολο':'Unknown period: not a daily total';
  if(key==='rain'&&m.period)return (el?'Περίοδος: ':'Period: ')+m.period;
  if(key==='rainrate')return el?'Ένταση, όχι συνολική ποσότητα':'Rate, not total';
  return '';
 };
 const line=(key,m)=>{
  const note=metadata(m,key);
  const val=key==='weather'?(el?'Αναφέρθηκε υετός':'Precipitation reported'):fmt(m.v,key==='direction'?0:1)+' '+m.unit;
  return '<div class="sn-metric"><span>'+safe(labels[key]||key)+'</span><b>'+safe(val)+'</b>'+
   (note?'<small>'+safe(note)+'</small>':'')+'</div>';
 };
 const cards=printed.map(r=>{
  const vals=Object.entries(r.metrics).filter(([k])=>filter==='all'||groupOf(k)===filter);
  const date=new Date(r.at).toLocaleTimeString(el?'el-GR':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:zone||undefined});
  const link=r.link?'<a class="sn-source" href="'+safe(r.link)+'" target="_blank" rel="noopener noreferrer">'+
   (el?'Πρωτότυπος σταθμός ↗':'Original station ↗')+'</a>':'';
  return '<article class="sn-station"><div class="sn-stationhead"><div class="sn-stationname"><strong>'+
   safe(r.name)+'</strong><span>'+safe(r.src)+' · '+fmt(r.dist)+' km · '+
   (el?'Μέτρηση ':'Measured ')+safe(date)+'</span></div>'+link+'</div>'+
   '<div class="sn-metrics">'+vals.map(([k,v])=>line(k,v)).join('')+'</div></article>';
 }).join('');
 const chips=options.map(k=>{
  const count=rows.filter(r=>hasMetric(r,k)).length;
  return '<button type="button" class="sn-filter '+(filter===k?'active':'')+'" data-action="stationNetworkFilter" data-v="'+
   k+'" aria-pressed="'+(filter===k?'true':'false')+'">'+
   safe(tr[k])+' <small>'+count+'</small></button>';
 }).join('');
 const sources=[...new Set(rows.map(x=>x.src))].join(' · ');
 return '<section class="section card sn-network" aria-label="'+(el?'Δίκτυο πραγματικών σταθμών':'Real station network')+'">'+
 '<div class="sn-title"><div><span class="sn-eyebrow">MONO / OBSERVATION NETWORK</span><h2>'+
 (el?'Όλοι οι διαθέσιμοι κοντινοί σταθμοί':'All available nearby stations')+'</h2><p>'+
 (el?'Μετρήσεις από δημόσιες πηγές, όχι πρόγνωση · έως ':'Public observations, not forecasts · within ')+radius+' km</p>'+
 '</div><span class="sn-total">'+rows.length+' <small>'+(el?'σταθμοί':'stations')+'</small></span></div>'+
 '<div class="sn-filters" role="group" aria-label="'+(el?'Φίλτρο παραμέτρου':'Metric filter')+'">'+chips+'</div>'+
 '<div class="sn-summary">'+(el?'Εμφανίζονται ':'Showing ')+printed.length+' / '+filtered.length+
 ' · '+safe(sources||'—')+'</div>'+
 (cards?'<div class="sn-grid">'+cards+'</div>':'<p class="notice">'+
 (el?'Δεν υπάρχει πρόσφατη μέτρηση για αυτό το φίλτρο. Το «χωρίς δεδομένα» δεν σημαίνει μηδέν.':
 'No recent measurement for this filter. Missing data does not mean zero.')+'</p>')+
 (filtered.length>printed.length?'<button type="button" class="sn-more" data-action="stationNetworkMore">'+
 (el?'Δες περισσότερους σταθμούς':'Show more stations')+' ('+(filtered.length-printed.length)+')</button>':'')+
 '<p class="sn-note">'+(el?'Δεν παρέχουν όλοι οι σταθμοί όλες τις μετρήσεις. «Νέφωση» από METAR/SYNOP σημαίνει εκτίμηση από κωδικοποιημένη παρατήρηση. Η εμφάνιση βροχής ως φαινόμενο δεν συνεπάγεται γνωστή ποσότητα mm. Οι μετρήσεις OpenSenseMap προέρχονται από αισθητήρες κοινότητας και δεν έχουν την ίδια πιστοποίηση με τους επίσημους σταθμούς.':
 'Not every station measures every variable. Cloud coverage from METAR/SYNOP is an estimate based on coded observations. Present-weather rain does not imply a known mm total. OpenSenseMap uses citizen sensors without uniform official certification.')+
 '</p></section>';
}
root.MONOStationNetwork={combine,render,deduce,fromOpenSenseMap,fromOfficial,hasMetric};
if(typeof module!=='undefined'&&module.exports)module.exports={combine,render,deduce,fromOpenSenseMap,fromOfficial,hasMetric};
})(typeof window!=='undefined'?window:globalThis);
