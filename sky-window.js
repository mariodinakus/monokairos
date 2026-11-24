/* MONO Living Sky (sky-window.js) — the home hero becomes a window onto the city's real sky.
 * scene() turns live conditions into a description of the sky (pure, tested):
 *   sun & moon placed from their real position, sky colours from the sun's elevation
 *   (night → blue hour → dusk → golden → day), cloud cover and shade, rain/snow at the
 *   measured intensity and slanted by the real wind, fog, stars and storm lightning.
 * mount() paints it on one persistent canvas that survives the app's re-renders, eases
 * between scenes, pauses off-screen / in background tabs and honours reduced motion. */
(function (root) {
  'use strict';
  const finite = Number.isFinite, RAD = Math.PI / 180, DAY = 86400e3;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mix = (a, b, k) => a + (b - a) * k;
  const mixC = (a, b, k) => a.map((v, i) => mix(v, b[i], k));

  // ---------------------------------------------------------------- astronomy
  function sunPosition(t, lat, lon) {
    if (!finite(t) || !finite(lat) || !finite(lon)) return null;
    const jc = (t / DAY + 2440587.5 - 2451545) / 36525;
    const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
    const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
    const c = Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * m * RAD) * 0.000289;
    const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * RAD);
    const eps = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60 + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * RAD);
    const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
    const y = Math.tan(eps / 2 * RAD) ** 2;
    const eqTime = 4 / RAD * (y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(m * RAD) + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) - 0.5 * y * y * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * m * RAD));
    const d = new Date(t), utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    const solarMin = ((utcMin + eqTime + 4 * lon) % 1440 + 1440) % 1440;   // local apparent solar time
    const ha = solarMin / 4 - 180;
    const cosZ = Math.sin(lat * RAD) * Math.sin(decl) + Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(ha * RAD);
    return { elevation: 90 - Math.acos(clamp(cosZ, -1, 1)) / RAD, solarHour: solarMin / 60 };
  }

  const SYNODIC = 29.530588853, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  const moonPhase = t => ((((t - NEW_MOON) / DAY / SYNODIC) % 1) + 1) % 1;   // 0 new · .5 full

  // The moon transits roughly phase × 24 h after the sun, so it sits where the sun was then
  // (declination difference ignored — good enough to place it on the right side of the sky).
  function moonPosition(t, lat, lon) {
    const phase = moonPhase(t), p = sunPosition(t - phase * DAY * (1 + 1 / SYNODIC), lat, lon);
    return p && { phase, illumination: (1 - Math.cos(2 * Math.PI * phase)) / 2, elevation: p.elevation, solarHour: p.solarHour };
  }

  // Sky across the dome: 6 h (east, left) → 18 h (west, right).
  const skyX = hour => clamp(0.06 + 0.88 * ((hour - 6) / 12), -0.2, 1.2);
  // Horizon at 80 % of the height; the sky above it is compressed so a winter noon sun still rides high.
  const skyY = elev => clamp(0.8 - Math.sign(elev) * Math.sqrt(Math.min(Math.abs(elev), 70) / 70) * 0.68, 0.1, 0.95);

  // ---------------------------------------------------------------- weather → scene
  const PRECIP = { 51: .15, 53: .25, 55: .35, 56: .3, 57: .4, 61: .35, 63: .6, 65: .9, 66: .4, 67: .8, 80: .4, 81: .65, 82: .95, 95: .7, 96: .8, 99: .95 };
  const SNOW = { 71: .3, 73: .55, 75: .85, 77: .2, 85: .45, 86: .8 };
  const COVER = { 0: 5, 1: 25, 2: 55, 3: 96, 45: 100, 48: 100 };

  // Sky gradient [top, horizon] by solar elevation (°).
  const KEYS = [
    [-18, [5, 7, 15], [11, 15, 28]],
    [-10, [9, 14, 34], [24, 32, 62]],
    [-5, [20, 31, 74], [66, 78, 128]],
    [-1.5, [40, 48, 100], [206, 116, 104]],
    [3, [66, 100, 166], [242, 170, 112]],
    [10, [58, 120, 198], [166, 204, 236]],
    [40, [34, 104, 196], [146, 198, 240]]
  ];
  function skyColours(elev) {
    if (!finite(elev)) elev = 30;
    if (elev <= KEYS[0][0]) return { top: KEYS[0][1].slice(), bottom: KEYS[0][2].slice() };
    for (let i = 1; i < KEYS.length; i++) if (elev <= KEYS[i][0]) {
      const [e0, t0, b0] = KEYS[i - 1], [e1, t1, b1] = KEYS[i], k = (elev - e0) / (e1 - e0);
      return { top: mixC(t0, t1, k), bottom: mixC(b0, b1, k) };
    }
    const last = KEYS[KEYS.length - 1];
    return { top: last[1].slice(), bottom: last[2].slice() };
  }

  function scene(input = {}) {
    const now = finite(input.now) ? input.now : Date.now();
    const lat = finite(input.lat) ? input.lat : null, lon = finite(input.lon) ? input.lon : null;
    const code = finite(input.code) ? input.code : null;
    const sun = lat !== null && lon !== null ? sunPosition(now, lat, lon) : null;
    const elev = sun ? sun.elevation : (input.isDay === 0 ? -20 : 35);

    let cover = finite(input.cloud) ? clamp(input.cloud, 0, 100) : (code !== null && COVER[code] !== undefined ? COVER[code] : PRECIP[code] || SNOW[code] ? 90 : 30);
    // Precipitation: the weather code sets the type, a measured rate can only strengthen it.
    let kind = null, intensity = 0;
    if (code !== null && SNOW[code]) { kind = 'snow'; intensity = SNOW[code]; }
    else if (code !== null && PRECIP[code]) { kind = 'rain'; intensity = PRECIP[code]; }
    const rate = finite(input.rate) && input.rate >= 0.1 ? input.rate : 0;
    if (rate) { kind = kind || 'rain'; intensity = Math.max(intensity, clamp(Math.log1p(rate) / Math.log1p(12), 0.12, 1)); }
    if (kind === 'rain' && finite(input.temp) && input.temp <= 0.5) kind = 'snow';
    if (kind) cover = Math.max(cover, 80);
    const storm = code === 95 || code === 96 || code === 99;

    const wind = finite(input.wind) && input.wind >= 0 ? Math.min(input.wind, 150) : 0;
    const toward = finite(input.dir) ? Math.sin((input.dir + 180) * RAD) : 1;   // +1 blowing east (to the right)
    const fog = code === 45 || code === 48 ? 0.75 : finite(input.vis) ? (input.vis < 1 ? 0.6 : input.vis < 4 ? 0.3 : 0) : 0;

    // Colours: clear-sky gradient, greyed by cloud, darkened by rain and storms, washed by fog.
    const c = cover / 100, light = clamp((elev + 8) / 20, 0.07, 1);
    const sky = skyColours(elev);
    const grey = Math.min(0.92, Math.pow(c, 1.6) * 0.85 + intensity * 0.15);
    const dull = 1 - intensity * 0.3 - (storm ? 0.3 : 0);
    const glow = Math.max(light, 0.26);   // overcast city nights glow grey, they are not pitch black
    sky.top = mixC(sky.top, [92 * glow, 98 * glow, 108 * glow], grey).map(v => v * dull);
    sky.bottom = mixC(sky.bottom, [148 * glow, 150 * glow, 156 * glow], grey).map(v => v * dull);
    if (fog) { sky.top = mixC(sky.top, [176 * light, 179 * light, 184 * light], fog * 0.7); sky.bottom = mixC(sky.bottom, [196 * light, 198 * light, 202 * light], fog * 0.85); }
    const round = a => a.map(v => Math.round(clamp(v, 0, 255)));

    const moon = lat !== null && lon !== null ? moonPosition(now, lat, lon) : null;
    const sunVisible = sun && elev > -1.5;
    const moonVisible = moon && moon.elevation > 0 && elev < 4 && moon.illumination > 0.04;
    return {
      t: now,
      sky: { top: round(sky.top), bottom: round(sky.bottom) },
      light: +light.toFixed(3),
      sun: sunVisible ? { x: +skyX(sun.solarHour).toFixed(3), y: +skyY(elev).toFixed(3), elevation: +elev.toFixed(2), veil: +(c * 0.85 + fog * 0.5).toFixed(3) } : null,
      moon: moonVisible ? { x: +skyX(moon.solarHour).toFixed(3), y: +skyY(moon.elevation).toFixed(3), phase: +moon.phase.toFixed(3), veil: +(c * 0.85).toFixed(3) } : null,
      stars: +(clamp((-elev - 5) / 8, 0, 1) * clamp(1 - c * 1.15, 0, 1) * (1 - fog)).toFixed(3),
      cloud: { cover: +c.toFixed(3), shade: +clamp((elev < -4 ? 0.62 : 0.12) + intensity * 0.55 + (storm ? 0.25 : 0), 0, 0.92).toFixed(3) },
      precip: kind ? { kind, intensity: +intensity.toFixed(3), tilt: +(clamp(wind / 70, 0, 0.75) * toward).toFixed(3) } : null,
      wind: { speed: wind, drift: +(toward * (6 + wind * 0.9)).toFixed(2) },
      fog: +fog.toFixed(2),
      storm
    };
  }

  function describe(s, lang = 'el') {
    if (!s) return '';
    const el = lang !== 'en', X = (a, b) => el ? a : b, parts = [];
    parts.push(s.sun ? (s.sun.elevation < 6 ? X('ήλιος χαμηλά στον ορίζοντα', 'low sun') : X('μέρα', 'daytime')) : s.stars > 0.3 ? X('νύχτα με αστέρια', 'starry night') : X('νύχτα', 'night'));
    if (s.cloud.cover > 0.85) parts.push(X('συννεφιά', 'overcast')); else if (s.cloud.cover > 0.35) parts.push(X('σύννεφα', 'clouds'));
    if (s.precip) parts.push(s.precip.kind === 'snow' ? X('χιόνι', 'snow') : X('βροχή', 'rain'));
    if (s.storm) parts.push(X('καταιγίδα', 'thunderstorm'));
    if (s.fog) parts.push(X('ομίχλη', 'fog'));
    if (s.moon) parts.push(X('φεγγάρι', 'moon'));
    return X('Ζωντανός ουρανός: ', 'Live sky: ') + parts.join(', ');
  }

  // ---------------------------------------------------------------- renderer
  const R = { canvas: null, ctx: null, host: null, target: null, cur: null, raf: 0, last: 0, w: 0, h: 0, dpr: 1,
    drops: [], clouds: [], stars: [], flash: 0, nextFlash: 0, bolt: null, visible: true, ro: null, io: null, reduced: false, seed: 1 };
  const rnd = () => { R.seed = (R.seed * 16807) % 2147483647; return (R.seed - 1) / 2147483646; };

  function cloudSprite(w, h, dark) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h);
    const g = c.getContext('2d'), puffs = 7 + Math.floor(rnd() * 5);
    for (let i = 0; i < puffs; i++) {
      const px = w * (0.15 + 0.7 * rnd()), py = h * (0.45 + 0.25 * rnd()), r = h * (0.22 + 0.22 * rnd());
      const grad = g.createRadialGradient(px, py - r * 0.25, r * 0.1, px, py, r);
      const [a, b] = dark ? ['rgba(70,74,84,.95)', 'rgba(70,74,84,0)'] : ['rgba(255,255,255,.95)', 'rgba(255,255,255,0)'];
      grad.addColorStop(0, a); grad.addColorStop(0.6, a.replace('.95', '.55')); grad.addColorStop(1, b);
      g.fillStyle = grad; g.beginPath(); g.arc(px, py, r, 0, 2 * Math.PI); g.fill();
    }
    return c;
  }

  function buildClouds() {
    const s = R.cur; R.clouds = [];
    const n = Math.round(2 + s.cloud.cover * 16);
    for (let i = 0; i < n; i++) {
      const w = R.w * (0.35 + 0.45 * rnd()) * (0.7 + s.cloud.cover * 0.6), h = w * (0.32 + 0.12 * rnd());
      R.clouds.push({ x: rnd() * (R.w + w) - w, y: R.h * (0.02 + 0.55 * rnd() * (1.1 - s.cloud.cover * 0.4)) - h * 0.3, w, h,
        depth: 0.5 + rnd() * 0.8, light: cloudSprite(w, h, false), dark: cloudSprite(w, h, true) });
    }
  }
  function buildStars() {
    R.stars = Array.from({ length: Math.round(R.w * R.h / 2600) }, () => ({ x: rnd() * R.w, y: rnd() * R.h * 0.8, r: (0.4 + rnd() * 1.1) * R.dpr, tw: rnd() * 6.28 }));
  }
  function buildDrops() {
    const p = R.cur.precip; R.drops = [];
    if (!p) return;
    const snow = p.kind === 'snow', area = R.w * R.h / (R.dpr * R.dpr);
    const n = Math.round(Math.min(snow ? 260 : 620, area / (snow ? 2200 : 1300) * (0.25 + p.intensity)));
    for (let i = 0; i < n; i++) R.drops.push({ x: rnd() * R.w * 1.4 - R.w * 0.2, y: rnd() * R.h, z: 0.4 + rnd() * 0.6, sway: rnd() * 6.28 });
  }

  function resize() {
    if (!R.canvas || !R.host) return;
    const dpr = Math.min(2, root.devicePixelRatio || 1), w = Math.max(1, Math.round(R.host.clientWidth * dpr)), h = Math.max(1, Math.round(R.host.clientHeight * dpr));
    if (w === R.w && h === R.h) return;
    R.w = w; R.h = h; R.dpr = dpr; R.canvas.width = w; R.canvas.height = h;
    if (R.cur) { buildClouds(); buildStars(); buildDrops(); }
  }

  const rgb = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

  function ease(dt) {
    const t = R.target, c = R.cur, k = 1 - Math.exp(-dt * 1.5);
    c.sky.top = mixC(c.sky.top, t.sky.top, k); c.sky.bottom = mixC(c.sky.bottom, t.sky.bottom, k);
    c.stars = mix(c.stars, t.stars, k); c.fog = mix(c.fog, t.fog, k); c.light = mix(c.light, t.light, k);
    c.cloud.shade = mix(c.cloud.shade, t.cloud.shade, k);
    c.wind.drift = mix(c.wind.drift, t.wind.drift, k);
    for (const key of ['sun', 'moon']) {
      if (!t[key]) c[key] = null;
      else if (!c[key]) c[key] = { ...t[key] };
      else for (const f of ['x', 'y', 'veil', 'elevation', 'phase']) if (finite(t[key][f])) c[key][f] = mix(c[key][f], t[key][f], k);
    }
    if (c.precip && t.precip) c.precip.tilt = mix(c.precip.tilt, t.precip.tilt, k);
  }

  function frame(time) {
    R.raf = 0;
    if (!R.canvas || !R.canvas.isConnected) return stop();
    const dt = R.last ? Math.min(0.1, (time - R.last) / 1000) : 0.016; R.last = time;
    const g = R.ctx, W = R.w, H = R.h, s = R.cur, d = R.dpr;
    ease(dt);

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, rgb(s.sky.top)); sky.addColorStop(1, rgb(s.sky.bottom));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    if (s.stars > 0.01) for (const st of R.stars) {
      const a = s.stars * (0.55 + 0.45 * Math.sin(time / 900 + st.tw));
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.fillRect(st.x, st.y, st.r, st.r);
    }

    if (s.sun) {
      const x = s.sun.x * W, y = s.sun.y * H, low = clamp(1 - s.sun.elevation / 12, 0, 1), vis = clamp(1 - s.sun.veil, 0.08, 1);
      const r = Math.min(W, H) * 0.06, warm = [255, 150 + 90 * (1 - low), 80 + 150 * (1 - low)];
      g.save(); g.globalCompositeOperation = 'lighter';
      const bloom = g.createRadialGradient(x, y, r * 0.5, x, y, r * (7 + low * 5));
      bloom.addColorStop(0, rgb(warm, 0.5 * vis)); bloom.addColorStop(0.3, rgb(warm, 0.16 * vis)); bloom.addColorStop(1, rgb(warm, 0));
      g.fillStyle = bloom; g.fillRect(0, 0, W, H);
      const disk = g.createRadialGradient(x, y, 0, x, y, r * 1.25);
      disk.addColorStop(0, `rgba(255,255,250,${vis.toFixed(3)})`); disk.addColorStop(0.75, rgb([255, 240, 200], vis)); disk.addColorStop(1, rgb(warm, 0));
      g.fillStyle = disk; g.beginPath(); g.arc(x, y, r * 1.25, 0, 2 * Math.PI); g.fill();
      g.restore();
    }

    if (s.moon) {
      const x = s.moon.x * W, y = s.moon.y * H, r = Math.min(W, H) * 0.045, vis = clamp(1 - s.moon.veil, 0.1, 1), ph = s.moon.phase;
      const lit = (1 - Math.cos(2 * Math.PI * ph)) / 2;
      g.save(); g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(x, y, r * 0.8, x, y, r * 6);
      halo.addColorStop(0, `rgba(200,215,255,${(0.28 * vis * (0.3 + 0.7 * lit)).toFixed(3)})`); halo.addColorStop(1, 'rgba(200,215,255,0)');
      g.fillStyle = halo; g.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      g.restore();
      g.save(); g.globalAlpha = vis;
      g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fillStyle = '#f4f6fb'; g.fill();
      // Terminator: shade the unlit part with an ellipse whose width follows the phase.
      g.beginPath(); g.arc(x, y, r + 0.5, 0, 2 * Math.PI); g.clip();
      g.fillStyle = rgb(s.sky.top, 0.94);
      const k = Math.cos(2 * Math.PI * ph), waxing = ph < 0.5;
      g.beginPath();
      g.arc(x, y, r + 1, -Math.PI / 2, Math.PI / 2, waxing);
      g.ellipse(x, y, Math.abs(k) * (r + 1), r + 1, 0, Math.PI / 2, -Math.PI / 2, waxing ? k > 0 : k <= 0);
      g.fill(); g.restore();
    }

    const drift = s.wind.drift * d;
    for (const cl of R.clouds) {
      if (!R.reduced) cl.x += drift * cl.depth * dt;
      if (cl.x > W + 10) cl.x = -cl.w; else if (cl.x < -cl.w - 10) cl.x = W;
      const alpha = 0.35 + 0.6 * s.cloud.cover;
      const shade = s.cloud.shade;
      g.globalAlpha = alpha * (1 - shade) * (0.45 + 0.55 * s.light); g.drawImage(cl.light, cl.x, cl.y);
      g.globalAlpha = alpha * shade; g.drawImage(cl.dark, cl.x, cl.y);
    }
    g.globalAlpha = 1;

    if (s.fog > 0.02) {
      const f = g.createLinearGradient(0, H * 0.25, 0, H);
      const c = mixC([200, 202, 206], [60, 62, 66], 1 - s.light);
      f.addColorStop(0, rgb(c, 0)); f.addColorStop(1, rgb(c, s.fog * 0.8));
      g.fillStyle = f; g.fillRect(0, 0, W, H);
    }

    const p = s.precip;
    if (p) {
      if (p.kind === 'snow') {
        g.fillStyle = 'rgba(255,255,255,.85)';
        for (const f of R.drops) {
          if (!R.reduced) { f.y += (30 + 45 * f.z) * d * dt; f.x += (Math.sin(time / 1300 + f.sway) * 14 + p.tilt * 80) * d * dt * f.z; }
          if (f.y > H) { f.y = -4; f.x = rnd() * W; }
          g.globalAlpha = 0.45 + 0.5 * f.z; g.beginPath(); g.arc(f.x, f.y, (0.8 + 1.8 * f.z) * d, 0, 6.283); g.fill();
        }
        g.globalAlpha = 1;
      } else {
        const speed = (780 + 520 * p.intensity) * d, dx = Math.sin(p.tilt), dy = Math.cos(p.tilt);
        g.strokeStyle = s.light > 0.4 ? 'rgba(225,235,250,.55)' : 'rgba(190,205,230,.45)'; g.lineWidth = Math.max(1, d * 1.1); g.lineCap = 'round';
        g.beginPath();
        for (const r of R.drops) {
          if (!R.reduced) { r.y += speed * r.z * dy * dt; r.x += speed * r.z * dx * dt; }
          if (r.y > H) { r.y = -20 * d; r.x = rnd() * W * 1.4 - W * 0.2; }
          const len = (10 + 16 * r.z) * d;
          g.moveTo(r.x, r.y); g.lineTo(r.x - dx * len, r.y - dy * len);
        }
        g.stroke();
      }
    }

    if (s.storm && !R.reduced) {
      if (!R.nextFlash) R.nextFlash = time + 2500 + rnd() * 6000;
      if (time > R.nextFlash) {
        R.flash = 1; R.nextFlash = time + 3500 + rnd() * 9000;
        if (rnd() < 0.6) { let x = W * (0.15 + 0.7 * rnd()), y = 0; R.bolt = [[x, y]]; while (y < H * 0.75) { y += H * (0.05 + 0.07 * rnd()); x += (rnd() - 0.5) * W * 0.08; R.bolt.push([x, y]); } }
      }
      if (R.flash > 0.01) {
        g.fillStyle = `rgba(235,240,255,${(R.flash * 0.45).toFixed(3)})`; g.fillRect(0, 0, W, H);
        if (R.bolt && R.flash > 0.4) { g.strokeStyle = `rgba(255,255,255,${R.flash.toFixed(3)})`; g.lineWidth = 2.2 * d; g.beginPath(); R.bolt.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
        R.flash *= Math.exp(-dt * 5);
      } else R.bolt = null;
    }

    // Readability scrim behind the hero text.
    const scrim = g.createLinearGradient(0, 0, 0, H);
    scrim.addColorStop(0, 'rgba(0,0,0,.06)'); scrim.addColorStop(0.5, 'rgba(0,0,0,.16)'); scrim.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = scrim; g.fillRect(0, 0, W, H);

    if (!R.reduced && R.visible && !(typeof document !== 'undefined' && document.hidden)) R.raf = root.requestAnimationFrame(frame);
  }

  function start() { if (!R.raf && R.canvas && R.cur) { R.last = 0; R.raf = root.requestAnimationFrame(frame); } }
  function stop() { if (R.raf) root.cancelAnimationFrame(R.raf); R.raf = 0; }

  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  function mount(host, input, { lang = 'el' } = {}) {
    if (!host || typeof document === 'undefined') return false;
    const s = scene(input);
    if (!R.canvas) {
      R.canvas = document.createElement('canvas'); R.canvas.className = 'living-sky-canvas';
      R.canvas.setAttribute('aria-hidden', 'true');
      R.ctx = R.canvas.getContext('2d');
      if (!R.ctx) { R.canvas = null; return false; }
      R.reduced = !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
      if (root.ResizeObserver) R.ro = new ResizeObserver(() => { resize(); if (R.reduced) start(); });
      if (root.IntersectionObserver) R.io = new IntersectionObserver(es => { R.visible = es.some(e => e.isIntersecting); if (R.visible) start(); });
    }
    const changedKind = !R.target || (R.target.precip?.kind) !== (s.precip?.kind) || Math.abs((R.target.precip?.intensity || 0) - (s.precip?.intensity || 0)) > 0.05 || Math.abs(R.target.cloud.cover - s.cloud.cover) > 0.05;
    R.target = s;
    if (!R.cur) { R.cur = clone(s); R.seed = 1 + Math.floor(Math.abs((input?.lat || 0) * 1000 + (input?.lon || 0) * 10)) % 2147483000; }
    else { R.cur.precip = s.precip ? { ...s.precip, tilt: R.cur.precip?.tilt ?? s.precip.tilt } : null; R.cur.cloud.cover = s.cloud.cover; R.cur.storm = s.storm; }
    if (R.host !== host) {
      R.ro?.disconnect(); R.io?.disconnect();
      R.host = host; host.classList.add('living-sky'); host.prepend(R.canvas);
      R.ro?.observe(host); R.io?.observe(host);
      R.w = 0; resize();
    }
    if (changedKind) { buildClouds(); buildDrops(); }
    if (!R.stars.length) buildStars();
    R.canvas.setAttribute('aria-label', describe(s, lang));
    start();
    return true;
  }

  function unmount() {
    stop(); R.ro?.disconnect(); R.io?.disconnect();
    if (R.host) R.host.classList.remove('living-sky');
    R.canvas?.remove(); R.host = null;
  }

  root.MONOLivingSky = { scene, describe, sunPosition, moonPhase, moonPosition, skyColours, mount, unmount };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MONOLivingSky;
})(typeof window !== 'undefined' ? window : globalThis);
