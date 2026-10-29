'use strict';

// Compare fixed-lead archived forecasts with actual, time-bounded SYNOP gauges.
// The public report contains city-level data only; no visitor locations are stored.
const HOUR = 3600e3, DAY = 24 * HOUR, HISTORY = 90 * DAY, WET = 0.1;
const finite = Number.isFinite;
const round = (v, n = 2) => finite(v) ? +v.toFixed(n) : null;
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const km = (a, b) => {
  const rad = Math.PI / 180, dlat = (a.lat - b.lat) * rad, dlon = (a.lon - b.lon) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
};

async function json(url, timeout = 20000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'MONO Weather station verification (monokairos.vercel.app)' } });
  if (!r.ok) throw new Error('upstream unavailable');
  return r.json();
}

function stationReports(s, now) {
  return (s.list || []).filter(o => finite(o.t) && o.t <= now && o.t >= now - 96 * HOUR &&
    o.t % HOUR === 0 && finite(o.prcp) && o.prcp >= 0 && finite(o.prcpH) &&
    Number.isInteger(o.prcpH) && o.prcpH >= 1 && o.prcpH <= 24);
}

function hourlyMap(d) {
  const h = d?.hourly;
  if (!Array.isArray(h?.time) || !Array.isArray(h?.precipitation_previous_day1)) throw new Error('missing forecast archive');
  return new Map(h.time.map((t, i) => [t * 1000, h.precipitation_previous_day1[i]]));
}

function compareReports(station, ecmwf, gfs, now) {
  const e = hourlyMap(ecmwf), g = hourlyMap(gfs), rows = [];
  for (const r of stationReports(station, now)) {
    const start = r.t - r.prcpH * HOUR;
    let eSum = 0, gSum = 0, complete = true;
    // Open-Meteo's hourly precipitation is the sum of the preceding hour.
    for (let t = start + HOUR; t <= r.t; t += HOUR) {
      const a = e.get(t), b = g.get(t);
      if (!finite(a) || !finite(b) || a < 0 || b < 0) { complete = false; break; }
      eSum += a; gSum += b;
    }
    if (complete) rows.push({ stationId: String(station.id), start, end: r.t, hours: r.prcpH,
      observed: r.prcp, ecmwf: round(eSum, 4), gfs: round(gSum, 4) });
  }
  return rows;
}

function mergeRows(oldRows, incoming, now) {
  const rows = new Map();
  for (const r of [...(oldRows || []), ...incoming]) {
    if (!r || !r.stationId || !finite(r.start) || !finite(r.end) || r.end > now || r.end < now - HISTORY ||
      r.end <= r.start || ![r.observed, r.ecmwf, r.gfs].every(x => finite(x) && x >= 0)) continue;
    const key = `${r.stationId}:${r.start}:${r.end}`;
    // Preserve the original matched forecast and observation on subsequent refreshes.
    if (!rows.has(key)) rows.set(key, r);
  }
  return [...rows.values()].sort((a, b) => a.end - b.end).slice(-1600);
}

function nonOverlapping(rows, stationId) {
  const selected = [];
  for (const r of rows.filter(x => x.stationId === stationId).sort((a, b) => b.end - a.end || b.hours - a.hours)) {
    if (!selected.some(s => r.start < s.end && r.end > s.start)) selected.push(r);
  }
  return selected.sort((a, b) => a.end - b.end);
}

const predict = (r, weight = 0.5, scale = 1) => (weight * r.ecmwf + (1 - weight) * r.gfs) * scale;
function score(rows, weight = 0.5, scale = 1) {
  const counts = { hit: 0, miss: 0, falseAlarm: 0, correctDry: 0 };
  for (const r of rows) {
    const predictedWet = predict(r, weight, scale) >= WET, observedWet = r.observed >= WET;
    counts[predictedWet ? (observedWet ? 'hit' : 'falseAlarm') : (observedWet ? 'miss' : 'correctDry')]++;
  }
  return { n: rows.length, ...counts, mae: round(mean(rows.map(r => Math.abs(predict(r, weight, scale) - r.observed))), 2),
    wetObserved: counts.hit + counts.miss };
}

function learn(rows) {
  const split = Math.floor(rows.length * 0.7), train = rows.slice(0, split), test = rows.slice(split);
  const enough = train.length >= 20 && test.length >= 8 &&
    train.filter(r => r.observed >= WET).length >= 4 && test.filter(r => r.observed >= WET).length >= 2;
  if (!enough) return { ready: false, train: train.length, test: test.length, reason: 'insufficient_samples' };
  const mae = (data, w, s) => mean(data.map(r => Math.abs(predict(r, w, s) - r.observed)));
  const candidates = [];
  for (const w of [0, 0.25, 0.5, 0.75, 1]) for (const s of [0.7, 0.85, 1, 1.15, 1.3])
    candidates.push({ weight: w, scale: s, error: mae(train, w, s) });
  candidates.sort((a, b) => a.error - b.error || Math.abs(a.weight - 0.5) + Math.abs(a.scale - 1) - Math.abs(b.weight - 0.5) - Math.abs(b.scale - 1));
  const best = candidates[0], before = mae(test, 0.5, 1), after = mae(test, best.weight, best.scale);
  const ready = finite(before) && before > 0 && after <= before * 0.95;
  return { ready, train: train.length, test: test.length, weight: best.weight, scale: best.scale,
    baselineMae: round(before, 2), adjustedMae: round(after, 2), reason: ready ? 'validated' : 'not_better_in_test' };
}

function report(station, rows, now) {
  const samples = nonOverlapping(rows, String(station.id)), stats = score(samples), learning = learn(samples);
  const recent = samples.slice(-8).reverse().map(r => {
    const predicted = predict(r), wet = r.observed >= WET, forecastWet = predicted >= WET;
    return { start: r.start, end: r.end, hours: r.hours, observed: r.observed, predicted: round(predicted),
      result: forecastWet ? (wet ? 'hit' : 'false_alarm') : (wet ? 'miss' : 'correct_dry') };
  });
  return { version: 2, available: true, checkedAt: now, threshold: WET, leadHours: 24,
    station: { id: String(station.id), name: station.name, lat: station.lat, lon: station.lon, dist: station.dist },
    samples: stats, learning, first: samples[0]?.start ?? null, last: samples.at(-1)?.end ?? null, recent,
    source: 'WMO SYNOP / OGIMET · ECMWF IFS 0.25° + GFS · Open-Meteo Previous Runs',
    note: 'Total precipitation including snow water equivalent; forecast values are model forecasts from 24 hours earlier, not historical MONO app snapshots.' };
}

async function update(city, cached, now = Date.now(), getJSON = json) {
  const [id, lat, lon] = city;
  const synop = await getJSON('https://monokairos.vercel.app/api/synop?' + new URLSearchParams({ lat, lon, km: 30, hours: 96 }), 28000);
  const station = (synop.stations || []).filter(s => finite(s.lat) && finite(s.lon) && finite(s.dist) && s.dist <= 30 &&
    stationReports(s, now).some(r => r.t >= now - 36 * HOUR)).sort((a, b) => a.dist - b.dist)[0];
  if (!station) return { available: false, reason: 'no_recent_gauge', city: id, checkedAt: now };
  const common = { latitude: station.lat, longitude: station.lon, timezone: 'UTC', timeformat: 'unixtime',
    past_days: 5, forecast_days: 1, hourly: 'precipitation_previous_day1' };
  const url = model => 'https://previous-runs-api.open-meteo.com/v1/forecast?' + new URLSearchParams({ ...common, models: model });
  const [ecmwf, gfs] = await Promise.all([getJSON(url('ecmwf_ifs025')), getJSON(url('ncep_gfs_seamless'))]);
  const incoming = compareReports(station, ecmwf, gfs, now);
  const rows = mergeRows(cached?.rows, incoming, now);
  return { ...report(station, rows, now), city: id, rows };
}

module.exports = { update, report, score, learn, mergeRows, nonOverlapping, compareReports, stationReports, km, HOUR, WET };
