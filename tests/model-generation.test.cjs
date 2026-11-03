'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const marker = 'const modelFeedCurrent = ';
const helperStart = source.indexOf(marker);
const helperEnd = source.indexOf('\n', helperStart);
const groupStart = source.indexOf('async function loadModelGroup(c, group, token) {');
const groupEnd = source.indexOf('let primaryRetryCount = 0;', groupStart);
assert.ok(helperStart > 0 && groupStart > helperEnd && groupEnd > groupStart,
  'expected model lifecycle helper and model batch function');

function harness() {
  const city = {lat: 40.6401, lon: 22.9444};
  const state = {gen: 4, modelEpoch: 7, city, models: {}};
  const hour = [1762200000, 1762203600];
  const hourly = {
    time: hour,
    temperature_2m_ecmwf_ifs: [16.2, 15.6],
    temperature_2m_ncep_gfs_seamless: [17.1, 16.3],
  };
  let onRequest = () => {};
  const context = {
    state,
    ckey: c => Number(c.lat).toFixed(3) + ',' + Number(c.lon).toFixed(3),
    HV: 'temperature_2m,precipitation',
    modelBatchURL: () => '/proxy/mono-forecast',
    modelURL: () => '/proxy/mono-forecast',
    getJSON: async () => { onRequest(); return {timezone: 'UTC', hourly}; },
    chain: async ids => ({id: ids[0], data: {hourly: {time:hour,temperature_2m:[1,2]}}}),
    schedule: () => {},
  };
  vm.runInNewContext(
    source.slice(helperStart, helperEnd) + '\n' +
    source.slice(groupStart, groupEnd) + '\n' +
    'this.loadModelGroup = loadModelGroup; this.modelFeedCurrent = modelFeedCurrent;',
    context, {filename: 'app-model-loader.js', timeout: 2000}
  );
  return {city, state, loadModelGroup: context.loadModelGroup, setRequest: f => {onRequest = f;}};
}
const group = [
  {id:'ecmwf_ifs',alt:[]},
  {id:'ncep_gfs_seamless',alt:['gfs_seamless']},
];

test('model batch results survive a newer main-forecast generation', async () => {
  const h = harness();
  h.setRequest(() => { h.state.gen += 1; });
  await h.loadModelGroup(h.city, group, 7);
  assert.equal(h.state.gen, 5);
  assert.equal(h.state.models.ecmwf_ifs.data.hourly.temperature_2m[0], 16.2);
  assert.equal(h.state.models.ncep_gfs_seamless.data.hourly.temperature_2m[0], 17.1);
});

test('stale model generation is rejected after a new model run starts', async () => {
  const h = harness();
  h.setRequest(() => {h.state.modelEpoch = 8;});
  await h.loadModelGroup(h.city, group, 7);
  assert.equal(Object.keys(h.state.models).length, 0);
});

test('model batches from a previous city must not populate the new city', async () => {
  const h = harness();
  h.state.city = {lat: 37.9838, lon: 23.7275};
  await h.loadModelGroup(h.city, group, 7);
  assert.equal(Object.keys(h.state.models).length, 0);
});
