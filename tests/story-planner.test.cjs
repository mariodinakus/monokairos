const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js','utf8');
const snippet = source.slice(source.indexOf('const monoPlan ='), source.indexOf('/* ------------------------------------------------------------------ page: now */'));
const now = Date.UTC(2026, 10, 12, 6);
function harness() {
  const sandbox = { state:{lang:'en'}, Date:class extends Date { static now(){return now;} }, Intl, Number, Math,
    fin:Number.isFinite, pct:x=>Math.round(x*100)+'%', num:(x,d=0)=>Number(x).toFixed(d), deg:x=>Number(x).toFixed(0)+'°C',
    esc:x=>String(x), dt:t=>new Date(t).toISOString(), hhmm:t=>new Date(t).toISOString().slice(11,16),
    dayLabel:(_,i)=>'day '+i, btn:()=>'' };
  vm.createContext(sandbox);
  vm.runInContext(snippet+';this.renderPlanner=monoPlanCard;this.settings=monoPlan;',sandbox);
  return sandbox;
}
test('planner chooses a drier complete window and does not treat missing weather as dry',()=>{
 const s=harness();s.settings.duration=1;s.settings.start=8;s.settings.end=12;
 const rows=[8,9,10].map((h,i)=>({t:Date.UTC(2026,10,12,h),pop:[.9,null,.1][i],wind:5,temp:20,amount:0}));
 const html=s.renderPlanner({zone:'UTC',rows});
 assert.match(html,/10:00/);assert.match(html,/10%/);
 const unavailable=s.renderPlanner({zone:'UTC',rows:[rows[1]]});
 assert.match(unavailable,/Not enough complete/);
});
test('planner honours selected start and end hours',()=>{
 const s=harness();s.settings.duration=1;s.settings.start=8;s.settings.end=9;
 const rows=[8,9].map((h,i)=>({t:Date.UTC(2026,10,12,h),pop:i?.01:.9,wind:5,temp:20,amount:0}));
 const html=s.renderPlanner({zone:'UTC',rows});assert.match(html,/08:00/);assert.doesNotMatch(html,/01%/);
});
