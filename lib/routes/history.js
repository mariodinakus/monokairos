/* Shared historical backtest API — identical methodology for every visitor.
 * Edge cache (6h) plus bounded in-process deduplication. */
'use strict';
const {guard,coordinates}=require('../server.cjs');
const Core=require('../history-backtest-core.cjs');
const cache=new Map(),pending=new Map(),MAX=48,TTL=6*3600e3;
module.exports=async(req,res)=>{
  if(!guard(req,res))return;
  const c=coordinates(req);
  const days=Number(c?.params.get('days')||62);
  if(!c||![62,180,365].includes(days)){
    res.setHeader('Cache-Control','no-store');
    res.status(400).json({error:'Invalid coordinates or history window'});return;
  }
  const zone=Core.isoZone(c.params.get('zone')||'UTC');
  const lat=Math.round(c.lat*100)/100,lon=Math.round(c.lon*100)/100;
  const key=[lat.toFixed(2),lon.toFixed(2),days,zone].join(':');
  const hit=cache.get(key);
  res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=43200');
  if(hit&&Date.now()-hit.cachedAt<TTL){res.status(200).json(hit.data);return;}
  if(!pending.has(key)&&pending.size>=3){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Retry-After','20');
    res.status(503).json({error:'Backtest service busy',reason:'backtest_busy'});return;
  }
  try{
    if(!pending.has(key))pending.set(key,Core.compute({lat,lon,days,zone}).then(data=>{
      if(cache.size>=MAX)cache.delete(cache.keys().next().value);
      cache.set(key,{cachedAt:Date.now(),data});return data;
    }).finally(()=>pending.delete(key)));
    const data=await pending.get(key);
    res.status(200).json(data);
  }catch(e){
    res.setHeader('Cache-Control','no-store');
    if(e?.status===429)res.setHeader('Retry-After','120');
    const reason=e?.status===429?'historical_provider_rate_limited'
      :e?.status>=500?'historical_provider_unavailable'
      :e?.name==='TimeoutError'||e?.name==='AbortError'?'historical_timeout'
      :'historical_data_unavailable';
    res.status(503).json({error:'Historical verification unavailable',reason});
  }
};
