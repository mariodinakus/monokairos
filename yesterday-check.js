/* "How far off was yesterday?" — MONO's genuine day-ahead forecast for yesterday
   (built from each model's previous-day run, Open-Meteo Previous Runs API, with the
   trained lead-1 MONO combination) compared with the local station's hourly
   observations. Training ends six days ago, so yesterday is out of sample. */
(function (root) {
  'use strict';
  const HOUR = 3600e3, fin = Number.isFinite;
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

  function parts(t, zone) {
    let f;
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); }
    catch { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); }
    const o = Object.fromEntries(f.formatToParts(new Date(t)).map(p => [p.type, p.value]));
    return { day: `${o.year}-${o.month}-${o.day}`, hour: +o.hour % 24 };
  }
  const dayKey = (t, zone) => parts(t, zone).day;
  function yesterdayKey(now, zone) {
    const today = dayKey(now, zone);
    for (let h = 18; h <= 30; h++) { const k = dayKey(now - h * HOUR, zone); if (k !== today) return k; }
    return null;
  }

  // Split a multi-model Previous Runs response ("temperature_2m_previous_day1_<id>").
  function splitBatch(data, ids, variable = 'temperature_2m_previous_day1') {
    const h = data?.hourly; if (!Array.isArray(h?.time)) return null;
    const out = {};
    for (const id of ids) {
      const v = h[variable + '_' + id] ?? (ids.length === 1 ? h[variable] : undefined);
      if (Array.isArray(v) && v.some(fin)) out[id] = v;
    }
    return { times: h.time.map(s => s * 1000), models: out };
  }

  // Same row shape as MONO's training rows: {H, vals, mean, prev, next}.
  function liveRows(times, models, zone) {
    const ids = Object.keys(models), means = times.map((_, i) => {
      const v = ids.map(id => models[id][i]).filter(fin); return v.length ? mean(v) : null;
    });
    return times.map((t, i) => {
      const vals = {}; for (const id of ids) if (fin(models[id][i])) vals[id] = models[id][i];
      if (!fin(means[i])) return null;
      return { t, H: parts(t, zone).hour, vals, mean: means[i], prev: fin(means[i - 1]) ? means[i - 1] : means[i], next: fin(means[i + 1]) ? means[i + 1] : means[i] };
    }).filter(Boolean);
  }

  /* forecast: [{t, mono, mean}] ; obs: [{t, obs}] (hourly, station) */
  function evaluate({ forecast, obs, now = Date.now(), zone = 'UTC', minHours = 18 } = {}) {
    const key = yesterdayKey(now, zone); if (!key || !Array.isArray(forecast) || !Array.isArray(obs)) return null;
    const byT = new Map(forecast.filter(r => fin(r?.t) && dayKey(r.t, zone) === key).map(r => [Math.round(r.t / HOUR) * HOUR, r]));
    const pairs = [];
    for (const o of obs) {
      if (!fin(o?.t) || !fin(o.obs) || dayKey(o.t, zone) !== key) continue;
      const f = byT.get(Math.round(o.t / HOUR) * HOUR);
      if (f && fin(f.mono)) pairs.push({ t: o.t, obs: o.obs, mono: f.mono, mean: fin(f.mean) ? f.mean : null });
    }
    if (pairs.length < minHours) return null;
    const max = k => Math.max(...pairs.map(p => p[k])), min = k => Math.min(...pairs.map(p => p[k]));
    const withMean = pairs.filter(p => fin(p.mean));
    return {
      day: key, n: pairs.length,
      obs: { max: max('obs'), min: min('obs') },
      mono: { max: max('mono'), min: min('mono'), mae: mean(pairs.map(p => Math.abs(p.mono - p.obs))), bias: mean(pairs.map(p => p.mono - p.obs)) },
      mean: withMean.length === pairs.length ? { max: max('mean'), min: min('mean'), mae: mean(pairs.map(p => Math.abs(p.mean - p.obs))) } : null
    };
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function grade(mae, el) {
    if (!fin(mae)) return '';
    if (mae < 1) return el ? 'Πολύ κοντά' : 'Very close';
    if (mae < 2) return el ? 'Καλή πρόγνωση' : 'Good forecast';
    if (mae < 3) return el ? 'Μέτρια απόκλιση' : 'Moderate miss';
    return el ? 'Έπεσε αρκετά έξω' : 'Noticeably off';
  }

  function render(result, { lang = 'el', station = '' } = {}) {
    if (!result) return '';
    const el = lang !== 'en', X = (a, b) => el ? a : b;
    const n1 = v => fin(v) ? new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) : '—';
    const d0 = v => fin(v) ? new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { maximumFractionDigits: 0 }).format(Math.round(v)) + '°' : '—';
    const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + n1(Math.abs(v)) + '°';
    const m = result.mono, o = result.obs, a = result.mean;
    const better = a && fin(a.mae) ? (m.mae < a.mae - 0.05
      ? X(`Καλύτερα από τον μέσο όρο των μοντέλων (${n1(a.mae)}°)`, `Better than the model average (${n1(a.mae)}°)`)
      : m.mae > a.mae + 0.05 ? X(`Χειρότερα από τον μέσο όρο των μοντέλων (${n1(a.mae)}°)`, `Worse than the model average (${n1(a.mae)}°)`)
        : X('Ίδια με τον μέσο όρο των μοντέλων', 'Same as the model average')) : '';
    const bias = Math.abs(m.bias) >= 0.5 ? X(m.bias > 0 ? 'Έβλεπε πιο ζεστά' : 'Έβλεπε πιο κρύα', m.bias > 0 ? 'Ran warm' : 'Ran cold') + ' ' + signed(m.bias) : X('Χωρίς συστηματική απόκλιση', 'No systematic bias');
    const cell = (label, f, obs) => `<div class="yc-cell"><span class="label">${label}</span><div class="yc-pair"><span><small>MONO</small><b>${d0(f)}</b></span><span><small>${X('Μέτρηση', 'Observed')}</small><b>${d0(obs)}</b></span></div><em class="${Math.abs(f - obs) < 1.5 ? 'ok' : 'off'}">${signed(f - obs)}</em></div>`;
    return `<section class="section card yc-card" aria-label="${esc(X('Πόσο έπεσε έξω χθες', 'How far off yesterday'))}">
  <div class="panelhead"><div><span class="label">MONO / ${esc(X('ΕΛΕΓΧΟΣ ΧΘΕΣ', 'YESTERDAY CHECK'))}</span><h2 class="yc-title">${esc(X('Πόσο έπεσε έξω χθες;', 'How far off was yesterday?'))}</h2></div><span class="yc-grade">${esc(grade(m.mae, el))}</span></div>
  <div class="yc-grid">${cell(X('Μέγιστη', 'High'), m.max, o.max)}${cell(X('Ελάχιστη', 'Low'), m.min, o.min)}
    <div class="yc-cell"><span class="label">${X('Μέσο σφάλμα ώρας', 'Mean hourly error')}</span><div class="yc-big">${n1(m.mae)}°</div><small>${esc(bias)}</small></div></div>
  ${better ? `<p class="yc-note"><b>${esc(better)}</b></p>` : ''}
  <p class="yc-foot">${esc(X(`Πρόγνωση MONO που είχε βγει μία μέρα πριν (προηγούμενο τρέξιμο κάθε μοντέλου, εκπαίδευση που δεν είχε δει τη χθεσινή μέρα) έναντι ${result.n} ωριαίων μετρήσεων`, `MONO's forecast issued a day ahead (each model's previous run, training that had not seen yesterday) against ${result.n} hourly observations`))}${station ? ' · ' + esc(station) : ''}.</p>
</section>`;
  }

  const api = { evaluate, liveRows, splitBatch, yesterdayKey, render };
  root.MONOYesterdayCheck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
