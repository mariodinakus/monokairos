/* Local ephemerides: Astronomy Engine 2.1.19 (MIT). Coordinates stay in the browser. */
(function (root) {
'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./vendor/astronomy.min.js') : root.Astronomy;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAY = 86400e3, cache = new Map();
function position(body, date, observer) {
  const eq = A.Equator(body, date, observer, true, true);
  return A.Horizon(date, observer, eq.ra, eq.dec, 'normal');
}
function snapshot(options = {}) {
  const {lat, lon} = options, now = options.now ?? Date.now();
  if (!A || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const key = `${lat},${lon},${Math.floor(now / 600e3)}`;
  if (cache.has(key)) return cache.get(key);
  const date = new Date(now), obs = new A.Observer(lat, lon, 0);
  const sun = position('Sun', date, obs), moon = position('Moon', date, obs);
  const dusk = A.SearchAltitude('Sun', obs, -1, date, 2, -18);
  const start = sun.altitude < -18 ? date : dusk?.date;
  const dawn = start ? A.SearchAltitude('Sun', obs, 1, new Date(+start + 60000), 2, -18) : null;
  const sample = start ? new Date(Math.min(+start + 2 * 3600e3, dawn ? (+start + +dawn.date) / 2 : Infinity)) : date;
  const planets = ['Mercury','Venus','Mars','Jupiter','Saturn'].map(body => ({ body, ...position(body, sample, obs) })).filter(p => p.altitude >= 10).sort((a,b) => b.altitude - a.altitude);
  const events = [];
  let q = A.SearchMoonQuarter(date);
  for (let i = 0; i < 5; i++, q = A.NextMoonQuarter(q)) events.push({type:'phase', quarter:q.quarter, time:+q.time.date});
  const year = date.getUTCFullYear();
  for (const y of [year, year + 1]) for (const [season, time] of Object.entries(A.Seasons(y))) if (+time.date > now && +time.date < now + 370 * DAY) events.push({type:'season', season, time:+time.date});
  const solar = A.SearchLocalSolarEclipse(date, obs);
  events.push({type:'solar', time:+solar.peak.time.date, kind:solar.kind, obscuration:solar.obscuration, altitude:solar.peak.altitude});
  const lunar = A.SearchLunarEclipse(date);
  events.push({type:'lunar', time:+lunar.peak.date, kind:lunar.kind, altitude:position('Moon', lunar.peak.date, obs).altitude});
  events.sort((a,b) => a.time - b.time);
  const result = {now, sun, moon, illumination:A.Illumination('Moon', date).phase_fraction, start:start ? +start : null, end:dawn ? +dawn.date : null, sample:+sample, planets, events,
    moonrise:A.SearchRiseSet('Moon', obs, 1, date, 2)?.date.getTime() ?? null, moonset:A.SearchRiseSet('Moon', obs, -1, date, 2)?.date.getTime() ?? null};
  if (cache.size > 20) cache.clear(); cache.set(key, result); return result;
}
const names = { el:{Mercury:'Ερμής',Venus:'Αφροδίτη',Mars:'Άρης',Jupiter:'Δίας',Saturn:'Κρόνος'}, en:{Mercury:'Mercury',Venus:'Venus',Mars:'Mars',Jupiter:'Jupiter',Saturn:'Saturn'} };
function render(options = {}) {
  const S = snapshot(options); if (!S) return '';
  const el = options.lang !== 'en', lang = el ? 'el' : 'en', L = el ? 'el-GR' : 'en-GB', zone = options.zone || 'UTC';
  const X = (a,b) => el ? a : b;
  const date = (t, full = false) => t === null ? '—' : new Date(t).toLocaleString(L, {timeZone:zone, ...(full ? {day:'numeric',month:'short',year:'numeric'} : {weekday:'short'}), hour:'2-digit',minute:'2-digit',hour12:false});
  const heading = X('Ο ουρανός στην τοποθεσία σου','The sky at your location');
  const phases = X(['Νέα σελήνη','Πρώτο τέταρτο','Πανσέληνος','Τελευταίο τέταρτο'],['New moon','First quarter','Full moon','Last quarter']);
  const seasons = {mar_equinox:X('Ισημερία Μαρτίου','March equinox'),jun_solstice:X('Ηλιοστάσιο Ιουνίου','June solstice'),sep_equinox:X('Ισημερία Σεπτεμβρίου','September equinox'),dec_solstice:X('Ηλιοστάσιο Δεκεμβρίου','December solstice')};
  const kinds = {partial:X('μερική','partial'),total:X('ολική','total'),annular:X('δακτυλιοειδής','annular'),penumbral:X('παρασκιάς','penumbral')};
  const eventName = e => e.type === 'phase' ? phases[e.quarter] : e.type === 'season' ? seasons[e.season] : e.type === 'solar' ? X('Έκλειψη Ηλίου','Solar eclipse') : X('Έκλειψη Σελήνης','Lunar eclipse');
  const eventNote = e => e.type === 'solar' ? `${kinds[e.kind] || ''} · ${X('από εδώ','from here')} · ${Math.round(e.obscuration * 100)}% ${X('κάλυψη','obscuration')}${e.altitude <= 0 ? ' · ' + X('μέγιστο κάτω από τον ορίζοντα','maximum below horizon') : ''}` : e.type === 'lunar' ? `${kinds[e.kind] || ''} · ${e.altitude > 0 ? X('Σελήνη πάνω από τον ορίζοντα στο μέγιστο','Moon above horizon at maximum') : X('μέγιστο μη ορατό από εδώ','maximum not visible here')}` : X('Αστρονομικός υπολογισμός','Astronomical calculation');
  const rows = options.rows || [];
  const nightRows = rows.filter(r => r.t >= (S.start ?? Infinity) && r.t <= (S.end ?? -Infinity) && Number.isFinite(r.cloud));
  const cloud = nightRows.length ? Math.round(nightRows.reduce((n,r)=>n+r.cloud,0)/nightRows.length) : null;
  const lead = S.sun.altitude < -18 ? X('Αστρονομική νύχτα τώρα','Astronomical night now') : S.sun.altitude < 0 ? X('Λυκόφως τώρα','Twilight now') : X('Ημέρα τώρα','Daytime now');
  const next = S.events[0];
  if (options.compact) return `<section class="card sky-local sky-compact" id="local-sky"><div class="sky-top"><div><span class="label">${heading}</span><h2>${lead}</h2><p>${esc(options.city || '')} · ${X('Σελήνη','Moon')} ${Math.round(S.illumination*100)}%</p></div><button class="chip" data-action="goto" data-page="space">${X('Εξερεύνηση διαστήματος','Explore space')} ↗</button></div><div class="sky-mini-grid"><div><span>${X('Σκοτεινός ουρανός','Dark sky')}</span><b>${S.start === null ? X('Δεν υπάρχει παράθυρο στο επόμενο 48ωρο','No window in the next 48h') : date(S.start) + ' → ' + date(S.end)}</b></div><div><span>${X('Πλανήτες στο παράθυρο νύχτας','Planets in the night window')}</span><b>${S.planets.map(p=>names[lang][p.body]).join(' · ') || X('Κανένας πάνω από 10°','None above 10°')}</b></div><div><span>${X('Επόμενο φαινόμενο','Next event')}</span><b>${eventName(next)} · ${date(next.time, true)}</b></div></div></section>`;
  return `<section class="section sky-local" id="local-sky"><div class="sectionhead"><div><span class="label">${esc(options.city || '')} · ${esc(zone)}</span><h2>${heading}</h2></div></div><div class="sky-grid"><article class="card sky-night"><span class="label">${X('Νύχτα & παρατήρηση','Night & observing')}</span><h3>${lead}</h3><div class="sky-time">${date(S.start)}<small>→ ${date(S.end)}</small></div><p>${X('Ήλιος κάτω από −18° · επόμενο παράθυρο αστρονομικής νύχτας.','Sun below −18° · next astronomical night window.')}${S.start === null ? ' ' + X('Δεν βρέθηκε στο επόμενο 48ωρο (πολική ημέρα ή λυκόφως).','No crossing within 48 hours (polar day or twilight).') : ''}</p><div class="kvs"><span>${X('Σελήνη','Moon')} <b>${Math.round(S.illumination * 100)}%</b></span><span>${X('Νέφωση στο παράθυρο','Cloud in window')} <b>${cloud === null ? '—' : cloud + '%'}</b></span></div><p>${X('Επόμενη ανατολή Σελήνης','Next moonrise')}: ${date(S.moonrise)}<br>${X('Επόμενη δύση Σελήνης','Next moonset')}: ${date(S.moonset)}</p><small class="env-meta">${X('Η φωτορύπανση, τα εμπόδια, η διαύγεια και τα σύννεφα επηρεάζουν την πραγματική θέα.','Light pollution, obstructions, transparency and cloud affect actual visibility.')}</small></article><article class="card"><span class="label">${X('Πού να κοιτάξεις','Where to look')}</span><h3>${X('Πλανήτες πάνω από τον ορίζοντα','Planets above the horizon')}</h3><p>${X('Υπολογισμός για','Calculated for')} ${date(S.sample)}</p><div class="sky-planets">${S.planets.map(p=>`<div><b>${names[lang][p.body]}</b><span>${Math.round(p.altitude)}° ${X('ύψος','altitude')} · ${Math.round(p.azimuth)}° ${X('αζιμούθιο','azimuth')}</span></div>`).join('') || `<p>${X('Κανένας από τους πέντε φωτεινούς πλανήτες πάνω από 10° στο δείγμα.','None of the five bright planets is above 10° at the sample time.')}</p>`}</div><small class="env-meta">${X('0° βορράς · 90° ανατολή · 180° νότος · 270° δύση. Θέση, όχι εγγύηση ορατότητας.','0° north · 90° east · 180° south · 270° west. Position, not guaranteed visibility.')}</small></article></div><article class="card sky-events"><span class="label">${X('Μπροστά στον χρόνο','Looking ahead')}</span><h3>${X('Επερχόμενα ουράνια φαινόμενα','Upcoming celestial events')}</h3>${S.events.map(e=>`<div class="sky-event"><time datetime="${new Date(e.time).toISOString()}">${date(e.time,true)}</time><div><b>${eventName(e)}</b><small>${eventNote(e)}</small></div></div>`).join('')}<p class="env-meta">${X('Φάσεις, ισημερίες και ηλιοστάσια: παγκόσμια συμβάντα σε τοπική ώρα. Ηλιακή έκλειψη: υπολογισμός για τις συντεταγμένες σου. Ποτέ παρατήρηση Ηλίου χωρίς κατάλληλο ηλιακό φίλτρο.','Phases, equinoxes and solstices: global events in local time. Solar eclipse calculated for your coordinates. Never observe the Sun without a suitable solar filter.')}</p></article><p class="env-source">${X('Υπολογισμοί στη συσκευή σου','Computed on your device')} · <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener noreferrer">Astronomy Engine 2.1.19 (MIT)</a></p></section>`;
}
const api = {snapshot, render, position};
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MonoSky = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
