'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const L=require('../lib/station-rain-learning.cjs');
const Rain=require('../rain-intelligence.js');
const Sensors=require('../community-stations.js');
const H=L.HOUR,now=Date.parse('2026-10-29T12:00:00Z');
function forecast(values){return {hourly:{time:values.map(x=>x[0]/1000),precipitation_previous_day1:values.map(x=>x[1])}};}
test('gauge totals are compared to complete matching preceding-hour forecasts',()=>{
 const st={id:'16622',list:[{t:now,prcp:3.1,prcpH:3}]};
 const a=forecast([[now-2*H,1],[now-H,2],[now,0.5]]),b=forecast([[now-2*H,0.1],[now-H,0.2],[now,0.3]]);
 const [row]=L.compareReports(st,a,b,now);
 assert.equal(row.start,now-3*H);assert.equal(row.observed,3.1);assert.equal(row.ecmwf,3.5);assert.equal(row.gfs,0.6);
 assert.equal(L.compareReports(st,a,forecast([[now-H,0.2],[now,0.3]]),now).length,0);
});
test('overlapping accumulation periods are never counted twice and old forecast records are immutable',()=>{
 const rows=[{stationId:'A',start:now-12*H,end:now, hours:12,observed:1,ecmwf:1,gfs:1},
  {stationId:'A',start:now-6*H,end:now, hours:6,observed:1,ecmwf:9,gfs:9},
  {stationId:'A',start:now-24*H,end:now-12*H,hours:12,observed:0,ecmwf:0,gfs:0}];
 const merged=L.mergeRows(rows,[{...rows[0],ecmwf:99}],now);
 assert.equal(merged.find(x=>x.start===now-12*H).ecmwf,1);
 assert.equal(L.nonOverlapping(merged,'A').length,2);
});
test('hit, miss, false alarm and dry counts come from observed gauge values',()=>{
 const mk=(o,p)=>({observed:o,ecmwf:p,gfs:p});
 const stats=L.score([mk(1,1),mk(2,0),mk(0,3),mk(0,0)]);
 assert.deepEqual([stats.hit,stats.miss,stats.falseAlarm,stats.correctDry],[1,1,1,1]);
 assert.equal(stats.n,4);assert.equal(stats.wetObserved,2);
});
test('training remains inactive for too few records or insufficient wet events',()=>{
 const dry=Array.from({length:80},()=>({observed:0,ecmwf:0,gfs:0}));
 assert.equal(L.learn(dry).ready,false);assert.equal(L.learn(dry.slice(0,10)).reason,'insufficient_samples');
 const enough=Array.from({length:40},(_,i)=>({observed:i%3===0?2:0,ecmwf:i%3===0?2:0,gfs:i%3===0?4:0}));
 const fit=L.learn(enough);assert.equal(fit.ready,true);assert.ok(fit.adjustedMae<fit.baselineMae);
});
test('station correction applies only to fresh, nearby, validated data at the trained lead',()=>{
 const d={available:true,checkedAt:now,cityDistance:2,station:{dist:8},learning:{ready:true,weight:.75,scale:1}};
 assert.equal(Rain.stationAmount(d,2,0,now+24*H,now),1.5);
 assert.equal(Rain.stationAmount({...d,stale:true},2,0,now+24*H,now),null);
 assert.equal(Rain.stationAmount(d,2,0,now+6*H,now),null);
 assert.equal(Rain.stationAmount({...d,station:{dist:25}},2,0,now+24*H,now),null);
 assert.equal(Rain.stationAmount(d,null,0,now+24*H,now),null);
});
test('nearby community sensors require fresh temperature and are not treated as rain gauges',()=>{
 const make=(name,age,val)=>({_id:'67a4a0ce4ef45d00085c1f9a',name,exposure:'outdoor',currentLocation:{coordinates:[22.91,40.655]},
  sensors:[{title:'Temperatur',unit:'°C',lastMeasurement:{createdAt:new Date(now-age).toISOString(),value:val}},
  {title:'rel. Luftfeuchte',unit:'%',lastMeasurement:{createdAt:new Date(now-age).toISOString(),value:'51'}}]});
 const out=Sensors.parse([make('fresh',20*60000,'0'),make('old',3*H,'14'),make('bad',0,'')],{lat:40.655,lon:22.91},now);
 assert.equal(out.length,1);assert.equal(out[0].temp,0);assert.equal(out[0].rh,51);assert.equal(out[0].rain1h,undefined);
});
test('learning card clearly identifies historical model forecasts instead of pretending to score the whole app',()=>{
 const data={available:true,checkedAt:now,threshold:.1,station:{name:'Airport',dist:14},cityDistance:5,
  samples:{n:4,hit:1,miss:1,falseAlarm:1,correctDry:1},learning:{ready:false,reason:'insufficient_samples'},recent:[]};
 const html=Rain.stationLearningCard(data,'el','Europe/Athens',now);
 assert.match(html,/ECMWF\/GFS/);assert.match(html,/δεν ελέγχει τις παλιές ενδείξεις/);assert.match(html,/Λάθος συναγερμός/);
});
