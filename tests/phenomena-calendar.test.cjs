'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../phenomena-calendar.js');
const DAY=86400000;
const now=Date.UTC(2026,10,12,10);
function days(){
 return Array.from({length:7},(_,i)=>({t:Date.UTC(2026,10,12+i),key:'day-'+i,hi:20,lo:9,mm:2,
  ev:i===1?{rain:.7,heavy:.35,storm:.27,wind:.40}:{rain:.1,heavy:.08,storm:.05,wind:.1}}));
}
test('calendar shows seven days of actual daily probabilities without inventing warnings',()=>{
 const rows=C.entries(days(),now);
 assert.equal(rows.length,7);
 assert.equal(rows[1].signals.length,3);
 assert.equal(rows[1].signals.some(x=>x.id==='rain'),false);
 const html=C.render({daily:days(),zone:'Europe/Athens'},{now,lang:'el'});
 assert.match(html,/Ημερολόγιο φαινομένων/);
 assert.match(html,/Έντονη βροχή/);
 assert.match(html,/35%/);
 assert.match(html,/όχι πιθανότητα επιτυχίας ή επίσημη προειδοποίηση/);
 assert.doesNotMatch(html,/100% βεβαιότητα/);
});
test('missing probabilities are not relabelled as dry weather',()=>{
 const sample=[{t:Date.UTC(2026,10,12),hi:20,lo:10,mm:null,ev:{}}];
 const html=C.render({daily:sample,zone:'UTC'},{now,lang:'en'});
 assert.match(html,/Insufficient event data/);
 assert.doesNotMatch(html,/No standout signal/);
 assert.equal(C.render({daily:[],zone:'UTC'},{now}), '');
});
test('out of range events and past calendar days are not shown',()=>{
 const sample=days();
 sample[0].ev={rain:1.5,storm:-.1};
 assert.equal(C.entries(sample,now)[0].signals.length,0);
 const tooOld=[{t:now-4*DAY,ev:{rain:.95}}];
 assert.equal(C.entries(tooOld,now).length,0);
});
