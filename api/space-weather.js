/* Fixed NOAA SWPC public feeds. No API key or user location is sent. */
const { guard } = require('../lib/server.cjs');
const FEEDS = {
  scales: 'products/noaa-scales.json', kp: 'products/noaa-planetary-k-index.json', forecast: 'products/noaa-planetary-k-index-forecast.json',
  wind: 'products/summary/solar-wind-speed.json', magnetic: 'products/summary/solar-wind-mag-field.json', flux: 'products/summary/10cm-flux.json',
  flare: 'json/goes/primary/xray-flares-latest.json', xrays: 'json/goes/primary/xrays-6-hour.json', protons: 'json/goes/primary/integral-protons-6-hour.json', electrons: 'json/goes/primary/integral-electrons-6-hour.json'
};
let cached = null, pending = null;
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  if (cached && Date.now() - cached.at < 300000) { res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=300'); return res.status(200).json(cached); }
  pending ||= Promise.all(Object.entries(FEEDS).map(async ([key, path]) => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/' + path, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('upstream');
      return [key, await response.json()];
    } catch { return [key, null]; }
  })).finally(() => { pending = null; });
  const entries = await pending;
  const feeds = Object.fromEntries(entries), available = entries.some(([, value]) => value !== null);
  res.setHeader('Cache-Control', available ? 's-maxage=300, stale-while-revalidate=300' : 'no-store');
  const result = { at: Date.now(), source: 'NOAA SWPC', ...feeds, ...(!available ? { error: true } : {}) };
  if (available) cached = result;
  res.status(available ? 200 : 502).json(result);
};
