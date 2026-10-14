/* MONO Climate — multi-year daily history for a point, from real stations and from ERA5.
 *   Station (preferred): Meteostat bulk daily (GHCN/ISD/national services) → fallback NOAA NCEI GHCN-Daily.
 *   Reanalysis (always): ERA5 / ERA5-Land via Open-Meteo, 1940 → ~6 days ago, plus recent days from the forecast analysis.
 * Everything is normalised to daily records {d:'YYYY-MM-DD', tx, tn, tm, p, s, g, c}
 *   tx/tn/tm °C · p precipitation mm · s snowfall cm (ERA5) or snow depth flag (station) · g max gust km/h · c WMO code */
(function (root) {
  'use strict';
  const fin = Number.isFinite;
  const mean = a => { let s = 0, n = 0; for (const v of a) if (fin(v)) { s += v; n++; } return n ? s / n : null; };
  const sum = a => { let s = 0, n = 0; for (const v of a) if (fin(v)) { s += v; n++; } return n ? s : null; };
  const num = v => { if (v === null || v === undefined) return null; const x = typeof v === 'number' ? v : parseFloat(String(v).trim()); return fin(x) ? x : null; };
  const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function fetchAny(u, ms = 40000, as = 'json') {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(u, { signal: ac.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (as === 'gzip') return await gunzipText(r);
      const body = as === 'text' ? await r.text() : await r.json();
      if (as === 'json' && body && body.error) throw new Error(body.reason || 'error');
      return body;
    } finally { clearTimeout(timer); }
  }
  /* Same-origin proxy (Netlify _redirects) first, then the direct URL. */
  async function viaProxy(proxyPath, direct, ms, as) {
    if (location.protocol.startsWith('http')) { try { return await fetchAny(proxyPath, ms, as); } catch (e) {} }
    return fetchAny(direct, ms, as);
  }
  /* bulk.meteostat.net serves .gz files; decompress unless the browser already did (Content-Encoding). */
  async function gunzipText(r) {
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
      const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(ds).text();
    }
    return new TextDecoder().decode(buf);
  }

  /* ---------------------------------------------------------------- ERA5 (Open-Meteo archive) */
  const ERA_VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max,weather_code';
  async function loadERA5(c, fromYear, onChunk, toYear) {
    const end = new Date(Date.now() - 6 * 86400e3), endY = end.getUTCFullYear(), topY = Math.min(endY, toYear ?? endY);
    const chunks = [];
    for (let y = topY; y >= fromYear; y -= 10) chunks.push([Math.max(fromYear, y - 9), y]);
    const days = [];
    let n = 0;
    for (const [a, b] of chunks) {
      const s = `${a}-01-01`, e = b === endY ? iso(end) : `${b}-12-31`;
      const u = 'https://archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({ latitude: (+c.lat).toFixed(4), longitude: (+c.lon).toFixed(4), start_date: s, end_date: e, daily: ERA_VARS, timezone: 'auto' });
      let d;
      try { d = await fetchAny(u, 60000); }
      catch (err) { await sleep(25000); d = await fetchAny(u, 60000); }   // one retry after the per-minute window
      const D = d.daily;
      for (let i = 0; i < D.time.length; i++) days.push({ d: D.time[i], tx: num(D.temperature_2m_max[i]), tn: num(D.temperature_2m_min[i]), tm: num(D.temperature_2m_mean?.[i]),
        p: num(D.precipitation_sum[i]), s: num(D.snowfall_sum?.[i]), g: num(D.wind_gusts_10m_max?.[i]), c: num(D.weather_code?.[i]) });
      n++;
      if (onChunk) onChunk(days, n, chunks.length);
      if (n % 3 === 0 && n < chunks.length) await sleep(21000);   // stay under Open-Meteo's per-minute weight
    }
    return { source: 'era5', days };
  }
  /* last ~60 days from the forecast model analysis, to cover the ERA5 delay */
  async function loadRecent(c) {
    const u = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({ latitude: (+c.lat).toFixed(4), longitude: (+c.lon).toFixed(4), past_days: 61, forecast_days: 1,
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max,weather_code', timezone: 'auto' });
    const d = await fetchAny(u, 20000), D = d.daily, today = iso(Date.now());
    const out = [];
    for (let i = 0; i < D.time.length; i++) if (D.time[i] < today) out.push({ d: D.time[i], tx: num(D.temperature_2m_max[i]), tn: num(D.temperature_2m_min[i]), p: num(D.precipitation_sum[i]), s: num(D.snowfall_sum[i]), g: num(D.wind_gusts_10m_max[i]), c: num(D.weather_code[i]), recent: true });
    return out;
  }

  /* ---------------------------------------------------------------- real stations */
  let msStations = null;
  async function loadMeteostat(c) {
    if (!msStations) msStations = JSON.parse(await viaProxy('/proxy/meteostat/v2/stations/lite.json.gz', 'https://bulk.meteostat.net/v2/stations/lite.json.gz', 45000, 'gzip'));
    const cand = msStations.map(s => ({ id: s.id, name: s.name?.en || s.name?.[Object.keys(s.name || {})[0]] || s.id, lat: s.location?.latitude, lon: s.location?.longitude, elev: s.location?.elevation,
      start: s.inventory?.daily?.start, end: s.inventory?.daily?.end, icao: s.identifiers?.icao, wmo: s.identifiers?.wmo }))
      .filter(s => fin(s.lat) && s.start && s.end).map(s => ({ ...s, dist: km(c, s), years: (Date.parse(s.end) - Date.parse(s.start)) / 31557600e3 }))
      .filter(s => s.dist <= 50 && s.years >= 10 && Date.now() - Date.parse(s.end) < 3 * 365 * 86400e3)
      .sort((a, b) => (a.dist - b.dist) - (b.years - a.years) * 0.4);   // nearer is better, longer record breaks ties
    const st = cand[0]; if (!st) throw new Error('no meteostat station');
    const csv = await viaProxy(`/proxy/meteostat/v2/daily/${st.id}.csv.gz`, `https://bulk.meteostat.net/v2/daily/${st.id}.csv.gz`, 60000, 'gzip');
    const days = [];
    for (const line of csv.split('\n')) {
      const f = line.split(','); if (f.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(f[0])) continue;
      // date,tavg,tmin,tmax,prcp,snow(depth mm),wdir,wspd,wpgt,pres,tsun
      days.push({ d: f[0], tm: num(f[1]), tn: num(f[2]), tx: num(f[3]), p: num(f[4]), sd: num(f[5]), g: num(f[8]) });
    }
    if (days.length < 3650) throw new Error('short record');
    return { source: 'meteostat', station: { id: st.id, name: st.name, dist: st.dist, elev: st.elev, icao: st.icao, wmo: st.wmo }, days };
  }
  async function loadNCEI(c) {
    const bb = [c.lat + 0.45, c.lon - 0.6, c.lat - 0.45, c.lon + 0.6].map(v => v.toFixed(3)).join(',');
    const s = await fetchAny('https://www.ncei.noaa.gov/access/services/search/v1/data?' + new URLSearchParams({ dataset: 'daily-summaries', bbox: bb, limit: 50 }), 30000);
    const cand = (s.results || []).map(r => {
      const st = r.stations?.[0] || {}; const co = r.location?.coordinates || r.boundingPoints?.[0]?.coordinates || r.centroid?.point || [];
      return { id: st.id || r.id, name: st.name || r.name, lon: num(co[0]), lat: num(co[1]), start: r.startDate, end: r.endDate };
    }).filter(x => x.id && fin(x.lat)).map(x => ({ ...x, dist: km(c, x), years: (Date.parse(x.end) - Date.parse(x.start)) / 31557600e3 }))
      .filter(x => x.years >= 10 && Date.now() - Date.parse(x.end) < 3 * 365 * 86400e3).sort((a, b) => (a.dist - b.dist) - (b.years - a.years) * 0.4);
    const st = cand[0]; if (!st) throw new Error('no ghcn station');
    const d = await fetchAny('https://www.ncei.noaa.gov/access/services/data/v1?' + new URLSearchParams({ dataset: 'daily-summaries', stations: st.id, startDate: (st.start || '1950-01-01').slice(0, 10),
      endDate: iso(Date.now()), dataTypes: 'TMAX,TMIN,TAVG,PRCP,SNWD,WSFG', units: 'metric', format: 'json' }), 90000);
    const days = (Array.isArray(d) ? d : []).map(r => ({ d: String(r.DATE).slice(0, 10), tx: num(r.TMAX), tn: num(r.TMIN), tm: num(r.TAVG), p: num(r.PRCP), sd: num(r.SNWD), g: fin(num(r.WSFG)) ? num(r.WSFG) * 3.6 : null }));
    if (days.length < 3650) throw new Error('short record');
    return { source: 'ghcn', station: { id: st.id, name: st.name, dist: st.dist }, days };
  }
  async function loadStation(c) {
    try { return await loadMeteostat(c); } catch (e) { /* fall through */ }
    return await loadNCEI(c);
  }

  /* ---------------------------------------------------------------- aggregation */
  const NORMAL = [1991, 2020];
  function aggregate(days, extra = []) {
    const all = new Map(); for (const r of days) all.set(r.d, r); for (const r of extra) if (!all.has(r.d)) all.set(r.d, r);
    const list = [...all.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
    const ym = {};
    for (const r of list) {
      const key = r.d.slice(0, 7); const o = (ym[key] ||= { y: +key.slice(0, 4), m: +key.slice(5, 7), rows: [] }); o.rows.push(r);
    }
    const months = {};
    for (const [key, o] of Object.entries(ym)) {
      const rs = o.rows, dim = new Date(Date.UTC(o.y, o.m, 0)).getUTCDate();
      const tx = rs.map(r => r.tx), tn = rs.map(r => r.tn), tm = rs.map(r => (fin(r.tm) ? r.tm : fin(r.tx) && fin(r.tn) ? (r.tx + r.tn) / 2 : null));
      const nT = tm.filter(fin).length, nP = rs.filter(r => fin(r.p)).length;
      const maxR = rs.reduce((a, r) => (fin(r.tx) && (!a || r.tx > a.tx) ? r : a), null), minR = rs.reduce((a, r) => (fin(r.tn) && (!a || r.tn < a.tn) ? r : a), null);
      const wetR = rs.reduce((a, r) => (fin(r.p) && (!a || r.p > a.p) ? r : a), null);
      const cnt = f => rs.filter(f).length;
      const hasG = rs.some(r => fin(r.g)), hasS = rs.some(r => fin(r.s) || fin(r.sd)), hasC = rs.some(r => fin(r.c));
      months[key] = { y: o.y, m: o.m, days: rs.length, dim, completeT: nT >= dim - 5, completeP: nP >= dim - 5,
        tx: mean(tx), tn: mean(tn), tm: mean(tm), txMax: maxR?.tx ?? null, txMaxD: maxR?.d, tnMin: minR?.tn ?? null, tnMinD: minR?.d,
        p: nP ? sum(rs.map(r => r.p)) : null, pMax: wetR?.p ?? null, pMaxD: wetR?.d,
        rain: cnt(r => r.p >= 1), heavy: cnt(r => r.p >= 10), frost: cnt(r => r.tn < 0), summer: cnt(r => r.tx >= 25), hot: cnt(r => r.tx >= 35),
        tropical: cnt(r => r.tn >= 20), snow: hasS ? cnt(r => r.s >= 0.5 || r.sd > 0) : null, gale: hasG ? cnt(r => r.g >= 62) : null,
        storm: hasC ? cnt(r => r.c >= 95) : null, recent: rs.some(r => r.recent) };
    }
    const years = [...new Set(Object.values(months).map(m => m.y))].sort((a, b) => a - b);
    const normals = {};
    for (let m = 1; m <= 12; m++) {
      const ms = Object.values(months).filter(x => x.m === m);
      const inRef = ms.filter(x => x.y >= NORMAL[0] && x.y <= NORMAL[1]);
      const use = inRef.filter(x => x.completeT).length >= 20 ? inRef : ms;
      const T = use.filter(x => x.completeT), Pp = use.filter(x => x.completeP);
      const avg = (arr, f) => mean(arr.map(f));
      normals[m] = { period: use === inRef ? `${NORMAL[0]}–${NORMAL[1]}` : `${Math.min(...use.map(x => x.y))}–${Math.max(...use.map(x => x.y))}`, n: T.length,
        tx: avg(T, x => x.tx), tn: avg(T, x => x.tn), tm: avg(T, x => x.tm), p: avg(Pp, x => x.p),
        rain: avg(Pp, x => x.rain), heavy: avg(Pp, x => x.heavy), frost: avg(T, x => x.frost), summer: avg(T, x => x.summer), hot: avg(T, x => x.hot), tropical: avg(T, x => x.tropical),
        snow: avg(use.filter(x => x.snow != null), x => x.snow), gale: avg(use.filter(x => x.gale != null), x => x.gale), storm: avg(use.filter(x => x.storm != null), x => x.storm),
        recMax: ms.reduce((a, x) => (fin(x.txMax) && (!a || x.txMax > a.txMax) ? x : a), null), recMin: ms.reduce((a, x) => (fin(x.tnMin) && (!a || x.tnMin < a.tnMin) ? x : a), null),
        recWetDay: ms.reduce((a, x) => (fin(x.pMax) && (!a || x.pMax > a.pMax) ? x : a), null),
        warmest: ms.filter(x => x.completeT).reduce((a, x) => (!a || x.tm > a.tm ? x : a), null), coldest: ms.filter(x => x.completeT).reduce((a, x) => (!a || x.tm < a.tm ? x : a), null),
        wettest: ms.filter(x => x.completeP).reduce((a, x) => (!a || x.p > a.p ? x : a), null), driest: ms.filter(x => x.completeP).reduce((a, x) => (!a || x.p < a.p ? x : a), null) };
    }
    return { months, years, normals, first: list[0]?.d, last: list.at(-1)?.d, nDays: list.length };
  }

  root.MONOClimate = { loadERA5, loadRecent, loadStation, aggregate, NORMAL };
})(typeof window !== 'undefined' ? window : globalThis);
