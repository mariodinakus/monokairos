/* MONO EC46 run comparison (local observations of fetched forecasts).
   No invented dates, no cross-week comparisons, no model-run identity claims.
   Persist only when the user opted into optional caching. */
(function(root){
'use strict';
var PREFIX='mono_ec46_snapshot_v1_', MAX=8, memory=new Map();
function finite(n){return typeof n==='number'&&Number.isFinite(n);}
function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'));}
function rowsOf(rows){
  return Array.isArray(rows)?rows.filter(function(r){return r&&validDate(r.date)&&(finite(r.temp)||finite(r.rain));}).slice(0,7).map(function(r){
    return {date:r.date,temp:finite(r.temp)?r.temp:null,rain:finite(r.rain)?r.rain:null};
  }):[];
}
function keyFor(city){return PREFIX+String(city||'').replace(/[^0-9.,-]/g,'').slice(0,35);}
function read(city,allowStore){
  var key=keyFor(city),items=memory.get(key);
  if(items)return items;
  if(!allowStore)return [];
  try{
    items=JSON.parse(root.localStorage.getItem(key));
    if(!Array.isArray(items))return [];
    items=items.filter(function(h){return h&&finite(h.at)&&Array.isArray(h.rows);}).slice(-MAX).map(function(h){return {at:h.at,rows:rowsOf(h.rows)};}).filter(function(h){return h.rows.length;});
    memory.set(key,items);
    return items;
  }catch{return [];}
}
function signature(rows){return JSON.stringify(rowsOf(rows).map(function(r){return [r.date,finite(r.temp)?Math.round(r.temp*100)/100:null,finite(r.rain)?Math.round(r.rain*100)/100:null];}));}
function record(city,rows,allowStore,at){
  var clean=rowsOf(rows);
  if(!clean.length)return false;
  var key=keyFor(city),items=read(city,allowStore).slice(),latest=items[items.length-1];
  if(latest&&signature(latest.rows)===signature(clean))return false;
  items.push({at:finite(at)?at:Date.now(),rows:clean});
  items=items.slice(-MAX);
  memory.set(key,items);
  if(allowStore)try{root.localStorage.setItem(key,JSON.stringify(items));}catch{}
  return true;
}
function comparisons(oldRows,newRows,now){
  var old=new Map(rowsOf(oldRows).map(function(r){return [r.date,r];}));
  return rowsOf(newRows).filter(function(r){
    var t=Date.parse(r.date+'T12:00:00Z');return t>=now+12*86400000&&old.has(r.date);
  }).map(function(r){
    var prior=old.get(r.date);
    var dt=finite(r.temp)&&finite(prior.temp)?r.temp-prior.temp:null;
    var dr=finite(r.rain)&&finite(prior.rain)?r.rain-prior.rain:null;
    return {date:r.date,oldTemp:prior.temp,newTemp:r.temp,oldRain:prior.rain,newRain:r.rain,
      deltaTemp:dt,deltaRain:dr,
      significant:(finite(dt)&&Math.abs(dt)>=0.5)||(finite(dr)&&Math.abs(dr)>=5)};
  });
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x];});}
function fmt(n,lang,d){return finite(n)?new Intl.NumberFormat(lang==='en'?'en-GB':'el-GR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n):'—';}
function signed(n,lang,unit){return finite(n)?(n>0?'+':'')+fmt(n,lang,1)+unit:'—';}
function when(at,lang){return new Intl.DateTimeFormat(lang==='en'?'en-GB':'el-GR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(at));}
function week(date,lang){
  var d=new Date(date+'T12:00:00Z'),e=new Date(d.getTime()+6*86400000),lc=lang==='en'?'en-GB':'el-GR';
  return new Intl.DateTimeFormat(lc,{day:'numeric',month:'short',timeZone:'UTC'}).format(d)+' – '+new Intl.DateTimeFormat(lc,{day:'numeric',month:'short',timeZone:'UTC'}).format(e);
}
function describe(c,lang){
  var en=lang==='en',parts=[];
  if(finite(c.deltaTemp)&&Math.abs(c.deltaTemp)>=0.5)parts.push(c.deltaTemp<0?(en?'Colder signal':'Ενισχύεται το ψυχρό σήμα'):(en?'Warmer signal':'Ενισχύεται το θερμό σήμα'));
  if(finite(c.deltaRain)&&Math.abs(c.deltaRain)>=5)parts.push(c.deltaRain>0?(en?'Wetter signal':'Πιο υγρή τάση'):(en?'Drier signal':'Πιο ξηρή τάση'));
  return parts.join(' · ');
}
function render(city,lang,allowStore){
  var en=lang==='en',items=read(city,allowStore),last=items[items.length-1],prior=items[items.length-2];
  var heading='<div class="mt-changes-top"><span class="mt-kicker">'+(en?'HOW THE MONTHLY TREND CHANGED':'ΠΩΣ ΑΛΛΑΞΕ Η ΜΗΝΙΑΙΑ ΤΑΣΗ')+'</span>';
  if(!last)return heading+'<p class="mt-changes-note">'+(en?'No valid comparison has been saved yet.':'Δεν υπάρχουν ακόμη αποθηκευμένα δεδομένα για σύγκριση.')+'</p></div>';
  if(!prior)return heading+'<h3>'+(en?'First forecast snapshot saved':'Πρώτη καταγραφή πρόγνωσης')+'</h3><p class="mt-changes-note">'+(en?'MONO will compare new data with this baseline when the forecast changes on a future visit.':'Στην επόμενη επίσκεψη με νέα δεδομένα, το MONO θα συγκρίνει τη μακρινή τάση με αυτή την πρώτη καταγραφή.')+'</p><small class="mt-changes-time">'+esc(when(last.at,lang))+'</small></div>';
  var same=comparisons(prior.rows,last.rows,Date.now()),changed=same.filter(function(x){return x.significant;});
  var headingText=!same.length?(en?'No matching future weeks':'Δεν υπάρχουν ίδιες μελλοντικές εβδομάδες'):
    changed.length?(en?'Notable revision detected':'Αξιόλογη αλλαγή στην τάση'):(en?'Trend largely unchanged':'Η τάση παραμένει σχεδόν σταθερή');
  var lead=!same.length?(en?'The available snapshots cover different weeks, so no artificial comparison is shown.':'Οι δύο καταγραφές δεν καλύπτουν κοινές μακρινές εβδομάδες, επομένως δεν γίνεται τεχνητή σύγκριση.'):
    changed.length?(en?'Weekly forecast anomalies have changed since the previous saved retrieval.':'Οι εβδομαδιαίες αποκλίσεις μεταβλήθηκαν σε σχέση με την προηγούμενη καταγραφή.'):(en?'No meaningful week-for-week change exceeds the display thresholds.':'Δεν προκύπτει σημαντική μεταβολή στις ίδιες εβδομάδες με βάση τα όρια εμφάνισης.');
  var cards=changed.slice().sort(function(a,b){return (Math.abs(b.deltaTemp||0)/0.5+Math.abs(b.deltaRain||0)/5)-(Math.abs(a.deltaTemp||0)/0.5+Math.abs(a.deltaRain||0)/5);}).slice(0,3).map(function(c){
    return '<div class="mt-change-item"><b>'+esc(week(c.date,lang))+'</b><span class="mt-change-description">'+esc(describe(c,lang))+'</span>'+
      (finite(c.deltaTemp)?'<span>'+(en?'Temperature anomaly: ':'Απόκλιση θερμοκρασίας: ')+esc(signed(c.oldTemp,lang,'°C'))+' → '+esc(signed(c.newTemp,lang,'°C'))+' ('+esc(signed(c.deltaTemp,lang,'°C'))+')</span>':'')+
      (finite(c.deltaRain)?'<span>'+(en?'Rain anomaly: ':'Απόκλιση βροχόπτωσης: ')+esc(signed(c.oldRain,lang,' mm'))+' → '+esc(signed(c.newRain,lang,' mm'))+' ('+esc(signed(c.deltaRain,lang,' mm'))+')</span>':'')+'</div>';
  }).join('');
  return heading+'<h3>'+esc(headingText)+'</h3><p class="mt-changes-note">'+esc(lead)+'</p>'+
    (cards?'<div class="mt-change-list">'+cards+'</div>':'')+
    '<small class="mt-changes-time">'+(en?'Compared saved retrievals: ':'Σύγκριση καταγραφών: ')+
    esc(when(prior.at,lang))+' → '+esc(when(last.at,lang))+
    ' · '+items.length+' '+(en?'distinct snapshots':'διαφορετικές καταγραφές')+'</small>'+
    '<p class="mt-changes-help">'+(en?'Changes refer to the same calendar weeks, not different lead times. This records fetched forecasts on this device, not a verified model run log. No numerical success probability is implied.':'Η σύγκριση αφορά τις ίδιες ημερολογιακές εβδομάδες, όχι διαφορετικούς προγνωστικούς ορίζοντες. Καταγράφονται δεδομένα που ανακτήθηκαν στη συσκευή, όχι πιστοποιημένο αρχείο εκτελέσεων του μοντέλου. Οι μεταβολές δεν είναι πιθανότητες επιτυχίας.')+'</p></div>';
}
root.MONOMonthHistory={record:record,render:render,comparisons:comparisons,signature:signature,read:read};
})(window);
