'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function create(){
 const saved=new Map();
 const root={localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../month-trend-history.js'),'utf8'),{window:root,Date,Map,Number,Intl});
 return {api:root.MONOMonthHistory,saved};
}
const oldRows=[{date:'2099-02-02',temp:-1.1,rain:3},{date:'2099-02-09',temp:-0.4,rain:1}];
const newRows=[{date:'2099-02-02',temp:-2.1,rain:11},{date:'2099-02-09',temp:-0.3,rain:1.2}];
test('history records distinct snapshots for exactly the same city, with opt-in storage only',()=>{
 const {api,saved}=create();
 assert.equal(api.record('40.640,22.940',oldRows,false,1000),false);
 assert.equal(saved.size,0);
 assert.equal(api.read('40.640,22.940',false).length,0);
 assert.equal(api.record('40.640,22.940',oldRows,true,1000),true);
 assert.equal(api.record('40.640,22.940',oldRows,true,2000),false);
 assert.equal(api.record('40.640,22.940',newRows,true,3000),true);
 assert.equal(api.read('40.640,22.940',true).length,2);
 assert.equal(api.read('37.980,23.730',true).length,0);
 assert.equal(saved.size,1);
});
test('only matching future calendar weeks are compared and no unavailable values become zero',()=>{
 const {api}=create();
 const result=api.comparisons(oldRows,newRows,Date.parse('2099-01-01T00:00:00Z'));
 assert.equal(result.length,2);
 assert.ok(Math.abs(result[0].deltaTemp+1)<1e-9);
 assert.ok(Math.abs(result[0].deltaRain-8)<1e-9);
 assert.equal(result[0].significant,true);
 assert.equal(result[1].significant,false);
 assert.equal(api.comparisons(oldRows,[{date:'2099-02-03',temp:3,rain:10}],Date.parse('2099-01-01T00:00:00Z')).length,0);
 assert.equal(api.comparisons(oldRows,newRows,Date.parse('2099-02-06T00:00:00Z')).length,1);
 assert.equal(api.comparisons([{date:'2099-02-02',temp:1,rain:null}],[{date:'2099-02-02',temp:1.3,rain:5}],Date.parse('2099-01-01T00:00:00Z'))[0].deltaRain,null);
});
test('history UI labels actual saved retrievals instead of pretending to verify model runs',()=>{
 const {api}=create();
 api.record('40.640,22.940',oldRows,true,Date.parse('2099-01-01T12:00:00Z'));
 assert.match(api.render('40.640,22.940','el',true),/Πρώτη καταγραφή/);
 api.record('40.640,22.940',newRows,true,Date.parse('2099-01-02T12:00:00Z'));
 const html=api.render('40.640,22.940','el',true);
 assert.match(html,/Αξιόλογη αλλαγή/);
 assert.match(html,/Σύγκριση καταγραφών/);
 assert.match(html,/όχι πιστοποιημένο αρχείο εκτελέσεων/);
 assert.match(api.render('40.640,22.940','en',true),/Notable revision detected/);
});
test('forecast snapshot history is loaded before monthly module and monthly UI remains inside home',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');
 assert.match(html,/month-trend-history\.js\?v=[a-f0-9]{10}/);
 assert.ok(html.indexOf('month-trend-history.js')<html.indexOf('month-trend.js'));
 assert.match(app,/historyEnabled:cacheAllowed\(\)/);
 assert.match(app,/homeMore\('month'/);
});
