/* MONO — six-week weather outlook from ECMWF EC46 weekly anomalies.
   This is a regional trend, never a daily or calibrated event forecast. */
(function(root){
  'use strict';
  var CACHE_TTL=8*60*60*1000, RETRY_TTL=15*60*1000;
  var cache=new Map();
  function finite(n){return typeof n==='number'&&Number.isFinite(n);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmt(n,lang,dec){return finite(n)?new Intl.NumberFormat(lang==='en'?'en-GB':'el-GR',{maximumFractionDigits:dec||0,minimumFractionDigits:dec||0}).format(n):'—';}
  function signed(n,lang,unit){return finite(n)?(n>0?'+':'')+fmt(n,lang,1)+unit:'—';}
  function dateAt(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')?new Date(s+'T12:00:00Z'):new Date(NaN);}
  function rangeLabel(s,lang){
    var a=dateAt(s),b=new Date(a.getTime()+6*86400000),locale=lang==='en'?'en-GB':'el-GR';
    if(!Number.isFinite(a.getTime()))return '—';
    return new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',timeZone:'UTC'}).format(a)+' – '+new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',timeZone:'UTC'}).format(b);
  }
  function rowsOf(payload){
    var w=payload&&payload.weekly;
    if(!w||!Array.isArray(w.time))return [];
    return w.time.slice(0,7).map(function(day,i){
      return {date:day,
        temp:Array.isArray(w.temperature_2m_anomaly)?w.temperature_2m_anomaly[i]:null,
        rain:Array.isArray(w.precipitation_anomaly)?w.precipitation_anomaly[i]:null,
        mean:Array.isArray(w.temperature_2m_mean)?w.temperature_2m_mean[i]:null,
        rainMean:Array.isArray(w.precipitation_mean)?w.precipitation_mean[i]:null
      };
    }).filter(function(x){return Number.isFinite(dateAt(x.date).getTime())&&(finite(x.temp)||finite(x.rain));});
  }
  function trendWord(value,kind,lang){
    var en=lang==='en',t=kind==='temp',threshold=t?0.8:5;
    if(!finite(value))return en?'No signal':'Χωρίς δεδομένα';
    if(value>=threshold)return t?(en?'Warmer than usual':'Θερμότερα από τα κανονικά'):(en?'Wetter than usual':'Πιο βροχερή τάση');
    if(value<=-threshold)return t?(en?'Colder than usual':'Ψυχρότερα από τα κανονικά'):(en?'Drier than usual':'Πιο ξηρή τάση');
    return en?'Near normal':'Κοντά στα κανονικά';
  }
  function beyondTwoWeeks(r){
    var d=dateAt(r.date);
    return Number.isFinite(d.getTime())&&d.getTime()>=Date.now()+12*86400000;
  }
  function summarize(rows,lang){
    var en=lang==='en',distant=rows.filter(beyondTwoWeeks),changes=[];
    distant.forEach(function(r){
      var when=rangeLabel(r.date,lang);
      if(finite(r.temp)&&Math.abs(r.temp)>=1.5){
        changes.push({m:Math.abs(r.temp),line:(en?'Around ':'Περίπου ')+when+': '+trendWord(r.temp,'temp',lang).toLowerCase()+' ('+signed(r.temp,lang,'°C')+').'});
      }
      if(finite(r.rain)&&Math.abs(r.rain)>=8){
        changes.push({m:Math.abs(r.rain)/6,line:(en?'Around ':'Περίπου ')+when+': '+trendWord(r.rain,'rain',lang).toLowerCase()+' ('+signed(r.rain,lang,' mm')+').'});
      }
    });
    changes.sort(function(a,b){return b.m-a.m;});
    if(!changes.length)return {title:en?'No strong long-range signal yet':'Δεν διακρίνεται ισχυρό μακρινό σήμα',
      detail:en?'No pronounced weekly temperature or precipitation anomaly is currently visible beyond two weeks. This does not rule out later changes.':'Προς το παρόν δεν ξεχωρίζει έντονη εβδομαδιαία απόκλιση μετά το 14ήμερο. Αυτό δεν αποκλείει μεταγενέστερες αλλαγές.',signals:[]};
    return {title:en?'Possible change later this month':'Πιθανή μεταβολή αργότερα μέσα στον μήνα',
      detail:en?'Long-range model guidance points to possible changes in the weeks below, not a specific event or date.':'Η μακρινή προγνωστική τάση δείχνει ενδεχόμενες αλλαγές στις παρακάτω εβδομάδες, όχι βέβαιο φαινόμενο σε συγκεκριμένη ημέρα.',
      signals:changes.slice(0,2).map(function(x){return x.line;})};
  }
  function shortForecast(daily,lang){
    if(!Array.isArray(daily)||daily.length<4)return '';
    var list=daily.slice(0,Math.min(14,daily.length));
    var known=list.filter(function(x){return x&&finite(x.hi);});
    if(known.length<4)return '';
    var avg=known.reduce(function(a,x){return a+x.hi;},0)/known.length;
    var wet=list.filter(function(x){return x&&finite(x.mm);});
    var rain=wet.reduce(function(a,x){return a+x.mm;},0);
    var en=lang==='en';
    return '<div class="mt-near"><span class="mt-kicker">'+(en?'NEXT '+list.length+' DAYS · STANDARD FORECAST':'ΕΠΟΜΕΝΕΣ '+list.length+' ΗΜΕΡΕΣ · ΚΑΝΟΝΙΚΗ ΠΡΟΓΝΩΣΗ')+'</span><p>'+
      (en?'Average forecast daytime high ':'Μέση προβλεπόμενη μέγιστη θερμοκρασία ')+
      '<strong>'+fmt(avg,lang,0)+'°C</strong>'+
      (wet.length===list.length?' · '+(en?'forecast accumulated precipitation ':'προβλεπόμενος συνολικός υετός ')+'<strong>'+fmt(rain,lang,1)+' mm</strong>':'')+
      '.</p></div>';
  }
  function body(payload,opts){
    var en=opts.lang==='en',rows=rowsOf(payload),summary=summarize(rows,opts.lang);
    if(!rows.length)return {text:en?'Extended forecast not available':'Η μακρινή τάση δεν είναι διαθέσιμη',html:'<p class="mt-error">'+(en?'No valid EC46 weekly data was returned. The app will not fill missing weeks with invented forecasts.':'Το EC46 δεν επέστρεψε έγκυρα εβδομαδιαία δεδομένα. Δεν συμπληρώνουμε τις ελλείπουσες εβδομάδες με επινοημένες προβλέψεις.')+'</p>'};
    var cards=rows.map(function(r,i){
      var far=beyondTwoWeeks(r);
      var label=en?(far?'LONG RANGE':'WEEKLY TREND'):(far?'ΜΑΚΡΙΝΗ ΤΑΣΗ':'ΕΒΔΟΜΑΔΙΑ ΤΑΣΗ');
      return '<article class="mt-week"><div class="mt-week-head"><div><span class="mt-week-number">'+(en?'Week ':'Εβδομάδα ')+(i+1)+'</span><strong>'+esc(rangeLabel(r.date,opts.lang))+'</strong></div><span class="mt-distance">'+label+'</span></div>'+
        '<div class="mt-week-pair"><div><small>'+(en?'Temperature':'Θερμοκρασία')+'</small><b>'+esc(trendWord(r.temp,'temp',opts.lang))+'</b><span>'+(finite(r.temp)?signed(r.temp,opts.lang,'°C'):(en?'Unavailable':'Μη διαθέσιμο'))+'</span></div>'+
        '<div><small>'+(en?'Precipitation':'Βροχοπτώσεις')+'</small><b>'+esc(trendWord(r.rain,'rain',opts.lang))+'</b><span>'+(finite(r.rain)?signed(r.rain,opts.lang,' mm'):(en?'Unavailable':'Μη διαθέσιμο'))+'</span></div></div></article>';
    }).join('');
    var notes=summary.signals.map(function(s){return '<li>'+esc(s)+'</li>';}).join('');
    var historyHtml=root.MONOMonthHistory?.render(opts.key,opts.lang,opts.historyEnabled)||'';
    var html=shortForecast(opts.daily,opts.lang)+historyHtml+
      '<div class="mt-intro"><span class="mt-kicker">'+(en?'WHAT COULD BE COMING':'ΤΙ ΜΠΟΡΕΙ ΝΑ ΕΡΧΕΤΑΙ')+'</span><h3>'+esc(summary.title)+'</h3><p>'+esc(summary.detail)+'</p>'+
      (notes?'<ul class="mt-signals">'+notes+'</ul>':'')+'</div>'+
      '<div class="mt-grid">'+cards+'</div>'+
      '<p class="mt-disclaimer">'+(en?
      'ECMWF EC46 weekly ensemble-mean anomalies via Open-Meteo, approximately 36 km resolution. Differences refer to model climatology, not actual station observations. Past day 14, these are regional tendencies, not exact rain/snow/storm predictions or calibrated confidence levels.':
      'Εβδομαδιαίες αποκλίσεις από τον μέσο όρο ensemble ECMWF EC46 μέσω Open-Meteo, ανάλυση περίπου 36 km. Η σύγκριση γίνεται με την κλιματολογία του μοντέλου, όχι με μετρήσεις σταθμών. Μετά το 14ήμερο πρόκειται για περιφερειακές τάσεις, όχι ακριβείς προβλέψεις βροχής, χιονιού, καταιγίδας ή ποσοστά βεβαιότητας.')+
      ' <a href="https://open-meteo.com/en/docs/seasonal-forecast-api" target="_blank" rel="noopener noreferrer">'+(en?'Data & method':'Πηγή και μεθοδολογία')+'</a>.</p>';
    return {text:summary.title,html:html};
  }
  function show(node,entry,opts){
    if(!node||!node.isConnected)return;
    var en=opts.lang==='en';
    var result=entry.status==='ok'?body(entry.data,Object.assign({},opts,{key:node.dataset.key})):
      entry.status==='error'?{text:en?'Long-range data unavailable':'Μη διαθέσιμη μακρινή τάση',
        html:'<p class="mt-error">'+(en?'Unable to load EC46 weekly guidance right now. No long-range prediction is shown.':'Δεν φορτώθηκαν τα εβδομαδιαία δεδομένα EC46 αυτή τη στιγμή. Δεν εμφανίζεται μη τεκμηριωμένη μακρινή πρόγνωση.')+'</p>'}:
      {text:en?'Checking the next 6 weeks…':'Έλεγχος τάσης 6 εβδομάδων…',
        html:'<p class="mt-loading">'+(en?'Loading weekly ensemble signals…':'Ανάκτηση εβδομαδιαίων ενδείξεων από το ensemble…')+'</p>'};
    node.innerHTML=result.html;
    var summary=node.closest('details[data-home-section="month"]');
    var hint=summary&&summary.querySelector('.home-more-desc');
    if(hint)hint.textContent=result.text+(en?' · ECMWF EC46':' · ECMWF EC46');
  }
  async function load(key,url,opts){
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},18000);
    try{
      var response=await fetch(url,{signal:controller.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      var data=await response.json();
      if(!rowsOf(data).length)throw new Error('Missing weekly anomalies');
      root.MONOMonthHistory?.record(key,rowsOf(data),!!opts.historyEnabled);
      cache.set(key,{status:'ok',data:data,at:Date.now()});
    }catch(err){cache.set(key,{status:'error',at:Date.now()});}
    finally{clearTimeout(timeout);}
    var node=document.getElementById('mono-month-trend');
    if(node&&node.dataset.key===key)show(node,cache.get(key),opts);
  }
  function mount(opts){
    var node=document.getElementById('mono-month-trend');
    if(!node)return;
    var lat=Number(opts.lat),lon=Number(opts.lon);
    if(!finite(lat)||!finite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
    var key=lat.toFixed(3)+','+lon.toFixed(3);
    node.dataset.key=key;
    var entry=cache.get(key),ttl=entry&&entry.status==='error'?RETRY_TTL:CACHE_TTL;
    if(entry&&entry.status==='loading'){show(node,entry,opts);return;}
    if(entry&&Date.now()-entry.at<ttl){show(node,entry,opts);return;}
    cache.set(key,{status:'loading',at:Date.now()});
    show(node,cache.get(key),opts);
    var params=new URLSearchParams({latitude:String(lat),longitude:String(lon),
      weekly:'temperature_2m_anomaly,precipitation_anomaly,temperature_2m_mean,precipitation_mean',
      models:'ecmwf_ec46_ensemble_mean',forecast_days:'42',timezone:'auto'});
    load(key,'https://seasonal-api.open-meteo.com/v1/seasonal?'+params.toString(),opts);
  }
  root.MONOMonthTrend={mount:mount,rowsOf:rowsOf,trendWord:trendWord};
})(window);
