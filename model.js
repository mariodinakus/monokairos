/* MONO-ML v3.1 — a zoo of statistical forecast algorithms for MONO Weather.
 *
 * Pure functions, no DOM. Browser: window.MONOModel · Node: module.exports (tests).
 *
 * For every location, variable and lead day k (0…5) the following algorithms are trained on
 * past forecasts of every numerical model vs. ERA5 truth:
 *   mean     Plain multi-model average                       (reference)
 *   best     Best single model on the training period
 *   mos      Per-model diurnal bias correction + shrunk inverse-MSE weights (Model Output Statistics)
 *   ridge    Ridge-regression stacking of all models + diurnal terms
 *   kalman   Per-model, per-hour Kalman-filter bias tracking (online, no look-ahead)
 *   analog   Analog ensemble: distance-weighted truth of the 20 most similar past forecasts
 *   clim     Hour-of-day mean of the training truth            (baseline only)
 *   persist  Truth one forecast-lead earlier                    (baseline only)
 *   combo    Inverse-MAE² blend of the 3 best algorithms on the validation set
 * Data are split chronologically 60 / 20 / 20 (train / validation / test). The algorithm used live is
 * chosen on validation; the scores shown to the user come from the untouched test set.
 * Rain: vote, logistic, analog, combo — scored with the Brier score the same way.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, fin = Number.isFinite;
  const WET = 0.2, WET_DAY = 1.0, LEADS = [0, 1, 2, 3, 4, 5];
  const LIVE = ['mean', 'best', 'mos', 'ridge', 'kalman', 'analog'];

  const mean = a => { let s = 0, n = 0; for (const v of a) if (fin(v)) { s += v; n++; } return n ? s / n : null; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sigmoid = z => 1 / (1 + Math.exp(-clamp(z, -30, 30)));
  const r1 = v => (fin(v) ? Math.round(v * 100) / 100 : v);

  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  /* Ridge least squares; column 0 (intercept) unpenalised. `center` shrinks coefficients toward a prior instead of 0. */
  function ridge(X, y, lambda, center = null) {
    const p = X[0].length, A = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
    for (let i = 0; i < X.length; i++) { const x = X[i]; for (let a = 0; a < p; a++) { b[a] += x[a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += x[a] * x[c]; } }
    for (let a = 1; a < p; a++) { A[a][a] += lambda; if (center) b[a] += lambda * center[a]; }
    return solve(A, b);
  }
  const harm = h => { const a = TAU * h / 24; return [1, Math.sin(a), Math.cos(a)]; };
  const evalHarm = (c, h) => { if (!c) return 0; const x = harm(h); return c[0] + c[1] * x[1] + c[2] * x[2]; };
  function fitDiurnal(e, h, lambda = 12) {
    if (e.length < 12) return null;
    if (e.length < 48) return [mean(e), 0, 0];
    return ridge(h.map(harm), e, lambda) || [mean(e), 0, 0];
  }
  function lag1(times, r) {
    const a = [], b = [];
    for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] === 3600e3 && fin(r[i]) && fin(r[i - 1])) { a.push(r[i - 1]); b.push(r[i]); }
    if (a.length < 8) return null;
    const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da && db ? n / Math.sqrt(da * db) : null;
  }
  /* Models that copy another (regional "seamless" models outside their domain). Returns {copyId: originalId}. */
  function findDuplicates(series, order) {
    const dup = {};
    for (let i = 0; i < order.length; i++) {
      const a = series[order[i]]; if (!a || dup[order[i]]) continue;
      for (let j = i + 1; j < order.length; j++) {
        const b = series[order[j]]; if (!b || dup[order[j]]) continue;
        let n = 0, same = 0;
        for (let t = 0; t < a.length; t++) if (fin(a[t]) && fin(b[t])) { n++; if (Math.abs(a[t] - b[t]) < 0.051) same++; }
        if (n >= 24 && same / n > 0.97) dup[order[j]] = order[i];
      }
    }
    return dup;
  }

  /* ------------------------------------------------------------------ rows */
  // A row = one valid time with every model's forecast at one lead. prev/next = multi-model mean ±1 h.
  function buildRows(data, k, ids) {
    const N = data.times.length, means = new Array(N).fill(null), rows = [];
    for (let i = 0; i < N; i++) {
      const vals = {}; let s = 0, n = 0;
      for (const id of ids) { const v = data.models[id][k]?.[i]; if (fin(v)) { vals[id] = v; s += v; n++; } }
      if (!n) continue;
      means[i] = s / n;
      rows.push({ i, t: data.times[i], H: data.hours[i], vals, mean: s / n, y: data.truth[i] });
    }
    for (const r of rows) { r.prev = fin(means[r.i - 1]) ? means[r.i - 1] : r.mean; r.next = fin(means[r.i + 1]) ? means[r.i + 1] : r.mean; }
    return rows;
  }
  function feat(r, use) { const a = TAU * r.H / 24; return [1, Math.sin(a), Math.cos(a), ...use.map(id => (fin(r.vals[id]) ? r.vals[id] : r.mean))]; }

  /* ------------------------------------------------------------------ continuous algorithms */
  const ALG = {
    mean: { fit: () => ({}), pred: (p, r) => r.mean },
    best: {
      fit(rows, ids) {
        let best = null;
        for (const id of ids) {
          const e = rows.filter(r => fin(r.vals[id]) && fin(r.y)).map(r => Math.abs(r.vals[id] - r.y));
          if (e.length >= 36) { const m = mean(e); if (!best || m < best.mae) best = { id, mae: m }; }
        }
        return best ? { id: best.id } : {};
      },
      pred: (p, r) => (p.id && fin(r.vals[p.id]) ? r.vals[p.id] : r.mean)
    },
    mos: {
      fit(rows, ids) {
        const models = {};
        for (const id of ids) {
          const e = [], h = [];
          for (const r of rows) if (fin(r.vals[id]) && fin(r.y)) { e.push(r.vals[id] - r.y); h.push(r.H); }
          const bias = fitDiurnal(e, h); if (!bias || e.length < 36) continue;
          let se = 0; for (let j = 0; j < e.length; j++) se += (e[j] - evalHarm(bias, h[j])) ** 2;
          models[id] = { bias: bias.map(r1), mse: se / e.length, n: e.length };
        }
        const ok = Object.keys(models); if (!ok.length) return { models };
        const inv = ok.map(id => 1 / Math.max(models[id].mse, 0.04)), s = inv.reduce((a, b) => a + b, 0);
        ok.forEach((id, j) => { models[id].weight = 0.75 * inv[j] / s + 0.25 / ok.length; });
        return { models };
      },
      pred(p, r, o) {
        let s = 0, w = 0;
        for (const [id, v] of Object.entries(r.vals)) { const m = p.models?.[id]; if (!m) continue; let c = v - evalHarm(m.bias, r.H); if (o.nonNegative) c = Math.max(0, c); s += c * m.weight; w += m.weight; }
        return w ? s / w : r.mean;
      }
    },
    ridge: {
      fit(rows, ids) {
        const use = ids.filter(id => rows.filter(r => fin(r.vals[id])).length >= rows.length * 0.5);
        const tr = rows.filter(r => fin(r.y)); if (tr.length < 72 || !use.length) return {};
        const X = tr.map(r => feat(r, use)), y = tr.map(r => r.y);
        const center = [0, 0, 0, ...use.map(() => 1 / use.length)];   // prior = plain average
        const w = ridge(X, y, Math.max(4, 0.05 * tr.length), center);
        return w ? { use, w: w.map(v => Math.round(v * 1e4) / 1e4) } : {};
      },
      pred: (p, r) => (p.w ? feat(r, p.use).reduce((a, v, j) => a + v * p.w[j], 0) : r.mean)
    },
    analog: {
      fit(rows) {
        const lib = rows.filter(r => fin(r.y)).map(r => [r.H, r1(r.mean), r1(r.prev), r1(r.next), r1(r.y)]);
        if (lib.length < 120) return {};
        const sd = [1, 2, 3].map(j => { const m = mean(lib.map(x => x[j])); return Math.sqrt(mean(lib.map(x => (x[j] - m) ** 2))) || 1; });
        return { lib, sd };
      },
      pred(p, r) {
        if (!p.lib) return r.mean;
        const q = [r.mean, r.prev, r.next], best = [];
        for (const x of p.lib) {
          const dh = Math.min(Math.abs(x[0] - r.H), 24 - Math.abs(x[0] - r.H)); if (dh > 1) continue;
          const d = ((x[1] - q[0]) / p.sd[0]) ** 2 * 2 + ((x[2] - q[1]) / p.sd[1]) ** 2 + ((x[3] - q[2]) / p.sd[2]) ** 2;
          if (best.length < 20) { best.push([d, x[4], x[1]]); best.sort((a, b) => a[0] - b[0]); }
          else if (d < best[19][0]) { best[19] = [d, x[4], x[1]]; best.sort((a, b) => a[0] - b[0]); }
        }
        if (best.length < 5) return r.mean;
        // distance-weighted analog truth, shifted by the gap between today's forecast and the analogs' forecasts
        let s = 0, w = 0; for (const [d, y, f] of best) { const wi = 1 / (d + 0.05); s += wi * (y + 0.5 * (r.mean - f)); w += wi; }
        return s / w;
      }
    }
  };

  /* Kalman-filter bias per model and hour of day, run online: an error becomes known lagH hours after its valid time. */
  function kalmanRun(rows, ids, lagH, opts = {}) {
    const Q = 0.04, R = 1.0, st = {}, queue = [], preds = new Map();
    const get = (id, h) => ((st[id] ||= {})[h] ||= { b: 0, P: 1 });
    const upd = u => { const s = get(u.id, u.h); s.P += Q; const K = s.P / (s.P + R); s.b += K * (u.e - s.b); s.P *= (1 - K); };
    let q = 0;
    for (const r of rows.slice().sort((a, b) => a.t - b.t)) {
      while (q < queue.length && queue[q].known <= r.t) upd(queue[q++]);
      const c = []; for (const [id, v] of Object.entries(r.vals)) { let x = v - (st[id]?.[r.H]?.b || 0); if (opts.nonNegative) x = Math.max(0, x); c.push(x); }
      preds.set(r.i, mean(c));
      if (fin(r.y)) for (const [id, v] of Object.entries(r.vals)) queue.push({ known: r.t + lagH * 3600e3, id, h: r.H, e: v - r.y });
    }
    for (; q < queue.length; q++) upd(queue[q]);
    const state = {}; for (const [id, hs] of Object.entries(st)) state[id] = Object.fromEntries(Object.entries(hs).map(([h, s]) => [h, r1(s.b)]));
    return { preds, state };
  }
  const kalmanPred = (state, r, o = {}) => mean(Object.entries(r.vals).map(([id, v]) => { const x = v - (state?.[id]?.[r.H] || 0); return o.nonNegative ? Math.max(0, x) : x; }));

  /* ------------------------------------------------------------------ train + validate + test one variable */
  function splitTimes(rows) {
    const ts = rows.filter(r => fin(r.y)).map(r => r.t).sort((a, b) => a - b);
    return { a: ts[Math.floor(ts.length * 0.6)] ?? Infinity, b: ts[Math.floor(ts.length * 0.8)] ?? Infinity };
  }
  function scoreMae(rows, f) { const e = []; for (const r of rows) { if (!fin(r.y)) continue; const p = f(r); if (fin(p)) e.push(Math.abs(p - r.y)); } return e.length ? { mae: mean(e), rmse: Math.sqrt(mean(e.map(x => x * x))), n: e.length } : null; }
  const clampNN = (v, o) => (o.nonNegative && fin(v) ? Math.max(0, v) : v);
  const shrinkScores = s => Object.fromEntries(Object.entries(s).filter(([, v]) => v).map(([m, v]) => [m, { mae: r1(v.mae), rmse: r1(v.rmse), n: v.n }]));

  function fitVariable(data, opts = {}) {
    const exclude = opts.exclude || new Set(), out = { leads: {} };
    for (const k of LEADS) {
      const ids0 = Object.keys(data.models).filter(id => !exclude.has(id) && data.models[id][k]);
      const dup = findDuplicates(Object.fromEntries(ids0.map(id => [id, data.models[id][k]])), ids0);
      const ids = ids0.filter(id => !dup[id]);
      if (!ids.length) continue;
      const rows = buildRows(data, k, ids);
      if (rows.filter(r => fin(r.y)).length < 200) continue;
      const { a, b } = splitTimes(rows);
      const train = rows.filter(r => r.t < a), val = rows.filter(r => r.t >= a && r.t < b), test = rows.filter(r => r.t >= b);
      const lagH = 24 * (k + 1);
      const kal = kalmanRun(rows, ids, lagH, opts);
      const fitted = {}; for (const m of LIVE) if (m !== 'kalman') fitted[m] = ALG[m].fit(train, ids);
      const predOf = (m, r) => (m === 'kalman' ? kal.preds.get(r.i) : clampNN(ALG[m].pred(fitted[m], r, opts), opts));
      const climBy = {}; for (const r of train) if (fin(r.y)) (climBy[r.H] ||= []).push(r.y);
      const clim = Object.fromEntries(Object.entries(climBy).map(([h, v]) => [h, mean(v)]));
      const truthAt = new Map(rows.map(r => [r.t, r.y]));
      const base = { clim: r => clim[r.H], persist: r => truthAt.get(r.t - lagH * 3600e3) };
      const valS = {}, testS = {};
      for (const m of LIVE) { valS[m] = scoreMae(val, r => predOf(m, r)); testS[m] = scoreMae(test, r => predOf(m, r)); }
      for (const m of ['clim', 'persist']) { valS[m] = scoreMae(val, base[m]); testS[m] = scoreMae(test, base[m]); }
      const ranked = LIVE.filter(m => valS[m]).sort((x, y) => valS[x].mae - valS[y].mae).slice(0, 3);
      const cw = {}; let cs = 0; for (const m of ranked) { cw[m] = 1 / Math.max(valS[m].mae, 0.05) ** 2; cs += cw[m]; } for (const m of ranked) cw[m] /= cs;
      const comboF = r => { let s = 0, w = 0; for (const m of ranked) { const p = predOf(m, r); if (fin(p)) { s += p * cw[m]; w += cw[m]; } } return w ? s / w : null; };
      valS.combo = scoreMae(val, comboF); testS.combo = scoreMae(test, comboF);
      const cands = [...LIVE, 'combo'].filter(m => valS[m]);
      const choice = cands.reduce((x, y) => (valS[y].mae < valS[x].mae - 1e-9 ? y : x), cands[0] || 'mean');
      const perModel = {};
      for (const id of ids) {
        const raw = [], cor = [], m = fitted.mos.models?.[id];
        for (const r of test) if (fin(r.vals[id]) && fin(r.y)) { raw.push(Math.abs(r.vals[id] - r.y)); if (m) cor.push(Math.abs(r.vals[id] - evalHarm(m.bias, r.H) - r.y)); }
        if (raw.length >= 24) perModel[id] = { rawMae: r1(mean(raw)), corMae: r1(mean(cor)), n: raw.length };
      }
      const prod = {}; for (const m of LIVE) if (m !== 'kalman') prod[m] = ALG[m].fit(rows, ids);
      prod.kalman = { state: kal.state };
      const sc = testS[choice] || testS.mean;
      out.leads[k] = { choice, combo: cw, prod, ids, duplicates: dup, perModel,
        val: shrinkScores(valS), test: shrinkScores(testS), n: { train: train.length, val: val.length, test: test.length },
        sigma: 1.2533 * (sc?.mae ?? 1.5) };
    }
    return out;
  }
  function leadFit(fit, k) {
    if (!fit?.leads) return null;
    for (let d = 0; d <= 5; d++) { if (fit.leads[k - d]) return fit.leads[k - d]; if (fit.leads[k + d]) return fit.leads[k + d]; }
    return null;
  }
  /* live row {H, vals, mean, prev, next} → {value, choice, methods} */
  function predictVariable(fit, k, r, opts = {}) {
    if (!Object.keys(r.vals).length) return { value: null, choice: 'none', methods: {} };
    const L = leadFit(fit, k);
    if (!L) return { value: r.mean, choice: 'untrained', methods: { mean: r.mean } };
    const methods = {};
    for (const m of LIVE) methods[m] = m === 'kalman' ? kalmanPred(L.prod.kalman.state, r, opts) : clampNN(ALG[m].pred(L.prod[m], r, opts), opts);
    let s = 0, w = 0; for (const [m, cw] of Object.entries(L.combo)) if (fin(methods[m])) { s += methods[m] * cw; w += cw; }
    methods.combo = w ? s / w : r.mean;
    return { value: fin(methods[L.choice]) ? methods[L.choice] : r.mean, choice: L.choice, methods };
  }

  /* ------------------------------------------------------------------ rain */
  function logisticFit(X, y, lambda = 1, iters = 25) {
    const p = X[0].length; let w = Array(p).fill(0);
    for (let it = 0; it < iters; it++) {
      const H = Array.from({ length: p }, () => Array(p).fill(0)), g = Array(p).fill(0);
      for (let i = 0; i < X.length; i++) {
        const x = X[i], mu = sigmoid(x.reduce((a, v, j) => a + v * w[j], 0)), s = Math.max(mu * (1 - mu), 1e-6);
        for (let a = 0; a < p; a++) { g[a] += (mu - y[i]) * x[a]; for (let c = 0; c < p; c++) H[a][c] += s * x[a] * x[c]; }
      }
      for (let a = 1; a < p; a++) { g[a] += lambda * w[a]; H[a][a] += lambda; }
      const step = solve(H, g); if (!step) break;
      w = w.map((v, j) => v - step[j]);
      if (Math.max(...step.map(Math.abs)) < 1e-6) break;
    }
    return w;
  }
  const rainFeat = vals => { const v = Object.values(vals).filter(fin); if (!v.length) return null; return { frac: v.filter(x => x >= WET).length / v.length, amt: mean(v) }; };
  const pX = f => [1, f.frac, Math.log1p(f.amt)];
  const RAIN = {
    vote: { fit: () => ({}), pred: (p, f) => f.frac },
    logistic: {
      fit(rows) { const wet = rows.reduce((a, r) => a + r.wet, 0); if (wet < 10 || rows.length - wet < 10) return {}; return { w: logisticFit(rows.map(r => pX(r.f)), rows.map(r => r.wet)).map(v => Math.round(v * 1e4) / 1e4) }; },
      pred: (p, f) => (p.w ? sigmoid(pX(f).reduce((a, v, j) => a + v * p.w[j], 0)) : f.frac)
    },
    analog: {
      fit(rows) { if (rows.length < 150 || rows.reduce((a, r) => a + r.wet, 0) < 5) return {}; return { lib: rows.map(r => [r.H, r1(r.f.frac), r1(Math.log1p(r.f.amt)), r.wet]) }; },
      pred(p, f, H) {
        if (!p.lib) return f.frac;
        const q = [f.frac, Math.log1p(f.amt)], best = [];
        for (const x of p.lib) {
          const dh = Math.min(Math.abs(x[0] - H), 24 - Math.abs(x[0] - H)); if (dh > 2) continue;
          const d = (x[1] - q[0]) ** 2 * 4 + (x[2] - q[1]) ** 2;
          if (best.length < 30) { best.push([d, x[3]]); best.sort((a, b) => a[0] - b[0]); } else if (d < best[29][0]) { best[29] = [d, x[3]]; best.sort((a, b) => a[0] - b[0]); }
        }
        return best.length >= 10 ? (best.reduce((a, b) => a + b[1], 0) + 0.5) / (best.length + 1) : f.frac;
      }
    }
  };
  const RAIN_LIVE = ['vote', 'logistic', 'analog'];
  function fitRain(data, opts = {}) {
    const exclude = opts.exclude || new Set(), out = { leads: {} };
    for (const k of LEADS) {
      const ids0 = Object.keys(data.models).filter(id => !exclude.has(id) && data.models[id][k]);
      const dup = findDuplicates(Object.fromEntries(ids0.map(id => [id, data.models[id][k]])), ids0);
      const ids = ids0.filter(id => !dup[id]); if (!ids.length) continue;
      const rows = [];
      for (let i = 0; i < data.times.length; i++) {
        const y = data.truth[i]; if (!fin(y)) continue;
        const vals = {}; for (const id of ids) { const v = data.models[id][k][i]; if (fin(v)) vals[id] = v; }
        const f = rainFeat(vals); if (!f) continue;
        rows.push({ t: data.times[i], H: data.hours[i], f, y, wet: y >= WET ? 1 : 0 });
      }
      if (rows.length < 200) continue;
      const { a, b } = splitTimes(rows);
      const train = rows.filter(r => r.t < a), val = rows.filter(r => r.t >= a && r.t < b), test = rows.filter(r => r.t >= b);
      const fitted = Object.fromEntries(RAIN_LIVE.map(m => [m, RAIN[m].fit(train)]));
      const base = train.reduce((s, r) => s + r.wet, 0) / train.length;
      const pr = (m, r) => RAIN[m].pred(fitted[m], r.f, r.H);
      const brier = (set, f) => (set.length ? mean(set.map(r => (f(r) - r.wet) ** 2)) : null);
      const valS = {}, testS = {};
      for (const m of RAIN_LIVE) { valS[m] = brier(val, r => pr(m, r)); testS[m] = brier(test, r => pr(m, r)); }
      valS.clim = brier(val, () => base); testS.clim = brier(test, () => base);
      const ranked = RAIN_LIVE.filter(m => fin(valS[m])).sort((x, y) => valS[x] - valS[y]).slice(0, 2);
      const comboF = r => mean(ranked.map(m => pr(m, r)));
      valS.combo = brier(val, comboF); testS.combo = brier(test, comboF);
      const cands = [...RAIN_LIVE, 'combo'].filter(m => fin(valS[m]));
      const choice = cands.reduce((x, y) => (valS[y] < valS[x] - 1e-9 ? y : x), cands[0]);
      const choiceF = choice === 'combo' ? comboF : r => pr(choice, r);
      let hit = 0, miss = 0, fa = 0;
      for (const r of test) { const yes = choiceF(r) >= 0.5; if (yes && r.wet) hit++; else if (!yes && r.wet) miss++; else if (yes && !r.wet) fa++; }
      // Rain quantity is a separate forecast problem from rain occurrence.
      // Select the amount correction on validation only; never pick a winner on the test data.
      const amountScale = set => {
        const y = set.reduce((s, r) => s + r.y, 0), f = set.reduce((s, r) => s + r.f.amt, 0);
        return f > 2 ? clamp(y / f, 0.4, 2.5) : 1;
      };
      const checkAmount = (set, scale) => set.length ? {
        mae: r1(mean(set.map(r => Math.abs(r.f.amt * scale - r.y)))),
        rmse: r1(Math.sqrt(mean(set.map(r => (r.f.amt * scale - r.y) ** 2)))),
        bias: r1(mean(set.map(r => r.f.amt * scale - r.y))),
        n: set.length
      } : null;
      const trainScale = amountScale(train), amountValRaw = checkAmount(val, 1), amountValScaled = checkAmount(val, trainScale);
      const amountChoice = amountValScaled && amountValRaw && amountValScaled.mae < amountValRaw.mae ? 'scaled' : 'raw';
      const prod = Object.fromEntries(RAIN_LIVE.map(m => [m, RAIN[m].fit(rows)]));
      const scale = amountScale(rows);
      out.leads[k] = { choice, ranked, prod, scale, amountChoice, base,
        amountVal: {raw:amountValRaw,scaled:amountValScaled},
        amountTest: checkAmount(test, amountChoice==='scaled'?trainScale:1),
        val: mapR(valS), test: mapR(testS), pod: hit + miss ? hit / (hit + miss) : null, far: hit + fa ? fa / (hit + fa) : null,
        wetTest: test.reduce((s, r) => s + r.wet, 0), n: { train: train.length, val: val.length, test: test.length } };
    }
    return out;
  }
  const mapR = s => Object.fromEntries(Object.entries(s).filter(([, v]) => fin(v)).map(([m, v]) => [m, Math.round(v * 1e4) / 1e4]));
  function predictRain(fit, k, vals, H) {
    const f = rainFeat(vals); if (!f) return { prob: null, amount: null, choice: 'none', methods: {} };
    const L = leadFit(fit, k);
    if (!L) return { prob: f.frac, amount: f.amt, choice: 'untrained', methods: { vote: f.frac } };
    const methods = Object.fromEntries(RAIN_LIVE.map(m => [m, RAIN[m].pred(L.prod[m], f, H)]));
    methods.combo = mean(L.ranked.map(m => methods[m]));
    return { prob: methods[L.choice], amount: f.amt * (L.amountChoice === 'raw' ? 1 : L.scale), choice: L.choice, methods };
  }

  /* ------------------------------------------------------------------ station layer */
  function fitStation(past, now) {
    const t = [], h = [], r = [];
    for (let i = 0; i < past.times.length; i++) { if (past.times[i] > now) continue; if (fin(past.obs[i]) && fin(past.model[i])) { t.push(past.times[i]); h.push(past.hours[i]); r.push(past.obs[i] - past.model[i]); } }
    if (r.length < 6) return null;
    const coef = r.length >= 24 ? (ridge(h.map(harm), r, 8) || [mean(r), 0, 0]) : [mean(r), 0, 0];
    const shrink = r.length / (r.length + 12);
    const resid = r.map((v, i) => v - shrink * evalHarm(coef, h[i]));
    const rho = lag1(t, resid);
    const tau = rho != null && rho > 0.05 && rho < 0.995 ? clamp(-1 / Math.log(rho), 2, 18) : 4;
    const last = t.length - 1, age = (now - t[last]) / 3600e3;
    return { coef, shrink, tau, rho, e0: age <= 3 ? resid[last] : 0, t0: t[last], n: r.length, mae: mean(r.map(Math.abs)), maeAfter: mean(resid.map(Math.abs)) };
  }
  function stationCorrection(S, t, hour) {
    if (!S) return 0;
    let c = S.shrink * evalHarm(S.coef, hour);
    if (t >= S.t0) c += S.e0 * Math.exp(-(t - S.t0) / 3600e3 / S.tau);
    return clamp(c, -6, 6);
  }

  /* ------------------------------------------------------------------ ensembles */
  function wq(pts, q) { pts.sort((a, b) => a.x - b.x); let c = 0; for (const p of pts) { c += p.w; if (c >= q) return p.x; } return pts.at(-1)?.x ?? null; }
  function ensembleStats(fams, i, thr = WET) {
    const comps = [];
    for (const f of fams) { const v = f.members.map(m => m[i]).filter(fin); if (v.length >= 3) comps.push(v); }
    if (!comps.length) return null;
    const F = comps.length, mus = comps.map(v => mean(v)), mu = mean(mus);
    let varM = 0; comps.forEach((v, j) => { varM += (mean(v.map(x => (x - mus[j]) ** 2)) + (mus[j] - mu) ** 2) / F; });
    const pooled = []; comps.forEach(v => v.forEach(x => pooled.push({ x, w: 1 / (F * v.length) })));
    return { mean: mu, sd: Math.sqrt(varM), q10: wq(pooled, 0.1), q90: wq(pooled, 0.9), members: pooled.length, systems: F,
      pWet: mean(comps.map(v => v.filter(x => x >= thr).length / v.length)) };
  }
  /* Share of members (equal weight per system) for which test(member, index, family) is true; null = no answer. */
  function ensembleProb(fams, test) {
    const fr = [];
    for (const f of fams) { let n = 0, y = 0; f.members.forEach((m, j) => { const r = test(m, j, f); if (r === null) return; n++; if (r) y++; }); if (n >= 3) fr.push(y / n); }
    return fr.length ? mean(fr) : null;
  }
  function ensembleDailyWet(fams, idx, thr = WET_DAY) {
    return ensembleProb(fams, m => { let s = 0, c = 0; for (const i of idx) if (fin(m[i])) { s += m[i]; c++; } return c >= idx.length * 0.75 && c ? s >= thr : null; });
  }
  /* Standard normal CDF (Abramowitz–Stegun 26.2.17). */
  function ncdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }

  function synthCode({ temp, prob, amount, cloud, codes, pStorm, pSnow, pFog }) {
    const c = (codes || []).filter(fin), n = c.length || 1, share = t => c.filter(t).length / n;
    if ((fin(pStorm) ? pStorm >= 0.35 : share(x => x >= 95) >= 0.25) && prob >= 0.3) return 95;
    if (prob >= 0.45 && amount >= WET) {
      const snow = (fin(pSnow) && pSnow >= 0.5) || (fin(temp) && temp <= 0.5), showers = share(x => x >= 80 && x <= 86) >= 0.4;
      if (snow) return showers ? 85 : amount >= 2 ? 73 : 71;
      if (showers) return amount >= 4 ? 82 : 80;
      if (amount < 0.5 && share(x => x >= 51 && x <= 57) >= 0.3) return 53;
      return amount >= 4 ? 65 : amount >= 1 ? 63 : 61;
    }
    if ((fin(pFog) && pFog >= 0.4) || share(x => x === 45 || x === 48) >= 0.4) return 45;
    if (!fin(cloud)) return c.length ? c.sort((a, b) => a - b)[Math.floor(c.length / 2)] : 3;
    return cloud < 15 ? 0 : cloud < 45 ? 1 : cloud < 80 ? 2 : 3;
  }
  function rhFromDew(t, td) { if (!fin(t) || !fin(td)) return null; const g = x => Math.exp(17.625 * x / (243.04 + x)); return clamp(100 * g(td) / g(t), 0, 100); }
  /* Moon phase 0 = new, 0.5 = full (mean synodic month from the 2000-01-06 new moon). */
  function moonPhase(t) { const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14); const d = (t - ref) / 86400e3; return ((d % syn) + syn) % syn / syn; }
  /* OLS trend with standard error. */
  function trend(xs, ys) {
    const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => fin(x) && fin(y)); if (p.length < 8) return null;
    const mx = mean(p.map(a => a[0])), my = mean(p.map(a => a[1]));
    let sxy = 0, sxx = 0; for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
    const slope = sxy / sxx, res = p.map(([x, y]) => y - (my + slope * (x - mx)));
    return { slope, intercept: my - slope * mx, se: Math.sqrt(res.reduce((a, r) => a + r * r, 0) / (p.length - 2) / sxx), n: p.length };
  }

  const api = { WET, WET_DAY, LEADS, LIVE, RAIN_LIVE, mean, clamp, sigmoid, solve, ridge, fitDiurnal, evalHarm, lag1, findDuplicates,
    buildRows, fitVariable, predictVariable, fitRain, predictRain, logisticFit, kalmanRun, fitStation, stationCorrection,
    ensembleStats, ensembleProb, ensembleDailyWet, ncdf, synthCode, rhFromDew, leadFit, moonPhase, trend };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MONOModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
