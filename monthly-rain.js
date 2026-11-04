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
    const end = new Date(), start = new Date(Date.now() - 45 * 86400000);
    const params = new URLSearchParams({ latitude:lat.toFixed(4), longitude:lon.toFixed(4), start_date:start.toISOString().slice(0,10), end_date:end.toISOString().slice(0,10), daily:'precipitation_sum', timezone:'auto' });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetcher('https://archive-api.open-meteo.com/v1/archive?' + params, {signal:controller.signal});
      if (!response.ok) throw new Error('history unavailable');
      const json = await response.json(), daily = json?.daily;
      if (json?.error || !Array.isArray(daily?.time) || !Array.isArray(daily?.precipitation_sum) || daily.time.length !== daily.precipitation_sum.length) throw new Error('invalid history');
      return {time:daily.time, precipitation_sum:daily.precipitation_sum, timezone:json.timezone || 'auto'};
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

  root.MONOMonthlyRain = { summarize, load, loadRecent, renderRecent, render, localMonth };
  if (typeof module !== 'undefined' && module.exports) module.exports = { summarize, load, loadRecent, renderRecent, render, localMonth };
})(typeof window !== 'undefined' ? window : globalThis);
