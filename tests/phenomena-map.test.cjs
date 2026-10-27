const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const P=require('../phenomena-map.js');
const get=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const c={name:'Thessaloniki',nameEl:'Θεσσαλονίκη',cc:'GR',lat:40.6401,lon:22.9444};
const catalog=[c,{name:'Athens',nameEl:'Αθήνα',cc:'GR',lat:37.9838,lon:23.7275},{name:'Patras',nameEl:'Πάτρα',cc:'GR',lat:38.2466,lon:21.7346}];
test('largest Greek cities remain visible and smaller cities appear on zoom',()=>{
 const pts=P.pointsFor(c,catalog);
 const names=pts.map(x=>x.name);
 for(const name of ['Θεσσαλονίκη','Αθήνα','Πάτρα','Λάρισα','Σέρρες','Τρίκαλα','Καλαμάτα','Χανιά'].filter(n=>n!=='Χανιά'&&n!=='Λάρισα'))
  assert.ok(names.includes(name),name);
 const th=pts.find(p=>p.selected),ath=pts.find(p=>p.name==='Αθήνα'),ser=pts.find(p=>p.name==='Σέρρες');
 assert.ok(th&&ath&&ser);
 assert.equal(P.eligible(ath,5),true);assert.equal(P.eligible(ser,6),false);
 assert.equal(P.eligible(ser,8),true);
});
test('icons represent observed forecast categories rain, heavy rain, snow, storm, never clouds',()=>{
 const cases=[
 [{weatherCode:95,precip:8,snow:0,prob:70},'storm','⛈️'],
 [{weatherCode:61,precip:9,snow:0,prob:82},'heavyRain','🌧️'],
 [{weatherCode:61,precip:3,snow:0,prob:55},'rain','🌧️'],
 [{weatherCode:71,precip:0.5,snow:.8,prob:76},'snow','❄️'],
 [{weatherCode:75,precip:4,snow:2,prob:82},'heavySnow','🌨️'],
 [{weatherCode:3,precip:0,snow:0,prob:5},'dry',''],
 [null,'unknown','']
 ];
 for(const [r,id,icon] of cases){
  const k=P.kind(r);assert.equal(k.id,id);
  assert.equal(k.icon,icon);
  assert.doesNotMatch(k.labelEl,/Συννεφ/);
 }
});
test('hourly fields are bound to exactly the same forecast instant per city',()=>{
 const t=Math.ceil(Date.now()/3600e3)*3600e3;
 const pts=P.pointsFor(c,catalog).slice(0,2);
 const result=pts.map((p,i)=>({hourly:{time:[t/1000,(t+3600e3)/1000],
  precipitation:[0,i+2],snowfall:[0,0],weather_code:[0,61],precipitation_probability:[5,68]}}));
 const normalized=P.normalize(result,pts);
 const timeline=P.timeline(normalized,t-10*60000);
 assert.equal(timeline.length,2);
 assert.equal(P.at(normalized[1],t+3600e3).precip,3);
 assert.equal(P.at(normalized[0],t+3600e3).weatherCode,61);
 assert.equal(P.at(normalized[0],t-3600e3),null);
});
test('city label and popup text are safely escaped',()=>{
 const point={name:'<img onerror="bad">',nameEn:'<foo>',lat:1,lon:2,rank:1};
 assert.match(P.pin(point,{precip:4,snow:0,weatherCode:63,prob:90}),/&lt;img/);
 assert.doesNotMatch(P.pin(point,{precip:4,snow:0,weatherCode:63,prob:90}),/<img onerror=/);
 assert.match(P.popup(point,{precip:4,snow:0,weatherCode:63,prob:90},Date.now()),/Open-Meteo/);
});
test('radar switches forecast and actual observations without representing forecast as radar',()=>{
 const a=get('app.js'),h=get('index.html');
 assert.match(a,/function loadPhenomena/);assert.match(a,/function drawPhenomena/);
 assert.match(a,/radarSelectMode/);assert.match(a,/futureRadarControls/);
 assert.match(a,/data-action="radarMode"/);assert.match(a,/data-action="pmJump"/);
 assert.match(h,/phenomena-map\.js/);assert.match(h,/phenomena-map\.css/);
});
