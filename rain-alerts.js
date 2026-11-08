/* Device rain alerts: "rain starting soon" from Open-Meteo's 15-minute forecast.
   Shared by the page and the service worker (importScripts). No server, no push
   service: alerts are checked while MONO is open or kept in the background, and by
   Periodic Background Sync where the browser grants it to an installed app. */
(function (root) {
  'use strict';
  const MIN = 60e3, STEP = 15 * MIN, fin = Number.isFinite;
  const WET = 0.1, EPISODE = 0.3, LOOKAHEAD = 60 * MIN, GAP = 90 * MIN;
  const STORE = 'mono-alerts', CONFIG = '/__mono/alerts/config', LAST = '/__mono/alerts/last';

  // Normalise an Open-Meteo response (or the page's state.rain15) to {t[], amount[], at}.
  function feed(src) {
    const m = src?.minutely_15;
    const t = m?.time ? m.time.map(x => x * 1000) : src?.t;
    if (!Array.isArray(t)) return null;
    const rain = m ? m.rain : src.rain, showers = m ? m.showers : src.showers, precip = m ? m.precipitation : (src.precipitation || src.p);
    const amount = t.map((_, i) => fin(rain?.[i]) && fin(showers?.[i]) ? rain[i] + showers[i] : fin(precip?.[i]) ? precip[i] : null);
    return { t, amount };
  }

  // Values are accumulated over the 15 minutes ENDING at each timestamp.
  function detect({ data, now = Date.now(), last = null } = {}) {
    const f = feed(data); if (!f || !fin(now)) return null;
    const periods = f.t.map((t, i) => ({ start: t - STEP, end: t, mm: f.amount[i] })).filter(p => fin(p.end));
    const current = periods.find(p => p.start <= now && now < p.end), previous = periods.find(p => p.end <= now && now - p.end < STEP);
    if (!current || !fin(current.mm)) return null;
    if (current.mm >= WET || (fin(previous?.mm) && previous.mm >= WET)) return null; // already raining
    const first = periods.find(p => p.start > now - STEP && p.start <= now + LOOKAHEAD && fin(p.mm) && p.mm >= WET && p !== current);
    if (!first) return null;
    const hour = periods.filter(p => p.start >= first.start && p.end <= first.start + 60 * MIN);
    if (hour.length < 4 || hour.some(p => !fin(p.mm))) return null; // incomplete window: stay silent
    const total = hour.reduce((s, p) => s + p.mm, 0);
    if (total < EPISODE) return null;
    const id = 'rain-' + Math.round(first.start / (30 * MIN));
    if (last && (last.id === id || (fin(last.at) && now - last.at < GAP))) return null;
    return { id, start: first.start, minutes: Math.max(0, Math.round((first.start - now) / MIN)), total, peak: Math.max(...hour.map(p => p.mm)) * 4 };
  }

  function message(alert, { lang = 'el', place = '', zone = 'UTC' } = {}) {
    const el = lang !== 'en';
    let clock;
    try { clock = new Intl.DateTimeFormat(el ? 'el-GR' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(new Date(alert.start)); }
    catch { clock = new Date(alert.start).toISOString().slice(11, 16) + ' UTC'; }
    const mm = new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(alert.total);
    const kind = alert.peak >= 7.6 ? (el ? 'Δυνατή βροχή' : 'Heavy rain') : alert.peak >= 2.5 ? (el ? 'Βροχή' : 'Rain') : (el ? 'Ασθενής βροχή' : 'Light rain');
    const when = alert.minutes <= 5 ? (el ? 'τώρα' : 'now') : (el ? `σε ~${alert.minutes}′` : `in ~${alert.minutes} min`);
    return {
      title: `${kind} ${when}${place ? ' · ' + place : ''}`,
      body: el ? `Από ~${clock} · ≈${mm} mm την πρώτη ώρα. Πρόγνωση 15λέπτου, όχι μέτρηση.` : `From ~${clock} · ≈${mm} mm in the first hour. 15-minute forecast, not an observation.`
    };
  }

  const quiet = (now, zone) => {
    try { const h = +new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: zone }).format(new Date(now)); return h >= 23 || h < 7; }
    catch { return false; }
  };

  // Shared state between page and service worker lives in the Cache API.
  async function getJSONEntry(path) {
    try { const c = await caches.open(STORE); const r = await c.match(path); return r ? await r.json() : null; } catch { return null; }
  }
  async function putJSONEntry(path, value) {
    try { const c = await caches.open(STORE); await c.put(path, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })); return true; } catch { return false; }
  }
  const forecastURL = cfg => 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: (+cfg.lat).toFixed(4), longitude: (+cfg.lon).toFixed(4), minutely_15: 'precipitation,rain,showers',
    forecast_minutely_15: '12', past_minutely_15: '2', timezone: 'auto', timeformat: 'unixtime'
  });

  // One complete check: fetch → detect → show → remember. `show(title, options)` is injected.
  async function check({ fetchJSON, show, now = Date.now() } = {}) {
    const cfg = await getJSONEntry(CONFIG);
    if (!cfg?.on || !fin(+cfg.lat) || !fin(+cfg.lon)) return null;
    const data = await fetchJSON(forecastURL(cfg));
    const last = await getJSONEntry(LAST);
    const alert = detect({ data, now, last });
    if (!alert) return null;
    const zone = data?.timezone || 'UTC', text = message(alert, { lang: cfg.lang, place: cfg.name, zone });
    await putJSONEntry(LAST, { id: alert.id, at: now });
    await show(text.title, { body: text.body, tag: 'mono-rain', renotify: true, silent: quiet(now, zone), icon: 'app-icon-192.png', badge: 'app-icon-192.png', data: { url: './#rain' } });
    return alert;
  }

  const api = { detect, message, feed, check, forecastURL, getConfig: () => getJSONEntry(CONFIG), setConfig: v => putJSONEntry(CONFIG, v), STORE };
  root.MONORainAlerts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
