/* Seven-day forecast phenomena calendar. Uses the already calculated MONO daily
   event probabilities; it does not create new probabilities or warning levels. */
(function(root){
'use strict';
const fin=Number.isFinite, DAY=86400000;
const SIGNALS=[
 {id:'storm',el:'Καταιγίδα',en:'Thunderstorm',min:0.25},
 {id:'heavy',el:'Έντονη βροχή',en:'Heavy rainfall',min:0.20},
 {id:'snow',el:'Χιόνι',en:'Snow',min:0.25},
 {id:'wind',el:'Ισχυρές ριπές',en:'Strong gusts',min:0.30},
 {id:'frost',el:'Παγετός',en:'Frost',min:0.35},
 {id:'heat',el:'Πολύ υψηλή θερμοκρασία',en:'Very high temperature',min:0.35},
 {id:'rain',el:'Βροχή',en:'Rain',min:0.30},
 {id:'fog',el:'Ομίχλη',en:'Fog',min:0.35}
];
function entries(daily,now=Date.now(),limit=7){
 if(!Array.isArray(daily)||!fin(now))return [];
 return daily.filter(d=>fin(d?.t)&&d.t>=now-DAY&&d.t<now+(limit+1)*DAY)
  .sort((a,b)=>a.t-b.t).slice(0,limit).map(d=>{
   const valid=SIGNALS.some(s=>fin(d.ev?.[s.id])&&d.ev[s.id]>=0&&d.ev[s.id]<=1);
   let signals=SIGNALS.filter(s=>fin(d.ev?.[s.id])&&d.ev[s.id]>=s.min&&d.ev[s.id]<=1)
    .map(s=>({id:s.id,el:s.el,en:s.en,p:d.ev[s.id]}));
   if(signals.some(s=>s.id==='heavy'))signals=signals.filter(s=>s.id!=='rain');
   return {t:d.t,key:d.key,hi:fin(d.hi)?d.hi:null,lo:fin(d.lo)?d.lo:null,
     rain:fin(d.mm)&&d.mm>=0?d.mm:null,valid,signals:signals.slice(0,4)};
  });
}
function render(view,{lang='el',now=Date.now()}={}){
 const en=lang==='en',X=(a,b)=>en?b:a,rows=entries(view?.daily,now),zone=view?.zone||'UTC';
 if(!rows.length)return '';
 const date=t=>{
  try{return new Intl.DateTimeFormat(en?'en-GB':'el-GR',{weekday:'short',day:'numeric',month:'short',timeZone:zone}).format(new Date(t));}
  catch{return new Date(t).toISOString().slice(0,10);}
 };
 const number=(v,d=0)=>new Intl.NumberFormat(en?'en-GB':'el-GR',{maximumFractionDigits:d,minimumFractionDigits:d}).format(v);
 const dayRows=rows.map(d=>{
  const condition=d.signals.length
   ?d.signals.map(s=>'<span class="mono-cal-tag"><b>'+s[en?'en':'el']+'</b><span>'+Math.round(s.p*100)+'%</span></span>').join('')
   :'<span class="mono-cal-neutral">'+(d.valid?X('Χωρίς έντονο σήμα','No standout signal'):X('Ανεπαρκή δεδομένα φαινομένων','Insufficient event data'))+'</span>';
  const temp=d.hi!==null&&d.lo!==null?number(d.hi)+'° / '+number(d.lo)+'°':'—';
  const rain=d.rain!==null?number(d.rain,1)+' mm':'—';
  return '<div class="mono-cal-row"><div class="mono-cal-date">'+date(d.t)+'</div><div class="mono-cal-conditions">'+condition+'</div><div class="mono-cal-numbers"><span>'+temp+'</span><small>'+rain+'</small></div></div>';
 }).join('');
 return '<section class="section card mono-calendar" aria-label="'+X('Ημερολόγιο φαινομένων','Phenomena calendar')+'">'+
  '<div class="panelhead"><div><span class="label">MONO / '+X('7 ΗΜΕΡΕΣ','7 DAYS')+'</span><h2 class="h2">'+X('Ημερολόγιο φαινομένων','Phenomena calendar')+'</h2></div></div>'+
  '<p class="mono-cal-intro">'+X('Πότε ξεχωρίζει κάποιο φαινόμενο στην πρόγνωση, μέρα προς μέρα.','Notable forecast signals, day by day.')+'</p>'+
  '<div class="mono-cal-days">'+dayRows+'</div>'+
  '<p class="notice">'+X('Τα ποσοστά είναι εκτιμήσεις του μοντέλου για κάθε φαινόμενο, όχι πιθανότητα επιτυχίας ή επίσημη προειδοποίηση. Τα χαμηλότερα σήματα αποκρύπτονται για ευανάγνωστη παρουσίαση. Η έλλειψη ένδειξης δεν εγγυάται απουσία φαινομένου.','Percentages are event estimates from the forecast, not forecast accuracy or official warnings. Lower signals are hidden for readability. No highlighted signal does not guarantee the event will not occur.')+'</p></section>';
}
const api={entries,render};
root.MONOPhenomenaCalendar=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
