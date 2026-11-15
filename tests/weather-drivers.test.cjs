'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Drivers=require('../weather-drivers.js');

const H=3600000,now=Date.parse('2026-11-15T12:30:00Z');
function fixture(){
 const first=now-now%H-24*H;
 const times=Array.from({length:96},(_,i)=>first+i*H);
 const rows=times.map((t,i)=>({t,temp:20-i*.2,cloud:15+i*.7,pres:1020-i*.1,amount:i%7?0:1.2,isDay:true}));
 const hourly={time:times.map(t=>t/1000),
  wind_speed_300hPa:times.map((_,i)=>70+i),
  wind_speed_250hPa:times.map((_,i)=>75+i),
  wind_speed_200hPa:times.map((_,i)=>60+i),
  wind_speed_850hPa:times.map((_,i)=>20+i/2),
  temperature_850hPa:times.map((_,i)=>15-i*.15),
  temperature_500hPa:times.map((_,i)=>-20-i*.1),
  cloud_cover_low:times.map((_,i)=>i),
  cloud_cover_high:times.map((_,i)=>i/2)};
 return {view:{rows,iNow:24,zone:'Europe/Athens'},atmosphere:{hourly},times};
}
test('last six hours are explicitly modelled, alongside next 6, 24 and 48h evidence',()=>{
 const {view,atmosphere}=fixture();
 const d=Drivers.diagnostics(view,atmosphere,now);
 assert.equal(d.status,'ready');
 assert.deepEqual(d.periods.map(p=>p.hours),[-6,6,24,48]);
 assert.ok(Math.abs(d.periods[0].temperature+1.2)<1e-8);
 assert.ok(d.periods[2].jetLater>=120);
 assert.ok(d.periods.every(p=>p.to>p.from&&p.temperature<0));
});
test('upper air forecasts are matched by timestamps and are not confused with moving cloud tracks',()=>{
 const {view,atmosphere,times}=fixture();
 atmosphere.hourly.time=atmosphere.hourly.time.map(t=>t+1800);
 assert.equal(Drivers.join(view,atmosphere).length,0);
 assert.equal(Drivers.diagnostics(view,atmosphere,now).status,'no-overlap');
 const empty=Drivers.render({view,atmosphere,now,lang:'el'});
 assert.match(empty,/Δεν υπάρχουν ακόμη αρκετά/);
 assert.doesNotMatch(empty,/Δjet/);
 // Malformed or duplicate source timestamps must never fabricate values.
 atmosphere.hourly.time=times.map(t=>t/1000);
 atmosphere.hourly.wind_speed_300hPa[24]=null;
 atmosphere.hourly.wind_speed_250hPa[24]=null;
 atmosphere.hourly.wind_speed_200hPa[24]=null;
 const row=Drivers.join(view,atmosphere).find(r=>r.t===times[24]);
 assert.equal(row.jetCore,null);
});
test('evidence descriptions are sourced, bilingual and do not claim causality or verified movement',()=>{
 const {view,atmosphere}=fixture();
 const el=Drivers.render({view,atmosphere,now,lang:'el',zone:'Europe/Athens'});
 assert.match(el,/Γιατί αλλάζει ο καιρός/);
 assert.match(el,/Τελευταίο 6ωρο/);
 assert.match(el,/Επόμενο 24ωρο/);
 assert.match(el,/GFS/);
 assert.match(el,/όχι αυτόματη απόδοση αιτίας/);
 assert.match(el,/Πηγές και περιορισμοί/);
 assert.match(el,/δεν τεκμηριώνεται/);
 const en=Drivers.render({view,atmosphere,now,lang:'en',zone:'UTC'});
 assert.match(en,/Why is the weather changing/);
 assert.match(en,/not automatic causal attribution/);
 assert.match(en,/Sources and limitations/);
 assert.match(en,/not observed change/);
});
test('missing data blocks weak explanations instead of replacing undefined by zero',()=>{
 const {view,atmosphere}=fixture();
 const noTemp={rows:view.rows.map(r=>({...r,temp:null}))};
 const outcome=Drivers.diagnostics(noTemp,atmosphere,now);
 assert.equal(outcome.status,'insufficient');
 const html=Drivers.render({view:noTemp,atmosphere,now});
 assert.doesNotMatch(html,/Προβλεπόμενη ψύχρανση/);
 const unavailable=Drivers.diagnostics(view,{error:true},now);
 assert.equal(unavailable.status,'no-overlap');
});
test('MONO Lab wires the driver analysis to same real atmospheric feed as correlations',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 assert.match(app,/MONOWeatherDrivers\?\.render\(\{view:V,atmosphere:state\.atmosphere/);
 assert.match(app,/MONOStats\?\.render\(\{view:V,atmosphere:state\.atmosphere/);
 assert.match(html,/weather-drivers\.js\?v=[a-f0-9]{10}/);
 assert.match(html,/weather-drivers\.css\?v=[a-f0-9]{10}/);
});
