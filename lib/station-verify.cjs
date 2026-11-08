/* Station verification of MONO's day-ahead temperature forecast.
 * MONO's own algorithm (model.js) is trained on each model's previous-day run
 * against ERA5, exactly like the app, with training that ends before every
 * evaluated day. Its day-ahead forecast AT THE STATION'S COORDINATES is then
 * compared with that airport's hourly METAR temperatures (Iowa Environmental
 * Mesonet archive). Public, curated airports only; no visitor data. */
'use strict';
const M = require('../model.js');
const HOUR = 3600e3, DAY = 24 * HOUR, fin = Number.isFinite;
const ZONE = 'Europe/Athens', TRAIN_DAYS = 62, BACKFILL_DAYS = 30, MIN_HOURS = 18, KEEP = 400, HIT = 2;
const MODELS = ['ecmwf_ifs025', 'gfs_global', 'icon_global', 'meteofrance_arpege_world', 'ukmo_global_deterministic_10km', 'gem_global', 'jma_gsm', 'ecmwf_aifs025_single'];
// City → airport (ICAO). Coordinates come from the IEM network list at run time.
const CITIES = [
  ['thessaloniki', 40.6401, 22.9444, 'LGTS'], ['athens', 37.9838, 23.7275, 'LGAV'], ['patras', 38.2466, 21.7346, 'LGRX'],
  ['heraklion', 35.3387, 25.1442, 'LGIR'], ['larisa', 39.639, 22.4191, 'LGLR'], ['volos', 39.3667, 22.9458, 'LGBL'],
  ['ioannina', 39.665, 20.8537, 'LGIO'], ['chania', 35.5138, 24.018, 'LGSA'], ['kavala', 40.936, 24.4129, 'LGKV'],
  ['rhodes', 36.434, 28.2176, 'LGRP'], ['alexandroupoli', 40.8457, 25.8739, 'LGAL'], ['corfu', 39.6243, 19.9217, 'LGKR']
];

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const r2 = v => fin(v) ? Math.round(v * 100) / 100 : null;
function km(a, b) { const R = Math.PI / 180, dl = (b.lat - a.lat) * R, dn = (b.lon - a.lon) * R, h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(h))); }
function nearestCity(lat, lon, max = 25) {
  const best = CITIES.map(c => ({ c, d: km({ lat, lon }, { lat: c[1], lon: c[2] }) })).sort((a, b) => a.d - b.d)[0];
  return best && best.d <= max ? { id: best.c[0], lat: best.c[1], lon: best.c[2], icao: best.c[3], dist: best.d } : null;
}
function parts(t, zone = ZONE) {
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map(p => [p.type, p.value]));
  return { day: `${o.year}-${o.month}-${o.day}`, hour: +o.hour % 24 };
}
const iso = t => new Date(t).toISOString().slice(0, 10);
// Local calendar days ending yesterday, oldest first.
function lastDays(now, n, zone = ZONE) {
  const today = parts(now, zone).day, out = [];
  for (let h = 12; out.length < n && h < (n + 3) * 24; h += 24) { const d = parts(now - h * HOUR, zone).day; if (d !== today && !out.includes(d)) out.unshift(d); }
  return out;
}

function align(times, values) { const m = new Map(); (times || []).forEach((t, i) => { if (fin(values?.[i])) m.set(t * 1000, values[i]); }); return m; }

/* IEM ASOS CSV "station,valid,tmpc" → Map(hour → °C), observation nearest to each whole hour (±35′). */
function parseIem(csv) {
  const best = new Map();
  for (const line of String(csv || '').split('\n').slice(1)) {
    const [, valid, tmpc] = line.split(',');
    const t = Date.parse(String(valid || '').replace(' ', 'T') + 'Z'), v = +tmpc;
    if (!fin(t) || !fin(v) || tmpc === 'M' || v < -60 || v > 60) continue;
    const h = Math.round(t / HOUR) * HOUR, gap = Math.abs(t - h);
    if (gap > 35 * 60e3) continue;
    const prev = best.get(h); if (!prev || gap < prev.gap) best.set(h, { v, gap });
  }
  return new Map([...best].map(([h, o]) => [h, o.v]));
}

/* Train MONO lead-1 temperature on [start, end] (UTC dates). */
/* Train MONO lead-1 on ERA5, or on the station's own hourly observations when `stationTruth` is given. */
function train(era5, runs, zone = ZONE, stationTruth = null) {
  const times = (era5?.time || []).map(t => t * 1000);
  if (times.length < 24 * 20) return null;
  const hours = times.map(t => parts(t, zone).hour);
  const truth = stationTruth ? times.map(t => stationTruth.has(t) ? stationTruth.get(t) : null) : times.map((_, i) => era5.temperature_2m?.[i] ?? null);
  if (stationTruth && truth.filter(fin).length < 24 * 15) return null;
  const models = {};
  for (const [id, h] of Object.entries(runs)) {
    const m = align(h.time, h.temperature_2m_previous_day1), arr = times.map(t => m.has(t) ? m.get(t) : null);
    if (arr.filter(fin).length >= 24 * 15) models[id] = { 1: arr };
  }
  if (Object.keys(models).length < 2) return null;
  const fit = M.fitVariable({ times, hours, truth, models });
  return fit?.leads?.[1] ? { fit, models: Object.keys(models), choice: fit.leads[1].choice } : null;
}

/* MONO forecast rows {t, mono, mean} from each model's previous-day run. */
function forecast(fit, runs, ids, zone = ZONE) {
  const maps = Object.fromEntries(ids.filter(id => runs[id]).map(id => [id, align(runs[id].time, runs[id].temperature_2m_previous_day1)]));
  const times = [...new Set(Object.values(maps).flatMap(m => [...m.keys()]))].sort((a, b) => a - b);
  const meanAt = t => mean(Object.values(maps).map(m => m.get(t)).filter(fin));
  return times.map(t => {
    const vals = {}; for (const [id, m] of Object.entries(maps)) if (fin(m.get(t))) vals[id] = m.get(t);
    const mu = meanAt(t); if (!fin(mu)) return null;
    const r = { t, H: parts(t, zone).hour, vals, mean: mu, prev: meanAt(t - HOUR) ?? mu, next: meanAt(t + HOUR) ?? mu };
    const p = M.predictVariable(fit, 1, r).value;
    return fin(p) ? { t, mono: p, mean: mu } : null;
  }).filter(Boolean);
}

/* One record per local day with enough observed hours.
 * "Cor" = MONO with a station correction learned ONLY from earlier days:
 * the mean error at each local hour over the previous 14 evaluated days
 * (the same idea as the app's live station correction). */
const BANK_DAYS = 14;
function correction(bank, day) {
  const prior = (bank || []).filter(b => b.day < day).slice(-BANK_DAYS);
  if (prior.length < 7) return null; // at least a week of earlier station errors
  const all = prior.flatMap(b => b.e.filter(fin)), overall = mean(all);
  return h => { const v = prior.map(b => b.e[h]).filter(fin); return v.length >= 5 ? mean(v) : overall; };
}
function score(rows, obs, days, zone = ZONE, bank = []) {
  const want = new Set(days), byDay = new Map();
  for (const r of rows) {
    const o = obs.get(r.t); if (!fin(o)) continue;
    const pt = parts(r.t, zone); if (!want.has(pt.day)) continue;
    (byDay.get(pt.day) || byDay.set(pt.day, []).get(pt.day)).push({ o, f: r.mono, m: r.mean, s: r.sta, h: pt.hour });
  }
  const out = [], nextBank = [...(bank || [])];
  for (const d of [...days].sort()) {
    const p = byDay.get(d) || []; if (p.length < MIN_HOURS) continue;
    const cor = correction(nextBank, d);
    const e = p.map(x => x.f - x.o), em = p.map(x => x.m - x.o), ec = cor ? p.map(x => x.f - cor(x.h) - x.o) : null;
    const hitOf = a => r2(a.filter(x => Math.abs(x) <= HIT).length / a.length);
    out.push({ day: d, n: p.length,
      obsMax: r2(Math.max(...p.map(x => x.o))), obsMin: r2(Math.min(...p.map(x => x.o))),
      monoMax: r2(Math.max(...p.map(x => x.f))), monoMin: r2(Math.min(...p.map(x => x.f))),
      mae: r2(mean(e.map(Math.abs))), maeMean: r2(mean(em.map(Math.abs))), bias: r2(mean(e)),
      hit: hitOf(e), hitMean: hitOf(em),
      ...(ec ? { maeCor: r2(mean(ec.map(Math.abs))), hitCor: hitOf(ec), biasCor: r2(mean(ec)) } : {}),
      ...(p.every(x => fin(x.s)) ? (es => ({ maeSta: r2(mean(es.map(Math.abs))), hitSta: hitOf(es), biasSta: r2(mean(es)) }))(p.map(x => x.s - x.o)) : {}) });
    const eh = Array(24).fill(null); for (const x of p) eh[x.h] = r2(x.f - x.o);
    nextBank.push({ day: d, e: eh });
  }
  return { records: out, bank: nextBank.sort((a, b) => a.day < b.day ? -1 : 1).slice(-BANK_DAYS - 7) };
}

function merge(old, add) {
  const by = new Map((old || []).map(r => [r.day, r]));
  for (const r of add) by.set(r.day, r);
  return [...by.values()].sort((a, b) => a.day < b.day ? -1 : 1).slice(-KEEP);
}

/* Public summary over the last `window` days (hour-weighted). */
function summary(state, window = 30) {
  const recs = (state?.records || []).slice(-window);
  if (!recs.length) return { available: false, reason: 'collecting' };
  const n = recs.reduce((s, r) => s + r.n, 0), w = k => r2(recs.reduce((s, r) => s + r[k] * r.n, 0) / n);
  const rc = recs.filter(r => fin(r.maeCor)), nc = rc.reduce((s, r) => s + r.n, 0), wc = k => nc ? r2(rc.reduce((s, r) => s + r[k] * r.n, 0) / nc) : null;
  // Fair comparison: the corrected score and its baselines over the same days.
  const wSame = k => nc ? r2(rc.reduce((s, r) => s + r[k] * r.n, 0) / nc) : null;
  return { available: true, station: state.station, city: state.city, days: recs.length, hours: n,
    hit: w('hit'), hitMean: w('hitMean'), mae: w('mae'), maeMean: w('maeMean'), bias: w('bias'),
    stationTrained: (() => { const rs = recs.filter(r => fin(r.maeSta)), ns = rs.reduce((a, r) => a + r.n, 0), ws = k => ns ? r2(rs.reduce((a, r) => a + r[k] * r.n, 0) / ns) : null;
      return ns ? { days: rs.length, hours: ns, hit: ws('hitSta'), mae: ws('maeSta'), bias: ws('biasSta'), hitMean: ws('hitMean'), maeMean: ws('maeMean'), hitEra5: ws('hit'), maeEra5: ws('mae') } : null; })(),
    corrected: nc ? { days: rc.length, hours: nc, hit: wc('hitCor'), mae: wc('maeCor'), bias: wc('biasCor'), hitMean: wSame('hitMean'), maeMean: wSame('maeMean'), hitRaw: wSame('hit'), maeRaw: wSame('mae') } : null,
    first: recs[0].day, last: recs.at(-1).day, records: recs, updatedAt: state.updatedAt, trained: state.trained,
    method: 'MONO day-ahead (previous-day runs, trained on ERA5 before each evaluated day) at the station point vs hourly METAR' };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Providers throttle bursts (Open-Meteo 429, IEM empty replies): retry once after a pause.
async function text(url, timeout = 20000, tries = 2) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'MONO Weather verification (monokairos.vercel.app)' } });
    if (r.ok) return r.text();
    if (i + 1 >= tries || ![429, 502, 503].includes(r.status)) throw Error('HTTP ' + r.status);
    await sleep(4000 * (i + 1));
  }
}
const json = async (url, timeout) => JSON.parse(await text(url, timeout));
const qs = o => new URLSearchParams(o).toString();
let io_pause = 8000;

async function stationInfo(icao, get = json) {
  const g = await get('https://mesonet.agron.iastate.edu/geojson/network/GR__ASOS.geojson', 15000);
  const f = (g.features || []).find(x => (x.properties?.sid || x.id) === icao);
  const lon = f?.geometry?.coordinates?.[0], lat = f?.geometry?.coordinates?.[1];
  if (!fin(lat) || !fin(lon)) throw Error('station not found');
  return { icao, name: f.properties?.sname || icao, lat: +lat, lon: +lon };
}
async function previousRuns(st, start, end, get = json) {
  const runs = {};
  // At most three model requests at a time keeps well under the provider's burst limit.
  const queue = [...MODELS];
  await Promise.all(Array.from({ length: 3 }, async () => { for (let id; (id = queue.shift());) await (async () => {
    try {
      const d = await get('https://previous-runs-api.open-meteo.com/v1/forecast?' + qs({ latitude: st.lat.toFixed(4), longitude: st.lon.toFixed(4), models: id,
        hourly: 'temperature_2m_previous_day1', start_date: start, end_date: end, timezone: 'UTC', timeformat: 'unixtime', cell_selection: 'land' }), 25000);
      if (Array.isArray(d?.hourly?.time) && d.hourly.temperature_2m_previous_day1?.some(fin)) runs[id] = d.hourly;
    } catch {}
  })(); }));
  return runs;
}
async function observations(icao, start, end, getText = text) {
  const a = new Date(start + 'T00:00:00Z'), b = new Date(Date.parse(end + 'T00:00:00Z') + DAY);
  const url = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?' + qs({ station: icao, data: 'tmpc', tz: 'Etc/UTC', format: 'onlycomma',
    latlon: 'no', missing: 'M', report_type: '3', year1: a.getUTCFullYear(), month1: a.getUTCMonth() + 1, day1: a.getUTCDate(),
    year2: b.getUTCFullYear(), month2: b.getUTCMonth() + 1, day2: b.getUTCDate() });
  for (let i = 0; i < 2; i++) {
    const obs = parseIem(await getText(url, 25000));
    if (obs.size) return obs;
    await sleep(io_pause);
  }
  // An empty archive reply is almost always throttling: fail so the day is retried, never "checked".
  throw Error('observations unavailable');
}

/* Bring a city's record up to yesterday. Training always ends before the first evaluated day. */
async function update(city, state, now = Date.now(), io = {}) {
  const get = io.json || json, getText = io.text || text;
  const station = state?.station?.icao === city.icao ? { ...state.station } : await stationInfo(city.icao, get);
  station.dist = r2(km(city, station));
  if (state && state.version !== 3) state = null; // earlier format: rebuild from scratch
  const have = new Set((state?.records || []).map(r => r.day));
  const days = lastDays(now, BACKFILL_DAYS).filter(d => !have.has(d));
  if (!days.length) return { ...state, station, checkedAt: now, city: city.id };
  const first = Date.parse(days[0] + 'T00:00:00Z');
  const trainEnd = Math.min(now - 6 * DAY, first - 2 * DAY), trainStart = trainEnd - (TRAIN_DAYS - 1) * DAY;
  const evalStart = iso(first - DAY), evalEnd = iso(Date.parse(days.at(-1) + 'T00:00:00Z') + DAY);
  const [era5, trainRuns, evalRuns, obs] = await Promise.all([
    get('https://archive-api.open-meteo.com/v1/archive?' + qs({ latitude: station.lat.toFixed(4), longitude: station.lon.toFixed(4), models: 'era5',
      hourly: 'temperature_2m', start_date: iso(trainStart), end_date: iso(trainEnd), timezone: 'UTC', timeformat: 'unixtime' }), 30000).then(d => d.hourly),
    previousRuns(station, iso(trainStart), iso(trainEnd), get),
    previousRuns(station, evalStart, evalEnd, get),
    observations(station.icao, evalStart, evalEnd, getText)
  ]);
  const t = train(era5, trainRuns);
  if (!t) throw Error('training data unavailable');
  const rows = forecast(t.fit, evalRuns, t.models);
  // Experimental variant: the same MONO trained on the station's own past observations
  // (same window, same models, still ending before the first evaluated day).
  let ts = null;
  try { await sleep(io_pause); ts = train(era5, trainRuns, ZONE, await observations(station.icao, iso(trainStart), iso(trainEnd), getText)); } catch {}
  if (ts) { const sta = new Map(forecast(ts.fit, evalRuns, ts.models).map(r => [r.t, r.mono])); for (const r of rows) r.sta = sta.get(r.t); }
  const { records: add, bank } = score(rows, obs, days, ZONE, state?.bank || []);
  return { version: 3, city: city.id, station, records: merge(state?.records, add), bank, updatedAt: now, checkedAt: now,
    trained: { start: iso(trainStart), end: iso(trainEnd), models: t.models, choice: t.choice, stationChoice: ts?.choice || null } };
}

module.exports = { setPause: ms => { io_pause = ms; }, CITIES, MODELS, nearestCity, lastDays, parseIem, train, forecast, score, merge, summary, update, parts, km };
