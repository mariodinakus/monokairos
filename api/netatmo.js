/* MONO · /api/netatmo?lat=40.64&lon=22.94[&km=12]
 * Personal weather stations (Netatmo public data) around a point. Off until these Vercel env vars exist:
 *   NETATMO_CLIENT_ID, NETATMO_CLIENT_SECRET, NETATMO_REFRESH_TOKEN
 * Netatmo rotates refresh tokens. To keep the newest one across cold starts, optionally connect an
 * Upstash Redis / Vercel KV store (env KV_REST_API_URL + KV_REST_API_TOKEN); without it the env token is used.
 * Response: { source, stations: [{ id, lat, lon, elev, dist, t, temp, rh, pres, rain1h, rain24h, wspd, wgst, wdir }] } */
const KV_KEY = 'mono:netatmo:refresh';
let access = null, accessUntil = 0, memRefresh = null;

const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const kv = () => (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN ? { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN } : null);
async function kvGet() { const k = kv(); if (!k) return null; try { const r = await fetch(`${k.url}/get/${encodeURIComponent(KV_KEY)}`, { headers: { Authorization: `Bearer ${k.token}` } }); const j = await r.json(); return j.result || null; } catch { return null; } }
async function kvSet(v) { const k = kv(); if (!k) return; try { await fetch(`${k.url}/set/${encodeURIComponent(KV_KEY)}/${encodeURIComponent(v)}`, { headers: { Authorization: `Bearer ${k.token}` } }); } catch {} }

async function token() {
  if (access && Date.now() < accessUntil) return access;
  const refresh = memRefresh || (await kvGet()) || process.env.NETATMO_REFRESH_TOKEN;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: process.env.NETATMO_CLIENT_ID, client_secret: process.env.NETATMO_CLIENT_SECRET });
  const r = await fetch('https://api.netatmo.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('netatmo auth: ' + (j.error || r.status));
  access = j.access_token; accessUntil = Date.now() + (j.expires_in || 10800) * 1000 - 120e3;
  if (j.refresh_token && j.refresh_token !== refresh) { memRefresh = j.refresh_token; await kvSet(j.refresh_token); }
  return access;
}

module.exports = async (req, res) => {
  if (!process.env.NETATMO_CLIENT_ID || !process.env.NETATMO_CLIENT_SECRET || !process.env.NETATMO_REFRESH_TOKEN) {
    res.setHeader('Cache-Control', 's-maxage=3600'); res.status(501).json({ error: 'not_configured' }); return;
  }
  try {
    const u = new URL(req.url, 'http://x');
    const lat = +u.searchParams.get('lat'), lon = +u.searchParams.get('lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { res.status(400).json({ error: 'lat/lon' }); return; }
    const R = Math.min(30, +u.searchParams.get('km') || 12), dLat = R / 111, dLon = R / (111 * Math.cos(lat * Math.PI / 180));
    const qs = new URLSearchParams({ lat_ne: (lat + dLat).toFixed(4), lon_ne: (lon + dLon).toFixed(4), lat_sw: (lat - dLat).toFixed(4), lon_sw: (lon - dLon).toFixed(4), filter: 'true' });
    let tk = await token();
    let r = await fetch('https://api.netatmo.com/api/getpublicdata?' + qs, { headers: { Authorization: `Bearer ${tk}` } });
    if (r.status === 401 || r.status === 403) { access = null; tk = await token(); r = await fetch('https://api.netatmo.com/api/getpublicdata?' + qs, { headers: { Authorization: `Bearer ${tk}` } }); }
    const j = await r.json();
    if (!r.ok) throw new Error('netatmo ' + (j.error?.message || r.status));
    const here = { lat, lon };
    const stations = (j.body || []).map(s => {
      const [slon, slat] = s.place?.location || [];
      const o = { id: s._id, lat: slat, lon: slon, elev: s.place?.altitude ?? null, t: null };
      for (const m of Object.values(s.measures || {})) {
        if (m.res && m.type) {
          const [ts, vals] = Object.entries(m.res)[0] || [];
          if (ts) o.t = Math.max(o.t || 0, +ts * 1000);
          m.type.forEach((ty, i) => { const v = vals?.[i]; if (ty === 'temperature') o.temp = v; else if (ty === 'humidity') o.rh = v; else if (ty === 'pressure') o.pres = v; });
        }
        if ('rain_60min' in m) { o.rain1h = m.rain_60min; o.rain24h = m.rain_24h; }
        if ('wind_strength' in m) { o.wspd = m.wind_strength; o.wgst = m.gust_strength; o.wdir = m.wind_angle; }
      }
      return o;
    }).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.temp) && s.t && Date.now() - s.t < 2 * 3600e3)
      .map(s => ({ ...s, dist: Math.round(km(here, s) * 10) / 10 })).sort((a, b) => a.dist - b.dist).slice(0, 400);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=900');
    res.status(200).json({ source: 'Netatmo Weathermap', stations });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
};
