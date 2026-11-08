/* Day-over-day context for the home screen: now vs. the same hour yesterday,
   tomorrow's high vs. today's, and how much daylight changed since yesterday.
   Pure functions; nothing is fetched here. */
(function (root) {
  'use strict';
  const HOUR = 3600e3, DAY = 24 * HOUR, TOLERANCE = 35 * 60e3;
  const fin = Number.isFinite;

  function dayKey(t, zone) {
    let f;
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }); }
    return f.format(new Date(t));
  }

  function nearest(rows, t) {
    let best = null, gap = Infinity;
    for (const r of rows || []) {
      if (!r || !fin(r.t)) continue;
      const d = Math.abs(r.t - t);
      if (d < gap) { gap = d; best = r; }
    }
    return gap <= TOLERANCE ? best : null;
  }

  // Both ends of the comparison use the same basis: two station observations
  // when both exist, otherwise the station-calibrated MONO series at both hours.
  // A live observation is never compared against a model value.
  function vsYesterday(rows, now) {
    const a = nearest(rows, now), b = nearest(rows, now - DAY);
    if (!a || !b || a === b) return null;
    if (fin(a.obs) && fin(b.obs)) return { diff: a.obs - b.obs, now: a.obs, then: b.obs, basis: 'obs', at: b.t };
    if (fin(a.temp) && fin(b.temp)) return { diff: a.temp - b.temp, now: a.temp, then: b.temp, basis: 'mono', at: b.t };
    return null;
  }

  function tomorrowHigh(daily) {
    const today = daily?.[0], next = daily?.[1];
    if (!fin(today?.hi) || !fin(next?.hi)) return null;
    return { diff: next.hi - today.hi, today: today.hi, tomorrow: next.hi };
  }

  // Open-Meteo daily.time is local midnight in unix seconds; past_days gives yesterday.
  function daylight(d, now, zone) {
    const times = d?.time, dur = d?.daylight_duration;
    if (!Array.isArray(times) || !Array.isArray(dur)) return null;
    const key = dayKey(now, zone);
    const j = times.findIndex(t => fin(t) && dayKey(t * 1000 + 12 * HOUR, zone) === key);
    if (j < 1 || !fin(dur[j]) || !fin(dur[j - 1])) return null;
    const prev = dayKey(times[j - 1] * 1000 + 12 * HOUR, zone), expected = dayKey(times[j] * 1000 - 12 * HOUR, zone);
    if (prev !== expected) return null;
    return { delta: dur[j] - dur[j - 1], today: dur[j], yesterday: dur[j - 1] };
  }

  function compare({ rows, daily, mainDaily, now = Date.now(), zone = 'UTC' } = {}) {
    if (!fin(now)) return null;
    const out = { yesterday: vsYesterday(rows, now), tomorrow: tomorrowHigh(daily), daylight: daylight(mainDaily, now, zone) };
    return out.yesterday || out.tomorrow || out.daylight ? out : null;
  }

  function tempPhrase(diff, el) {
    const n = Math.round(diff), abs = Math.abs(n);
    if (n === 0) return null;
    return el ? `${abs}° πιο ${n > 0 ? 'ζεστά' : 'κρύα'}` : `${abs}° ${n > 0 ? 'warmer' : 'cooler'}`;
  }

  function daylightPhrase(delta, lang = 'el') {
    if (!fin(delta)) return '';
    const el = lang !== 'en', s = Math.round(Math.abs(delta)), m = Math.floor(s / 60), r = s % 60;
    if (s < 5) return el ? 'Η διάρκεια της μέρας σχεδόν σταθερή' : 'Day length almost unchanged';
    const amount = m ? `${m}′ ${String(r).padStart(2, '0')}″` : `${r}″`;
    return el ? `Η μέρα ${delta > 0 ? 'μεγαλώνει' : 'μικραίνει'} ${amount} από χθες` : `Day ${delta > 0 ? 'longer' : 'shorter'} by ${amount} than yesterday`;
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function render(result, { lang = 'el' } = {}) {
    if (!result) return '';
    const el = lang !== 'en', X = (a, b) => el ? a : b, items = [];
    const y = result.yesterday;
    if (y) {
      const p = tempPhrase(y.diff, el), dir = Math.round(y.diff) > 0 ? 'up' : Math.round(y.diff) < 0 ? 'down' : 'flat';
      const text = p ? `${p} ${X('από χθες τέτοια ώρα', 'than this time yesterday')}` : X('Όπως χθες τέτοια ώρα', 'Same as this time yesterday');
      const how = y.basis === 'obs' ? X('Σύγκριση μετρήσεων σταθμού', 'Station observations compared') : X('Σύγκριση εκτιμήσεων MONO με διόρθωση σταθμού', 'MONO station-calibrated estimates compared');
      items.push(`<span class="dc-item dc-${dir}" title="${esc(how)}"><i aria-hidden="true">${dir === 'up' ? '↑' : dir === 'down' ? '↓' : '='}</i>${esc(text)}</span>`);
    }
    const t = result.tomorrow;
    if (t) {
      const n = Math.round(t.diff), dir = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
      const hi = new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { maximumFractionDigits: 0 }).format(Math.round(t.tomorrow));
      const rel = n === 0 ? X('όπως σήμερα', 'like today') : el ? `${Math.abs(n)}° ${n > 0 ? 'υψηλότερα' : 'χαμηλότερα'}` : `${Math.abs(n)}° ${n > 0 ? 'higher' : 'lower'}`;
      items.push(`<span class="dc-item dc-${dir}"><i aria-hidden="true">→</i>${esc(X('Αύριο μέγιστη', 'Tomorrow high'))} ${hi}° · ${esc(rel)}</span>`);
    }
    if (!items.length) return '';
    return `<div class="day-compare" aria-label="${esc(X('Σύγκριση με χθες και αύριο', 'Compared with yesterday and tomorrow'))}">${items.join('')}</div>`;
  }

  const api = { compare, vsYesterday, tomorrowHigh, daylight, daylightPhrase, render };
  root.MONODayCompare = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
