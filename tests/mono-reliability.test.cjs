const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../mono-reliability.js');

const t0 = Date.parse('2026-09-01T00:00:00Z'), step = 6 * 3600e3;
// temp/wind rows: [t, MONO, mean, ERA5]; rain rows: [t, prob, wet, mm, ERA5 mm]
function train({ n = 100, tempMiss = 0, windMiss = 0, rainMiss = 0, meanMiss = 0 } = {}) {
  const lead = k => {
    const T = [], W = [], P = [];
    for (let i = 0; i < n; i++) {
      const t = t0 + i * step;
      T.push([t, 15 + (i < tempMiss + k * 5 ? 3 : 0.5), 15 + (i < meanMiss ? 3 : 0.5), 15]);
      W.push([t, 10 + (i < windMiss ? 15 : 2), 10, 10]);
      const wet = i % 4 === 0 ? 1 : 0;
      P.push([t, (i < rainMiss ? 1 - wet : wet) ? 0.8 : 0.1, wet, 0, 0]);
    }
    return { T: { holdout: T, choice: 'combo', test: { combo: { mae: 0.9 } } }, W: { holdout: W }, P: { holdout: P, pod: 0.75 } };
  };
  const leads = [0, 1, 2, 3, 4, 5].map(lead);
  return {
    days: 62, temp: { leads: Object.fromEntries(leads.map((l, k) => [k, l.T])) },
    wind: { leads: Object.fromEntries(leads.map((l, k) => [k, l.W])) },
    precip: { leads: Object.fromEntries(leads.map((l, k) => [k, l.P])) }
  };
}

test('hit rate counts an hour only when temperature, wind and rain are all right', () => {
  const rel = R.compute(train({ tempMiss: 10, windMiss: 20, rainMiss: 5 }));
  const L0 = R.forLead(rel, 0);
  assert.equal(L0.temp.p, 90);
  assert.equal(L0.wind.p, 80);
  assert.equal(L0.rain.p, 95);
  assert.equal(L0.joint.vars, 3);
  assert.equal(L0.joint.p, 80); // the misses overlap in the first 20 rows
  assert.equal(L0.pod, 75);
});

test('reliability falls with lead time and is reported per forecast day', () => {
  const rel = R.compute(train({ tempMiss: 10 }));
  const ps = rel.leads.map(l => l.joint.p);
  assert.equal(rel.leads.length, 6);
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i] <= ps[i - 1]);
});

test('MONO is compared with the plain model average on the same hours', () => {
  const L = R.forLead(R.compute(train({ meanMiss: 40 })), 0);
  assert.equal(L.tempMean.p, 60);
  assert.equal(L.temp.p, 100);
});

test('too few test hours gives no percentage rather than a noisy one', () => {
  assert.equal(R.compute(train({ n: 12 })), null);
  assert.equal(R.compute(null), null);
});

test('rain flags stored as booleans are accepted', () => {
  const tr = train();
  for (const k of Object.keys(tr.precip.leads)) tr.precip.leads[k].holdout = tr.precip.leads[k].holdout.map(r => [r[0], r[1], r[2] === 1, r[3], r[4]]);
  assert.equal(R.forLead(R.compute(tr), 0).rain.p, 100);
});

test('card and day badges are labelled as a historical rate, in Greek and English', () => {
  const rel = R.compute(train({ tempMiss: 10 }));
  const el = R.render(rel, { lang: 'el', dayLabels: ['Σήμερα', 'Αύριο'] });
  assert.match(el, /Πιθανότητα να πέσει μέσα η πρόγνωση για αύριο/);
  assert.match(el, /ERA5/);
  assert.match(el, /όχι εγγύηση/);
  assert.match(R.render(rel, { lang: 'en' }), /How often the forecast is right/);
  assert.match(R.badge(rel, 1, 'el'), /✓ \d+%/);
  assert.equal(R.badge(rel, 6, 'el'), '');
});

test('module is loaded by the page and cached by the service worker', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('index.html'), /mono-reliability\.js/);
  assert.match(read('sw.js'), /mono-reliability\.js/);
});
