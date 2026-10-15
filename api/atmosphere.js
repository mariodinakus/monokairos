const {guard,coordinates,bounded} = require('../lib/server.cjs');
/* Cache the single GFS profile request independently of the multi-model downloads. */
const { HOURLY } = require('../atmosphere.js');
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const input = new URL(req.url, 'https://monokairos.vercel.app');
  const rawLat = input.searchParams.get('lat'), rawLon = input.searchParams.get('lon');
  const lat = Number(rawLat), lon = Number(rawLon);
  if (rawLat === null || rawLon === null || !rawLat.trim() || !rawLon.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: 'Invalid coordinates' }); return;
  }
  try {
    const params = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), models: 'gfs_global', timezone: 'auto', timeformat: 'unixtime', past_days: '1', forecast_days: '3', hourly: HOURLY });
    const upstream = await fetch('https://api.open-meteo.com/v1/forecast?' + params, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw new Error('upstream');
    const data = await upstream.json();
    if (!data.hourly?.time?.length) throw new Error('empty');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch { res.setHeader('Cache-Control', 'no-store'); res.status(502).json({ error: 'Atmospheric profile unavailable' }); }
};
