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
  assert.match(html,/Τελευταίοι 12 μήνες/);
  assert.doesNotMatch(html,/<test>/);
  assert.match(Rain.renderComparison({status:'error'},null,{lang:'en'}),/unavailable/);
});

test('monthly comparisons are wired into both Now and Rain pages and bust the history cache', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.equal((read('app.js').match(/MONOMonthlyRain\?\.renderComparison/g)||[]).length,2);
  assert.match(read('app.js'),/cached\.daily\?\.time\?\.length >= 700/);
});


test('historical rain analogs compare complete non-overlapping seven-day ERA5 windows without extrapolation', () => {
  const data=syntheticDays('2024-09-01','2026-11-12');
  const result=Rain.findRainAnalogs(data,Date.parse('2026-11-15T01:00:00Z'),'Europe/Athens');
  assert.equal(result.reference.end,'2026-11-12');
  assert.equal(result.reference.total,7);
  assert.equal(result.reference.rainyDays,7);
  assert.equal(result.matches.length,3);
  for(const p of result.matches){
    assert.equal(p.total,7);
    assert.equal(p.rmse,0);
    assert.ok(p.end < '2026-10-24');
  }
  assert.ok(result.matches[0].end < result.matches[1].start || result.matches[1].end < result.matches[0].start);
});

test('rain analogs reject incomplete daily windows and duplicate dates, and never fabricate unavailable matches', () => {
  const sparse=syntheticDays('2026-10-01','2026-11-10',new Set(['2026-11-09']));
  const r=Rain.findRainAnalogs(sparse,Date.parse('2026-11-12T12:00:00Z'),'UTC');
  assert.equal(r.reference.end,'2026-11-08');
  const dup=syntheticDays('2026-11-01','2026-11-10');
  dup.time.push('2026-11-10');dup.precipitation_sum.push(99);
  assert.equal(Rain.findRainAnalogs(dup,Date.parse('2026-11-11T12:00:00Z'),'UTC').reference.end,'2026-11-09');
  assert.equal(Rain.findRainAnalogs({time:['2026-11-10'],precipitation_sum:[2]},Date.parse('2026-11-11T12:00:00Z')),null);
  assert.equal(Rain.findRainAnalogs({time:['2026-11-10'],precipitation_sum:[null]},Date.parse('2026-11-11T12:00:00Z')),null);
});

test('rain analog section is compact, truthful, translated, and wired to the rain page', () => {
 const recent={status:'ready',daily:syntheticDays('2024-09-01','2026-11-12')};
 const html=Rain.renderComparison(recent,{status:'error'}, {lang:'el',zone:'Europe/Athens',now:Date.parse('2026-11-15T12:00:00Z')});
 assert.match(html,/Παρόμοια 7ήμερα βροχής/);
 assert.match(html,/Μόνο ιστορική βροχή ERA5/);
 assert.match(html,/RMSE/);
 assert.match(html,/data-rain-analogs/);
 assert.doesNotMatch(html,/συνολική πρόγνωση ακριβείας/);
 const english=Rain.renderRainAnalogs(recent,{lang:'en',now:Date.parse('2026-11-15T12:00:00Z')});
 assert.match(english,/Similar historical rain weeks/);
 assert.equal(Rain.renderRainAnalogs({status:'loading'}),'');
});

test('recent ERA5 uses one request for rain, daily mean temperature and maximum wind', async () => {
 let url;
 const result=await Rain.loadRecent({lat:40.65,lon:22.94},async input=>{
   url=new URL(input);
   return {ok:true,json:async()=>({timezone:'Europe/Athens',daily:{
     time:['2026-11-01','2026-11-02'],rain_sum:[1,0],
     temperature_2m_mean:[15,17],wind_speed_10m_max:[22,31]
   }})};
 });
 assert.equal(url.searchParams.get('models'),'era5');
 assert.equal(url.searchParams.get('daily'),'rain_sum,temperature_2m_mean,wind_speed_10m_max');
 assert.deepEqual(result.temperature_2m_mean,[15,17]);
 assert.deepEqual(result.wind_speed_10m_max,[22,31]);
 assert.equal(result.weatherFieldsRequested,true);
 assert.deepEqual(result.precipitation_sum,[1,0]);
});

function fullWeather(start,end,skip=new Set()){
 const r=syntheticDays(start,end,skip);
 r.temperature_2m_mean=r.time.map((_,i)=>12+Math.sin(i/10));
 r.wind_speed_10m_max=r.time.map((_,i)=>16+i%11);
 return r;
}
test('whole-weather analogs compare temperature, wind and rain across complete nonoverlapping weeks',()=>{
 const now=Date.parse('2026-11-15T12:00:00Z');
 const r=Rain.findWeatherAnalogs(fullWeather('2025-09-01','2026-11-12'),now,'Europe/Athens');
 assert.equal(r.reference.end,'2026-11-12');
 assert.equal(r.matches.length,3);
 assert.ok(r.matches.every(m=>Number.isFinite(m.tempRmse)&&Number.isFinite(m.windRmse)&&Number.isFinite(m.rainRmse)));
 assert.ok(r.matches.every(m=>m.end<='2026-10-23'));
 for(let i=0;i<r.matches.length;i++)for(let j=i+1;j<r.matches.length;j++){
   assert.ok(r.matches[i].end<r.matches[j].start||r.matches[j].end<r.matches[i].start);
 }
});
test('weather analogs require matching valid daily values and never treat missing days as zero',()=>{
 assert.equal(Rain.findWeatherAnalogs({time:['2026-11-10'],precipitation_sum:[0]}),null);
 const r=fullWeather('2026-10-01','2026-11-10',new Set(['2026-11-09']));
 const out=Rain.findWeatherAnalogs(r,Date.parse('2026-11-12T12:00:00Z'));
 assert.equal(out.reference.end,'2026-11-08');
 const bad=fullWeather('2026-11-01','2026-11-10');
 bad.wind_speed_10m_max[9]=null;
 assert.equal(Rain.findWeatherAnalogs(bad,Date.parse('2026-11-12T12:00:00Z')).reference.end,'2026-11-09');
 const dup=fullWeather('2026-11-01','2026-11-10');
 dup.time.push('2026-11-10');dup.precipitation_sum.push(7);dup.temperature_2m_mean.push(22);dup.wind_speed_10m_max.push(12);
 assert.equal(Rain.findWeatherAnalogs(dup,Date.parse('2026-11-12T12:00:00Z')).reference.end,'2026-11-09');
});
test('historical weather analysis is transparent about units, sample limits, and is translated',()=>{
 const daily=fullWeather('2025-08-01','2026-11-12');
 const recent={status:'ready',daily},now=Date.parse('2026-11-15T12:00:00Z');
 const el=Rain.renderComparison(recent,{status:'error'},{lang:'el',zone:'Europe/Athens',now});
 assert.match(el,/data-weather-analogs/);
 assert.match(el,/Παρόμοια 7ήμερα: βροχή, θερμοκρασία και άνεμος/);
 assert.match(el,/RMSE/);
 assert.match(el,/όχι πρόγνωση/);
 const en=Rain.renderWeatherAnalogs(recent,{lang:'en',now});
 assert.match(en,/Similar 7-day weather/);
 assert.match(en,/not a forecast/);
 assert.equal(Rain.renderWeatherAnalogs({status:'loading'}),'');
});
test('old cached rain history is refreshed once to request the additional weather fields',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 assert.match(app,/previous\.daily\?\.weatherFieldsRequested === true/);
 assert.match(app,/cached\.daily\?\.weatherFieldsRequested === true/);
});
