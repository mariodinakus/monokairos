/* MONO Rain Intelligence — compact, honest, mobile-first interpretation. */
(function(root){
'use strict';
const fin=Number.isFinite;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const num=(v,d=1)=>fin(v)?v.toLocaleString('el-GR',{maximumFractionDigits:d}):'—';
const sum=x=>x.length&&x.every(fin)?x.reduce((a,b)=>a+b,0):null;
const hour=3600e3;
/* A ground report applies only to its own station, not automatically to the user's street. */
const rainWx=/^(?!VC)[+-]?(?:(?:MI|PR|BC|DR|BL|SH|TS|FZ))*?(?:DZ|RA|RASN|RADZ)(?:RA|DZ|SN)?$/;
const snowWx=/^(?!VC)[+-]?(?:SH|BL|DR)?(?:SN|SG|PL)(?:SN)?$/;
function present(stations,pws,now=Date.now(),radius=35){
 const reports=(stations||[]).filter(s=>fin(s.dist)&&s.dist>=0&&s.dist<=120)
   .flatMap(s=>(s.list||[]).filter(o=>fin(o.t)&&o.t<=now+5*60000&&now-o.t>=-5*60000&&now-o.t<=90*60000)
     .map(o=>({...o,name:s.name||s.id,id:s.id,dist:s.dist,src:s.src||'station'})))
   .filter(o=>Array.isArray(o.wx)||fin(o.ww)||typeof o.raw==='string')
   .sort((a,b)=>a.dist-b.dist||b.t-a.t);
 // The closest currently reporting meteorological station has priority;
 // never substitute a more distant wet station for a nearby dry one.
 const first=reports[0];
 if(first){
  const wx=Array.isArray(first.wx)?first.wx:[];
  const wet=wx.some(x=>rainWx.test(String(x))) ||
    (fin(first.ww)&&((first.ww>=50&&first.ww<=69)||(first.ww>=80&&first.ww<=84)||[95,96,97,98,99].includes(first.ww)));
  const snow=wx.some(x=>snowWx.test(String(x)))||(fin(first.ww)&&first.ww>=70&&first.ww<=79);
  const local=first.dist<=radius;
  return {kind:!local?'distant':wet?'rain':snow?'snow':'not_reported',
    wet,snow,local,dist:first.dist,id:first.id,name:first.name,src:first.src,t:first.t,
    description:wet?'rain':snow?'snow':'no precipitation reported'};
 }
 // A 60-minute rain accumulation confirms rain *during the last hour*,
 // but not that it is still raining at this exact moment.
 const near=(pws?.stations||[]).filter(s=>fin(s.dist)&&s.dist<=radius&&fin(s.t)&&now-s.t<=90*60000&&now-s.t>=-5*60000&&fin(s.rain1h))
   .sort((a,b)=>a.dist-b.dist)[0];
 if(near)return {kind:'recent_gauge',wet:near.rain1h>0.1,local:true,dist:near.dist,
   id:near.id||null,name:near.name||'Netatmo',src:'Netatmo',t:near.t,mm1h:near.rain1h};
 return {kind:'unverified',wet:false,local:false,dist:null,name:null,t:null};
}
function observed(stations,pws,now=Date.now()){
 const candidates=(stations||[]).filter(s=>fin(s.dist)&&s.dist>=0&&s.dist<=120).map(st=>{
  const reports=(st.list||[]).filter(r=>fin(r.t)&&fin(r.prcp)&&r.prcp>=0&&fin(r.prcpH)&&r.prcpH>0&&r.prcpH<=24&&r.t<=now+15*60000&&r.t>now-48*hour)
   .map(r=>({start:r.t-r.prcpH*hour,end:r.t,mm:r.prcp,h:r.prcpH}))
   .sort((a,b)=>b.end-a.end||a.h-b.h);
  const chosen=[],cutoff=now-24*hour;
  for(const r of reports){if(r.start<cutoff-15*60000||r.end>now+15*60000||chosen.some(x=>r.start<x.end&&r.end>x.start))continue;chosen.push(r);}
  const covered=chosen.reduce((s,r)=>s+r.h,0);
  return {id:st.id,name:st.name||st.id,dist:st.dist,mm:sum(chosen.map(r=>r.mm)),
    covered:Math.min(24,covered),t:chosen.length?Math.max(...chosen.map(r=>r.end)):null,type:'SYNOP',reports:chosen.length};
 }).filter(s=>s.covered>=1);
 // A private rain gauge is an actual instrument; use its *own* 24-hour
 // accumulation rather than the median of a whole district.
 const personal=(pws?.stations||[]).filter(s=>fin(s.dist)&&s.dist<=30&&fin(s.t)&&s.t<=now+5*60000&&now-s.t<2*hour&&fin(s.rain24h)&&s.rain24h>=0)
 .map(s=>({id:s.id,name:s.name||('Netatmo · '+(s.id?String(s.id).slice(0,8):'PWS')),
   dist:s.dist,mm:s.rain24h,covered:24,t:s.t,type:'Netatmo',reports:1,
   note:'rolling 24-hour accumulation from one private gauge'}));
 const combined=[...candidates,...personal].sort((a,b)=>a.dist-b.dist||b.t-a.t);
 if(combined.length)return combined[0];
 if(pws?.nRain>0&&fin(pws.rain1h))return {name:'Netatmo',dist:null,mm:pws.rain1h,covered:1,type:'PWS-area',reports:pws.nRain,t:pws.at};
 return null;
}
function metrics(train,shared){
 const rain=train?.precip?.leads?.[0],cloud=train?.cloud?.leads?.[0];
 return {rain,cloud,shared,amountMae:rain?.amountTest?.mae??shared?.rain?.mae??null,brier:rain?.test?.[rain?.choice]??null,cloudMae:cloud?.test?.[cloud?.choice]?.mae??shared?.cloud?.mae??null};
}
function render({lang='el',view,train,stations,pws,trainingStatus,shared}={}){
 const el=lang!=='en',X=(a,b)=>el?a:b;
 if(!view?.rows?.length)return '';
 const now=Date.now(), obs=observed(stations,pws,now),next=view.rows.filter(r=>r.t>now).slice(0,24);
 const mm=next.length===24?sum(next.map(r=>r.amount)):null;
 const avgCloud=next.length>=6?sum(next.slice(0,6).map(r=>r.cloud)):null;
 const cloud=fin(avgCloud)?avgCloud/6:null;
 const M=metrics(train,shared),co=fin(cloud)?(cloud<20?X('Λίγα σύννεφα','Mostly clear'):cloud<50?X('Λίγη συννεφιά','Partly cloudy'):cloud<80?X('Αρκετή συννεφιά','Mostly cloudy'):X('Συννεφιασμένος','Overcast')):X('Χωρίς στοιχεία','No data');
 const rainText=obs?(obs.type==='PWS-area'?X('Δείγμα από ιδιωτικούς αισθητήρες ευρύτερης περιοχής','Sample of private sensors across the broader area'):
    X(`Σταθμός ${escape(obs.name)} · ${num(obs.dist,0)} km`,`Station ${escape(obs.name)} · ${num(obs.dist,0)} km`)):
    X('Δεν βρέθηκε διαθέσιμο βροχόμετρο','No usable rain gauge');
 const rainNote=obs?X(`Καταγεγραμμένα ${num(obs.covered,0)} από τα τελευταία 24 ωρ. · όχι εκτίμηση για τα κενά`,`Reported ${num(obs.covered,0)} of the past 24 h · gaps are not estimated`):X('Δεν βαφτίζουμε μια πρόγνωση «μέτρηση».','A model estimate is not a measurement.');
 const accTxt=fin(M.amountMae)?X(`Μέσο απόλυτο σφάλμα ${num(M.amountMae,2)} mm/ώρα`,`Mean absolute error ${num(M.amountMae,2)} mm/hour`):X('Ανεπαρκές δείγμα ελέγχου','Not enough verified history');
 const card=(ico,name,big,body,note,cl='')=>`<article class="card ri-card ${cl}"><div class="ri-top"><span class="ri-icon" aria-hidden="true">${ico}</span><span class="ri-kicker">${name}</span></div><strong class="ri-number">${big}</strong><div class="ri-main">${body}</div><small class="ri-note">${note}</small></article>`;
 const cards=[
 card('☂',X('ΠΟΣΗ ΒΡΟΧΗ ΕΡΙΞΕ','RAIN REPORTED'),obs?`${num(obs.mm)} <i>mm</i>`:'—',rainText,rainNote),
 card('🌧',X('ΤΙ ΒΡΟΧΗ ΕΡΧΕΤΑΙ','RAIN AHEAD'),fin(mm)?`${num(mm)} <i>mm</i>`:'—',X('Επόμενες 24 ώρες','Next 24 hours'),X('Ποσότητα από τον συνδυασμό μοντέλων · όχι βεβαιότητα','Multi-model amount · not a guarantee')),
 card('🎯',X('ΠΟΣΟ ΜΕΣΑ ΠΕΣΑΜΕ','FORECAST SKILL'),fin(M.amountMae)?`${num(M.amountMae,2)} <i>mm</i>`:'—',accTxt,fin(M.amountMae)?X(`Έλεγχος σε ιστορικό ανεξάρτητο δείγμα (${M.rain?.n?.test??M.shared?.rain?.n??0} ώρες), με επανάλυση ERA5, όχι επιτόπιο βροχόμετρο`,`Historical held-out check (${M.rain?.n?.test??M.shared?.rain?.n??0} hours), against ERA5 reanalysis, not a local gauge`):X(trainingStatus==='loading'?'Υπολογίζουμε την ιστορική ακρίβεια…':'Δεν έχει ολοκληρωθεί έλεγχος',trainingStatus==='loading'?'Calculating historical skill…':'Historical evaluation unavailable')),
 card('☁',X('ΠΩΣ ΘΑ ΕΙΝΑΙ Ο ΟΥΡΑΝΟΣ','SKY COVER'),fin(cloud)?`${num(cloud,0)}<i>%</i>`:'—',co,X('Μέση προβλεπόμενη νέφωση επόμενων 6 ωρών','Average forecast cloud cover, next 6 hours'))];
 const cloudFoot=fin(M.cloudMae)?X(`Εκπαίδευση νεφών: ιστορικό μέσο σφάλμα ${num(M.cloudMae,1)} ποσοστιαίες μονάδες (ERA5).`,`Cloud model: historical error ${num(M.cloudMae,1)} percentage points (ERA5).`):X('Η νέφωση εμφανίζεται από τα διαθέσιμα μοντέλα· η εκπαίδευσή της απαιτεί ιστορικά δεδομένα.','Cloud cover comes from available models; training requires historical samples.');
 return `<section class="section ri-section" aria-label="${X('Η βροχή με μια ματιά','Rain at a glance')}"><div class="sectionhead"><div><span class="label">MONO / RAIN INTELLIGENCE</span><h2 class="h2">${X('Ο καιρός σε 4 εικόνες','Weather in four icons')}</h2><p class="section-sub">${X('Μέτρηση, πρόγνωση και έλεγχος: τρία διαφορετικά πράγματα.','Observation, forecast, and verification are different.')}</p></div></div><div class="ri-grid">${cards.join('')}</div><p class="ri-foot">☁ ${cloudFoot}</p><p class="ri-foot">${shared?.shared?X('🌐 Κοινό ιστορικό μοντέλο διαθέσιμο σε κινητό και υπολογιστή. Τοπική εκπαίδευση ανά συσκευή.','🌐 Shared historical learning across devices. Local training stays per device.'):X('Τοπική εκπαίδευση ανά συσκευή · κοινά στοιχεία για υποστηριζόμενες πόλεις.','Local training per device · shared results for supported cities.')}</p></section>`;
}
root.MONORainIntelligence={render,observed,present,metrics};
if(typeof module!=='undefined'&&module.exports)module.exports={render,observed,present,metrics};
})(typeof window!=='undefined'?window:globalThis);
