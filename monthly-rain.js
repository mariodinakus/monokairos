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
    const params = new URLSearchParams({ latitude:lat.toFixed(4), longitude:lon.toFixed(4), start_date:start.toISOString().slice(0,10), end_date:end.toISOString().slice(0,10), models:'era5', daily:'rain_sum,temperature_2m_mean,wind_speed_10m_max', timezone:'auto' });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetcher('https://archive-api.open-meteo.com/v1/archive?' + params, {signal:controller.signal});
      if (!response.ok) throw new Error('history unavailable');
      const json = await response.json(), daily = json?.daily;
      if (json?.error || !Array.isArray(daily?.time) || !Array.isArray(daily?.rain_sum) || daily.time.length !== daily.rain_sum.length) throw new Error('invalid history');
      // Existing recent-rain panels consume precipitation_sum; both charts now use the same ERA5 rain_sum source.
      return {time:daily.time, precipitation_sum:daily.rain_sum,
        temperature_2m_mean:Array.isArray(daily.temperature_2m_mean)&&daily.temperature_2m_mean.length===daily.time.length?daily.temperature_2m_mean:null,
        wind_speed_10m_max:Array.isArray(daily.wind_speed_10m_max)&&daily.wind_speed_10m_max.length===daily.time.length?daily.wind_speed_10m_max:null,
        weatherFieldsRequested:true,timezone:json.timezone || 'auto', model:'era5'};
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


  function findRainAnalogs(daily, now=Date.now(), zone='UTC', limit=3) {
  if (!Array.isArray(daily?.time) || !Array.isArray(daily?.precipitation_sum) || daily.time.length !== daily.precipitation_sum.length) return null;
  const values = new Map(), duplicates = new Set(), step = 86400000;
  const shift = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * step).toISOString().slice(0, 10);
  for (let i=0; i<daily.time.length; i++) {
    const date = daily.time[i], value = daily.precipitation_sum[i];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00Z'))) continue;
    if (values.has(date)) duplicates.add(date);
    values.set(date, Number.isFinite(value) && value >= 0 ? value : null);
  }
  let today;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
    const part = type => parts.find(p=>p.type===type)?.value;
    today = `${part('year')}-${part('month')}-${part('day')}`;
  } catch { today = new Date(now).toISOString().slice(0, 10); }
  const cutoff = shift(today, -1);
  const dates = [...values.keys()].filter(d=>d<=cutoff && !duplicates.has(d) && Number.isFinite(values.get(d))).sort();
  const sequence = end => {
    const start = shift(end,-6), dailyAmounts=[];
    for (let j=0; j<7; j++) {
      const day = shift(start,j), amount = values.get(day);
      if (duplicates.has(day) || !Number.isFinite(amount)) return null;
      dailyAmounts.push(amount);
    }
    const total = dailyAmounts.reduce((a,b)=>a+b,0);
    return {start,end,total,rainyDays:dailyAmounts.filter(v=>v>=1).length,amounts:dailyAmounts};
  };
  let reference=null;
  for (let i=dates.length-1;i>=0;i--) { reference=sequence(dates[i]); if(reference)break; }
  if (!reference) return null;
  const previousLimit = shift(reference.start,-14);
  const candidates=[];
  for (const date of dates) {
    if (date>previousLimit) break;
    const period=sequence(date);
    if (!period) continue;
    period.rmse=Math.sqrt(period.amounts.reduce((a,v,i)=>a+(v-reference.amounts[i])**2,0)/7);
    candidates.push(period);
  }
  candidates.sort((a,b)=>a.rmse-b.rmse || a.start.localeCompare(b.start));
  const selected=[];
  for (const candidate of candidates) {
    if (selected.every(other=>candidate.end<other.start || candidate.start>other.end)) selected.push(candidate);
    if (selected.length>=Math.max(1,Math.min(5,limit))) break;
  }
  const strip = ({amounts,...rest})=>rest;
  return {reference:strip(reference),matches:selected.map(strip),from:dates[0]||null,to:dates.at(-1)||null,candidates:candidates.length};
}

  function renderRainAnalogs(recent, {lang='el',zone='UTC',now=Date.now()}={}) {
  if (recent?.status!=='ready') return '';
  const result=findRainAnalogs(recent.daily,now,zone),el=lang!=='en',X=(a,b)=>el?a:b;
  if (!result) return '';
  const locale=el?'el-GR':'en-GB', number=v=>new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(v);
  const label=key=>new Date(key+'T12:00:00Z').toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const period=p=>label(p.start)+' – '+label(p.end);
  const current=result.reference;
  const rows=result.matches.map(item=>'<div class="mr-highlight"><small>'+period(item)+'</small><strong>'+number(item.total)+' <span>mm</span></strong><span>'+
    item.rainyDays+' '+X('ημέρες ≥1 mm','days ≥1 mm')+' · RMSE '+number(item.rmse)+' mm/'+X('ημέρα','day')+'</span></div>').join('');
  const note = X('Μόνο ιστορική βροχή ERA5 (Open-Meteo), όχι θερμοκρασία ή συνολική ομοιότητα καιρού. Εμφανίζονται μόνο πλήρη 7ήμερα με απόσταση τουλάχιστον 14 ημερών από το τρέχον δείγμα. Μικρότερο RMSE = πιο παρόμοιο ημερήσιο μοτίβο.',
    'ERA5 historical rain only (Open-Meteo), not temperature or overall weather similarity. Only complete 7-day periods at least 14 days away from the reference. Lower RMSE = more similar daily rainfall pattern.');
  return '<details class="mr-details" data-rain-analogs><summary>'+X('Παρόμοια 7ήμερα βροχής','Similar historical rain weeks')+'</summary>'+
    '<p class="mr-compare-note"><b>'+X('Σύγκριση με','Compared with')+' '+period(current)+': '+number(current.total)+' mm · '+current.rainyDays+' '+X('ημέρες βροχής','rainy days')+'</b></p>'+
    (rows?'<div class="mr-summary">'+rows+'</div>':'<p class="mr-status">'+X('Δεν υπάρχουν αρκετά παλαιότερα πλήρη 7ήμερα.','Not enough complete historical weeks yet.')+'</p>')+
    '<p class="mr-compare-note">'+note+' '+X('Διαθέσιμη περίοδος','Available period')+': '+label(result.from)+' – '+label(result.to)+'.</p></details>';
}

  function findWeatherAnalogs(daily,now=Date.now(),zone='UTC',limit=3){
 const keys=['precipitation_sum','temperature_2m_mean','wind_speed_10m_max'];
 if(!Array.isArray(daily?.time)||!keys.every(k=>Array.isArray(daily[k])&&daily[k].length===daily.time.length))return null;
 const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const records=new Map(),dup=new Set();
 for(let i=0;i<daily.time.length;i++){
  const day=daily.time[i];if(!validDay(day))continue;
  if(records.has(day))dup.add(day);
  const row=keys.map(k=>daily[k][i]);
  records.set(day,row.every(Number.isFinite)&&row[0]>=0&&row[2]>=0?row:null);
 }
 let today;
 try {
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const get=x=>p.find(z=>z.type===x)?.value;
  today=get('year')+'-'+get('month')+'-'+get('day');
 }catch{today=new Date(now).toISOString().slice(0,10);}
 const dates=[...records.keys()].filter(d=>d<today&&!dup.has(d)&&records.get(d)).sort();
 const makeWeek=end=>{
  const start=shift(end,-6),rows=[];
  for(let j=0;j<7;j++){
   const day=shift(start,j),row=records.get(day);
   if(dup.has(day)||!row)return null;
   rows.push(row);
  }
  const rain=rows.reduce((sum,r)=>sum+r[0],0);
  const temp=rows.reduce((sum,r)=>sum+r[1],0)/7;
  const maxWind=Math.max(...rows.map(r=>r[2]));
  return {start,end,rain,temp,maxWind,rows};
 };
 let reference=null;
 for(let i=dates.length-1;i>=0;i--){reference=makeWeek(dates[i]);if(reference)break;}
 if(!reference)return null;
 const before=shift(reference.start,-14),candidates=[];
 for(const end of dates){
  if(end>before)break;
  const c=makeWeek(end);if(!c)continue;
  const rmse=j=>Math.sqrt(c.rows.reduce((sum,r,i)=>sum+Math.pow(r[j]-reference.rows[i][j],2),0)/7);
  c.rainRmse=rmse(0);c.tempRmse=rmse(1);c.windRmse=rmse(2);
  // Transparent heuristic: normalise units, then use a Euclidean distance, not a probability.
  c.distance=Math.hypot(c.rainRmse/6,c.tempRmse/4,c.windRmse/15);
  candidates.push(c);
 }
 candidates.sort((a,b)=>a.distance-b.distance||a.start.localeCompare(b.start));
 const selected=[];
 for(const c of candidates){
  if(selected.every(x=>c.end<x.start||c.start>x.end))selected.push(c);
  if(selected.length>=Math.max(1,Math.min(5,limit)))break;
 }
 const strip=({rows,...x})=>x;
 return {reference:strip(reference),matches:selected.map(strip),from:dates[0]||null,to:dates.at(-1)||null,checkedWindows:candidates.length};
}

  function renderWeatherAnalogs(recent,{lang='el',zone='UTC',now=Date.now()}={}){
 if(recent?.status!=='ready')return '';
 const el=lang!=='en',X=(a,b)=>el?a:b;
 const result=findWeatherAnalogs(recent.daily,now,zone);
 const locale=el?'el-GR':'en-GB',num=(x,d=1)=>new Intl.NumberFormat(locale,{maximumFractionDigits:d}).format(x);
 const date=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
 const period=x=>date(x.start)+' – '+date(x.end);
 const shell=content=>'<details class="mr-details" data-weather-analogs><summary>'+X('Παρόμοια 7ήμερα: βροχή, θερμοκρασία και άνεμος','Similar 7-day weather: rain, temperature and wind')+'</summary>'+content+'</details>';
 if(!result)return shell('<p class="mr-status">'+X('Δεν υπάρχουν ακόμη 7 πλήρεις ημέρες με όλα τα ιστορικά πεδία ERA5.','There are not yet 7 complete ERA5 days with all required fields.')+'</p>');
 const explain=X('Η κατάταξη συγκρίνει καθημερινά μοτίβα με κανονικοποιημένο RMSE (βροχή /6 mm, θερμοκρασία /4°C, μέγιστος άνεμος /15 km/h). Είναι περιγραφική ομοιότητα ιστορικής επανάλυσης, όχι πρόγνωση, πιθανότητα ή μέτρηση στο σπίτι σου. Απαιτούνται πλήρη 7ήμερα, χωρίς επικαλύψεις και με τουλάχιστον 14 ημέρες απόσταση.',
  'Ranking compares daily patterns using normalised RMSE (rain /6 mm, temperature /4°C, maximum wind /15 km/h). This is descriptive similarity of historical reanalysis, not a forecast, probability, or a measurement at your home. Only complete non-overlapping 7-day periods at least 14 days away qualify.');
 const summary=x=>num(x.rain)+' mm · '+num(x.temp)+'°C '+X('μ.ό.','avg.')+' · '+num(x.maxWind,0)+' km/h '+X('κορυφή','peak');
 const rows=result.matches.map(x=>'<article class="mr-highlight"><small>'+period(x)+'</small><strong>'+num(x.temp)+'<span>°C</span></strong>'+
  '<span>'+summary(x)+'</span><small>RMSE '+X('βροχής','rain')+' '+num(x.rainRmse)+' mm · '+X('θερμ.','temp.')+' '+num(x.tempRmse)+'°C · '+X('ανέμου','wind')+' '+num(x.windRmse)+' km/h</small></article>').join('');
 return shell('<p class="mr-compare-note"><b>'+X('Τελευταίο πλήρες 7ήμερο','Latest complete 7 days')+' · '+period(result.reference)+'</b> · '+summary(result.reference)+'</p>'+
  (rows?'<div class="mr-summary">'+rows+'</div>':'<p class="mr-status">'+X('Δεν υπάρχουν αρκετά ανεξάρτητα παλαιότερα 7ήμερα.','Not enough separate earlier 7-day periods.')+'</p>')+
  '<p class="mr-compare-note">ERA5 · Open-Meteo. '+explain+'</p>');
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
      const coverageText=partial?'<small class="mr-coverage">'+r.coverage+'/'+r.days+' '+X('ημέρες','days')+'</small>':'';
      const tip=label(r)+' · '+(r.complete?X('Πλήρης μήνας','Full month'):X('Μερική κάλυψη','Partial coverage')+' '+r.coverage+'/'+r.days);
      return '<div class="mr-column"><div class="mr-bar-value">'+amountText+coverageText+'</div><div class="mr-bars">'+
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
    return block(stats+legend+chart+table+renderRainAnalogs(recent,{lang,zone,now})+renderWeatherAnalogs(recent,{lang,zone,now})+note);
  }

  root.MONOMonthlyRain = { summarize, load, loadRecent, renderRecent, render, renderComparison, monthlySeries, localMonth, findRainAnalogs, renderRainAnalogs, findWeatherAnalogs, renderWeatherAnalogs };
  if (typeof module !== 'undefined' && module.exports) module.exports = { summarize, load, loadRecent, renderRecent, render, renderComparison, monthlySeries, localMonth, findRainAnalogs, renderRainAnalogs, findWeatherAnalogs, renderWeatherAnalogs };
})(typeof window !== 'undefined' ? window : globalThis);
