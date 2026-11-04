'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('phone viewport and layout refinement are in the PWA app shell', () => {
  const html = read('index.html');
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(html, /class="mobile-brand"/);
  assert.match(html, /mobile-polish\.css\?v=\d+\.\d+/);
  const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x => x[1]);
  assert.match(cssFiles.at(-1), /^mobile-polish\.css/);
});

test('app scripts defer while retaining declared execution order', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\s+(?:defer\s+)?src="([^"]+)"/g)].map(x => x[0]);
  assert.ok(scripts.length >= 20, 'should keep all existing app modules');
  assert.ok(scripts.slice(0, -1).every(x => /<script defer src=/.test(x)));
  assert.ok(scripts.some(x => /app\.js\?v=\d+\.\d+/.test(x)), 'versioned app JS should load');
});

test('mobile stylesheet is scoped and search field is readable on phones', () => {
  const css = read('mobile-polish.css');
  assert.match(css, /@media \(max-width: 610px\)/);
  assert.match(css, /grid-template-rows: 45px 46px/);
  assert.match(css, /\.search-area input\s*\{[^}]*font-size:\s*16px/s);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /overflow-x:\s*auto/);
});

test('new PWA cache precaches the mobile stylesheet', () => {
  const sw = read('sw.js');
  assert.match(sw, /mono-weather-v\d+\.\d+/);
  assert.match(sw, /\.\/mobile-polish\.css/);
});

test('the mobile app bar has one brand row and keeps native bell and settings accessible', () => {
  const app = read('app.js');
  const css = read('mobile-polish.css');
  const html = read('index.html');
  assert.match(app, /function installMobileUtilityMenu\(/);
  assert.match(app, /items\.append\(language, theme\)/);
  assert.match(app, /installMobileUtilityMenu\(\);/);
  assert.match(css, /\.mobile-utility-menu\[open\]/);
  assert.match(css, /\.native-notification-btn/);
  assert.match(css, /grid-template-rows:\s*40px 43px/);
  assert.match(html, /class="mobile-brand"/);
  assert.match(html, /class="search-area"/);
});
