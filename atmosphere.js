/* MONO Weather v4 — Clouds every hour, barometer, pressure systems (H/L map), upper atmosphere & stability.
 * Point data: NOAA GFS via Open-Meteo (one run, one model). Synoptic map: Open-Meteo best-match grid. */
(function (root) {
'use strict';
const LEVELS = [1000, 950, 925, 850, 700, 600, 500, 400, 300, 250, 200];
const SURF = ['is_day', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'pressure_msl', 'surface_pressure', 'freezing_level_height', 'cape',
  'lifted_index', 'convective_inhibition', 'boundary_layer_height', 'visibility', 'sunshine_duration', 'total_column_integrated_water_vapour'];
const HOURLY = [...SURF, ...LEVELS.flatMap(p => ['temperature', 'relative_humidity', 'wind_speed', 'wind_direction', 'geopotential_height'].map(k => `${k}_${p}hPa`))].join(',');
const NEG = /^(temperature|lifted_index|convective_inhibition)/;
const valid = (v, key) => Number.isFinite(v) && (NEG.test(key) || v >= 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function snapshot(data, now = Date.now()) {
  const H = data?.hourly || {}, times = H.time || [], sec = now / 1000;
  const index = times.findIndex(t => Number.isFinite(t) && t <= sec && t + 3600 > sec);
  const at = (key, i) => i >= 0 && valid(H[key]?.[i], key) ? H[key][i] : null;
  const value = key => at(key, index);
  const ago = h => index >= 0 ? times.findIndex(t => t === times[index] - h * 3600) : -1;
  const current = value('pressure_msl'), past = at('pressure_msl', ago(3)), past24 = at('pressure_msl', ago(24));
  const rows = times.map((t, i) => ({ t, i, pressure: at('pressure_msl', i), cloud: at('cloud_cover', i), low: at('cloud_cover_low', i), mid: at('cloud_cover_mid', i),
    high: at('cloud_cover_high', i), sun: at('sunshine_duration', i), vis: at('visibility', i), day: at('is_day', i) }))
    .filter(r => Number.isFinite(r.t) && r.t >= sec - 24 * 3600 && r.t < sec + 48 * 3600);
  const nextRows = rows.filter(r => r.t + 3600 > sec);
  return { value, time: index >= 0 ? times[index] : null, rows, nextRows, lat: data?.latitude, lon: data?.longitude,
    delta: current !== null && past !== null ? current - past : null, delta24: current !== null && past24 !== null ? current - past24 : null,
    profile: LEVELS.map(p => ({ p, belowGround: value('surface_pressure') !== null && p > value('surface_pressure'),
      temp: value(`temperature_${p}hPa`), rh: value(`relative_humidity_${p}hPa`), wind: value(`wind_speed_${p}hPa`), dir: value(`wind_direction_${p}hPa`), height: value(`geopotential_height_${p}hPa`) })) };
}

const copy = {
  el: {
    title: 'Σύννεφα, πίεση & ατμόσφαιρα', sub: 'Τι συμβαίνει πάνω από το κεφάλι σου — ώρα με την ώρα, από το έδαφος ως τα 12 km', at: 'Ώρα μοντέλου',
    skyNow: 'Ουρανός τώρα', total: 'Συνολική νεφοκάλυψη', layers: ['Χαμηλά', 'Μεσαία', 'Υψηλά'], heights: ['έως ~2 km', '~2–6 km', 'πάνω από ~6 km'],
    layerKinds: ['στρώματα, ομίχλη, σωρείτες', 'υψίσωρευτες, υψιστρώματα', 'θύσανοι, cirrus'],
    cloudDescriptions: ['Καταγάλανος ουρανός', 'Λίγα σύννεφα', 'Μισοσυννεφιά', 'Πολλή συννεφιά', 'Σκεπασμένος ουρανός'],
    cloudNote: 'Τα στρώματα επικαλύπτονται, άρα τα ποσοστά δεν αθροίζονται. Συννεφιά δεν σημαίνει απαραίτητα βροχή.',
    timeline: 'Νεφοκάλυψη κάθε ώρα', timelineSub: '24 ώρες πίσω · 48 ώρες μπροστά · ανά στρώμα', sunshine: 'Ηλιοφάνεια', now: 'Τώρα',
    hoursTitle: 'Ο ουρανός ώρα με την ώρα', sunMin: 'λεπτά ήλιου',
    pressure: 'Βαρόμετρο', msl: 'Πίεση στη στάθμη θάλασσας', surface: 'Πίεση στο έδαφος', trend3: 'Μεταβολή 3ώρου', trend24: 'Μεταβολή 24ώρου',
    trends: ['Πέφτει γρήγορα', 'Πέφτει', 'Σταθερή', 'Ανεβαίνει', 'Ανεβαίνει γρήγορα'],
    baro: ['Θύελλα', 'Βροχή', 'Μεταβλητός', 'Καλοκαιρία', 'Πολύ ξηρός'],
    baroNote: 'Η χρυσή βελόνα δείχνει τώρα, η γκρι πριν 3 ώρες — όπως στα παλιά βαρόμετρα. Πέφτουσα πίεση συχνά φέρνει χάλασμα, ανερχόμενη βελτίωση.',
    pressureChart: 'Πίεση · 24 ώρες πίσω, 48 μπροστά', high: 'Υψηλό', low: 'Χαμηλό', hpa: 'hPa',
    syn: 'Βαρομετρικά συστήματα', synSub: 'Ισοβαρείς ανά 4 hPa · Υ = υψηλό (αντικυκλώνας), Χ = χαμηλό (κυκλώνας)', H: 'Υ', L: 'Χ',
    upper: 'Ανώτερη ατμόσφαιρα 500 hPa', upperNote: 'Διακεκομμένες: ύψος της επιφάνειας 500 hPa (~5,5 km) σε dam. Χαμηλές τιμές = αυλώνας ψυχρού αέρα, υψηλές = ράχη θερμού.',
    synLoading: 'Φόρτωση χάρτη πιέσεων…', synFail: 'Ο χάρτης πιέσεων δεν φορτώθηκε.', synTime: 'Ώρα χάρτη', nearest: 'Κοντινότερα συστήματα',
    moving: 'κινείται προς', still: 'σχεδόν στάσιμο', km: 'km', you: 'Εσύ',
    regime: ['Βρίσκεσαι κοντά σε βαρομετρικό χαμηλό — ευνοεί συννεφιά, άνεμο και κατακρημνίσματα.', 'Βρίσκεσαι σε ουδέτερο βαρομετρικό πεδίο.', 'Βρίσκεσαι σε περιοχή υψηλών πιέσεων — συνήθως σταθερός, ξηρός καιρός.'],
    dirs: ['Β', 'ΒΑ', 'Α', 'ΝΑ', 'Ν', 'ΝΔ', 'Δ', 'ΒΔ'], dirsTo: ['βόρεια', 'βορειοανατολικά', 'ανατολικά', 'νοτιοανατολικά', 'νότια', 'νοτιοδυτικά', 'δυτικά', 'βορειοδυτικά'],
    profile: 'Κατακόρυφο προφίλ', profileSub: 'Θερμοκρασία, σημείο δρόσου και άνεμος από το έδαφος ως ~12 km',
    columns: ['Επίπεδο', 'Ύψος', 'Θερμοκρασία', 'Υγρασία', 'Άνεμος'], below: 'Κάτω από το έδαφος', unavailable: 'Μη διαθέσιμο',
    tempL: 'Θερμοκρασία', dewL: 'Σημείο δρόσου', zeroL: '0°C',
    jet: 'Αεροχείμαρρος', jetYes: 'Ισχυρός αεροχείμαρρος από πάνω σου', jetNo: 'Χωρίς ισχυρό αεροχείμαρρο από πάνω σου',
    stability: 'Αστάθεια & υγρασία ατμόσφαιρας',
    cape: 'CAPE', capeName: 'Ενέργεια ανοδικών ρευμάτων', capeBands: ['Αμελητέα', 'Ασθενής', 'Μέτρια', 'Ισχυρή', 'Ακραία'],
    li: 'Lifted Index', liName: 'Δείκτης ανύψωσης', liBands: ['Σταθερή', 'Οριακή', 'Ασταθής', 'Πολύ ασταθής'],
    cin: 'CIN', cinName: 'Αναστολή (καπάκι)', pw: 'Νερό στη στήλη', pwName: 'Συνολικοί υδρατμοί', freezing: 'Μηδενισμός', freezingName: 'Υψόμετρο 0°C',
    blh: 'Οριακό στρώμα', blhName: 'Ύψος ανάμειξης αέρα', blhNote: ['Χαμηλό: οι ρύποι εγκλωβίζονται κοντά στο έδαφος', 'Μέτριο', 'Υψηλό: καλή διασπορά ρύπων'],
    vis: 'Ορατότητα', visName: 'Οριζόντια ορατότητα',
    stabNote: 'Το CAPE και ο Lifted Index δείχνουν διαθέσιμη ενέργεια, όχι βεβαιότητα καταιγίδας — χρειάζεται και σκανδάλη (μέτωπο, θερμότητα, ορεογραφία).',
    source: 'Σημειακά δεδομένα: NOAA GFS μέσω Open-Meteo (ίδιο μοντέλο για όλο τον πίνακα). Χάρτης πιέσεων: πλέγμα best-match Open-Meteo. Υπόβαθρο χάρτη: Esri.', docs: 'Πηγή & μεταβλητές',
    loading: 'Φόρτωση ατμόσφαιρας…', failed: 'Τα ατμοσφαιρικά δεδομένα δεν φορτώθηκαν. Δοκίμασε την Ανανέωση.'
  },
  en: {
    title: 'Clouds, pressure & atmosphere', sub: 'What is happening above you — hour by hour, from the ground to 12 km', at: 'Model time',
    skyNow: 'Sky now', total: 'Total cloud cover', layers: ['Low', 'Mid', 'High'], heights: ['up to ~2 km', '~2–6 km', 'above ~6 km'],
    layerKinds: ['stratus, fog, cumulus', 'altocumulus, altostratus', 'cirrus'],
    cloudDescriptions: ['Clear blue sky', 'A few clouds', 'Partly cloudy', 'Mostly cloudy', 'Overcast'],
    cloudNote: 'Layers overlap, so their percentages do not add up. Clouds do not necessarily mean rain.',
    timeline: 'Cloud cover every hour', timelineSub: '24 hours back · 48 hours ahead · by layer', sunshine: 'Sunshine', now: 'Now',
    hoursTitle: 'The sky hour by hour', sunMin: 'min of sun',
    pressure: 'Barometer', msl: 'Sea-level pressure', surface: 'Surface pressure', trend3: '3-hour change', trend24: '24-hour change',
    trends: ['Falling fast', 'Falling', 'Steady', 'Rising', 'Rising fast'],
    baro: ['Stormy', 'Rain', 'Change', 'Fair', 'Very dry'],
    baroNote: 'Gold needle = now, grey needle = 3 hours ago, like a classic barometer. Falling pressure often brings worse weather, rising pressure improvement.',
    pressureChart: 'Pressure · 24 hours back, 48 ahead', high: 'High', low: 'Low', hpa: 'hPa',
    syn: 'Pressure systems', synSub: 'Isobars every 4 hPa · H = high (anticyclone), L = low (cyclone)', H: 'H', L: 'L',
    upper: 'Upper air 500 hPa', upperNote: 'Dashed: height of the 500 hPa surface (~5.5 km) in dam. Low values = cold trough, high values = warm ridge.',
    synLoading: 'Loading pressure map…', synFail: 'Pressure map could not load.', synTime: 'Map time', nearest: 'Nearest systems',
    moving: 'moving', still: 'nearly stationary', km: 'km', you: 'You',
    regime: ['You are near a low — favours clouds, wind and precipitation.', 'You are in a neutral pressure field.', 'You are under high pressure — usually settled, dry weather.'],
    dirs: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], dirsTo: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
    profile: 'Vertical profile', profileSub: 'Temperature, dew point and wind from the ground to ~12 km',
    columns: ['Level', 'Height', 'Temperature', 'Humidity', 'Wind'], below: 'Below ground', unavailable: 'Unavailable',
    tempL: 'Temperature', dewL: 'Dew point', zeroL: '0°C',
    jet: 'Jet stream', jetYes: 'Strong jet stream overhead', jetNo: 'No strong jet stream overhead',
    stability: 'Instability & moisture',
    cape: 'CAPE', capeName: 'Updraft energy', capeBands: ['Negligible', 'Weak', 'Moderate', 'Strong', 'Extreme'],
    li: 'Lifted Index', liName: 'Lifted index', liBands: ['Stable', 'Marginal', 'Unstable', 'Very unstable'],
    cin: 'CIN', cinName: 'Inhibition (cap)', pw: 'Precipitable water', pwName: 'Total column water vapour', freezing: 'Freezing level', freezingName: '0°C altitude',
    blh: 'Boundary layer', blhName: 'Mixing height', blhNote: ['Low: pollutants stay trapped near the ground', 'Moderate', 'High: good dispersion of pollutants'],
    vis: 'Visibility', visName: 'Horizontal visibility',
    stabNote: 'CAPE and Lifted Index show available energy, not certainty of storms — a trigger (front, heating, terrain) is also needed.',
    source: 'Point data: NOAA GFS via Open-Meteo (same model for the whole panel). Pressure map: Open-Meteo best-match grid. Map base: Esri.', docs: 'Data source & variables',
    loading: 'Loading atmosphere…', failed: 'Atmospheric data could not load. Try Refresh.'
  }
};

/* ------------------------------------------------------------ helpers */
let last = { lang: 'el', zone: 'UTC' };
const C = () => copy[last.lang];
const lc = () => (last.lang === 'el' ? 'el-GR' : 'en-GB');
const fmt = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString(lc(), { maximumFractionDigits: d, minimumFractionDigits: 0, useGrouping: false }) : '—';
const hourOf = t => new Date(t * 1000).toLocaleTimeString(lc(), { timeZone: last.zone, hour: '2-digit', minute: '2-digit', hour12: false });
const hourNum = t => +new Date(t * 1000).toLocaleString('en-GB', { timeZone: last.zone, hour: '2-digit', hour12: false }).slice(0, 2) % 24;
const dayOf = t => new Date(t * 1000).toLocaleDateString(lc(), { timeZone: last.zone, weekday: 'short', day: 'numeric' });
const cloudBand = c => c === null ? null : c <= 10 ? 0 : c <= 30 ? 1 : c <= 60 ? 2 : c <= 85 ? 3 : 4;
const dewPoint = (t, rh) => { if (!Number.isFinite(t) || !Number.isFinite(rh) || rh <= 0) return null; const a = 17.62, b = 243.12, g = Math.log(rh / 100) + a * t / (b + t); return b * g / (a - g); };
const compass = deg => Math.round(((deg % 360) + 360) % 360 / 45) % 8;

/* little sky glyph: sun/moon with clouds proportional to cover */
function skyGlyph(cover, day, size = 34) {
  const c = Number.isFinite(cover) ? cover : 0, k = c / 100;
  const sun = day ? `<circle cx="13" cy="13" r="7" fill="url(#mg-sun)"/>` : `<path d="M16 6a8 8 0 1 0 6 13 7 7 0 0 1-6-13z" fill="#ffd98a"/>`;
  const cl1 = k > 0.08 ? `<g opacity="${(0.55 + k * 0.45).toFixed(2)}"><ellipse cx="20" cy="21" rx="${(6 + k * 6).toFixed(1)}" ry="${(3.5 + k * 3).toFixed(1)}" fill="${c > 85 ? '#9aa8b8' : '#eef4fb'}"/><circle cx="${(17 + k * 2).toFixed(1)}" cy="18" r="${(3 + k * 3).toFixed(1)}" fill="${c > 85 ? '#a8b5c4' : '#f7fbff'}"/></g>` : '';
  const cl2 = k > 0.55 ? `<g opacity=".9"><ellipse cx="12" cy="25" rx="7" ry="3.6" fill="${c > 85 ? '#7f8d9e' : '#dfe8f2'}"/></g>` : '';
  return `<svg class="mx-sky" width="${size}" height="${size}" style="width:${size}px;height:${size}px;flex:none" viewBox="0 0 32 32" aria-hidden="true"><defs><radialGradient id="mg-sun"><stop offset="0" stop-color="#fff3a6"/><stop offset=".6" stop-color="#ffc83d"/><stop offset="1" stop-color="#ff9f1c"/></radialGradient></defs>${sun}${cl1}${cl2}</svg>`;
}

/* ------------------------------------------------------------ cloud timeline (SVG heat strip) */
function cloudTimeline(S, sec) {
  const rows = S.rows; if (!rows.length) return `<p class="env-meta">${C().unavailable}</p>`;
  const W = 960, cw = W / rows.length, top = 56, rh = 22, gap = 3, H = top + 3 * (rh + gap) + 34;
  const nowX = rows.findIndex(r => r.t <= sec && r.t + 3600 > sec);
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${(i * cw + cw / 2).toFixed(1)} ${(top - 6 - (r.cloud ?? 0) * 0.42).toFixed(1)}`).join(' ');
  const area = `${line} L${((rows.length - 1) * cw + cw / 2).toFixed(1)} ${top - 6} L${(cw / 2).toFixed(1)} ${top - 6} Z`;
  let cells = '', ticks = '', sun = '';
  rows.forEach((r, i) => {
    const x = i * cw;
    ['high', 'mid', 'low'].forEach((k, j) => {
      const v = r[k]; const y = top + j * (rh + gap);
      cells += `<rect x="${(x + 0.5).toFixed(1)}" y="${y}" width="${(cw - 1).toFixed(1)}" height="${rh}" rx="2" class="mx-cell mx-l${j}" style="--o:${Number.isFinite(v) ? (0.08 + v / 100 * 0.92).toFixed(2) : 0.04}"><title>${hourOf(r.t)} · ${C().layers[2 - j]} ${fmt(v)}%</title></rect>`;
    });
    if (Number.isFinite(r.sun) && r.sun > 60) sun += `<rect x="${(x + 1).toFixed(1)}" y="${H - 26 - r.sun / 3600 * 14}" width="${Math.max(1, cw - 2).toFixed(1)}" height="${(r.sun / 3600 * 14).toFixed(1)}" rx="1.5" fill="url(#mx-gold)"><title>${hourOf(r.t)} · ${C().sunshine} ${fmt(r.sun / 60)}′</title></rect>`;
    const h = hourNum(r.t);
    if (h === 0) ticks += `<line x1="${x}" x2="${x}" y1="4" y2="${H - 8}" class="mx-daysep"/><text x="${x + 4}" y="12" class="mx-tick mx-day">${escA(dayOf(r.t))}</text>`;
    else if (h % 6 === 0) ticks += `<text x="${x + cw / 2}" y="${H - 2}" text-anchor="middle" class="mx-tick">${String(h).padStart(2, '0')}</text>`;
  });
  const nowM = nowX >= 0 ? `<line x1="${nowX * cw + cw / 2}" x2="${nowX * cw + cw / 2}" y1="16" y2="${H - 12}" class="mx-now"/><text x="${nowX * cw + cw / 2 + 4}" y="24" class="mx-tick mx-nowt">${C().now}</text>` : '';
  const labels = C().layers.slice().reverse().map((l, j) => `<span style="top:${((top + j * (rh + gap) + rh / 2) / H * 100).toFixed(1)}%">${l}</span>`).join('');
  return `<div class="mx-timeline"><div class="mx-tl-labels">${labels}<span class="mx-sunlab" style="top:${((H - 20) / H * 100).toFixed(1)}%">☀</span></div>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="mx-tl-svg" role="img" aria-label="${C().timeline}"><defs><linearGradient id="mx-gold" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff9f1c"/><stop offset="1" stop-color="#ffd23f"/></linearGradient>
  <linearGradient id="mx-cl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5ff" stop-opacity=".55"/><stop offset="1" stop-color="#8ec5ff" stop-opacity=".05"/></linearGradient></defs>
  ${ticks}<path d="${area}" fill="url(#mx-cl)"/><path d="${line}" class="mx-cloudline"/>${cells}${sun}${nowM}</svg></div>
  <div class="mx-legend"><span><i class="mx-sw mx-l2"></i>${C().layers[0]} <small>${C().heights[0]}</small></span><span><i class="mx-sw mx-l1"></i>${C().layers[1]} <small>${C().heights[1]}</small></span><span><i class="mx-sw mx-l0"></i>${C().layers[2]} <small>${C().heights[2]}</small></span><span><i class="mx-sw mx-gold"></i>${C().sunshine}</span><span><i class="mx-sw mx-line"></i>${C().total}</span></div>`;
}

/* ------------------------------------------------------------ barometer dial */
function barometer(p, p3) {
  const A0 = -135, A1 = 135, P0 = 960, P1 = 1050;
  const ang = v => A0 + (clamp(v, P0, P1) - P0) / (P1 - P0) * (A1 - A0);
  const pt = (a, r) => { const t = (a - 90) * Math.PI / 180; return [100 + r * Math.cos(t), 100 + r * Math.sin(t)]; };
  const arc = (a0, a1, r) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const segs = [[960, 980, '#7c5cff'], [980, 1000, '#3d8bff'], [1000, 1015, '#9aa4b2'], [1015, 1035, '#ffc233'], [1035, 1050, '#ff7a1a']];
  const ticks = []; for (let v = P0; v <= P1; v += 10) { const [x0, y0] = pt(ang(v), 74), [x1, y1] = pt(ang(v), 82), [tx, ty] = pt(ang(v), 63); ticks.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="mx-btick"/><text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="middle" class="mx-bnum">${v}</text>`); }
  const words = C().baro.map((w, i) => { const mid = (segs[i][0] + segs[i][1]) / 2; const [x, y] = pt(ang(mid), 99); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${x < 85 ? 'end' : x > 115 ? 'start' : 'middle'}" class="mx-bword" fill="${segs[i][2]}">${w}</text>`; }).join('');
  const needle = (v, cls, len) => { if (!Number.isFinite(v)) return ''; const [x, y] = pt(ang(v), len); const [bx, by] = pt(ang(v) + 180, 12); return `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="${cls}"/>`; };
  return `<svg viewBox="-42 -20 284 214" class="mx-baro" role="img" aria-label="${C().pressure} ${fmt(p, 1)} hPa">
  <circle cx="100" cy="100" r="104" class="mx-bface"/>${segs.map(([a, b, col]) => `<path d="${arc(ang(a), ang(b), 88)}" stroke="${col}" stroke-width="9" fill="none" stroke-linecap="butt"/>`).join('')}
  ${ticks.join('')}${words}${needle(p3, 'mx-needle2', 70)}${needle(p, 'mx-needle', 78)}<circle cx="100" cy="100" r="7" fill="#ffc233"/><circle cx="100" cy="100" r="3" fill="#1c1c1e"/>
  <text x="100" y="140" text-anchor="middle" class="mx-bval">${fmt(p, 1)}</text><text x="100" y="155" text-anchor="middle" class="mx-bunit">hPa</text></svg>`;
}

/* ------------------------------------------------------------ simple line chart (pressure) */
function lineChart(rows, key, sec, unit, digits = 0) {
  const pts = rows.filter(r => Number.isFinite(r[key])); if (pts.length < 3) return `<p class="env-meta">${C().unavailable}</p>`;
  const W = 960, H = 190, pl = 8, pr = 8, pt = 22, pb = 26, t0 = rows[0].t, t1 = rows[rows.length - 1].t;
  let lo = Math.min(...pts.map(r => r[key])), hi = Math.max(...pts.map(r => r[key])); if (hi - lo < 6) { const m = (hi + lo) / 2; lo = m - 3; hi = m + 3; }
  const X = t => pl + (t - t0) / (t1 - t0 || 1) * (W - pl - pr), Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  const path = pts.map((r, i) => `${i ? 'L' : 'M'}${X(r.t).toFixed(1)} ${Y(r[key]).toFixed(1)}`).join(' ');
  const area = `${path} L${X(pts[pts.length - 1].t).toFixed(1)} ${H - pb} L${X(pts[0].t).toFixed(1)} ${H - pb} Z`;
  const step = (hi - lo) > 16 ? 8 : 4; let grid = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="mx-grid"/><text x="${W - pr}" y="${(Y(v) - 4).toFixed(1)}" text-anchor="end" class="mx-tick">${v}</text>`;
  let days = ''; rows.forEach(r => { const h = hourNum(r.t); if (h === 0) days += `<line x1="${X(r.t).toFixed(1)}" x2="${X(r.t).toFixed(1)}" y1="6" y2="${H - pb}" class="mx-daysep"/><text x="${(X(r.t) + 4).toFixed(1)}" y="14" class="mx-tick mx-day">${escA(dayOf(r.t))}</text>`; else if (h % 6 === 0) days += `<text x="${X(r.t).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="mx-tick">${String(h).padStart(2, '0')}</text>`; });
  const maxR = pts.reduce((a, r) => r[key] > a[key] ? r : a), minR = pts.reduce((a, r) => r[key] < a[key] ? r : a);
  const mark = (r, cls) => `<circle cx="${X(r.t).toFixed(1)}" cy="${Y(r[key]).toFixed(1)}" r="4.5" class="${cls}"/><text x="${clamp(X(r.t), 30, W - 30).toFixed(1)}" y="${Math.min(H - pb - 4, Math.max(16, Y(r[key]) + (cls === 'mx-max' ? -9 : 17))).toFixed(1)}" text-anchor="middle" class="mx-tick mx-strong">${fmt(r[key], digits)}</text>`;
  const nowx = sec >= t0 && sec <= t1 ? `<line x1="${X(sec).toFixed(1)}" x2="${X(sec).toFixed(1)}" y1="6" y2="${H - pb}" class="mx-now"/>` : '';
  const hits = pts.map(r => `<rect x="${(X(r.t) - (W / pts.length) / 2).toFixed(1)}" y="0" width="${(W / pts.length).toFixed(1)}" height="${H}" class="mx-hit"><title>${escA(dayOf(r.t))} ${hourOf(r.t)} · ${fmt(r[key], digits)} ${unit}</title></rect>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="mx-chart" preserveAspectRatio="none" role="img"><defs><linearGradient id="mx-pa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc233" stop-opacity=".35"/><stop offset="1" stop-color="#ffc233" stop-opacity="0"/></linearGradient></defs>
  ${grid}${days}<path d="${area}" fill="url(#mx-pa)"/><path d="${path}" class="mx-pline"/>${nowx}${mark(maxR, 'mx-max')}${mark(minR, 'mx-min')}${hits}</svg>`;
}

/* ------------------------------------------------------------ vertical profile chart */
function profileChart(S) {
  const P = S.profile.filter(r => !r.belowGround && Number.isFinite(r.temp) && Number.isFinite(r.height));
  if (P.length < 3) return '';
  const W = 520, H = 360, pl = 46, pr = 86, pt = 14, pb = 30;
  const td = P.map(r => dewPoint(r.temp, r.rh));
  const all = [...P.map(r => r.temp), ...td.filter(Number.isFinite), 0];
  const t0 = Math.floor((Math.min(...all) - 4) / 10) * 10, t1 = Math.ceil((Math.max(...all) + 4) / 10) * 10, z1 = Math.max(...P.map(r => r.height)) / 1000 + 0.6;
  const X = t => pl + (t - t0) / (t1 - t0) * (W - pl - pr), Y = z => pt + (1 - z / z1) * (H - pt - pb);
  let grid = ''; for (let t = t0; t <= t1; t += 10) grid += `<line x1="${X(t)}" x2="${X(t)}" y1="${pt}" y2="${H - pb}" class="mx-grid"/><text x="${X(t)}" y="${H - 10}" text-anchor="middle" class="mx-tick">${t}°</text>`;
  for (let z = 0; z <= z1; z += 2) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(z)}" y2="${Y(z)}" class="mx-grid"/><text x="${pl - 6}" y="${Y(z) + 4}" text-anchor="end" class="mx-tick">${z} km</text>`;
  const pathOf = vals => P.map((r, i) => Number.isFinite(vals[i]) ? `${X(vals[i]).toFixed(1)} ${Y(r.height / 1000).toFixed(1)}` : null).filter(Boolean).map((s, i) => (i ? 'L' : 'M') + s).join(' ');
  const winds = P.map(r => { const y = Y(r.height / 1000); const strong = (r.wind ?? 0) >= 120; return `<g transform="translate(${W - pr + 22} ${y.toFixed(1)})"><g transform="rotate(${Math.round(r.dir ?? 0)})"><path d="M0 -8 L0 8 M-4 3 L0 8 L4 3" class="mx-warrow${strong ? ' mx-jet' : ''}"/></g><text x="12" y="4" class="mx-tick${strong ? ' mx-jett' : ''}">${fmt(r.wind)}</text><title>${r.p} hPa · ${fmt(r.wind)} km/h · ${fmt(r.dir)}°</title></g>`; }).join('');
  const dots = P.map((r, i) => `<circle cx="${X(r.temp).toFixed(1)}" cy="${Y(r.height / 1000).toFixed(1)}" r="3.5" class="mx-tdot"><title>${r.p} hPa · ${fmt(r.height)} m · ${fmt(r.temp, 1)}°C · Td ${fmt(td[i], 1)}°C · ${fmt(r.rh)}%</title></circle>`).join('');
  const fz = S.value('freezing_level_height');
  return `<svg viewBox="0 0 ${W} ${H}" class="mx-profile" role="img" aria-label="${C().profile}">${grid}
  <line x1="${X(0)}" x2="${X(0)}" y1="${pt}" y2="${H - pb}" class="mx-zero"/><text x="${X(0) + 4}" y="${pt + 10}" class="mx-tick mx-zerot">0°C</text>
  ${Number.isFinite(fz) ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(fz / 1000)}" y2="${Y(fz / 1000)}" class="mx-fz"/><text x="${pl + 4}" y="${Y(fz / 1000) - 4}" class="mx-tick mx-zerot">${C().freezing} ${fmt(fz)} m</text>` : ''}
  <path d="${pathOf(td)}" class="mx-dline"/><path d="${pathOf(P.map(r => r.temp))}" class="mx-tline"/>${dots}
  <text x="${W - pr + 14}" y="${pt + 2}" class="mx-tick">km/h</text>${winds}</svg>
  <div class="mx-legend"><span><i class="mx-sw mx-tsw"></i>${C().tempL}</span><span><i class="mx-sw mx-dsw"></i>${C().dewL}</span><span><i class="mx-sw mx-zsw"></i>${C().zeroL}</span></div>`;
}

/* ------------------------------------------------------------ synoptic pressure map */
const syn = { key: '', busy: false, data: null, err: false, at: 0, hour: 0, upper: false, lat: 0, lon: 0, box: null };
const NR = 7, NC = 9;
function synBox(lat, lon) {
  const latC = clamp(lat, -70, 70), dLat = 12, dLon = clamp(16 / Math.max(0.35, Math.cos(latC * Math.PI / 180)), 16, 40);
  return { lat0: latC - dLat, lat1: latC + dLat, lon0: lon - dLon, lon1: lon + dLon };
}
const wrapLon = x => ((x + 540) % 360) - 180;
function ensureSyn(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof fetch !== 'function') return;
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  if (syn.key === key && (syn.busy || Date.now() - syn.at < 3 * 3600e3)) return;
  syn.key = key; syn.busy = true; syn.err = false; syn.data = null; syn.lat = lat; syn.lon = lon; syn.box = synBox(lat, lon); syn.hour = 0;
  const b = syn.box, la = [], lo = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NC; j++) { la.push((b.lat1 - i * (b.lat1 - b.lat0) / (NR - 1)).toFixed(2)); lo.push(wrapLon(b.lon0 + j * (b.lon1 - b.lon0) / (NC - 1)).toFixed(2)); }
  const u = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({ latitude: la.join(','), longitude: lo.join(','), hourly: 'pressure_msl,geopotential_height_500hPa', forecast_days: 3, past_days: 0, timeformat: 'unixtime', timezone: 'GMT' });
  fetch(u).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))).then(d => {
    if (syn.key !== key) return;
    const arr = Array.isArray(d) ? d : [d], times = arr[0].hourly.time, sec = Date.now() / 1000;
    const start = Math.max(0, times.findIndex(t => t + 3600 > sec));
    const frames = [];
    for (let h = start; h < times.length; h += 3) {
      const P = [], Z = [];
      for (let i = 0; i < NR; i++) { P.push([]); Z.push([]); for (let j = 0; j < NC; j++) { const o = arr[i * NC + j].hourly; P[i].push(o.pressure_msl[h]); Z[i].push(o.geopotential_height_500hPa[h]); } }
      frames.push({ t: times[h], P, Z });
    }
    syn.data = { frames }; syn.at = Date.now(); syn.busy = false; analyse(); paintSyn();
  }).catch(() => { if (syn.key === key) { syn.err = true; syn.busy = false; syn.at = Date.now() - 2.9 * 3600e3; paintSyn(); } });
}
/* Catmull-Rom upsampling for smooth isobars */
function upsample(G, f) {
  const R = G.length, Cn = G[0].length, out = [];
  const g = (i, j) => G[clamp(i, 0, R - 1)][clamp(j, 0, Cn - 1)];
  const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let y = 0; y <= (R - 1) * f; y++) {
    const row = [], i = Math.min(R - 2, Math.floor(y / f)), ty = y / f - i;
    for (let x = 0; x <= (Cn - 1) * f; x++) {
      const j = Math.min(Cn - 2, Math.floor(x / f)), tx = x / f - j;
      const c = [-1, 0, 1, 2].map(di => cr(g(i + di, j - 1), g(i + di, j), g(i + di, j + 1), g(i + di, j + 2), tx));
      row.push(cr(c[0], c[1], c[2], c[3], ty));
    }
    out.push(row);
  }
  return out;
}
function contours(F, level) {
  const segs = [], R = F.length, Cn = F[0].length;
  const lerp = (a, b, va, vb) => a + (level - va) / (vb - va) * (b - a);
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < Cn - 1; j++) {
    const a = F[i][j], b = F[i][j + 1], c = F[i + 1][j + 1], d = F[i + 1][j];
    if (![a, b, c, d].every(Number.isFinite)) continue;
    const pts = [];
    if ((a < level) !== (b < level)) pts.push([j + lerp(0, 1, a, b), i]);
    if ((b < level) !== (c < level)) pts.push([j + 1, i + lerp(0, 1, b, c)]);
    if ((d < level) !== (c < level)) pts.push([j + lerp(0, 1, d, c), i + 1]);
    if ((a < level) !== (d < level)) pts.push([j, i + lerp(0, 1, a, d)]);
    if (pts.length === 2) segs.push(pts); else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
  }
  return segs;
}
function extrema(G) {
  const out = [], R = G.length, Cn = G[0].length;
  for (let i = 1; i < R - 1; i++) for (let j = 1; j < Cn - 1; j++) {
    const v = G[i][j]; if (!Number.isFinite(v)) continue;
    const nb = []; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (di || dj) nb.push(G[i + di][j + dj]);
    if (!nb.every(Number.isFinite)) continue;
    const mean = nb.reduce((a, b) => a + b, 0) / nb.length;
    const type = nb.every(x => v > x) ? 'H' : nb.every(x => v < x) ? 'L' : null;
    if (!type || Math.abs(v - mean) < 0.6) continue;
    const fx = (G[i][j + 1] - G[i][j - 1]) / 2, fxx = G[i][j + 1] - 2 * v + G[i][j - 1], fy = (G[i + 1][j] - G[i - 1][j]) / 2, fyy = G[i + 1][j] - 2 * v + G[i - 1][j];
    const dx = fxx ? clamp(-fx / fxx, -0.5, 0.5) : 0, dy = fyy ? clamp(-fy / fyy, -0.5, 0.5) : 0;
    out.push({ type, x: j + dx, y: i + dy, v: v + 0.5 * (fx * dx + fy * dy) });
  }
  return out;
}
const gridToLL = (x, y) => { const b = syn.box; return { lat: b.lat1 - y / (NR - 1) * (b.lat1 - b.lat0), lon: b.lon0 + x / (NC - 1) * (b.lon1 - b.lon0) }; };
function distBear(a, b) {
  const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  const y = Math.sin(dLo) * Math.cos(b.lat * r), x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dLo);
  return { km: 2 * 6371 * Math.asin(Math.sqrt(h)), deg: (Math.atan2(y, x) / r + 360) % 360 };
}
function analyse() {
  const F = syn.data.frames;
  F.forEach(f => { f.ext = extrema(f.P).map(e => ({ ...e, ...gridToLL(e.x, e.y) })); });
  F.forEach((f, k) => { const g = F[k + 2]; if (!g) return; f.ext.forEach(e => { const m = g.ext.filter(o => o.type === e.type).map(o => ({ o, d: distBear(e, o) })).filter(o => o.d.km < 900).sort((a, b) => a.d.km - b.d.km)[0]; if (m) e.move = { kmh: m.d.km / ((g.t - f.t) / 3600), deg: m.d.deg }; }); });
}
function synInner() {
  const c = C();
  if (syn.err) return `<p class="env-copy">${c.synFail}</p>`;
  if (!syn.data) return `<div class="mx-syn-loading"><span class="mx-spin"></span>${c.synLoading}</div>`;
  const F = syn.data.frames, k = clamp(syn.hour, 0, F.length - 1), f = F[k], b = syn.box;
  const W = 900, H = 675, sx = W / (NC - 1), sy = H / (NR - 1), up = 6;
  const P = upsample(f.P, up), toXY = ([x, y]) => `${(x / up * sx).toFixed(1)} ${(y / up * sy).toFixed(1)}`;
  const vals = f.P.flat().filter(Number.isFinite), lo = Math.floor(Math.min(...vals) / 4) * 4, hi = Math.ceil(Math.max(...vals) / 4) * 4;
  let iso = '', labs = '';
  for (let L = lo; L <= hi; L += 4) {
    const segs = contours(P, L); if (!segs.length) continue;
    const cls = L === 1012 ? 'mx-iso mx-iso-ref' : 'mx-iso';
    iso += `<path class="${cls}" d="${segs.map(s => `M${toXY(s[0])}L${toXY(s[1])}`).join('')}"/>`;
    const s = segs.reduce((a, s) => (s[0][0] + s[1][0] > a[0][0] + a[1][0] ? s : a), segs[0]);
    const [lx, ly] = toXY(s[0]).split(' ').map(Number);
    if (lx > W * 0.6 && !f.ext.some(e => Math.hypot(e.x * sx - lx, e.y * sy - ly) < 60)) labs += `<text x="${Math.min(lx, W - 26)}" y="${clamp(ly, 14, H - 6)}" class="mx-isolab">${L}</text>`;
  }
  let upper = '';
  if (syn.upper) {
    const Z = upsample(f.Z.map(r => r.map(v => v / 10)), up), zv = f.Z.flat().filter(Number.isFinite).map(v => v / 10);
    for (let L = Math.floor(Math.min(...zv) / 6) * 6; L <= Math.max(...zv); L += 6) {
      const segs = contours(Z, L); if (!segs.length) continue;
      const col = L <= 552 ? '#5aa9ff' : L >= 576 ? '#ff7a59' : '#c58cff';
      upper += `<path class="mx-z500" stroke="${col}" d="${segs.map(s => `M${toXY(s[0])}L${toXY(s[1])}`).join('')}"/>`;
      const s = segs[Math.floor(segs.length / 2)], [lx, ly] = toXY(s[0]).split(' ').map(Number);
      upper += `<text x="${lx}" y="${ly}" class="mx-zlab" fill="${col}">${L}</text>`;
    }
  }
  const ext = f.ext.map(e => { const x = e.x * sx, y = e.y * sy, isH = e.type === 'H'; const arrow = e.move && e.move.kmh > 8 ? (() => { const a = (e.move.deg - 90) * Math.PI / 180, len = clamp(e.move.kmh * 1.6, 24, 80); return `<path d="M${x + Math.cos(a) * 26} ${y + Math.sin(a) * 26} L${x + Math.cos(a) * (26 + len)} ${y + Math.sin(a) * (26 + len)}" class="mx-move ${isH ? 'mx-h' : 'mx-lo'}" marker-end="url(#mx-arr-${isH ? 'h' : 'l'})"/>`; })() : '';
    return `${arrow}<g class="mx-sys ${isH ? 'mx-h' : 'mx-lo'}"><circle cx="${x}" cy="${y}" r="24"/><text x="${x}" y="${y + 9}" text-anchor="middle" class="mx-sysl">${isH ? c.H : c.L}</text><text x="${x}" y="${y + 42}" text-anchor="middle" class="mx-sysv">${fmt(e.v)}</text><title>${isH ? c.high : c.low} ${fmt(e.v, 1)} hPa</title></g>`; }).join('');
  const meX = (syn.lon - b.lon0) / (b.lon1 - b.lon0) * W, meY = (b.lat1 - syn.lat) / (b.lat1 - b.lat0) * H;
  const theme = (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') ? 'Dark' : 'Light';
  const base = `https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_${theme}_Gray_Base/MapServer/export?` + new URLSearchParams({ bbox: [b.lon0, b.lat0, b.lon1, b.lat1].map(v => v.toFixed(3)).join(','), bboxSR: 4326, imageSR: 4326, size: `${W},${H}`, format: 'png', f: 'image' });
  const here = { lat: syn.lat, lon: syn.lon };
  const near = f.ext.map(e => ({ e, d: distBear(here, e) })).sort((a, b2) => a.d.km - b2.d.km).slice(0, 3);
  const pNow = (() => { const fx = (syn.lon - b.lon0) / (b.lon1 - b.lon0) * (NC - 1), fy = (b.lat1 - syn.lat) / (b.lat1 - b.lat0) * (NR - 1); return P[Math.round(fy * up)]?.[Math.round(fx * up)]; })();
  const nearL = near.find(n => n.e.type === 'L' && n.d.km < 900), nearH = near.find(n => n.e.type === 'H' && n.d.km < 1200);
  const regime = (nearL && pNow < 1010) || pNow < 1004 ? 0 : (nearH && pNow > 1016) || pNow > 1022 ? 2 : 1;
  const steps = F.map((fr, i) => i);
  const when = new Date(f.t * 1000).toLocaleString(lc(), { timeZone: last.zone, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return `<div class="mx-syn-tools"><label class="mx-slider"><span>${c.synTime}: <b>${escA(when)}</b></span><input type="range" min="0" max="${steps.length - 1}" step="1" value="${k}" data-mx="synhour" aria-label="${c.synTime}"></label>
  <button class="chip${syn.upper ? ' active' : ''}" data-mx="synupper" type="button">${c.upper}</button></div>
  <div class="mx-mapwrap"><svg viewBox="0 0 ${W} ${H}" class="mx-map" role="img" aria-label="${c.syn}"><defs>
  <marker id="mx-arr-h" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#3d8bff"/></marker>
  <marker id="mx-arr-l" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ff4d6d"/></marker></defs>
  <image href="${escA(base)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" class="mx-basemap"/>${iso}${labs}${upper}${ext}
  <g class="mx-me"><circle cx="${meX}" cy="${meY}" r="13" class="mx-pulse"/><circle cx="${meX}" cy="${meY}" r="6"/><text x="${meX + 11}" y="${meY - 10}" class="mx-melab">${c.you}${Number.isFinite(pNow) ? ' · ' + fmt(pNow) : ''}</text></g></svg></div>
  <p class="mx-regime mx-r${regime}">${c.regime[regime]}</p>
  ${near.length ? `<div class="mx-near"><span class="label">${c.nearest}</span>${near.map(({ e, d }) => `<div class="mx-nearrow"><b class="${e.type === 'H' ? 'mx-hc' : 'mx-lc'}">${e.type === 'H' ? c.H : c.L}</b><span>${e.type === 'H' ? c.high : c.low} <b>${fmt(e.v)} hPa</b> · ${fmt(Math.round(d.km / 10) * 10)} ${c.km} ${c.dirs[compass(d.deg)]}</span><small>${e.move ? (e.move.kmh > 8 ? `${c.moving} ${c.dirsTo[compass(e.move.deg)]} ~${fmt(e.move.kmh)} km/h` : c.still) : ''}</small></div>`).join('')}</div>` : ''}
  ${syn.upper ? `<p class="env-meta">${c.upperNote}</p>` : ''}`;
}
function paintSyn() { if (typeof document === 'undefined') return; const el = document.getElementById('mx-synoptic'); if (el) el.innerHTML = synInner(); }
if (typeof document !== 'undefined' && !root.__mxAtmoBound) {
  root.__mxAtmoBound = true;
  document.addEventListener('input', e => { const t = e.target; if (t?.dataset?.mx === 'synhour') { syn.hour = +t.value; paintSyn(); const el = document.querySelector('[data-mx="synhour"]'); if (el) el.focus(); } });
  document.addEventListener('click', e => { const t = e.target.closest?.('[data-mx="synupper"]'); if (t) { syn.upper = !syn.upper; paintSyn(); } });
}

/* Pressure coordinates are meteorological model surfaces, not fixed physical atmosphere layers. */
const levelExplain = {
  el: {
    title: 'Πώς διαβάζεται το ύψος της ατμόσφαιρας;',
    intro: 'Το hPa είναι μονάδα ατμοσφαιρικής πίεσης. Όσο μικρότερο, τόσο ψηλότερα βρισκόμαστε. Τα ύψη είναι ενδεικτικά και εξαρτώνται από τον καιρό. Οι τιμές δεν αφορούν «θερμοκρασία εδάφους».',
    physical: 'Η τροπόσφαιρα εκτείνεται περίπου μέχρι 8–18 km (ανάλογα με το γεωγραφικό πλάτος και την εποχή). Πάνω της αρχίζει η στρατόσφαιρα. Εδώ βλέπεις κυρίως την τροπόσφαιρα σε επίπεδα πίεσης.',
    levels: ['1000–925 hPa: κοντά στο έδαφος έως ~0,8 km', '850 hPa: περίπου 1,5 km — θερμές/ψυχρές αέριες μάζες', '700 hPa: περίπου 3 km — υγρασία και μεσαία νέφη', '500 hPa: περίπου 5,5 km — αυλώνες, ράχες, ψυχρές εισβολές', '300–200 hPa: περίπου 9–12 km — ισχυροί άνεμοι και αεροχείμαρροι'],
    unit: 'Η θερμοκρασία στο γράφημα και στον πίνακα δίνεται σε βαθμούς Κελσίου (°C).'
  },
  en: {
    title: 'How do atmospheric pressure levels work?',
    intro: 'hPa measures atmospheric pressure. The lower the pressure, the higher the altitude. Heights vary with weather. These values are not ground-level temperatures.',
    physical: 'The troposphere extends to roughly 8–18 km depending on latitude and season; above it lies the stratosphere. This view mainly samples the troposphere at pressure levels.',
    levels: ['1000–925 hPa: surface to around 0.8 km', '850 hPa: around 1.5 km — warm/cold air masses', '700 hPa: around 3 km — humidity and mid-level clouds', '500 hPa: around 5.5 km — troughs, ridges and cold outbreaks', '300–200 hPa: around 9–12 km — strong winds and jet streams'],
    unit: 'Temperatures in the graph and table are degrees Celsius (°C).'
  }
};
/* ------------------------------------------------------------ render */
function band5(v, edges) { if (!Number.isFinite(v)) return null; let i = 0; while (i < edges.length && v >= edges[i]) i++; return i; }
function render(data, options = {}) {
  last = { lang: options.lang === 'en' ? 'en' : 'el', zone: options.zone || 'UTC' };
  const c = C(), X = levelExplain[last.lang], now = options.now ?? Date.now(), S = snapshot(data, now), sec = now / 1000;
  if (Number.isFinite(S.lat)) ensureSyn(options.lat ?? S.lat, options.lon ?? S.lon);
  const cover = S.value('cloud_cover'), cb = cloudBand(cover), day = S.value('is_day') ?? 1;
  const p = S.value('pressure_msl'), p3 = Number.isFinite(p) && Number.isFinite(S.delta) ? p - S.delta : null;
  const tIdx = S.delta === null ? null : S.delta <= -3 ? 0 : S.delta < -1 ? 1 : S.delta <= 1 ? 2 : S.delta < 3 ? 3 : 4;
  const date = t => new Date(t * 1000).toLocaleString(lc(), { timeZone: last.zone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const status = !data || data.error ? `<p class="env-copy" role="status">${data?.error ? c.failed : c.loading}</p>` : '';
  const jetLv = S.profile.filter(r => r.p <= 300 && !r.belowGround && Number.isFinite(r.wind)).sort((a, b) => b.wind - a.wind)[0];
  const cape = S.value('cape'), li = S.value('lifted_index'), cin = S.value('convective_inhibition'), pw = S.value('total_column_integrated_water_vapour'), blh = S.value('boundary_layer_height'), vis = S.value('visibility');
  const capeB = band5(cape, [100, 500, 1500, 3000]), liB = li === null ? null : li > 2 ? 0 : li > 0 ? 1 : li > -4 ? 2 : 3, blhB = band5(blh, [400, 1200]);
  const layer = (k, i) => { const v = S.value('cloud_cover_' + k); return `<div class="mx-layer"><div class="mx-lhead"><span>${c.layers[i]} <small>${c.heights[i]}</small></span><b>${fmt(v)}%</b></div><div class="mx-ltrack"><span class="mx-l${2 - i}" style="width:${Math.min(100, v ?? 0)}%"></span></div><small class="env-meta">${c.layerKinds[i]}</small></div>`; };
  const hours = S.nextRows.slice(0, 48).map(r => `<div class="mx-hour${r.day ? '' : ' mx-night'}"><time>${hourOf(r.t)}</time>${skyGlyph(r.cloud, r.day, 36)}<strong>${fmt(r.cloud)}%</strong>
    <div class="mx-mini">${['low', 'mid', 'high'].map((k, j) => `<i class="mx-l${2 - j}" style="height:${Math.max(2, (r[k] ?? 0) * 0.22).toFixed(1)}px" title="${c.layers[j]} ${fmt(r[k])}%"></i>`).join('')}</div>
    <small>${Number.isFinite(r.sun) && r.sun > 30 ? `☀ ${fmt(r.sun / 60)}′` : '&nbsp;'}</small></div>`).join('');
  const stat = (lbl, name, val, unit, note, cls = '') => `<div class="mx-stat ${cls}"><span class="label">${lbl}</span><strong>${val}<small> ${unit}</small></strong><b>${name}</b>${note ? `<small class="env-meta">${note}</small>` : ''}</div>`;
  return `<div id="cloud-pressure" class="sectionhead env-atmosphere-heading"><div><h2 class="h2">${c.title}</h2><p class="env-meta">${c.sub}</p></div><span class="env-meta">${S.time === null ? c.unavailable : `${c.at}: ${date(S.time)}`}</span></div>${status}
<div class="mx-grid2">
  <article class="card env mx-skycard mx-sky${cb ?? 0}${day ? '' : ' mx-skynight'}"><div class="minihead"><h3 class="label">${c.skyNow}</h3>${skyGlyph(cover, day, 46)}</div>
    <div class="minivalue">${fmt(cover)}<small>%</small></div><b class="env-status">${cb === null ? c.unavailable : c.cloudDescriptions[cb]}</b>
    <div class="mx-layers">${['low', 'mid', 'high'].map(layer).join('')}</div><p class="env-copy">${c.cloudNote}</p></article>
  <article class="card env mx-barocard"><div class="minihead"><h3 class="label">${c.pressure}</h3><span class="mx-trend mx-t${tIdx ?? 2}">${tIdx === null ? '—' : (tIdx < 2 ? '↘ ' : tIdx > 2 ? '↗ ' : '→ ') + c.trends[tIdx]}</span></div>
    ${barometer(p, p3)}
    <div class="env-pressure-stats"><div><span>${c.trend3}</span><b>${S.delta === null ? '—' : `${S.delta > 0 ? '+' : ''}${fmt(S.delta, 1)} hPa`}</b></div><div><span>${c.trend24}</span><b>${S.delta24 === null ? '—' : `${S.delta24 > 0 ? '+' : ''}${fmt(S.delta24, 1)} hPa`}</b></div><div><span>${c.surface}</span><b>${fmt(S.value('surface_pressure'), 1)} hPa</b></div></div>
    <p class="env-meta">${c.baroNote}</p></article>
</div>
<article id="cloud-timeline" class="card mx-block"><div class="panelhead"><h3>${c.timeline}</h3><span class="env-meta">${c.timelineSub}</span></div>${cloudTimeline(S, sec)}</article>
<article class="card mx-block"><div class="panelhead"><h3>${c.hoursTitle}</h3><span class="env-meta">% · ☀ ${c.sunMin}</span></div><div id="mx-hours-scroll" class="mx-hours" tabindex="0" role="region" aria-label="${c.hoursTitle}">${hours || `<p class="env-meta">${c.unavailable}</p>`}</div></article>
<article id="synoptic" class="card mx-block"><div class="panelhead"><h3>${c.syn}</h3><span class="env-meta">${c.synSub}</span></div><div id="mx-synoptic">${synInner()}</div></article>
<article class="card mx-block"><div class="panelhead"><h3>${c.pressureChart}</h3><span class="env-meta">hPa · <span class="mx-hc">●</span> ${c.high} · <span class="mx-lc">●</span> ${c.low}</span></div>${lineChart(S.rows, 'pressure', sec, 'hPa', 1)}</article>
<article id="vertical-profile" class="card env-profile mx-block"><div class="panelhead"><h3>${c.profile}</h3><span class="env-meta">${c.profileSub}</span></div>
  <details id="mx-atmo-help" class="mx-atmo-explain" style="margin:12px 0 18px;border:1px solid var(--line,rgba(140,160,180,.3));border-radius:14px;padding:13px 15px;background:var(--soft,transparent)">
    <summary style="cursor:pointer;font-weight:750;line-height:1.6">${X.title}</summary>
    <p class="env-copy">${X.intro}</p><ul style="padding-left:22px;line-height:1.85;font-size:13px">${X.levels.map(t => `<li>${t}</li>`).join('')}</ul>
    <p class="env-meta">${X.physical}</p><p class="env-meta">${X.unit}</p>
  </details>
  <div class="mx-profgrid"><div>${profileChart(S)}</div><div>
  <div class="mx-jetbox ${jetLv && jetLv.wind >= 120 ? 'mx-jeton' : ''}"><span class="label">${c.jet}</span><strong>${jetLv ? fmt(jetLv.wind) : '—'} <small>km/h</small></strong><b>${jetLv && jetLv.wind >= 120 ? c.jetYes : c.jetNo}</b>${jetLv ? `<small class="env-meta">${jetLv.p} hPa · ~${fmt(jetLv.height / 1000, 1)} km</small>` : ''}</div>
  <div class="env-table-scroll"><table class="env-profile-table"><thead><tr>${c.columns.map(x => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${S.profile.slice().reverse().map(r => `<tr><th scope="row">${r.p}</th>${r.belowGround ? `<td colspan="4" class="env-meta">${c.below}</td>` : `<td>${fmt(r.height)} m</td><td class="mx-tcell" style="--tc:${Number.isFinite(r.temp) ? (r.temp > 0 ? '#ff8a3d' : '#5aa9ff') : 'inherit'}">${fmt(r.temp, 1)} °C</td><td>${fmt(r.rh)}%</td><td>${fmt(r.wind)} <small>${Number.isFinite(r.dir) ? `<span class="arrow" style="display:inline-block;transform:rotate(${Math.round(r.dir)}deg)">↓</span>` : ''}</small></td>`}</tr>`).join('')}</tbody></table></div></div></div></article>
<article class="card mx-block"><div class="panelhead"><h3>${c.stability}</h3><span class="env-meta">GFS · ${S.time === null ? '—' : date(S.time)}</span></div>
  <div class="mx-stats">
  ${stat(c.cape, c.capeName, fmt(cape), 'J/kg', capeB === null ? '' : c.capeBands[capeB], 'mx-b' + (capeB ?? 0))}
  ${stat(c.li, c.liName, fmt(li, 1), '', liB === null ? '' : c.liBands[liB], 'mx-b' + (liB === null ? 0 : liB + (liB > 1 ? 1 : 0)))}
  ${stat(c.cin, c.cinName, fmt(cin), 'J/kg', '')}
  ${stat(c.pw, c.pwName, fmt(pw, 1), 'mm', '')}
  ${stat(c.freezing, c.freezingName, fmt(S.value('freezing_level_height')), 'm', '')}
  ${stat(c.blh, c.blhName, fmt(blh), 'm', blhB === null ? '' : c.blhNote[blhB])}
  ${stat(c.vis, c.visName, fmt(Number.isFinite(vis) ? vis / 1000 : null, 1), 'km', '')}
  </div><p class="env-copy">${c.stabNote}</p></article>
<p class="env-source">${c.source} <a href="https://open-meteo.com/en/docs/gfs-api" target="_blank" rel="noopener">${c.docs} ↗</a></p>`;
}
const api = { LEVELS, HOURLY, snapshot, render, skyGlyph };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.MonoAtmosphere = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
