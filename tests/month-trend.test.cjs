'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function moduleApi(){
  const ctx={window:{},Map,Intl,Number,Date};
  vm.runInNewContext(read('month-trend.js'),ctx);
  return ctx.window.MONOMonthTrend;
}
test('monthly forecast module reads only actual EC46 anomaly samples',()=>{
  const api=moduleApi();
  const rows=api.rowsOf({weekly:{time:['2026-11-16','2026-11-23','bad'],
    temperature_2m_anomaly:[-2.2,null,2.0],precipitation_anomaly:[12,null,10]}});
  assert.equal(rows.length,1);
  assert.equal(rows[0].temp,-2.2);
  assert.equal(rows[0].rain,12);
});
test('anomalies near zero are not misreported as major weather changes',()=>{
  const api=moduleApi();
  assert.equal(api.trendWord(0.1,'temp','el'),'Κοντά στα κανονικά');
  assert.equal(api.trendWord(0,'rain','el'),'Κοντά στα κανονικά');
  assert.equal(api.trendWord(null,'rain','el'),'Χωρίς δεδομένα');
  assert.equal(api.trendWord(-2,'temp','en'),'Colder than usual');
});
test('home shows monthly outlook without replacing existing routes or weather model',()=>{
  const html=read('index.html'),app=read('app.js');
  assert.match(html,/month-trend\.js\?v=[a-f0-9]{10}/);
  assert.match(html,/month-trend\.css\?v=[a-f0-9]{10}/);
  assert.match(app,/homeMore\('month'/);
  assert.match(app,/MONOMonthTrend\?\.mount/);
  assert.match(app,/window\.MONOForecastConfidence/);
});
