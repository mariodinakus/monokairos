const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Trust = require('../trust-hub.js');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('trust card shows one panel at a time and drops empty tabs', () => {
  const html = Trust.render([{ id: 'a', label: 'A', html: '<p>one</p>' }, { id: 'b', label: 'B', html: '' }, { id: 'c', label: 'C', html: '<p>three</p>' }], { active: 'c', lang: 'el' });
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, /aria-selected="true" data-action="trustTab" data-v="c"/);
  assert.match(html, /<p>three<\/p>/);
  assert.doesNotMatch(html, /<p>one<\/p>/);
  assert.equal(Trust.render([{ id: 'x', label: 'X', html: '' }]), '');
});

const station = (over = {}) => ({ available: true, station: { icao: 'LGTS', name: 'Thessaloniki' }, days: 30, hours: 718, hit: 0.8, hitMean: 0.86, mae: 1.3, maeMean: 1.06, bias: 0.65,
  corrected: { days: 23, hours: 552, hit: 0.85, mae: 1.1, bias: -0.15, hitMean: 0.87, maeMean: 1.02 },
  records: Array.from({ length: 30 }, (_, i) => ({ day: 'd' + i, mae: 1 + (i % 3) / 2, maeMean: 1, ...(i > 7 ? { maeCor: 1 } : {}) })), ...over });

test('station tab reports MONO honestly, including when the model average wins', () => {
  const el = Trust.station(station(), { lang: 'el' });
  assert.match(el, /85%/);
  assert.match(el, /MONO \+ διόρθωση σταθμού/);
  assert.match(el, /ο απλός μέσος όρος των μοντέλων τα πήγε λίγο καλύτερα/);
  assert.match(el, /LGTS/);
  const better = Trust.station(station({ corrected: { days: 23, hours: 552, hit: 0.9, mae: 0.8, bias: 0, hitMean: 0.87, maeMean: 1.02 } }), { lang: 'en' });
  assert.match(better, /Better than the plain model average/);
  assert.equal(Trust.station({ available: false }), '');
});

test('home uses the single trust card instead of separate confidence cards', () => {
  const app = read('app.js'), start = app.indexOf('function nowPage()'), now = app.slice(start, app.indexOf('\nfunction ', start + 10));
  assert.match(now, /trustCard\(\)/);
  assert.doesNotMatch(now, /reliabilityCard\(\) \+ yesterdayCard\(\)/);
  assert.doesNotMatch(now, /MONOForecastConfidence\?\.render/);
});

test('space code is loaded on demand and not shown on the home screen', () => {
  const html = read('index.html'), app = read('app.js');
  for (const f of ['astronomy.min.js', 'sky.js', 'cosmic.js', 'space-control.js', 'gravity-observatory.js', 'history-backtest.js', 'model-insights.js']) {
    assert.doesNotMatch(html, new RegExp(f.replace(/\./g, '\\.')), f + ' must not load eagerly');
    assert.match(app, new RegExp("LAZY_GROUPS[\\s\\S]*" + f.replace(/\./g, '\\.')), f + ' must be in a lazy group');
  }
  assert.doesNotMatch(app, /MonoSpaceWeather\.miniCard/);
});

test('asset versions, service-worker precache and visible version are stamped and consistent', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/stamp-assets.cjs'), '--check'], { stdio: 'pipe' });
  const v = JSON.parse(read('package.json')).version, short = 'v' + v.split('.').slice(0, 2).join('.');
  const html = read('index.html'), sw = read('sw.js');
  assert.equal((html.match(/data-mono-version>([^<]+)</g) || []).filter(x => !x.includes(short)).length, 0);
  assert.match(sw, new RegExp(`mono-weather-${v.replace(/\./g, '\\.')}-[0-9a-f]{8}`));
  for (const m of html.matchAll(/(?:src|href)="((?:vendor\/)?[\w.-]+\.(?:js|css)\?v=[0-9a-f]{10})"/g)) assert.ok(sw.includes('./' + m[1]), m[1] + ' must be precached');
  assert.doesNotMatch(html, /WEATHER · v4\.0/);
});

test('release pages exist and the privacy notice covers the new device features', () => {
  for (const f of ['about.html', '404.html']) assert.ok(fs.existsSync(path.join(root, f)), f);
  const p = read('privacy.html');
  assert.match(p, /Ειδοποιήσεις βροχής/);
  assert.match(p, /Web Analytics/);
  assert.doesNotMatch(p + read('terms.html'), /window\.va\s*=/, 'inline scripts are blocked by the CSP');
  assert.match(read('privacy.js'), /mono-alerts/);
  assert.match(read('sitemap.xml'), /\/about</);
});

test('proxied model feeds use ~1 km rounding so visitors share the CDN cache', () => {
  const app = read('app.js');
  for (const name of ['modelURL', 'modelBatchURL', 'ensURL']) assert.match(app, new RegExp(`const ${name} = [^\\n]*\\.\\.\\.llp\\(c\\)`), name);
});
