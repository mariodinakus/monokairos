'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs');
test('rain page prioritizes the forecast and keeps detailed sections reachable',()=>{
 const app=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
 const page=app.slice(app.indexOf('function rainPage() {'),app.indexOf('/* ------------------------------------------------------------------ page: weather events */'));
 assert.match(page,/return head \+ rainNowCard\(false\) \+ firstEpisode \+ shortRange \+ days/);
 for(const section of ['rain-future','rain-observations','rain-monthly','rain-explain','rain-alerts']) assert.ok(page.includes(section));
 assert.doesNotMatch(page,/communityStationsCard\(\)/);
 assert.match(page,/includeLive:false/);
});
test('missing rainfall amounts are not turned into dry forecasts',()=>{
 const vm=require('node:vm'), app=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
 const source=app.slice(app.indexOf('function rainDaily() {'),app.indexOf('\nfunction rainNowCard(',app.indexOf('function rainDaily() {')));
 const now=Date.now(),row={t:now+3600000,amount:null,i:0};
 const ctx={state:{lang:'el',view:{zone:'UTC',daily:[{key:'day',t:row.t,pop:.7}],rows:[row]}},Date,fin:Number.isFinite,memberTotals:()=>null,dayKey:()=> 'day',dayLabel:()=> 'Σήμερα',pct:()=> '70%',probCls:()=>'',mm1:v=>Number.isFinite(v)?String(v):'—',hhmm:()=>'',esc:x=>x,T:()=> 'ξηρά',totalWord:()=>''};
 vm.runInNewContext(source,ctx); const html=ctx.rainDaily(); assert.match(html,/— <small>mm/); assert.match(html,/Ποσότητα μη διαθέσιμη/); assert.doesNotMatch(html,/ξηρά/);
});
