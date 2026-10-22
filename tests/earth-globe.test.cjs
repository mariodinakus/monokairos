'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const latest = { checkedAt:'2026-10-20T12:00:00Z',
  roni:[{season:'JAS',year:1997,value:2.1},{season:'JAS',year:2026,value:1.4}],
  earthquakes:[{id:'test',lat:25,lon:42,mag:5.4,place:'Example quake',time:Date.now(),depth:10,url:'https://earthquake.usgs.gov/'}],
  storms:[{id:'al012026',name:'Example storm',lat:20,lon:-50,time:Date.now(),windKt:75,movementDir:270,classification:'HU'}]
};
function boot(){
  const regions={enso:['pacific-east','indonesia','eastafrica','america-south','usa','cyclones','greece'],
    nao:['north-europe','med'],iod:['iod-west','iod-east'],mjo:['tropics','midlat'],polar:['arctic','europe']};
  const win={MONOEarth:{latest:()=>latest,regionData:(f,id)=>regions[f]?.includes(id)?{name:id,season:'winter',el:'impact',la:'impact',conf:'mixed'}:null,
    openRegion:()=>{} }};
  vm.runInNewContext(read('earth-globe.js'),{window:win,localStorage:{getItem:()=>null,setItem:()=>{}},
    document:{createElement:()=>({style:{setProperty(){}},setAttribute(){}})},Date,Math,Number,Array,JSON,String,Object});
  return win.MONOEarthGlobe;
}
test('RONI historical slider uses NOAA years, not fictitious numbers',()=>{
 const globe=boot();
 globe.setYear(1997);
 assert.equal(globe.getRONI().value,2.1);
 assert.match(globe.timeline('en'),/1997/);
 globe.setYear(9999);
 assert.equal(globe.getRONI().value,1.4);
});
test('toggles expose honest observed vs schematic layers',()=>{
 const globe=boot();
 assert.equal(globe.polygons().length,1);
 assert.equal(globe.marks().filter(p=>p.kind==='quake').length,1);
 assert.equal(globe.marks().filter(p=>p.kind==='storm').length,1);
 globe.toggle('iod');
 assert.equal(globe.polygons().length,3);
 assert.equal(globe.marks().filter(p=>p.factor==='iod' && p.kind==='region').length,2);
 assert.match(globe.toolbar('el'),/Σχηματική απεικόνιση/);
 assert.ok(globe.arcs().some(a=>/NOT a forecast track/.test(a.name)));
});
test('globe layer API attaches genuine polygons and educational arcs',()=>{
 const module=boot(),calls={};
 const fake=new Proxy({}, {get(target,k){return function(...args){calls[k]=args;return fake;};}});
 module.toggle('nao');
 module.sync(fake);
 assert.ok(Array.isArray(calls.polygonsData[0]));
 assert.ok(Array.isArray(calls.arcsData[0]));
 assert.equal(typeof calls.onPolygonClick[0],'function');
});
test('server consolidates official observations and isolates unavailable upstream sources',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
   const u=String(url);
   if(u.includes('CurrentStorms'))throw new Error('upstream unavailable');
   if(u.includes('RONI.ascii'))return {ok:true,text:async()=> 'SEAS YR ANOM\nJJA 1997 1.8\nJAS 1997 2.1\n'};
   if(u.includes('Rnino34'))return {ok:true,text:async()=> '2026 9 1.4\n'};
   return {ok:true,json:async()=>({features:[{id:'q',geometry:{type:'Point',coordinates:[23,38,9]},properties:{mag:5.1,place:'Example',time:Date.now(),url:'https://earthquake.usgs.gov/earthquakes/eventpage/q'}}]})};
 };
 try{
   const handler=require('../api/earth-signals.js');
   const res={status(n){this.code=n;return this;},setHeader(){},json(obj){this.body=obj;return obj;}};
   await handler({method:'GET'},res);
   assert.equal(res.code,200);
   assert.equal(res.body.roni.length,2);
   assert.equal(res.body.earthquakes.length,1);
   assert.equal(res.body.storms,null);
   assert.ok(res.body.unavailable.includes('storms'));
 } finally {globalThis.fetch=original;}
});

test('storm projection follows observed speed and is never advertised as official forecast',()=>{
 const globe=boot(),s=latest.storms[0],oldSpeed=s.movementMph;
 try{
   s.movementMph=12;
   const line=globe.arcs().find(a=>/illustrative straight-line position 6h/.test(a.name));
   assert.ok(line);
   assert.match(line.name,/NOT a forecast track/);
   assert.ok(Math.abs(line.endLng-s.lon)>0.1);
   s.movementMph=null;
   assert.match(globe.arcs().find(a=>/NHC reported/.test(a.name)).name,/no speed\/distance scale/);
 } finally {s.movementMph=oldSpeed;}
});


test('official NHC forecast points supersede estimated movement and can be hidden',()=>{
 const globe=boot(),q=latest.storms[0],prior=latest.forecasts,oldSpeed=q.movementMph;
 try{
  q.movementMph=12;
  latest.forecasts=[{name:q.name,basin:'AL',stormnum:1,issuedAt:Date.now(),points:[
    {hour:0,lat:20,lon:-50},{hour:24,lat:21,lon:-53,windKt:70},
    {hour:48,lat:23,lon:-57},{hour:72,lat:25,lon:-60},
    {hour:96,lat:27,lon:-63},{hour:120,lat:30,lon:-66}]}];
  assert.equal(globe.arcs().filter(a=>a.kind==='official-track').length,5);
  assert.equal(globe.marks().filter(m=>m.kind==='forecast').length,5);
  assert.ok(!globe.arcs().some(a=>/illustrative straight-line/.test(a.name)));
  assert.match(globe.toolbar('en'),/Official tracks 120h/);
  globe.toggle('tracks');
  assert.equal(globe.arcs().filter(a=>a.kind==='official-track').length,0);
  assert.ok(globe.arcs().some(a=>/NOT a forecast track/.test(a.name)));
 } finally {latest.forecasts=prior;q.movementMph=oldSpeed;}
});
test('stale NHC forecast points never appear as current tracks',()=>{
 const globe=boot(),q=latest.storms[0],prior=latest.forecasts;
 try{
  latest.forecasts=[{name:q.name,basin:'AL',stormnum:1,issuedAt:Date.now()-40*3600e3,
    points:[{hour:0,lat:20,lon:-50},{hour:24,lat:22,lon:-52}]}];
  assert.equal(globe.marks().filter(m=>m.kind==='forecast').length,0);
  assert.equal(globe.arcs().filter(a=>a.kind==='official-track').length,0);
 } finally {latest.forecasts=prior;}
});
test('NOAA GIS backend accepts only fresh, hourly horizons of one forecast advisory',async()=>{
 const original=globalThis.fetch,now=Date.now();
 const point=(hour,lon,adv='12',when=now)=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,20]},
   properties:{stormname:'Example storm',basin:'AL',stormnum:1,advisnum:adv,fcstprd:hour,
     maxwind:75,mslp:975,idp_filedate:when}});
 const features=[point(24,-58,'11',now-6*3600e3),point(48,-60,'11',now-6*3600e3),
   point(24,-54),point(48,-57),point(72,-60),point(96,-62),point(120,-66),
   point(168,-70),point(24,-55,'9',now-40*3600e3)];
 globalThis.fetch=async url=>{
  const u=String(url);
  if(u.includes('/MapServer/5/query'))return {ok:true,text:async()=>JSON.stringify({type:'FeatureCollection',features})};
  if(u.includes('CurrentStorms.json'))return {ok:true,json:async()=>({activeStorms:[]})};
  if(u.includes('RONI.ascii'))return {ok:true,text:async()=> 'JAS 2026 1.5'};
  if(u.includes('Rnino34'))return {ok:true,text:async()=> '2026 9 1.3'};
  return {ok:true,json:async()=>({features:[]})};
 };
 try{
  const handler=require('../api/earth-signals.js');
  const res={status(n){this.code=n;return this;},setHeader(){},json(obj){this.body=obj;return obj;}};
  await handler({method:'GET'},res);
  assert.equal(res.code,200);
  assert.equal(res.body.forecasts.length,1);
  assert.equal(res.body.forecasts[0].advisory,'12');
  assert.deepEqual(res.body.forecasts[0].points.map(p=>p.hour),[24,48,72,96,120]);
  assert.equal(res.body.forecasts[0].points[0].lon,-54);
 } finally {globalThis.fetch=original;}
});


test('NHC current storms accepts both official coordinate spellings and reports source health',async()=>{
  const saved=globalThis.fetch;
  const originalDate=new Date();
  const current=originalDate.toISOString();
  const fixtures=[
    {id:'al012026',name:'A',latitudeNumeric:20.1,longitudeNumeric:-65.2,lastUpdate:current,intensity:'70',pressure:'991',movementSpeed:12,movementDir:270},
    {id:'ep012026',name:'B',latitude_numeric:13.2,longitude_numeric:-108.3,lastUpdate:current,intensity:35,pressure:1005},
    {id:'bad',name:'Bad',latitude_numeric:null,longitude_numeric:null,lastUpdate:current},
    {id:'old',name:'Old',latitudeNumeric:11,longitudeNumeric:-81,lastUpdate:'2023-01-01T00:00:00.000Z'}
  ];
  globalThis.fetch=async url=>{
    const u=String(url);
    if(u.includes('CurrentStorms'))return{ok:true,json:async()=>({activeStorms:fixtures})};
    if(u.includes('RONI.ascii'))return{ok:true,text:async()=> 'SEAS YR ANOM\nJAS 2026 1.2\n'};
    if(u.includes('Rnino34'))return{ok:true,text:async()=> 'YR MTH ANOM\n2026 9 1.5\n'};
    if(u.includes('MapServer'))return{ok:true,text:async()=>JSON.stringify({type:'FeatureCollection',features:[]})};
    return{ok:true,json:async()=>({features:[]})};
  };
  try{
    const handler=require('../api/earth-signals.js');
    const res={status(code){this.code=code;return this;},setHeader(){},json(body){this.body=body;return body;}};
    await handler({method:'GET'},res);
    assert.equal(res.code,200);
    assert.equal(res.body.storms.length,2);
    assert.equal(res.body.storms[0].lon,-65.2);
    assert.equal(res.body.storms[1].lon,-108.3);
    assert.equal(res.body.storms[0].movementDir,270);
    assert.equal(res.body.storms[1].movementDir,null);
    assert.equal(res.body.health.status,'ok');
    assert.equal(res.body.health.sources.storms.items,2);
    assert.equal(res.body.health.sources.forecasts.items,0);
    assert.equal(res.body.health.sources.forecasts.status,'ok');
  } finally{globalThis.fetch=saved;}
});
test('Earth API returns safe diagnostics even on complete upstream outage',async()=>{
  const saved=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('test upstream failure');};
  try{
    const handler=require('../api/earth-signals.js');
    const res={status(code){this.code=code;return this;},setHeader(){},json(body){this.body=body;return body;}};
    await handler({method:'GET'},res);
    assert.equal(res.code,503);
    assert.equal(res.body.health.status,'unavailable');
    assert.equal(Object.keys(res.body.health.sources).length,5);
    assert.equal(res.body.health.sources.roni.reason,'upstream_error');
    assert.deepEqual(res.body.unavailable.sort(),['roni','nino34','earthquakes','storms','forecasts'].sort());
  } finally{globalThis.fetch=saved;}
});
