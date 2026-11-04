/* Monthly rainfall history at a location, from ERA5 reanalysis (1991–2020). */
(function (root) {
  'use strict';
  const FIRST = 1991, LAST = 2020, MIN_YEARS = 24;
  const fin = Number.isFinite;
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  const quantile = (sorted, p) => {
    const pos = (sorted.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };

  function summarize(daily) {
    if (!Array.isArray(daily?.time) || !Array.isArray(daily?.rain_sum) || daily.time.length !== daily.rain_sum.length) throw new Error('invalid daily rainfall');
    const records = new Map(), duplicated = new Set();
    daily.time.forEach((date, i) => {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7)), day = Number(date.slice(8, 10));
      if (year < FIRST || year > LAST || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return;
      if (records.has(date)) duplicated.add(date);
      records.set(date, daily.rain_sum[i]);
    });
    const normals = {};
    for (let m = 1; m <= 12; m++) {
      const totals = [], wetDays = [];
      for (let y = FIRST; y <= LAST; y++) {
        const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), values = [];
        for (let d = 1; d <= days; d++) {
          const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const amount = records.get(key);
          if (duplicated.has(key) || !fin(amount) || amount < 0) break;
          values.push(amount);
        }
        // Accumulated amounts are valid only for a completely covered month.
        if (values.length !== days) continue;
        totals.push(values.reduce((a, b) => a + b, 0));
        wetDays.push(values.filter(v => v >= 1).length);
      }
      if (totals.length < MIN_YEARS) { normals[m] = null; continue; }
      const sorted = [...totals].sort((a, b) => a - b);
      normals[m] = { average: mean(totals), rainyDays: mean(wetDays), q25: quantile(sorted, .25), q75: quantile(sorted, .75), years: totals.length };
    }
    return normals;
  }

  async function load(city, fetcher = fetch) {
    const lat = Number(city?.lat), lon = Number(city?.lon);
    if (city?.lat == null || city?.lon == null || city.lat === '' || city.lon === '' || !fin(lat) || !fin(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('invalid location');
    const params = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), start_date: `${FIRST}-01-01`, end_date: `${LAST}-12-31`, models: 'era5', daily: 'rain_sum', timezone: 'auto' });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetcher('https://archive-api.open-meteo.com/v1/archive?' + params, { signal: controller.signal });
      if (!response.ok) throw new Error('history unavailable');
      const json = await response.json();
      if (json?.error) throw new Error('history unavailable');
      const normals = summarize(json?.daily);
      if (!Object.values(normals).some(Boolean)) throw new Error('insufficient history');
      return normals;
    } finally { clearTimeout(timer); }
  }

  async function loadRecent(city, fetcher = fetch) {
    const lat = Number(city?.lat), lon = Number(city?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('invalid location');
    // 26 months support year-over-year comparisons plus a complete rolling 12 months.
    const end = new Date(), start = new Date(Date.now() - 790 * 86400000);
    const params = new URLSearchParams({ latitude:lat.toFixed(4), longitude:lon.toFixed(4), start_date:start.toISOString().slice(0,10), end_date:end.toISOString().slice(0,10), models:'era5', daily:'rain_sum', timezone:'auto' });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetcher('https://archive-api.open-meteo.com/v1/archive?' + params, {signal:controller.signal});
      if (!response.ok) throw new Error('history unavailable');
      const json = await response.json(), daily = json?.daily;
      if (json?.error || !Array.isArray(daily?.time) || !Array.isArray(daily?.rain_sum) || daily.time.length !== daily.rain_sum.length) throw new Error('invalid history');
      // Existing recent-rain panels consume precipitation_sum; both charts now use the same ERA5 rain_sum source.
      return {time:daily.time, precipitation_sum:daily.rain_sum, timezone:json.timezone || 'auto', model:'era5'};
    } finally { clearTimeout(timer); }
  }

  function localMonth(now, zone) {
    try { return Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: zone }).format(new Date(now))); }
    catch { return new Date(now).getUTCMonth() + 1; }
  }
  function render(data, { lang = 'el', zone = 'UTC', city = '', now = Date.now() } = {}) {
    const el = lang !== 'en', X = (a, b) => el ? a : b, locale = el ? 'el-GR' : 'en-GB';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const num = (v, digits = 1) => fin(v) ? new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v) : '—';
    const m = localMonth(now, zone);
    const greekMonths = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
    const month = el ? greekMonths[m - 1] : new Intl.DateTimeFormat(locale, { month:'long', timeZone:'UTC' }).format(new Date(Date.UTC(2000, m - 1, 15)));
    const header = `<div class="mr-heading"><span class="mr-icon" aria-hidden="true">☂</span><div><span class="label">MONO / ${esc(month.toLocaleUpperCase(locale))}</span><h2>${X('Πόσο βρέχει συνήθως;', 'How much rain is typical?')}</h2><p>${esc(city)} · ${X('Ιστορικός μέσος όρος για ολόκληρο τον μήνα', 'Historical average for the full month')}</p></div></div>`;
    if (!data || data.status === 'loading') return `<section class="section card mr-card" aria-label="${X('Ιστορική βροχή μήνα', 'Historical monthly rainfall')}">${header}<p class="mr-status">${X('Φόρτωση ιστορικών δεδομένων…', 'Loading historical data…')}</p></section>`;
    if (data.status !== 'ready') return `<section class="section card mr-card" aria-label="${X('Ιστορική βροχή μήνα', 'Historical monthly rainfall')}">${header}<p class="mr-status">${X('Τα ιστορικά δεδομένα δεν είναι διαθέσιμα αυτή τη στιγμή.', 'Historical data is unavailable right now.')}</p><button type="button" class="outline-btn" data-action="monthlyRainRetry">${X('Δοκίμασε ξανά', 'Try again')}</button></section>`;
    const n = data.normals?.[m];
    if (!n || ![n.average, n.rainyDays, n.q25, n.q75, n.years].every(fin) || !Number.isInteger(n.years) || n.years < MIN_YEARS || n.years > 30) return `<section class="section card mr-card" aria-label="${X('Ιστορική βροχή μήνα', 'Historical monthly rainfall')}">${header}<p class="mr-status">${X('Δεν υπάρχουν αρκετά πλήρη ιστορικά έτη για αυτόν τον μήνα.', 'Not enough complete historical years for this month.')}</p></section>`;
    const singular = Math.round(n.rainyDays * 10) / 10 === 1;
    const rangeDigits = n.q75 < 5 ? 1 : 0;
    return `<section class="section card mr-card" aria-label="${X('Ιστορική βροχή μήνα', 'Historical monthly rainfall')}">${header}<div class="mr-metrics"><div><span>${X('ΜΕΣΗ ΒΡΟΧΗ', 'AVERAGE RAIN')}</span><strong>${num(n.average)} <small>mm</small></strong><p>${X('ανά ολόκληρο τον μήνα', 'per full month')}</p></div><div><span>${X('ΗΜΕΡΕΣ ΒΡΟΧΗΣ', 'RAINY DAYS')}</span><strong>${num(n.rainyDays)} <small>${el ? (singular ? 'μέρα' : 'μέρες') : (singular ? 'day' : 'days')}</small></strong><p>${X('κατά μέσο όρο · ≥1 mm / ημέρα', 'on average · ≥1 mm / day')}</p></div><div><span>${X('ΙΣΤΟΡΙΚΟ ΕΥΡΟΣ', 'HISTORICAL RANGE')}</span><strong>${num(n.q25, rangeDigits)}–${num(n.q75, rangeDigits)} <small>mm</small></strong><p>${X('στο μεσαίο 50% των ιστορικών μηνών', 'middle 50% of historical months')}</p></div></div><div class="mr-foot"><p>ERA5 · Open-Meteo · ${FIRST}–${LAST} · ${n.years}/30 ${X('πλήρη έτη', 'complete years')}. ${X('Αναανάλυση για την ευρύτερη περιοχή (~25 km), όχι μετρήσεις συγκεκριμένου σταθμού. Δεν είναι πρόγνωση για φέτος.', 'Regional reanalysis (~25 km), not measurements from a specific station. This is not a forecast for this year.')}</p><button type="button" class="outline-btn" data-action="goto" data-page="climate">${X('Περισσότερα για το κλίμα', 'More climate details')} ↗</button></div></section>`;
  }
  function renderRecent(data, {lang='el',zone='UTC',city='',now=Date.now()}={}) {
    const el=lang!=='en', X=(a,b)=>el?a:b, locale=el?'el-GR':'en-GB';
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const num=v=>Number.isFinite(v)?new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(v):'—';
    const keyAt=t=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t)),g=k=>p.find(x=>x.type===k)?.value||'00';return g('year')+'-'+g('month')+'-'+g('day');};
    const shift=(s,n)=>{const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n,12)).toISOString().slice(0,10);};
    const label=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12)).toLocaleDateString(locale,{day:'numeric',month:'short',timeZone:'UTC'});};
    const heading='<div class="mr-heading"><span class="mr-icon" aria-hidden="true">☂</span><div><span class="label">MONO / '+X('ΠΡΟΣΦΑΤΗ ΒΡΟΧΗ','RECENT RAINFALL')+'</span><h2>'+X('Πόση βροχή έπεσε;','How much rain fell?')+'</h2><p>'+esc(city)+' · '+X('Χθες, τελευταίες 7 ημέρες και από την αρχή του μήνα','Yesterday, last 7 days, and month to date')+'</p></div></div>';
    const section=body=>'<section class="section card mr-card mr-recent" aria-label="'+X('Πρόσφατη βροχόπτωση','Recent rainfall')+'">'+heading+body+'</section>';
    if(!data||data.status==='loading')return section('<p class="mr-status">'+X('Φόρτωση ημερήσιων δεδομένων…','Loading daily rainfall data…')+'</p>');
    const daily=data.daily;
    if(data.status!=='ready'||!Array.isArray(daily?.time)||!Array.isArray(daily?.precipitation_sum))return section('<p class="mr-status">'+X('Τα πρόσφατα ιστορικά δεδομένα δεν είναι διαθέσιμα αυτή τη στιγμή.','Recent historical data is unavailable right now.')+'</p>');
    const values=new Map(daily.time.map((k,i)=>[k,Number.isFinite(daily.precipitation_sum[i])&&daily.precipitation_sum[i]>=0?daily.precipitation_sum[i]:null]));
    const today=keyAt(now),yesterday=shift(today,-1),monthStart=today.slice(0,7)+'-01', get=k=>values.get(k);
    const weekKeys=Array.from({length:7},(_,i)=>shift(yesterday,-6+i)),week=weekKeys.map(get),weekCount=week.filter(Number.isFinite).length;
    const weekTotal=weekCount===7?week.reduce((a,b)=>a+b,0):null;
    const monthKeys=[];for(let k=monthStart;k<=yesterday;k=shift(k,1))monthKeys.push(k);
    const month=monthKeys.map(get),available=month.filter(Number.isFinite),monthTotal=available.length?available.reduce((a,b)=>a+b,0):null;
    const latest=[...values.entries()].filter(([k,v])=>k<=yesterday&&Number.isFinite(v)).map(([k])=>k).sort().at(-1);
    const rows=[
      [X('ΧΘΕΣ','YESTERDAY'),get(yesterday),label(yesterday),Number.isFinite(get(yesterday))?'1/1':X('Δεν δημοσιεύτηκε','Not published')],
      [X('ΤΕΛΕΥΤΑΙΕΣ 7 ΗΜΕΡΕΣ','LAST 7 DAYS'),weekTotal,label(weekKeys[0])+'–'+label(weekKeys[6]),weekCount+'/7 '+X('ημέρες διαθέσιμες','days available')],
      [X('ΑΠΟ ΑΡΧΗ ΜΗΝΑ','MONTH TO DATE'),monthTotal,latest?label(monthStart)+'–'+label(latest):'—',available.length+'/'+monthKeys.length+' '+X('ημέρες διαθέσιμες','days available')]
    ].map(([title,amount,period,coverage])=>'<div><span>'+title+'</span><strong>'+ (Number.isFinite(amount)?num(amount)+' <small>mm</small>':'—')+'</strong><p>'+period+'</p><p class="mr-recent-coverage">'+coverage+'</p></div>').join('');
    const freshness=latest?X('Τελευταία διαθέσιμη ημέρα: '+label(latest)+'.','Latest available day: '+label(latest)+'.'):X('Δεν υπάρχουν ακόμη διαθέσιμες ημερήσιες τιμές.','No daily values are available yet.');
    return section('<div class="mr-metrics">'+rows+'</div><div class="mr-foot"><p>ERA5 · Open-Meteo · '+freshness+' '+X('Η επανάλυση μπορεί να καθυστερεί. Το σύνολο μήνα καλύπτει μόνο τις διαθέσιμες ημέρες· το 7ήμερο εμφανίζεται μόνο με πλήρη κάλυψη. Είναι εκτίμηση πλέγματος (~25 km), όχι μέτρηση κοντινού βροχομέτρου.','Reanalysis can lag. The month total covers available days only; the 7-day total appears only with complete coverage. Gridded estimate (~25 km), not a nearby rain-gauge measurement.')+'</p></div>');
  }


  // The series contains only daily reanalysis values, never forecast amounts or extrapolated missing days.
  function monthlySeries(daily, now = Date.now(), zone = 'UTC', count = 12) {
    const times = daily?.time, amounts = daily?.precipitation_sum;
    if (!Array.isArray(times) || !Array.isArray(amounts) || times.length !== amounts.length) return [];
    const pieces = new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
    const getPart = key => pieces.find(p=>p.type===key)?.value;
    const today = getPart('year')+'-'+getPart('month')+'-'+getPart('day');
    const lastDay = new Date(Date.UTC(Number(getPart('year')),Number(getPart('month'))-1,Number(getPart('day'))-1,12)).toISOString().slice(0,10);
    const values = new Map(), duplicate = new Set();
    times.forEach((k,i)=>{
      if(typeof k!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(k))return;
      if(values.has(k))duplicate.add(k);
      const v=amounts[i];
      values.set(k,fin(v)&&v>=0?v:null);
    });
    const monthly = (y,m) => {
      const days = new Date(Date.UTC(y,m,0)).getUTCDate();
      let total=0, coverage=0, latest=null;
      for(let d=1;d<=days;d++){
        const key=String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
        if(key>lastDay)break;
        const value=duplicate.has(key)?null:values.get(key);
        if(!fin(value))continue;
        total+=value;coverage++;latest=key;
      }
      const full = String(y)+'-'+String(m).padStart(2,'0') < today.slice(0,7);
      const complete = full && coverage===days;
      return {year:y,month:m,amount:coverage?total:null,coverage,days,complete,latest};
    };
    const y=Number(getPart('year')),m=Number(getPart('month'));
    return Array.from({length:count},(_,idx)=>{
      const offset=idx-(count-1), date=new Date(Date.UTC(y,m-1+offset,1,12));
      const year=date.getUTCFullYear(),month=date.getUTCMonth()+1;
      return {...monthly(year,month), previous:monthly(year-1,month)};
    });
  }

  function renderComparison(recent, normals, {lang='el',zone='UTC',city='',now=Date.now()}={}) {
    const el=lang!=='en', X=(a,b)=>el?a:b,locale=el?'el-GR':'en-GB';
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const number=(v,dp=1)=>fin(v)?new Intl.NumberFormat(locale,{minimumFractionDigits:0,maximumFractionDigits:dp}).format(v):'—';
    const months=Array.from({length:12},(_,i)=>new Intl.DateTimeFormat(locale,{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2020,i,15))));
    const heading='<div class="mr-heading"><span class="mr-icon" aria-hidden="true">▥</span><div><span class="label">MONO / RAINFALL HISTORY</span><h2>'+
      X('Πόση βροχή έπεσε κάθε μήνα;','How much rain fell each month?')+'</h2><p>'+esc(city)+' · '+
      X('Τελευταίοι 12 μήνες · σε mm (1 mm = 1 λίτρο/τ.μ.)','Last 12 months · mm (1 mm = 1 L/m²)')+'</p></div></div>';
    const block=body=>'<section class="section card mr-compare" aria-label="'+X('Μηνιαία σύγκριση βροχής','Monthly rainfall comparison')+'">'+heading+body+'</section>';
    if(!recent||recent.status==='loading')return block('<p class="mr-status">'+X('Φόρτωση μηνιαίας βροχής…','Loading monthly rainfall…')+'</p>');
    if(recent.status!=='ready')return block('<p class="mr-status">'+X('Δεν είναι διαθέσιμα τα στοιχεία βροχής.','Rainfall data is unavailable.')+'</p>');
    let rows;
    try {rows=monthlySeries(recent.daily,now,zone);}catch{return block('<p class="mr-status">'+X('Δεν είναι διαθέσιμα τα στοιχεία βροχής.','Rainfall data is unavailable.')+'</p>');}
    if(!rows.some(r=>fin(r.amount)))return block('<p class="mr-status">'+X('Δεν υπάρχουν ακόμη διαθέσιμες μηνιαίες τιμές.','No monthly values published yet.')+'</p>');
    const norm=normals?.status==='ready'?normals.normals:null;
    const observations=rows.map(r=>({...r,normal:fin(norm?.[r.month]?.average)?norm[r.month].average:null}));
    const max=Math.max(1,...observations.flatMap(r=>[r.amount||0,r.normal||0]));
    const latestComplete=[...observations].reverse().find(r=>r.complete);
    const wettest=observations.filter(r=>r.complete).reduce((a,r)=>!a||r.amount>a.amount?r:a,null);
    const label=r=>months[r.month-1]+' '+r.year;
    const info=(title,r)=>r?'<div class="mr-highlight"><small>'+title+'</small><strong>'+number(r.amount)+' <span>mm</span></strong><span>'+esc(label(r))+'</span></div>':'';
    const stats='<div class="mr-summary">'+info(X('ΤΕΛΕΥΤΑΙΟΣ ΠΛΗΡΗΣ ΜΗΝΑΣ','LATEST COMPLETE MONTH'),latestComplete)+
      info(X('ΠΙΟ ΒΡΟΧΕΡΟΣ ΠΛΗΡΗΣ ΜΗΝΑΣ','WETTEST COMPLETE MONTH'),wettest)+'</div>';
    const bar=(value,klass,title)=>fin(value)?'<div class="mr-bar '+klass+'" style="height:'+Math.max(2,Math.round(value/max*150))+'px" title="'+esc(title)+'"></div>':'<div class="mr-bar mr-missing" title="'+X('Χωρίς στοιχεία','No data')+'"></div>';
    const columns=observations.map(r=>{
      const partial=!r.complete && fin(r.amount);
      const amountText=fin(r.amount)?number(r.amount)+(partial?'*':''):'—';
      const tip=label(r)+' · '+(r.complete?X('Πλήρης μήνας','Full month'):X('Μερική κάλυψη','Partial coverage')+' '+r.coverage+'/'+r.days);
      return '<div class="mr-column"><div class="mr-bar-value">'+amountText+'</div><div class="mr-bars">'+
        bar(r.amount,partial?'mr-partial':'mr-actual',tip+' · '+amountText+' mm')+
        bar(r.normal,'mr-normal',X('Ιστορικός μέσος','Historical average')+' '+number(r.normal)+' mm')+
        '</div><span class="mr-xlabel">'+esc(months[r.month-1])+'<small>'+r.year+'</small></span></div>';
    }).join('');
    const chart='<div class="mr-chart-scroll" role="region" aria-label="'+X('Γράφημα βροχής 12 μηνών','12-month rainfall chart')+'" tabindex="0"><div class="mr-chart">'+columns+'</div></div>';
    const legend='<div class="mr-legend"><span><i class="mr-key mr-key-actual"></i>'+X('Βροχή ERA5','ERA5 rainfall')+'</span>'+
      '<span><i class="mr-key mr-key-normal"></i>'+X('Μέσος 1991–2020','1991–2020 average')+'</span>'+
      '<span><i class="mr-key mr-key-partial"></i>'+X('Ελλιπής μήνας','Incomplete month')+'</span></div>';
    const change=(amount,base)=>fin(amount)&&fin(base)&&base>0?((amount-base>=0?'+':'')+number((amount-base)/base*100,0)+'%'):'—';
    const values=observations.map(r=>{
      const current=fin(r.amount)?number(r.amount)+(r.complete?'':'*'):'—';
      const previous=r.previous?.complete?number(r.previous.amount):'—';
      const normal=number(r.normal);
      const vsNorm=r.complete?change(r.amount,r.normal):'—';
      const vsLast=r.complete&&r.previous?.complete?change(r.amount,r.previous.amount):'—';
      return '<tr><th scope="row">'+esc(label(r))+'</th><td>'+current+'</td><td>'+previous+
        '</td><td>'+normal+'</td><td>'+vsNorm+'</td><td>'+vsLast+
        '</td><td>'+r.coverage+'/'+r.days+'</td></tr>';
    }).join('');
    const table='<details class="mr-details"><summary>'+X('Αναλυτική σύγκριση ανά μήνα','Detailed monthly comparison')+
      '</summary><div class="mr-table-scroll"><table><thead><tr><th>'+X('Μήνας','Month')+'</th><th>'+X('Βροχή','Rain')+
      '</th><th>'+X('Πέρσι','Last year')+'</th><th>'+X('Μ.Ο.','Avg.')+'</th><th>'+X('Διαφ. Μ.Ο.','vs Avg.')+
      '</th><th>'+X('Διαφ. πέρσι','vs Last year')+'</th><th>'+X('Ημέρες','Days')+'</th></tr></thead><tbody>'+values+'</tbody></table></div></details>';
    const latest=observations.map(r=>r.latest).filter(Boolean).sort().at(-1);
    const note='<p class="mr-compare-note">ERA5 · Open-Meteo · '+X('αναανάλυση για την ευρύτερη περιοχή (~25 km), όχι ποσότητα από βροχόμετρο.','regional reanalysis (~25 km), not a rain gauge.')+
      ' '+X('Ο ιστορικός μέσος όρος αφορά πλήρεις μήνες 1991–2020.','Normals represent complete calendar months in 1991–2020.')+
      ' '+X('Οι μήνες με * είναι ελλιπείς και δεν υπολογίζεται συγκρίσιμη ποσοστιαία διαφορά.','Months marked * are incomplete, so percentage differences are omitted.')+
      (latest?' '+X('Τελευταία διαθέσιμη ημέρα: ','Latest available day: ')+esc(latest)+'.':'')+'</p>';
    return block(stats+legend+chart+table+note);
  }

  root.MONOMonthlyRain = { summarize, load, loadRecent, renderRecent, render, renderComparison, monthlySeries, localMonth };
  if (typeof module !== 'undefined' && module.exports) module.exports = { summarize, load, loadRecent, renderRecent, render, renderComparison, monthlySeries, localMonth };
})(typeof window !== 'undefined' ? window : globalThis);
