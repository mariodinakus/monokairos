/* MONO Weather v4 — Air, pollen & allergies, UV, pollutants vs WHO guidelines.
 * Regional CAMS forecasts via Open-Meteo. No personal health data leaves the browser;
 * the allergen picker is stored only in this browser (localStorage). */
(function (root) {
'use strict';
const finite = v => Number.isFinite(v) && v >= 0;
// Descriptive concentration bands, not individual allergy/symptom thresholds.
const POLLEN = { grass: [10, 50], olive: [50, 200], birch: [15, 90], alder: [15, 90], mugwort: [10, 50], ragweed: [5, 20] };
const CURRENT = 'european_aqi,us_aqi,pm10,pm2_5,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,dust,uv_index,uv_index_clear_sky,aerosol_optical_depth';
const HOURLY = CURRENT + ',carbon_dioxide,' + Object.keys(POLLEN).map(k => k + '_pollen').join(',');
const band = v => !finite(v) ? null : v <= 20 ? 0 : v <= 40 ? 1 : v <= 60 ? 2 : v <= 80 ? 3 : v <= 100 ? 4 : 5;
const uvBand = v => !finite(v) ? null : v < 3 ? 0 : v < 6 ? 1 : v < 8 ? 2 : v < 11 ? 3 : 4;
const pollenLevel = (key, v) => !finite(v) ? null : v >= POLLEN[key][1] ? 2 : v >= POLLEN[key][0] ? 1 : 0;
// WHO 2021 air quality guideline levels (24-h mean; ozone: 8-h peak), μg/m³
const WHO = { pm2_5: 15, pm10: 45, nitrogen_dioxide: 25, sulphur_dioxide: 40, carbon_monoxide: 4000, ozone: 100 };
const LS = 'mono_allergens';

function snapshot(data, now = Date.now()) {
  const H = data?.hourly || {}, times = H.time || [], sec = now / 1000;
  const index = times.findIndex(t => Number.isFinite(t) && t <= sec && t + 3600 > sec);
  const current = data?.current || {};
  const currentValid = Number.isFinite(current.time) && current.time <= sec && current.time + 5400 > sec;
  const value = key => currentValid && finite(current[key]) ? current[key] : index >= 0 && finite(H[key]?.[index]) ? H[key][index] : null;
  const at = (key, i) => finite(H[key]?.[i]) ? H[key][i] : null;
  const rows = times.map((t, i) => ({ t, aqi: at('european_aqi', i), pm: at('pm2_5', i), i }))
    .filter(r => Number.isFinite(r.t) && r.t + 3600 > sec && r.t < sec + 86400);
  const rows72 = times.map((t, i) => ({ t, i, aqi: at('european_aqi', i), pm: at('pm2_5', i), uv: at('uv_index', i), dust: at('dust', i),
    pollen: Object.fromEntries(Object.keys(POLLEN).map(k => [k, at(k + '_pollen', i)])) }))
    .filter(r => Number.isFinite(r.t) && r.t + 3600 > sec && r.t < sec + 72 * 3600);
  const pollen = Object.entries(POLLEN).map(([key, thresholds]) => {
    const values = rows.map(r => H[key + '_pollen']?.[r.i]).filter(finite);
    const max = values.length ? Math.max(...values) : null;
    return { key, max, level: max === null ? null : max >= thresholds[1] ? 2 : max >= thresholds[0] ? 1 : 0, hours: values.length, now: value(key + '_pollen') };
  });
  let best = null;
  for (let i = 0; i <= rows.length - 3; i++) {
    const w = rows.slice(i, i + 3);
    if (w[0].t < sec || !w.every((r, j) => finite(r.aqi) && r.t === w[0].t + j * 3600)) continue;
    const mean = w.reduce((sum, r) => sum + r.aqi, 0) / 3;
    if (!best || mean < best.mean) best = { start: w[0].t, end: w[2].t + 3600, mean };
  }
  const validRows = rows.filter(r => finite(r.aqi));
  const mean24 = key => { const v = rows.map(r => H[key]?.[r.i]).filter(finite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const peak24 = key => { const v = rows.map(r => H[key]?.[r.i]).filter(finite); return v.length ? Math.max(...v) : null; };
  return { value, time: currentValid ? current.time : index >= 0 ? times[index] : null, rows, rows72, pollen, best, mean24, peak24,
    worst: validRows.length ? Math.max(...validRows.map(r => r.aqi)) : null,
    co2Time: index >= 0 && finite(H.carbon_dioxide?.[index]) ? times[index] : null };
}

const copy = {
  el: {
    air: 'Ποιότητα αέρα τώρα', bands: ['Καλή', 'Σχετικά καλή', 'Μέτρια', 'Κακή', 'Πολύ κακή', 'Εξαιρετικά κακή'],
    unavailable: 'Μη διαθέσιμο', loading: 'Φόρτωση περιβαλλοντικών δεδομένων…', failed: 'Τα δεδομένα αέρα δεν φορτώθηκαν. Δοκίμασε την Ανανέωση.',
    at: 'Ώρα δεδομένων', pollen: 'Γύρη & αλλεργίες', next: 'Επόμενο 24ωρο', peak: 'Μέγιστη ωριαία συγκέντρωση', grains: 'κόκκοι/m³',
    names: { grass: 'Αγρωστώδη', olive: 'Ελιά', birch: 'Σημύδα', alder: 'Σκλήθρα', mugwort: 'Αρτεμισία', ragweed: 'Αμβροσία' }, levels: ['Χαμηλή', 'Μέτρια', 'Υψηλή'],
    emoji: { grass: '🌾', olive: '🫒', birch: '🌳', alder: '🌲', mugwort: '🌿', ragweed: '🌼' },
    polNote: 'Η αντίδραση διαφέρει ανά άτομο και είδος γύρης. Η χαμηλή συγκέντρωση δεν αποκλείει συμπτώματα. Η γύρη παρέχεται κυρίως στην Ευρώπη, στην εποχή της.',
    scale: 'Πώς διαβάζω τις ενδείξεις;', scaleNote: 'Ενδεικτικές ζώνες συγκέντρωσης της εφαρμογής (μέτρια / υψηλή, κόκκοι/m³), όχι κλινικός δείκτης αλλεργίας:',
    mine: 'Οι αλλεργίες μου', mineHint: 'Πάτα τα είδη που σε επηρεάζουν — αποθηκεύονται μόνο σε αυτή τη συσκευή.',
    mineNone: 'Δεν έχεις διαλέξει είδη. Δείχνω όλα τα είδη.', mineNow: 'Για τα δικά σου είδη, το επόμενο 24ωρο:',
    mineVerdict: ['Ήρεμο 24ωρο για τις αλλεργίες σου', 'Πρόσεχε — μέτρια γύρη στα είδη σου', 'Υψηλή γύρη στα είδη σου'],
    pollenMap: 'Γύρη ώρα με την ώρα', pollenMapSub: 'Επόμενες 72 ώρες · ★ = οι αλλεργίες σου',
    outdoor: 'Δείκτης υπαίθρου', outdoorSub: 'Αέρας + γύρη + UV, ώρα με την ώρα · επόμενο 24ωρο', bestOut: 'Καλύτερο τρίωρο για έξω',
    outdoorWords: ['Ιδανικά για έξω', 'Καλά, με μικρή προσοχή', 'Με προσοχή', 'Καλύτερα λιγότερη έκθεση'],
    outdoorNote: 'Συνδυάζει ποιότητα αέρα (EAQI), γύρη (τα είδη σου, αλλιώς όλα) και UV τις ώρες με ήλιο. Είναι εργαλείο σύγκρισης ωρών, όχι ιατρική οδηγία.',
    uv: 'Δείκτης UV', uvBands: ['Χαμηλός', 'Μέτριος', 'Υψηλός', 'Πολύ υψηλός', 'Ακραίος'],
    uvAdvice: ['Δεν χρειάζεται ιδιαίτερη προστασία.', 'Γυαλιά και αντηλιακό αν μένεις ώρα έξω.', 'Αντηλιακό, καπέλο, σκιά τις μεσημεριανές ώρες.', 'Απόφυγε τον ήλιο 11:00–16:00, πλήρης προστασία.', 'Μείνε σε σκιά τις μεσημεριανές ώρες, πλήρης προστασία.'],
    uvClear: 'Με καθαρό ουρανό θα ήταν', uvPeak: 'Μέγιστο 24ώρου',
    atmosphere: 'Ατμόσφαιρα περιοχής', co2: 'Διοξείδιο του άνθρακα', co2Note: 'Υπαίθριο CO₂ από μοντέλο CAMS. Δεν μετρά το CO₂ μέσα στο σπίτι και δεν συμμετέχει στον EAQI.',
    dust: 'Αφρικανική σκόνη', dustNote: 'Πρόβλεψη σκόνης κοντά στο έδαφος, όχι μέτρηση σταθμού.', aod: 'Θολότητα (AOD)', aodNote: 'Οπτικό βάθος αερολυμάτων: >0,3 θολός ουρανός, >0,7 πολύ θολός (σκόνη, καπνός).',
    usaqi: 'US AQI', pollutants: 'Ρύποι αναλυτικά', units: 'μg/m³ · μπάρα = μέσος 24ώρου σε σχέση με το όριο ΠΟΥ',
    pollutantNames: ['Λεπτά σωματίδια', 'Αιωρούμενα σωματίδια', 'Όζον', 'Διοξείδιο αζώτου', 'Διοξείδιο θείου', 'Μονοξείδιο άνθρακα'],
    who: 'όριο ΠΟΥ', whoX: '× όριο ΠΟΥ', whoNote: 'Όρια ΠΟΥ 2021: μέσος όρος 24ώρου (όζον: 8ωρο). Η σύγκριση είναι ενδεικτική, με πρόγνωση μοντέλου.',
    forecast: 'Ο αέρας ώρα με την ώρα', forecastNote: 'EAQI · επόμενες 72 ώρες, τοπική ώρα', worst: 'Μέγιστος EAQI 24ώρου', best: 'Τρίωρο με τον καθαρότερο αέρα',
    bestNote: 'Σύγκριση μόνο ρύπανσης αέρα.', partial: 'Οι διαθέσιμες ώρες μπορεί να είναι λιγότερες.',
    source: 'Εκτίμηση και πρόγνωση περιοχής από CAMS / Open-Meteo, όχι ζωντανός τοπικός αισθητήρας. Ανάλυση ~11 km στην Ευρώπη και ~45 km παγκοσμίως. Το CO₂ προέρχεται από ξεχωριστό μοντέλο αερίων θερμοκηπίου.',
    docs: 'Πηγή & κάλυψη δεδομένων', guidance: 'Οδηγίες EEA', whoLink: 'Όρια ΠΟΥ',
    advice: ['Η ποιότητα αέρα ευνοεί τις υπαίθριες δραστηριότητες.', 'Οι συνήθεις υπαίθριες δραστηριότητες μπορούν να συνεχιστούν.', 'Αν έχεις αναπνευστική ευαισθησία και νιώθεις ενόχληση, μείωσε την έντονη άσκηση έξω.', 'Μείωσε την έντονη δραστηριότητα έξω, ιδιαίτερα αν έχεις αναπνευστική ευαισθησία.', 'Περιόρισε την έντονη δραστηριότητα έξω. Οι ευαίσθητες ομάδες καλό είναι να την αποφεύγουν.', 'Απόφυγε την έντονη δραστηριότητα έξω. Οι ευαίσθητες ομάδες καλό είναι να περιορίσουν την υπαίθρια έκθεση.']
  },
  en: {
    air: 'Air quality now', bands: ['Good', 'Fair', 'Moderate', 'Poor', 'Very poor', 'Extremely poor'],
    unavailable: 'Unavailable', loading: 'Loading environmental data…', failed: 'Air data could not load. Try Refresh.',
    at: 'Data time', pollen: 'Pollen & allergies', next: 'Next 24 hours', peak: 'Peak hourly concentration', grains: 'grains/m³',
    names: { grass: 'Grass', olive: 'Olive', birch: 'Birch', alder: 'Alder', mugwort: 'Mugwort', ragweed: 'Ragweed' }, levels: ['Low', 'Moderate', 'High'],
    emoji: { grass: '🌾', olive: '🫒', birch: '🌳', alder: '🌲', mugwort: '🌿', ragweed: '🌼' },
    polNote: 'Reactions vary by person and pollen type. Low concentrations do not rule out symptoms. Pollen is mainly available in Europe during the season.',
    scale: 'How to read the levels', scaleNote: 'Indicative app concentration bands (moderate / high, grains/m³), not a clinical allergy index:',
    mine: 'My allergies', mineHint: 'Tap the types that affect you — stored only on this device.',
    mineNone: 'No types selected. Showing all types.', mineNow: 'For your types, next 24 hours:',
    mineVerdict: ['Calm 24 hours for your allergies', 'Heads up — moderate pollen in your types', 'High pollen in your types'],
    pollenMap: 'Pollen hour by hour', pollenMapSub: 'Next 72 hours · ★ = your allergies',
    outdoor: 'Outdoor index', outdoorSub: 'Air + pollen + UV, hour by hour · next 24 hours', bestOut: 'Best three hours outside',
    outdoorWords: ['Perfect for outdoors', 'Good, minor caution', 'Use caution', 'Better to limit exposure'],
    outdoorNote: 'Combines air quality (EAQI), pollen (your types, otherwise all) and UV during sunlit hours. A tool to compare hours, not medical advice.',
    uv: 'UV index', uvBands: ['Low', 'Moderate', 'High', 'Very high', 'Extreme'],
    uvAdvice: ['No special protection needed.', 'Sunglasses and sunscreen if outside for long.', 'Sunscreen, hat, shade around midday.', 'Avoid sun 11:00–16:00, full protection.', 'Stay in shade around midday, full protection.'],
    uvClear: 'With clear sky it would be', uvPeak: '24-hour peak',
    atmosphere: 'Local atmosphere', co2: 'Carbon dioxide', co2Note: 'Outdoor CO₂ from the CAMS model. It does not measure indoor CO₂ and is not part of EAQI.',
    dust: 'Saharan dust', dustNote: 'Forecast near-surface dust, not a station measurement.', aod: 'Haze (AOD)', aodNote: 'Aerosol optical depth: >0.3 hazy sky, >0.7 very hazy (dust, smoke).',
    usaqi: 'US AQI', pollutants: 'Pollutants in detail', units: 'μg/m³ · bar = 24-hour mean relative to the WHO guideline',
    pollutantNames: ['Fine particles', 'Particulate matter', 'Ozone', 'Nitrogen dioxide', 'Sulphur dioxide', 'Carbon monoxide'],
    who: 'WHO guideline', whoX: '× WHO guideline', whoNote: 'WHO 2021 guidelines: 24-hour mean (ozone: 8-hour). The comparison is indicative, using model forecasts.',
    forecast: 'Air quality by hour', forecastNote: 'EAQI · next 72 hours, local time', worst: 'Highest EAQI in 24 h', best: 'Three hours with the cleanest air',
    bestNote: 'Air pollution comparison only.', partial: 'Fewer hours may be available.',
    source: 'Regional CAMS / Open-Meteo model estimates and forecasts, not a live local sensor. Resolution ~11 km in Europe, ~45 km globally. CO₂ uses a separate greenhouse gas model.',
    docs: 'Data source & coverage', guidance: 'EEA guidance', whoLink: 'WHO guidelines',
    advice: ['Air quality supports outdoor activities.', 'Normal outdoor activities can continue.', 'If you are sensitive to air pollution and feel symptoms, reduce strenuous outdoor activity.', 'Reduce strenuous outdoor activity, especially if you are sensitive to air pollution.', 'Limit strenuous outdoor activity. Sensitive groups should avoid it.', 'Avoid strenuous outdoor activity. Sensitive groups should limit outdoor exposure.']
  }
};

/* ------------------------------------------------------------ allergen picker (this browser only) */
function readMine() { try { const v = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(v) ? v.filter(k => POLLEN[k]) : []; } catch { return []; } }
function writeMine(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} }
let lastArgs = null;
if (typeof document !== 'undefined' && !root.__mxEnvBound) {
  root.__mxEnvBound = true;
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-mxe="allergen"]'); if (!b) return;
    const k = b.dataset.k, mine = readMine(); const i = mine.indexOf(k);
    if (i >= 0) mine.splice(i, 1); else mine.push(k);
    writeMine(mine);
    if (lastArgs) { const el = document.getElementById('mx-allergy-wrap'); if (el) el.innerHTML = allergyInner(...lastArgs); const o = document.getElementById('mx-outdoor-wrap'); if (o) o.innerHTML = outdoorInner(...lastArgs); }
  });
}

/* ------------------------------------------------------------ pieces */
function helpers(lang, zone) {
  const L = lang === 'el' ? 'el-GR' : 'en-GB';
  return {
    fmt: (v, digits = 0) => finite(v) ? v.toLocaleString(L, { maximumFractionDigits: digits, useGrouping: false }) : '—',
    date: t => new Date(t * 1000).toLocaleString(L, { timeZone: zone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
    hour: t => new Date(t * 1000).toLocaleTimeString(L, { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }),
    hnum: t => +new Date(t * 1000).toLocaleString('en-GB', { timeZone: zone, hour: '2-digit', hour12: false }).slice(0, 2) % 24,
    day: t => new Date(t * 1000).toLocaleDateString(L, { timeZone: zone, weekday: 'short', day: 'numeric' })
  };
}
function hourHazard(r, mine) {
  const keys = mine.length ? mine : Object.keys(POLLEN);
  const pl = keys.map(k => pollenLevel(k, r.pollen[k])).filter(v => v !== null);
  const parts = [];
  const b = band(r.aqi); if (b !== null) parts.push(Math.min(1, b / 4));
  if (pl.length) parts.push(Math.max(...pl) / 2);
  const u = uvBand(r.uv); if (u !== null && r.uv >= 1) parts.push(u / 4);
  if (!parts.length) return null;
  return Math.max(...parts) * 0.75 + parts.reduce((a, x) => a + x, 0) / parts.length * 0.25;
}
const hazardWord = h => h === null ? null : h < 0.2 ? 0 : h < 0.4 ? 1 : h < 0.65 ? 2 : 3;

function outdoorInner(S, C, H) {
  const mine = readMine(), rows = S.rows72.slice(0, 24);
  const hz = rows.map(r => hourHazard(r, mine));
  if (!hz.some(v => v !== null)) return `<p class="env-meta">${C.unavailable}</p>`;
  let best = null;
  for (let i = 0; i + 2 < rows.length; i++) { const w = hz.slice(i, i + 3); if (w.some(v => v === null)) continue; const m = (w[0] + w[1] + w[2]) / 3; if (!best || m < best.m) best = { i, m }; }
  const nowW = hazardWord(hz.find(v => v !== null));
  const cells = rows.map((r, i) => { const w = hazardWord(hz[i]); return `<div class="mx-oc mx-o${w ?? 'x'}${best && i >= best.i && i < best.i + 3 ? ' mx-obest' : ''}" title="${H.hour(r.t)} · ${w === null ? C.unavailable : C.outdoorWords[w]}"><span>${H.hnum(r.t)}</span></div>`; }).join('');
  return `<div class="mx-outnow mx-o${nowW ?? 'x'}"><span class="mx-outdot"></span><b>${nowW === null ? C.unavailable : C.outdoorWords[nowW]}</b></div>
    <div class="mx-ostrip">${cells}</div>
    ${best ? `<p class="mx-obestline"><span class="label">${C.bestOut}</span> <b>${H.hour(rows[best.i].t)} → ${H.hour(rows[best.i].t + 3 * 3600)}</b></p>` : ''}
    <p class="env-meta">${C.outdoorNote}</p>`;
}
function allergyInner(S, C, H) {
  const mine = readMine(), chosen = mine.length ? S.pollen.filter(p => mine.includes(p.key)) : [];
  const lv = chosen.map(p => p.level).filter(v => v !== null);
  const verdict = lv.length ? Math.max(...lv) : null;
  const chips = Object.keys(POLLEN).map(k => `<button type="button" class="mx-achip${mine.includes(k) ? ' on' : ''}" data-mxe="allergen" data-k="${k}" aria-pressed="${mine.includes(k)}"><span>${C.emoji[k]}</span>${C.names[k]}</button>`).join('');
  const rows = S.pollen.slice().sort((a, b) => (mine.includes(b.key) - mine.includes(a.key)) || ((b.level ?? -1) - (a.level ?? -1))).map(p => {
    const pctW = p.max === null ? 0 : Math.min(100, p.max / POLLEN[p.key][1] * 100);
    return `<div class="mx-prow${mine.includes(p.key) ? ' mine' : ''}"><span class="mx-pname">${C.emoji[p.key]} ${C.names[p.key]}${mine.includes(p.key) ? ' <i>★</i>' : ''}</span>
      <div class="mx-pbar"><span class="mx-pl${p.level ?? 'x'}" style="width:${Math.max(p.max === null ? 0 : 3, pctW).toFixed(0)}%"></span></div>
      <b>${H.fmt(p.max, 1)}</b><span class="mx-plev mx-pl${p.level ?? 'x'}t">${p.level === null ? C.unavailable : C.levels[p.level]}</span></div>`;
  }).join('');
  return `<div class="mx-mine"><span class="label">${C.mine}</span><div class="mx-achips">${chips}</div><small class="env-meta">${mine.length ? C.mineNow : C.mineHint}</small>
    ${mine.length ? `<div class="mx-verdict mx-v${verdict ?? 'x'}">${verdict === null ? C.unavailable : C.mineVerdict[verdict]}</div>` : `<small class="env-meta">${C.mineNone}</small>`}</div>
    <div class="mx-plist"><div class="mx-phead env-meta"><span></span><span>${C.peak}</span><span>${C.grains}</span><span></span></div>${rows}</div>`;
}
function pollenMap(S, C, H) {
  const mine = readMine(), rows = S.rows72;
  if (!rows.some(r => Object.values(r.pollen).some(v => v !== null))) return `<p class="env-meta">${C.unavailable}</p>`;
  const keys = Object.keys(POLLEN).sort((a, b) => mine.includes(b) - mine.includes(a));
  const head = rows.map(r => { const h = H.hnum(r.t); return `<span class="${h === 0 ? 'mx-pd' : ''}">${h === 0 ? H.day(r.t) : h % 6 === 0 ? String(h).padStart(2, '0') : ''}</span>`; }).join('');
  return `<div id="mx-pmap-scroll" class="mx-pmap" style="--n:${rows.length}"><div class="mx-pmrow mx-pmhead"><span></span><div>${head}</div></div>
    ${keys.map(k => `<div class="mx-pmrow${mine.includes(k) ? ' mine' : ''}"><span>${C.emoji[k]} ${C.names[k]}${mine.includes(k) ? ' ★' : ''}</span><div>${rows.map(r => { const v = r.pollen[k], l = pollenLevel(k, v); return `<i class="mx-pl${l ?? 'x'}" style="--o:${l === null ? 0.25 : l === 0 ? 0.35 + Math.min(0.4, v / POLLEN[k][0] * 0.4) : 1}" title="${H.day(r.t)} ${H.hour(r.t)} · ${C.names[k]} ${H.fmt(v, 1)} ${C.grains}"></i>`; }).join('')}</div></div>`).join('')}</div>`;
}
function aqBars(S, C, H) {
  const rows = S.rows72; if (!rows.some(r => finite(r.aqi))) return '';
  const W = 960, Hh = 150, bw = W / rows.length, max = Math.max(60, ...rows.map(r => r.aqi ?? 0));
  let bars = '', ticks = '';
  rows.forEach((r, i) => {
    const b = band(r.aqi), h = finite(r.aqi) ? r.aqi / max * (Hh - 34) : 0, x = i * bw;
    bars += `<rect x="${(x + 1).toFixed(1)}" y="${(Hh - 22 - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" class="aqfill aq${b ?? 'x'}"><title>${H.day(r.t)} ${H.hour(r.t)} · EAQI ${H.fmt(r.aqi)} · ${b === null ? C.unavailable : C.bands[b]} · PM2.5 ${H.fmt(r.pm, 1)}</title></rect>`;
    const hn = H.hnum(r.t);
    if (hn === 0) ticks += `<line x1="${x}" x2="${x}" y1="0" y2="${Hh - 18}" class="mx-daysep"/><text x="${x + 4}" y="10" class="mx-tick mx-day">${H.day(r.t)}</text>`;
    else if (hn % 6 === 0) ticks += `<text x="${x + bw / 2}" y="${Hh - 4}" text-anchor="middle" class="mx-tick">${String(hn).padStart(2, '0')}</text>`;
  });
  const g = [20, 40, 60, 80, 100].filter(v => v <= max).map(v => `<line x1="0" x2="${W}" y1="${(Hh - 22 - v / max * (Hh - 34)).toFixed(1)}" y2="${(Hh - 22 - v / max * (Hh - 34)).toFixed(1)}" class="mx-grid"/><text x="${W - 2}" y="${(Hh - 25 - v / max * (Hh - 34)).toFixed(1)}" text-anchor="end" class="mx-tick">${v}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${Hh}" class="mx-chart" preserveAspectRatio="none" role="img" aria-label="EAQI">${g}${ticks}${bars}</svg>`;
}
function uvCard(S, C, H) {
  const uv = S.value('uv_index'), clear = S.value('uv_index_clear_sky'), b = uvBand(uv), peak = S.peak24('uv_index');
  const pct = Math.min(100, (uv ?? 0) / 11 * 100);
  return `<article class="card env mx-uv"><div class="minihead"><h3 class="label">${C.uv}</h3><span class="mx-uvbadge mx-u${b ?? 'x'}">${b === null ? '—' : C.uvBands[b]}</span></div>
    <div class="minivalue">${H.fmt(uv, 1)}</div>
    <div class="mx-uvscale"><span class="mx-uvdot" style="left:${pct.toFixed(1)}%"></span></div>
    <p class="env-copy">${b === null ? C.unavailable : C.uvAdvice[b]}</p>
    <div class="env-pressure-stats"><div><span>${C.uvPeak}</span><b>${H.fmt(peak, 1)}</b></div><div><span>${C.uvClear}</span><b>${H.fmt(clear, 1)}</b></div></div></article>`;
}

/* ------------------------------------------------------------ render */
function render(data, options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'el', C = copy[lang], S = snapshot(data, options.now), zone = options.zone || 'UTC', H = helpers(lang, zone);
  lastArgs = [S, C, H];
  const e = S.value('european_aqi'), b = band(e), co2 = S.value('carbon_dioxide'), aod = S.value('aerosol_optical_depth');
  const time = t => t !== null ? `${C.at}: ${H.date(t)}` : C.unavailable;
  const pollutants = [['pm2_5', 'PM2.5'], ['pm10', 'PM10'], ['ozone', 'O₃'], ['nitrogen_dioxide', 'NO₂'], ['sulphur_dioxide', 'SO₂'], ['carbon_monoxide', 'CO']];
  const empty = data?.error ? C.failed : !data ? C.loading : '';
  const gaugeDeg = finite(e) ? Math.min(100, e) / 100 * 180 : 0;
  const guide = lang === 'el' ? {
    title: 'Οδηγός περιβαλλοντικών ενδείξεων',
    sub: 'Τι σημαίνει κάθε αριθμός και πότε χρειάζεται προσοχή. Πάτησε κάθε ένδειξη για σύντομη εξήγηση.',
    note: 'Οι τιμές προέρχονται κυρίως από προγνωστικά μοντέλα περιοχής, όχι από αισθητήρα στη διεύθυνσή σου. Δεν αποτελούν ιατρική διάγνωση.',
    items: [
      ['EAQI', 'Ευρωπαϊκός δείκτης ποιότητας αέρα', '0–20 καλή · 21–40 σχετικά καλή · 41–60 μέτρια · 61–80 κακή · 81–100 πολύ κακή · πάνω από 100 εξαιρετικά κακή. Όσο χαμηλότερος, τόσο καλύτερα.'],
      ['US AQI', 'Αμερικανικός δείκτης αέρα', 'Εναλλακτική κλίμακα ποιότητας αέρα (0–50 καλή, 51–100 μέτρια, 101+ αυξανόμενη επιβάρυνση). Δεν συγκρίνεται αριθμητικά απευθείας με τον EAQI.'],
      ['Γύρη', 'Πιθανή έκθεση σε αλλεργιογόνα', 'Κόκκοι ανά κυβικό μέτρο αέρα (κόκκοι/m³) για ελιά, αγρωστώδη κ.ά. Οι αντιδράσεις διαφέρουν ανά άνθρωπο και φυτό.'],
      ['Δείκτης υπαίθρου', 'Πότε είναι προτιμότερο να βγεις', 'Ενδεικτικός συνδυασμός ποιότητας αέρα, γύρης και ηλιακής UV. Συγκρίνει ώρες, δεν είναι επίσημος ιατρικός δείκτης.'],
      ['UV', 'Ένταση υπεριώδους ακτινοβολίας', '0–2 χαμηλή · 3–5 μέτρια · 6–7 υψηλή · 8–10 πολύ υψηλή · 11+ ακραία. Όσο ανεβαίνει, αυξάνεται η ανάγκη αντηλιακής προστασίας.'],
      ['CO₂', 'Διοξείδιο άνθρακα έξω', 'Μονάδα ppm (μέρη ανά εκατομμύριο). Προέρχεται από ατμοσφαιρικό μοντέλο, όχι από μέτρηση μέσα στο σπίτι.'],
      ['Σκόνη & AOD', 'Αφρικανική σκόνη και θολότητα', 'Η σκόνη κοντά στο έδαφος εμφανίζεται σε μg/m³. Το AOD είναι αδιάστατος δείκτης θολότητας όλης της ατμοσφαιρικής στήλης, όχι συγκέντρωση σκόνης στο έδαφος.'],
      ['PM2.5 / PM10', 'Μικροσκοπικά αιωρούμενα σωματίδια', 'PM2.5: διάμετρος έως 2,5 μm · PM10: έως 10 μm. Μετρώνται σε μg/m³· η χαμηλότερη έκθεση είναι γενικά προτιμότερη.'],
      ['O₃ / NO₂ / SO₂ / CO', 'Αέριοι ατμοσφαιρικοί ρύποι', 'O₃: όζον χαμηλής ατμόσφαιρας · NO₂: διοξείδιο αζώτου · SO₂: διοξείδιο θείου · CO: μονοξείδιο άνθρακα. Όλα εμφανίζονται σε μg/m³.'],
      ['Στρώματα νεφών', 'Χαμηλά, μεσαία, υψηλά', 'Χαμηλά συνήθως έως ~2 km, μεσαία ~2–6 km, υψηλά πάνω από ~6 km. Τα ποσοστά τους επικαλύπτονται: δεν τα προσθέτουμε.'],
      ['Επίπεδα hPa', 'Η πίεση δείχνει το ύψος στην ατμόσφαιρα', '1000 hPa κοντά στη θάλασσα, 850 hPa περίπου 1,5 km, 700 hPa περίπου 3 km, 500 hPa περίπου 5,5 km και 300 hPa περίπου 9 km. Τα υψόμετρα μεταβάλλονται.'],
      ['Κατακόρυφο προφίλ', 'Τι συμβαίνει από το έδαφος προς τα πάνω', 'Δείχνει θερμοκρασία (°C), υγρασία (%) και άνεμο (km/h) ανά επίπεδο πίεσης. Δεν είναι τα φυσικά στρώματα τροπόσφαιρας/στρατόσφαιρας.'],
      ['CAPE / LI / CIN', 'Ενέργεια και αστάθεια καταιγίδας', 'CAPE: διαθέσιμη ενέργεια ανοδικών ρευμάτων (J/kg). Αρνητικός LI υποδηλώνει πιθανή αστάθεια. CIN: αναστολή της ανόδου. Κανένα μόνο του δεν προβλέπει καταιγίδα.'],
      ['Βαρομετρικά / αεροχείμαρρος', 'Υ/Χ, 500 hPa και ισχυροί άνεμοι', 'Υ/Χ: υψηλή/χαμηλή πίεση. Στα 500 hPa (~5,5 km) διακρίνονται αυλώνες και ράχες. Αεροχείμαρρος: ζώνη πολύ ισχυρών ανέμων ψηλά.'],
      ['Όρια ΠΟΥ', 'Σύγκριση με κατευθυντήριες τιμές', 'Οι μπάρες συγκρίνουν προβλεπόμενη έκθεση με οδηγίες του ΠΟΥ για καθορισμένες περιόδους μέσου όρου. Δεν είναι ζωντανή μέτρηση ούτε άμεση διάγνωση κινδύνου.']
    ]
  } : {
    title: 'Environmental indicators explained',
    sub: 'What each number means and when to take care. Tap an indicator for a quick explanation.',
    note: 'Values mainly come from regional forecast models, not a sensor at your address. They are not medical diagnoses.',
    items: [
      ['EAQI', 'European Air Quality Index', '0–20 good · 21–40 fair · 41–60 moderate · 61–80 poor · 81–100 very poor · over 100 extremely poor. Lower is better.'],
      ['US AQI', 'US Air Quality Index', 'An alternative scale (0–50 good, 51–100 moderate, 101+ increasing pollution concern). Do not compare its numbers directly with EAQI.'],
      ['Pollen', 'Potential allergen exposure', 'Grains per cubic metre of air (grains/m³), including olive and grass. Sensitivity varies by person and species.'],
      ['Outdoor index', 'Better times to go outside', 'An indicative combination of air quality, pollen and UV. Helps compare hours; not an official medical index.'],
      ['UV', 'Ultraviolet exposure', '0–2 low · 3–5 moderate · 6–7 high · 8–10 very high · 11+ extreme. Higher values call for greater sun protection.'],
      ['CO₂', 'Outdoor carbon dioxide', 'Shown in ppm (parts per million). Modelled outdoor concentration, not a measurement inside your home.'],
      ['Dust & AOD', 'Saharan dust and haze', 'Near-surface dust in μg/m³. AOD measures total-column atmospheric haze; it is not ground-level dust concentration.'],
      ['PM2.5 / PM10', 'Airborne fine particles', 'Particles up to 2.5 μm / 10 μm across. Concentrations in μg/m³; lower exposure is generally preferable.'],
      ['O₃ / NO₂ / SO₂ / CO', 'Gaseous air pollutants', 'Ground-level ozone, nitrogen dioxide, sulphur dioxide and carbon monoxide, each shown in μg/m³.'],
      ['Cloud layers', 'Low, middle and high clouds', 'Low clouds usually form below ~2 km; middle clouds roughly 2–6 km; high clouds above ~6 km. Their percentages overlap and do not add up.'],
      ['hPa levels', 'Pressure levels up through the sky', '1000 hPa is near sea level, 850 hPa around 1.5 km, 700 hPa around 3 km, 500 hPa around 5.5 km and 300 hPa around 9 km. Altitude varies with weather.'],
      ['Vertical profile', 'Temperature, humidity and wind with height', 'The plot shows temperatures in °C, humidity (%) and wind speed (km/h) at different pressure levels, not separate physical layers of the atmosphere.'],
      ['CAPE / LI / CIN', 'Storm potential and resistance', 'CAPE = energy for upward motion (J/kg); more may support strong convection. LI below zero often indicates instability; CIN is a barrier to rising air. None alone predicts a storm.'],
      ['Pressure / jet stream', 'Highs, lows and fast winds aloft', 'H/L on the map indicate pressure systems; 500 hPa shows upper-air troughs and ridges. A jet stream is a band of strong wind aloft.'],
      ['WHO guidelines', 'Context for pollutant bars', 'Bars compare forecast concentrations against WHO guideline levels defined for specific averaging periods, not against instantaneous safe/unsafe cutoffs.']
    ]
  };
  const guideHtml = `<section class="mx-env-guide" aria-label="${guide.title}" style="margin-bottom:18px;padding:clamp(16px,2vw,24px);border:1px solid var(--border,rgba(140,160,180,.2));border-radius:20px;background:var(--card,rgba(127,150,170,.06))">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px"><span aria-hidden="true" style="font-size:23px">🌍</span><h2 style="margin:0;font-size:clamp(19px,2vw,24px);letter-spacing:-.03em">${guide.title}</h2></div>
    <p class="env-meta" style="margin:0 0 16px">${guide.sub}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:9px">
      ${guide.items.map(([abbr,title,desc]) => `<details style="min-width:0;border:1px solid var(--border,rgba(140,160,180,.18));border-radius:12px;padding:12px;background:var(--bg,rgba(127,150,170,.045))"><summary style="cursor:pointer;list-style:revert;font-weight:700;line-height:1.5"><span style="font-weight:800">${abbr}</span><span style="display:block;font-size:12px;font-weight:450;opacity:.78">${title}</span></summary><p style="font-size:13px;line-height:1.65;margin:10px 0 0">${desc}</p></details>`).join('')}
    </div><p class="env-meta" style="margin:13px 0 0;font-size:12px">${guide.note}</p>
  </section>`;
  return `${guideHtml}<div class="env-air-layout mx-airtop">
  <article class="card env env-air mx-aircard mx-ab${b ?? 'x'}"><div class="minihead"><h3 class="label">${C.air}</h3><span class="aqdot aq${b ?? 'x'}"></span></div>
    <div class="mx-gauge"><svg viewBox="0 0 120 70" aria-hidden="true"><defs><linearGradient id="mx-aqg" x1="0" x2="1"><stop offset="0" stop-color="var(--aq0)"/><stop offset=".25" stop-color="var(--aq1)"/><stop offset=".5" stop-color="var(--aq2)"/><stop offset=".7" stop-color="var(--aq3)"/><stop offset=".85" stop-color="var(--aq4)"/><stop offset="1" stop-color="var(--aq5)"/></linearGradient></defs>
      <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="url(#mx-aqg)" stroke-width="10" stroke-linecap="round"/>
      <g transform="rotate(${(gaugeDeg - 90).toFixed(1)} 60 62)"><line x1="60" y1="62" x2="60" y2="20" class="mx-gneedle"/></g><circle cx="60" cy="62" r="5" class="mx-gcap"/></svg>
      <div class="mx-gval">${H.fmt(e)} <small>EAQI</small></div></div>
    <b class="env-status">${b === null ? C.unavailable : C.bands[b]}</b>
    <p class="env-copy">${empty || (b === null ? C.unavailable : C.advice[b])}</p>
    <div class="env-pressure-stats"><div><span>${C.usaqi}</span><b>${H.fmt(S.value('us_aqi'))}</b></div></div>
    <small class="env-meta">${time(S.time)}</small>
    <details id="env-aqi-help" class="env-explain"><summary>EAQI · 0–100+</summary><p>${C.bands.map((label, i) => `${i === 5 ? '>100' : `${i * 20}–${(i + 1) * 20}`}: ${label}`).join(' · ')}</p></details>
  </article>
  <article class="card env env-allergies mx-allergy"><div class="minihead"><h3 class="label">${C.pollen}</h3><span class="env-tag">${C.next}</span></div>
    <div id="mx-allergy-wrap">${allergyInner(S, C, H)}</div>
    <details id="env-pollen-help" class="env-explain"><summary>${C.scale}</summary><p>${C.polNote}</p><p>${C.scaleNote} ${Object.entries(POLLEN).map(([k, v]) => `${C.names[k]} ${v.join(' / ')}`).join(' · ')}.</p></details>
  </article>
  <article class="card env mx-outdoor"><div class="minihead"><h3 class="label">${C.outdoor}</h3><span class="env-tag">${C.next}</span></div><small class="env-meta">${C.outdoorSub}</small>
    <div id="mx-outdoor-wrap">${outdoorInner(S, C, H)}</div></article>
</div>
<article class="card env-forecast mx-block"><div class="panelhead"><h3>${C.pollenMap}</h3><span class="env-meta">${C.pollenMapSub}</span></div>${pollenMap(S, C, H)}
  <div class="mx-legend"><span><i class="mx-sw mx-pl0"></i>${C.levels[0]}</span><span><i class="mx-sw mx-pl1"></i>${C.levels[1]}</span><span><i class="mx-sw mx-pl2"></i>${C.levels[2]}</span><span><i class="mx-sw mx-plx"></i>${C.unavailable}</span></div></article>
<div class="mx-grid3">
  ${uvCard(S, C, H)}
  <article class="card env env-atmosphere"><h3 class="label">${C.atmosphere}</h3><div class="env-gas-title"><b>CO₂</b><span>${C.co2}</span></div><div class="minivalue">${H.fmt(co2)} <small>ppm</small></div><small class="env-meta">${time(S.co2Time)}</small><p class="env-copy">${C.co2Note}</p></article>
  <article class="card env"><h3 class="label">${C.dust}</h3><div class="minivalue">${H.fmt(S.value('dust'), 1)} <small>μg/m³</small></div><p class="env-meta">${C.dustNote}</p>
    <div class="env-dust"><span class="label">${C.aod}</span><strong>${H.fmt(aod, 2)}</strong><p class="env-meta">${C.aodNote}</p></div></article>
</div>
<article class="card env-pollutants mx-block"><div class="panelhead"><h3>${C.pollutants}</h3><span class="env-meta">${C.units}</span></div><div class="env-pollutant-grid mx-polgrid">${pollutants.map(([key, symbol], i) => {
    const m = key === 'ozone' ? S.peak24(key) : S.mean24(key), ratio = finite(m) ? m / WHO[key] : null, r = ratio === null ? 0 : Math.min(2, ratio);
    return `<div><b>${symbol}</b><span>${C.pollutantNames[i]}</span><strong>${H.fmt(S.value(key), 1)}</strong><small>μg/m³</small>
      <div class="mx-who" title="${C.who}: ${WHO[key]} μg/m³"><span class="${ratio === null ? '' : ratio > 1 ? 'over' : ratio > 0.5 ? 'mid' : 'ok'}" style="width:${(r / 2 * 100).toFixed(0)}%"></span><i></i></div>
      <small class="mx-whot">${ratio === null ? '—' : `${H.fmt(ratio, 1)} ${C.whoX}`}</small></div>`; }).join('')}</div><p class="env-meta">${C.whoNote}</p></article>
<article class="card env-forecast mx-block"><div class="panelhead"><h3>${C.forecast}</h3><span class="env-meta">${C.forecastNote}</span></div>
  <div class="env-forecast-summary"><div><span class="label">${C.worst}</span><strong>${H.fmt(S.worst)} <small>EAQI</small></strong></div><div><span class="label">${C.best}</span><strong>${S.best ? `${H.date(S.best.start)} → ${H.hour(S.best.end)}` : C.unavailable}</strong><small>${C.bestNote}</small></div></div>
  ${S.rows.length ? aqBars(S, C, H) : `<p class="env-copy">${empty || C.unavailable}</p>`}
  <p class="env-meta">${C.partial}</p></article>
<p class="env-source">${C.source} <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener">${C.docs} ↗</a> · <a href="https://airindex.eea.europa.eu/AQI/index.html" target="_blank" rel="noopener">${C.guidance} ↗</a> · <a href="https://www.who.int/publications/i/item/9789240034228" target="_blank" rel="noopener">${C.whoLink} ↗</a></p>`;
}
const api = { CURRENT, HOURLY, POLLEN, WHO, band, uvBand, snapshot, render };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.MonoEnvironment = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
