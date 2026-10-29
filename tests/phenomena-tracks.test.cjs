const test=require('node:test');
const assert=require('node:assert/strict');
const Track=require('../phenomena-tracks.js');
const start=Date.parse('2026-10-29T09:00:00Z');
const times=Array.from({length:10},(_,i)=>start+i*3600000);
const systems=i=>[{type:'rain',lat:40.3,lon:22.0+i*.24,peak:3.1,size:4}];
test('links consistently moving modelled precipitation cells',()=>{
 const t=Track.computeTracks(systems,times,0);
 assert.equal(t.length,1);
 assert.equal(t[0].type,'rain');
 assert.equal(t[0].from,0);
 assert.equal(t[0].to,8);
 assert.ok(t[0].distanceKm>100);
 assert.equal(Track.direction(t[0].bearing),'Α');
});
test('does not invent tracks for stationary or discontinuous systems',()=>{
 assert.deepEqual(Track.computeTracks(()=>[{type:'storm',lat:40,lon:23,peak:9}],times,0),[]);
 assert.deepEqual(Track.computeTracks(i=>i<2?systems(i):[],times,0),[]);
 assert.deepEqual(Track.computeTracks(i=>[{type:i<2?'rain':'snow',lat:40,lon:22+i*.2}],times,0),[]);
});
test('does not join far-apart weather areas',()=>{
 const f=i=>[{type:'rain',lat:40,lon:i===0?22:26+i*.2,peak:5}];
 assert.equal(Track.computeTracks(f,times,0).length,0);
});
test('local forecast arrival is relative to selected timeline hour',()=>{
 const field={getSample:(_lat,_lon,i)=>({precip:i>=5?.6:0,snow:0})};
 assert.deepEqual(Track.arrival(field,40,22,times,2,6),{status:'incoming',hours:3,index:5,type:'rain'});
 assert.equal(Track.arrival(field,40,22,times,5,3).status,'now');
 assert.equal(Track.arrival(field,40,22,times,0,3).status,'none');
 assert.equal(Track.arrival({getSample:()=>null},40,22,times,0,3).status,'unavailable');
});
test('snowfall remains separate from rainfall in local arrival',()=>{
 const result=Track.arrival({getSample:()=>({precip:0,snow:.4})},40,22,times,0);
 assert.equal(result.type,'snow');
});
