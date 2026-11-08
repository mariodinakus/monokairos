const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Y = require('../yesterday-check.js');
const A = require('../rain-alerts.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const H = 3600e3, MIN = 60e3;
const now = Date.parse('2026-11-08T10:05:00Z'); // 12:05 Athens
const yStart = Date.parse('2026-11-06T22:00:00Z'); // 00:00 Athens, 7 Nov

/* ---------------- yesterday check */
test('yesterday is the previous local day, not the previous UTC day', () => {
  assert.equal(Y.yesterdayKey(Date.parse('2026-11-07T22:30:00Z'), 'Europe/Athens'), '2026-11-07');
  assert.equal(Y.yesterdayKey(now, 'Europe/Athens'), '2026-11-07');
});

test('splits a multi-model Previous Runs response by model id', () => {
  const d = Y.splitBatch({ hourly: { time: [1, 2], temperature_2m_previous_day1_a: [1, 2], temperature_2m_previous_day1_b: [null, null] } }, ['a', 'b']);
  assert.deepEqual(Object.keys(d.models), ['a']);
  assert.deepEqual(d.times, [1000, 2000]);
});

test('live rows carry local hour, member values and neighbours like training rows', () => {
  const times = [0, 1, 2].map(i => yStart + i * H);
  const rows = Y.liveRows(times, { a: [10, 11, 12], b: [12, 13, null] }, 'Europe/Athens');
  assert.equal(rows[0].H, 0);
  assert.equal(rows[1].mean, 12);
  assert.equal(rows[1].prev, 11);
  assert.equal(rows[2].mean, 12);
  assert.deepEqual(rows[2].vals, { a: 12 });
});

const day = (fn) => Array.from({ length: 24 }, (_, h) => fn(yStart + h * H, h));
test('evaluates MONO and the model mean against hourly station observations', () => {
  const forecast = day((t, h) => ({ t, mono: 10 + h / 2 + 1, mean: 10 + h / 2 + 2 }));
  const obs = day((t, h) => ({ t: t + 10 * MIN, obs: 10 + h / 2 }));
  const r = Y.evaluate({ forecast, obs, now, zone: 'Europe/Athens' });
  assert.equal(r.n, 24);
  assert.equal(r.obs.max, 21.5);
  assert.equal(r.mono.max, 22.5);
  assert.ok(Math.abs(r.mono.mae - 1) < 1e-9 && Math.abs(r.mono.bias - 1) < 1e-9);
  assert.ok(Math.abs(r.mean.mae - 2) < 1e-9);
  const html = Y.render(r, { lang: 'el', station: 'LGTS · 14 km' });
  assert.match(html, /Πόσο έπεσε έξω χθες/);
  assert.match(html, /Καλύτερα από τον μέσο όρο των μοντέλων/);
  assert.match(html, /Έβλεπε πιο ζεστά/);
  assert.match(html, /24 ωριαίων μετρήσεων · LGTS/);
});

test('too few observed hours means no verdict', () => {
  const forecast = day((t, h) => ({ t, mono: 12, mean: 12 }));
  const obs = day((t, h) => ({ t, obs: h < 10 ? 12 : null }));
  assert.equal(Y.evaluate({ forecast, obs, now, zone: 'Europe/Athens' }), null);
});

/* ---------------- rain alerts */
const feed = (amounts, start = Date.parse('2026-11-08T10:00:00Z')) => ({
  minutely_15: { time: amounts.map((_, i) => (start + (i + 1) * 15 * MIN) / 1000), rain: amounts, showers: amounts.map(() => 0), precipitation: amounts },
  timezone: 'Europe/Athens'
});

test('alerts when a dry now is followed by rain within the hour', () => {
  // periods: 10:00-10:15 (now), 10:15, 10:30, 10:45, 11:00, 11:15, 11:30...
  const a = A.detect({ data: feed([0, 0, 0.2, 0.4, 0.3, 0.2, 0.1, 0]), now });
  assert.ok(a);
  assert.equal(a.start, Date.parse('2026-11-08T10:30:00Z'));
  assert.equal(a.minutes, 25);
  const m = A.message(a, { lang: 'el', place: 'Θεσσαλονίκη', zone: 'Europe/Athens' });
  assert.match(m.title, /σε ~25′ · Θεσσαλονίκη/);
  assert.match(m.body, /Από ~12:30 · ≈1,1 mm/);
});

test('no alert while it is already raining, for drizzle, or for incomplete data', () => {
  assert.equal(A.detect({ data: feed([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]), now }), null);
  assert.equal(A.detect({ data: feed([0, 0, 0.1, 0.05, 0, 0, 0]), now }), null);
  assert.equal(A.detect({ data: feed([0, 0, 0.5, null, 0.5, 0.5, 0.5]), now }), null);
});

test('the same episode is not announced twice and alerts are spaced out', () => {
  const data = feed([0, 0, 0.2, 0.4, 0.3, 0.2, 0.1, 0]);
  const first = A.detect({ data, now });
  assert.equal(A.detect({ data, now: now + 5 * MIN, last: { id: first.id, at: now } }), null);
  assert.equal(A.detect({ data, now, last: { id: 'other', at: now - 30 * MIN } }), null);
  assert.ok(A.detect({ data, now, last: { id: 'other', at: now - 3 * H } }));
});

test('page and service worker share the alert code; alerts survive service-worker updates', () => {
  const sw = read('sw.js');
  assert.match(sw, /importScripts\('\.\/rain-alerts\.js/);
  assert.match(sw, /periodicsync/);
  assert.match(sw, /notificationclick/);
  assert.match(sw, /k !== CACHE && k !== ALERTS/);
  const html = read('index.html');
  for (const f of ['yesterday-check.js', 'rain-alerts.js']) { assert.match(html, new RegExp(f.replace('.', '\\.'))); assert.match(sw, new RegExp(f.replace('.', '\\.'))); }
});

test('manifest offers launcher shortcuts to real pages', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  const app = read('app.js');
  assert.ok(m.shortcuts.length >= 3);
  for (const s of m.shortcuts) {
    const page = s.url.split('#')[1];
    assert.match(app, new RegExp(`\\['${page}',`));
    assert.ok(fs.existsSync(path.join(__dirname, '..', s.icons[0].src)));
  }
});
