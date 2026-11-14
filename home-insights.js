/* Compact home-screen highlights derived only from available hourly forecasts. */
(function (root) {
  'use strict';
  const finite = Number.isFinite;
  const HOUR = 3600e3;

  function highlights(rows, now = Date.now()) {
    if (!finite(now) || !Array.isArray(rows)) return [];
    const future = rows.filter(r => finite(r?.t) && r.t > now && r.t <= now + 24 * HOUR)
      .sort((a, b) => a.t - b.t);
    const peak = (key, valid, compare) => future.filter(r => valid(r[key]))
      .reduce((best, r) => !best || compare(r[key], best[key]) ? r : best, null);
    const rain = peak('pop', v => finite(v) && v >= 0 && v <= 1, (a, b) => a > b);
    const gust = peak('gust', v => finite(v) && v >= 0, (a, b) => a > b);
    const hot = peak('temp', finite, (a, b) => a > b);
    const cold = peak('temp', finite, (a, b) => a < b);
    const items = [];
    if (rain && rain.pop >= .6) items.push({ kind: 'rain', t: rain.t, value: rain.pop });
    if (gust && gust.gust >= 50) items.push({ kind: 'gust', t: gust.t, value: gust.gust });
    if (hot && hot.temp >= 35) items.push({ kind: 'hot', t: hot.t, value: hot.temp });
    if (cold && cold.temp <= 0) items.push({ kind: 'cold', t: cold.t, value: cold.temp });
    return items;
  }

  root.MONOHomeInsights = { highlights };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MONOHomeInsights;
})(typeof window !== 'undefined' ? window : globalThis);
