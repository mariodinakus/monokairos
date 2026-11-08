'use strict';
// Asks the deployed API to append yesterday's verification for each curated city.
const { CITIES } = require('../lib/station-verify.cjs');
const base = process.env.MONO_BASE_URL || 'https://monokairos.vercel.app';
async function refresh([id, lat, lon]) {
  try {
    const r = await fetch(`${base}/api/verify?` + new URLSearchParams({ lat, lon, mode: 'update' }), { signal: AbortSignal.timeout(65000) });
    const d = await r.json();
    console.log(`${id}: HTTP ${r.status} · ${d.available ? `${d.days} days, hit ${Math.round(d.hit * 100)}% (models ${Math.round(d.hitMean * 100)}%), MAE ${d.mae}°` : d.reason}${d.added ? ` · +${d.added}` : ''}${d.skipped ? ' · skipped' : ''}${d.detail ? ' · ' + d.detail : ''}`);
    return r.ok && d.available;
  } catch (e) { console.log(`${id}: request failed (${e.message})`); return false; }
}
(async () => {
  // One city at a time with a pause: the station archive (IEM) and Open-Meteo throttle bursts.
  const results = [];
  for (const [n, city] of CITIES.entries()) {
    if (n) await new Promise(r => setTimeout(r, 20000));
    results.push(await refresh(city));
  }
  if (results.every(x => !x)) process.exitCode = 1;
})();
