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
  root.MONOMonthlyRain = { summarize, load, render, localMonth };
  if (typeof module !== 'undefined' && module.exports) module.exports = { summarize, load, render, localMonth };
})(typeof window !== 'undefined' ? window : globalThis);
