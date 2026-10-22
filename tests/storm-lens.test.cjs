'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function boot(){
 const win={};vm.runInNewContext(read('storm-lens.js'),{window:win,fetch:async()=>{throw Error('no network')},AbortController,setTimeout,clearTimeout,Date,Number,Math,Array,JSON,String,Map,Set,console});
 return win.MONOStormLens;
}
function sample(){
 const points=Array.from({length:49},(_,i)=>({lat:38+(Math.floor(i/7)-3)*1,lon:24+(i%7-3)*1,cellKm2:12000}));
 const horizons=[0,6,12,24,36,48].map((h,k)=>{
   const p=Array(49).fill(0);
   for(const y of [3,4])for(const x of [1+Math.floor(k/2),2+Math.floor(k/2)])p[y*7+x]=6;
   return {hours:h,time:Date.now()+h*3600000,precip:p};
 });
 return {points,horizons,rows:7,columns:7,step:{lat:1,lon:1}};
}
test('geodesic area of user-defined radius and invalid coordinates',()=>{
 const l=boot();assert.ok(l.radiusArea(100)>31000&&l.radiusArea(100)<32000);
 assert.equal(l.distance({lat:38,lon:24},{lat:38,lon:24}),0);
 assert.equal(l.pick(90,20),false);
});
test('connected rain footprint produces area, polygons, and estimated motion',()=>{
 const l=boot(),d=sample(),blobs=l.clusters(d,d.horizons[0],5);
 assert.equal(blobs.length,1);assert.equal(blobs[0].areaKm2,48000);
 assert.equal(l.clusters(d,d.horizons[0],10).length,0);
 l.state.center={lat:38,lon:24};l.state.data=d;l.setThreshold(5);l.setHours(24);
 assert.equal(l.polygons().length,4);assert.ok(l.arcs().length>0);
 assert.ok(l.arcs().every(x=>x.name.includes('NOT a cyclone-center forecast')));
 assert.match(l.panel('el'),/km²/);
 l.setMode('radius');l.setManualRadius(300);
 assert.equal(l.polygons().length,1);assert.match(l.polygons()[0].label,/NOT a measured cyclone boundary/);
});
test('API computes six-hour totals across 49 coordinates and labels its limits',async()=>{
 const saved=globalThis.fetch,now=Math.floor(Date.now()/3600e3)*3600;
 globalThis.fetch=async url=>{
  const u=new URL(url);assert.equal(u.searchParams.get('timezone'),'UTC');
  assert.equal(u.searchParams.get('latitude').split(',').length,49);
  const time=Array.from({length:70},(_,j)=>now-8*3600+j*3600);
  return {ok:true,text:async()=>JSON.stringify(Array.from({length:49},(_,i)=>({hourly:{time,precipitation:time.map(()=>i%7>=2&&i%7<=4?2:0)}})))};
 };
 try{
  const handler=require('../api/storm-lens.js');
  const res={setHeader(){},status(v){this.code=v;return this;},json(v){this.body=v;return v;}};
  await handler({method:'GET',query:{lat:'38',lon:'24',radius:'600'}},res);
  assert.equal(res.code,200);assert.equal(res.body.points.length,49);
  assert.equal(res.body.horizons.length,6);assert.equal(res.body.horizons[0].precip[2],12);
  assert.equal(res.body.metric,'precipitation_mm_per_6h');
  assert.ok(res.body.points.every(p=>p.cellKm2>0));
 }finally{globalThis.fetch=saved;}
});
test('API rejects invalid coordinates and unsupported POST',async()=>{
 const handler=require('../api/storm-lens.js');
 const response=()=>({setHeader(){},status(v){this.code=v;return this;},json(v){this.body=v;return v;}});
 const x=response();await handler({method:'GET',query:{lat:90,lon:24,radius:600}},x);assert.equal(x.code,400);
 const y=response();await handler({method:'POST',query:{}},y);assert.equal(y.code,405);
});
