const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Model=require('../model.js');
const Insights=require('../model-insights.js');

test('held-out temperature scores preserve signed bias and correctly score large errors',()=>{
 const count=480, times=Array.from({length:count},(_,i)=>i*3600e3), hours=times.map((_,i)=>i%24);
 const truth=times.map(()=>20), prediction=times.map((_,i)=>20+(i%2?3:-1));
 const result=Model.fitVariable({times,hours,truth,models:{sample:{0:prediction}}});
 const score=result.leads[0].test.mean;
 assert.equal(score.n,96);
 assert.equal(score.mae,2);
 assert.equal(score.bias,1);
 assert.equal(score.rmse,2.24);
});

const data=()=>({
 lead:0,lang:'el',algorithmName:()=>'<MOS>',
 train:{start:'2026-08-01',end:'2026-09-30',temp:{leads:{0:{choice:'mos',test:{mos:{mae:1.2,rmse:2,bias:-.4,n:80}}}}},
  wind:{leads:{0:{choice:'mean',test:{mean:{mae:2,rmse:2.6,bias:.3,n:70}}}}},
  precip:{leads:{0:{choice:'vote',test:{vote:.125,clim:.2},n:{test:50},wetTest:10,amountTest:{mae:.4,rmse:.9,bias:.1,n:50}}}}},
 view:{station:{id:'<LGTS>',dist:14},live:{__mono:{mae:1.5,bias:-.25,n:30}}},
 stationLearning:{available:true,stale:false,samples:{mae:.8,rmse:1.5,bias:-.2,n:12}}
});

test('explains real held-out values, signed bias and separate station comparisons',()=>{
 const html=Insights.render(data());
 assert.match(html,/MAE/);assert.match(html,/RMSE/);assert.match(html,/Brier/);
 assert.match(html,/1,20/);assert.match(html,/-0,40/);
 assert.match(html,/χαμηλότερα από την αναφορά/);
 assert.match(html,/80 συγκρίσεις/);
 assert.match(html,/υετού ≥0,2 mm ανά ώρα/);
 assert.match(html,/πριν από τον τελικό συνδυασμό ensemble/);
 assert.match(html,/περίοδο μέτρησης/);
 assert.match(html,/όχι όλων των ζωντανών προγνώσεων MONO/);
 assert.match(html,/&lt;MOS&gt;/);assert.match(html,/&lt;LGTS&gt;/);
 assert.doesNotMatch(html,/<LGTS>/);
});

test('missing scores and zero scores remain distinct in both languages',()=>{
 const missing=Insights.render({lang:'el'});
 assert.match(missing,/Δεν υπάρχουν ακόμη αποτελέσματα/);
 assert.match(missing,/Περιμένουμε την εκπαίδευση/);
 const d=data();d.lang='en';d.train.temp.leads[0].test.mos={mae:0,rmse:0,bias:0,n:20};
 const html=Insights.render(d);
 assert.match(html,/0\.00/);assert.match(html,/opposite errors may cancel/);
 assert.match(html,/not a success percentage/);
 assert.match(html,/not necessarily verification of forecasts issued at the time/);
});

test('different lead has no fabricated score and is labelled correctly',()=>{
 const d=data();d.lead=2;
 const html=Insights.render(d);
 assert.match(html,/Η\+2/);assert.match(html,/Δεν υπάρχουν ακόμη αποτελέσματα/);
 assert.doesNotMatch(html,/80 συγκρίσεις/);
});

test('app pins the ERA5 reference and integrates explanations with PWA',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 assert.match(read('app.js'),/models: 'era5', hourly: 'temperature_2m,precipitation/);
 assert.match(read('app.js'),/MONOModelInsights\?\.render/);
 assert.match(read('index.html'),/model-insights\.js/);
 assert.match(read('sw.js'),/model-insights\.js/);
});
