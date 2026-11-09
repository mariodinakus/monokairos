'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const Core=require('../lib/history-backtest-core.cjs');
const app=read('app.js'),cfg=JSON.parse(read('vercel.json'));

function syntheticArchives(N=384){
 const time=Array.from({length:N},(_,i)=>Math.floor(Date.UTC(2026,8,1)/1000)+3600*i);
 const truth={time,temperature_2m:[],wind_speed_10m:[],precipitation:[],cloud_cover:[]};
 for(let i=0;i<N;i++){
  const h=i%24;
  truth.temperature_2m.push(18+5*Math.sin(h*Math.PI/12)+Math.cos(i/29));
  truth.wind_speed_10m.push(9+4*Math.sin(i/17));
  truth.precipitation.push(i%17<4?1.2:0);
  truth.cloud_cover.push(40+25*Math.sin(i/15));
 }
 const forecast={time};
 for(let m=0;m<3;m++)for(let k=0;k<=5;k++)for(const [key,src] of [
  ['temperature_2m',truth.temperature_2m],
  ['wind_speed_10m',truth.wind_speed_10m],
  ['precipitation',truth.precipitation]
 ]){
   forecast[key+(k?'_previous_day'+k:'')+'_'+Core.IDS[m]]=src.map((x,i)=>x+((m-1)*.4)+(Math.sin(i/5+k)*.15));
 }
 return {truth:{hourly:truth},forecast:{hourly:forecast}};
}
test('the browser no longer downloads historical models itself',()=>{
 assert.match(app,/getJSON\(q\('\/api\/history',params\),55000\)/);
 const training=app.slice(app.indexOf('async function ensureTraining('),app.indexOf('/* Reuse already-validated historical results'));
 assert.doesNotMatch(training,/getJSON\(q\(PREV,\s*\{ \.\.\.base/);
 assert.match(app,/async function ensureTraining/);
 assert.match(cfg.rewrites.find(x=>x.source==='/api/history')?.destination||'',/route=history/);
 assert.match(read('api/mono.js'),/'history': \(\) => require\('\.\.\/lib\/routes\/history\.js'\)/);
});
test('server selects real archived model runs against ERA5, not live predictions',()=>{
 const s=read('lib/history-backtest-core.cjs');
 assert.match(s,/previous-runs-api\.open-meteo\.com/);
 assert.match(s,/archive-api\.open-meteo\.com/);
 assert.match(s,/models:'era5'/);
 assert.match(s,/M\.fitVariable/);
 assert.match(s,/M\.fitRain/);
 assert.deepEqual(Core.IDS,['ecmwf_ifs','ncep_gfs_seamless','dwd_icon_seamless']);
 assert.equal(Core.hourlyFields().length,18);
});
test('server rejects invalid coordinate and history horizons',async()=>{
 await assert.rejects(()=>Core.compute({lat:999,lon:22,days:62,fetcher:()=>{throw Error('should not fetch')}}),/Invalid/);
 await assert.rejects(()=>Core.compute({lat:40,lon:22,days:200,fetcher:()=>{throw Error('should not fetch')}}),/Invalid/);
 assert.equal(Core.isoZone('Europe/Athens'),'Europe/Athens');
 assert.equal(Core.isoZone('../../private'),'UTC');
});
test('archive alignment preserves missingness, never invents temperatures',()=>{
 const a=Core.align({time:[1,3,4]},[10,30,null],[1,2,3,4]);
 assert.deepEqual(a,[10,null,30,null]);
 const {truth,forecast}=syntheticArchives();
 const parsed=Core.extract(truth,forecast);
 assert.equal(parsed.covered,3);
 assert.equal(parsed.result.times.length,384);
 assert.equal(Object.keys(parsed.result.models.temp).length,3);
 const bad=structuredClone(forecast);
 for(const key of Object.keys(bad.hourly))if(key!=='time')bad.hourly[key]=bad.hourly[key].map(()=>null);
 assert.throws(()=>Core.extract(truth,bad),/No usable/);
});
test('entire shared API training pipeline produces real holdout MAE and all lead days',async()=>{
 const {truth,forecast}=syntheticArchives();
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  return {ok:true,status:200,json:async()=>url.includes('previous-runs-api')?forecast:truth};
 };
 const now=Date.UTC(2026,10,9);
 const result=await Core.compute({lat:40.64,lon:22.94,days:62,zone:'Europe/Athens',now,fetcher});
 assert.equal(calls.length,2);
 assert.equal(result.v,'4.6');
 assert.equal(result.days,62);
 assert.equal(result.models,3);
 assert.equal(result.source,'Open-Meteo Previous Runs / ERA5');
 assert.equal(result.start,'2026-09-08');
 assert.equal(result.end,'2026-11-03');
 assert.equal(result.temp.leads[0].n.test>0,true);
 assert.equal(Number.isFinite(result.temp.leads[0].test.mean.mae),true);
 assert.equal(Object.keys(result.temp.leads).length,6);
 assert.equal(Object.keys(result.wind.leads).length,6);
 assert.equal(Object.keys(result.precip.leads).length,6);
});
test('upstream rate limiting surfaces as an error and never generates success scores',async()=>{
 const fetcher=async()=>({ok:false,status:429});
 await assert.rejects(()=>Core.compute({lat:40.64,lon:22.94,days:62,zone:'UTC',fetcher}),
  e=>e.status===429);
});
