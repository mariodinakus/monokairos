'use strict';

// Compare fixed-lead archived forecasts with actual, time-bounded SYNOP gauges.
// The public report contains city-level data only; no visitor locations are stored.
const HOUR = 3600e3, DAY = 24 * HOUR, HISTORY = 90 * DAY, WET = 0.1;
const finite = Number.isFinite;
const round = (v, n = 2) => finite(v) ? +v.toFixed(n) : null;
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const km = (a, b) => {
  const rad = Math.PI / 180, dlat = (a.lat - b.lat) * rad, dlon = (a.lon - b.lon) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
};

async function json(url, timeout = 20000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'MONO Weather station verification (monokairos.vercel.app)' } });
  if (!r.ok) throw new Error('upstream unavailable');
  return r.json();
}

function stationReports(s, now) {
  return (s.list || []).filter(o => finite(o.t) && o.t <= now && o.t >= now - 96 * HOUR &&
    o.t % HOUR === 0 && finite(o.prcp) && o.prcp >= 0 && finite(o.prcpH) &&
    Number.isInteger(o.prcpH) && o.prcpH >= 1 && o.prcpH <= 24);
}

function hourlyMap(d) {
  const h = d?.hourly;
  if (!Array.isArray(h?.time) || !Array.isArray(h?.precipitation_previous_day1)) throw new Error('missing forecast archive');
  return new Map(h.time.map((t, i) => [t * 1000, h.precipitation_previous_day1[i]]));
}

function compareReports(station, ecmwf, gfs, now) {
  const e = hourlyMap(ecmwf), g = hourlyMap(gfs), rows = [];
  for (const r of stationReports(station, now)) {
    const start = r.t - r.prcpH * HOUR;
    let eSum = 0, gSum = 0, complete = true;
    // Open-Meteo's hourly precipitation is the sum of the preceding hour.
    for (let t = start + HOUR; t <= r.t; t += HOUR) {
      const a = e.get(t), b = g.get(t);
      if (!finite(a) || !finite(b) || a < 0 || b < 0) { complete = false; break; }
      eSum += a; gSum += b;
    }
    if (complete) rows.push({ stationId: String(station.id), start, end: r.t, hours: r.prcpH,
      observed: r.prcp, ecmwf: round(eSum, 4), gfs: round(gSum, 4) });
  }
  return rows;
}

function mergeRows(oldRows, incoming, now) {
  const rows = new Map();
  for (const r of [...(oldRows || []), ...incoming]) {
    if (!r || !r.stationId || !finite(r.start) || !finite(r.end) || r.end > now || r.end < now - HISTORY ||
      r.end <= r.start || ![r.observed, r.ecmwf, r.gfs].every(x => finite(x) && x >= 0)) continue;
    const key = `${r.stationId}:${r.start}:${r.end}`;
    // Preserve the original matched forecast and observation on subsequent refreshes.
    if (!rows.has(key)) rows.set(key, r);
  }
  return [...rows.values()].sort((a, b) => a.end - b.end).slice(-1600);
}

function nonOverlapping(rows, stationId) {
  const selected = [];
  for (const r of rows.filter(x => x.stationId === stationId).sort((a, b) => b.end - a.end || b.hours - a.hours)) {
    if (!selected.some(s => r.start < s.end && r.end > s.start)) selected.push(r);
  }
  return selected.sort((a, b) => a.end - b.end);
}

const predict = (r, weight = 0.5, scale = 1) => (weight * r.ecmwf + (1 - weight) * r.gfs) * scale;
function score(rows, weight = 0.5, scale = 1) {
  const counts = { hit: 0, miss: 0, falseAlarm: 0, correctDry: 0 };
  for (const r of rows) {
    const predictedWet = predict(r, weight, scale) >= WET, observedWet = r.observed >= WET;
    counts[predictedWet ? (observedWet ? 'hit' : 'falseAlarm') : (observedWet ? 'miss' : 'correctDry')]++;
  }
  const err=rows.map(r=>predict(r,weight,scale)-r.observed);
  const precision=counts.hit+counts.falseAlarm?counts.hit/(counts.hit+counts.falseAlarm):null;
  const recall=counts.hit+counts.miss?counts.hit/(counts.hit+counts.miss):null;
  return { n: rows.length, ...counts, mae: round(mean(err.map(Math.abs)), 2),
    rmse: round(err.length?Math.sqrt(mean(err.map(x=>x*x))):null,2),
    bias: round(mean(err),2), precision:round(precision,3),recall:round(recall,3),
    wetObserved: counts.hit + counts.miss };
}

function learn(rows) {
  // Distinct valid-time cut: neighbouring gauges at the same hour never leak
  // between the fitting and held-out windows.
  const ordered=rows.slice().sort((a,b)=>(a.end||0)-(b.end||0)||String(a.stationId||'').localeCompare(String(b.stationId||'')));
  const dates=[...new Set(ordered.map(r=>r.end).filter(finite))];
  const boundary=dates.length>=10?dates[Math.max(1,Math.floor(dates.length*.7))]:null;
  const split=Math.floor(ordered.length*.7);
  const train=boundary===null?ordered.slice(0,split):ordered.filter(r=>r.end<boundary);
  const test=boundary===null?ordered.slice(split):ordered.filter(r=>r.end>=boundary);
  const enough = train.length >= 20 && test.length >= 8 &&
    train.filter(r => r.observed >= WET).length >= 4 && test.filter(r => r.observed >= WET).length >= 2;
  if (!enough) return { ready: false, train: train.length, test: test.length, reason: 'insufficient_samples' };
  const mae = (data, w, s) => mean(data.map(r => Math.abs(predict(r, w, s) - r.observed)));
  const candidates = [];
  for (const w of [0, 0.25, 0.5, 0.75, 1]) for (const s of [0.7, 0.85, 1, 1.15, 1.3])
    candidates.push({ weight: w, scale: s, error: mae(train, w, s) });
  candidates.sort((a, b) => a.error - b.error || Math.abs(a.weight - 0.5) + Math.abs(a.scale - 1) - Math.abs(b.weight - 0.5) - Math.abs(b.scale - 1));
  const best = candidates[0], before = mae(test, 0.5, 1), after = mae(test, best.weight, best.scale);
  const ready = finite(before) && before > 0 && after <= before * 0.95;
  return { ready, train: train.length, test: test.length, weight: best.weight, scale: best.scale,
    baselineMae: round(before, 2), adjustedMae: round(after, 2), reason: ready ? 'validated' : 'not_better_in_test' };
}

function report(stationOrStations, rows, now) {
  const stations=Array.isArray(stationOrStations)?stationOrStations:[stationOrStations];
  const known=stations.filter(Boolean);
  const byStation=known.map(st=>({
    st, rows:nonOverlapping(rows,String(st.id))
  }));
  const samples=byStation.flatMap(x=>x.rows).sort((a,b)=>a.end-b.end||String(a.stationId).localeCompare(String(b.stationId)));
  const stats=score(samples),learning=learn(samples);
  // A familiar single-station field remains for older UI clients;
  // validation and learning now use ALL matched gauges in this region.
  const primary=known.slice().sort((a,b)=>a.dist-b.dist)[0]||null;
  const stationSummaries=byStation.map(({st,rows})=>{
    const s=score(rows);
    return {id:String(st.id),name:String(st.name||st.id),dist:round(st.dist,1),
      lat:st.lat,lon:st.lon,n:s.n,mae:s.mae,rmse:s.rmse,
      last:rows.at(-1)?.end??null};
  }).filter(s=>s.n>0).sort((a,b)=>a.dist-b.dist);
  const recent=samples.slice(-12).reverse().map(r=>{
    const predicted=predict(r),wet=r.observed>=WET,forecastWet=predicted>=WET;
    return {stationId:r.stationId,start:r.start,end:r.end,hours:r.hours,
      observed:r.observed,predicted:round(predicted),
      result:forecastWet?(wet?'hit':'false_alarm'):(wet?'miss':'correct_dry')};
  });
  return {version:3,available:true,checkedAt:now,threshold:WET,leadHours:24,
    station:primary?{id:String(primary.id),name:primary.name,lat:primary.lat,
      lon:primary.lon,dist:primary.dist}:null,
    stations:stationSummaries,network:{stations:stationSummaries.length,
      matchedPeriods:stats.n,coverageKm:75,cap:12,
      frequency:'every 3 hours',evaluation:'chronological held-out 30%',
      observation:'WMO SYNOP precipitation totals'},
    samples:stats,learning,first:samples[0]?.start??null,last:samples.at(-1)?.end??null,recent,
    source:'WMO SYNOP / OGIMET · ECMWF IFS 0.25° + GFS · Open-Meteo Previous Runs',
    note:'Network-based evaluation of 24-hour lead ECMWF/GFS against measured gauge accumulation; not a score of the entire MONO ensemble.'};
}
function chooseStations(synop,now){
  return (synop.stations||[]).filter(s=>finite(s.lat)&&finite(s.lon)&&finite(s.dist)&&
    s.dist<=75&&stationReports(s,now).some(r=>r.t>=now-36*HOUR))
    .sort((a,b)=>a.dist-b.dist).slice(0,12);
}
async function update(city,cached,now=Date.now(),getJSON=json){
  const [id,lat,lon]=city;
  const synop=await getJSON('https://monokairos.vercel.app/api/synop?'+new URLSearchParams({lat,lon,km:75,hours:96}),28000);
  const stations=chooseStations(synop,now);
  if(!stations.length)return {available:false,reason:'no_recent_gauge',city:id,checkedAt:now};
  const data=[],matching=[];
  // Batched multi-coordinate lookups: the same 24h lead at each station's
  // actual coordinates. 4 parallel upstream requests for up to 12 gauges.
  const batches=[];
  for(let i=0;i<stations.length;i+=6)batches.push(stations.slice(i,i+6));
  await Promise.all(batches.map(async block=>{
    const common={latitude:block.map(s=>s.lat).join(','),longitude:block.map(s=>s.lon).join(','),
      timezone:'UTC',timeformat:'unixtime',past_days:5,forecast_days:1,
      hourly:'precipitation_previous_day1'};
    const url=model=>'https://previous-runs-api.open-meteo.com/v1/forecast?'+new URLSearchParams({...common,models:model});
    const pair=await Promise.allSettled([getJSON(url('ecmwf_ifs025')),getJSON(url('ncep_gfs_seamless'))]);
    if(pair.some(x=>x.status!=='fulfilled'))return;
    const E=Array.isArray(pair[0].value)?pair[0].value:[pair[0].value];
    const G=Array.isArray(pair[1].value)?pair[1].value:[pair[1].value];
    if(E.length!==block.length||G.length!==block.length)return;
    for(let k=0;k<block.length;k++){
      if(!E[k]?.hourly||!G[k]?.hourly)continue;
      try{
        const reports=compareReports(block[k],E[k],G[k],now);
        if(reports.length){data.push(...reports);matching.push(block[k]);}
      }catch{/* A failed gauge must not invalidate others. */}
    }
  }));
  if(!data.length)throw Error('no_matched_forecast_and_observation');
  const rows=mergeRows(cached?.rows,data,now);
  const active=[...new Map([...matching,...(cached?.stations||[]).filter(s=>
    rows.some(r=>String(r.stationId)===String(s.id)))].map(s=>[String(s.id),s])).values()]
    .sort((a,b)=>(a.dist??1000)-(b.dist??1000)).slice(0,12);
  const result=report(active,rows,now);
  return {...result,city:id,rows};
}

module.exports = { update, report, score, learn, mergeRows, nonOverlapping, compareReports, stationReports, chooseStations, km, HOUR, WET };
