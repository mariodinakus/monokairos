'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = {};
const sandbox = { window: root };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../history-backtest.js'), 'utf8'), sandbox);
const H = root.MONOHistoryBacktest;
const stamp = Date.UTC(2026, 9, 1);
const normal = {
  n: { train: 240, val: 80, test: 80 },
  choice: 'ridge',
  test: { ridge: { mae: 1.1, rmse: 1.45 }, mean: { mae: 1.56 } },
  holdout: Array.from({ length: 20 }, (_, i) => [
    stamp + i * 21600000, 15 + Math.sin(i / 3), 16 + Math.sin(i / 3), 15.5 + Math.sin(i / 3)
  ])
};
const rain = {
  n: normal.n,
  choice: 'vote',
  test: { vote: 0.16, clim: 0.21 },
  holdout: Array.from({ length: 20 }, (_, i) => [
    stamp + i * 21600000, i % 6 ? 0.1 : 0.7, i % 6 ? 0 : 1, 0.7, i % 6 ? 0 : 0.7
  ])
};
const train = {
  days: 62, start: '2026-09-01', end: '2026-10-30',
  temp: { leads: { 1: normal } }, wind: { leads: { 1: normal } },
  precip: { leads: { 1: rain } }
};

for (const variable of ['temp', 'wind', 'rain']) {
  test('Historical ' + variable + ' metrics, chart and CSV action render', () => {
    const html = H.render({ train, lead: 1, lang: 'el', days: 62, variable, order: 'worst', status: 'done' });
    assert.ok(html.includes('hbForecastFill'));
    assert.ok(html.includes('hb-stat-primary'));
    assert.ok(html.includes('data-action="historyCsv"'));
    assert.ok(html.includes('data-action="historyOrder"'));
    assert.ok(html.includes('hb-error'));
  });
}

test('Changing history window while downloading leaves old results clearly marked', () => {
  const html = H.render({
    train, lead: 1, lang: 'el', days: 180, variable: 'temp',
    progress: { phase: 'download', complete: 5, total: 15 }, status: 'loading'
  });
  assert.ok(html.includes('data-hb-progress-meter'));
  assert.ok(html.includes('33%'));
  assert.ok(html.includes('προηγούμενο ιστορικό'));
  assert.ok(html.includes('disabled'));
});

test('Empty screen never attributes fabricated results to an untrained model', () => {
  const html = H.render({ train: null, lead: 1, lang: 'el', days: 180, variable: 'temp', status: 'loading' });
  assert.ok(html.includes('Αναμονή πραγματικών αποτελεσμάτων'));
  assert.ok(!html.includes('προηγούμενο ιστορικό'));
  assert.ok(!html.includes('hb-stat-primary'));
});

test('Download progress changes only three small DOM nodes', () => {
  const label = { textContent: '' }, meter = { style: {} }, percentage = { textContent: '' };
  const selectors = {
    '[data-hb-progress-label]': label,
    '[data-hb-progress-meter]': meter,
    '[data-hb-progress-percent]': percentage
  };
  let reads = 0;
  sandbox.document = {
    getElementById(id) {
      assert.equal(id, 'hb-training-status');
      reads += 1;
      return { querySelector(s) { return selectors[s]; } };
    }
  };
  H.updateProgress({ lang: 'el', status: 'loading', progress: { phase: 'download', complete: 12, total: 15 } });
  assert.equal(reads, 1);
  assert.equal(label.textContent, 'Λήψη ιστορικών μοντέλων: 12 / 15');
  assert.equal(meter.style.width, '80%');
  assert.equal(percentage.textContent, '80%');
});

test('ML prefers worker and history fetch ticks avoid full recomputation', () => {
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.ok(app.includes("if (state.page === 'history') return;"));
  assert.ok(app.includes("window.MONOHistoryBacktest?.updateProgress"));
  assert.ok(!app.includes("location.protocol === 'file:' || window.ICONS"));
  assert.ok(app.includes('restoreHistoricCache(state.city)'));
});
