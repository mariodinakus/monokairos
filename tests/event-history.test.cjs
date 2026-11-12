'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const fn=source.slice(source.indexOf('function yesterdayRainComparison('),source.indexOf('\nconst P = read(',source.indexOf('function yesterdayRainComparison(')));
const compare=vm.runInNewContext('(function(){const fin=Number.isFinite; '+fn+'; return yesterdayRainComparison;})()');
const hour=3600000, now=Date.UTC(2026,10,12,12);
const current=[{key:'2026-11-14',t:now+2*24*hour,pop:.64}];
test('matches same day and selects a real capture near 24 hours earlier',()=>{
 const result=compare([{at:now-24*hour,days:[{key:'2026-11-14',rain:.42}]},{at:now-2*hour,days:[{key:'2026-11-14',rain:.1}]}],current,now);
 assert.equal(result.at,now-24*hour); assert.ok(Math.abs(result.values[0].delta-.22)<1e-9);
});
test('does not invent a comparison from missing, mismatched or out-of-window data',()=>{
 assert.equal(compare([{at:now-2*hour,days:[{key:'2026-11-14',rain:.4}]}],current,now),null);
 assert.equal(compare([{at:now-24*hour,days:[{key:'2026-11-15',rain:.4}]}],current,now),null);
 assert.equal(compare([{at:now-24*hour,days:[{key:'2026-11-14',rain:null}]}],current,now),null);
});
test('event page renders missing and valid member evidence without crashing',()=>{
 const start=source.indexOf('function phenPage() {'), end=source.indexOf('\n/* ------------------------------------------------------------------ page: radar',start);
 const page=source.slice(start,end);
 const t=Date.now()+3600000;
 const ctx={Date,Math,Number,Object,Array,String,Intl,fin:Number.isFinite,dayKey:()=> 'day',state:{lang:'en',city:{},snapshot:false,view:{daily:[{key:'day',t,code:1,pop:.5,ev:{rain:.5,heavy:null,storm:0,snow:0,fog:0,wind:0,frost:0,heat:0}}],rows:[{t,i:0,pop:.5,wind:10,gust:10,rh:50,temp:20,visMain:10000,models:{a:{P:2},b:{P:0},c:{P:1}},eventAvailable:{}}],iNow:0,zone:'UTC',active:['a','b','c'],order:['a','b','c'],famP:[{id:'ens',members:[[2],[0],[1]]}],famG:[],famT:[],members:3,periods:[],current:{source:'model'}},models:{},ens:{},warn:[]},eventHistory:{},forecastHistory:{},window:{},MODELS:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],ENSEMBLES:[],EVENTS:['rain','heavy','storm','snow','fog','wind','frost','heat'],PH_ICON:{},T:k=>k,header:()=>'',ckey:()=>'',yesterdayRainComparison:()=>null,esc:x=>String(x),dt:()=> 'date',dayLabel:()=> 'day',pct:x=>Number.isFinite(x)?Math.round(100*x)+'%':'—',num:x=>String(x),probCls:()=>'',icon:()=>'',iconSrc:()=>'',chart:()=>'',legend:()=>'',loadingCard:()=>'',errorCard:()=>'',periodText:()=>'',wdt:()=>''};
 const html=vm.runInNewContext(page+'; phenPage()',ctx);
 assert.match(html,/2\/3/); assert.match(html,/—/); assert.match(html,/No comparable saved forecast/); assert.match(html,/ERA5|Data status/);
});
