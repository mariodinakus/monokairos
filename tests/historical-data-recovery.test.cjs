'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),cfg=JSON.parse(read('vercel.json'));
function helpers(request){
  const start=app.indexOf('async function archivedJSON('),stop=app.indexOf('async function ensureTraining(',start);
  assert.ok(start>=0&&stop>start);
  const context={getJSON:request,Number,Array,Object};
  return vm.runInNewContext(app.slice(start,stop)+'\n({archivedJSON,historicalReason,validArchivedForecast})',context);
}
test('historical Open-Meteo endpoints use the same-origin cached proxies',()=>{
  const expected={'/proxy/mono-previous':'https://previous-runs-api.open-meteo.com/v1/forecast',
   '/proxy/mono-archive':'https://archive-api.open-meteo.com/v1/archive'};
  for(const [source,dest] of Object.entries(expected)){
    assert.equal(cfg.rewrites.find(r=>r.source===source)?.destination,dest);
    const header=cfg.headers.find(r=>r.source===source)?.headers?.find(h=>h.key==='Cache-Control')?.value;
    assert.match(header||'',/s-maxage=/);
    assert.match(app,new RegExp(source.replaceAll('/','\\/')));
  }
  assert.match(app,/const noCloud = M\.LEADS/);
  assert.match(app,/\.slice\(0,10\)/);
  assert.match(app,/const base = \{ \.\.\.llp\(c\)/);
  assert.doesNotMatch(app,/return chain\(\[used\], id => q\(PREV/);
});
test('proxy outage falls back to direct provider with genuinely available data',async()=>{
  const calls=[];
  const {archivedJSON}=helpers(async url=>{
    calls.push(url);
    if(url==='/proxy/example'){const e=new Error('bad gateway');e.status=502;throw e;}
    return {hourly:{time:[1,2,3]}};
  });
  const result=await archivedJSON('/proxy/example','https://previous-runs-api.open-meteo.com/test');
  assert.equal(result.hourly.time.length,3);
  assert.equal(calls.length,2);
  assert.match(calls[1],/previous-runs-api/);
});
test('client request mistakes are not retried against providers',async()=>{
  const calls=[];
  const {archivedJSON}=helpers(async url=>{calls.push(url);const e=new Error('invalid variable');e.status=400;throw e;});
  await assert.rejects(()=>archivedJSON('/proxy/bad','https://example.invalid'),/invalid variable/);
  assert.equal(calls.length,1);
});
test('real archived temperatures must cover enough hours; no fake data',()=>{
  const {validArchivedForecast,historicalReason}=helpers(async()=>({}));
  const time=Array.from({length:150},(_,i)=>i),temp=Array.from({length:150},(_,i)=>i/10);
  assert.equal(validArchivedForecast({hourly:{time,temperature_2m_previous_day1:temp}}),true);
  assert.equal(validArchivedForecast({hourly:{time,temperature_2m:temp.map(()=>null)}}),false);
  assert.equal(validArchivedForecast({hourly:{time:time.slice(0,30),temperature_2m:temp.slice(0,30)}}),false);
  assert.equal(historicalReason({status:429}),'rate');
  assert.equal(historicalReason({status:503}),'provider');
  assert.equal(historicalReason({name:'AbortError'}),'timeout');
});
test('historical UI explains provider errors and preserves the MONO models',()=>{
  assert.match(app,/trainError==='rate'/);
  assert.match(app,/trainError==='provider'/);
  assert.match(app,/state\.trainError = historicalReason\(e\)/);
  assert.match(app,/if\(truthResult\.error\)throw truthResult\.error/);
  assert.match(app,/M\.fitVariable/);
  assert.match(app,/runTraining\(\{ temp:/);
  assert.match(app,/function historyPage\(\)/);
});
