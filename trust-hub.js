/* One "Trust" card for the home screen: MONO's historical reliability, the
   live airport-station check, yesterday's check and today's model agreement,
   as tabs instead of four separate cards. */
(function (root) {
  'use strict';
  const fin = Number.isFinite;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function station(s, { lang = 'el' } = {}) {
    if (!s?.available || !s.station) return '';
    const el = lang !== 'en', X = (a, b) => el ? a : b;
    const pc = v => fin(v) ? Math.round(v * 100) + '%' : '—';
    const deg = v => fin(v) ? new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '°' : '—';
    const c = s.corrected, best = c || { hit: s.hit, mae: s.mae, bias: s.bias, hitMean: s.hitMean, maeMean: s.maeMean, days: s.days, hours: s.hours };
    const label = c ? X('MONO + διόρθωση σταθμού', 'MONO + station correction') : 'MONO';
    const diff = fin(best.mae) && fin(best.maeMean) ? best.mae - best.maeMean : null;
    const verdict = diff === null ? '' : diff < -0.05
      ? X('Καλύτερα από τον απλό μέσο όρο των μοντέλων.', 'Better than the plain model average.')
      : diff > 0.05 ? X('Εδώ ο απλός μέσος όρος των μοντέλων τα πήγε λίγο καλύτερα. Το δείχνουμε όπως είναι.', 'Here the plain model average did slightly better. We show it as it is.')
        : X('Ίδια με τον απλό μέσο όρο των μοντέλων.', 'On par with the plain model average.');
    const recs = (s.records || []).slice(-30), w = 300, h = 46;
    const maxE = Math.max(3, ...recs.map(r => fin(r.maeCor) ? r.maeCor : r.mae).filter(fin));
    const pts = recs.map((r, i) => { const v = fin(r.maeCor) ? r.maeCor : r.mae; return fin(v) ? `${(i / Math.max(1, recs.length - 1) * w).toFixed(1)},${(h - v / maxE * h).toFixed(1)}` : null; }).filter(Boolean).join(' ');
    const ptsM = recs.map((r, i) => fin(r.maeMean) ? `${(i / Math.max(1, recs.length - 1) * w).toFixed(1)},${(h - r.maeMean / maxE * h).toFixed(1)}` : null).filter(Boolean).join(' ');
    const last = recs.at(-1);
    return `<div class="th-station">
  <div class="th-big"><b>${pc(best.hit)}</b><span>${X('των ωρών μέσα σε ±2 °C', 'of hours within ±2 °C')}<small>${esc(label)} · ${X('τελευταίες', 'last')} ${best.days} ${X('μέρες', 'days')} · ${esc(s.station.icao)} ${esc(s.station.name)}</small></span></div>
  <div class="th-grid">
    <div><span>${X('Μέσο σφάλμα', 'Mean error')}</span><b>${deg(best.mae)}</b><small>${X('μέσος όρος μοντέλων', 'model average')} ${deg(best.maeMean)}</small></div>
    <div><span>${X('Μέσος όρος μοντέλων ±2°', 'Model average ±2°')}</span><b>${pc(best.hitMean)}</b><small>${X('ίδιες ώρες', 'same hours')}</small></div>
    <div><span>${X('Συστηματική απόκλιση', 'Bias')}</span><b>${(best.bias > 0 ? '+' : '') + deg(best.bias)}</b><small>${best.bias > 0.3 ? X('πιο ζεστά από τη μέτρηση', 'warmer than measured') : best.bias < -0.3 ? X('πιο κρύα από τη μέτρηση', 'colder than measured') : X('χωρίς ουσιαστική', 'negligible')}</small></div>
  </div>
  ${pts ? `<svg class="th-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${X('Ημερήσιο μέσο σφάλμα, 30 μέρες', 'Daily mean error, 30 days')}"><polyline class="th-spark-mean" points="${ptsM}"/><polyline class="th-spark-mono" points="${pts}"/></svg>
  <div class="th-legend"><span><i class="mono"></i>${esc(label)}</span><span><i class="mean"></i>${X('μέσος όρος μοντέλων', 'model average')}</span><span>${X('ημερήσιο μέσο σφάλμα', 'daily mean error')}${last ? ' · ' + X('χθες', 'yesterday') + ' ' + deg(fin(last.maeCor) ? last.maeCor : last.mae) : ''}</span></div>` : ''}
  ${verdict ? `<p class="th-verdict">${esc(verdict)}</p>` : ''}
  <p class="th-foot">${esc(X(`Η πρόγνωση MONO μίας μέρας πριν, στο σημείο του σταθμού, έναντι ωριαίων μετρήσεων METAR. Η εκπαίδευση τελειώνει πάντα πριν από κάθε μέρα που ελέγχεται· η διόρθωση σταθμού μαθαίνει μόνο από προηγούμενες μέρες. Ενημερώνεται κάθε πρωί.`, `MONO's day-ahead forecast at the station point vs hourly METAR observations. Training always ends before each evaluated day; the station correction learns only from earlier days. Updated every morning.`))}</p>
</div>`;
  }

  // tabs: [{id, label, html}] — empty panels are dropped.
  function render(tabs, { active, lang = 'el' } = {}) {
    const list = (tabs || []).filter(t => t && t.html);
    if (!list.length) return '';
    const el = lang !== 'en', cur = list.find(t => t.id === active) || list[0];
    return `<section class="section card th-card" aria-label="${el ? 'Πόσο να εμπιστευτώ την πρόγνωση' : 'How much to trust the forecast'}">
  <div class="th-head"><div><span class="label">MONO / ${el ? 'ΕΜΠΙΣΤΟΣΥΝΗ' : 'TRUST'}</span><h2 class="th-title">${el ? 'Πόσο να εμπιστευτώ την πρόγνωση;' : 'How much should I trust the forecast?'}</h2></div></div>
  <div class="th-tabs" role="tablist">${list.map(t => `<button type="button" role="tab" class="th-tab ${t.id === cur.id ? 'active' : ''}" aria-selected="${t.id === cur.id}" data-action="trustTab" data-v="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</div>
  <div class="th-panel" role="tabpanel">${cur.html}</div>
</section>`;
  }

  const api = { render, station };
  root.MONOTrust = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
