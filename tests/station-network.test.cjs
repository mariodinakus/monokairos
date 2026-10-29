'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const L=require('../lib/station-rain-learning.cjs');
const H=L.HOUR,now=Date.parse('2026-10-29T12:00:00Z');
function station(id,dist,wet){
 return {id,name:'Station '+id,lat:40.6+dist/1000,lon:22.9,dist,
  list:[{t:now-3*H,prcp:wet?3:0,prcpH:3},
        {t:now,prcp:wet?1.5:0,prcpH:3}]};
}
test('network discovers every eligible reporting SYNOP gauge within bounded region',()=>{
 const all=[station('one',8,true),station('two',18,false),station('three',76,true),
   {...station('old',12,true),list:[{t:now-48*H,prcp:1,prcpH:3}]}];
 const found=L.chooseStations({stations:all},now);
 assert.deepEqual(found.map(s=>s.id),['one','two']);
});
test('station network pools non-overlapping observations but retains per-station scores',()=>{
 const s1=station('one',8,true),s2=station('two',18,false);
 const rows=[
 {stationId:'one',start:now-3*H,end:now,hours:3,observed:2,ecmwf:2,gfs:1},
 {stationId:'two',start:now-3*H,end:now,hours:3,observed:0,ecmwf:0,gfs:0}
 ];
 const r=L.report([s1,s2],rows,now);
 assert.equal(r.version,3);assert.equal(r.network.stations,2);
 assert.equal(r.samples.n,2);assert.equal(r.samples.hit,1);
 assert.equal(r.samples.correctDry,1);
 assert.equal(r.stations.length,2);assert.equal(r.station.id,'one');
 assert.equal(r.learning.ready,false);
 assert.equal(r.samples.mae,0.25);
 assert.ok(Number.isFinite(r.samples.rmse));
});
test('time-based split prevents gauges at identical verification time crossing training/test boundary',()=>{
 const rows=Array.from({length:20},(_,i)=>[0,1,2].map(s=>({
  stationId:String(s),start:now+(i-1)*H,end:now+i*H,hours:1,
  observed:i%2?2:0,ecmwf:i%2?2:0,gfs:i%2?4:0
 }))).flat();
 const fit=L.learn(rows);
 assert.equal(fit.train,42);assert.equal(fit.test,18);
});
test('multi-coordinate previous-run forecasts are compared with the correct gauge and model lead',async()=>{
 const a=station('one',8,true),b=station('two',18,false);
 const captured=[];
 const mock=async url=>{
   captured.push(url);
   if(url.includes('/api/synop?'))return {stations:[a,b]};
   const u=new URL(url),lats=u.searchParams.get('latitude').split(',');
   const isGfs=u.searchParams.get('models')==='ncep_gfs_seamless';
   const times=Array.from({length:7},(_,i)=>Math.floor((now-6*H+i*H)/1000));
   return lats.map((v,k)=>({hourly:{time:times,precipitation_previous_day1:
     times.map(()=>k===0?(isGfs?.8:1):0)}}));
 };
 const result=await L.update(['test',40.64,22.94],null,now,mock);
 assert.equal(result.version,3);assert.equal(result.stations.length,2);
 assert.equal(result.samples.n,4);
 assert.equal(result.rows.length,4);
 assert.equal(captured.filter(x=>x.includes('previous-runs')).length,2);
 assert.equal(result.rows.find(x=>x.stationId==='one').ecmwf,3);
 assert.equal(result.rows.find(x=>x.stationId==='one').gfs,2.4);
 assert.equal(result.rows.find(x=>x.stationId==='two').observed,0);
});
