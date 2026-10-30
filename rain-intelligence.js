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
  return {kind:!local?'distant':(wet||snow)&&now-first.t>45*60000?'recent_report':wet?'rain':snow?'snow':'not_reported',
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
  const reports=[...(st.list||[]),...(st.rainReports||[])].filter(r=>fin(r.t)&&fin(r.prcp)&&r.prcp>=0&&fin(r.prcpH)&&r.prcpH>0&&r.prcpH<=24&&r.t<=now+15*60000&&r.t>now-48*hour)
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
function stationAmount(data,ecmwf,gfs,target,now=Date.now()){
 const L=data?.learning,lead=target-now;
 if(!data?.available||data.stale||!finiteStationTime(data.checkedAt,now)||!L?.ready||
    !fin(data.station?.dist)||data.station.dist>20||!fin(data.cityDistance)||data.cityDistance>15||
    ![ecmwf,gfs,L.weight,L.scale,target].every(fin)||ecmwf<0||gfs<0||L.weight<0||L.weight>1||L.scale<0.7||L.scale>1.3||lead<18*hour||lead>30*hour)return null;
 return Math.max(0,(L.weight*ecmwf+(1-L.weight)*gfs)*L.scale);
}
function finiteStationTime(t,now){return fin(t)&&t<=now+5*60000&&now-t<=8*hour;}
function stationLearningCard(data,lang='el',zone='Europe/Athens',now=Date.now()){
 const el=lang!=='en',X=(a,b)=>el?a:b;
 const heading=X('Μαθαίνουμε από τη βροχή','Learning from precipitation');
 if(!data?.available){
  const msg=data?.reason==='city_not_supported'?X('Η αυτόματη μάθηση σταθμού δεν καλύπτει ακόμη αυτή την περιοχή.','Automatic station learning is not yet available for this area.'):
   data?.reason==='no_recent_gauge'?X('Δεν βρέθηκε κοντινό βροχόμετρο με πρόσφατες μετρήσεις.','No nearby gauge has recent readings.'):
   X('Αναζητούμε πραγματικές μετρήσεις σταθμού για να ξεκινήσει ο έλεγχος.','Looking for real station measurements to start verification.');
  return `<section class="ri-learning card"><div class="panelhead"><b>🎯 ${heading}</b></div><p class="ri-foot">${msg}</p></section>`;
 }
 const s=data.samples||{},L=data.learning||{},st=data.station||{};
 const gauges=Array.isArray(data.stations)?data.stations:[];
 const count=gauges.length||(st.id?1:0);
 const valid=fin(L.baselineMae)&&fin(L.adjustedMae)&&L.test>=8;
 const improvement=valid&&L.baselineMae>0?100*(L.baselineMae-L.adjustedMae)/L.baselineMae:null;
 const fmt=t=>fin(t)?new Date(t).toLocaleString(el?'el-GR':'en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:zone}):'—';
 const canUse=L.ready&&!data.stale&&finiteStationTime(data.checkedAt,now)&&fin(st.dist)&&st.dist<=20&&fin(data.cityDistance)&&data.cityDistance<=15;
 const status=canUse?X('Ενεργή διόρθωση στις 18–30 ώρες','Adjustment active at 18–30 hours'):
  L.ready?X('Υπάρχει μοντέλο, αλλά δεν εφαρμόζεται εδώ ή τα στοιχεία είναι παλιά','Model available, but not applied here or data are stale'):
  L.reason==='not_better_in_test'?X('Ο έλεγχος δεν βελτιώθηκε: η διόρθωση παραμένει κλειστή','Validation did not improve: adjustment remains off'):
  X('Η μάθηση συνεχίζεται — χρειάζονται περισσότερες περίοδοι και βροχές','Learning continues — more periods and rain events are needed');
 const stats=[
  [X('Βροχή που βρέθηκε','Rain correctly forecast'),s.hit],
  [X('Βροχή που χάθηκε','Missed rain'),s.miss],
  [X('Λάθος συναγερμός','False alarm'),s.falseAlarm],
  [X('Σωστά χωρίς υετό','Correct dry'),s.correctDry]
 ].map(([label,n])=>`<div><strong>${fin(n)?n:'—'}</strong><span>${label}</span></div>`).join('');
 const labels={hit:X('Την βρήκε','Hit'),miss:X('Την έχασε','Miss'),false_alarm:X('Λάθος συναγερμός','False alarm'),correct_dry:X('Σωστά χωρίς υετό','Correct dry')};
 const recent=(data.recent||[]).map(r=>`<div class="ri-history-row"><span>${fmt(r.start)} → ${fmt(r.end)}<small>${num(r.hours,0)} ${X('ώρες','hours')}</small></span><span>${X('Πρόβλεψη','Forecast')} ${num(r.predicted,2)} mm<br>${X('Σταθμός','Gauge')} ${num(r.observed,2)} mm</span><strong>${labels[r.result]||'—'}</strong></div>`).join('');
 const validation=valid?X(`Χρονικός έλεγχος σε μεταγενέστερες μετρήσεις: MAE ${num(L.baselineMae,2)} → ${num(L.adjustedMae,2)} mm ανά περίοδο (${num(L.test,0)} δείγματα). ${fin(improvement)?(improvement>=0?'Βελτίωση ':'Επιδείνωση ')+num(Math.abs(improvement),1)+'%.':''}`,
    `Later time-window test: MAE ${num(L.baselineMae,2)} → ${num(L.adjustedMae,2)} mm per period (${num(L.test,0)} samples). ${fin(improvement)?(improvement>=0?'Improvement ':'Worse by ')+num(Math.abs(improvement),1)+'%.':''}`):'';
 const stationRows=gauges.slice(0,12).map(g=>`<div class="ri-history-row"><span>${escape(g.name||g.id)}<small>${num(g.dist,1)} km</small></span><span>${num(g.n,0)} ${X('περίοδοι','periods')}</span><strong>MAE ${num(g.mae,2)} mm</strong></div>`).join('');
 const meanMetrics=`<div class="ri-meaning-grid"><div><b>MAE ${num(s.mae,2)} mm</b><small>${X('Μέσο απόλυτο σφάλμα ποσότητας ανά περίοδο αναφοράς. Μικρότερο = καλύτερο.','Average absolute precipitation amount error per report period. Lower is better.')}</small></div><div><b>RMSE ${num(s.rmse,2)} mm</b><small>${X('Δίνει μεγαλύτερη βαρύτητα στις μεγάλες αποτυχίες. Μικρότερο = καλύτερο.','Penalises large misses more strongly. Lower is better.')}</small></div><div><b>${X('Μεροληψία','Bias')} ${num(s.bias,2)} mm</b><small>${X('Θετικό: υπερεκτίμηση βροχής. Αρνητικό: υποεκτίμηση. Κοντά στο 0 = καλύτερο.','Positive: forecast too wet. Negative: too dry. Near zero is better.')}</small></div><div><b>${X('Βροχές που εντόπισε','Rain detection')} ${fin(s.recall)?num(s.recall*100,0)+'%':'—'}</b><small>${X('Από όσες βροχές πράγματι καταγράφηκαν. Δεν αποτελεί συνολική ακρίβεια πρόγνωσης.','Share of observed rain events identified. Not overall forecast accuracy.')}</small></div></div>`;
 const meaning=X('Παράδειγμα: πρόβλεψη 5 mm, μέτρηση 3 mm → απόλυτο σφάλμα 2 mm. Το MAE είναι ο μέσος όρος πολλών τέτοιων διαφορών. Τα 2 mm αφορούν ολόκληρη την περίοδο μέτρησης, όχι υποχρεωτικά μία ώρα. Σωστό/λάθος για βροχή υπολογίζεται χωριστά.','Example: predicted 5 mm, observed 3 mm → absolute error 2 mm. MAE averages these over multiple periods; it is not automatically an hourly error. Rain/no-rain detection is scored separately.');
 return `<section class="ri-learning card"><div class="panelhead"><div><b>🎯 ${heading}</b><div class="section-sub">${count} ${X('σταθμοί με συγκρίσιμες μετρήσεις','gauges with comparable observations')} · ${X('πλησιέστερος','nearest')}: ${escape(st.name||st.id||'—')} (${num(st.dist,1)} km) · ${X('τελευταίος έλεγχος','last checked')} ${fmt(data.checkedAt)}${data.stale?' · '+X('παλιά στοιχεία','stale'):''}</div></div></div>
 <p class="ri-foot">${X('Πραγματικές μετρήσεις από διαθέσιμους ποιοτικά αποδεκτούς σταθμούς SYNOP σε ακτίνα έως 75 km (έως 12 ανά περιοχή), με πρόγνωση ECMWF/GFS από 24 ώρες πριν. Επανέλεγχος κάθε 3 ώρες. Αυτό δεν ελέγχει τις παλιές ενδείξεις του πλήρους MONO.','Actual quality-screened SYNOP gauges within 75 km (up to 12 per region), compared to 24h-lead ECMWF/GFS. Rechecked every 3 hours. This is not a score of all previously displayed MONO forecasts.')}</p>
 ${meanMetrics}
 <details class="ri-history"><summary>${X('Τι σημαίνουν τα σφάλματα;','What do the errors mean?')}</summary><p class="ri-foot">${escape(meaning)}</p><p class="ri-foot">${X('Τα MAE, RMSE και bias υπολογίζονται από τον βασικό συνδυασμό ECMWF/GFS. Η βελτίωση της διόρθωσης κρίνεται ξεχωριστά σε μεταγενέστερες περιόδους, και εφαρμόζεται μόνο όταν έχει αποδείξει μείωση σφάλματος.','MAE, RMSE and bias describe the baseline ECMWF/GFS blend; the correction is assessed separately on later time periods and activates only if error is lower.')}</p></details>
 <div class="ri-learning-stats">${stats}</div>
 <p class="ri-foot"><b>${escape(status)}</b> · ${num(s.n,0)} ${X('ανεξάρτητες περίοδοι','non-overlapping periods')} · ${X('όριο υετού','wet threshold')} ${num(data.threshold,1)} mm.${validation?' '+escape(validation):''}</p>
 <details class="ri-history"><summary>${X('Σταθμοί που συμμετέχουν','Gauges included')} · ${count}</summary>${stationRows||'<p class="ri-foot">—</p>'}</details>
 <details class="ri-history"><summary>${X('Αναλυτικό ιστορικό','Detailed history')}</summary>${recent||`<p class="ri-foot">${X('Δεν υπάρχουν ακόμη πλήρεις συγκρίσιμες περίοδοι.','No complete comparable periods yet.')}</p>`}</details>
 <p class="ri-foot">${X('Ο υετός περιλαμβάνει και το ισοδύναμο νερού από χιόνι. Η μέτρηση αφορά τη θέση του σταθμού, όχι κάθε δρόμο της περιοχής.','Precipitation includes snow water equivalent. The gauge reports its own location, not every street nearby.')}</p></section>`;
}
function render({lang='el',view,train,stations,pws,trainingStatus,shared,stationLearning}={}){
 const el=lang!=='en',X=(a,b)=>el?a:b;
 if(!view?.rows?.length)return '';
 const now=Date.now(), obs=observed(stations,pws,now),live=present(stations,pws,now),next=view.rows.filter(r=>r.t>now).slice(0,24);
 const mm=next.length===24?sum(next.map(r=>r.amount)):null;
 const avgCloud=next.length>=6?sum(next.slice(0,6).map(r=>r.cloud)):null;
 const cloud=fin(avgCloud)?avgCloud/6:null;

 const clock=t=>fin(t)?new Date(t).toLocaleTimeString(el?'el-GR':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:view.zone||'Europe/Athens'}):'—';
 const ref=live.name?escape(live.name):'—',distance=fin(live.dist)?num(live.dist,1)+' km':'—';
 const liveTitle=live.kind==='rain'?X('Βρέχει στον κοντινό σταθμό','Rain at the nearby station')
  :live.kind==='snow'?X('Χιονίζει στον κοντινό σταθμό','Snow at the nearby station')
  :live.kind==='recent_report'?X('Πρόσφατη αναφορά υετού','Recent precipitation report')
  :live.kind==='not_reported'?X('Δεν αναφέρεται βροχή','No rain reported')
  :live.kind==='recent_gauge'?(live.wet?X('Έβρεξε την τελευταία ώρα','Rain in the last hour'):X('Δεν μετρήθηκε βροχή την τελευταία ώρα','No rain measured in the last hour'))
  :live.kind==='distant'?X('Μόνο μακρινός σταθμός','Only a distant station')
  :X('Χωρίς επιβεβαίωση σταθμού','No station confirmation');
 const liveIcon=live.kind==='rain'?'🌧️':live.kind==='snow'?'🌨️':live.kind==='recent_report'?'🕓':live.kind==='not_reported'?'☁️':live.kind==='recent_gauge'?'🌦️':'📍';
 const liveMeta=live.kind==='unverified'?X('Δεν υπάρχουν πρόσφατες κοντινές παρατηρήσεις. Η πρόγνωση δεν είναι μέτρηση.','No fresh nearby report. A forecast is not a measurement.')
  :X('Σταθμός','Station')+' '+ref+' · '+distance+' · '+clock(live.t)+' · '+escape(live.src||'');
 const liveNote=live.kind==='rain'||live.kind==='snow'?X('Ένδειξη στη θέση του σταθμού, όχι επιβεβαίωση στον δρόμο σου.','Observed at the station, not verified on your exact street.'):live.kind==='recent_gauge'?X('Η ποσότητα της τελευταίας ώρας δεν αποδεικνύει βροχή αυτή τη στιγμή.','Past-hour accumulation does not prove rain right now.'):X('Δείχνουμε τι αναφέρθηκε — όχι μια υποτιθέμενη μέτρηση.','This shows reported observations, not an invented measurement.');
 const liveCard='<div class="ri-live '+(live.kind==='rain'?'ri-wet':'')+'" role="status"><div class="ri-live-icon" aria-hidden="true">'+liveIcon+'</div><div class="ri-live-copy"><strong>'+liveTitle+'</strong><span>'+liveMeta+'</span><small>'+liveNote+'</small></div><button type="button" class="ri-live-action" data-action="goto" data-page="stations">'+X('Σταθμοί','Stations')+' ↗</button></div>';

 const nearGauges=[...(stations||[]).map(s=>observed([s],null,now)),
   ...(pws?.stations||[]).map(s=>observed([],{stations:[s]},now))]
   .filter(g=>g&&fin(g.dist)&&g.dist<=35).sort((a,b)=>a.dist-b.dist).slice(0,6);
 const nearCards=nearGauges.map(g=>'<button type="button" class="ri-station" data-action="goto" data-page="stations">'+
   '<span class="ri-station-icon" aria-hidden="true">📍</span><span class="ri-station-name">'+escape(g.name)+
   '<small>'+num(g.dist,1)+' km · '+escape(g.type)+' · '+num(g.covered,0)+'/24 h</small></span>'+
   '<strong>'+num(g.mm,1)+' mm</strong></button>').join('');
 const nearbySection='<div class="ri-near-title">'+X('Πραγματικές μετρήσεις από κοντινούς σταθμούς','Nearby recorded rainfall')+'</div>'+
   (nearCards?'<div class="ri-stations">'+nearCards+'</div>':
    '<p class="ri-blank">'+X('Δεν υπάρχει επιβεβαιωμένη ποσότητα βροχής από κοντινό βροχόμετρο.','No verified rain amount from a nearby gauge.')+'</p>');
 const M=metrics(train,shared),co=fin(cloud)?(cloud<20?X('Λίγα σύννεφα','Mostly clear'):cloud<50?X('Λίγη συννεφιά','Partly cloudy'):cloud<80?X('Αρκετή συννεφιά','Mostly cloudy'):X('Συννεφιασμένος','Overcast')):X('Χωρίς στοιχεία','No data');
 const rainText=obs?(obs.type==='PWS-area'?X('Δείγμα από ιδιωτικούς αισθητήρες ευρύτερης περιοχής','Sample of private sensors across the broader area'):
    X(`Σταθμός ${escape(obs.name)} · ${num(obs.dist,0)} km`,`Station ${escape(obs.name)} · ${num(obs.dist,0)} km`)):
    X('Δεν βρέθηκε διαθέσιμο βροχόμετρο','No usable rain gauge');
 const rainNote=obs?X((obs.type==='Netatmo'?'Κυλιόμενο 24ωρο':(obs.covered<24?'Μερική κάλυψη '+num(obs.covered,0)+' ωρών — ΔΕΝ είναι σύνολο ημέρας':'Κάλυψη '+num(obs.covered,0)+'/24 ωρών'))+' · '+clock(obs.t)+' · χωρίς συμπλήρωση κενών',(obs.type==='Netatmo'?'Rolling 24 hours':(obs.covered<24?'Partial '+num(obs.covered,0)+'-hour coverage — NOT a daily total':'Coverage '+num(obs.covered,0)+'/24 h'))+' · '+clock(obs.t)+' · no gaps filled'):X('Δεν βαφτίζουμε μια πρόγνωση «μέτρηση».','A model estimate is not a measurement.');
 const accTxt=fin(M.amountMae)?X(`Μέσο απόλυτο σφάλμα ${num(M.amountMae,2)} mm/ώρα`,`Mean absolute error ${num(M.amountMae,2)} mm/hour`):X('Ανεπαρκές δείγμα ελέγχου','Not enough verified history');
 const card=(ico,name,big,body,note,cl='')=>`<article class="card ri-card ${cl}"><div class="ri-top"><span class="ri-icon" aria-hidden="true">${ico}</span><span class="ri-kicker">${name}</span></div><strong class="ri-number">${big}</strong><div class="ri-main">${body}</div><small class="ri-note">${note}</small></article>`;
 const cards=[
 card('☂',X('ΠΟΣΗ ΒΡΟΧΗ ΕΡΙΞΕ','RAIN REPORTED'),obs?`${num(obs.mm)} <i>mm</i>`:'—',rainText,rainNote),
 card('🌧',X('ΤΙ ΒΡΟΧΗ ΕΡΧΕΤΑΙ','RAIN AHEAD'),fin(mm)?`${num(mm)} <i>mm</i>`:'—',X('Επόμενες 24 ώρες','Next 24 hours'),X('Ποσότητα από τον συνδυασμό μοντέλων · όχι βεβαιότητα','Multi-model amount · not a guarantee')),
 card('🎯',X('ΠΟΣΟ ΜΕΣΑ ΠΕΣΑΜΕ','FORECAST SKILL'),fin(M.amountMae)?`${num(M.amountMae,2)} <i>mm</i>`:'—',accTxt,fin(M.amountMae)?X(`Έλεγχος σε ιστορικό ανεξάρτητο δείγμα (${M.rain?.n?.test??M.shared?.rain?.n??0} ώρες), με επανάλυση ERA5, όχι επιτόπιο βροχόμετρο`,`Historical held-out check (${M.rain?.n?.test??M.shared?.rain?.n??0} hours), against ERA5 reanalysis, not a local gauge`):X(trainingStatus==='loading'?'Υπολογίζουμε την ιστορική ακρίβεια…':'Δεν έχει ολοκληρωθεί έλεγχος',trainingStatus==='loading'?'Calculating historical skill…':'Historical evaluation unavailable')),
 card('☁',X('ΠΩΣ ΘΑ ΕΙΝΑΙ Ο ΟΥΡΑΝΟΣ','SKY COVER'),fin(cloud)?`${num(cloud,0)}<i>%</i>`:'—',co,X('Μέση προβλεπόμενη νέφωση επόμενων 6 ωρών','Average forecast cloud cover, next 6 hours'))];
 const cloudFoot=fin(M.cloudMae)?X(`Εκπαίδευση νεφών: ιστορικό μέσο σφάλμα ${num(M.cloudMae,1)} ποσοστιαίες μονάδες (ERA5).`,`Cloud model: historical error ${num(M.cloudMae,1)} percentage points (ERA5).`):X('Η νέφωση εμφανίζεται από τα διαθέσιμα μοντέλα· η εκπαίδευσή της απαιτεί ιστορικά δεδομένα.','Cloud cover comes from available models; training requires historical samples.');
 return `<section class="section ri-section" aria-label="${X('Η βροχή με μια ματιά','Rain at a glance')}"><div class="sectionhead"><div><span class="label">MONO / RAIN INTELLIGENCE</span><h2 class="h2">${X('Ο καιρός σε 4 εικόνες','Weather in four icons')}</h2><p class="section-sub">${X('Μέτρηση, πρόγνωση και έλεγχος: τρία διαφορετικά πράγματα.','Observation, forecast, and verification are different.')}</p></div></div>${liveCard}${nearbySection}<div class="ri-grid">${cards.join('')}</div>${stationLearningCard(stationLearning,lang,view.zone||'Europe/Athens',now)}<p class="ri-foot">☁ ${cloudFoot}</p><p class="ri-foot">${shared?.shared?X('🌐 Κοινό ιστορικό μοντέλο διαθέσιμο σε κινητό και υπολογιστή. Τοπική εκπαίδευση ανά συσκευή.','🌐 Shared historical learning across devices. Local training stays per device.'):X('Τοπική εκπαίδευση ανά συσκευή · κοινά στοιχεία για υποστηριζόμενες πόλεις.','Local training per device · shared results for supported cities.')}</p></section>`;
}
root.MONORainIntelligence={render,observed,present,metrics,stationAmount,stationLearningCard};
if(typeof module!=='undefined'&&module.exports)module.exports={render,observed,present,metrics,stationAmount,stationLearningCard};
})(typeof window!=='undefined'?window:globalThis);
