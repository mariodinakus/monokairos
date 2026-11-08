const { CITIES } = require('../lib/station-verify.cjs');
const f = v => v == null ? '  —  ' : v.toFixed(2);
const p = v => v == null ? ' — ' : Math.round(v * 100) + '%';
(async () => { for (const [id, lat, lon] of CITIES) {
  const d = await (await fetch(`https://monokairos.vercel.app/api/verify?lat=${lat}&lon=${lon}&x=${Date.now()}`)).json();
  if (!d.available) { console.log('ROW', id, d.reason); continue; }
  const a = d.auto, c = d.corrected, s = d.stationTrained;
  console.log('ROW', id, 'days', d.days, '| ERA5', f(d.mae), p(d.hit), '| cor', f(c?.mae), '| sta', f(s?.mae), '| auto', f(a?.mae), p(a?.hit), '| mean(same)', f(a?.maeMean), p(a?.hitMean), '| used', JSON.stringify(a?.used || {}));
}})();
