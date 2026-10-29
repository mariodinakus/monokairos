'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../space-control.js');
test('orbit interpolation crosses the date line via the short arc',()=>{
 const now=Date.now(),s={track:[{t:now,lat:2,lon:179,alt:430},{t:now+60000,lat:4,lon:-179,alt:434}]};
 const p=C.pointAt(s,now+30000);
 assert.equal(p.lat,3);assert.equal(p.alt,432);
 assert.ok(Math.abs(Math.abs(p.lon)-180)<.001);
});
test('sky windows only rank dark hours from actual MONO cloud data',()=>{
 const prior=[globalThis.Astronomy,globalThis.MonoSky];
 globalThis.Astronomy={Observer:class{constructor(lat,lon){this.lat=lat;this.lon=lon;}}};
 globalThis.MonoSky={snapshot:()=>({illumination:0.5}),position:(body,time)=>({altitude:new Date(time).getUTCHours()===19?-22:10})};
 const base=new Date(),day=Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),base.getUTCDate()+1);
 try{
  const o={lat:40.64,lon:22.94,rows:[
   {t:day+19*3600e3,cloud:90,pop:.8,amount:1},
   {t:day+20*3600e3,cloud:0,pop:0,amount:0},
   {t:day+19*3600e3-24*3600e3,cloud:40,pop:0,amount:0}
  ]};
  const w=C.skyWindows(o);assert.equal(w.length,1);assert.ok(w[0].score<30);
 }finally{globalThis.Astronomy=prior[0];globalThis.MonoSky=prior[1];}
});
test('Space Control adds panels but does not alter other application content',()=>{
 const html=C.render(null,{lang:'el',zone:'UTC',lat:40.64,lon:22.94,rows:[]});
 assert.match(html,/id="sc-sun-earth"/);assert.match(html,/id="sc-orbit-live"/);
 assert.match(html,/id="sc-sky-window"/);assert.match(html,/ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΘΕΣΗ CME/);
 assert.match(html,/δεν|Δεν/);assert.doesNotMatch(html,/data-page="now"/);
});
