const {test}=require('node:test');
const assert=require('node:assert/strict');
const Rain=require('../rain-intelligence.js');
const H=3600e3,now=Date.parse('2026-10-27T09:00:00Z');
test('SYNOP rainfall combines non-overlapping reported durations and preserves partial coverage',()=>{
 const o=Rain.observed([{id:'TEST',name:'TEST',dist:12,list:[
 {t:now-1*H,prcp:4,prcpH:6},{t:now-7*H,prcp:2,prcpH:6},
 {t:now-1*H,prcp:12,prcpH:12}, // overlaps other intervals, never double-count
 {t:now-25*H,prcp:3,prcpH:6}
 ]}],null,now);
 assert.equal(o.type,'SYNOP');assert.equal(o.mm,6);assert.equal(o.covered,12);
});
test('reports outside the last day are excluded and gauge absence is not confused with a model estimate',()=>{
 assert.equal(Rain.observed([{id:'old',dist:2,list:[{t:now-48*H,prcp:5,prcpH:6}]}],null,now),null);
 const p=Rain.observed([], {rain1h:1.6,nRain:3},now);
 assert.equal(p.covered,1);assert.equal(p.type,'PWS-area');
});
test('shared skill is a fallback only when a location has no locally trained score',()=>{
 const shared={rain:{mae:.17,n:150},cloud:{mae:17.2}};
 const a=Rain.metrics({},shared);
 assert.equal(a.amountMae,.17);assert.equal(a.cloudMae,17.2);
 const b=Rain.metrics({precip:{leads:{0:{amountTest:{mae:.12},test:{vote:.2},choice:'vote'}}},cloud:{leads:{0:{choice:'mean',test:{mean:{mae:13.7}}}}}},shared);
 assert.equal(b.amountMae,.12);assert.equal(b.cloudMae,13.7);
});
test('mobile overview contains understandable categories without inventing missing rain observations',()=>{
 const view={rows:Array.from({length:25},(_,i)=>({t:now+(i+1)*H,amount:.5,cloud:60}))};
 const html=Rain.render({lang:'el',view,stations:[],trainingStatus:'loading'});
 assert.match(html,/ΠΟΣΗ ΒΡΟΧΗ ΕΡΙΞΕ/);assert.match(html,/ΤΙ ΒΡΟΧΗ ΕΡΧΕΤΑΙ/);
 assert.match(html,/ΠΟΣΟ ΜΕΣΑ ΠΕΣΑΜΕ/);assert.match(html,/ΠΩΣ ΘΑ ΕΙΝΑΙ Ο ΟΥΡΑΝΟΣ/);
 assert.match(html,/Δεν βρέθηκε διαθέσιμο βροχόμετρο/);assert.match(html,/🌧/);
});
