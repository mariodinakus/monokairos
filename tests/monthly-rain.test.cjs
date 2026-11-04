const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Rain = require('../monthly-rain.js');

function fixture(month = 11) {
  const time = [], rain_sum = [];
  for (let y = 1991; y <= 2020; y++) {
    const days = new Date(Date.UTC(y, month, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) {
      time.push(`${y}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      rain_sum.push(d === 1 ? y - 1990 : 0);
    }
  }
  return { time, rain_sum };
}

test('averages whole monthly rain totals, wet days and the middle historical range', () => {
  const n = Rain.summarize(fixture())[11];
  assert.equal(n.years, 30);
  assert.equal(n.average, 15.5);
  assert.equal(n.rainyDays, 1);
  assert.equal(n.q25, 8.25);
  assert.equal(n.q75, 22.75);
  assert.equal(Rain.summarize(fixture())[10], null);
});

test('leap days and zero-rain months count correctly', () => {
  const days = fixture(2); days.rain_sum.fill(0);
  const n = Rain.summarize(days)[2];
  assert.equal(n.years, 30);
  assert.equal(n.average, 0);
  assert.equal(n.rainyDays, 0);
});

test('requires at least 24 fully covered years and rejects nulls, invalid values and duplicates', () => {
  const data = fixture();
  for (let y = 1991; y <= 1996; y++) data.rain_sum[data.time.indexOf(`${y}-11-02`)] = null;
  assert.equal(Rain.summarize(data)[11].years, 24);
  data.rain_sum[data.time.indexOf('1997-11-02')] = -1;
  assert.equal(Rain.summarize(data)[11], null);
  const dup = fixture(); dup.time.push('1991-11-01'); dup.rain_sum.push(1);
  assert.equal(Rain.summarize(dup)[11].years, 29);
  assert.throws(() => Rain.summarize({time:['2000-11-01'],rain_sum:[]}), /invalid/);
});

test('month selection follows the selected location timezone and display escapes names', () => {
  const now = Date.parse('2026-10-31T22:30:00Z');
  assert.equal(Rain.localMonth(now, 'UTC'), 10);
  assert.equal(Rain.localMonth(now, 'Europe/Athens'), 11);
  const html = Rain.render({status:'ready',normals:Rain.summarize(fixture())}, {lang:'el',zone:'Europe/Athens',now,city:'<Test>'});
  assert.match(html, /ΝΟΕΜΒΡΙΟΣ/);
  assert.match(html, /&lt;Test&gt;/);
  assert.match(html, /15,5/);
  assert.match(html, /1991–2020/);
  assert.match(html, /30\/30 πλήρη έτη/);
  assert.match(html, /όχι μετρήσεις συγκεκριμένου σταθμού/);
  assert.match(html, /≥1 mm/);
});

test('unavailable and insufficient history show no invented numbers and support retry', () => {
  assert.match(Rain.render({status:'error'}, {lang:'en'}), /Try again/);
  assert.match(Rain.render({status:'ready',normals:{}}, {lang:'el'}), /Δεν υπάρχουν αρκετά πλήρη/);
  assert.match(Rain.render({status:'loading'}, {lang:'el'}), /Φόρτωση/);
  const poisoned = {status:'ready',normals:{11:{average:3,rainyDays:2,q25:1,q75:5,years:'<script>'}}};
  assert.doesNotMatch(Rain.render(poisoned, {now:Date.parse('2026-11-01T00:00:00Z')}), /<script>/);
});

test('archive request pins the model, 30-year period and rain variable; errors stay errors', async () => {
  let called;
  const normals = await Rain.load({lat:40.64,lon:22.94}, async url => {
    called = new URL(url);
    return {ok:true,json:async()=>({daily:fixture()})};
  });
  assert.equal(normals[11].average, 15.5);
  assert.equal(called.origin, 'https://archive-api.open-meteo.com');
  assert.equal(called.searchParams.get('start_date'), '1991-01-01');
  assert.equal(called.searchParams.get('end_date'), '2020-12-31');
  assert.equal(called.searchParams.get('models'), 'era5');
  assert.equal(called.searchParams.get('daily'), 'rain_sum');
  await assert.rejects(Rain.load({lat:40,lon:22}, async () => ({ok:false})), /unavailable/);
  await assert.rejects(Rain.load({lat:null,lon:22}, async () => {throw new Error('should not fetch');}), /invalid location/);
});

test('the feature is connected to the Now page and opt-in cache cleanup', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.match(read('index.html'), /monthly-rain\.js/);
  assert.match(read('sw.js'), /monthly-rain\.js/);
  assert.match(read('app.js'), /MONOMonthlyRain\?\.render\(state\.monthlyRain/);
  assert.match(read('privacy.js'), /mono31_monthly_rain/);
});


test('recent ERA5 request covers 26 months for year-on-year comparison and retains old consumer shape', async () => {
  let url;
  const result = await Rain.loadRecent({lat:40.64,lon:22.94}, async value => {
    url = new URL(value);
    return {ok:true,json:async()=>({timezone:'Europe/Athens',daily:{time:['2026-10-01','2026-10-02'],rain_sum:[2.5,0]}})};
  });
  assert.equal(url.searchParams.get('models'),'era5');
  assert.equal(url.searchParams.get('daily'),'rain_sum');
  assert.ok(Date.parse(url.searchParams.get('end_date'))-Date.parse(url.searchParams.get('start_date'))>700*86400e3);
  assert.deepEqual(result.precipitation_sum,[2.5,0]);
  assert.equal(result.model,'era5');
});

function syntheticDays(start, end, skip = new Set()) {
  const time = [], precipitation_sum = [];
  for(let d = new Date(start+'T12:00:00Z');d<=new Date(end+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1)){
    const day=d.toISOString().slice(0,10);
    if(skip.has(day))continue;
    time.push(day);
    precipitation_sum.push(1);
  }
  return {time,precipitation_sum};
}

test('monthly totals are calculated from full daily coverage, never filling missing days or extrapolating partial months', () => {
  const now=Date.parse('2026-11-04T13:00:00Z');
  const daily=syntheticDays('2024-09-01','2026-11-03');
  const rows=Rain.monthlySeries(daily,now,'Europe/Athens');
  assert.equal(rows.length,12);
  assert.equal(rows[0].year,2025);
  assert.equal(rows[0].month,12);
  const oct=rows.find(r=>r.year===2026&&r.month===10);
  assert.equal(oct.amount,31);
  assert.equal(oct.complete,true);
  assert.equal(oct.previous.amount,31);
  assert.equal(oct.previous.complete,true);
  const nov=rows.at(-1);
  assert.equal(nov.month,11);
  assert.equal(nov.amount,3);
  assert.equal(nov.coverage,3);
  assert.equal(nov.days,30);
  assert.equal(nov.complete,false);
  const missing=Rain.monthlySeries(syntheticDays('2024-09-01','2026-11-03',new Set(['2026-10-12'])),now,'Europe/Athens');
  const broken=missing.find(r=>r.year===2026&&r.month===10);
  assert.equal(broken.coverage,30);
  assert.equal(broken.complete,false);
  assert.equal(broken.amount,30);
});

test('monthly comparison shows full-month totals, historic normals and clearly marked incomplete periods', () => {
  const now=Date.parse('2026-11-04T13:00:00Z');
  const recent={status:'ready',daily:syntheticDays('2024-09-01','2026-11-03')};
  const normals={status:'ready',normals:Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,{average:40}]))};
  const html=Rain.renderComparison(recent,normals,{lang:'el',zone:'Europe/Athens',now,city:'Θεσσαλονίκη <test>'});
  assert.match(html,/Πόση βροχή έπεσε κάθε μήνα/);
  assert.match(html,/1991–2020/);
  assert.match(html,/&lt;test&gt;/);
  assert.match(html,/31/);
  assert.match(html,/3\/30/);
  assert.match(html,/Οι μήνες με \*/);
  assert.match(html,/12 μηνών/);
  assert.doesNotMatch(html,/<test>/);
  assert.match(Rain.renderComparison({status:'error'},null,{lang:'en'}),/unavailable/);
});

test('monthly comparisons are wired into both Now and Rain pages and bust the history cache', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.equal((read('app.js').match(/MONOMonthlyRain\?\.renderComparison/g)||[]).length,2);
  assert.match(read('app.js'),/cached\.daily\?\.time\?\.length >= 700/);
});
