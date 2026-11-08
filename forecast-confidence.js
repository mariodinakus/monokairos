/* Agreement is a count of model forecasts, not a calibrated success probability. */
(function(root){
'use strict';
const hour=3600e3, fin=Number.isFinite, wet=.2;
const num=(n,d,lang)=>fin(n)?new Intl.NumberFormat(lang==='en'?'en-GB':'el-GR',{minimumFractionDigits:d,maximumFractionDigits:d,useGrouping:false}).format(n):'—';
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const ratio=a=>a.total?100*a.match/a.total:null;
function agreement(view,now=Date.now()){
 const rows=(view?.rows||[]).filter(r=>fin(r.t)&&r.t>now&&r.t<=now+6*hour).slice(0,6);
 const active=Array.isArray(view?.active)?view.active:[];
 const dimensions=['temp','wind','cloud','rain'], results=Object.fromEntries(dimensions.map(k=>[k,{match:0,total:0}]));
 let match=0,total=0;const seen=new Set(),hours=new Set();
 for(const r of rows){
  for(const id of active){
   const m=r.models?.[id];if(!m)continue;
   const checks={
    temp:fin(r.temp)&&fin(m.T)?Math.abs(m.T-r.temp)<=2:null,
    wind:fin(r.wind)&&fin(m.W)?Math.abs(m.W-r.wind)<=10:null,
    cloud:fin(r.cloud)&&fin(m.C)?Math.abs(m.C-r.cloud)<=20:null,
    rain:fin(r.amount)&&fin(m.P)&&r.amount>=0&&m.P>=0?(m.P>=wet)===(r.amount>=wet):null
   };
   for(const key of dimensions)if(checks[key]!==null){results[key].total++;if(checks[key])results[key].match++;}
   if(dimensions.every(key=>checks[key]!==null)){
    total++;seen.add(id);hours.add(r.t);if(dimensions.every(key=>checks[key]))match++;
   }
  }
 }
 // Avoid making a percentage from one model, one hour, or a nearly empty feed.
 const valid=seen.size>=3&&hours.size>=3&&total>=9;
 return {percent:valid?100*match/total:null,models:seen.size,hours:hours.size,matched:match,total,results,
   start:rows[0]?.t??null,end:rows.at(-1)?.t??null};
}
function capture(data,at=Date.now()){
 const h=data?.hourly;if(!Array.isArray(h?.time)||!fin(at))return null;
 const rows=[];
 for(let i=0;i<h.time.length;i++){
  const t=h.time[i]*1000;if(!fin(t)||t<=at||t>at+48*hour)continue;
  const get=k=>fin(h[k]?.[i])?h[k][i]:null;
  const rain=get('rain'),showers=get('showers');
  rows.push({t,temp:get('temperature_2m'),wind:get('wind_speed_10m'),cloud:get('cloud_cover'),
    liquid:rain!==null&&showers!==null&&rain>=0&&showers>=0?rain+showers:null,
    pop:get('precipitation_probability')});
 }
 return rows.length>=6?{at,rows}:null;
}
function selectHistory(history,now=Date.now()){
 const valid=(Array.isArray(history)?history:[]).filter(x=>fin(x?.at)&&x.at<=now+60000&&Array.isArray(x.rows))
   .sort((a,b)=>a.at-b.at);
 const current=valid.at(-1);if(!current||now-current.at>30*60e3)return null;
 const older=valid.filter(x=>current.at-x.at>=60000&&current.at-x.at<=36*hour);
 if(!older.length)return null;
 // Compare against around an hour ago, or the oldest available recent capture.
 const hourOld=older.filter(x=>x.at<=current.at-hour).at(-1);
 return {previous:hourOld||older[0],current};
}
function compare(history,now=Date.now()){
 const pair=selectHistory(history,now);if(!pair)return null;
 const old=new Map(pair.previous.rows.filter(r=>fin(r?.t)).map(r=>[r.t,r]));
 const common=pair.current.rows.filter(r=>fin(r?.t)&&r.t>now&&r.t<=now+24*hour&&old.has(r.t))
   .map(current=>({current,previous:old.get(current.t)}));
 const calc=(key,op,min=18)=>{
  const xs=common.filter(p=>fin(p.current[key])&&fin(p.previous[key]));
  if(xs.length<min)return null;
  const before=op(xs.map(p=>p.previous[key])),after=op(xs.map(p=>p.current[key]));
  return {before,after,delta:after-before,n:xs.length};
 };
 const liquid=common.filter(p=>fin(p.current.liquid)&&fin(p.previous.liquid));
 let firstRain=null;
 // Missing hours must not be mistaken for dry weather or a delayed onset.
 if(liquid.length===24){
  const current=liquid.find(p=>p.current.liquid>=wet)?.current.t??null;
  const previous=liquid.find(p=>p.previous.liquid>=wet)?.previous.t??null;
  firstRain={current,previous,shift:current!==null&&previous!==null?(current-previous)/hour:null};
 }
 return {...pair,count:common.length,
  temp:calc('temp',avg),wind:calc('wind',a=>Math.max(...a)),cloud:calc('cloud',avg),
  liquid:calc('liquid',a=>a.reduce((s,x)=>s+x,0),24),pop:calc('pop',a=>Math.max(...a)),firstRain};
}
function render({view,lang='el',history=[],train=null,snapshot=false,now=Date.now()}={}){
 const el=lang!=='en', X=(a,b)=>el?a:b;
 const zone=view?.zone||'UTC', locale=el?'el-GR':'en-GB';
 const stamp=t=>{try{return new Date(t).toLocaleString(locale,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:zone});}catch{return '—';}};
 const a=snapshot?{percent:null}:agreement(view,now);
 const dimensions=[['temp',X('Θερμοκρασία','Temperature')],['wind',X('Άνεμος','Wind')],['cloud',X('Νέφωση','Clouds')],['rain',X('Υετός','Precipitation')]];
 const metrics=dimensions.map(([id,label])=>`<div><span>${label}</span><b>${a.percent===null?'—':num(ratio(a.results[id]),0,lang)+'%'}</b></div>`).join('');
 const score=fin(a.percent)?num(a.percent,0,lang)+'%':'—';
 const scoreText=fin(a.percent)?X(`${a.models} μοντέλα · ${a.hours} ώρες · ${a.total} συγκρίσεις μοντέλου–ώρας`,`${a.models} models · ${a.hours} hours · ${a.total} model-hour comparisons`):X('Περιμένουμε αρκετά μοντέλα για τις επόμενες ώρες.','Waiting for enough models for the coming hours.');
 const L=train?.temp?.leads?.[0],fit=L?.test?.[L?.choice];
 const historical=fin(fit?.mae)&&fin(fit?.n)&&fit.n>=30
  ?X(`Ιστορικός έλεγχος θερμοκρασίας: μέσο σφάλμα ${num(fit.mae,1,lang)} °C σε ${fit.n} ώρες τεστ (ERA5).`,`Historical temperature check: mean error ${num(fit.mae,1,lang)} °C over ${fit.n} test hours (ERA5).`)
  :X('Η ιστορική ακρίβεια εμφανίζεται όταν ολοκληρωθεί ο έλεγχος.','Historical accuracy appears when the evaluation is complete.');
 const rev=snapshot?null:compare(history,now);
 const tile=(label,v,unit,d=1,changeUnit=unit)=>{
  if(!v)return `<div class="fc-revision-tile"><span>${label}</span><b>—</b><small>${X('Ανεπαρκή στοιχεία','Insufficient data')}</small></div>`;
  const delta=(Math.abs(v.delta)<10**(-d)/2?0:v.delta),signed=(delta>0?'+':'')+num(delta,d,lang);
  return `<div class="fc-revision-tile"><span>${label}</span><b>${num(v.before,d,lang)} → ${num(v.after,d,lang)} <small>${unit}</small></b><small>${delta===0?X('Χωρίς αλλαγή','Unchanged'):signed+' '+changeUnit} · ${v.n} ${X('κοινές ώρες','common hours')}</small></div>`;
 };
 let rain='';
 if(rev?.firstRain){const r=rev.firstRain;
  if(r.current!==null&&r.previous!==null){
   const direction=r.shift===0?X('Η πρώτη ένδειξη βροχής παραμένει στην ίδια ώρα.','First rain indication remains at the same hour.'):
    r.shift<0?X(`Η πρώτη ένδειξη βροχής μετακινήθηκε ${num(-r.shift,0,lang)} ώρες νωρίτερα.`,`First rain indication moved ${num(-r.shift,0,lang)} hours earlier.`):
      X(`Η πρώτη ένδειξη βροχής μετακινήθηκε ${num(r.shift,0,lang)} ώρες αργότερα.`,`First rain indication moved ${num(r.shift,0,lang)} hours later.`);
   rain=`${direction} <span>${stamp(r.previous)} → ${stamp(r.current)}</span>`;
  }else if(r.current!==null)rain=X('Νέα ένδειξη βροχής στις','New rain indication at')+' '+stamp(r.current)+'.';
  else if(r.previous!==null)rain=X('Η προηγούμενη ένδειξη βροχής δεν εμφανίζεται πλέον στο κοινό 24ωρο.','The previous rain indication no longer appears in the shared 24-hour window.');
  else rain=X('Δεν ξεχωρίζει ωριαία ένδειξη βροχής στο κοινό 24ωρο.','No hourly rain indication stands out in the shared 24-hour window.');
 }else rain=X('Δεν υπάρχουν αρκετές κοινές ώρες για σύγκριση της έναρξης βροχής.','Not enough common hours to compare rain timing.');
 const changes=rev?`<div class="fc-revision-meta">${X('Σύγκριση λήψης','Comparing fetches')} ${stamp(rev.previous.at)} → ${stamp(rev.current.at)} · ${X('ίδιες μελλοντικές ώρες, έως 24ωρο','same future hours, up to 24 hours')}</div>
  <div class="fc-revision-grid">${tile(X('Μέση θερμοκρασία','Mean temperature'),rev.temp,'°C')}${tile(X('Μέγιστος άνεμος','Peak wind'),rev.wind,'km/h',0)}${tile(X('Μέση νέφωση','Mean cloud cover'),rev.cloud,'%',0,X('μ.μ.','pp'))}${tile(X('Συνολική βροχή','Total rain'),rev.liquid,'mm')}${tile(X('Μέγιστη ωριαία πιθανότητα υετού','Peak hourly precipitation chance'),rev.pop,'%',0,X('μ.μ.','pp'))}</div>
  <p class="fc-rain-timing"><b>☂ ${X('Χρονισμός βροχής','Rain timing')}</b> ${rain}</p>
  <p class="fc-note">${X('Αφορά την πρώτη ωριαία ένδειξη ≥0,2 mm βροχής/μπόρας, όχι ακριβές λεπτό έναρξης. Η σύγκριση προέρχεται από τη βασική πρόγνωση Open-Meteo που έλαβε αυτή η συσκευή· οι ώρες είναι ώρες λήψης, όχι έκδοσης μοντέλου.','First hourly indication ≥0.2 mm of rain/showers, not an exact start minute. Comparison uses the Open-Meteo base forecast retrieved by this device; times are fetch times, not model issue times.')}</p>`:
  `<p class="fc-empty">${X('Μόλις ληφθεί επόμενη πρόγνωση για την ίδια περιοχή, θα εμφανιστούν εδώ οι αλλαγές σε σχέση με την προηγούμενη.','Once another forecast for this location is fetched, changes from the earlier forecast appear here.')}</p>`;
 return `<section class="section card fc-panel" aria-label="${X('Συμφωνία και αλλαγές πρόγνωσης','Forecast agreement and changes')}">
 <div class="fc-heading"><div><span class="fc-eyebrow">MONO / ${X('ΕΛΕΓΧΟΣ ΠΡΟΓΝΩΣΗΣ','FORECAST CHECK')}</span><h2>${X('Πόσο συμφωνούν τα μοντέλα;','How closely do the models agree?')}</h2><p>${X('Μια καθαρή εικόνα για την πρόγνωση των επόμενων 6 ωρών.','A clear view of the forecast for the next 6 hours.')}</p></div><div class="fc-score"><strong>${score}</strong><span>${X('ΣΥΜΦΩΝΙΑ','AGREEMENT')}</span></div></div>
 <p class="fc-data">${scoreText}</p><p class="fc-caveat">${X('Συμφωνία μοντέλων, όχι μετρημένη πιθανότητα επαλήθευσης.','Model agreement, not a measured probability of forecast success.')}</p><div class="fc-breakdown">${metrics}</div>
 <details class="fc-explain"><summary>${X('Τι σημαίνει το ποσοστό;','What does the percentage mean?')}</summary><p>${X('Ποσοστό συγκρίσεων μοντέλου–ώρας που συμφωνούν ταυτόχρονα με το MONO σε θερμοκρασία ±2 °C, άνεμο ±10 km/h, νέφωση ±20 μονάδες και ένδειξη υετού ≥0,2 mm. Τα επιμέρους ποσοστά έχουν δικά τους διαθέσιμα δείγματα. Τα μοντέλα μπορεί να κάνουν κοινό λάθος: αυτό δεν είναι πιθανότητα να επαληθευτεί η πρόγνωση.','Share of model-hour comparisons matching MONO simultaneously for temperature ±2 °C, wind ±10 km/h, cloud cover ±20 points and precipitation ≥0.2 mm. Individual percentages use their own available samples. Models may share errors: this is not the probability that the forecast will verify.')}</p></details>
 <p class="fc-history">${historical} <button type="button" data-action="goto" data-page="history">${X('Δες τον έλεγχο','View evaluation')} ↗</button></p>
 <div class="fc-revision"><div class="fc-revision-head"><div><span class="fc-eyebrow">MONO / ${X('ΑΛΛΑΓΕΣ ΠΡΟΓΝΩΣΗΣ','FORECAST UPDATES')}</span><h3>${X('Τι άλλαξε στην πρόγνωση;','What changed in the forecast?')}</h3></div><span>${X('Επόμενο 24ωρο','Next 24 hours')}</span></div>${changes}</div></section>`;
}
root.MONOForecastConfidence={agreement,capture,selectHistory,compare,render};
if(typeof module!=='undefined'&&module.exports)module.exports=root.MONOForecastConfidence;
})(typeof window!=='undefined'?window:globalThis);
