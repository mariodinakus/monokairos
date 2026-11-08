const {guard,coordinates,bounded} = require('../server.cjs');
/* Cache the single GFS profile request independently of the multi-model downloads. */
const { HOURLY } = require('../../atmosphere.js');
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const input = new URL(req.url, 'https://monokairos.vercel.app');
  const rawLat = input.searchParams.get('lat'), rawLon = input.searchParams.get('lon');
  const lat = Number(rawLat), lon = Number(rawLon);
  if (rawLat === null || rawLon === null || !rawLat.trim() || !rawLon.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: 'Invalid coordinates' }); return;
  }
  // The critical forecast is served through the existing function slot, avoiding
  // browser-side Open-Meteo throttling/CORS failures without adding a Hobby function.
  // Only the fixed, validated parameters below can reach the upstream API.
  if (input.searchParams.get('mode') === 'forecast') {
    try {
      const params = new URLSearchParams({
        latitude: lat.toFixed(4), longitude: lon.toFixed(4),
        timezone: 'auto', timeformat: 'unixtime', past_days: '3', forecast_days: '7',
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,visibility,is_day',
        hourly: 'temperature_2m,precipitation,precipitation_probability,rain,showers,snowfall,weather_code,is_day,uv_index,visibility,wind_speed_10m,cloud_cover',
        daily: 'sunrise,sunset,uv_index_max,daylight_duration'
      });
      const upstream = await fetch('https://api.open-meteo.com/v1/forecast?' + params, {signal: AbortSignal.timeout(10000)});
      if (!upstream.ok) throw new Error('Forecast upstream HTTP ' + upstream.status);
      const data = await upstream.json();
      if (!data.current || !data.hourly?.time?.length || !data.daily?.time?.length) throw new Error('Incomplete forecast');
      res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
      return res.status(200).json(data);
    } catch (err) {
      console.warn('[MONO forecast proxy]', err.message);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({error: 'Forecast temporarily unavailable'});
    }
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
