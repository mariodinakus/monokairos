'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Card = require('../share-card.js');
const HOUR = 3600e3;
const now = Date.parse('2026-11-24T08:05:00Z');

const input = () => ({
  lang: 'el', now, zone: 'Europe/Athens', city: 'Θεσσαλονίκη', place: 'Κεντρική Μακεδονία · Ελλάδα',
  current: { temp: 13.6, feels: 11.2, wind: 14.4, rh: 71, station: true, icon: 'partly-day' },
  condition: 'Λίγα σύννεφα', today: { hi: 17.4, lo: 8.9 },
  tomorrow: { label: 'Αύριο', hi: 15, lo: 7, pop: .42 },
  hours: Array.from({ length: 12 }, (_, i) => ({ t: now + (i + 1) * HOUR, temp: 14 + i / 3, pop: i / 20, icon: i > 6 ? 'rain' : 'sun' })),
  rain: 'Βροχή: Τρι 18:00 → Τετ 02:00 · έως 70% · ~4 mm'
});

test('builds a compact, honest card model from the live forecast', () => {
  const m = Card.model(input());
  assert.equal(m.city, 'Θεσσαλονίκη');
  assert.equal(m.temp, '14');
  assert.equal(m.icon, 'partly-day');
  assert.equal(m.source, 'Μέτρηση σταθμού');
  assert.equal(m.details, 'Αίσθηση 11°  ·  Μέγ. 17°  ·  Ελάχ. 9°');
  assert.equal(m.extra, 'Άνεμος 14 km/h  ·  Υγρασία 71%');
  assert.equal(m.hours.length, 6, 'every second hour, up to six columns');
  assert.equal(m.hours[0].time, '11:05', 'hours use the location time zone');
  assert.equal(m.hours[0].pop, '0%');
  assert.equal(m.tomorrow, 'Αύριο · 7° / 15° · βροχή 42%');
  assert.match(m.stamp, /10:05/);
});

test('english labels and model-estimate attribution', () => {
  const m = Card.model({ ...input(), lang: 'en', current: { ...input().current, station: false } });
  assert.equal(m.source, 'Model estimate');
  assert.match(m.details, /^Feels 11°/);
  assert.equal(m.hoursTitle, 'Next hours');
});

test('never invents data: missing values are omitted or shown as dashes', () => {
  assert.equal(Card.model({ city: 'X', current: {} }), null, 'no current temperature, no card');
  assert.equal(Card.model({ current: { temp: 4 } }), null, 'no place, no card');
  const m = Card.model({ city: 'Χ', now, current: { temp: -0.4, rh: 140, wind: -3, icon: '../evil' },
    hours: [{ t: now - HOUR, temp: 3 }, { t: now + HOUR, temp: null }, { t: now + 2 * HOUR, temp: 2, pop: 3 }] });
  assert.equal(m.temp, '0', 'no negative zero');
  assert.equal(m.icon, null, 'icon names are whitelisted');
  assert.equal(m.extra, '');
  assert.equal(m.details, '');
  assert.equal(m.tomorrow, '');
  assert.deepEqual(m.hours.map(h => [h.temp, h.pop]), [['2°', '—']]);
});

test('text is single-line and length-limited', () => {
  const m = Card.model({ ...input(), city: 'A\nB' + 'x'.repeat(200), rain: 'r\u0007'.repeat(200) });
  assert.ok(!/[\n\u0007]/.test(m.city + m.rain));
  assert.ok(m.city.length <= 40 && m.rain.length <= 140);
});

function fakeCtx() {
  const calls = [];
  return { calls, font: '', fillStyle: '', textAlign: '', textBaseline: '',
    fillRect: () => {}, drawImage: (i, ...a) => calls.push(['img', i.name, ...a]),
    fillText: (s, x, y) => calls.push(['text', s, x, y]),
    measureText: s => ({ width: String(s).length * 18 }) };
}

test('draws every section inside the canvas and skips icons that failed to load', () => {
  const ctx = fakeCtx(), m = Card.model(input());
  const ok = { complete: true, naturalWidth: 64 }, broken = { complete: true, naturalWidth: 0 };
  assert.equal(Card.draw(ctx, m, { 'partly-day': { ...ok, name: 'big' }, sun: { ...ok, name: 'sun' }, rain: broken }), true);
  const texts = ctx.calls.filter(c => c[0] === 'text').map(c => c[1]);
  for (const s of ['MONO / WEATHER', 'Θεσσαλονίκη', '14', 'Λίγα σύννεφα', 'ΕΠΟΜΕΝΕΣ ΩΡΕΣ', 'monokairos.vercel.app', m.tomorrow])
    assert.ok(texts.includes(s), 'missing ' + s);
  const imgs = ctx.calls.filter(c => c[0] === 'img');
  assert.ok(imgs.some(c => c[1] === 'big'));
  assert.ok(imgs.every(c => c[1] !== undefined), 'broken icons are not drawn');
  for (const c of ctx.calls) {
    const [x, y] = c[0] === 'text' ? [c[2], c[3]] : [c[2], c[3]];
    assert.ok(x >= 0 && x <= Card.size.width && y >= 0 && y <= Card.size.height, 'outside canvas: ' + c[1]);
  }
  assert.equal(Card.draw(ctx, null), false);
});

test('long rain text wraps to two lines with an ellipsis', () => {
  const lines = Card.wrap(fakeCtx(), Array(60).fill('λέξη').join(' '), 400, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
  assert.deepEqual(Card.wrap(fakeCtx(), 'σύντομο', 400, 2), ['σύντομο']);
});

test('share button sends the image card and keeps the text fallback', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<script defer src="share-card\.js\?v=[a-f0-9]+"><\/script>\s*<script defer src="app\.js/);
  assert.match(app, /navigator\.canShare\?\.\(\{ files: \[card\] \}\)/);
  assert.match(app, /if \(navigator\.share\) \{ await navigator\.share\(\{ title, text, url \}\); return; \}/);
});

test('greek capitals drop the tonos but keep dialytika', () => {
  assert.equal(Card.caps('Επόμενες ώρες'), 'ΕΠΟΜΕΝΕΣ ΩΡΕΣ');
  assert.equal(Card.caps('Next hours'), 'NEXT HOURS');
  assert.equal(Card.caps('προϊόν'), 'ΠΡΟΪΟΝ');
});
