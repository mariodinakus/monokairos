'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Sky = require('../sky-window.js');
const lat = 40.64, lon = 22.94;                       // Thessaloniki
const at = (d, h, m = 0) => Date.UTC(2026, 10, d, h, m);

test('sun position: Thessaloniki sets around 17:00 local (15:00 UTC) in late November', () => {
  let t = at(24, 12);
  while (Sky.sunPosition(t, lat, lon).elevation > -0.833) t += 60e3;
  const minutes = new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes();
  assert.ok(minutes >= 14 * 60 + 55 && minutes <= 15 * 60 + 10, 'sunset ' + new Date(t).toISOString());
  const noon = Sky.sunPosition(at(24, 10, 15), lat, lon).elevation;
  assert.ok(noon > 28.3 && noon < 29.2, 'winter noon elevation ' + noon);   // 90 − 40.64 − 20.6° declination
});

test('moon phase matches known full and new moons', () => {
  assert.ok(Math.abs(Sky.moonPhase(Date.UTC(2026, 10, 24, 14, 53)) - 0.5) < 0.02, 'full moon 24 Nov 2026');
  const p = Sky.moonPhase(Date.UTC(2026, 11, 9, 0, 52));
  assert.ok(p < 0.02 || p > 0.98, 'new moon 9 Dec 2026: ' + p);
});

test('clear noon: blue sky, visible sun, no stars, rain or fog', () => {
  const s = Sky.scene({ now: at(24, 10), lat, lon, code: 0, cloud: 2 });
  assert.ok(s.sun && s.sun.y < 0.5, 'sun rides in the upper half');
  assert.equal(s.moon, null);
  assert.equal(s.stars, 0);
  assert.equal(s.precip, null);
  assert.equal(s.fog, 0);
  assert.ok(s.sky.top[2] > s.sky.top[0] + 100, 'blue overhead');
});

test('clear night: stars and the full moon, no sun', () => {
  const s = Sky.scene({ now: at(24, 21), lat, lon, code: 0, cloud: 0 });
  assert.equal(s.sun, null);
  assert.ok(s.moon && Math.abs(s.moon.phase - 0.5) < 0.03);
  assert.ok(s.stars > 0.9);
  assert.ok(Math.max(...s.sky.top) < 30, 'dark sky');
});

test('dusk turns the horizon warm', () => {
  const s = Sky.scene({ now: at(24, 14, 58), lat, lon, code: 0, cloud: 0 });
  assert.ok(s.sky.bottom[0] > s.sky.bottom[2] + 60, 'orange horizon ' + s.sky.bottom);
});

test('rain intensity follows the code and measured rate, slanted by the real wind', () => {
  const light = Sky.scene({ now: at(24, 11), lat, lon, code: 61, cloud: 100, wind: 0 });
  const heavy = Sky.scene({ now: at(24, 11), lat, lon, code: 61, cloud: 100, rate: 10, wind: 40, dir: 270 });
  assert.equal(light.precip.kind, 'rain');
  assert.ok(heavy.precip.intensity > light.precip.intensity + 0.4);
  assert.ok(heavy.precip.tilt > 0.3, 'westerly wind blows the rain to the right');
  const easterly = Sky.scene({ now: at(24, 11), lat, lon, code: 61, wind: 40, dir: 90 });
  assert.ok(easterly.precip.tilt < -0.3);
  assert.ok(heavy.wind.drift > 0 && easterly.wind.drift < 0, 'clouds drift with the wind');
});

test('a measured rate shows rain even when the code lags; tiny rates do not', () => {
  assert.equal(Sky.scene({ now: at(24, 11), lat, lon, code: 3, rate: 1.2 }).precip.kind, 'rain');
  assert.equal(Sky.scene({ now: at(24, 11), lat, lon, code: 3, rate: 0.05 }).precip, null);
});

test('snow, fog and storms', () => {
  assert.equal(Sky.scene({ now: at(24, 8), lat, lon, code: 73 }).precip.kind, 'snow');
  assert.equal(Sky.scene({ now: at(24, 8), lat, lon, code: 63, temp: -1 }).precip.kind, 'snow', 'rain at sub-zero falls as snow');
  const fog = Sky.scene({ now: at(24, 7), lat, lon, code: 45 });
  assert.ok(fog.fog > 0.5);
  const storm = Sky.scene({ now: at(24, 13), lat, lon, code: 95, cloud: 100 });
  assert.equal(storm.storm, true);
  const plain = Sky.scene({ now: at(24, 13), lat, lon, code: 3, cloud: 100 });
  assert.ok(Math.max(...storm.sky.top) < Math.max(...plain.sky.top), 'storms darken the sky');
});

test('overcast hides stars and veils the sun; missing data does not throw', () => {
  const s = Sky.scene({ now: at(24, 21), lat, lon, code: 3, cloud: 100 });
  assert.equal(s.stars, 0);
  assert.ok(Math.max(...s.sky.top) > 15, 'cloudy city nights glow grey');
  assert.ok(Sky.scene({ now: at(24, 10), lat, lon, code: 3, cloud: 100 }).sun.veil > 0.8);
  const bare = Sky.scene({});
  assert.ok(bare && bare.sky && bare.sun === null && bare.precip === null);
  assert.ok(Sky.scene({ isDay: 0 }).stars > 0);
});

test('accessible description names what is shown', () => {
  assert.equal(Sky.describe(Sky.scene({ now: at(24, 11), lat, lon, code: 95, cloud: 100 })), 'Ζωντανός ουρανός: μέρα, συννεφιά, βροχή, καταιγίδα');
  assert.match(Sky.describe(Sky.scene({ now: at(24, 21), lat, lon, code: 0, cloud: 0 }), 'en'), /^Live sky: starry night.*moon$/);
});

test('home hero mounts the sky, with a remembered on/off toggle', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="sky-window\.css\?v=[a-f0-9]+">/);
  assert.match(html, /<script defer src="sky-window\.js\?v=[a-f0-9]+"><\/script>\s*<script defer src="app\.js/);
  assert.match(app, /mountLivingSky\(waiting\.length\);/);
  assert.match(app, /a === 'livingSky'.*write\('mono_living_sky', livingSkyOn\)/);
  assert.match(app, /data-action="livingSky" aria-pressed="\$\{livingSkyOn\}"/);
});
