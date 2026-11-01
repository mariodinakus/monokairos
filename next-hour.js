/* Forecast accumulation over the next rolling hour, using the existing Open-Meteo feed. */
(function (root) {
  'use strict';
  const MINUTE = 60e3, HOUR = 60 * MINUTE, MAX_AGE = 75 * MINUTE;
  const finite = Number.isFinite;

  // The provider timestamps precipitation at the END of the accumulation period.
  // Partial periods are apportioned uniformly; missing or overlapping periods
  // invalidate the whole total rather than being treated as dry weather.
  function integrate(feed, start, end, step, value) {
    if (!Array.isArray(feed?.t)) return null;
    const periods = feed.t.map((t, i) => ({ t, i })).filter(x => finite(x.t)).sort((a, b) => a.t - b.t);
    let cursor = start, total = 0;
    for (const { t, i } of periods) {
      const a = Math.max(start, t - step), b = Math.min(end, t);
      if (b <= a) continue;
      if (Math.abs(a - cursor) > 1) return null;
      const amount = value(feed, i);
      if (!finite(amount) || amount < 0) return null;
      total += amount * (b - a) / step;
      cursor = b;
    }
    return Math.abs(cursor - end) <= 1 ? total : null;
  }

  function forecast({ fifteen, hourly, now = Date.now(), snapshot = false } = {}) {
    if (!finite(now) || snapshot) return null;
    for (const [feed, step, resolution] of [[fifteen, 15 * MINUTE, '15min'], [hourly, HOUR, 'hourly']]) {
      if (!feed || !finite(feed.at) || feed.at > now + 5 * MINUTE || now - feed.at > MAX_AGE) continue;
      const end = now + HOUR;
      // Rain and showers are both liquid precipitation. They must both cover
      // the entire window; otherwise use total precipitation with an honest label.
      const rain = integrate(feed, now, end, step, (f, i) =>
        finite(f.rain?.[i]) && finite(f.showers?.[i]) && f.rain[i] >= 0 && f.showers[i] >= 0
          ? f.rain[i] + f.showers[i] : null);
      if (rain !== null) return { amount: rain, kind: 'rain', resolution, start: now, end, at: feed.at };
      const precip = integrate(feed, now, end, step, (f, i) => f.precipitation?.[i]);
      if (precip !== null) return { amount: precip, kind: 'precipitation', resolution, start: now, end, at: feed.at };
    }
    return null;
  }

  function render(result, { lang = 'el', zone = 'UTC' } = {}) {
    const el = lang !== 'en', X = (gr, en) => el ? gr : en;
    const clock = t => {
      try { return new Intl.DateTimeFormat(el ? 'el-GR' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(new Date(t)); }
      catch { return new Intl.DateTimeFormat(el ? 'el-GR' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(t)); }
    };
    const number = n => n > 0 && n < 0.05 ? (el ? '<0,1' : '<0.1') : new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const title = result?.kind === 'precipitation' ? X('Υετός την επόμενη ώρα', 'Precipitation in the next hour') : X('Βροχή την επόμενη ώρα', 'Rain in the next hour');
    if (!result) return `<section class="section card nh-card" aria-label="${title}"><div class="nh-heading"><img src="icons/rain.svg" alt=""><div><span class="label">MONO / NEXT HOUR</span><h2>${title}</h2><p>${X('Δεν υπάρχουν επαρκή πρόσφατα δεδομένα. Δοκίμασε ανανέωση.', 'Not enough recent forecast data. Try refreshing.')}</p></div></div></section>`;
    const amount = esc(number(result.amount));
    const description = result.amount === 0
      ? (result.kind === 'rain' ? X('Δεν προβλέπεται βροχή', 'No rain forecast') : X('Δεν προβλέπεται υετός', 'No precipitation forecast'))
      : result.amount < 1 ? X('Μικρή ποσότητα', 'A small amount') : result.amount < 5 ? X('Αξιόλογη ποσότητα', 'A noticeable amount') : X('Αυξημένη ποσότητα', 'A substantial amount');
    const method = result.resolution === '15min'
      ? X('Υπολογισμός από 15λεπτα διαστήματα, που σε ορισμένες περιοχές προκύπτουν από ωριαία δεδομένα.', 'Calculated from 15-minute intervals, which may be interpolated from hourly data in some regions.')
      : X('Υπολογισμός αναλογικά από ωριαία διαστήματα.', 'Calculated proportionally from hourly intervals.');
    const kindNote = result.kind === 'precipitation' ? X('Περιλαμβάνει πιθανό χιόνι ως ισοδύναμο νερού. ', 'Includes any snow as water equivalent. ') : '';
    return `<section class="section card nh-card" aria-label="${title}"><div class="nh-layout"><div class="nh-heading"><img src="icons/rain.svg" alt=""><div><span class="label">MONO / NEXT HOUR</span><h2>${title}</h2><p>${clock(result.start)} – ${clock(result.end)} · ${X('εκτίμηση μοντέλου', 'model forecast')}</p></div></div><div class="nh-amount"><strong>≈ ${amount} <small>mm</small></strong><span>${description}</span></div><div class="nh-water"><b>≈ ${amount} ${X('λίτρα / τ.μ.', 'litres / m²')}</b><span>${X('1 mm = 1 λίτρο νερού ανά τ.μ.', '1 mm = 1 litre of water per m²')}</span></div></div><p class="nh-note">${kindNote}${X('Open-Meteo · πρόγνωση, όχι μέτρηση.', 'Open-Meteo · forecast, not an observation.')} ${method} ${X('Ανανέωση', 'Updated')}: ${clock(result.at)}.</p></section>`;
  }
  root.MONONextHour = { forecast, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = { forecast, render };
})(typeof window !== 'undefined' ? window : globalThis);
