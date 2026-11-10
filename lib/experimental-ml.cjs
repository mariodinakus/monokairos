'use strict';
// Experimental residual forest and ridge; never used to select MONO's live forecast.
const M=require('../model.js');
const finite=Number.isFinite;
function makeRng(seed){let a=seed>>>0;return()=>{a=(Math.imul(a,1664525)+1013904223)>>>0;return a/4294967296;};}
function fitTree(rows,rng,depth=0){
 const avg=rows.reduce((s,r)=>s+r.y,0)/rows.length;
 if(depth>=5||rows.length<24)return {v:avg};
 const p=rows[0].x.length,features=Array.from({length:p},(_,i)=>i);
 for(let i=p-1;i>0;i--){const j=Math.floor(rng()*(i+1));[features[i],features[j]]=[features[j],features[i]];}
 let best=null;
 for(const f of features.slice(0,Math.max(2,Math.ceil(Math.sqrt(p))))){
  const ordered=rows.slice().sort((a,b)=>a.x[f]-b.x[f]);let sum=0,sumSq=0;
  for(const r of ordered){sum+=r.y;sumSq+=r.y*r.y;}
  let left=0,leftSq=0;for(let i=0;i<ordered.length-1;i++){
   const y=ordered[i].y;left+=y;leftSq+=y*y;const n=i+1,m=ordered.length-n;
   if(n<10||m<10||ordered[i].x[f]===ordered[i+1].x[f]||i%Math.max(1,Math.floor(ordered.length/32))!==0)continue;
   const loss=leftSq-left*left/n+(sumSq-leftSq)-(sum-left)**2/m;
   if(!best||loss<best.loss)best={f,t:(ordered[i].x[f]+ordered[i+1].x[f])/2,loss};
  }
 }
 if(!best)return {v:avg};
 const l=rows.filter(r=>r.x[best.f]<=best.t),r=rows.filter(r=>r.x[best.f]>best.t);
 if(!l.length||!r.length)return {v:avg};
 return {f:best.f,t:best.t,l:fitTree(l,rng,depth+1),r:fitTree(r,rng,depth+1)};
}
function predictTree(t,x){while(t&&t.v===undefined)t=x[t.f]<=t.t?t.l:t.r;return t?.v??0;}
function score(rows,predict){const e=rows.map(r=>predict(r)-r.truth).filter(finite);if(!e.length)return null;return {n:e.length,mae:e.reduce((a,x)=>a+Math.abs(x),0)/e.length,rmse:Math.sqrt(e.reduce((a,x)=>a+x*x,0)/e.length),bias:e.reduce((a,x)=>a+x,0)/e.length};}
function run(data,variable,lead,zoneHours){
 const ids=Object.keys(data.models[variable]||{}).filter(id=>Array.isArray(data.models[variable][id][lead]));
 if(!ids.length)return null;
 const N=data.times.length,rows=[];
 for(let i=0;i<N;i++){
  const truth=data.truth[variable]?.[i],vals=ids.map(id=>data.models[variable][id][lead][i]);if(!finite(truth)||vals.some(v=>!finite(v)))continue;
  const base=vals.reduce((a,b)=>a+b,0)/vals.length,h=zoneHours[i],angle=2*Math.PI*h/24;
  rows.push({t:data.times[i],x:[...vals,Math.sin(angle),Math.cos(angle)],base,truth,y:truth-base});
 }
 // Split by original time axis, not by random rows. Same paired rows for every score.
 const a=data.times[Math.floor(N*.6)],b=data.times[Math.floor(N*.8)];
 const tr=rows.filter(r=>r.t<a),val=rows.filter(r=>r.t>=a&&r.t<b),test=rows.filter(r=>r.t>=b);
 if(tr.length<120||val.length<24||test.length<24)return null;
 const rng=makeRng(717+lead+(variable==='wind'?100:0)),trees=[];
 for(let j=0;j<12;j++){const bag=Array.from({length:Math.min(800,tr.length)},()=>tr[Math.floor(rng()*tr.length)]);trees.push(fitTree(bag,rng));}
 const forest=r=>r.base+trees.reduce((sum,t)=>sum+predictTree(t,r.x),0)/trees.length;
 const X=tr.map(r=>[1,...r.x]),weights=M.ridge(X,tr.map(r=>r.y),Math.max(4,tr.length*.05));
 const ridge=r=>r.base+(weights?[1,...r.x].reduce((s,v,i)=>s+v*weights[i],0):0);
 const clamp=v=>variable==='wind'?Math.max(0,v):v;
 const evalSet=rows=>({mean:score(rows,r=>r.base),ridge:score(rows,r=>clamp(ridge(r))),forest:score(rows,r=>clamp(forest(r)))});
 return {train:tr.length,validation:evalSet(val),test:evalSet(test),models:ids,features:ids.length+2,trees:trees.length};
}
function runEvent(data,variable,lead,zoneHours,threshold,below=false){
 const ids=Object.keys(data.models[variable]||{}).filter(id=>Array.isArray(data.models[variable][id][lead]));
 if(!ids.length)return null;
 const n=data.times.length,rows=[];
 for(let i=0;i<n;i++){
  const actual=data.truth[variable]?.[i],values=ids.map(id=>data.models[variable][id][lead][i]);
  if(!finite(actual)||values.some(v=>!finite(v)))continue;
  const hit=v=>below?v<=threshold:v>=threshold,avg=values.reduce((a,b)=>a+b,0)/values.length;
  const vote=values.filter(hit).length/values.length,ang=2*Math.PI*zoneHours[i]/24;
  const transformed=v=>variable==='precip'?Math.log1p(Math.max(0,v)):(v-threshold)/10;
  const wet=hit(actual)?1:0;
  rows.push({t:data.times[i],x:[vote,transformed(avg),...values.map(transformed),Math.sin(ang),Math.cos(ang)],y:wet});
 }
 const a=data.times[Math.floor(n*.6)],b=data.times[Math.floor(n*.8)],tr=rows.filter(r=>r.t<a),val=rows.filter(r=>r.t>=a&&r.t<b),test=rows.filter(r=>r.t>=b);
 const wetTrain=tr.reduce((s,r)=>s+r.y,0);
 if(tr.length<120||wetTrain<10||tr.length-wetTrain<10||val.length<24||test.length<24)return null;
 const rng=makeRng(909+lead),trees=[];
 for(let j=0;j<16;j++)trees.push(fitTree(Array.from({length:Math.min(800,tr.length)},()=>tr[Math.floor(rng()*tr.length)]),rng));
 const features=r=>[1,r.x[0],r.x[1]],weights=M.logisticFit(tr.map(features),tr.map(r=>r.y),1,25);
 const forest=r=>Math.max(0,Math.min(1,trees.reduce((s,t)=>s+predictTree(t,r.x),0)/trees.length));
 const logistic=r=>weights?M.sigmoid(features(r).reduce((s,v,j)=>s+v*weights[j],0)):null;
 const baseline=wetTrain/tr.length;
 const score=(set,predict)=>{const usable=set.map(r=>({p:predict(r),y:r.y})).filter(r=>finite(r.p));if(!usable.length)return null;return {n:usable.length,wet:usable.reduce((s,r)=>s+r.y,0),brier:usable.reduce((s,r)=>s+(r.p-r.y)**2,0)/usable.length};};
 const evaluate=set=>({clim:score(set,()=>baseline),logistic:score(set,logistic),forest:score(set,forest)});
 return {train:tr.length,wetTrain,validation:evaluate(val),test:evaluate(test),models:ids,trees:trees.length,threshold};
}
function runRain(data,lead,hours){return runEvent(data,'precip',lead,hours,0.2);}
function evaluate(extracted,hours){const output={temp:{},wind:{},rain:{},frost:{},strongwind:{}};for(const variable of ['temp','wind'])for(let lead=0;lead<=5;lead++){const v=run(extracted,variable,lead,hours);if(v)output[variable][lead]=v;}for(let lead=0;lead<=5;lead++){for(const [key,variable,threshold,below] of [['rain','precip',0.2,false],['frost','temp',0,true],['strongwind','wind',39,false]]){const v=runEvent(extracted,variable,lead,hours,threshold,below);if(v)output[key][lead]=v;}}return output;}
module.exports={run,runRain,runEvent,evaluate,fitTree,predictTree};
