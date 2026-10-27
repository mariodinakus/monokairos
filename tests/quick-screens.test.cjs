const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Quick=require('../quick-screens.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const H=3600e3,now=Date.parse('2026-10-27T10:00:00Z');
const fixture=()=>({zone:'Europe/Athens',current:{temp:20,wind:12,gust:24,rh:65,pres:1014,source:'obs'},
 nowCloud:42,daily:[{hi:22,lo:14},{hi:25,lo:16}],
 future:Array.from({length:48},(_,i)=>({t:now+i*H,amount:.5,cloud:65,pop:.35,pStorm:.1})),
 gauge:{name:'Airport Gauge',mm:4.2,dist:13.9,covered:6,type:'SYNOP'},
 live:{kind:'rain',name:'Thessaloniki Airport',dist:13.9,t:now,src:'metar'},
 aqi:28,uv:5,seaTemp:21.6,wave:.4,kp:{value:3,fresh:true},sunrise:now,
 models:18,members:200,rainSkill:.4,cloudSkill:12.5,warnings:0,news:5});
test('four screens expose source-backed weather, outlook, planet and verification without a text wall',()=>{
 const d=fixture();
 for(let i=0;i<4;i++){
  const s=Quick.render(d,i,'el');
  assert.match(s,/data-action="quickScreen"/);
  assert.match(s,/role="tabpanel"/);
  assert.match(s,/qs-tile/);
 }
 assert.match(Quick.render(d,0,'el'),/Airport Gauge/);
 assert.match(Quick.render(d,1,'el'),/Βροχή 24ώρου/);
 assert.match(Quick.render(d,2,'el'),/Διαστημικός καιρός/);
 assert.match(Quick.render(d,3,'el'),/Σφάλμα βροχής/);
});
test('dashboard keeps unknown observations empty and does not claim rain without a station',()=>{
 const d=fixture();d.live={kind:'unverified'};d.gauge=null;
 const s=Quick.render(d,0,'el');
 assert.match(s,/Δεν υπάρχει κοντινή επιβεβαίωση/);
 assert.match(s,/Δεν υπάρχει διαθέσιμο βροχόμετρο/);
 assert.doesNotMatch(s,/Βρέχει στον κοντινό σταθμό/);
});
test('dashboard only injects escaped source names and uses existing navigation routes',()=>{
 const d=fixture();d.live.name='<img src=x onerror=alert(1)>';
 const s=Quick.render(d,0,'el');assert.doesNotMatch(s,/<img src=x onerror=/);assert.match(s,/&lt;img/);
 const app=read('app.js');assert.match(app,/data-action="quickScreen"|a === 'quickScreen'/);
 const html=read('index.html');assert.match(html,/quick-screens\.js/);assert.match(html,/quick-screens\.css/);
});
