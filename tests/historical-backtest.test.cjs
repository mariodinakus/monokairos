'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');

function fixture(n=960) {
  const start = Date.UTC(2026,0,1), times = Array.from({length:n}, (_,i)=>start+i*3600000);
  const hours = times.map(t=>new Date(t).getUTCHours());
  const truth = times.map((_,i)=>14+5*Math.sin(2*Math.PI*i/24)+Math.cos(i/90));
  const base = {times,hours,truth,models:{
    global_a:{1:truth.map((t,i)=>t+1+0.2*Math.sin(i/12))},
    global_b:{1:truth.map((t,i)=>t-1.4+0.15*Math.cos(i/8))}
  }};
  return base;
}

test('Unseen time-ordered holdout compares a historical forecast against its future ERA5 reference', () => {
  const x=fixture(), fit=M.fitVariable(x), L=fit.leads[1];
  assert.ok(L && L.n.train>0 && L.n.val>0 && L.n.test>0);
  assert.ok(L.holdout.length>10);
  assert.ok(L.holdout.every(r=>r.length===4 && r.every(Number.isFinite)));
  assert.ok(L.holdout.every((r,i)=>!i || r[0]>L.holdout[i-1][0]));
  assert.ok(L.holdout[0][0]>=x.times[Math.floor(x.times.length*0.8)]);
  assert.ok(Number.isFinite(L.test[L.choice].mae));
});

test('Rain holdout stores predicted probability, occurrence and verified precipitation separately', () => {
  const x=fixture(); x.truth=x.times.map((_,i)=>i%26<4?0.75:0);
  x.models={global_a:{1:x.truth.map((r,i)=>r?0.7:0.05)},global_b:{1:x.truth.map((r,i)=>r?0.5:0.02)}};
  const L=M.fitRain(x).leads[1];
  assert.ok(L.holdout.length>10);
  assert.ok(L.holdout.every(r=>r.length===5 && r[1]>=0 && r[1]<=1 && (r[2]===0||r[2]===1)));
  assert.ok(Number.isFinite(L.test[L.choice]));
});
