const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DC = require('../day-compare.js');

const H = 3600e3;
const now = Date.parse('2026-11-08T10:05:00Z');
const hourRows = (fn) => Array.from({ length: 60 }, (_, k) => {
  const t = Date.parse('2026-11-06T12:00:00Z') + k * H;
  return { t, ...fn(t) };
});
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('compares two station observations when both hours were measured', () => {
  const rows = hourRows(t => ({ temp: 15, obs: t === Date.parse('2026-11-08T10:00:00Z') ? 18.4 : t === Date.parse('2026-11-07T10:00:00Z') ? 14.9 : null }));
  const y = DC.vsYesterday(rows, now);
  assert.equal(y.basis, 'obs');
  assert.ok(Math.abs(y.diff - 3.5) < 1e-9);
});

test('never mixes a live observation with a model value; falls back to MONO at both hours', () => {
  const rows = hourRows(t => ({ temp: t >= Date.parse('2026-11-08T00:00:00Z') ? 12 : 16, obs: t === Date.parse('2026-11-08T10:00:00Z') ? 30 : null }));
  const y = DC.vsYesterday(rows, now);
  assert.equal(y.basis, 'mono');
  assert.equal(y.diff, -4);
});

test('missing rows around yesterday give no comparison instead of a guess', () => {
  const rows = hourRows(() => ({ temp: 15 })).filter(r => r.t > now - 20 * H);
  assert.equal(DC.vsYesterday(rows, now), null);
});

test('tomorrow high is compared with today high', () => {
  const t = DC.tomorrowHigh([{ hi: 18.2 }, { hi: 15.6 }]);
  assert.ok(Math.abs(t.diff + 2.6) < 1e-9);
  assert.equal(DC.tomorrowHigh([{ hi: 18 }]), null);
});

test('daylight change uses today and the previous local day', () => {
  const day = s => Date.parse(s) / 1000;
  const d = { time: [day('2026-11-06T22:00:00Z'), day('2026-11-07T22:00:00Z'), day('2026-11-08T22:00:00Z')].map(x => x - 24 * 3600), daylight_duration: [36600, 36470, 36340] };
  const r = DC.daylight(d, now, 'Europe/Athens');
  assert.equal(r.delta, -130);
  assert.match(DC.daylightPhrase(r.delta, 'el'), /μικραίνει 2′ 10″/);
  assert.match(DC.daylightPhrase(95, 'en'), /longer by 1′ 35″/);
});

test('render escapes and labels both comparisons in Greek and English', () => {
  const out = { yesterday: { diff: 2.6, basis: 'obs' }, tomorrow: { diff: -1.2, today: 18, tomorrow: 16.8 } };
  const el = DC.render(out, { lang: 'el' }), en = DC.render(out, { lang: 'en' });
  assert.match(el, /3° πιο ζεστά από χθες τέτοια ώρα/);
  assert.match(el, /Αύριο μέγιστη 17° · 1° χαμηλότερα/);
  assert.match(en, /3° warmer than this time yesterday/);
  assert.match(DC.render({ yesterday: { diff: 0.3, basis: 'mono' } }, { lang: 'el' }), /Όπως χθες/);
  assert.equal(DC.render(null), '');
});

test('module is loaded by the page and precached by the service worker', () => {
  assert.match(read('index.html'), /day-compare\.js/);
  assert.match(read('sw.js'), /day-compare\.js/);
  assert.doesNotMatch(read('index.html'), /<script>\s*window\.va/, 'inline scripts are blocked by the CSP');
});

test('API routes read query strings from req.url, not the deprecated req.query parser', async () => {
  for (const f of ['api/synop.js', 'api/storm-lens.js', 'lib/windy.cjs']) assert.doesNotMatch(read(f), /req\.query\b(?!\s*&&)/, f);
  const { query } = require('../lib/server.cjs');
  let touched = false;
  const req = { url: '/api/synop?lat=40.6&lon=22.9&windy=open', get query() { touched = true; return {}; } };
  assert.deepEqual(query(req), { lat: '40.6', lon: '22.9', windy: 'open' });
  assert.equal(touched, false);
});
