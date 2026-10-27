/* MONO Quick Screens: 4 tactile pages, backed by the application's actual feeds. */
(function(root){
'use strict';
const fin=Number.isFinite;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const mean=a=>{const v=a.filter(fin);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
const total=a=>a.length&&a.every(fin)?a.reduce((x,y)=>x+y,0):null;
const max=a=>{const v=a.filter(fin);return v.length?Math.max(...v):null;};
function render(data={},screen=0,lang='el'){
 const el=lang!=='en',X=(g,e)=>el?g:e,locale=el?'el-GR':'en-GB';
 const num=(v,d=0)=>fin(v)?v.toLocaleString(locale,{maximumFractionDigits:d}):'—';
 const pct=p=>fin(p)?num(p*100)+'%':'—';
 const hour=t=>fin(t)?new Date(t).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit',timeZone:data.zone||'UTC'}):'—';
 const w=data.current||{},f=(data.future||[]).slice(0,24),six=f.slice(0,6);
 const today=data.daily?.[0]||{},tomorrow=data.daily?.[1]||{};
 const obs=data.gauge||null,live=data.live||{kind:'unverified'};
 const mm24=f.length===24?total(f.map(r=>r.amount)):null, mm6=six.length===6?total(six.map(r=>r.amount)):null;
 const cloud6=six.length===6?mean(six.map(r=>r.cloud)):null;
 const cloudWord=fin(cloud6)?cloud6>=80?X('Συννεφιά','Overcast'):cloud6>=45?X('Αρκετά σύννεφα','Mostly cloudy'):X('Αραιή νέφωση','Few clouds'):X('Δεν υπάρχουν στοιχεία','No readings');
 const nearest=live.name?live.name+' · '+num(live.dist,1)+' km · '+hour(live.t):X('Χωρίς πρόσφατο κοντινό σταθμό','No fresh nearby station');
 const liveText=live.kind==='rain'?X('Βρέχει στον κοντινό σταθμό','Raining at nearby station'):
  live.kind==='snow'?X('Χιονίζει στον κοντινό σταθμό','Snow at nearby station'):
  live.kind==='not_reported'?X('Δεν αναφέρεται βροχή','Rain not reported'):
  live.kind==='recent_gauge'?live.wet?X('Έβρεξε την τελευταία ώρα','Rained in the past hour'):X('Καμία βροχή την τελευταία ώρα','No rain over the past hour'):
  X('Δεν υπάρχει κοντινή επιβεβαίωση','No nearby verification');
 const gaugeNote=obs?(obs.name+' · '+(fin(obs.dist)?num(obs.dist,1)+' km · ':'')+
   (obs.type==='Netatmo'?X('κυλιόμενο 24ωρο','rolling 24 hours'):num(obs.covered,0)+'/24 h')):X('Δεν υπάρχει διαθέσιμο βροχόμετρο','No reporting rain gauge');
 const rainSkill=data.rainSkill??null,cloudSkill=data.cloudSkill??null;
 const kp=data.kp?.fresh?data.kp.value:null;
 const tabs=[['🌤',X('Τώρα','Now')],['🌧',X('Έρχεται','Next')],['🌍',X('Γη & ουρανός','Earth & sky')],['🎯',X('Εργαλεία','Tools')]];
 const index=Math.max(0,Math.min(3,Number.isInteger(+screen)?+screen:0));
 const tile=(icon,label,value,note,page,wide=false)=>{
  const asset=['rain','sun','cloud','thermometer','wind','humidity','pressure','uv','snow','sunrise','moon','storm','visibility'].includes(icon)?'icons/'+icon+'.svg':null;
  return '<article class="card qs-tile'+(wide?' qs-wide':'')+'">'+
   '<span class="qs-pict" aria-hidden="true">'+(asset?'<img src="'+asset+'" alt="">':'<span>◈</span>')+'</span>'+
   '<span class="qs-label">'+esc(label)+'</span><strong class="qs-value">'+esc(value)+'</strong>'+
   '<span class="qs-note">'+esc(note||'')+'</span>'+
   (page?'<button type="button" data-action="goto" data-page="'+esc(page)+'" class="qs-link">'+X('Άνοιγμα','Open')+' ↗</button>':'')+'</article>';
 };
 const links=items=>'<div class="qs-shortcuts">'+items.map(([ico,title,page])=>
  '<button type="button" data-action="goto" data-page="'+esc(page)+'" class="qs-shortcut"><span aria-hidden="true">'+ico+'</span><b>'+esc(title)+'</b><span aria-hidden="true">↗</span></button>').join('')+'</div>';
 const headline=(icon,heading,note)=>'<div class="qs-headline"><div class="qs-headline-ico">'+icon+'</div><div><h2>'+esc(heading)+'</h2><p>'+esc(note)+'</p></div></div>';
 const screens=[
  ()=>headline(live.kind==='rain'?'🌧️':live.kind==='snow'?'🌨️':'📍',liveText,nearest)+
    '<div class="qs-tiles">'+
    tile('thermometer',X('Θερμοκρασία τώρα','Temperature now'),fin(w.temp)?num(w.temp)+'°C':'—',w.source==='obs'?X('Μέτρηση σταθμού','Station measurement'):X('Εκτίμηση μοντέλου','Model estimate'),'now')+
    tile('rain',X('Βροχή που καταγράφηκε','Recorded rainfall'),obs?num(obs.mm,1)+' mm':'—',gaugeNote,'stations')+
    tile('wind',X('Άνεμος','Wind'),fin(w.wind)?num(w.wind)+' km/h':'—',X('Ριπές','Gusts')+': '+(fin(w.gust)?num(w.gust)+' km/h':'—'),'hourly')+
    tile('cloud',X('Σύννεφα','Clouds'),fin(data.nowCloud)?num(data.nowCloud)+'%':'—',X('Τωρινή εκτίμηση','Current estimate'),'environment')+
    tile('humidity',X('Υγρασία','Humidity'),fin(w.rh)?num(w.rh)+'%':'—',X('Τωρινή ένδειξη','Current conditions'),'environment')+
    tile('pressure',X('Πίεση','Pressure'),fin(w.pres)?num(w.pres)+' hPa':'—',X('Ατμοσφαιρική πίεση','Air pressure'),'environment')+
    '</div>'+links([['☂',X('Βροχή','Rain'),'rain'],['📍',X('Σταθμοί','Stations'),'stations'],['◎',X('Ραντάρ','Radar'),'radar']]),
  ()=>headline('🌦️',X('Οι επόμενες ώρες','The hours ahead'),X('Προβλέψεις, όχι πραγματικές μετρήσεις.','Forecasts, not direct measurements.'))+
    '<div class="qs-tiles">'+
    tile('rain',X('Βροχή 24ώρου','Rain next 24h'),fin(mm24)?num(mm24,1)+' mm':'—',X('Εκτίμηση μοντέλων','Model forecast'),'rain')+
    tile('rain',X('Βροχή 6ώρου','Rain next 6h'),fin(mm6)?num(mm6,1)+' mm':'—',X('Εκτίμηση μοντέλων','Model forecast'),'rain')+
    tile('sun',X('Αύριο','Tomorrow'),fin(tomorrow.hi)?num(tomorrow.hi)+'°C':'—',X('Ελάχιστη','Low')+': '+(fin(tomorrow.lo)?num(tomorrow.lo)+'°C':'—'),'hourly')+
    tile('rain',X('Πιθανότητα βροχής','Rain chance'),pct(max(six.map(r=>r.pop))),X('Μέγιστη στο 6ωρο','Maximum within 6h'),'rain')+
    tile('storm',X('Καταιγίδα','Thunderstorm'),pct(max(f.map(r=>r.pStorm))),X('Μέγιστη ένδειξη 24ώρου','Peak 24h estimate'),'phen')+
    tile('cloud',X('Νέφωση','Cloud cover'),fin(cloud6)?num(cloud6)+'%':'—',cloudWord,'environment')+
    '</div>'+ (data.warning?'<p class="qs-alert">⚠ '+esc(data.warning)+'</p>':'')+
    links([['▱',X('Χάρτες πρόγνωσης','Forecast maps'),'maps'],['⚡',X('Φαινόμενα','Weather events'),'phen'],['◷',X('Ανά ώρα','Hourly'),'hourly']]),
  ()=>headline('🌍',X('Όσα συμβαίνουν γύρω μας','What happens around us'),X('Αέρας, θάλασσα, Ήλιος και ζωντανή Γη.','Air, sea, Sun and the living Earth.'))+
    '<div class="qs-tiles">'+
    tile('sun',X('Ποιότητα αέρα','Air quality'),fin(data.aqi)?'EAQI '+num(data.aqi):'—',X('Όσο μικρότερο τόσο καλύτερα','Lower generally means better'),'environment')+
    tile('uv',X('Δείκτης UV','UV index'),fin(data.uv)?num(data.uv,1):'—',X('Μέγιστη σημερινή πρόγνωση','Today’s forecast maximum'),'environment')+
    tile('cloud',X('Θερμοκρασία θάλασσας','Sea temperature'),fin(data.seaTemp)?num(data.seaTemp,1)+'°C':'—',X('Όπου υπάρχουν δεδομένα','Where data are available'),'environment')+
    tile('wind',X('Ύψος κύματος','Wave height'),fin(data.wave)?num(data.wave,1)+' m':'—',X('Πρόγνωση στη θάλασσα','Marine forecast'),'environment')+
    tile('sun',X('Διαστημικός καιρός','Space weather'),fin(kp)?'Kp '+num(kp,1):'—',X('Παγκόσμια μέτρηση NOAA','Global NOAA measurement'),'space')+
    tile('sunrise',X('Ανατολή','Sunrise'),hour(data.sunrise),X('Τοπική ώρα','Local time'),'environment')+
    '</div>'+links([['◍',X('3D υδρόγειος','3D Earth'),'globe'],['◈',X('Γήινα φαινόμενα','Earth signals'),'earth'],['☄',X('Διάστημα','Space'),'space'],['▦',X('Κλίμα','Climate'),'climate']]),
  ()=>headline('🎯',X('Τα δεδομένα πίσω από τον καιρό','Weather intelligence'),X('Όταν δεν υπάρχουν μετρήσεις, δεν εμφανίζουμε ψεύτικα νούμερα.','Missing measurements are never fabricated.'))+
    '<div class="qs-tiles">'+
    tile('thermometer',X('Μοντέλα σε χρήση','Active models'),fin(data.models)?num(data.models):'—',X('Για την επιλεγμένη τοποθεσία','For this location'),'models')+
    tile('cloud',X('Μέλη ensemble','Ensemble members'),fin(data.members)?num(data.members):'—',X('Πολλαπλά σενάρια','Multiple scenarios'),'models')+
    tile('rain',X('Σφάλμα βροχής','Rain forecast error'),fin(rainSkill)?num(rainSkill,2)+' mm':'—',X('Ιστορικός έλεγχος έναντι ERA5 · mm/ώρα','Held-out ERA5 check · mm/hour'),'lab')+
    tile('cloud',X('Σφάλμα νέφωσης','Cloud forecast error'),fin(cloudSkill)?num(cloudSkill,1)+' μ.μ.':'—',X('Ποσοστιαίες μονάδες · ERA5','Percentage points · ERA5'),'lab')+
    tile('storm',X('Τοπικές προειδοποιήσεις','Local warnings'),fin(data.warnings)?num(data.warnings):'—',X('Διαθέσιμες επίσημες αναφορές','Available official notices'),'phen')+
    tile('sun',X('Ειδήσεις καιρού','Weather news'),fin(data.news)?num(data.news):'—',X('Διαθέσιμες ειδήσεις','Loaded articles'),'news')+
    '</div>'+links([['≋',X('Μοντέλα','Models'),'models'],['✳',X('Ακρίβεια','Accuracy'),'lab'],['¶',X('Ειδήσεις','News'),'news'],['⊞',X('Πόλεις','Cities'),'cities'],['📍',X('Σταθμοί','Stations'),'stations'],['◷',X('Όλες οι ώρες','Full hourly'),'hourly']])
 ];
 return '<section id="mono-quick" class="qs" aria-label="'+X('Ο καιρός σε τέσσερις οθόνες','Weather in four screens')+'">'+
 '<div class="qs-progress"><span>MONO / SNAPSHOTS</span><b>'+(index+1)+' / 4</b></div>'+
 '<div class="qs-tabs" role="tablist" aria-label="'+X('Οθόνες','Screens')+'">'+tabs.map((tab,i)=>
 '<button type="button" role="tab" aria-selected="'+(index===i)+'" aria-controls="qs-panel" class="'+(index===i?'selected':'')+'" data-action="quickScreen" data-index="'+i+'"><span>'+tab[0]+'</span><b>'+tab[1]+'</b></button>').join('')+'</div>'+
 '<div id="qs-panel" class="qs-panel" role="tabpanel">'+screens[index]()+'</div>'+
 '<div class="qs-next"><button type="button" data-action="quickScreen" data-index="'+Math.max(0,index-1)+'" '+(index===0?'disabled':'')+' aria-label="'+X('Προηγούμενη οθόνη','Previous screen')+'">‹</button>'+
 '<div class="qs-dots">'+tabs.map((t,i)=>'<button data-action="quickScreen" data-index="'+i+'" aria-label="'+X('Οθόνη','Screen')+' '+(i+1)+'" class="'+(i===index?'on':'')+'"></button>').join('')+'</div>'+
 '<button type="button" data-action="quickScreen" data-index="'+Math.min(3,index+1)+'" '+(index===3?'disabled':'')+' aria-label="'+X('Επόμενη οθόνη','Next screen')+'">›</button></div>'+
 '<p class="qs-disclaimer">'+X('Πηγή κάθε ένδειξης: πραγματικός σταθμός όπου επισημαίνεται, αλλιώς πρόγνωση/δεδομένα της αντίστοιχης ενότητας.','Source: ground stations where labeled, otherwise the linked forecast/data section.')+'</p></section>';
}
root.MONOQuickScreens={render};
if(typeof module!=='undefined'&&module.exports)module.exports={render};
})(typeof window!=='undefined'?window:globalThis);
