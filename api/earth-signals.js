/* Global signals: grounded NOAA RONI and USGS seismic observations. No inferred probabilities. */
'use strict';

const RONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt';
const NINO_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/Rnino34.ascii.txt';
const QUAKE_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const STORM_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';

async function readText(url, limit = 70000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10500), headers: { 'Accept': 'text/plain' } });
  if (!r.ok) throw new Error('Upstream HTTP ' + r.status);
  const text = await r.text();
  if (text.length > limit) throw new Error('Unexpected data size');
  return text;
}
function rowsRONI(text) {
  return text.split(/\r?\n/).map(line => {
    const m = line.trim().match(/^([A-Z]{3})\s+(\d{4})\s+(-?\d+(?:\.\d+)?)$/);
    if (!m || !['DJF','JFM','FMA','MAM','AMJ','MJJ','JJA','JAS','ASO','SON','OND','NDJ'].includes(m[1])) return null;
    return { season: m[1], year: Number(m[2]), value: Number(m[3]) };
  }).filter(Boolean);
}
function rowsNino(text) {
  return text.split(/\r?\n/).map(line => {
    const m = line.trim().match(/^(\d{4})\s+(\d{1,2})\s+(-?\d+(?:\.\d+)?)$/);
    if (!m || +m[2] < 1 || +m[2] > 12) return null;
    return { year: +m[1], month: +m[2], value: +m[3] };
  }).filter(Boolean).slice(-100);
}
function parseQuakes(data) {
  if (!data || !Array.isArray(data.features)) throw new Error('Unexpected USGS response');
  return data.features.filter(q => Number.isFinite(q?.properties?.mag) && q.geometry?.type === 'Point')
    .sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 12)
    .map(q => ({ id: String(q.id).slice(0,70), mag: Number(q.properties.mag),
      place: String(q.properties.place || 'Unknown').slice(0,140),
      time: Number(q.properties.time), depth: Number(q.geometry.coordinates[2]),
      lon: Number(q.geometry.coordinates[0]), lat: Number(q.geometry.coordinates[1]),
      url: /^https:\/\/earthquake\.usgs\.gov\//.test(q.properties.url || '') ? q.properties.url : null }));
}
/* The NHC publishes both latitude_numeric and latitudeNumeric spellings in
 * official documentation / archived feeds. Accept either, not fictitious zeroes. */
function parseStorms(data) {
  if (!data || !Array.isArray(data.activeStorms)) throw new Error('Unexpected NHC data');
  return data.activeStorms.map(storm => {
    const latRaw=storm.latitude_numeric ?? storm.latitudeNumeric;
    const lonRaw=storm.longitude_numeric ?? storm.longitudeNumeric;
    if (latRaw == null || lonRaw == null || latRaw === '' || lonRaw === '') return null;
    const lat=Number(latRaw),lon=Number(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return null;
    const timestamp=Date.parse(storm.lastUpdate || '');
    if (!Number.isFinite(timestamp) || Math.abs(Date.now()-timestamp)>72*3600*1000) return null;
    const numeric=(v,min,max)=>{
      if(v==null || v==='')return null;
      const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
    };
    return {
      id:String(storm.id||'').slice(0,20),
      name:String(storm.name||'Unnamed').slice(0,65),
      classification:String(storm.classification||'').slice(0,10),
      lat,lon,
      windKt:numeric(storm.intensity,0,250),
      pressureMb:numeric(storm.pressure,850,1100),
      movementDir:numeric(storm.movementDir,0,360),
      movementMph:numeric(storm.movementSpeed,0,180),
      time:timestamp,
      url:'https://www.nhc.noaa.gov/'
    };
  }).filter(Boolean).slice(0,24);
}

const FORECAST_URL='https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer/5/query';
const FORECAST_HOURS=new Set([0,12,24,36,48,60,72,96,120]);
function parseForecastPoints(data) {
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length>600)throw Error('Invalid NOAA GIS GeoJSON');
  const now=Date.now(),groups=new Map();
  for(const feature of data.features){
    const p=feature?.properties||{},pos=feature?.geometry?.coordinates;
    const lat=Number(pos?.[1]),lon=Number(pos?.[0]),hour=Number(p.fcstprd??p.tau);
    const issue=Number(p.idp_filedate??p.idp_ingestdate);
    const name=String(p.stormname||'').trim().slice(0,65),basin=String(p.basin||'').trim().toUpperCase().slice(0,20);
    const stormnum=Number(p.stormnum),advisory=String(p.advisnum||'').slice(0,20);
    if(feature?.geometry?.type!=='Point'||!Number.isFinite(lat)||!Number.isFinite(lon)||
      Math.abs(lat)>90||Math.abs(lon)>180||!FORECAST_HOURS.has(hour)||!Number.isFinite(issue)||
      issue>now+3600e3||now-issue>30*3600e3||!name||!basin||
      !Number.isInteger(stormnum)||stormnum<1||stormnum>99)continue;
    const key=basin+':'+stormnum+':'+name.toLowerCase()+':'+advisory+':'+issue;
    if(!groups.has(key))groups.set(key,{name,basin,stormnum,advisory,issuedAt:issue,points:[]});
    const wind=Number(p.maxwind),pressure=Number(p.mslp);
    groups.get(key).points.push({lat,lon,hour,
      windKt:Number.isFinite(wind)&&wind>=0&&wind<=250?wind:null,
      pressureMb:Number.isFinite(pressure)&&pressure>=850&&pressure<=1100?pressure:null});
  }
  const latest=new Map();
  for(const g of groups.values()){
    const key=g.basin+':'+g.stormnum+':'+g.name.toLowerCase(),prior=latest.get(key);
    if(!prior||g.issuedAt>prior.issuedAt||(g.issuedAt===prior.issuedAt&&g.points.length>prior.points.length))latest.set(key,g);
  }
  return [...latest.values()].map(g=>{
    const uniq=new Map();for(const p of g.points)if(!uniq.has(p.hour))uniq.set(p.hour,p);
    g.points=[...uniq.values()].sort((a,b)=>a.hour-b.hour);return g;
  }).filter(g=>g.points.length>=2&&g.points.some(p=>p.hour>=24)).slice(0,15);
}
async function readForecastPoints(){
  const u=new URL(FORECAST_URL);
  Object.entries({where:'1=1',outFields:'stormname,basin,stormnum,advisnum,fcstprd,tau,maxwind,mslp,idp_filedate,idp_ingestdate',
    returnGeometry:'true',outSR:'4326',resultRecordCount:'500',f:'geojson'}).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u.toString(),{signal:AbortSignal.timeout(10500),headers:{Accept:'application/geo+json, application/json'}});
  if(!r.ok)throw Error('NOAA NHC GIS HTTP '+r.status);
  const body=await r.text();
  if(body.length>950000)throw Error('Excessive NOAA GIS response');
  return parseForecastPoints(JSON.parse(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  res.setHeader('Cache-Control','public, s-maxage=600, stale-while-revalidate=1800');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const out = { checkedAt: new Date().toISOString(), source: {
    roni: RONI_URL, nino34: NINO_URL, earthquakes: QUAKE_URL, storms: STORM_URL, forecasts: FORECAST_URL },
    roni: null, nino34: null, earthquakes: null, storms: null, forecasts: null, unavailable: [] };
  const sourcesStarted=Date.now();
  const values = await Promise.allSettled([
    readText(RONI_URL).then(rowsRONI),
    readText(NINO_URL).then(rowsNino),
    fetch(QUAKE_URL, { signal: AbortSignal.timeout(10500) }).then(r => { if (!r.ok) throw new Error('USGS HTTP '+r.status); return r.json(); }).then(parseQuakes),
    fetch(STORM_URL, { signal: AbortSignal.timeout(10500),headers:{Accept:'application/json'} }).then(r => { if(!r.ok) throw new Error('NHC HTTP '+r.status);return r.json(); }).then(parseStorms),
    readForecastPoints()
  ]);
  const names=['roni','nino34','earthquakes','storms','forecasts'];
  const sourceHealth={};
  names.forEach((key,i) => {
    const v=values[i];
    const valid=v.status==='fulfilled' && Array.isArray(v.value) &&
      (v.value.length>0 || key==='storms' || key==='earthquakes' || key==='forecasts');
    if(valid)out[key]=v.value;
    else out.unavailable.push(key);
    const latest=valid && v.value.length ? v.value[v.value.length-1]:null;
    let dataAsOf=null;
    if(key==='roni' && latest)dataAsOf=latest.season+' '+latest.year;
    if(key==='nino34' && latest)dataAsOf=latest.year+'-'+String(latest.month).padStart(2,'0');
    if(key==='earthquakes' && latest?.time)dataAsOf=new Date(latest.time).toISOString();
    if(key==='storms' && latest?.time)dataAsOf=new Date(latest.time).toISOString();
    if(key==='forecasts' && latest?.issuedAt)dataAsOf=new Date(latest.issuedAt).toISOString();
    const err=String(v.status==='rejected' ? v.reason?.message||'' : '');
    const reason=valid ? null : /HTTP 403/.test(err)?'upstream_403':
      /HTTP 429/.test(err)?'upstream_rate_limit':
      /timeout|aborted|AbortError/i.test(err)?'upstream_timeout':
      v.status==='fulfilled'?'invalid_or_empty_data':'upstream_error';
    sourceHealth[key]={status:valid?'ok':'unavailable',items:valid?v.value.length:0,asOf:dataAsOf,reason};
  });
  out.health={status:out.unavailable.length===0?'ok':out.unavailable.length===names.length?'unavailable':'degraded',
    sources:sourceHealth,checkedAt:out.checkedAt,elapsedMs:Date.now()-sourcesStarted};
  if (out.unavailable.length === names.length) return res.status(503).json({ ...out, error: 'All upstream sources unavailable' });
  return res.status(200).json(out);
};