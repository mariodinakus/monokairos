'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Stats=require('../statistical-lab.js');
const MathTypeset=require('../equation-typeset.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Pearson, Spearman and OLS identify relationships but require enough data',()=>{
 const positive=Array.from({length:35},(_,i)=>[i,3*i+7]);
 const negative=Array.from({length:35},(_,i)=>[i,100-2*i]);
 assert.ok(Math.abs(Stats.pearson(positive)-1)<1e-10);
 assert.ok(Math.abs(Stats.spearman(positive)-1)<1e-10);
 assert.ok(Math.abs(Stats.pearson(negative)+1)<1e-10);
 const fit=Stats.regression(positive);
 assert.ok(Math.abs(fit.slope-3)<1e-9);
 assert.ok(Math.abs(fit.intercept-7)<1e-9);
 assert.equal(Stats.pearson(positive.slice(0,10)),null);
 assert.equal(Stats.pearson(Array.from({length:30},(_,i)=>[2,i])),null);
});
test('forecast correlations do not replace missing values with zero and preserve forecast sample',()=>{
 const rows=Array.from({length:48},(_,i)=>({t:Date.now()+i*3600000,temp:10+i/10,rh:70-i/2,pres:1010+i/20,cloud:30+i,wind:5+i/4,amount:i%9===0?2:0}));
 rows[1].amount=null;rows[2].rh=NaN;
 const d=Stats.dataset({rows,iNow:0});
 assert.equal(d.length,48);
 assert.equal(d[1].amount,null);
 assert.equal(Stats.paired(d,'temp','amount').length,47);
 assert.equal(Stats.paired(d,'temp','rh').length,47);
 const matrix=Stats.matrix(d);assert.equal(matrix.length,6);
 assert.ok(matrix[0][1].r<-.99);
 assert.equal(matrix[0][5].n,47);
});
test('Statistical Lab uses forecast data and held-out scores separately',()=>{
 const rows=Array.from({length:48},(_,i)=>({t:Date.now()+i*3600000,temp:i/3,rh:70-i/4,pres:1015-i/30,cloud:i,wind:7+i/10,amount:i%5===0?1:0}));
 const train={temp:{leads:{0:{test:{mean:{mae:1.6,rmse:2.2,n:90},ridge:{mae:1.2,rmse:1.7,n:90}}}}},precip:{leads:{0:{test:{mean:0.18,logistic:0.15}}}}};
 const html=Stats.render({view:{rows,iNow:0},train,lead:0,lang:'el'});
 assert.match(html,/Πίνακας συσχετίσεων/);
 assert.match(html,/data-sl-pair="pressure-rain"/);
 assert.match(html,/sl-svg/);
 assert.match(html,/Pearson/);
 assert.match(html,/Spearman/);
 assert.match(html,/1,20°/);
 assert.match(html,/Brier score/);
 assert.match(html,/ΟΧΙ πραγματικές μετρήσεις/);
});
test('native MathML renders the MONO formula cards without remote dependencies',()=>{
 const html=MathTypeset.render('01','ŷ = (1 / M) Σ fₘ');
 assert.match(html,/<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML" display="block">/);
 assert.match(html,/<mfrac>/);
 assert.match(html,/<munderover>/);
 for(const id of ['01b','02','03','04','05','05b','06','06b','07','08','09']){
   assert.match(MathTypeset.render(id,'formula'),/<math/);
 }
 assert.equal(MathTypeset.render('unknown',''),'<div class="equation-formula"></div>');
});
test('MONO Lab uses its existing routes; math and charts are loaded before app.js',()=>{
 const html=read('index.html'),app=read('app.js'),eq=read('equations.js');
 assert.match(html,/statistical-lab\.css\?v=[a-f0-9]{10}/);
 assert.match(html,/equation-polish\.css\?v=[a-f0-9]{10}/);
 for(const name of ['statistical-lab.js','equation-typeset.js']){
  assert.match(html,new RegExp(name.replace('.','\\.')+'\\?v=[a-f0-9]{10}'));
  assert.ok(html.indexOf(name)<html.indexOf('app.js?v='));
 }
 assert.ok(html.indexOf('equation-typeset.js')<html.indexOf('equations.js'));
 assert.match(eq,/MONOMathTypeset\?\.render/);
 assert.match(app,/MONOStats\?\.render/);
 assert.match(app,/MONOStats\?\.mount/);
 assert.match(app,/const NAV_GROUPS =/);
});
