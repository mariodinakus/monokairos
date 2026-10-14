#!/usr/bin/env node
/* MONO Weather → Telegram alerts.
 * Runs in GitHub Actions every 15 minutes (see .github/workflows/telegram-alerts.yml). No dependencies (Node ≥ 20).
 *   • rain starting soon / rain that started unannounced
 *   • forecast changes (rain, chance, max temperature) for today / tomorrow / the day after
 *   • model changes (a model's new run moves its rain or temperature a lot)
 *   • heavy rain, gales, thunderstorms; official Meteoalarm warnings
 *   • morning summary, evening outlook for tomorrow
 *   • commands: /now /rain /tomorrow /models /help /start /stop
 * Secrets: TELEGRAM_BOT_TOKEN (required to send), TELEGRAM_CHAT_ID (optional; otherwise the first chat that sends /start).
 * Without a token it runs as a dry run and prints the messages it would send.
 */
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(await readFile(path.join(DIR, 'config.json'), 'utf8'));
const STATE_DIR = path.join(DIR, '.state'), STATE_FILE = path.join(STATE_DIR, 'state.json');
const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const FIXED = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const DRY = !TOKEN, TEST = process.env.FORCE_TEST === 'true';
const NOW = Number(process.env.MONO_NOW) || Date.now();
const TZ = CFG.timezone || 'Europe/Athens';
const H = 3600e3;
const fin = Number.isFinite;
const log = (...a) => console.log(...a);

/* ------------------------------------------------------------------ state */
let S = { v: 1, offset: 0, chats: [], sent: {}, base: {}, mbase: {}, day: {} };
try { S = { ...S, ...JSON.parse(await readFile(STATE_FILE, 'utf8')) }; } catch { log('ℹ no previous state (first run)'); }
for (const [k, t] of Object.entries(S.sent)) if (NOW - t > 4 * 86400e3) delete S.sent[k];
const wasSent = (k, within = 1e15) => fin(S.sent[k]) && NOW - S.sent[k] < within;
const mark = k => (S.sent[k] = NOW);

/* ------------------------------------------------------------------ time & words */
const fmt = (t, o) => new Intl.DateTimeFormat('el-GR', { timeZone: TZ, ...o }).format(new Date(t));
const hm = t => fmt(t, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dkey = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
const lhour = t => +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const TODAY = dkey(NOW), dayIdx = t => Math.round((Date.parse(dkey(t)) - Date.parse(TODAY)) / 86400e3);
const dayName = t => { const i = dayIdx(t); return i === 0 ? 'σήμερα' : i === 1 ? 'αύριο' : fmt(t, { weekday: 'long' }); };
const at = t => { const i = dayIdx(t); return i === 0 ? `σήμερα στις ${hm(t)}` : i === 1 ? `αύριο στις ${hm(t)}` : `την ${fmt(t, { weekday: 'long' })} στις ${hm(t)}`; };
const dayLabelKey = k => { const i = Math.round((Date.parse(k) - Date.parse(TODAY)) / 86400e3); return i === 0 ? 'Σήμερα' : i === 1 ? 'Αύριο' : cap(new Date(k + 'T12:00:00Z').toLocaleDateString('el-GR', { weekday: 'long', timeZone: 'UTC' })); };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const nf = d => new Intl.NumberFormat('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
const num = (v, d = 0) => (fin(v) ? nf(d).format(v).replace(/^-0([,.]0+)?$/, '0') : '—');
const mm = v => (fin(v) ? (v < 0.05 ? '0' : num(v, v < 10 ? 1 : 0)) : '—');
const pct = p => (fin(p) ? `${Math.round(p * 100)}%` : '—');
const deg = t => (fin(t) ? `${num(Math.round(t))}°` : '—');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const mean = a => { const v = a.filter(fin); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const BINS = [0.1, 0.5, 2, 5, 10, 30];
const level = v => { if (!fin(v) || v < 0.1) return 0; let k = 0; BINS.forEach((b, j) => { if (v >= b) k = j + 1; }); return Math.min(6, k); };
const WORD = ['ξηρά', 'ψιχάλα', 'ασθενής βροχή', 'μέτρια βροχή', 'ισχυρή βροχή', 'νεροποντή', 'καταρρακτώδης βροχή'];
const PLAIN = ['', 'λίγες σταγόνες, μόλις βρέχει το έδαφος', 'ελαφριά βροχή — μια ομπρέλα αρκεί', 'κανονική βροχή — χωρίς ομπρέλα βρέχεσαι γρήγορα', 'δυνατή βροχή — λιμνούλες και νερά στους δρόμους', 'πολύ δυνατή βροχή — νερά στους δρόμους, οδήγησε αργά', 'εξαιρετικά έντονη — μακριά από ρέματα και υπόγεια'];
const probWord = p => (p < 0.1 ? 'απίθανη' : p < 0.3 ? 'λίγο πιθανή' : p < 0.6 ? 'πιθανή' : 'σχεδόν σίγουρη');
const totalWord = v => (v < 1 ? 'ελάχιστη' : v < 5 ? 'λίγη βροχή' : v < 15 ? 'αξιόλογη βροχή' : v < 40 ? 'πολλή βροχή' : 'πάρα πολλή βροχή');
const dur = ms => { const h = Math.round(ms / H * 2) / 2; return h < 1 ? `${Math.round(ms / 60e3)}′` : `${num(h, h % 1 ? 1 : 0)} ${h === 1 ? 'ώρα' : 'ώρες'}`; };
const inTxt = ms => { const m = Math.max(0, Math.round(ms / 60e3 / 15) * 15), h = Math.floor(m / 60), r = m % 60; return h ? `${h} ${h === 1 ? 'ώρα' : 'ώρες'}${r ? ` και ${r}′` : ''}` : `${r}′`; };
const WMO = { 0: 'αίθριος', 1: 'κυρίως αίθριος', 2: 'λίγα σύννεφα', 3: 'συννεφιά', 45: 'ομίχλη', 48: 'παγωμένη ομίχλη', 51: 'ψιχάλα', 53: 'ψιχάλα', 55: 'πυκνή ψιχάλα', 61: 'ασθενής βροχή', 63: 'βροχή', 65: 'ισχυρή βροχή', 66: 'παγωμένη βροχή', 67: 'παγωμένη βροχή', 71: 'λίγο χιόνι', 73: 'χιόνι', 75: 'πυκνό χιόνι', 77: 'χιονόκοκκοι', 80: 'μπόρες', 81: 'μπόρες', 82: 'ισχυρές μπόρες', 85: 'χιονοπτώσεις', 86: 'ισχυρές χιονοπτώσεις', 95: 'καταιγίδα', 96: 'καταιγίδα με χαλάζι', 99: 'καταιγίδα με χαλάζι' };

/* ------------------------------------------------------------------ network */
async function getJSON(url, tries = 3) {
  let last;
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'MONO-Weather-alerts (github.com/mariodinakus/monokairos)' } });
      const body = await r.json().catch(() => null);
      if (r.ok && !body?.error) return body;
      last = new Error(body?.reason || `HTTP ${r.status}`);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) { last = e; }
    await new Promise(res => setTimeout(res, 2000 * 3 ** k));
  }
  throw last;
}
const qs = o => new URLSearchParams(o).toString();
const OM = 'https://api.open-meteo.com/v1/forecast';

async function loadLocation(L) {
  const base = { latitude: L.lat, longitude: L.lon, timezone: TZ, timeformat: 'unixtime', forecast_days: 4 };
  const main = await getJSON(`${OM}?${qs({ ...base, current: 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m', hourly: 'precipitation,precipitation_probability,temperature_2m,weather_code,wind_gusts_10m', minutely_15: 'precipitation', forecast_minutely_15: 96, past_minutely_15: 4 })}`);
  const ids = CFG.models.map(m => m[0]);
  const models = {};
  const take = (d, id, suffix) => { const h = d.hourly; const P = h[`precipitation${suffix}`], T = h[`temperature_2m${suffix}`], G = h[`wind_gusts_10m${suffix}`]; if (!P || P.filter(fin).length < 24) return; models[id] = { t: h.time.map(x => x * 1000), P, T, G }; };
  try {
    const d = await getJSON(`${OM}?${qs({ ...base, models: ids.join(','), hourly: 'precipitation,temperature_2m,wind_gusts_10m' })}`);
    for (const id of ids) take(d, id, `_${id}`);
  } catch (e) {
    log('⚠ multi-model request failed, falling back per model:', e.message);
    await Promise.all(ids.map(async id => { try { take(await getJSON(`${OM}?${qs({ ...base, models: id, hourly: 'precipitation,temperature_2m,wind_gusts_10m' })}`, 2), id, ''); } catch {} }));
  }
  let warnings = [];
  if (L.meteoalarm) try { warnings = parseWarnings(await getJSON(`https://feeds.meteoalarm.org/api/v1/warnings/feeds-${L.meteoalarm}`, 2), L); } catch (e) { log('⚠ meteoalarm:', e.message); }
  return analyse(L, main, models, warnings);
}
function parseWarnings(d, L) {
  const out = [], areas = (L.warnAreas || []).map(a => a.toLowerCase());
  for (const w of d.warnings || []) {
    const infos = w.alert?.info || []; if (!infos.length) continue;
    const info = infos.find(i => (i.language || '').toLowerCase().startsWith('el')) || infos.find(i => (i.language || '').startsWith('en')) || infos[0];
    const exp = Date.parse(info.expires), on = Date.parse(info.onset || info.effective);
    if (fin(exp) && exp < NOW) continue;
    const lv = (info.parameter || []).find(p => p.valueName === 'awareness_level')?.value || '';
    const color = /red/i.test(lv) ? 'red' : /orange/i.test(lv) ? 'orange' : /yellow/i.test(lv) ? 'yellow' : null;
    if (!color) continue;
    const allAreas = infos.flatMap(i => (i.area || []).map(a => a.areaDesc)).filter(Boolean);
    const local = !areas.length || allAreas.some(a => areas.some(x => a.toLowerCase().includes(x) || x.includes(a.toLowerCase())));
    if (!local) continue;
    out.push({ id: w.alert?.identifier || `${info.event}|${on}`, event: info.event || info.headline, desc: info.description, on, exp, color, areas: [...new Set((info.area || []).map(a => a.areaDesc))] });
  }
  return out;
}

/* ------------------------------------------------------------------ analysis (same rules as the site's rain page) */
function analyse(L, W, models, warnings) {
  const times = W.hourly.time.map(x => x * 1000), N = times.length, ids = Object.keys(models);
  const idxOf = new Map(times.map((t, i) => [t, i]));
  const mv = {}; for (const id of ids) { const m = models[id], a = { P: Array(N).fill(null), T: Array(N).fill(null), G: Array(N).fill(null) }; m.t.forEach((t, j) => { const i = idxOf.get(t); if (i !== undefined) { a.P[i] = m.P[j]; a.T[i] = m.T?.[j]; a.G[i] = m.G?.[j]; } }); mv[id] = a; }
  const rows = times.map((t, i) => {
    const ps = ids.map(id => mv[id].P[i]).filter(fin);
    const frac = ps.length ? ps.filter(x => x >= 0.2).length / ps.length : null;
    const bm = fin(W.hourly.precipitation_probability?.[i]) ? W.hourly.precipitation_probability[i] / 100 : null;
    const pop = fin(frac) && fin(bm) ? 0.5 * frac + 0.5 * bm : fin(frac) ? frac : bm ?? 0;
    const amount = ps.length ? mean(ps) : W.hourly.precipitation?.[i] ?? 0;
    const sorted = [...ps].sort((a, b) => a - b), hi = sorted.length ? sorted[Math.floor(0.9 * (sorted.length - 1))] : null;
    const rate = amount > 0 ? Math.min(amount / Math.max(pop, 0.2), fin(hi) && hi > amount ? hi : Infinity) : 0;
    return { t, i, pop, amount, rate, temp: mean(ids.map(id => mv[id].T[i])) ?? W.hourly.temperature_2m?.[i], gust: W.hourly.wind_gusts_10m?.[i], code: W.hourly.weather_code?.[i] };
  });
  // hourly values at t cover [t − 1 h, t]
  const wet = r => r.pop >= 0.4 || (r.pop >= 0.25 && r.amount >= 0.3);
  const fut = rows.filter(r => r.t > NOW);
  const eps = []; let cur = null;
  for (const r of fut.slice(0, 72)) { if (!wet(r)) continue; if (cur && r.i - cur.i1 <= 3) cur.i1 = r.i; else { cur = { i0: r.i, i1: r.i }; eps.push(cur); } }
  const M15 = W.minutely_15 ? { t: W.minutely_15.time.map(x => x * 1000), p: W.minutely_15.precipitation } : null;
  const episodes = eps.map(({ i0, i1 }) => {
    const span = rows.slice(i0, i1 + 1);
    let start = rows[i0].t - H, end = rows[i1].t, refined = false;
    if (M15 && start < M15.t.at(-1)) {
      const sl = M15.t.map((t, j) => ({ t, p: M15.p[j] })).filter(o => o.t > start - H && o.t <= end + H && (o.p ?? 0) >= 0.05);
      if (sl.length) { const s = sl[0].t - 15 * 60e3, e = sl.at(-1).t; if (Math.abs(s - start) <= 90 * 60e3) { start = s; refined = true; } if (end <= M15.t.at(-1) && Math.abs(e - end) <= 90 * 60e3) end = e; }
    }
    const peak = span.reduce((a, r) => (r.rate > a.rate ? r : a), span[0]);
    const per = ids.map(id => span.reduce((a, r) => a + (mv[id].P[r.i] ?? 0), 0)).sort((a, b) => a - b);
    return { start, end, refined, pmax: Math.max(...span.map(r => r.pop)), mm: span.reduce((a, r) => a + r.amount, 0), peak, lo: per[Math.floor(0.1 * (per.length - 1))], hi: per[Math.ceil(0.9 * (per.length - 1))],
      storm: span.some(r => r.code >= 95), nModels: ids.length, agree: ids.filter(id => span.reduce((a, r) => a + (mv[id].P[r.i] ?? 0), 0) >= 0.5).length };
  }).filter(e => e.end > NOW);
  // days
  const days = {};
  for (const r of rows) { const k = dkey(r.t - H); (days[k] ||= []).push(r); }
  const dayStats = {}, modelDays = {};
  for (const [k, rs] of Object.entries(days)) {
    if (k < TODAY || rs.length < 20) continue;
    const perModel = {};
    for (const id of ids) { const P = rs.map(r => mv[id].P[r.i]), T = rs.map(r => mv[id].T[r.i]); if (P.filter(fin).length >= 20) perModel[id] = { mm: P.filter(fin).reduce((a, b) => a + b, 0), tmax: Math.max(...T.filter(fin)) }; }
    const pm = Object.values(perModel);
    const wetFrac = pm.length ? pm.filter(m => m.mm >= 1).length / pm.length : null;
    dayStats[k] = { mm: rs.reduce((a, r) => a + r.amount, 0), prob: mean([Math.max(...rs.map(r => r.pop)), wetFrac]), tmax: Math.max(...rs.map(r => r.temp).filter(fin)), tmin: Math.min(...rs.map(r => r.temp).filter(fin)),
      gust: Math.max(0, ...rs.map(r => r.gust).filter(fin)), storm: rs.some(r => r.code >= 95), wetModels: pm.filter(m => m.mm >= 1).length, nModels: pm.length };
    if (k === TODAY) { const fr = rs.filter(r => r.t > NOW); dayStats[k].rest = fr.length ? { mm: fr.reduce((a, r) => a + r.amount, 0), prob: Math.max(0, ...fr.map(r => r.pop)), gust: Math.max(0, ...fr.map(r => r.gust).filter(fin)), storm: fr.some(r => r.code >= 95) } : { mm: 0, prob: 0, gust: 0, storm: false }; }
    modelDays[k] = perModel;
  }
  let nowRate = null;
  if (M15) { const j = M15.t.findIndex(t => t > NOW); const v = [M15.p[j - 1], M15.p[j]].filter(fin); if (v.length) nowRate = Math.max(...v) * 4; }
  return { L, key: L.name, rows, fut, episodes, dayStats, modelDays, ids, current: W.current, nowRate, warnings };
}

/* ------------------------------------------------------------------ message builders */
const link = (A, page = 'rain') => `<a href="${CFG.site}/#${page}">Άνοιγμα στο MONO</a>`;
function episodeLines(e) {
  const lv = level(e.peak.rate);
  return [
    `Από <b>${at(e.start)}</b> έως <b>${at(e.end)}</b> (${dur(e.end - e.start)}).`,
    `Πιθανότητα <b>${pct(e.pmax)}</b> (${probWord(e.pmax)}) · σύνολο <b>~${mm(e.mm)} mm</b>${e.hi - e.lo >= 0.5 ? ` (μοντέλα ${mm(e.lo)}–${mm(e.hi)} mm)` : ''} — ${totalWord(e.mm)}.`,
    `Πιο έντονη γύρω στις ${hm(e.peak.t - 1800e3)}: <b>${WORD[lv]}</b>, ~${mm(e.peak.rate)} mm/ώρα${PLAIN[lv] ? ` (${PLAIN[lv]})` : ''}.`,
    `${e.storm ? '⚡ Πιθανές καταιγίδες. ' : ''}Συμφωνούν ${e.agree}/${e.nModels} μοντέλα.`
  ];
}
function statusText(A) {
  const c = A.current || {}, e0 = A.episodes[0], lines = [`📍 <b>${esc(A.L.name)}</b> · ${hm(NOW)}`];
  lines.push(`Τώρα ${deg(c.temperature_2m)}, ${WMO[c.weather_code] || '—'} · άνεμος ${num(c.wind_speed_10m)} km/h (ριπές ${num(c.wind_gusts_10m)})`);
  if (fin(A.nowRate) && A.nowRate >= 0.2) lines.push(`🌧 Βρέχει τώρα: ${WORD[level(A.nowRate)]} (~${mm(A.nowRate)} mm/ώρα).${e0 && e0.start <= NOW ? ` Σταματά περίπου ${at(e0.end)}.` : ''}`);
  else if (e0 && e0.start - NOW <= 24 * H) lines.push(`☂ Βροχή σε ${inTxt(e0.start - NOW)} (${at(e0.start)}), μέχρι ${at(e0.end)} · ~${mm(e0.mm)} mm · ${pct(e0.pmax)}`);
  else if (e0) lines.push(`☀ Χωρίς βροχή τις επόμενες 24 ώρες· η επόμενη φαίνεται ${at(e0.start)}.`);
  else lines.push('☀ Χωρίς βροχή τις επόμενες 3 ημέρες.');
  return lines.join('\n');
}
function dayText(A, k) {
  const D = A.dayStats[k]; if (!D) return `${dayLabelKey(k)}: —`;
  const d = D.rest ? { ...D, ...D.rest } : D, label = D.rest ? `${dayLabelKey(k)} (από τώρα)` : dayLabelKey(k);
  const rain = d.mm >= 0.5 || d.prob >= 0.4 ? `🌧 βροχή ${pct(d.prob)} · ~${mm(d.mm)} mm${D.rest ? '' : ` (${d.wetModels}/${d.nModels} μοντέλα)`}` : '☀ χωρίς ουσιαστική βροχή';
  return `<b>${label}</b>: 🌡 ${deg(D.tmin)} → ${deg(D.tmax)} · ${rain}${d.gust >= 50 ? ` · 💨 ριπές ${num(d.gust)} km/h` : ''}${d.storm ? ' · ⚡ καταιγίδες' : ''}`;
}
function rainText(A) {
  if (!A.episodes.length) return `☀ <b>${esc(A.L.name)}</b>: καμία βροχή στις επόμενες 72 ώρες.\n${link(A)}`;
  return [`🌧 <b>${esc(A.L.name)} — βροχή επόμενες 72 ώρες</b>`, ...A.episodes.slice(0, 4).map((e, i) => `\n<b>${i + 1}.</b> ${episodeLines(e).join('\n')}`), '', link(A)].join('\n');
}
function modelsText(A) {
  const ks = Object.keys(A.modelDays).slice(0, 3);
  const name = Object.fromEntries(CFG.models);
  const lines = [`🧭 <b>${esc(A.L.name)} — τι λέει κάθε μοντέλο</b> (βροχή mm / μέγιστη)`];
  lines.push(`<code>${'μοντέλο'.padEnd(13)}${ks.map(k => dayLabelKey(k).slice(0, 6).padStart(11)).join('')}</code>`);
  for (const id of A.ids) lines.push(`<code>${(name[id] || id).slice(0, 12).padEnd(13)}${ks.map(k => { const m = A.modelDays[k]?.[id]; return (m ? `${mm(m.mm)}/${deg(m.tmax)}` : '—').padStart(11); }).join('')}</code>`);
  lines.push('', ...ks.map(k => dayText(A, k)), '', link(A, 'models'));
  return lines.join('\n');
}

/* ------------------------------------------------------------------ alert rules */
function rules(A) {
  const out = [], key = A.key, C = CFG.changes, R = CFG.rain;
  // 1. rain soon / rain started
  const e0 = A.episodes[0];
  if (e0 && e0.pmax >= R.minProb && e0.mm >= R.minMm) {
    const tag = `rain:${key}:${Math.round(e0.start / (3 * H))}`, tag2 = `rain:${key}:${Math.round(e0.start / (3 * H)) - 1}`, tag3 = `rain:${key}:${Math.round(e0.start / (3 * H)) + 1}`;
    const seen = wasSent(tag) || wasSent(tag2) || wasSent(tag3);
    if (!seen && e0.start - NOW <= R.soonHours * H && e0.start - NOW > -45 * 60e3) {
      out.push({ tag, text: [`🌧 <b>${esc(A.L.name)}: βροχή σε ${inTxt(e0.start - NOW)}</b>`, ...episodeLines(e0), '☂ Πάρε ομπρέλα.', link(A)].join('\n') });
    } else if (!seen && fin(A.nowRate) && A.nowRate >= 0.3 && e0.start <= NOW + 30 * 60e3) {
      out.push({ tag, text: [`🌧 <b>${esc(A.L.name)}: ξεκίνησε βροχή</b> (${WORD[level(A.nowRate)]})`, ...episodeLines(e0), link(A)].join('\n') });
    }
  } else if (fin(A.nowRate) && A.nowRate >= 0.5 && !wasSent(`surprise:${key}`, 3 * H)) {
    out.push({ tag: `surprise:${key}`, text: `🌦 <b>${esc(A.L.name)}: βρέχει απρόσμενα</b> — ${WORD[level(A.nowRate)]} (~${mm(A.nowRate)} mm/ώρα). Τα μοντέλα δεν έδιναν σημαντική βροχή.\n${link(A)}` });
  }
  // 2. forecast changes + model changes (baseline = what was last reported)
  const base = (S.base[key] ||= {}), mbase = (S.mbase[key] ||= {});
  for (const k of Object.keys(base)) if (k < TODAY) delete base[k];
  for (const k of Object.keys(mbase)) if (k < TODAY) delete mbase[k];
  const name = Object.fromEntries(CFG.models), changes = [], mchanges = [];
  for (const k of Object.keys(A.dayStats).slice(0, 3)) {
    const d = A.dayStats[k], b = base[k];
    if (!b) { base[k] = { mm: d.mm, prob: d.prob, tmax: d.tmax }; }
    else {
      const parts = [];
      if (Math.abs(d.mm - b.mm) >= C.dayMmDelta && Math.abs(d.mm - b.mm) >= 0.5 * Math.max(b.mm, d.mm)) parts.push(`βροχή <b>${mm(d.mm)} mm</b> (ήταν ${mm(b.mm)})`);
      if (Math.abs(d.prob - b.prob) >= C.dayProbDelta && (d.prob >= 0.5) !== (b.prob >= 0.5)) parts.push(`πιθανότητα <b>${pct(d.prob)}</b> (ήταν ${pct(b.prob)})`);
      if (Math.abs(d.tmax - b.tmax) >= C.tempDelta) parts.push(`μέγιστη <b>${deg(d.tmax)}</b> (ήταν ${deg(b.tmax)})`);
      if (parts.length) { changes.push(`• ${dayLabelKey(k)}: ${parts.join(', ')}`); base[k] = { mm: d.mm, prob: d.prob, tmax: d.tmax }; }
    }
    const mb = (mbase[k] ||= {}), dayM = [];
    for (const [id, m] of Object.entries(A.modelDays[k] || {})) {
      const o = mb[id];
      if (!o) { mb[id] = { ...m }; continue; }
      const p = [];
      if (Math.abs(m.mm - o.mm) >= C.modelMmDelta) p.push(`${mm(o.mm)}→<b>${mm(m.mm)} mm</b>`);
      if (Math.abs(m.tmax - o.tmax) >= C.modelTempDelta) p.push(`${deg(o.tmax)}→<b>${deg(m.tmax)}</b>`);
      if (p.length) { dayM.push({ w: Math.abs(m.mm - o.mm) + Math.abs(m.tmax - o.tmax), t: `${esc(name[id] || id)} ${p.join(', ')}` }); mb[id] = { ...m }; }
    }
    if (dayM.length) { dayM.sort((a, b) => b.w - a.w); mchanges.push(`• ${dayLabelKey(k)}: ${dayM.slice(0, 4).map(x => x.t).join(' · ')}${dayM.length > 4 ? ` (+${dayM.length - 4} ακόμη)` : ''}`); }
  }
  if ((changes.length || mchanges.length) && !wasSent(`chg:${key}`, C.cooldownHours * H)) {
    const ks = Object.keys(A.dayStats).slice(0, 3);
    out.push({ tag: `chg:${key}`, text: [
      changes.length ? `🔄 <b>${esc(A.L.name)}: άλλαξε η πρόγνωση</b>` : `🧭 <b>${esc(A.L.name)}: νέα τρεξίματα μοντέλων</b>`,
      ...changes, ...(mchanges.length ? [changes.length ? '\n<b>Μοντέλα που άλλαξαν:</b>' : '', ...mchanges].filter(Boolean) : []),
      '', ...ks.map(k => dayText(A, k)), '', link(A)].join('\n') });
  } else if (changes.length || mchanges.length) { /* inside cooldown: baselines already moved, the next message will carry the new picture */ }
  // 3. severe weather (next 2 days)
  for (const k of Object.keys(A.dayStats).slice(0, 2)) {
    const d = A.dayStats[k];
    if (d.mm >= CFG.severe.dayMm && !wasSent(`heavy:${key}:${k}`)) out.push({ tag: `heavy:${key}:${k}`, loud: true, text: `🌊 <b>${esc(A.L.name)}: πολλή βροχή ${dayLabelKey(k).toLowerCase()}</b>\n~${mm(d.mm)} mm (${d.wetModels}/${d.nModels} μοντέλα δίνουν βροχή) — ${totalWord(d.mm)}. Πρόσεχε σε υπόγεια, ρέματα και χαμηλά σημεία.\n${link(A)}` });
    if (d.gust >= CFG.severe.gust && !wasSent(`gust:${key}:${k}`)) out.push({ tag: `gust:${key}:${k}`, loud: true, text: `💨 <b>${esc(A.L.name)}: θυελλώδεις ριπές ${dayLabelKey(k).toLowerCase()}</b>\nΡιπές έως ${num(d.gust)} km/h. Μάζεψε ό,τι μπορεί να πετάξει από μπαλκόνια.\n${link(A, 'phen')}` });
    if (d.storm && !wasSent(`storm:${key}:${k}`)) out.push({ tag: `storm:${key}:${k}`, text: `⚡ <b>${esc(A.L.name)}: πιθανές καταιγίδες ${dayLabelKey(k).toLowerCase()}</b>\n${dayText(A, k)}\n${link(A, 'phen')}` });
  }
  // 4. official warnings
  const COLOR = { yellow: '🟡 Κίτρινη', orange: '🟠 Πορτοκαλί', red: '🔴 Κόκκινη' };
  for (const w of A.warnings) {
    const tag = `warn:${w.id}`; if (wasSent(tag)) continue;
    out.push({ tag, loud: w.color !== 'yellow', text: `⚠️ <b>${COLOR[w.color]} προειδοποίηση: ${esc(w.event)}</b>\n${esc(w.areas.slice(0, 4).join(', '))}\nΑπό ${at(w.on)} έως ${at(w.exp)}${w.desc ? `\n${esc(String(w.desc).slice(0, 300))}` : ''}\n(Meteoalarm / ΕΜΥ)` });
  }
  // 5. morning summary + evening outlook
  const hr = lhour(NOW), dayTag = TODAY;
  if (hr >= CFG.dailySummaryHour && hr < CFG.dailySummaryHour + 2 && S.day[`am:${key}`] !== dayTag) {
    S.day[`am:${key}`] = dayTag;
    out.push({ tag: `am:${key}:${dayTag}`, text: [`☀️ <b>Καλημέρα! ${esc(A.L.name)}</b>`, statusText(A).split('\n').slice(1).join('\n'), '', ...Object.keys(A.dayStats).slice(0, 2).map(k => dayText(A, k)), '', link(A, 'now')].join('\n') });
  }
  if (hr >= CFG.eveningOutlookHour && hr < CFG.eveningOutlookHour + 2 && S.day[`pm:${key}`] !== dayTag) {
    S.day[`pm:${key}`] = dayTag;
    const k = Object.keys(A.dayStats)[1];
    if (k) out.push({ tag: `pm:${key}:${dayTag}`, text: [`🌙 <b>${esc(A.L.name)} — αύριο</b>`, dayText(A, k), ...A.episodes.filter(e => dkey(e.start) === k || dkey(e.end) === k).slice(0, 2).map(e => `🌧 ${at(e.start)} → ${at(e.end)} · ~${mm(e.mm)} mm · ${pct(e.pmax)}`), link(A, 'now')].join('\n') });
  }
  return out;
}

/* ------------------------------------------------------------------ Telegram */
async function tg(method, body) {
  if (DRY) return null;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) log(`⚠ telegram ${method}: ${j.description || r.status}`);
  return j;
}
const quiet = () => { const [a, b] = CFG.quietHours || []; const h = lhour(NOW); return fin(a) && fin(b) && (a > b ? h >= a || h < b : h >= a && h < b); };
const outbox = [];
async function send(chat, text, opts = {}) {
  outbox.push(text);
  if (DRY) return;
  await tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: !!opts.silent });
}
const chats = () => (FIXED.length ? FIXED : S.chats);
const allowed = id => (FIXED.length ? FIXED.includes(String(id)) : S.chats.includes(String(id)) || CFG.allowNewSubscribers || !S.chats.length);
const HELP = ['<b>MONO Weather</b> — ειδοποιήσεις για βροχή, αλλαγές πρόγνωσης και μοντέλων, προειδοποιήσεις.', '', '/now — καιρός τώρα και επόμενη βροχή', '/rain — βροχή επόμενες 72 ώρες', '/tomorrow — αύριο', '/models — τι λέει κάθε μοντέλο', '/stop — σταμάτα τις ειδοποιήσεις', '', 'Οι απαντήσεις έρχονται στον επόμενο έλεγχο (κάθε ~15 λεπτά).'].join('\n');

/* ------------------------------------------------------------------ main */
const results = [];
for (const L of CFG.locations) {
  try { results.push(await loadLocation(L)); log(`✓ ${L.name}: ${Object.keys(results.at(-1).modelDays[TODAY] || {}).length} models, ${results.at(-1).episodes.length} rain episodes, ${results.at(-1).warnings.length} warnings`); }
  catch (e) { log(`✗ ${L.name}: ${e.message}`); }
}
// commands
if (!DRY) {
  const u = await tg('getUpdates', { offset: S.offset, timeout: 0, allowed_updates: ['message'] });
  for (const up of u?.result || []) {
    S.offset = up.update_id + 1;
    const m = up.message; if (!m?.text) continue;
    const id = String(m.chat.id), cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
    if (cmd === '/start') {
      if (!allowed(id)) { await send(id, 'Αυτό το bot είναι ιδιωτικό.'); continue; }
      if (!S.chats.includes(id)) S.chats.push(id);
      log(`ℹ subscribed chat ${id}`);
      await send(id, `✅ Εγγράφηκες στις ειδοποιήσεις.\n\n${HELP}`);
      for (const A of results) await send(id, statusText(A));
      continue;
    }
    if (!allowed(id) || !(FIXED.includes(id) || S.chats.includes(id))) continue;
    if (cmd === '/stop') { S.chats = S.chats.filter(c => c !== id); await send(id, 'Οι ειδοποιήσεις σταμάτησαν. Στείλε /start για να ξαναρχίσουν.'); continue; }
    for (const A of results) {
      if (cmd === '/now' || cmd === '/tora') await send(id, `${statusText(A)}\n\n${Object.keys(A.dayStats).slice(0, 2).map(k => dayText(A, k)).join('\n')}\n${link(A, 'now')}`);
      else if (cmd === '/rain' || cmd === '/vroxi') await send(id, rainText(A));
      else if (cmd === '/tomorrow' || cmd === '/avrio') { const k = Object.keys(A.dayStats)[1]; await send(id, `${dayText(A, k)}\n${A.episodes.filter(e => dkey(e.start) === k).map(e => `🌧 ${at(e.start)} → ${at(e.end)} · ~${mm(e.mm)} mm · ${pct(e.pmax)}`).join('\n')}`); }
      else if (cmd === '/models' || cmd === '/montela') await send(id, modelsText(A));
      else { await send(id, HELP); break; }
    }
  }
}
// alerts
const silent = quiet();
for (const A of results) {
  const msgs = rules(A);
  if (TEST) msgs.unshift({ tag: `test:${NOW}`, text: `✅ <b>Δοκιμή MONO → Telegram</b>\n${statusText(A)}\n\n${Object.keys(A.dayStats).slice(0, 3).map(k => dayText(A, k)).join('\n')}` });
  if (!chats().length && !DRY) { log('ℹ no chat yet — send /start to the bot from Telegram'); continue; }
  for (const m of msgs) {
    for (const c of DRY ? ['dry-run'] : chats()) await send(c, m.text, { silent: silent && !m.loud });
    mark(m.tag);
  }
  if (!msgs.length) log(`· ${A.key}: nothing new to send`);
}
// report + save
const report = outbox.length ? outbox.map(t => t.replace(/<[^>]+>/g, '')).join('\n\n———\n\n') : '(κανένα μήνυμα)';
log(`\n${DRY ? 'DRY RUN (no TELEGRAM_BOT_TOKEN) — would send:' : `sent ${outbox.length} message(s) to ${chats().length} chat(s)`}\n\n${report}`);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### MONO → Telegram ${DRY ? '(dry run)' : ''}\n\n\`\`\`\n${report}\n\`\`\`\n`).catch(() => {});
await mkdir(STATE_DIR, { recursive: true });
await writeFile(STATE_FILE, JSON.stringify(S));
