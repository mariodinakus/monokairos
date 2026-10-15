const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../forecast-core.js');
const HOUR=3600e3,now=Date.parse('2026-10-15T12:00:00Z');
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}});
function sample(g){
 const time=Array.from({length:200},(_,i)=>(now-12*HOUR)/1000+i*3600);
 return g.points.map(()=>({hourly:{time:[...time],precipitation:time.map(()=>1),temperature_2m:time.map(()=>0),wind_gusts_10m:time.map((_,i)=>i),pressure_msl:time.map(()=>1010),cloud_cover:time.map(()=>0),snowfall:time.map(()=>0),wind_direction_10m:time.map(()=>180),wind_speed_10m:time.map(()=>20)}}));
}
test('local grids stay within latitude limits and wrap longitude across the date line',()=>{
 const g=Core.grid('local',89,179.9);
 assert.ok(g.points.every(p=>Math.abs(p.lat)<=90&&p.queryLon>=-180&&p.queryLon<180));
 assert.ok(g.bounds[3]>180);assert.equal(g.points.length,g.nx*g.ny);
 assert.throws(()=>Core.grid('local',91,0));assert.throws(()=>Core.grid('invalid'));
});
test('world grid covers every longitude and closes the date-line seam',()=>{
 const g=Core.grid('world');assert.deepEqual(g.bounds,[-85,-180,85,180]);assert.equal(g.points.length,325);
 for(let y=0;y<g.ny;y++){const first=g.points[y*g.nx],last=g.points[(y+1)*g.nx-1];assert.equal(first.lat,last.lat);assert.equal(first.queryLon,last.queryLon);}
 assert.ok(g.points.some(p=>p.lat< -60));assert.ok(g.points.some(p=>p.lon>150));
});
test('cached forecast windows retain only the next seven days and align every field with its timestamp',()=>{
 const g=Core.grid('greece'),d=Core.mapData(sample(g),g,now,8),later=now+7*HOUR,v=Core.futureMap(d,later);
 assert.ok(v.times.every(t=>t>=later&&t<=later+7*24*HOUR));
 assert.equal(v.points[0].frames[0][2],d.points[0].frames[d.times.indexOf(v.times[0])][2]);
 assert.equal(d.times[0],now);assert.throws(()=>Core.futureMap(d,now+10*24*HOUR),/No future/);
});
test('wind flow interpolates vectors across north and wraps around the date line without inventing missing values',()=>{
 const d={region:'world',bounds:[-85,-180,85,180],nx:3,ny:2,points:Array.from({length:6},(_,i)=>({frames:[[0,0,0,0,0,0,i%3===1?1:359,20]]}))};
 const north=Core.windAt(d,0,-90);assert.ok(Math.abs(north.u)<.01);assert.ok(north.v< -19.9);
 assert.deepEqual(Core.windAt(d,0,181),Core.windAt(d,0,-179));assert.equal(Core.windAt(d,86,0),null);
 d.points[0].frames[0][6]=null;assert.equal(Core.windAt(d,-50,-150),null);
});
test('forecast raster rows follow Mercator latitude rather than a linear screen latitude',()=>{
 assert.ok(Math.abs(Core.rasterLatitude(0,30,65)-65)<1e-9);
 assert.ok(Math.abs(Core.rasterLatitude(1,30,65)-30)<1e-9);
 assert.ok(Core.rasterLatitude(.5,30,65)>50&&Core.rasterLatitude(.5,30,65)<51);
 assert.ok(Math.abs(Core.rasterLatitude(.5,-30,30))<1e-9);
});
test('map frames sum the preceding six hours, use maximum gusts, retain zero and keep missing data null',()=>{
 const g=Core.grid('greece'),raw=sample(g);raw[1].hourly.precipitation[9]=null;
 const d=Core.mapData(raw,g,now+1);
 assert.equal(d.times[0],now+6*HOUR);assert.equal(d.times.at(-1),now+7*24*HOUR);
 assert.deepEqual(d.points[0].frames[0],[6,0,18,1010,0,0,180,20]);
 const atNow=Core.mapData(raw,g,now);assert.equal(atNow.points[1].frames[0][0],null);
 assert.equal(Core.sum([0,0]),0);assert.equal(Core.sum([0,null]),null);
});
test('incomplete or misaligned map forecasts are rejected rather than spatially or temporally shifted',()=>{
 const g=Core.grid('greece'),raw=sample(g);
 assert.throws(()=>Core.mapData(raw.slice(1),g,now),/Incomplete/);
 raw[1].hourly.time[10]+=3600;assert.throws(()=>Core.mapData(raw,g,now),/Mismatched/);
 const gap=sample(g);gap.forEach(d=>d.hourly.time.splice(10,1));assert.throws(()=>Core.mapData(gap,g,now),/Non-hourly/);
});
test('storm signals require complete rain windows and ignore missing data, past hours and distant events',()=>{
 const rows=Array.from({length:48},(_,i)=>({t:now+(i+1)*HOUR,amount:1,gust:0,pStorm:0,pSnow:0}));
 rows[5].gust=90;rows[6].pStorm=.8;
 rows.push({t:now-HOUR,amount:999,gust:150},{t:now+8*24*HOUR,gust:200});
 const s=Core.signals(rows,now);
 assert.equal(s.coverage,48);assert.equal(s.events.find(e=>e.type==='rain').value,24);
 assert.equal(s.events.find(e=>e.type==='wind').value,90);assert.equal(s.events.find(e=>e.type==='storm').value,80);
 assert.equal(s.events.filter(e=>e.type==='wind').length,1);
 const missing=rows.slice(0,24).map(r=>({...r,amount:null,gust:null,pStorm:null,pSnow:null}));
 assert.deepEqual(Core.signals(missing,now),{coverage:0,events:[]});
 const gap=rows.slice(0,24).filter((_,i)=>i!==12);assert.ok(!Core.signals(gap,now).events.some(e=>e.type==='rain'));
});
test('outlook discards expired weeks and null padding, preserves neutral anomalies and calendar month boundaries',()=>{
 const raw={weekly:{time:[now/1000-8*86400,now/1000-2*86400,now/1000+5*86400,now/1000+12*86400],temperature_2m_anomaly:[1,0,-1,null],precipitation_mean:[10,0,5,null]},monthly:{time:[Date.UTC(2026,8,1)/1000,Date.UTC(2026,9,1)/1000,Date.UTC(2026,10,1)/1000,Date.UTC(2026,11,1)/1000],temperature_2m_anomaly:[1,0,.7,null],precipitation_anomaly:[1,0,-2,null]}};
 const d=Core.outlookData(raw,now);
 assert.equal(d.weekly.length,2);assert.equal(d.weekly[0].tempAnomaly,0);assert.equal(d.weekly[0].rain,0);
 assert.equal(d.monthly.length,2);assert.equal(d.monthly[0].end,Date.UTC(2026,10,1));
 assert.equal(d.monthly[1].end,Date.UTC(2026,11,1));assert.throws(()=>Core.outlookData({},now),/No outlook/);
});
test('forecast endpoints reject invalid inputs without contacting a user-selected upstream',async()=>{
 const original=global.fetch;global.fetch=async()=>assert.fail('invalid input contacted upstream');
 try{
  for(const url of ['/api/weather-maps?region=secret','/api/weather-maps?model=https://example.com','/api/weather-maps?region=local&lat=91&lon=0','/api/weather-maps?region=local&lat=&lon=0']){const r=response();await require('../api/weather-maps.js')({url},r);assert.equal(r.code,400);}
  for(const url of ['/api/outlook','/api/outlook?lat=0&lon=Infinity','/api/outlook?lat=0&lon=181']){const r=response();await require('../api/outlook.js')({url},r);assert.equal(r.code,400);}
 }finally{global.fetch=original;}
});
test('map requests coalesce and cache the normalized grid; failed upstreams remain unavailable',async()=>{
 const original=global.fetch,g=Core.grid('greece'),raw=sample(g),handler=require('../api/weather-maps.js');let calls=0;
 // Use live-aligned timestamps to exercise the handler without a network dependency.
 const delta=Math.floor((Date.now()-now)/HOUR)*3600;raw.forEach(d=>{d.hourly.time=d.hourly.time.map(t=>t+delta);});
 global.fetch=async url=>{calls++;assert.ok(String(url).startsWith('https://api.open-meteo.com/v1/forecast?'));return new Response(JSON.stringify(raw));};
 try{
  const a=response(),b=response();await Promise.all([handler({url:'/api/weather-maps'},a),handler({url:'/api/weather-maps'},b)]);
  assert.equal(calls,1);assert.equal(a.code,200);assert.equal(b.body.points.length,63);
  const c=response();await handler({url:'/api/weather-maps'},c);assert.equal(calls,1);
  global.fetch=async()=>new Response('unavailable',{status:503});const bad=response();await handler({url:'/api/weather-maps?model=gfs'},bad);
  assert.equal(bad.code,502);assert.equal(bad.headers['Cache-Control'],'no-store');
 }finally{global.fetch=original;}
});
