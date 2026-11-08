const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../forecast-confidence.js');
const hour=3600e3, now=Date.parse('2026-11-08T09:07:00Z');
const first=Math.ceil(now/hour)*hour;
function view(){
 const rows=Array.from({length:6},(_,i)=>({t:first+i*hour,temp:20,wind:15,cloud:50,amount:.4,
  models:{a:{T:20,W:15,C:50,P:.4},b:{T:21,W:20,C:60,P:.3},c:{T:26,W:15,C:50,P:.4},duplicate:{T:50,W:15,C:50,P:.4}}}));
 return {rows,active:['a','b','c'],zone:'Europe/Athens'};
}
function raw({temp=20,wind=10,cloud=30,rainAt=6,pop=40}={}){
 const count=48, rain=Array(count).fill(0);rain[rainAt]=.3;
 return {hourly:{time:Array.from({length:count},(_,i)=>(first+i*hour)/1000),temperature_2m:Array(count).fill(temp),
 wind_speed_10m:Array(count).fill(wind),cloud_cover:Array(count).fill(cloud),rain,showers:Array(count).fill(0),
 snowfall:Array(count).fill(100),precipitation_probability:Array(count).fill(pop)}};
}
test('agreement is an actual model-hour fraction with explicit dimensions, not accuracy',()=>{
 const a=F.agreement(view(),now);
 assert.equal(a.models,3);assert.equal(a.hours,6);assert.equal(a.total,18);
 assert.equal(a.matched,12);assert.ok(Math.abs(a.percent-200/3)<1e-9);
 assert.equal(a.results.temp.match,12);assert.equal(a.results.wind.match,18);
 const html=F.render({view:view(),now,lang:'el'});
 assert.match(html,/67%/);assert.match(html,/μοντέλα/);assert.match(html,/αυτό δεν είναι πιθανότητα να επαληθευτεί/);
 assert.doesNotMatch(html,/πιθανότητα επιτυχίας 67%/);
});
test('missing observations are excluded and insufficient model-hour coverage is unknown',()=>{
 const v=view();v.rows.forEach(r=>{r.models.b.W=null;r.models.c.P=null;});
 assert.equal(F.agreement(v,now).percent,null);
 assert.match(F.render({view:v,now,lang:'en'}),/Waiting for enough models/);
 assert.equal(F.agreement({...v,active:['a']},now).percent,null);
 assert.equal(F.render({view:view(),now,snapshot:true}).includes('67%'),false);
});
test('captures liquid rain and showers, not snowfall or missing fields',()=>{
 const d=raw();d.hourly.showers[1]=null;
 const s=F.capture(d,now);
 assert.equal(s.rows[1].liquid,null);assert.equal(s.rows[6].liquid,.3);
 assert.equal(s.rows[0].liquid,0);assert.equal(s.rows[0].t,first);
});
test('compares the same future hours and reports earlier rain, temperatures and wind',()=>{
 const old=F.capture(raw({rainAt:6}),now-hour);
 const recent=F.capture(raw({temp:22,wind:15,cloud:40,rainAt:3,pop:60}),now);
 const c=F.compare([old,recent],now);
 assert.equal(c.count,24);assert.equal(c.temp.delta,2);assert.equal(c.wind.delta,5);
 assert.equal(c.cloud.delta,10);assert.equal(c.pop.delta,20);assert.equal(c.firstRain.shift,-3);
 const html=F.render({view:view(),history:[old,recent],now});
 assert.match(html,/3 ώρες νωρίτερα/);assert.match(html,/24 κοινές ώρες/);assert.match(html,/όχι έκδοσης μοντέλου/);
 assert.match(html,/\+20 μ\.μ\./);
});
test('missing hours never imply a dry forecast, a shift, or a fake revision',()=>{
 const old=F.capture(raw(),now-hour), recent=F.capture(raw({rainAt:3}),now);
 recent.rows[0].liquid=null;
 const c=F.compare([old,recent],now);
 assert.equal(c.firstRain,null);
 assert.match(F.render({view:view(),history:[old,recent],now}),/Δεν υπάρχουν αρκετές κοινές ώρες/);
 assert.equal(F.compare([recent],now),null);
 assert.equal(F.compare([old,recent],now+40*hour),null);
});
test('history selects an approximately hour-old same-device capture',()=>{
 const samples=[70,45,10,0].map(m=>({at:now-m*60e3,rows:[]}));
 assert.equal(F.selectHistory(samples,now).previous.at,now-70*60e3);
 const shorter=samples.slice(1);assert.equal(F.selectHistory(shorter,now).previous.at,now-45*60e3);
 assert.equal(F.selectHistory([samples.at(-1)],now),null);
});
