/* MONO / FUTURE PHENOMENA — actual precipitation forecasts, not radar extrapolation.
 * City pins identify forecast rainfall / snowfall / thunderstorms only; no cloud icons.
 * Open-Meteo model-grid values refer to each city's forecast cell, not station measurements. */
(function(root){
'use strict';
const finite=Number.isFinite;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const extraGR=[
 ['Κατερίνη','Katerini',40.271,22.504,2],['Σέρρες','Serres',41.086,23.548,2],
 ['Δράμα','Drama',41.150,24.147,2],['Ξάνθη','Xanthi',41.135,24.887,2],
 ['Κομοτηνή','Komotini',41.120,25.406,2],['Κοζάνη','Kozani',40.301,21.788,2],
 ['Έδεσσα','Edessa',40.802,22.047,3],['Κιλκίς','Kilkis',40.993,22.878,3],
 ['Τρίκαλα','Trikala',39.556,21.768,2],['Καρδίτσα','Karditsa',39.364,21.921,2],
 ['Λαμία','Lamia',38.900,22.434,2],['Χαλκίδα','Chalkida',38.463,23.593,2],
 ['Αγρίνιο','Agrinio',38.621,21.407,2],['Κόρινθος','Corinth',37.937,22.931,2],
 ['Καλαμάτα','Kalamata',37.038,22.114,2],['Τρίπολη','Tripoli',37.509,22.381,2],
 ['Πύργος','Pyrgos',37.675,21.441,3],['Σπάρτη','Sparta',37.074,22.430,3],
 ['Ρέθυμνο','Rethymno',35.367,24.473,2],['Άγιος Νικόλαος','Agios Nikolaos',35.192,25.713,3],
 ['Μυτιλήνη','Mytilene',39.107,26.555,2],['Χίος','Chios',38.371,26.136,2],
 ['Σάμος','Samos',37.756,26.975,3],['Κως','Kos',36.893,27.290,2]
];
const majorGR=new Set(['Thessaloniki','Athens','Patras','Heraklion','Larissa','Volos','Ioannina','Chania','Kavala','Rhodes','Alexandroupoli','Corfu']);
function haversine(a,b){const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r,h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 12742*Math.asin(Math.sqrt(h));}
function pointsFor(city,catalogue=[]){
 if(!city||!finite(+city.lat)||!finite(+city.lon))return [];
 const greece=city.cc==='GR'||(+city.lat>=34.4&&+city.lat<=41.8&&+city.lon>=19&&+city.lon<=29.7);
 const base=greece?[
  ...catalogue.filter(c=>c.cc==='GR').map(c=>({name:c.nameEl||c.name,nameEn:c.name,lat:c.lat,lon:c.lon,rank:majorGR.has(c.name)?1:2})),
  ...extraGR.map(([name,nameEn,lat,lon,rank])=>({name,nameEn,lat,lon,rank}))
 ]:catalogue.filter(c=>haversine(city,c)<1900).map(c=>({name:c.nameEl||c.name,nameEn:c.name,lat:c.lat,lon:c.lon,rank:1}));
 const selected={name:city.nameEl||city.name,nameEn:city.name,lat:+city.lat,lon:+city.lon,rank:0,selected:true};
 const out=[selected];
 for(const p of base){
  if(!finite(+p.lat)||!finite(+p.lon)||out.some(x=>haversine(x,p)<6))continue;
  out.push({...p,selected:false});
 }
 // Non-Greek: prioritize nearest major cities in view, not unrelated world landmarks.
 return greece?out:out.sort((a,b)=>a.selected?-1:b.selected?1:haversine(city,a)-haversine(city,b)).slice(0,24);
}
function kind(row){
 const code=Number(row?.weatherCode),mm=Number(row?.precip),snow=Number(row?.snow),prob=Number(row?.prob);
 const p=finite(prob)?Math.max(0,Math.min(100,prob)):null;
 if(!finite(code)&&!finite(mm)&&!finite(snow))return {id:'unknown',icon:'',labelEl:'Χωρίς δεδομένα',labelEn:'Unavailable',level:0};
 if((code>=95&&code<=99)||(code===82&&finite(mm)&&mm>=6))return {id:'storm',icon:'⛈️',labelEl:'Καταιγίδα',labelEn:'Thunderstorm',level:4};
 if((finite(snow)&&snow>=1.5)||code===75||code===86)return {id:'heavySnow',icon:'🌨️',labelEl:'Έντονο χιόνι',labelEn:'Heavy snow',level:3};
 if((finite(snow)&&snow>=0.15)||[71,73,77,85].includes(code))return {id:'snow',icon:'❄️',labelEl:'Χιόνι',labelEn:'Snow',level:2};
 if((finite(mm)&&mm>=7)||code===65||code===67||code===82)return {id:'heavyRain',icon:'🌧️',labelEl:'Έντονη βροχή',labelEn:'Heavy rain',level:3};
 if((finite(mm)&&mm>=2)||code===63||code===81)return {id:'rain',icon:'🌧️',labelEl:'Βροχή',labelEn:'Rain',level:2};
 if((finite(mm)&&mm>=0.15)||[51,53,55,56,57,61,66,80].includes(code))return {id:'lightRain',icon:'🌦️',labelEl:'Ασθενής βροχή',labelEn:'Light rain',level:1};
 return {id:'dry',icon:'',labelEl:'Χωρίς αξιόλογο υετό',labelEn:'No significant precipitation',level:0};
}
function normalize(response,points){
 const rows=Array.isArray(response)?response:[response];
 return points.map((point,i)=>{
  const h=rows[i]?.hourly||{},raw=Array.isArray(h.time)?h.time:[];
  const times=raw.map(v=>finite(v)?v*1000:Date.parse(v)).filter(finite);
  const keys=['precipitation','snowfall','weather_code','precipitation_probability'];
  const complete=keys.every(k=>Array.isArray(h[k])&&h[k].length>=times.length);
  return {...point,times:complete?times:[],hourly:complete?{
    precip:h.precipitation,snow:h.snowfall,code:h.weather_code,prob:h.precipitation_probability
  }:null};
 });
}
function timeline(data,now=Date.now()){
 const xs=data?.find(p=>p.times?.length)?.times||[];
 return xs.filter(t=>t>=now-30*60e3&&t<=now+49*3600e3).slice(0,49);
}
function at(point,time){
 if(!point?.hourly||!point.times?.length||!finite(time))return null;
 const i=point.times.findIndex(x=>Math.abs(x-time)<=31*60000);
 if(i<0)return null;
 const h=point.hourly;
 const val=(a)=>a?.[i]===null||a?.[i]===undefined?null:+a[i];
 return {precip:val(h.precip),snow:val(h.snow),weatherCode:val(h.code),prob:val(h.prob)};
}
function eligible(point,zoom){return point.selected||point.rank<= (zoom>=9?3:zoom>=7.5?2:1);}
function pin(point,row,lang='el'){
 const wet=kind(row),label=escape(lang==='en'?(point.nameEn||point.name):point.name);
 return '<div class="pm-pin '+(point.selected?'pm-selected ':'')+'pm-'+wet.id+'">'+
   (wet.icon?'<span class="pm-symbol" aria-hidden="true">'+wet.icon+'</span>':'<span class="pm-dot" aria-hidden="true"></span>')+
   '<span class="pm-label">'+label+'</span></div>';
}
function popup(point,row,t,lang='el'){
 const el=lang!=='en',f=n=>finite(n)?Number(n).toLocaleString(el?'el-GR':'en-GB',{maximumFractionDigits:1}):'—';
 const desc=kind(row),h=finite(t)?new Date(t).toLocaleString(el?'el-GR':'en-GB',{weekday:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC':'—';
 return '<div class="pm-popup"><strong>'+escape(el?point.name:point.nameEn)+'</strong><p>'+escape(el?desc.labelEl:desc.labelEn)+'</p>'+
  '<dl><div><dt>'+ (el?'Υετός':'Precipitation') +'</dt><dd>'+f(row?.precip)+' mm/h</dd></div>'+
  '<div><dt>'+(el?'Χιόνι':'Snow')+'</dt><dd>'+f(row?.snow)+' cm/h</dd></div>'+
  '<div><dt>'+(el?'Πιθανότητα':'Chance')+'</dt><dd>'+f(row?.prob)+'%</dd></div></dl>'+
  '<small>'+h+' · '+(el?'Πρόγνωση Open-Meteo · όχι μέτρηση ραντάρ':'Open-Meteo forecast · not a radar reading')+'</small></div>';
}
root.MONOPhenomenaMap={pointsFor,kind,normalize,timeline,at,eligible,pin,popup};
if(typeof module!=='undefined'&&module.exports)module.exports={pointsFor,kind,normalize,timeline,at,eligible,pin,popup};
})(typeof window!=='undefined'?window:globalThis);
