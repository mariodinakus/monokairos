/* Shareable weather card: a 1080×1350 PNG of the current forecast for chat apps and stories.
 * model() is pure and testable; draw() paints any 2D context; file() renders synchronously
 * (icons are preloaded) so navigator.share keeps the user's tap activation on every browser. */
(function (root) {
  'use strict';
  const finite = Number.isFinite;
  const W = 1080, H = 1350, PAD = 84;
  const ICON = /^[a-z][a-z-]{1,20}$/;
  const FONT = 'Inter, "Helvetica Neue", system-ui, Arial, sans-serif';
  const clean = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const roundDeg = v => finite(v) ? String(Math.round(v) === 0 ? 0 : Math.round(v)) : '—';
  const pct = v => finite(v) && v >= 0 && v <= 1 ? Math.round(v * 100) + '%' : '—';
  // Greek capitals carry no accents: «Επόμενες ώρες» → «ΕΠΟΜΕΝΕΣ ΩΡΕΣ».
  const caps = s => String(s).normalize('NFD').replace(/\u0301/g, '').toUpperCase().normalize('NFC');
  const icon = v => typeof v === 'string' && ICON.test(v) ? v : null;

  function fmt(t, zone, lang, opts) {
    try { return new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: zone || undefined, ...opts }).format(new Date(t)); }
    catch { return new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', opts).format(new Date(t)); }
  }

  function model(input = {}) {
    const el = input.lang !== 'en', X = (a, b) => el ? a : b;
    const now = finite(input.now) ? input.now : Date.now(), zone = input.zone, lang = el ? 'el' : 'en';
    const cur = input.current || {}, today = input.today || {}, tom = input.tomorrow;
    const city = clean(input.city, 40);
    if (!city || !finite(cur.temp)) return null;
    const hours = (Array.isArray(input.hours) ? input.hours : [])
      .filter(h => finite(h?.t) && h.t > now && finite(h.temp))
      .sort((a, b) => a.t - b.t)
      .filter((h, i) => i % 2 === 0)
      .slice(0, 6)
      .map(h => ({ time: fmt(h.t, zone, lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), temp: roundDeg(h.temp) + '°', pop: pct(h.pop), icon: icon(h.icon) }));
    const details = [
      finite(cur.feels) && X('Αίσθηση', 'Feels') + ' ' + roundDeg(cur.feels) + '°',
      finite(today.hi) && X('Μέγ.', 'High') + ' ' + roundDeg(today.hi) + '°',
      finite(today.lo) && X('Ελάχ.', 'Low') + ' ' + roundDeg(today.lo) + '°'
    ].filter(Boolean);
    const extra = [
      finite(cur.wind) && cur.wind >= 0 && X('Άνεμος', 'Wind') + ' ' + Math.round(cur.wind) + ' km/h',
      finite(cur.rh) && cur.rh >= 0 && cur.rh <= 100 && X('Υγρασία', 'Humidity') + ' ' + Math.round(cur.rh) + '%'
    ].filter(Boolean);
    const tomorrow = tom && (finite(tom.hi) || finite(tom.lo))
      ? clean(tom.label || X('Αύριο', 'Tomorrow'), 24) + ' · ' + roundDeg(tom.lo) + '° / ' + roundDeg(tom.hi) + '°' + (finite(tom.pop) ? ' · ' + X('βροχή', 'rain') + ' ' + pct(tom.pop) : '')
      : '';
    return {
      lang,
      brand: 'MONO / WEATHER',
      stamp: fmt(now, zone, lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      city, place: clean(input.place, 60),
      temp: roundDeg(cur.temp), icon: icon(cur.icon),
      condition: clean(input.condition, 60),
      source: cur.station ? X('Μέτρηση σταθμού', 'Station measurement') : X('Εκτίμηση μοντέλου', 'Model estimate'),
      details: details.join('  ·  '), extra: extra.join('  ·  '),
      rain: clean(input.rain, 140),
      hoursTitle: X('Επόμενες ώρες', 'Next hours'), hours,
      tomorrow,
      footer: clean(input.url || 'monokairos.vercel.app', 60)
    };
  }

  function wrap(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = w; } else line = next;
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last.replace(/\s+$/, '') + '…';
    }
    return lines;
  }

  function draw(ctx, m, images = {}) {
    if (!ctx || !m) return false;
    const img = name => { const i = name && images[name]; return i && (i.complete === undefined || i.complete) && (i.naturalWidth ?? 1) > 0 ? i : null; };
    const text = (s, x, y, size, weight, color, align = 'left') => {
      ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y);
    };
    const rule = y => { ctx.fillStyle = '#2a2a2a'; ctx.fillRect(PAD, y, W - 2 * PAD, 2); };
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    // header
    ctx.fillStyle = '#f7f7f5'; ctx.fillRect(PAD, 78, 58, 58);
    text('M', PAD + 29, 123, 38, 880, '#000', 'center');
    text(m.brand, PAD + 82, 117, 26, 800, '#f7f7f5');
    text(m.stamp, W - PAD, 117, 26, 600, '#8a8a8a', 'right');

    // place
    ctx.font = `730 80px ${FONT}`;
    text(wrap(ctx, m.city, W - 2 * PAD, 1)[0], PAD, 262, 80, 730, '#f7f7f5');
    if (m.place) text(m.place, PAD, 310, 28, 560, '#8a8a8a');

    // temperature + icon (fixed slots so nothing can collide with the hours strip)
    text(m.temp, PAD - 8, 560, 230, 560, '#f7f7f5');
    ctx.font = `560 230px ${FONT}`;
    const tw = ctx.measureText(m.temp).width;
    text('°', PAD - 4 + tw, 470, 96, 500, '#f7f7f5');
    const big = img(m.icon);
    if (big) ctx.drawImage(big, W - PAD - 220, 360, 220, 220);
    let y = 640;
    if (m.condition) { ctx.font = `720 44px ${FONT}`; text(wrap(ctx, m.condition, W - 2 * PAD, 1)[0], PAD, y, 44, 720, '#f7f7f5'); y += 46; }
    text(m.source, PAD, y, 24, 650, '#8a8a8a'); y += 58;
    if (m.details) { text(m.details, PAD, y, 32, 680, '#f7f7f5'); y += 46; }
    if (m.extra) { text(m.extra, PAD, y, 28, 560, '#b5b5b5'); }

    // rain sentence: at most two lines between y=870 and the hours strip
    if (m.rain) {
      rule(840);
      ctx.font = `620 30px ${FONT}`;
      wrap(ctx, m.rain, W - 2 * PAD, 2).forEach((line, i) => text(line, PAD, 892 + i * 42, 30, 620, '#f7f7f5'));
    }

    // hours strip: title at 1000, last line ends above the footer rule
    if (m.hours.length) {
      const top = 1000;
      rule(top - 38);
      text(caps(m.hoursTitle), PAD, top, 20, 800, '#8a8a8a');
      const col = (W - 2 * PAD) / m.hours.length;
      m.hours.forEach((h, i) => {
        const cx = PAD + col * i + col / 2;
        text(h.time, cx, top + 44, 24, 720, '#b5b5b5', 'center');
        const ic = img(h.icon);
        if (ic) ctx.drawImage(ic, cx - 30, top + 58, 60, 60);
        text(h.temp, cx, top + 160, 34, 740, '#f7f7f5', 'center');
        text('☂ ' + h.pop, cx, top + 196, 20, 600, '#8a8a8a', 'center');
      });
    }

    // footer
    rule(H - 112);
    if (m.tomorrow) text(m.tomorrow, PAD, H - 58, 26, 650, '#b5b5b5');
    text(m.footer, W - PAD, H - 58, 24, 700, '#f7f7f5', 'right');
    return true;
  }

  const cache = {};
  function preload(names, base = 'icons/') {
    if (typeof Image === 'undefined') return cache;
    for (const n of names || []) {
      if (!icon(n) || cache[n]) continue;
      const i = new Image(); i.decoding = 'async'; i.src = base + n + '.svg'; cache[n] = i;
    }
    return cache;
  }

  function dataUrlToBytes(url) {
    const b64 = String(url).split(',')[1] || '', bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Synchronous so that navigator.share() still runs inside the click's user activation.
  function file(m, name = 'mono-weather.png') {
    if (!m || typeof document === 'undefined' || typeof File === 'undefined') return null;
    try {
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d'); if (!ctx || !draw(ctx, m, cache)) return null;
      return new File([dataUrlToBytes(canvas.toDataURL('image/png'))], name, { type: 'image/png' });
    } catch { return null; }
  }

  function download(f) {
    if (!f || typeof URL === 'undefined' || !URL.createObjectURL) return false;
    const a = document.createElement('a'), href = URL.createObjectURL(f);
    a.href = href; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    return true;
  }

  const ICONS = ['sun', 'moon', 'partly-day', 'partly-night', 'overcast', 'fog', 'drizzle', 'rain', 'snow', 'storm', 'cloud'];
  if (typeof document !== 'undefined') preload(ICONS);

  root.MONOShareCard = { model, draw, wrap, caps, file, download, preload, size: { width: W, height: H } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MONOShareCard;
})(typeof window !== 'undefined' ? window : globalThis);
