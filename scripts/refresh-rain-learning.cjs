'use strict';
// Public, predefined city coordinates only. No user data or external API keys.
const cities = [
  ['thessaloniki',40.6401,22.9444],['athens',37.9838,23.7275],['patras',38.2466,21.7346],
  ['heraklion',35.3387,25.1442],['larisa',39.639,22.4191],['volos',39.3667,22.9458],
  ['ioannina',39.665,20.8537],['chania',35.5138,24.018],['kavala',40.936,24.4129],
  ['rhodes',36.434,28.2176],['alexandroupoli',40.8457,25.8739],['corfu',39.6243,19.9217]
];
async function refresh([id,lat,lon]) {
  try {
    const q = new URLSearchParams({ mode:'station', lat, lon });
    const r = await fetch('https://monokairos.vercel.app/api/rain-memory?' + q, { signal: AbortSignal.timeout(55000) });
    const data = await r.json();
    console.log(`${id}: ${r.status} ${data.available ? `${data.samples?.n || 0} verified periods${data.stale ? ' (stale)' : ''}` : data.reason || 'unavailable'}`);
    return r.ok && !data.stale;
  } catch { console.log(`${id}: request failed`); return false; }
}
(async () => {
  const results = [];
  // Keep load bounded and let a failing city remain independent of the rest.
  for (let i = 0; i < cities.length; i += 3) results.push(...await Promise.all(cities.slice(i,i+3).map(refresh)));
  if (results.every(x => !x)) process.exitCode = 1;
})();
