/* MONO · /api/synop?lat=40.64&lon=22.94[&km=120][&hours=72]
 * Official WMO SYNOP observations (national met services, e.g. HNMS/ΕΜΥ) near a point.
 *   Station coordinates: Meteostat station list (WMO ids). Reports: OGIMET (getsynop), decoded here.
 * Response: { source, stations: [{ id, name, lat, lon, elev, dist, src:'synop', list:[obs…] }] }
 *   obs = { t, temp, dewp, rh, wspd, wgst, wdir, pres, vis, cloud, prcp, prcpH, tmax, tmin, ww, wx:[METAR-style tokens], raw }
 * Cached at the edge for 20 min per ~10 km cell. */
const zlib = require('zlib');

const STATIONS_URL = 'https://bulk.meteostat.net/v2/stations/lite.json.gz';
let stationCache = null, stationAt = 0;

async function wmoStations() {
  if (stationCache && Date.now() - stationAt < 24 * 3600e3) return stationCache;
  const r = await fetch(STATIONS_URL, { headers: { 'User-Agent': 'MONO-Weather (monokairos.vercel.app)' } });
  if (!r.ok) throw new Error('stations HTTP ' + r.status);
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const list = JSON.parse(buf.toString('utf8'));
  stationCache = list.filter(s => s.identifiers && s.identifiers.wmo && /^\d{5}$/.test(s.identifiers.wmo) && s.location && Number.isFinite(s.location.latitude))
    .map(s => ({ id: s.identifiers.wmo, icao: s.identifiers.icao || null, name: (s.name && (s.name.en || Object.values(s.name)[0])) || s.identifiers.wmo,
      lat: s.location.latitude, lon: s.location.longitude, elev: s.location.elevation ?? null }));
  stationAt = Date.now();
  return stationCache;
}

const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const stamp = d => d.toISOString().slice(0, 13).replace(/[-T]/g, '') + '00';   // YYYYMMDDHH00

/* ---------------------------------------------------------------- SYNOP (FM-12) decoder */
const TR_HOURS = { 1: 6, 2: 12, 3: 18, 4: 24, 5: 1, 6: 2, 7: 3, 8: 9, 9: 15 };
function signed(sn, v) { return sn === '1' ? -v / 10 : v / 10; }
function visKm(vv) {
  const v = +vv; if (!Number.isFinite(v)) return null;
  if (v <= 50) return v / 10; if (v >= 56 && v <= 80) return v - 50; if (v >= 81 && v <= 88) return (v - 80) * 5 + 30; if (v === 89) return 75;
  return [0.05, 0.2, 0.5, 1, 2, 4, 10, 20, 50, 75][v - 90] ?? null;
}
function rrr(code) { const v = +code; if (!Number.isFinite(v)) return null; if (v === 990) return 0; if (v > 990) return (v - 990) / 10; return v; }
/* present weather ww → METAR-style tokens, so the app can reuse its wording and icons */
function wwTokens(ww) {
  if (ww == null) return [];
  if (ww >= 95) return [ww === 95 || ww === 97 ? 'TSRA' : '+TSRA'];
  if (ww >= 91 && ww <= 94) return ['TSRA'];
  if (ww === 17 || ww === 29) return ['TS'];
  if (ww >= 85 && ww <= 86) return [ww === 86 ? '+SHSN' : 'SHSN'];
  if (ww >= 87 && ww <= 90) return ['SHGS'];
  if (ww >= 80 && ww <= 82) return [ww === 80 ? '-SHRA' : ww === 81 ? 'SHRA' : '+SHRA'];
  if (ww >= 83 && ww <= 84) return ['SHRASN'];
  if (ww >= 70 && ww <= 79) return [ww <= 71 ? '-SN' : ww <= 73 ? 'SN' : ww <= 75 ? '+SN' : 'SN'];
  if (ww >= 66 && ww <= 67) return ['FZRA'];
  if (ww >= 68 && ww <= 69) return ['RASN'];
  if (ww >= 60 && ww <= 65) return [ww <= 61 ? '-RA' : ww <= 63 ? 'RA' : '+RA'];
  if (ww >= 56 && ww <= 57) return ['FZDZ'];
  if (ww >= 50 && ww <= 59) return [ww <= 51 ? '-DZ' : ww <= 53 ? 'DZ' : ww <= 55 ? '+DZ' : 'RADZ'];
  if (ww >= 40 && ww <= 49) return ww === 40 || ww === 41 ? ['BCFG'] : ['FG'];
  if (ww >= 20 && ww <= 28) return [];   // past-hour events, not now
  if (ww >= 18 && ww <= 19) return ['SQ'];
  if (ww === 10) return ['BR'];
  if (ww >= 6 && ww <= 9) return ['DU'];
  if (ww === 5) return ['HZ'];
  if (ww === 4) return ['FU'];
  return [];
}
function decodeSynop(raw, t) {
  const txt = raw.replace(/=+\s*$/, '').trim();
  if (/\bNIL\b/.test(txt)) return null;
  const g = txt.split(/\s+/);
  let i = 0;
  if (g[i] === 'AAXX') i++;
  const yyggi = g[i++]; if (!/^\d{4}[\d/]$/.test(yyggi || '')) return null;
  const knots = yyggi[4] === '3' || yyggi[4] === '4', f = knots ? 1.852 : 3.6;
  i++;   // station id
  const o = { t, raw: txt, wx: [] };
  const ir = g[i++] || '', nddff = g[i++] || '';
  o.vis = visKm(ir.slice(3, 5));
  const N = nddff[0]; o.cloud = /\d/.test(N) ? (+N === 9 ? 100 : Math.round(+N / 8 * 100)) : null;
  const dd = nddff.slice(1, 3); o.wdir = /^\d\d$/.test(dd) ? (+dd === 0 ? null : +dd === 99 ? null : +dd * 10) : null;
  let ff = nddff.slice(3, 5);
  if (ff === '99' && /^00\d{3}$/.test(g[i] || '')) ff = g[i++].slice(2);
  o.wspd = /^\d+$/.test(ff) ? +ff * f : null;
  // section 1 groups until 333 / 555
  for (; i < g.length; i++) {
    const s = g[i]; if (s === '333' || s === '555' || s === '222' || s.startsWith('222')) break;
    if (s.length !== 5 || s.includes('/') && !/^[1-8]/.test(s)) continue;
    const k = s[0];
    if (k === '1' && /^1[01]\d{3}$/.test(s)) o.temp = signed(s[1], +s.slice(2));
    else if (k === '2' && /^2[01]\d{3}$/.test(s)) o.dewp = signed(s[1], +s.slice(2));
    else if (k === '2' && /^29\d{3}$/.test(s)) o.rh = +s.slice(2);
    else if (k === '4' && /^4\d{4}$/.test(s)) { const p = +s.slice(1) / 10; o.pres = p < 100 ? p + 1000 : p; }
    else if (k === '6' && /^6\d{3}\d$/.test(s)) { o.prcp = rrr(s.slice(1, 4)); o.prcpH = TR_HOURS[s[4]] || null; }
    else if (k === '7' && /^7\d\d/.test(s)) { o.ww = +s.slice(1, 3); o.wx = wwTokens(o.ww); }
  }
  // section 3: max/min temperature, extra precipitation, gusts
  const j = g.indexOf('333');
  if (j >= 0) for (let k = j + 1; k < g.length; k++) {
    const s = g[k]; if (s === '555') break;
    if (/^1[01]\d{3}$/.test(s)) o.tmax = signed(s[1], +s.slice(2));
    else if (/^2[01]\d{3}$/.test(s)) o.tmin = signed(s[1], +s.slice(2));
    else if (/^6\d{4}$/.test(s) && o.prcp == null) { o.prcp = rrr(s.slice(1, 4)); o.prcpH = TR_HOURS[s[4]] || null; }
    else if (/^91[01]\d\d$/.test(s)) { const v = +s.slice(3) * f; o.wgst = Math.max(o.wgst || 0, v); }
  }
  if (o.temp == null && o.pres == null && o.wspd == null) return null;
  return o;
}

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const lat = +u.searchParams.get('lat'), lon = +u.searchParams.get('lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { res.status(400).json({ error: 'lat/lon' }); return; }
    const radius = Math.min(200, +u.searchParams.get('km') || 120), hours = Math.min(96, +u.searchParams.get('hours') || 72);
    const here = { lat, lon };
    const near = (await wmoStations()).map(s => ({ ...s, dist: km(here, s) })).filter(s => s.dist <= radius).sort((a, b) => a.dist - b.dist).slice(0, 25);
    if (!near.length) { res.setHeader('Cache-Control', 's-maxage=3600'); res.status(200).json({ source: 'OGIMET · WMO SYNOP', stations: [] }); return; }
    const want = new Map(near.map(s => [s.id, s]));
    const blocks = [...new Set(near.map(s => s.id.slice(0, 3)))].slice(0, 4);
    const end = new Date(), begin = new Date(Date.now() - hours * 3600e3);
    const lists = {};
    for (const b of blocks) {
      const url = `https://www.ogimet.com/cgi-bin/getsynop?begin=${stamp(begin)}&end=${stamp(end)}&block=${b}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'MONO-Weather (monokairos.vercel.app)' } });
      if (!r.ok) continue;
      const text = await r.text();
      for (const line of text.split('\n')) {
        const m = line.match(/^(\d{5}),(\d{4}),(\d\d),(\d\d),(\d\d),(\d\d),(.*)$/); if (!m || !want.has(m[1])) continue;
        const t = Date.UTC(+m[2], +m[3] - 1, +m[4], +m[5], +m[6]);
        const o = decodeSynop(m[7], t); if (!o) continue;
        (lists[m[1]] ||= []).push(o);
      }
    }
    const stations = near.filter(s => lists[s.id]?.length).map(s => ({ id: s.id, icao: s.icao, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, dist: Math.round(s.dist * 10) / 10, src: 'synop',
      list: lists[s.id].sort((a, b) => a.t - b.t) }));
    res.setHeader('Cache-Control', 's-maxage=1200, stale-while-revalidate=1800');
    res.status(200).json({ source: 'OGIMET · WMO SYNOP', stations });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
};
module.exports.decodeSynop = decodeSynop;
