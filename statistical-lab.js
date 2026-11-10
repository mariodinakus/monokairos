/* MONO statistical observatory. Forecast correlations are NOT observation-based validation. */
(function(root){
'use strict';
const fin=Number.isFinite, MIN=24;
const VARS=[
 {id:'temp',el:'Θερμοκρασία',en:'Temperature',unit:'°C'},
 {id:'rh',el:'Υγρασία',en:'Humidity',unit:'%'},
 {id:'pres',el:'Πίεση',en:'Pressure',unit:'hPa'},
 {id:'cloud',el:'Νέφη',en:'Clouds',unit:'%'},
 {id:'wind',el:'Άνεμος',en:'Wind',unit:'km/h'},
 {id:'amount',el:'Υετός',en:'Precipitation',unit:'mm/h'},
 {id:'feels',el:'Αίσθηση',en:'Feels like',unit:'°C'},
 {id:'gust',el:'Ριπές',en:'Wind gusts',unit:'km/h'},
 {id:'uv',el:'Δείκτης UV',en:'UV index',unit:'UV'},
 {id:'vis',el:'Ορατότητα',en:'Visibility',unit:'km'},
 {id:'cape',el:'CAPE',en:'CAPE',unit:'J/kg'},
 {id:'snow',el:'Χιονόπτωση',en:'Snowfall',unit:'cm/h'},
 {id:'rainprob',el:'Πιθανότητα υετού MONO',en:'MONO rain probability',unit:'%'},
 {id:'rainfinal',el:'Πιθανότητα υετού τελική',en:'Final rain probability',unit:'%'},
 {id:'dew',el:'Σημείο δρόσου',en:'Dew point',unit:'°C'},
 {id:'dewgap',el:'Απόσταση σημείου δρόσου',en:'Dew point spread',unit:'°C'},
 {id:'pressure3',el:'Μεταβολή πίεσης 3 ωρών',en:'3-hour pressure change',unit:'hPa'}
];
const CHOICES=[];
for(let i=0;i<VARS.length;i++) for(let j=i+1;j<VARS.length;j++) {
 const x=VARS[i],y=VARS[j];
 CHOICES.push({id:x.id+'-'+y.id,x:x.id,y:y.id,el:x.el+' / '+y.el,en:x.en+' / '+y.en});
}

let active='pres-amount', hours=120;
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,lang,d=2)=>fin(x)?new Intl.NumberFormat(lang==='en'?'en-GB':'el-GR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(x):'—';
function dataset(view){
 const rows=Array.isArray(view?.rows)?view.rows:[];
 const start=fin(view?.iNow)?Math.max(0,view.iNow):0;
 return rows.slice(start,start+hours).filter(x=>fin(x?.t)).map(row=>{
  const o={t:row.t};
  VARS.forEach(v=>{o[v.id]=fin(row[v.id])?row[v.id]:null;});
  const avg=x=>{const a=Object.values(x||{}).filter(fin);return a.length?a.reduce((u,v)=>u+v,0)/a.length:null;};
  o.vis=fin(row.visMain)?row.visMain/1000:null;
  o.cape=avg(row.vi?.cape) ?? (fin(row.capeMain)?row.capeMain:null); o.snow=avg(row.vi?.snowf) ?? (fin(row.snowMain)?row.snowMain:null);
  o.rainprob=fin(row.pMono)?100*row.pMono:null;
  o.rainfinal=fin(row.pop)?100*row.pop:null;
  o.dew=fin(row.dew)?row.dew:(fin(row.dewMain)?row.dewMain:null);
  o.dewgap=fin(row.temp)&&fin(o.dew)?row.temp-o.dew:null;
  const prev=rows.find(r=>r.t===row.t-3*3600000);
  o.pressure3=fin(row.pres)&&fin(prev?.pres)?row.pres-prev.pres:null;
  return o;
 });
}
function paired(data,x,y){return data.filter(r=>fin(r[x])&&fin(r[y])).map(r=>[r[x],r[y]]);}
function pearson(a){
 if(a.length<MIN)return null;
 const n=a.length,mx=a.reduce((s,p)=>s+p[0],0)/n,my=a.reduce((s,p)=>s+p[1],0)/n;
 let sx=0,sy=0,cov=0;
 a.forEach(p=>{const x=p[0]-mx,y=p[1]-my;sx+=x*x;sy+=y*y;cov+=x*y;});
 return sx>1e-14&&sy>1e-14?Math.max(-1,Math.min(1,cov/Math.sqrt(sx*sy))):null;
}
function ranks(a){
 const sorted=a.map((v,i)=>({v,i})).sort((x,y)=>x.v-y.v),out=Array(a.length);
 for(let i=0;i<sorted.length;){
  let end=i+1;while(end<sorted.length&&sorted[end].v===sorted[i].v)end++;
  for(let j=i;j<end;j++)out[sorted[j].i]=(i+1+end)/2;
  i=end;
 }
 return out;
}
function spearman(a){
 if(a.length<MIN)return null;
 const x=ranks(a.map(p=>p[0])),y=ranks(a.map(p=>p[1]));
 return pearson(x.map((v,i)=>[v,y[i]]));
}
function regression(a){
 const r=pearson(a);if(r===null)return null;
 const mx=a.reduce((s,p)=>s+p[0],0)/a.length,my=a.reduce((s,p)=>s+p[1],0)/a.length;
 let cov=0,xx=0;a.forEach(p=>{cov+=(p[0]-mx)*(p[1]-my);xx+=(p[0]-mx)**2;});
 const slope=cov/xx;
 return {r,r2:r*r,n:a.length,slope,intercept:my-slope*mx};
}
function matrix(data){
 return VARS.map(v=>VARS.map(w=>{
  const a=paired(data,v.id,w.id);return {x:v.id,y:w.id,n:a.length,r:pearson(a),rho:spearman(a)};
 }));
}
function heatmap(mat,lang){
 const en=lang==='en',name=v=>esc(v[en?'en':'el']);
 let h='<div class="sl-table-wrap"><table class="sl-table"><thead><tr><th scope="col">'+(en?'Variable':'Μεταβλητή')+'</th>'+VARS.map(v=>'<th scope="col">'+name(v)+'</th>').join('')+'</tr></thead><tbody>';
 VARS.forEach((v,i)=>{h+='<tr><th scope="row">'+name(v)+'</th>';VARS.forEach((w,j)=>{
  const c=mat[i][j],r=c.r,alpha=r===null?0:Math.abs(r),color=r===null?'var(--soft)':r>=0?'rgba(33,124,147,'+(.10+.65*alpha)+')':'rgba(196,105,60,'+(.10+.63*alpha)+')';
  const label=name(v)+' / '+name(w)+' · r='+fmt(r,lang)+' · n='+c.n;
  h+='<td><button type="button" data-sl-cell-x="'+v.id+'" data-sl-cell-y="'+w.id+'" title="'+label+'" aria-label="'+label+'" style="background:'+color+'">'+fmt(r,lang)+'</button></td>';
 });h+='</tr>';});
 return h+'</tbody></table></div>';
}

function scatter(data,choice,lang){
 const en=lang==='en',a=paired(data,choice.x,choice.y),reg=regression(a);
 if(!reg)return '<p class="sl-empty">'+(en?'Insufficient paired variation for a scatter plot.':'Δεν υπάρχουν αρκετά έγκυρα ζεύγη με διακύμανση για το γράφημα.')+'</p>';
 const xm=VARS.find(v=>v.id===choice.x),ym=VARS.find(v=>v.id===choice.y),xs=a.map(p=>p[0]),ys=a.map(p=>p[1]);
 const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys),dx=(maxx-minx||1)*.08,dy=(maxy-miny||1)*.12;
 const xa=minx-dx,xb=maxx+dx,ya=miny-dy,yb=maxy+dy,W=600,H=330,L=67,R=22,T=18,B=51;
 const sx=x=>L+(x-xa)/(xb-xa)*(W-L-R),sy=y=>H-B-(y-ya)/(yb-ya)*(H-T-B);
 let s='<svg viewBox="0 0 '+W+' '+H+'" class="sl-svg" role="img" aria-label="'+(en?'Forecast scatter plot and OLS fit':'Διάγραμμα διασποράς πρόγνωσης και γραμμή OLS')+'">';
 for(let i=0;i<5;i++){
  const q=i/4,y=T+(H-T-B)*q,x=L+(W-L-R)*q;
  s+='<line class="sl-gridline" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/>'+
    '<text class="sl-tick" x="'+(L-10)+'" y="'+(y+4)+'" text-anchor="end">'+fmt(yb-q*(yb-ya),lang,1)+'</text>'+
    '<text class="sl-tick" x="'+x+'" y="'+(H-B+20)+'" text-anchor="middle">'+fmt(xa+q*(xb-xa),lang,1)+'</text>';
 }
 a.forEach(p=>{s+='<circle class="sl-dot" cx="'+sx(p[0]).toFixed(2)+'" cy="'+sy(p[1]).toFixed(2)+'" r="3.5"><title>'+
   fmt(p[0],lang,2)+' '+xm.unit+' · '+fmt(p[1],lang,2)+' '+ym.unit+'</title></circle>';});
 s+='<line class="sl-fit" x1="'+sx(minx)+'" y1="'+sy(reg.intercept+reg.slope*minx)+'" x2="'+sx(maxx)+'" y2="'+sy(reg.intercept+reg.slope*maxx)+'"/>'+
  '<text class="sl-axis-title" x="'+(L+(W-L-R)/2)+'" y="'+(H-6)+'" text-anchor="middle">'+esc(xm[en?'en':'el'])+' ('+xm.unit+')</text>'+
  '<text class="sl-axis-title" transform="translate(15 '+(T+(H-T-B)/2)+') rotate(-90)" text-anchor="middle">'+esc(ym[en?'en':'el'])+' ('+ym.unit+')</text></svg>';
 const direction=reg.r>0?(en?'move in the same direction':'τείνουν να κινούνται προς την ίδια κατεύθυνση'):reg.r<0?(en?'move in opposite directions':'τείνουν να κινούνται προς αντίθετες κατευθύνσεις'):(en?'show no linear relationship':'δεν εμφανίζουν γραμμική σχέση');
 return s+'<div class="sl-metrics"><span>Pearson r <b>'+fmt(reg.r,lang)+'</b></span><span>Spearman ρ <b>'+fmt(spearman(a),lang)+'</b></span><span>R² <b>'+fmt(reg.r2,lang)+'</b></span><span>n <b>'+reg.n+'</b></span></div>'+
 '<p class="sl-note">'+(en?'In this forecast, the variables ':'Σε αυτή την πρόγνωση, οι μεταβλητές ')+direction+'. '+(en?'Linear slope: ':'Γραμμική κλίση: ')+fmt(reg.slope,lang,3)+' '+esc(ym.unit)+' / '+esc(xm.unit)+'.</p>';
}
function observations(data,lang){
 const en=lang==='en';
 const pairs=[['rh','amount'],['cloud','amount'],['pres','amount'],['pressure3','amount'],['wind','gust'],['temp','rh'],['cape','amount']];
 const name=id=>VARS.find(v=>v.id===id)?.[en?'en':'el']||id;
 const findings=pairs.map(([x,y])=>{const a=paired(data,x,y);return {x,y,n:a.length,r:pearson(a)};}).filter(p=>p.r!==null&&Math.abs(p.r)>=.2).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r)).slice(0,3);
 let h='<section class="sl-panel sl-observations"><div class="sl-sectiontitle"><span>MONO / WEATHER INSIGHTS</span><h3>'+(en?'What MONO observes':'Τι παρατηρεί το MONO')+'</h3><p>'+(en?'Patterns in the selected hourly forecast window.':'Μοτίβα στο επιλεγμένο χρονικό διάστημα ωριαίας πρόγνωσης.')+'</p></div>';
 if(!findings.length)h+='<p class="sl-empty">'+(en?'No notable linear relationship with enough paired hours in this window.':'Δεν εντοπίστηκε αξιοσημείωτη γραμμική συσχέτιση με επαρκείς κοινές ώρες σε αυτό το διάστημα.')+'</p>';
 else h+='<div class="sl-insight-list">'+findings.map(p=>{const direction=p.r>0?(en?'tend to rise and fall together':'τείνουν να ανεβαίνουν και να πέφτουν μαζί'):(en?'tend to move in opposite directions':'τείνουν να κινούνται αντίθετα');return '<div class="sl-insight"><b>'+esc(name(p.x))+' ↔ '+esc(name(p.y))+'</b><p>'+(en?'In this forecast they ':'Σε αυτή την πρόγνωση ')+direction+'.</p><small>r = '+fmt(p.r,lang)+' · '+(en?'paired hours':'κοινές ώρες')+' '+p.n+'</small></div>';}).join('')+'</div>';
 const valid=data.filter(r=>fin(r.rh)&&fin(r.amount));
 if(valid.length>=24){
  const sorted=valid.map(r=>r.rh).sort((a,b)=>a-b),mid=sorted.length>>1,median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  const low=valid.filter(r=>r.rh<=median),high=valid.filter(r=>r.rh>median);
  if(low.length>=12&&high.length>=12){const avg=a=>a.reduce((s,r)=>s+r.amount,0)/a.length;
   h+='<div class="sl-comparison"><b>'+(en?'Humidity and forecast precipitation':'Υγρασία και προβλεπόμενος υετός')+'</b><p>'+(en?'Using this window’s median humidity':'Με όριο τη διάμεση υγρασία του διαστήματος')+' ('+fmt(median,lang,1)+'%): '+(en?'at or below the median, average':'στις ώρες με υγρασία έως το όριο, ο μέσος υετός είναι')+' '+fmt(avg(low),lang,3)+' mm/h (n='+low.length+'); '+(en?'above the median, average':'στις ώρες πάνω από το όριο')+' '+fmt(avg(high),lang,3)+' mm/h (n='+high.length+').</p></div>';
  }
 }
 return h+'<p class="sl-note">'+(en?'These are descriptions of forecasts, not observations or causal effects. Hourly values are time-dependent; derived variables and shared model inputs can create strong relationships.':'Οι παρατηρήσεις περιγράφουν προβλέψεις, όχι μετρήσεις ή σχέσεις αιτίας–αποτελέσματος. Οι διαδοχικές ώρες συνδέονται μεταξύ τους και οι κοινές ή παράγωγες μεταβλητές μπορούν να ενισχύουν τις συσχετίσεις.')+'</p></section>';
}
function rankedPairs(mat,lang){
 const en=lang==='en', pairs=[];
 for(let i=0;i<VARS.length;i++) for(let j=i+1;j<VARS.length;j++) {
  const c=mat[i][j]; if(c.r!==null) pairs.push(c);
 }
 pairs.sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
 if(!pairs.length)return '';
 const name=id=>VARS.find(v=>v.id===id)[en?'en':'el'];
 return '<article class="sl-panel"><h3>'+(en?'Strongest forecast relationships':'Οι ισχυρότερες σχέσεις της πρόγνωσης')+'</h3><div class="sl-bars">'+
 pairs.slice(0,5).map(c=>'<div class="sl-bar-row"><div class="sl-bar-name"><b>'+esc(name(c.x))+' ↔ '+esc(name(c.y))+'</b><small>n='+c.n+' · Spearman ρ '+fmt(c.rho,lang)+'</small></div><div class="sl-track"><span style="width:'+(100*Math.abs(c.r)).toFixed(1)+'%"></span></div><strong>r '+fmt(c.r,lang)+'</strong></div>').join('')+
 '</div><p class="sl-note">'+(en?'Ranked by absolute Pearson correlation; the sign shows direction.':'Κατάταξη με βάση την απόλυτη τιμή Pearson· το πρόσημο δείχνει την κατεύθυνση.')+'</p></article>';
}
function benchmarks(train,lead,lang){
 const en=lang==='en',T=train?.temp?.leads?.[lead],P=train?.precip?.leads?.[lead];
 const labels={mean:'Mean',best:'Best model',mos:'MOS',ridge:'Ridge',kalman:'Kalman',analog:'Analog',combo:'Blend',persist:'Persistence',clim:'Climatology'};
 const items=Object.entries(labels).map(([key,label])=>({key,label,test:T?.test?.[key]}))
  .filter(a=>fin(a.test?.mae)&&a.test.mae>=0&&fin(a.test?.n)&&a.test.n>=10).sort((a,b)=>a.test.mae-b.test.mae);
 let s='<section class="sl-benchmark"><div class="sl-sectiontitle"><span>MODEL BENCHMARK</span><h3>'+(en?'Temperature: test-set comparison':'Θερμοκρασία: σύγκριση στο test set')+'</h3><p>'+(en?'Holdout MAE and RMSE · lower is better':'MAE και RMSE σε ανεξάρτητο χρονικό τμήμα ελέγχου · μικρότερο είναι καλύτερο')+'</p></div>';
 if(items.length){
  const max=Math.max(.001,...items.map(a=>a.test.mae));
  s+='<div class="sl-bars">'+items.map(a=>'<div class="sl-bar-row"><div class="sl-bar-name"><b>'+esc(a.label)+'</b><small>RMSE '+fmt(a.test.rmse,lang,2)+'° · n='+a.test.n+'</small></div>'+
   '<div class="sl-track"><span style="width:'+(100*a.test.mae/max).toFixed(1)+'%"></span></div><strong>'+fmt(a.test.mae,lang,2)+'°</strong></div>').join('')+'</div>';
 }else s+='<p class="sl-empty">'+(en?'No eligible test scores for this lead yet.':'Δεν υπάρχουν ακόμη επαρκείς βαθμολογίες test για αυτόν τον ορίζοντα.')+'</p>';
 const pKeys=['mean','vote','logistic','analog','combo','clim'];
 const rain=pKeys.map(key=>({key,v:P?.test?.[key]})).filter(x=>fin(x.v)&&x.v>=0).sort((a,b)=>a.v-b.v);
 if(rain.length>=2){
  const max=Math.max(.001,...rain.map(x=>x.v));
  s+='<div class="sl-sectiontitle sl-sectiontitle-small"><h3>'+(en?'Rain probability: Brier score':'Πιθανότητα βροχής: Brier score')+'</h3></div><div class="sl-bars sl-rain-bars">'+rain.map(x=>
   '<div class="sl-bar-row"><div class="sl-bar-name"><b>'+esc(labels[x.key]||x.key)+'</b></div><div class="sl-track"><span style="width:'+(100*x.v/max).toFixed(1)+'%"></span></div><strong>'+fmt(x.v,lang,3)+'</strong></div>'
  ).join('')+'</div>';
 }
 s+='<p class="sl-note">'+(en?'These scores use the existing MONO held-out evaluation, unlike the forecast-only correlation plots.':'Οι βαθμολογίες βασίζονται στο υπάρχον δείγμα ελέγχου του MONO, σε αντίθεση με τις συσχετίσεις προγνώσεων παραπάνω.')+'</p></section>';
 return s;
}
function experimental(train,lead,lang){
 const en=lang==='en',ml=train?.experimentalML,labels={mean:en?'Model mean':'Μέσος μοντέλων',ridge:'Ridge regression',forest:'Random Forest'};
 let h='<section class="sl-benchmark"><div class="sl-sectiontitle"><span>MONO / EXPERIMENTAL ML</span><h3>'+(en?'Machine learning model lab':'Εργαστήριο μοντέλων Machine Learning')+'</h3><p>'+(en?'Experimental comparison against ERA5 · chronological 60 / 20 / 20 split':'Πειραματική σύγκριση με ERA5 · χρονολογικός διαχωρισμός 60 / 20 / 20')+'</p></div>';
 if(!ml)return h+'<p class="sl-empty">'+(en?'Waiting for the updated historical evaluation.':'Αναμονή για τη νέα ιστορική αξιολόγηση. Αν παραμένει κενό, πάτησε επανεκπαίδευση.')+'</p></section>';
 h+='<div class="sl-sectiontitle sl-sectiontitle-small"><span>PHENOMENA / CLASSIFICATION</span><h3>'+(en?'Phenomena: probability models':'Φαινόμενα: μοντέλα πιθανοτήτων')+'</h3><p>'+(en?'Brier score on unseen hours; lower is better.':'Brier score σε ώρες που δεν είδαν τα μοντέλα · μικρότερο είναι καλύτερο.')+'</p></div>';
 for(const [key,elLabel,enLabel] of [['rain','Υετός ≥ 0,2 mm/ώρα','Precipitation ≥ 0.2 mm/hour'],['frost','Παγετός: θερμοκρασία ≤ 0°C','Frost: temperature ≤ 0°C'],['strongwind','Ισχυρός μέσος άνεμος ≥ 39 km/h','Strong sustained wind ≥ 39 km/h']]){
  const d=ml[key]?.[lead];h+='<div class="sl-sectiontitle sl-sectiontitle-small"><h3>'+esc(en?enLabel:elLabel)+' · D+'+lead+'</h3></div>';
  if(!d){h+='<p class="sl-empty">'+(en?'Not enough aligned data or historical events for reliable training.':'Δεν υπάρχουν αρκετά κοινά δεδομένα ή ιστορικά συμβάντα για εκπαίδευση.')+'</p>';continue;}
  const labels={clim:en?'Historical frequency':'Ιστορική συχνότητα',logistic:en?'Logistic regression':'Λογιστική παλινδρόμηση',forest:'Random Forest'},names=['clim','logistic','forest'],max=Math.max(.001,...names.map(m=>d.test?.[m]?.brier||0));
  h+='<div class="sl-bars">'+names.map(m=>{const a=d.test?.[m],v=d.validation?.[m];if(!a)return '';return '<div class="sl-bar-row"><div class="sl-bar-name"><b>'+esc(labels[m])+'</b><small>'+(en?'Validation':'Επικύρωση')+' '+fmt(v?.brier,lang,3)+' · n='+a.n+'</small></div><div class="sl-track"><span style="width:'+(100*a.brier/max).toFixed(1)+'%"></span></div><strong>'+fmt(a.brier,lang,3)+'</strong></div>';}).join('')+'</div>';
  h+='<p class="sl-note">'+(en?'Test events':'Συμβάντα τεστ')+': '+d.test.clim.wet+' / '+d.test.clim.n+' · '+(en?'Training events':'Συμβάντα εκπαίδευσης')+': '+d.wetTrain+' / '+d.train+' · '+d.trees+' trees.</p>';
 }
 h+='<p class="sl-caution">'+(en?'These are experimental historical probability scores, not live event probabilities. Wind is hourly 10 m speed, not gusts. Thunderstorms and snow need additional historical variables and separate verification.':'Πειραματική αξιολόγηση ιστορικών πιθανοτήτων, όχι ζωντανή πιθανότητα φαινομένου. Ο άνεμος αφορά ωριαία ταχύτητα στα 10 m, όχι ριπές. Οι καταιγίδες και το χιόνι χρειάζονται πρόσθετες ιστορικές μεταβλητές και ξεχωριστό έλεγχο.')+'</p>';
 for(const key of ['temp','wind']){
  const d=ml[key]?.[lead],unit=key==='temp'?'°C':'km/h';h+='<div class="sl-sectiontitle sl-sectiontitle-small"><h3>'+(key==='temp'?(en?'Temperature':'Θερμοκρασία'):(en?'Wind speed':'Ταχύτητα ανέμου'))+' · D+'+lead+'</h3></div>';
  if(!d){h+='<p class="sl-empty">'+(en?'Insufficient aligned historical data for this lead.':'Δεν υπάρχουν αρκετά κοινά ιστορικά δεδομένα για αυτόν τον ορίζοντα.')+'</p>';continue;}
  const names=['mean','ridge','forest'],max=Math.max(.001,...names.map(m=>d.test?.[m]?.mae||0));
  h+='<div class="sl-bars">'+names.map(m=>{const a=d.test?.[m],v=d.validation?.[m];if(!a)return '';return '<div class="sl-bar-row"><div class="sl-bar-name"><b>'+esc(labels[m])+'</b><small>'+(en?'Validation MAE':'MAE επικύρωσης')+' '+fmt(v?.mae,lang)+' · RMSE '+fmt(a.rmse,lang)+' · n='+a.n+'</small></div><div class="sl-track"><span style="width:'+(100*a.mae/max).toFixed(1)+'%"></span></div><strong>'+fmt(a.mae,lang)+' '+unit+'</strong></div>';}).join('')+'</div>';
  h+='<p class="sl-note">'+(en?'Training':'Εκπαίδευση')+': n='+d.train+' · '+d.trees+' trees · '+(en?'Inputs: archived forecasts and hour of day':'Είσοδοι: ιστορικές προγνώσεις μοντέλων και ώρα ημέρας')+' · '+esc(d.models.join(', '))+'.</p>';
 }
 return h+'<p class="sl-caution">'+(en?'All three methods use the same paired test hours. Forecasts are compared with ERA5 reanalysis, not a local station. Experimental models are not used in the live MONO forecast; scores do not guarantee future performance.':'Και οι τρεις μέθοδοι συγκρίνονται στις ίδιες κοινές ώρες τεστ. Η ERA5 είναι αναανάλυση και όχι μέτρηση τοπικού σταθμού. Τα πειραματικά μοντέλα δεν χρησιμοποιούνται στη ζωντανή πρόγνωση MONO και οι ιστορικές επιδόσεις δεν εγγυώνται μελλοντική απόδοση.')+'</p></section>';
}
function render({view,train,lead=0,lang='el'}={}){
 const en=lang==='en',data=dataset(view),m=matrix(data),best=m.flat().filter(c=>c.x!==c.y&&c.r!==null&&c.n>=MIN).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r))[0];
 const name=id=>VARS.find(v=>v.id===id)?.[en?'en':'el']||id;
 const pair=CHOICES.find(c=>c.id===active)||CHOICES[0];
 const options=(chosen)=>VARS.map(v=>'<option value="'+v.id+'" '+(v.id===chosen?'selected':'')+'>'+esc(v[en?'en':'el'])+'</option>').join('');
 const buttons='<label>'+(en?'Variable X':'Μεταβλητή Χ')+' <select data-sl-x>'+options(pair.x)+'</select></label> <label>'+(en?'Variable Y':'Μεταβλητή Υ')+' <select data-sl-y>'+options(pair.y)+'</select></label>';
 return '<section class="section card sl-root" id="mono-statistical-lab">'+
  '<header class="sl-heading"><div><span class="sl-overline">MONO / STATISTICAL OBSERVATORY</span><h2>'+(en?'Correlations & statistical models':'Συσχετίσεις & στατιστικά μοντέλα')+'</h2>'+
  '<p>'+(en?'Explore relationships in the model forecast; compare methods using separate test scores.':'Εξερεύνησε τις συσχετίσεις της πρόγνωσης και σύγκρινε τις μεθόδους με ξεχωριστά αποτελέσματα ελέγχου.')+'</p></div>'+
  '<div class="sl-count">'+data.length+' '+(en?'forecast hours':'ώρες πρόγνωσης')+' · '+hours+' h</div></header>'+
  '<div class="sl-range"><span>'+(en?'Forecast window':'Εύρος πρόγνωσης')+'</span>'+[24,72,120].map(n=>'<button type="button" data-sl-hours="'+n+'" aria-pressed="'+(n===hours)+'" class="'+(n===hours?'active':'')+'">'+n+' h</button>').join('')+'</div>'+
  '<div class="sl-highlights"><div><small>'+(en?'STRONGEST PAIR':'ΙΣΧΥΡΟΤΕΡΟ ΖΕΥΓΟΣ')+'</small><b>'+(best?esc(name(best.x))+' ↔ '+esc(name(best.y)):(en?'Not enough data':'Ανεπαρκή δεδομένα'))+'</b><span>'+(best?'Pearson r = '+fmt(best.r,lang)+' · n='+best.n:'—')+'</span></div>'+
  '<div><small>'+(en?'STATISTICAL METHODS':'ΣΤΑΤΙΣΤΙΚΕΣ ΜΕΘΟΔΟΙ')+'</small><b>Pearson · Spearman · OLS</b><span>'+(en?'Minimum 24 paired hours':'Τουλάχιστον 24 κοινές ώρες')+'</span></div></div>'+
  '<div class="sl-layout"><article class="sl-panel"><h3>'+(en?'Correlation matrix':'Πίνακας συσχετίσεων')+'</h3>'+heatmap(m,lang)+ 
  '<p class="sl-note">'+(en?'Pairwise Pearson correlations from hourly forecasts. Select a cell to explore it; scroll horizontally to see all variables.':'Pearson ανά ζεύγος από ωριαίες προβλέψεις. Πάτησε ένα κελί για να δεις το διάγραμμα. Σύρε οριζόντια για όλες τις μεταβλητές.')+'</p></article>'+
  '<article class="sl-panel"><h3>'+(en?'Scatter & linear fit':'Διασπορά και γραμμική τάση')+'</h3><p class="sl-note">'+(en?'Choose any two of the 17 forecast variables.':'Επίλεξε οποιεσδήποτε δύο από τις 17 μεταβλητές πρόγνωσης.')+'</p><div class="sl-choices">'+buttons+'</div><div id="sl-scatter">'+scatter(data,pair,lang)+'</div>'+
  '<p class="sl-note">'+(en?'OLS is descriptive; R² is not forecast accuracy.':'Η παλινδρόμηση OLS είναι περιγραφική· το R² δεν είναι ακρίβεια πρόγνωσης.')+'</p></article></div>'+
  observations(data,lang)+rankedPairs(m,lang)+experimental(train,lead,lang)+benchmarks(train,lead,lang)+
  '<p class="sl-caution">'+(en?'Interpretation: these correlations arise from predicted values, NOT observed measurements. Some variables are mathematically related (e.g. feels-like and temperature); many zero rain or snowfall values can affect correlations. Visibility and UV come from the main forecast; CAPE, snowfall and dew point use model averages where available, otherwise the main forecast, and rain probability is MONO before the final ensemble blend. Shared inputs and serial dependence affect correlations. No causal claim, p-value, or calibrated success probability is inferred.':'Ερμηνεία: οι συσχετίσεις προέρχονται από προβλέψεις, ΟΧΙ πραγματικές μετρήσεις. Ορισμένες μεταβλητές συνδέονται μαθηματικά (π.χ. αίσθηση και θερμοκρασία), ενώ πολλές μηδενικές τιμές υετού ή χιονιού μπορεί να επηρεάσουν τις συσχετίσεις. Η ορατότητα και ο UV προέρχονται από την κύρια πρόγνωση· CAPE, χιονόπτωση και σημείο δρόσου προέρχονται από τον μέσο όρο των διαθέσιμων μοντέλων ή, εναλλακτικά, από την κύρια πρόγνωση, η πιθανότητα MONO είναι πριν από τον τελικό συνδυασμό ensemble. Η διαφορά σημείου δρόσου και η τρίωρη μεταβολή πίεσης είναι παράγωγοι δείκτες. Οι κοινές είσοδοι και η χρονική αυτοσυσχέτιση επηρεάζουν τις τιμές. Δεν τεκμηριώνεται αιτιότητα, στατιστική σημαντικότητα ή πιθανότητα επιτυχίας.')+'</p></section>';
}
function mount({view,train,lead=0,lang='el'}={}){
 const rootNode=typeof document==='undefined'?null:document.getElementById('mono-statistical-lab');
 if(!rootNode)return;
 const data=dataset(view),host=rootNode.querySelector('#sl-scatter');
 const x=rootNode.querySelector('[data-sl-x]'),y=rootNode.querySelector('[data-sl-y]');
 const update=()=>{
  if(!x||!y||!host)return;
  if(x.value===y.value){host.innerHTML='<p class="sl-empty">'+(lang==='en'?'Choose two different variables.':'Επίλεξε δύο διαφορετικές μεταβλητές.')+'</p>';return;}
  const c={x:x.value,y:y.value};
  const forward=CHOICES.find(z=>z.x===c.x&&z.y===c.y);if(forward)active=forward.id;
  host.innerHTML=scatter(data,c,lang);
 };
 x?.addEventListener('change',update);y?.addEventListener('change',update);
 rootNode.querySelectorAll('[data-sl-cell-x]').forEach(btn=>btn.addEventListener('click',()=>{if(!x||!y)return;x.value=btn.dataset.slCellX;y.value=btn.dataset.slCellY;update();host?.scrollIntoView({behavior:'smooth',block:'nearest'});}));
 rootNode.querySelectorAll('[data-sl-hours]').forEach(btn=>btn.addEventListener('click',()=>{hours=Number(btn.dataset.slHours);rootNode.outerHTML=render({view,train,lead,lang});mount({view,train,lead,lang});}));
}
const api={render,mount,dataset,paired,pearson,spearman,regression,matrix,benchmarks};
root.MONOStats=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

