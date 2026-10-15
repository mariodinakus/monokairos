/* MONO Weather v4 — Space weather: solar storms, flares, Kp, solar wind, aurora chance, live Sun.
 * NOAA SWPC public feeds (via /api/space-weather, or directly from the browser as a fallback). Global indicators,
 * never a location-specific impact prediction. Live imagery: NASA SDO, ESA/NASA SOHO, NOAA OVATION. */
(function (root) {
'use strict';
const number = (v, min = 0, max = Infinity) => v !== null && v !== undefined && v !== '' && Number.isFinite(+v) && +v >= min && +v <= max ? +v : null;
const utc = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) ? Date.parse(value.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z')) : NaN;
const NOAA = 'https://services.swpc.noaa.gov/';
const FEEDS = { scales: 'products/noaa-scales.json', kp: 'products/noaa-planetary-k-index.json', forecast: 'products/noaa-planetary-k-index-forecast.json',
  wind: 'products/summary/solar-wind-speed.json', magnetic: 'products/summary/solar-wind-mag-field.json', flux: 'products/summary/10cm-flux.json',
  flare: 'json/goes/primary/xray-flares-latest.json', xrays: 'json/goes/primary/xrays-6-hour.json', protons: 'json/goes/primary/integral-protons-6-hour.json', electrons: 'json/goes/primary/integral-electrons-6-hour.json' };
function objects(feed) {
  if (!Array.isArray(feed)) return [];
  if (!Array.isArray(feed[0])) return feed;
  return feed.slice(1).map(row => Object.fromEntries(feed[0].map((key, i) => [key, row[i]])));
}
function snapshot(data, now = Date.now()) {
  const latest = feed => objects(feed).filter(r => Number.isFinite(utc(r.time_tag)) && utc(r.time_tag) <= now + 60000).sort((a, b) => utc(b.time_tag) - utc(a.time_tag))[0];
  const scales = data?.scales?.['0'], scaleTime = scales ? utc(scales.DateStamp + 'T' + scales.TimeStamp) : NaN;
  const metric = (value, time, ttl) => ({ value, time: Number.isFinite(time) ? time : null, fresh: value !== null && Number.isFinite(time) && time <= now + 60000 && now - time <= ttl });
  const kp = latest(data?.kp), wind = latest(data?.wind), magnetic = latest(data?.magnetic), flux = latest(data?.flux);
  const forecast = objects(data?.forecast).map(r => ({ time: utc(r.time_tag), value: number(r.kp, 0, 9), kind: r.observed }))
    .filter(r => r.time >= now && r.time < now + 72 * 3600e3 && r.value !== null && ['predicted', 'estimated'].includes(r.kind)).sort((a, b) => a.time - b.time);
  const history = objects(data?.kp).map(r => ({ time: utc(r.time_tag), value: number(r.Kp ?? r.kp, 0, 9) }))
    .filter(r => Number.isFinite(r.time) && r.value !== null && r.time <= now && r.time > now - 72 * 3600e3).sort((a, b) => a.time - b.time);
  const outlook = ['1', '2', '3'].map(k => { const d = data?.scales?.[k]; if (!d) return null; return { date: d.DateStamp, r12: number(d.R?.MinorProb, 0, 100), r35: number(d.R?.MajorProb, 0, 100), s1: number(d.S?.Prob, 0, 100), g: number(d.G?.Scale, 0, 5) }; }).filter(Boolean);
  return { scales: Object.fromEntries(['G', 'R', 'S'].map(key => { const n = number(scales?.[key]?.Scale, 0, 5); return [key, metric(Number.isInteger(n) ? n : null, scaleTime, 2 * 3600e3)]; })),
    kp: metric(number(kp?.Kp ?? kp?.kp, 0, 9), utc(kp?.time_tag), 6 * 3600e3), wind: metric(number(wind?.proton_speed), utc(wind?.time_tag), 2 * 3600e3),
    bz: metric(number(magnetic?.bz_gsm, -1000, 1000), utc(magnetic?.time_tag), 2 * 3600e3), bt: metric(number(magnetic?.bt, 0, 1000), utc(magnetic?.time_tag), 2 * 3600e3),
    flux: metric(number(flux?.flux), utc(flux?.time_tag), 48 * 3600e3), forecast, history, outlook };
}
/* Browser-side fallback with the same shape as /api/space-weather (NOAA feeds allow CORS). */
async function fetchDirect() {
  const entries = await Promise.all(Object.entries(FEEDS).map(async ([key, path]) => {
    try { const r = await fetch(NOAA + path, {signal: AbortSignal.timeout(8000)}); if (!r.ok) throw new Error('upstream'); return [key, await r.json()]; } catch { return [key, null]; }
  }));
  const feeds = Object.fromEntries(entries);
  if (!entries.some(([, v]) => v !== null)) return { error: true };
  return { at: Date.now(), source: 'NOAA SWPC', ...feeds };
}

/* ------------------------------------------------------------ extras: flares + X-ray curve (self-fetched, 10 min cache) */
const extra = { at: 0, busy: false, flare: null, xray: null };
function ensureExtras(data, now = Date.now()) {
  const f = Array.isArray(data?.flare) ? data.flare[0] : null;
  extra.flare = f && now - utc(f.time_tag) <= 30 * 60e3 && utc(f.time_tag) <= now + 60000 ? f : null;
  extra.xray = Array.isArray(data?.xrays) ? data.xrays.filter(r => r.energy === '0.1-0.8nm' && number(r.flux, 1e-10, 1) !== null).map(r => ({ t: utc(r.time_tag), f: +r.flux })).filter(r => Number.isFinite(r.t) && r.t <= now + 60000 && r.t >= now - 6 * 3600e3).sort((a,b) => a.t-b.t) : null;
}
const CLASS_EXP = { A: -8, B: -7, C: -6, M: -5, X: -4 };
const classFlux = s => { const m = /^([ABCMX])(\d+(?:\.\d+)?)/.exec(s || ''); return m ? +m[2] * 10 ** CLASS_EXP[m[1]] : null; };
const fluxClass = f => { if (!Number.isFinite(f) || f <= 0) return null; const e = Math.floor(Math.log10(f)); const L = e >= -4 ? 'X' : e === -5 ? 'M' : e === -6 ? 'C' : e === -7 ? 'B' : 'A'; return L + (f / 10 ** CLASS_EXP[L]).toFixed(1); };

/* geomagnetic latitude (centred dipole, IGRF-14 epoch 2025 pole ≈ 80.8°N, 72.8°W) */
function geomagLat(lat, lon) {
  const r = Math.PI / 180, pl = 80.8 * r, plo = -72.8 * r;
  return Math.asin(Math.sin(lat * r) * Math.sin(pl) + Math.cos(lat * r) * Math.cos(pl) * Math.cos(lon * r - plo)) / r;
}
const kpForHorizon = mlat => (66 - Math.abs(mlat)) / 3; // rough view-line approximation

const copy = {
  el: {
    intro: 'Ο καιρός πέρα από τα σύννεφα: Ήλιος, σωματίδια, ακτίνες γάμμα, νετρίνα και ο ουρανός της πόλης σου. Παγκόσμιοι δείκτες NOAA, όχι τοπική πρόγνωση βλάβης.',
    hero: 'Ηλιακή καταιγίδα τώρα;', heroWords: ['Ήσυχος Ήλιος, ήσυχη Γη', 'Αναταραχή στο μαγνητικό πεδίο', 'Γεωμαγνητική καταιγίδα σε εξέλιξη', 'Ισχυρή γεωμαγνητική καταιγίδα'],
    heroSub: 'Βασισμένο σε Kp, κλίμακα G της NOAA και ηλιακές εκλάμψεις τελευταίων ωρών.',
    names: { G: 'Γεωμαγνητική καταιγίδα', R: 'Διαταραχές ραδιοεπικοινωνιών', S: 'Καταιγίδα ηλιακής ακτινοβολίας' },
    severity: ['Κανένα συμβάν', 'Μικρή', 'Μέτρια', 'Ισχυρή', 'Σοβαρή', 'Ακραία'],
    notes: { G: 'Διαταραχές του μαγνητικού πεδίου της Γης. Σε ισχυρά συμβάντα επηρεάζονται GPS, δορυφόροι και δίκτυα ρεύματος — και εμφανίζεται σέλας σε χαμηλά πλάτη.', R: 'Από ηλιακές εκλάμψεις: διαταραχές στα βραχέα κύματα HF (3–30 MHz) στην ηλιόλουστη πλευρά της Γης. Δεν αφορά FM ή κινητή.', S: 'Ροή ενεργητικών πρωτονίων. Αφορά δορυφόρους, πολικές πτήσεις και αστροναύτες· δεν είναι ο δείκτης UV.' },
    unavailable: 'Μη διαθέσιμο', stale: 'Παλαιότερα δεδομένα', at: 'Χρόνος δεδομένων',
    kp: 'Δείκτης Kp', kpNote: 'Τρίωρος πλανητικός δείκτης 0–9. Από Kp 5 ξεκινά η γεωμαγνητική καταιγίδα (G1).',
    kpChart: 'Kp · 3 μέρες πίσω, 3 μπροστά', observed: 'Μέτρηση', estimated: 'Εκτίμηση', predicted: 'Πρόγνωση',
    flare: 'Ηλιακές εκλάμψεις (ακτίνες Χ)', flareNow: 'Τώρα', flareMax: 'Μέγιστο τελευταίας έκλαμψης', flareNote: 'Κλάσεις A·B·C·M·X, κάθε μία 10 φορές ισχυρότερη. Από M και πάνω μπορεί να διαταραχθούν τα HF.',
    xray: 'Ροή ακτίνων Χ · τελευταίες 6 ώρες (GOES)',
    wind: 'Ηλιακός άνεμος', windNote: 'Ταχύτητα πλάσματος στο σημείο L1, πριν φτάσει στη Γη. >600 km/s = γρήγορο ρεύμα.', windWords: ['Αργός', 'Κανονικός', 'Γρήγορος', 'Πολύ γρήγορος'],
    bz: 'Μαγνητικό πεδίο Bz', bzNote: 'Νότιο (αρνητικό) Bz «ανοίγει την πόρτα» στο γήινο πεδίο και ευνοεί καταιγίδες και σέλας.', bzWords: ['Νότιο · ευνοεί καταιγίδα', 'Ουδέτερο', 'Βόρειο · προστατευτικό'],
    flux: 'Ηλιακή ραδιοροή F10.7', fluxNote: 'Δείκτης ηλιακής δραστηριότητας σε sfu. >150 = πολύ ενεργός Ήλιος (κοντά στο ηλιακό μέγιστο).',
    outlook: 'Πρόγνωση 3 ημερών (NOAA)', oR12: 'Εκλάμψεις R1–R2', oR35: 'Εκλάμψεις R3+', oS1: 'Ακτινοβολία S1+', oG: 'Γεωμαγνητική',
    aurora: 'Σέλας από εδώ;', auroraNeed: 'Χρειάζεται περίπου Kp', auroraNow: 'Τώρα Kp', auroraMaybe: ['Όχι απόψε — πολύ νότια για το τωρινό Kp', 'Οριακά, χαμηλά στον βόρειο ορίζοντα με σκοτεινό ουρανό', 'Πιθανό στον βόρειο ορίζοντα!'],
    auroraNote: 'Χονδρική εκτίμηση από το γεωμαγνητικό σου πλάτος. Χρειάζεται σκοτάδι, καθαρό ουρανό και θέα στον βορρά. Οι φωτογραφικές μηχανές «βλέπουν» περισσότερα από το μάτι.', mlat: 'Γεωμαγνητικό πλάτος',
    auroraLink: 'Χάρτης σέλαος NOAA', live: 'Ο Ήλιος ζωντανά',
    imgs: [['Κορώνα · AIA 193 Å', 'Στέμμα και στεφανιαίες οπές'], ['Χρωμόσφαιρα · AIA 304 Å', 'Προεξοχές και νήματα'], ['Ηλιακές κηλίδες · HMI', 'Ορατή επιφάνεια'], ['Στεμματογράφος · LASCO C3', 'Εκτοξεύσεις μάζας (CME)'], ['Ωοειδές σέλαος · OVATION', 'Βόρειο ημισφαίριο, τώρα']],
    imgNote: 'Εικόνες NASA SDO, ESA/NASA SOHO και NOAA SWPC, ανανεώνονται κάθε λίγα λεπτά από τις πηγές.',
    ozone: 'Δύο διαφορετικά «όζοντα»', ozoneNote: 'Το O₃ της ποιότητας αέρα είναι όζον κοντά στο έδαφος, ρύπος. Το στρατοσφαιρικό στρώμα όζοντος ψηλά απορροφά την υπεριώδη ακτινοβολία· τα μg/m³ της πόλης δεν μετρούν το πάχος του.', ozoneLink: 'NASA Ozone Watch',
    scalesLink: 'Επίσημες κλίμακες & επιδράσεις NOAA', loading: 'Φόρτωση διαστημικού καιρού…', failed: 'Τα δεδομένα NOAA δεν φορτώθηκαν. Δοκίμασε την Ανανέωση.',
    source: 'NOAA Space Weather Prediction Center · ανανέωση ανά 10 λεπτά. Κάθε μέτρηση κρατά τη δική της χρονοσήμανση. Οι ενδείξεις περιγράφουν συνθήκες, όχι βεβαιότητα βλάβης σε συγκεκριμένο εξοπλισμό.',
    mini: 'Διαστημικός καιρός', miniMore: 'Ηλιακή δραστηριότητα'
  },
  en: {
    intro: 'Weather beyond the clouds: the Sun, solar wind, magnetic field, auroras and radio. Global NOAA indicators, not local outage predictions.',
    hero: 'Solar storm right now?', heroWords: ['Quiet Sun, quiet Earth', 'Unsettled magnetic field', 'Geomagnetic storm in progress', 'Strong geomagnetic storm'],
    heroSub: 'Based on Kp, the NOAA G scale and solar flares in recent hours.',
    names: { G: 'Geomagnetic storm', R: 'Radio blackouts', S: 'Solar radiation storm' }, severity: ['No event', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'],
    notes: { G: 'Disturbances in Earth’s magnetic field. Strong events affect GPS, satellites and power grids — and bring auroras to low latitudes.', R: 'From solar flares: HF shortwave (3–30 MHz) disruption on Earth’s sunlit side. Not FM or mobile.', S: 'Energetic proton flux. Relevant to satellites, polar flights and astronauts; this is not the UV index.' },
    unavailable: 'Unavailable', stale: 'Older data', at: 'Data time',
    kp: 'Kp index', kpNote: 'Three-hour planetary index 0–9. Geomagnetic storms start at Kp 5 (G1).',
    kpChart: 'Kp · 3 days back, 3 ahead', observed: 'Observed', estimated: 'Estimated', predicted: 'Forecast',
    flare: 'Solar flares (X-rays)', flareNow: 'Now', flareMax: 'Last flare peak', flareNote: 'Classes A·B·C·M·X, each 10× stronger. M and above can disrupt HF radio.',
    xray: 'X-ray flux · last 6 hours (GOES)',
    wind: 'Solar wind', windNote: 'Plasma speed at L1, before it reaches Earth. >600 km/s = fast stream.', windWords: ['Slow', 'Normal', 'Fast', 'Very fast'],
    bz: 'Magnetic field Bz', bzNote: 'Southward (negative) Bz “opens the door” to Earth’s field and favours storms and auroras.', bzWords: ['Southward · storm-friendly', 'Neutral', 'Northward · protective'],
    flux: 'Solar radio flux F10.7', fluxNote: 'Solar activity indicator in sfu. >150 = very active Sun (near solar maximum).',
    outlook: '3-day outlook (NOAA)', oR12: 'Flares R1–R2', oR35: 'Flares R3+', oS1: 'Radiation S1+', oG: 'Geomagnetic',
    aurora: 'Aurora from here?', auroraNeed: 'Needs roughly Kp', auroraNow: 'Now Kp', auroraMaybe: ['Not tonight — too far south for the current Kp', 'Borderline, low on the northern horizon under dark skies', 'Possible on the northern horizon!'],
    auroraNote: 'Rough estimate from your geomagnetic latitude. Needs darkness, clear skies and a northern view. Cameras pick up more than the eye.', mlat: 'Geomagnetic latitude',
    auroraLink: 'NOAA aurora map', live: 'The Sun, live',
    imgs: [['Corona · AIA 193 Å', 'Corona and coronal holes'], ['Chromosphere · AIA 304 Å', 'Prominences and filaments'], ['Sunspots · HMI', 'Visible surface'], ['Coronagraph · LASCO C3', 'Coronal mass ejections'], ['Aurora oval · OVATION', 'Northern hemisphere, now']],
    imgNote: 'Images from NASA SDO, ESA/NASA SOHO and NOAA SWPC, refreshed every few minutes at source.',
    ozone: 'Two different kinds of ozone', ozoneNote: 'Air-quality O₃ is near-surface ozone, a pollutant. The stratospheric ozone layer high above absorbs UV; city μg/m³ values do not measure its thickness.', ozoneLink: 'NASA Ozone Watch',
    scalesLink: 'Official NOAA scales & effects', loading: 'Loading space weather…', failed: 'NOAA data could not load. Try Refresh.',
    source: 'NOAA Space Weather Prediction Center · refreshes every 10 minutes. Each measurement keeps its own timestamp. Indicators describe conditions, not certainty of an issue with particular equipment.',
    mini: 'Space weather', miniMore: 'Solar activity'
  }
};
const IMGS = ['https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg', 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg', 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg',
  'https://soho.nascom.nasa.gov/data/realtime/c3/512/latest.jpg', 'https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg'];

let last = null;
function paint() { if (typeof document === 'undefined' || !last) return; const el = document.getElementById('mx-flare'); if (el) el.innerHTML = flareInner(...last); }
const kpColor = k => k === null ? 'var(--muted)' : k < 4 ? '#3ecf8e' : k < 5 ? '#ffc233' : k < 6 ? '#ff9a3d' : k < 8 ? '#ff4d6d' : '#b06bff';

function flareInner(C, fmt) {
  const f = extra.flare, now = classFlux(f?.current_class), max = classFlux(f?.max_class);
  const safeClass = value => /^([ABCMX])(\d+(?:\.\d+)?)$/.test(value || '') ? value : '—';
  const pos = v => v === null ? 0 : Math.max(0, Math.min(100, (Math.log10(v) + 8) / 5 * 100));
  let curve = '';
  if (extra.xray?.length > 3) {
    const X = extra.xray, W = 600, H = 120, t0 = X[0].t, t1 = X[X.length - 1].t, Y = v => H - 8 - (Math.log10(Math.max(1e-9, v)) + 9) / 6 * (H - 16);
    const path = X.map((r, i) => `${i ? 'L' : 'M'}${((r.t - t0) / (t1 - t0 || 1) * W).toFixed(1)} ${Y(r.f).toFixed(1)}`).join(' ');
    const bands = ['A', 'B', 'C', 'M', 'X'].map((L, i) => `<line x1="0" x2="${W}" y1="${Y(10 ** (-8 + i))}" y2="${Y(10 ** (-8 + i))}" class="mx-grid"/><text x="${W - 4}" y="${Y(10 ** (-8 + i)) - 3}" text-anchor="end" class="mx-tick mx-strong">${L}</text>`).join('');
    curve = `<span class="label">${C.xray}</span><svg viewBox="0 0 ${W} ${H}" class="mx-chart mx-xray" preserveAspectRatio="none">${bands}<path d="${path}" class="mx-xline"/></svg>`;
  }
  return `<div class="mx-flarebar"><div class="mx-fscale">${['A', 'B', 'C', 'M', 'X'].map(L => `<span>${L}</span>`).join('')}</div>
    ${max !== null ? `<i class="mx-fmax" style="left:${pos(max).toFixed(1)}%" title="${C.flareMax}"></i>` : ''}${now !== null ? `<i class="mx-fnow" style="left:${pos(now).toFixed(1)}%"></i>` : ''}</div>
    <div class="env-pressure-stats"><div><span>${C.flareNow}</span><b class="mx-fclass">${safeClass(f?.current_class)}</b></div><div><span>${C.flareMax}</span><b>${safeClass(f?.max_class)}</b></div></div>${curve}`;
}

function render(data, options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'el', C = copy[lang], S = snapshot(data, options.now);
  const L = lang === 'el' ? 'el-GR' : 'en-GB', zone = options.zone || 'UTC';
  const fmt = (v, d = 0) => v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString(L, { maximumFractionDigits: d });
  const time = m => `<small class="env-meta">${m.time === null ? C.unavailable : `${C.at}: ${new Date(m.time).toLocaleString(L, { timeZone: zone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`}${m.value !== null && !m.fresh ? ` · <b>${C.stale}</b>` : ''}</small>`;
  const empty = !data ? C.loading : data.error ? C.failed : '';
  last = [C, fmt];
  ensureExtras(data, options.now);
  const kp = S.kp.fresh ? S.kp.value : null, g = S.scales.G.fresh ? S.scales.G.value : null;
  const lvl = kp === null && g === null ? null : (g ?? 0) >= 3 || (kp ?? 0) >= 7 ? 3 : (g ?? 0) >= 1 || (kp ?? 0) >= 5 ? 2 : (kp ?? 0) >= 4 ? 1 : 0;
  // Kp gauge
  const kpDeg = kp === null ? 0 : kp / 9 * 180;
  const segs = [[0, 4, '#3ecf8e'], [4, 5, '#ffc233'], [5, 6, '#ff9a3d'], [6, 8, '#ff4d6d'], [8, 9, '#b06bff']];
  const arc = (a, b) => { const p = v => { const t = Math.PI - v / 9 * Math.PI; return [60 + 48 * Math.cos(t), 60 - 48 * Math.sin(t)]; }; const [x0, y0] = p(a), [x1, y1] = p(b); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A48 48 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const gauge = `<svg viewBox="0 0 120 70" class="mx-kpg" aria-hidden="true">${segs.map(([a, b, c]) => `<path d="${arc(a, b)}" stroke="${c}" stroke-width="10" fill="none"/>`).join('')}<g transform="rotate(${(kpDeg - 90).toFixed(1)} 60 60)"><line x1="60" y1="60" x2="60" y2="18" class="mx-gneedle"/></g><circle cx="60" cy="60" r="5" class="mx-gcap"/></svg>`;
  // Kp chart: history + forecast (3-hour bars)
  const bars = [...S.history.map(r => ({ ...r, kind: 'observed' })), ...S.forecast];
  let kpChart = `<p class="env-meta">${C.unavailable}</p>`;
  if (bars.length) {
    const W = 960, H = 170, bw = W / bars.length, Y = v => H - 24 - v / 9 * (H - 40);
    const nowI = S.history.length;
    kpChart = `<svg viewBox="0 0 ${W} ${H}" class="mx-chart" preserveAspectRatio="none" role="img" aria-label="Kp">
      ${[3, 5, 7, 9].map(v => `<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" class="mx-grid"/><text x="${W - 2}" y="${Y(v) - 3}" text-anchor="end" class="mx-tick">${v === 5 ? 'G1 · 5' : v}</text>`).join('')}
      ${bars.map((r, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${Y(r.value).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${(H - 24 - Y(r.value)).toFixed(1)}" rx="2" fill="${kpColor(r.value)}" opacity="${r.kind === 'observed' ? 1 : 0.55}"><title>${new Date(r.time).toLocaleString(L, { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} · Kp ${fmt(r.value, 2)} · ${C[r.kind] || ''}</title></rect>`).join('')}
      ${nowI > 0 && nowI < bars.length ? `<line x1="${nowI * bw}" x2="${nowI * bw}" y1="4" y2="${H - 20}" class="mx-now"/>` : ''}
      ${bars.map((r, i) => new Date(r.time).getUTCHours() === 0 ? `<text x="${i * bw + 3}" y="${H - 6}" class="mx-tick mx-day">${new Date(r.time).toLocaleDateString(L, { timeZone: zone, weekday: 'short', day: 'numeric' })}</text>` : '').join('')}</svg>
      <div class="mx-legend"><span><i class="mx-sw" style="background:#3ecf8e"></i>${C.observed}</span><span><i class="mx-sw" style="background:#3ecf8e;opacity:.55"></i>${C.predicted}</span></div>`;
  }
  // aurora
  let aurora = '';
  if (Number.isFinite(options.lat) && Number.isFinite(options.lon)) {
    const ml = geomagLat(options.lat, options.lon), need = Math.min(9, Math.max(0, kpForHorizon(ml)));
    const kmax = Math.max(kp ?? 0, ...S.forecast.slice(0, 4).map(r => r.value));
    const chance = kmax >= need ? 2 : kmax >= need - 1 ? 1 : 0;
    const known = kp !== null || S.forecast.length > 0;
    aurora = `<article class="card env mx-aurora mx-ac${chance}"><h3 class="label">${C.aurora}</h3><div class="minivalue">Kp ${fmt(need, 1)}${need >= 9 ? '+' : ''}</div><b class="env-status">${known ? C.auroraMaybe[chance] : C.unavailable}</b>
      <div class="env-pressure-stats"><div><span>${C.auroraNeed}</span><b>${fmt(need, 1)}</b></div><div><span>${C.auroraNow}</span><b>${fmt(kp, 2)}</b></div><div><span>${C.mlat}</span><b>${fmt(ml, 1)}°</b></div></div>
      <p class="env-meta">${C.auroraNote}</p><a class="env-source" href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener">${C.auroraLink} ↗</a></article>`;
  }
  const wind = S.wind.value, bz = S.bz.value;
  const windW = wind === null ? null : wind < 350 ? 0 : wind < 500 ? 1 : wind < 700 ? 2 : 3, bzW = bz === null ? null : bz < -3 ? 0 : bz <= 3 ? 1 : 2;
  const meter = (v, a, b, cls) => `<div class="mx-meter ${cls}"><span style="left:${v === null ? 0 : Math.max(0, Math.min(100, (v - a) / (b - a) * 100)).toFixed(1)}%"></span></div>`;
  return `<section class="section space-section" id="space-weather"><p class="env-copy">${C.intro}</p>${empty ? `<p class="notice" role="status">${empty}</p>` : ''}
<div class="mx-spacehero mx-sh${lvl ?? 'x'}"><div class="mx-sunball" aria-hidden="true"></div><div><span class="label">${C.hero}</span><h2>${lvl === null ? C.unavailable : C.heroWords[lvl]}</h2><p class="env-meta">${C.heroSub}</p></div>
  <div class="mx-kpbox">${gauge}<div class="mx-kpval" style="color:${kpColor(kp)}">Kp ${fmt(kp, 2)}</div>${time(S.kp)}</div></div>
<div class="env-grid space-scales">${['G', 'R', 'S'].map(key => { const m = S.scales[key]; return `<article class="card env mx-scale mx-sc${m.value ?? 'x'}"><h3 class="label">${C.names[key]}</h3><div class="minivalue">${key}${fmt(m.value)} <small>/ 5</small></div><div class="mx-pips">${[1, 2, 3, 4, 5].map(i => `<i class="${(m.value ?? 0) >= i ? 'on' : ''}"></i>`).join('')}</div><b class="env-status">${m.value === null ? C.unavailable : m.fresh ? C.severity[m.value] : C.stale}</b><p class="env-copy">${C.notes[key]}</p>${time(m)}</article>`; }).join('')}</div>
<div class="mx-grid2 mx-mt">
  <article class="card env"><h3 class="label">${C.flare}</h3><div id="mx-flare">${flareInner(C, fmt)}</div><p class="env-meta">${C.flareNote}</p></article>
  <article class="card env"><h3 class="label">${C.outlook}</h3>${S.outlook.length ? `<table class="mx-outlook"><thead><tr><th></th>${S.outlook.map(o => `<th>${new Date(o.date + 'T12:00:00Z').toLocaleDateString(L, { weekday: 'short', day: 'numeric' })}</th>`).join('')}</tr></thead><tbody>
    ${[['r12', C.oR12, '%'], ['r35', C.oR35, '%'], ['s1', C.oS1, '%'], ['g', C.oG, 'G']].map(([k, lab, u]) => `<tr><th>${lab}</th>${S.outlook.map(o => { const v = o[k]; const hot = u === '%' ? (v ?? 0) >= 30 : (v ?? 0) >= 1; return `<td class="${hot ? 'hot' : ''}">${v === null ? '—' : u === 'G' ? (v ? 'G' + v : '—') : v + '%'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>` : `<p class="env-meta">${C.unavailable}</p>`}</article>
</div>
<article class="card env-forecast mx-block"><div class="panelhead"><h3>${C.kpChart}</h3><span class="env-meta">${C.kpNote}</span></div>${kpChart}</article>
<div class="space-metrics">
  <article class="card env"><h3 class="label">${C.wind}</h3><div class="minivalue">${fmt(wind)} <small>km/s</small></div>${meter(wind, 250, 900, 'mx-mwind')}<b class="env-status">${windW === null ? '—' : C.windWords[windW]}</b><p class="env-copy">${C.windNote}</p>${time(S.wind)}</article>
  <article class="card env"><h3 class="label">${C.bz}</h3><div class="minivalue">${fmt(bz, 1)} <small>nT</small></div>${meter(bz, -20, 20, 'mx-mbz')}<b class="env-status">${bzW === null ? '—' : C.bzWords[bzW]}</b><p class="env-copy">${C.bzNote}${S.bt.value !== null ? ` Bt ${fmt(S.bt.value, 1)} nT.` : ''}</p>${time(S.bz)}</article>
  <article class="card env"><h3 class="label">${C.flux}</h3><div class="minivalue">${fmt(S.flux.value)} <small>sfu</small></div>${meter(S.flux.value, 60, 250, 'mx-mflux')}<p class="env-copy">${C.fluxNote}</p>${time(S.flux)}</article>
  ${aurora || `<article class="card env"><h3 class="label">${C.kp}</h3><div class="minivalue">${fmt(kp, 2)}</div><p class="env-copy">${C.kpNote}</p>${time(S.kp)}</article>`}
</div>
<article class="card mx-block"><div class="panelhead"><h3>${C.live}</h3><span class="env-meta">${C.imgNote}</span></div>
  <div class="mx-suns">${IMGS.map((u, i) => `<a href="${u}" target="_blank" rel="noopener" class="mx-sunimg"><img src="${u}" alt="${C.imgs[i][0]}" loading="lazy" decoding="async"><span><b>${C.imgs[i][0]}</b><small>${C.imgs[i][1]}</small></span></a>`).join('')}</div></article>
<div class="env-weather-grid space-explain"><article class="card env"><h3>${C.ozone}</h3><p class="env-copy">${C.ozoneNote}</p><a class="env-source" href="https://ozonewatch.gsfc.nasa.gov/" target="_blank" rel="noopener">${C.ozoneLink} ↗</a></article>
  <article class="card env"><h3>${C.kp}</h3><p class="env-copy">${C.kpNote}</p><a class="env-source" href="https://www.swpc.noaa.gov/noaa-scales-explanation" target="_blank" rel="noopener">${C.scalesLink} ↗</a></article></div>
<p class="env-source">${C.source}</p></section>`;
}
/* Compact card for the Now page */
function miniCard(data, options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'el', C = copy[lang], S = snapshot(data, options.now);
  const L = lang === 'el' ? 'el-GR' : 'en-GB', fmt = (v, d = 0) => v === null || !Number.isFinite(v) ? '—' : v.toLocaleString(L, { maximumFractionDigits: d });
  ensureExtras(data, options.now);
  const kp = S.kp.fresh ? S.kp.value : null, g = S.scales.G.fresh ? S.scales.G.value : null;
  const lvl = kp === null && g === null ? null : (g ?? 0) >= 3 || (kp ?? 0) >= 7 ? 3 : (g ?? 0) >= 1 || (kp ?? 0) >= 5 ? 2 : (kp ?? 0) >= 4 ? 1 : 0;
  return `<div class="card env mx-spacemini mx-sh${lvl ?? 'x'}"><div class="minihead"><span class="label">${C.mini}</span><span class="mx-sunball sm" aria-hidden="true"></span></div><div class="minivalue" style="color:${kpColor(kp)}">Kp ${fmt(kp, 1)}</div><div class="mininote">${lvl === null ? C.unavailable : C.heroWords[lvl]}</div><div class="kvs"><span>G <b>${fmt(g)}</b></span><span>${lang === 'el' ? 'Έκλαμψη' : 'Flare'} <b>${fluxClass(classFlux(extra.flare?.current_class)) || '—'}</b></span><span>${lang === 'el' ? 'Άνεμος' : 'Wind'} <b>${fmt(S.wind.value)} km/s</b></span></div><small class="env-meta">NOAA SWPC</small></div>`;
}
const api = { snapshot, render, miniCard, utc, fetchDirect, geomagLat, fluxClass };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.MonoSpaceWeather = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
