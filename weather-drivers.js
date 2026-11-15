/* MONO / Weather Drivers: evidence-linked model diagnostics, never causal attribution. */
(function(root){
'use strict';
const fin=Number.isFinite,H=3600000;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,lang,d=1)=>fin(v)?new Intl.NumberFormat(lang==='en'?'en-GB':'el-GR',{maximumFractionDigits:d}).format(v):'—';
function join(view,atmosphere){
 const main=Array.isArray(view?.rows)?view.rows:[];
 const src=atmosphere?.hourly;
 if(!Array.isArray(src?.time))return [];
 const byTime=new Map();
 src.time.forEach((t,i)=>{
  if(!fin(t)||byTime.has(t*1000))return;
  const get=k=>fin(src[k]?.[i])?src[k][i]:null;
  const levels=[get('wind_speed_300hPa'),get('wind_speed_250hPa'),get('wind_speed_200hPa')].filter(fin);
  byTime.set(t*1000,{
   t:t*1000,jet300:get('wind_speed_300hPa'),jetCore:levels.length?Math.max(...levels):null,
   t850:get('temperature_850hPa'),t500:get('temperature_500hPa'),
   wind850:get('wind_speed_850hPa'),cloudLow:get('cloud_cover_low'),
   cloudHigh:get('cloud_cover_high'),cloudMid:get('cloud_cover_mid'),
   upperSource:'GFS'
  });
 });
 const validTimes=new Set(),out=[];
 for(const r of main){
  if(!fin(r?.t)||validTimes.has(r.t))continue;
  validTimes.add(r.t);
  const a=byTime.get(r.t);if(!a)continue; // match timestamps, not array positions
  out.push({...a,
   temp:fin(r.temp)?r.temp:null,
   cloud:fin(r.cloud)?r.cloud:null,
   pressure:fin(r.pres)?r.pres:null,
   amount:fin(r.amount)&&r.amount>=0?r.amount:null,
   isDay:r.isDay===true||r.isDay===1,
   wind:fin(r.wind)?r.wind:null
  });
 }
 return out.sort((a,b)=>a.t-b.t);
}
function diagnostics(view,atmosphere,now=Date.now()){
 const data=join(view,atmosphere);
 // Strictly use a complete current forecast hour; no arbitrary nearest-neighbour join.
 const start=data.find(r=>r.t<=now&&now<r.t+H)||
   data.find(r=>r.t>now&&r.t<=now+H)||null;
 if(!start)return {status:'no-overlap',data,periods:[]};
 const targets=[6,24,48],periods=[];
 for(const h of targets){
  const end=data.find(r=>r.t===start.t+h*H);
  if(!end||!fin(start.temp)||!fin(end.temp))continue;
  const diff=k=>fin(start[k])&&fin(end[k])?end[k]-start[k]:null;
  periods.push({hours:h,from:start.t,to:end.t,
   temperature:diff('temp'),cloud:diff('cloud'),cloudLow:diff('cloudLow'),
   pressure:diff('pressure'),t850:diff('t850'),
   jetCore:diff('jetCore'),jetNow:start.jetCore,jetLater:end.jetCore,
   wind850:diff('wind850'),rain:fin(end.amount)?end.amount:null,
   daytime:end.isDay});
 }
 return {status:periods.length?'ready':'insufficient',data,periods};
}
function indicators(p,{lang='el'}={}){
 const el=lang!=='en',X=(gr,en)=>el?gr:en,items=[];
 const add=(title,desc,proof)=>items.push({title,desc,proof});
 if(fin(p.temperature)){
  const sign=p.temperature<=-1.5?-1:p.temperature>=1.5?1:0;
  add(sign<0?X('Προβλεπόμενη ψύχρανση','Forecast cooling'):sign>0?X('Προβλεπόμενη θέρμανση','Forecast warming'):X('Μικρή μεταβολή θερμοκρασίας','Minor temperature change'),
   X('Μεταβολή θερμοκρασίας επιφάνειας','Surface temperature change')+' '+(p.temperature>0?'+':'')+num(p.temperature,lang)+'°C',
   'MONO · '+p.hours+' h');
 }
 if(fin(p.t850)&&Math.abs(p.t850)>=2){
  add(X('Μεταβολή της αέριας μάζας στα 850 hPa','850 hPa air-mass signal'),
   (p.t850<0?X('Ψυχρότερη','Cooler'):X('Θερμότερη','Warmer'))+' '+X('προβλεπόμενη αέρια μάζα σε ύψος περίπου 1,5 km. Πιθανός συνοδός παράγοντας, όχι απόδειξη μεταφοράς.','air aloft near 1.5 km. A possible accompanying factor, not proof of advection.'),
   'GFS · ΔT850 '+(p.t850>0?'+':'')+num(p.t850,lang)+'°C');
 }
 if(fin(p.cloud)&&Math.abs(p.cloud)>=20){
  add(X('Αλλαγή νεφοκάλυψης','Cloud-cover change'),
   p.cloud>0?X('Περισσότερα νέφη συμπίπτουν χρονικά με την εξέλιξη της θερμοκρασίας. Εφόσον είναι ημέρα, μπορεί να περιορίσουν την ηλιακή θέρμανση.','Increasing clouds coincide with the temperature evolution. During daylight they may limit solar heating.'):
   X('Λιγότερα νέφη συμπίπτουν χρονικά με τη μεταβολή. Η ακριβής επίδραση στη θερμοκρασία δεν προκύπτει μόνη της.','Decreasing clouds coincide with the temperature change, but cannot by themselves explain it.'),
   'MONO · Δcloud '+(p.cloud>0?'+':'')+num(p.cloud,lang,0)+' pp');
 }
 if(fin(p.pressure)&&Math.abs(p.pressure)>=2){
  add(X('Μεταβολή πίεσης','Pressure evolution'),
   p.pressure<0?X('Πτώση της προβλεπόμενης πίεσης: ένδειξη αλλαγής του βαρομετρικού πεδίου, όχι αυτομάτως ψυχρό μέτωπο.','Forecast pressure falls, suggesting synoptic change, not necessarily a cold front.'):
   X('Άνοδος της προβλεπόμενης πίεσης: αλλαγή του βαρομετρικού πεδίου, χωρίς ασφαλές συμπέρασμα για μέτωπο.','Forecast pressure rises, without establishing a frontal passage.'),
   'MONO · ΔMSLP '+(p.pressure>0?'+':'')+num(p.pressure,lang)+' hPa');
 }
 if(fin(p.jetLater)&&(p.jetLater>=120||(fin(p.jetCore)&&Math.abs(p.jetCore)>=25))){
  add(X('Ροή αεροχειμάρρου σε μεγάλο ύψος','Upper-level jet-stream signal'),
   X('Η ταχύτητα του μοντέλου στα 300–200 hPa είναι '+num(p.jetLater,lang,0)+' km/h. Η ανώτερη κυκλοφορία μπορεί να συνοδεύει αλλαγές συστημάτων, αλλά δεν αποδεικνύει την αιτία της τοπικής μεταβολής.','The modelled 300–200 hPa wind reaches '+num(p.jetLater,lang,0)+' km/h. Upper circulation can accompany systems, but does not establish the cause of local change.'),
   'GFS · '+(fin(p.jetCore)?'Δjet '+(p.jetCore>0?'+':'')+num(p.jetCore,lang,0)+' km/h':'jet 300–200 hPa'));
 }
 if(fin(p.rain)&&p.rain>=0.5){
  add(X('Προβλεπόμενος υετός','Forecast precipitation'),
   X('Υετός '+num(p.rain,lang,1)+' mm στην ώρα λήξης του διαστήματος. Δεν ταυτοποιεί μόνος του το αίτιο.','Precipitation '+num(p.rain,lang,1)+' mm in the target hour; this alone does not identify a cause.'),
   'MONO · hourly');
 }
 return items;
}
function render({view,atmosphere,lang='el',now=Date.now(),zone='UTC'}={}){
 const el=lang!=='en',X=(a,b)=>el?a:b,d=diagnostics(view,atmosphere,now);
 const shell=inner=>'<section class="section card wd-root" id="mono-weather-drivers"><div class="wd-head"><span>MONO / WEATHER DRIVERS</span><h2>'+X('Γιατί αλλάζει ο καιρός;','Why is the weather changing?')+'</h2><p>'+X('Ενδείξεις από την εξέλιξη της πρόγνωσης — όχι αυτόματη απόδοση αιτίας.','Evidence from forecast evolution, not automatic causal attribution.')+'</p></div>'+inner+'</section>';
 if(d.status!=='ready')return shell('<p class="wd-empty">'+X('Δεν υπάρχουν ακόμη αρκετά χρονικά ευθυγραμμισμένα στοιχεία ανώτερης ατμόσφαιρας και επιφάνειας.','Not enough timestamp-aligned upper-air and surface forecast fields yet.')+'</p>');
 const clock=t=>{try{return new Date(t).toLocaleString(el?'el-GR':'en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:zone});}catch{return new Date(t).toISOString().slice(0,16)+' UTC';}};
 const sections=d.periods.map(p=>{
  const findings=indicators(p,{lang});
  const emphasis=findings.slice(0,4).map(f=>'<div class="wd-signal"><b>'+safe(f.title)+'</b><p>'+safe(f.desc)+'</p><small>'+safe(f.proof)+'</small></div>').join('');
  return '<div class="wd-window"><div class="wd-period"><strong>'+(p.hours===6?X('Επόμενο 6ωρο','Next 6 hours'):p.hours===24?X('Επόμενο 24ωρο','Next 24 hours'):X('Επόμενο 48ωρο','Next 48 hours'))+'</strong><small>'+safe(clock(p.from))+' → '+safe(clock(p.to))+'</small></div>'+
   '<div class="wd-signals">'+emphasis+'</div>'+(findings.length>4?'<details class="wd-more"><summary>'+X('Περισσότερες ενδείξεις','More signals')+'</summary>'+findings.slice(4).map(f=>'<div class="wd-signal"><b>'+safe(f.title)+'</b><p>'+safe(f.desc)+'</p><small>'+safe(f.proof)+'</small></div>').join('')+'</details>':'')+'</div>';
 }).join('');
 return shell(sections+'<p class="wd-method">'+X('MONO: πρόγνωση επιφάνειας · GFS μέσω Open-Meteo: άνεμοι 300/250/200 hPa, θερμοκρασία 850 hPa και νεφοκάλυψη. Όλες οι μεταβολές είναι διαφορές μεταξύ ωρών της πρόγνωσης, όχι παρατηρημένες αλλαγές. Χωρίς χωρική ανάλυση, δορυφορική κίνηση νεφών ή πεδία θερμικής μεταφοράς δεν τεκμηριώνεται ότι «αυτό το σύννεφο» ή «ο αεροχείμαρρος» προκάλεσε τη μεταβολή.','MONO surface forecast · GFS via Open-Meteo: winds at 300/250/200 hPa, 850 hPa temperature and cloud cover. All changes are differences between forecast hours, not observed change. Without spatial fields, tracked cloud motion, or thermal-advection fields, no particular cloud or jet stream can be identified as the cause.')+'</p>');
}
const api={join,diagnostics,indicators,render};
root.MONOWeatherDrivers=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
