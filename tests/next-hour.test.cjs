const { test } = require('node:test');
const assert = require('node:assert/strict');
const Next = require('../next-hour.js');

const minute = 60e3;
const now = Date.parse('2026-11-01T10:07:00Z');
const time = value => Date.parse('2026-11-01T' + value + ':00Z');
const fifteen = () => ({
  t: ['10:15','10:30','10:45','11:00','11:15'].map(time),
  rain: [.3,.2,.4,.2,.3], showers: [.2,.1,0,.1,0],
  precipitation: [.5,.3,.4,.3,.3], at: now - 5 * minute
});
const hourly = () => ({
  t: ['11:00','12:00'].map(time), rain: [1,2], showers: [0,0],
  precipitation: [1,2], at: now - 5 * minute
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('rolling hour weights the first and last preceding 15-minute periods', () => {
  const f = Next.forecast({ fifteen: fifteen(), now });
  near(f.amount, .5 * 8 / 15 + .3 + .4 + .3 + .3 * 7 / 15);
  assert.equal(f.kind, 'rain');
  assert.equal(f.resolution, '15min');
  assert.equal(f.end - f.start, 60 * minute);
});

test('rain includes showers and excludes snow when both liquid fields are available', () => {
  const data = fifteen(); data.precipitation = [10,10,10,10,10];
  const f = Next.forecast({ fifteen: data, now });
  assert.equal(f.kind, 'rain');
  assert.ok(f.amount < 2);
});

test('total precipitation is labelled correctly when the liquid components are unavailable', () => {
  const data = fifteen(); data.showers[2] = null;
  const f = Next.forecast({ fifteen: data, now });
  assert.equal(f.kind, 'precipitation');
  const html = Next.render(f, { lang: 'el', zone: 'Europe/Athens' });
  assert.match(html, /Υετός την επόμενη ώρα/);
  assert.match(html, /Περιλαμβάνει πιθανό χιόνι/);
  assert.match(html, /πρόγνωση, όχι μέτρηση/);
});

test('uses fully covered hourly forecast if 15-minute data has a gap', () => {
  const data = fifteen(); data.t.splice(2,1); data.rain.splice(2,1); data.showers.splice(2,1); data.precipitation.splice(2,1);
  const f = Next.forecast({ fifteen: data, hourly: hourly(), now });
  assert.equal(f.resolution, 'hourly');
  near(f.amount, 53 / 60 + 2 * 7 / 60);
  assert.match(Next.render(f, { lang: 'en' }), /proportionally from hourly intervals/);
});

test('missing, overlapping, invalid, stale or snapshot data never become zero rainfall', () => {
  const gap = fifteen(); gap.precipitation[2] = null; gap.rain[2] = null;
  assert.equal(Next.forecast({ fifteen: gap, now }), null);
  const overlap = fifteen(); overlap.t[2] = overlap.t[1];
  assert.equal(Next.forecast({ fifteen: overlap, now }), null);
  const invalid = fifteen(); invalid.rain[2] = -1; invalid.precipitation[2] = -1;
  assert.equal(Next.forecast({ fifteen: invalid, now }), null);
  const old = fifteen(); old.at = now - 76 * minute;
  assert.equal(Next.forecast({ fifteen: old, now }), null);
  assert.equal(Next.forecast({ fifteen: fifteen(), now, snapshot: true }), null);
  assert.match(Next.render(null, { lang: 'el' }), /Δεν υπάρχουν επαρκή πρόσφατα δεδομένα/);
});

test('zero remains a valid dry forecast and times use the selected location timezone', () => {
  const dry = fifteen(); dry.rain.fill(0); dry.showers.fill(0); dry.precipitation.fill(0);
  const f = Next.forecast({ fifteen: dry, now });
  const html = Next.render(f, { lang: 'el', zone: 'Europe/Athens' });
  assert.equal(f.amount, 0);
  assert.match(html, /Δεν προβλέπεται βροχή/);
  assert.match(html, /12:07 – 13:07/);
  assert.match(html, /15λεπτα/);
});
