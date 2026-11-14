'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { highlights } = require('../home-insights.js');
const HOUR = 3600e3;
const now = Date.UTC(2026, 10, 15, 10);

test('highlights the actual forecast hour and value for meaningful conditions', () => {
  const rows = [
    { t: now + HOUR, pop: .61, gust: 51, temp: 12 },
    { t: now + 2 * HOUR, pop: .83, gust: 70, temp: -1 },
    { t: now + 3 * HOUR, pop: .72, gust: 30, temp: 36 }
  ];
  assert.deepEqual(highlights(rows, now), [
    { kind:'rain', t:now + 2 * HOUR, value:.83 },
    { kind:'gust', t:now + 2 * HOUR, value:70 },
    { kind:'hot', t:now + 3 * HOUR, value:36 },
    { kind:'cold', t:now + 2 * HOUR, value:-1 }
  ]);
});

test('does not invent a warning from missing, invalid, past or distant values', () => {
  const rows = [
    { t:now - HOUR, pop:.9, gust:80, temp:40 },
    { t:now + 25 * HOUR, pop:.9, gust:80, temp:40 },
    { t:now + HOUR, pop:null, gust:null, temp:null },
    { t:now + 2 * HOUR, pop:1.5, gust:-1, temp:20 }
  ];
  assert.deepEqual(highlights(rows, now), []);
  assert.deepEqual(highlights(null, now), []);
});

test('quiet forecasts show no highlights and duplicate peaks choose the first hour', () => {
  assert.deepEqual(highlights([{t:now + HOUR, pop:.59, gust:49, temp:1}], now), []);
  const result = highlights([{t:now + 3 * HOUR,pop:.7},{t:now + HOUR,pop:.7}], now);
  assert.deepEqual(result, [{kind:'rain',t:now + HOUR,value:.7}]);
});
