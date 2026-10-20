/* Global signals: grounded NOAA RONI and USGS seismic observations. No inferred probabilities. */
'use strict';

const RONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt';
const NINO_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/Rnino34.ascii.txt';
const QUAKE_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';

async function readText(url, limit = 70000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10500), headers: { 'Accept': 'text/plain' } });
  if (!r.ok) throw new Error('Upstream HTTP ' + r.status);
  const text = await r.text();
  if (text.length > limit) throw new Error('Unexpected data size');
  return text;
}
function rowsRONI(text) {
  return text.split(/\r?\n/).map(line => {
    const m = line.trim().match(/^([A-Z]{3})\s+(\d{4})\s+(-?\d+(?:\.\d+)?)$/);
    if (!m || !['DJF','JFM','FMA','MAM','AMJ','MJJ','JJA','JAS','ASO','SON','OND','NDJ'].includes(m[1])) return null;
    return { season: m[1], year: Number(m[2]), value: Number(m[3]) };
  }).filter(Boolean).slice(-100);
}
function rowsNino(text) {
  return text.split(/\r?\n/).map(line => {
    const m = line.trim().match(/^(\d{4})\s+(\d{1,2})\s+(-?\d+(?:\.\d+)?)$/);
    if (!m || +m[2] < 1 || +m[2] > 12) return null;
    return { year: +m[1], month: +m[2], value: +m[3] };
  }).filter(Boolean).slice(-100);
}
function parseQuakes(data) {
  if (!data || !Array.isArray(data.features)) throw new Error('Unexpected USGS response');
  return data.features.filter(q => Number.isFinite(q?.properties?.mag) && q.geometry?.type === 'Point')
    .sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 12)
    .map(q => ({ id: String(q.id).slice(0,70), mag: Number(q.properties.mag),
      place: String(q.properties.place || 'Unknown').slice(0,140),
      time: Number(q.properties.time), depth: Number(q.geometry.coordinates[2]),
      lon: Number(q.geometry.coordinates[0]), lat: Number(q.geometry.coordinates[1]),
      url: /^https:\/\/earthquake\.usgs\.gov\//.test(q.properties.url || '') ? q.properties.url : null }));
}
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  res.setHeader('Cache-Control','public, s-maxage=600, stale-while-revalidate=1800');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const out = { checkedAt: new Date().toISOString(), source: {
    roni: RONI_URL, nino34: NINO_URL, earthquakes: QUAKE_URL },
    roni: null, nino34: null, earthquakes: null, unavailable: [] };
  const values = await Promise.allSettled([
    readText(RONI_URL).then(rowsRONI),
    readText(NINO_URL).then(rowsNino),
    fetch(QUAKE_URL, { signal: AbortSignal.timeout(10500) }).then(r => { if (!r.ok) throw new Error('USGS HTTP '+r.status); return r.json(); }).then(parseQuakes)
  ]);
  ['roni','nino34','earthquakes'].forEach((key,i) => {
    const v = values[i];
    if (v.status === 'fulfilled' && Array.isArray(v.value) && v.value.length) out[key] = v.value;
    else out.unavailable.push(key);
  });
  if (out.unavailable.length === 3) return res.status(503).json({ ...out, error: 'All upstream sources unavailable' });
  return res.status(200).json(out);
};