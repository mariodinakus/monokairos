/* How often MONO gets it right: hit rates from the untouched chronological test
   set (last 20% of the training period, never used to fit or choose a method),
   per forecast day. Reference is ERA5 reanalysis, not a local station.
   A "hit" is temperature within ±2 °C, wind within ±10 km/h and the right
   rain / no-rain call (MONO probability ≥ 50% vs ERA5 ≥ 0.2 mm). */
(function (root) {
  'use strict';
  const fin = Number.isFinite;
  const TEMP = 2, WIND = 10, MIN_ROWS = 30;
  const pct = (hit, n) => n ? 100 * hit / n : null;

  function rate(holdout, ok) {
    let hit = 0, n = 0;
    for (const r of Array.isArray(holdout) ? holdout : []) { const v = ok(r); if (v === null) continue; n++; if (v) hit++; }
    return n >= MIN_ROWS ? { p: pct(hit, n), n } : null;
  }
  // temp/wind holdout rows: [t, MONO, model mean, ERA5]; rain: [t, probability, wet 0/1, mm, ERA5 mm]
  const within = (tol, col) => r => Array.isArray(r) && fin(r[col]) && fin(r[3]) ? Math.abs(r[col] - r[3]) <= tol : null;
  const wetOf = v => v === 1 || v === true ? true : v === 0 || v === false ? false : null;
  const rainCall = r => Array.isArray(r) && fin(r[1]) && wetOf(r[2]) !== null ? (r[1] >= 0.5) === wetOf(r[2]) : null;

  function lead(train, k) {
    const T = train?.temp?.leads?.[k], W = train?.wind?.leads?.[k], R = train?.precip?.leads?.[k];
    if (!T) return null;
    const temp = rate(T.holdout, within(TEMP, 1)), tempMean = rate(T.holdout, within(TEMP, 2));
    const wind = W ? rate(W.holdout, within(WIND, 1)) : null, rain = R ? rate(R.holdout, rainCall) : null;
    // Joint hit: every available variable right at the same hour.
    const byT = new Map();
    for (const r of T.holdout || []) if (fin(r?.[0])) { const v = within(TEMP, 1)(r); if (v !== null) byT.set(r[0], { temp: v }); }
    for (const r of W?.holdout || []) { const o = byT.get(r?.[0]); const v = within(WIND, 1)(r); if (o && v !== null) o.wind = v; }
    for (const r of R?.holdout || []) { const o = byT.get(r?.[0]); const v = rainCall(r); if (o && v !== null) o.rain = v; }
    const full = [...byT.values()].filter(o => 'wind' in o && 'rain' in o);
    const joint = full.length >= MIN_ROWS ? { p: pct(full.filter(o => o.temp && o.wind && o.rain).length, full.length), n: full.length, vars: 3 } : temp ? { ...temp, vars: 1 } : null;
    if (!joint) return null;
    return { k, joint, temp, tempMean, wind, rain, pod: fin(R?.pod) ? 100 * R.pod : null, mae: T.test?.[T.choice]?.mae ?? null };
  }

  function compute(train) {
    if (!train?.temp?.leads) return null;
    const leads = [0, 1, 2, 3, 4, 5].map(k => lead(train, k)).filter(Boolean);
    return leads.length ? { leads, days: train.days, start: train.start, end: train.end } : null;
  }

  const forLead = (rel, k) => rel?.leads?.find(l => l.k === k) || null;
  const level = p => p >= 85 ? 'hi' : p >= 70 ? 'mid' : 'lo';

  // Small badge for the 7-day list: day index i → lead i (no badge past the trained leads).
  function badge(rel, i, lang = 'el') {
    const L = forLead(rel, i); if (!L) return '';
    const p = Math.round(L.joint.p), el = lang !== 'en';
    const title = el ? `Ιστορικό ποσοστό επιτυχίας για αυτόν τον ορίζοντα: ${p}% (ωριαίο τεστ, ERA5)` : `Historical hourly hit rate at this lead: ${p}% (ERA5 test)`;
    return `<span class="rel-badge rel-${level(p)}" title="${title}">✓ ${p}%</span>`;
  }

  function render(rel, { lang = 'el', dayLabels = [] } = {}) {
    if (!rel) return '';
    const el = lang !== 'en', X = (a, b) => el ? a : b;
    const n0 = v => fin(v) ? new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { maximumFractionDigits: 0 }).format(Math.round(v)) + '%' : '—';
    const head = forLead(rel, 1) || rel.leads[0], headDay = head.k === 0 ? X('σήμερα', 'today') : head.k === 1 ? X('αύριο', 'tomorrow') : X(`σε ${head.k} μέρες`, `in ${head.k} days`);
    const days = rel.leads.map(L => {
      const p = Math.round(L.joint.p);
      return `<div class="rel-day"><span>${dayLabels[L.k] || (L.k === 0 ? X('Σήμερα', 'Today') : L.k === 1 ? X('Αύριο', 'Tomorrow') : '+' + L.k)}</span><b class="rel-${level(p)}">${n0(p)}</b><i style="--w:${Math.max(4, Math.min(100, p))}%"></i></div>`;
    }).join('');
    const part = (label, v, extra = '') => `<div class="rel-part"><span>${label}</span><b>${n0(v?.p)}</b>${extra ? `<small>${extra}</small>` : ''}</div>`;
    const vsMean = head.temp && head.tempMean ? X(`μέσος όρος μοντέλων ${n0(head.tempMean.p)}`, `model average ${n0(head.tempMean.p)}`) : '';
    const what = head.joint.vars === 3
      ? X('θερμοκρασία ±2 °C, άνεμος ±10 km/h και σωστό «βρέχει / δεν βρέχει», όλα μαζί την ίδια ώρα', 'temperature ±2 °C, wind ±10 km/h and the right rain / no-rain call, all at the same hour')
      : X('θερμοκρασία ±2 °C', 'temperature ±2 °C');
    return `<section class="section card rel-card" aria-label="${X('Αξιοπιστία πρόγνωσης MONO', 'MONO forecast reliability')}">
  <div class="panelhead"><div><span class="label">MONO / ${X('ΑΞΙΟΠΙΣΤΙΑ', 'RELIABILITY')}</span><h2 class="rel-title">${X('Πόσο συχνά βγαίνει σωστή η πρόγνωση', 'How often the forecast is right')}</h2></div></div>
  <div class="rel-hero"><div class="rel-big rel-${level(head.joint.p)}">${n0(head.joint.p)}</div><p>${X(`Ιστορικό ποσοστό επιτυχίας στον ορίζοντα ${headDay}`, `Historical hit rate at the ${headDay} lead`)}<small>${what}</small></p></div>
  <div class="rel-days">${days}</div>
  <div class="rel-parts">${part(X('Θερμοκρασία ±2°', 'Temperature ±2°'), head.temp, vsMean)}${part(X('Άνεμος ±10 km/h', 'Wind ±10 km/h'), head.wind)}${part(X('Βρέχει / δεν βρέχει', 'Rain / no rain'), head.rain)}${fin(head.pod) ? part(X('Εντόπισε τη βροχή', 'Caught the rain'), { p: head.pod }, X('από τις ώρες που έβρεξε', 'of the hours it rained')) : ''}</div>
  <p class="rel-foot">${X(`Ανεξάρτητο τεστ: το τελευταίο 20% των ${rel.days || ''} ημερών εκπαίδευσης, που δεν χρησιμοποιήθηκε ούτε για εκπαίδευση ούτε για επιλογή μεθόδου, ${head.joint.n} ώρες για ${headDay}. Αναφορά: ERA5 (πλέγμα), όχι τοπικός σταθμός. Ποσοστό από το παρελθόν, όχι εγγύηση για την τωρινή κατάσταση.`, `Independent test: the last 20% of ${rel.days || ''} training days, never used to fit or choose a method; ${head.joint.n} hours for ${headDay}. Reference: ERA5 (grid), not a local station. A past rate, not a guarantee for the current situation.`)}</p>
</section>`;
  }

  const api = { compute, badge, render, forLead };
  root.MONOReliability = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
