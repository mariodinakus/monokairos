const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const router = require('../api/mono.js');
const V = require('../lib/station-verify.cjs');
const root = path.join(__dirname, '..');

/* ---------------- one serverless function */
test('only one serverless function remains under api/', () => {
  assert.deepEqual(fs.readdirSync(path.join(root, 'api')).filter(f => f.endsWith('.js')), ['mono.js']);
});

test('every route module is reachable and has a matching rewrite', () => {
  const files = fs.readdirSync(path.join(root, 'lib/routes')).map(f => f.replace(/\.js$/, '')).sort();
  assert.deepEqual([...router.ROUTES].sort(), files);
  const rewrites = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).rewrites;
  for (const name of files) assert.ok(rewrites.some(r => r.source === '/api/' + name && r.destination === '/api/mono?route=' + name), name);
});

test('route name comes from the rewrite parameter or the original path', () => {
  assert.equal(router.routeName({ url: '/api/mono?route=synop&lat=1&lon=2' }), 'synop');
  assert.equal(router.routeName({ url: '/api/storm-lens?lat=1' }), 'storm-lens');
  assert.equal(router.routeName({ url: '/api/mono' }), '');
});

test('unknown routes return 404 and known routes reach their handler', async () => {
  const res = () => ({ h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
  const a = res(); await router({ url: '/api/mono?route=__proto__' }, a); assert.equal(a.code, 404);
  const b = res(); await router({ url: '/api/mono?route=synop', method: 'GET', headers: {} }, b); assert.equal(b.code, 400); // reached synop: invalid coordinates
});

/* ---------------- station verification */
const H = 3600e3, DAY = 24 * H;
test('evaluated days are local days ending yesterday', () => {
  const now = Date.parse('2026-11-08T10:00:00Z');
  const d = V.lastDays(now, 3);
  assert.deepEqual(d, ['2026-11-05', '2026-11-06', '2026-11-07']);
});

test('IEM METAR CSV keeps the observation nearest each whole hour', () => {
  const m = V.parseIem('station,valid,tmpc\nLGTS,2026-11-07 09:20,12.0\nLGTS,2026-11-07 09:50,13.0\nLGTS,2026-11-07 10:20,M\nLGTS,2026-11-07 11:00,14.0');
  assert.equal(m.get(Date.parse('2026-11-07T10:00:00Z')), 13);
  assert.equal(m.get(Date.parse('2026-11-07T11:00:00Z')), 14);
  assert.equal(m.size, 3);
});

test('nearest curated city within 25 km, otherwise none', () => {
  assert.equal(V.nearestCity(40.6, 22.95).icao, 'LGTS');
  assert.equal(V.nearestCity(48.85, 2.35), null);
});

function fakeIO(now, stationOffset = 0) {
  const truth = t => 14 + 6 * Math.sin(((t / H) % 24 - 9) / 24 * 2 * Math.PI) + 2 * Math.sin(t / (5 * DAY));
  const noise = (t, k) => { const x = Math.sin(t * 1e-4 + k * 7.1) * 43758.5; return (x - Math.floor(x)) * 2 - 1; };
  const series = (u, f) => {
    const s = Date.parse(u.searchParams.get('start_date') + 'T00:00:00Z') / 1000, e = Date.parse(u.searchParams.get('end_date') + 'T23:00:00Z') / 1000;
    const time = []; for (let t = s; t <= e; t += 3600) time.push(t);
    return { time, values: time.map(t => f(t * 1000)) };
  };
  const calls = [];
  return { calls, io: {
    json: async url => {
      const u = new URL(url); calls.push(u.hostname + ' ' + (u.searchParams.get('start_date') || '') + ' ' + (u.searchParams.get('end_date') || ''));
      if (u.hostname.startsWith('mesonet')) return { features: [{ properties: { sid: 'LGTS', sname: 'Thessaloniki' }, geometry: { coordinates: [22.97, 40.52] } }] };
      if (u.hostname.startsWith('archive')) { const s = series(u, t => truth(t) + 0.3 * noise(t, 1)); return { hourly: { time: s.time, temperature_2m: s.values } }; }
      const k = V.MODELS.indexOf(u.searchParams.get('models')) + 2;
      if (k > 7) throw Error('model not available');
      const s = series(u, t => truth(t) + 1.5 + 0.8 * noise(t, k)); // every model runs 1.5° warm
      return { hourly: { time: s.time, temperature_2m_previous_day1: s.values } };
    },
    text: async () => {
      const lines = ['station,valid,tmpc'];
      for (let t = Math.floor((now - 110 * DAY) / H) * H; t < now; t += 1800e3) lines.push(`LGTS,${new Date(t + 20 * 60e3).toISOString().slice(0, 16).replace('T', ' ')},${(truth(t + 20 * 60e3) + stationOffset + 0.4 * noise(t, 9)).toFixed(1)}`);
      return lines.join('\n');
    }
  } };
}

test('backfill trains before the first evaluated day and learns the warm bias', async () => {
  const now = Date.parse('2026-11-08T07:40:00Z'), city = V.nearestCity(40.64, 22.94), { io, calls } = fakeIO(now);
  const state = await V.update(city, null, now, io);
  assert.equal(state.records.length, 30);
  assert.equal(state.records.at(-1).day, '2026-11-07');
  assert.ok(state.trained.end < state.records[0].day, `trained to ${state.trained.end}, first eval ${state.records[0].day}`);
  assert.ok(state.trained.models.length >= 5);
  const s = V.summary(state);
  assert.ok(s.mae < s.maeMean, `MONO ${s.mae} vs mean ${s.maeMean}`);
  assert.ok(s.hit > s.hitMean);
  assert.ok(calls.some(c => c.startsWith('archive')));
});

test('a daily update only adds the missing day and keeps history', async () => {
  const now = Date.parse('2026-11-08T07:40:00Z'), city = V.nearestCity(40.64, 22.94);
  const first = await V.update(city, null, now, fakeIO(now).io);
  const later = now + DAY, { io } = fakeIO(later);
  const next = await V.update(city, first, later, io);
  assert.equal(next.records.length, 31);
  assert.equal(next.records.at(-1).day, '2026-11-08');
  const again = await V.update(city, next, later + 60e3, io);
  assert.equal(again.records.length, 31);
});

test('station correction learned from earlier days removes a station-vs-ERA5 offset', async () => {
  const now = Date.parse('2026-11-08T07:40:00Z'), city = V.nearestCity(40.64, 22.94);
  const state = await V.update(city, null, now, fakeIO(now, -1.2).io); // airport 1.2° colder than the ERA5 cell
  const s = V.summary(state);
  assert.ok(s.bias > 0.9, 'raw MONO inherits the ERA5 offset: ' + s.bias);
  assert.ok(s.corrected && s.corrected.days >= 20);
  assert.ok(s.corrected.mae < s.corrected.maeRaw - 0.5, JSON.stringify(s.corrected));
  assert.ok(Math.abs(s.corrected.bias) < 0.3);
  assert.equal(state.records.slice(0, 7).some(r => 'maeCor' in r), false, 'no correction before a week of earlier days exists');
  assert.equal(state.version, 3);
  assert.ok(s.stationTrained && s.stationTrained.days >= 25, 'station-trained variant scored');
  assert.ok(s.stationTrained.mae < s.stationTrained.maeEra5 - 0.5, JSON.stringify(s.stationTrained));
  assert.ok(Math.abs(s.stationTrained.bias) < 0.4);
});

test('an empty (throttled) station archive is retried and then fails instead of saving an empty check', async () => {
  V.setPause(0);
  const now = Date.parse('2026-11-08T07:40:00Z'), city = V.nearestCity(40.64, 22.94), { io } = fakeIO(now);
  let calls = 0;
  await assert.rejects(V.update(city, null, now, { json: io.json, text: async () => { calls++; return 'station,valid,tmpc\n'; } }), /observations unavailable/);
  assert.equal(calls, 2);
  let n = 0;
  const ok = await V.update(city, null, now, { json: io.json, text: async (...a) => (++n === 1 ? 'station,valid,tmpc\n' : io.text(...a)) });
  assert.equal(ok.records.length, 30);
});

test('the daily job visits cities one at a time', () => {
  const s = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts/refresh-station-verification.cjs'), 'utf8');
  assert.doesNotMatch(s, /Promise\.all\(CITIES/);
  assert.match(s, /setTimeout\(r, 20000\)/);
});
