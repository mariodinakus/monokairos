const { test } = require('node:test');
const assert = require('node:assert/strict');
const Air = require('../environment.js');
const Atmosphere = require('../atmosphere.js');
const Space = require('../space-weather.js');
const now = Date.UTC(2026, 9, 15, 20, 30), start = Math.floor(now / 3600000) * 3600;

test('EAQI boundary values and missing observations remain distinct', () => {
  assert.deepEqual([0, 20, 20.1, 40, 60, 80, 100, 101, null, -1, NaN].map(Air.band), [0, 0, 1, 1, 2, 3, 4, 5, null, null, null]);
  const missing = Air.snapshot(null, now);
  assert.equal(missing.value('european_aqi'), null);
  assert.ok(missing.pollen.every(p => p.max === null && p.level === null));
});

test('pollen uses the upcoming 24 hours across midnight, keeps zero and includes all species', () => {
  const H = { time: Array.from({ length: 50 }, (_, i) => start + (i - 12) * 3600) };
  for (const key of Object.keys(Air.POLLEN)) H[key + '_pollen'] = H.time.map(() => 0);
  H.grass_pollen[0] = 999; // past exposure must not enter the future peak
  H.ragweed_pollen[15] = 22;
  H.olive_pollen[49] = 999; // beyond the next 24 hours
  H.birch_pollen.fill(null);
  const S = Air.snapshot({ hourly: H }, now);
  assert.equal(S.pollen.find(p => p.key === 'grass').max, 0);
  assert.equal(S.pollen.find(p => p.key === 'ragweed').level, 2);
  assert.equal(S.pollen.find(p => p.key === 'olive').max, 0);
  assert.equal(S.pollen.find(p => p.key === 'birch').max, null);
  assert.equal(S.pollen.length, 6);
});

test('hourly CO2 uses the current timestamp and stale current data cannot override it', () => {
  const S = Air.snapshot({ current: { time: start - 7200, european_aqi: 5 }, hourly: { time: [start], european_aqi: [67], carbon_dioxide: [442] } }, now);
  assert.equal(S.value('european_aqi'), 67);
  assert.equal(S.value('carbon_dioxide'), 442);
  assert.equal(S.co2Time, start);
  assert.equal(Air.snapshot({ hourly: { time: [start - 7200], carbon_dioxide: [442] } }, now).value('carbon_dioxide'), null);
});

test('lowest pollution window requires three consecutive future valid hours', () => {
  const times = Array.from({ length: 8 }, (_, i) => start + i * 3600);
  const S = Air.snapshot({ hourly: { time: times, european_aqi: [0, 25, null, 15, 10, 5, 20, 30] } }, now);
  assert.equal(S.best.start, times[3]);
  assert.equal(S.best.mean, 10);
  assert.equal(S.worst, 30);
  assert.equal(Air.snapshot({ hourly: { time: [start + 3600, start + 10800, start + 14400], european_aqi: [1, 2, 3] } }, now).best, null);
});

test('pressure trends use exactly three hours; negative temperatures and below-ground layers are handled', () => {
  const H = { time: [start - 10800, start], pressure_msl: [1020, 1016], surface_pressure: [900, 900], temperature_850hPa: [-4, -5], geopotential_height_850hPa: [1500, 1490] };
  const S = Atmosphere.snapshot({ hourly: H }, now);
  assert.equal(S.delta, -4);
  assert.equal(S.profile.find(p => p.p === 1000).belowGround, true);
  assert.equal(S.profile.find(p => p.p === 850).temp, -5);
  assert.equal(Atmosphere.snapshot({ hourly: { time: [start], pressure_msl: [1016] } }, now).delta, null);
});

test('NOAA timestamps without a suffix are UTC, zeros are valid, stale feeds are flagged', () => {
  const stamp = new Date(now - 60000).toISOString().slice(0, 19);
  const data = { scales: { 0: { DateStamp: stamp.slice(0, 10), TimeStamp: stamp.slice(11), G: { Scale: '0' }, R: { Scale: '2' }, S: { Scale: null } } },
    kp: [['time_tag', 'Kp'], [stamp, '0']], magnetic: [{ time_tag: stamp, bz_gsm: '-4.5' }] };
  assert.equal(Space.utc(stamp), now - 60000);
  const S = Space.snapshot(data, now);
  assert.equal(S.scales.G.value, 0);
  assert.equal(S.scales.G.fresh, true);
  assert.equal(S.scales.S.value, null);
  assert.equal(S.kp.value, 0);
  assert.equal(S.bz.value, -4.5);
  assert.equal(Space.snapshot(data, now + 8 * 3600e3).kp.fresh, false);
});

test('Kp forecast excludes observations and past rows', () => {
  const forecast = ['observed', 'estimated', 'predicted'].map((observed, i) => ({ time_tag: new Date(now + (i + 1) * 3600e3).toISOString(), kp: 3, observed }));
  forecast.push({ time_tag: new Date(now - 3600e3).toISOString(), kp: 7, observed: 'predicted' });
  assert.deepEqual(Space.snapshot({ forecast }, now).forecast.map(r => r.kind), ['estimated', 'predicted']);
});

test('all panels render loading, failure, missing values and both languages without invalid numbers', () => {
  for (const module of [Air, Atmosphere, Space]) for (const lang of ['el', 'en']) for (const data of [null, { error: true }, { hourly: { time: [start] } }]) {
    const html = module.render(data, { lang, now, zone: 'Europe/Athens' });
    assert.ok(!/NaN|undefined|Infinity/.test(html));
    assert.ok(html.includes('—'));
  }
});

test('NOAA proxy preserves partial success and uses an error status for total failure', async () => {
  const handler = require('../api/space-weather.js'), original = global.fetch;
  const invoke = async () => {
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({}, response); return response;
  };
  try {
    global.fetch = async url => { if (url.endsWith('noaa-scales.json')) return { ok: true, json: async () => ({ 0: {} }) }; throw new Error('offline'); };
    const partial = await invoke(); assert.equal(partial.code, 200); assert.equal(partial.body.kp, null); assert.ok(partial.body.scales);
    global.fetch = async () => { throw new Error('offline'); };
    const failure = await invoke(); assert.equal(failure.code, 502); assert.equal(failure.body.error, true);
  } finally { global.fetch = original; }
});

test('atmospheric proxy rejects missing or invalid coordinates before contacting the source', async () => {
  const handler = require('../api/atmosphere.js'), original = global.fetch;
  try {
    global.fetch = async () => { assert.fail('Invalid input must not contact the upstream API'); };
    for (const url of ['/api/atmosphere', '/api/atmosphere?lat=&lon=0', '/api/atmosphere?lat=91&lon=23', '/api/atmosphere?lat=40&lon=oops']) {
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
      await handler({ url }, res); assert.equal(res.code, 400);
    }
  } finally { global.fetch = original; }
});
