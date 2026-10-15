/* Fixed NOAA SWPC public feeds. No API key or user location is sent. */
const FEEDS = {
  scales: 'products/noaa-scales.json', kp: 'products/noaa-planetary-k-index.json', forecast: 'products/noaa-planetary-k-index-forecast.json',
  wind: 'products/summary/solar-wind-speed.json', magnetic: 'products/summary/solar-wind-mag-field.json', flux: 'products/summary/10cm-flux.json'
};
module.exports = async (req, res) => {
  const entries = await Promise.all(Object.entries(FEEDS).map(async ([key, path]) => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/' + path, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('upstream');
      return [key, await response.json()];
    } catch { return [key, null]; }
  }));
  const feeds = Object.fromEntries(entries), available = entries.some(([, value]) => value !== null);
  res.setHeader('Cache-Control', available ? 's-maxage=300, stale-while-revalidate=300' : 'no-store');
  res.status(available ? 200 : 502).json({ at: Date.now(), source: 'NOAA SWPC', ...feeds, ...(!available ? { error: true } : {}) });
};
