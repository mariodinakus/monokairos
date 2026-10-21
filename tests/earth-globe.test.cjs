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
