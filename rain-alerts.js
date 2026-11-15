/* Device rain alerts: "rain starting soon" from Open-Meteo's 15-minute forecast.
   Shared by the page and the service worker (importScripts). No server, no push
   service: alerts are checked while MONO is open or kept in the background, and by
   Periodic Background Sync where the browser grants it to an installed app. */
(function (root) {
  'use strict';
  const MIN = 60e3, STEP = 15 * MIN, fin = Number.isFinite;
  const WET = 0.1, EPISODE = 0.3, LOOKAHEAD = 60 * MIN, GAP = 90 * MIN;
  const STORE = 'mono-alerts', CONFIG = '/__mono/alerts/config', LAST = '/__mono/alerts/last';

  // Normalise an Open-Meteo response (or the page's state.rain15) to {t[], amount[], at}.
  function feed(src) {
    const m = src?.minutely_15;
    const t = m?.time ? m.time.map(x => x * 1000) : src?.t;
    if (!Array.isArray(t)) return null;
    const rain = m ? m.rain : src.rain, showers = m ? m.showers : src.showers, precip = m ? m.precipitation : (src.precipitation || src.p);
    const amount = t.map((_, i) => fin(rain?.[i]) && fin(showers?.[i]) ? rain[i] + showers[i] : fin(precip?.[i]) ? precip[i] : null);
    return { t, amount };
  }

  // Values are accumulated over the 15 minutes ENDING at each timestamp.
  function detect({ data, now = Date.now(), last = null } = {}) {
    const f = feed(data); if (!f || !fin(now)) return null;
    const periods = f.t.map((t, i) => ({ start: t - STEP, end: t, mm: f.amount[i] })).filter(p => fin(p.end));
    const current = periods.find(p => p.start <= now && now < p.end), previous = periods.find(p => p.end <= now && now - p.end < STEP);
    if (!current || !fin(current.mm)) return null;
    if (current.mm >= WET || (fin(previous?.mm) && previous.mm >= WET)) return null; // already raining
    const first = periods.find(p => p.start > now - STEP && p.start <= now + LOOKAHEAD && fin(p.mm) && p.mm >= WET && p !== current);
    if (!first) return null;
    const hour = periods.filter(p => p.start >= first.start && p.end <= first.start + 60 * MIN);
    if (hour.length < 4 || hour.some(p => !fin(p.mm))) return null; // incomplete window: stay silent
    const total = hour.reduce((s, p) => s + p.mm, 0);
    if (total < EPISODE) return null;
    const id = 'rain-' + Math.round(first.start / (30 * MIN));
    if (last && (last.id === id || (fin(last.at) && now - last.at < GAP))) return null;
    return { id, start: first.start, minutes: Math.max(0, Math.round((first.start - now) / MIN)), total, peak: Math.max(...hour.map(p => p.mm)) * 4 };
  }

  function message(alert, { lang = 'el', place = '', zone = 'UTC' } = {}) {
    const el = lang !== 'en';
    let clock;
    try { clock = new Intl.DateTimeFormat(el ? 'el-GR' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(new Date(alert.start)); }
    catch { clock = new Date(alert.start).toISOString().slice(11, 16) + ' UTC'; }
    const mm = new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(alert.total);
    const kind = alert.peak >= 7.6 ? (el ? 'Δυνατή βροχή' : 'Heavy rain') : alert.peak >= 2.5 ? (el ? 'Βροχή' : 'Rain') : (el ? 'Ασθενής βροχή' : 'Light rain');
    const when = alert.minutes <= 5 ? (el ? 'τώρα' : 'now') : (el ? `σε ~${alert.minutes}′` : `in ~${alert.minutes} min`);
    return {
      title: `${kind} ${when}${place ? ' · ' + place : ''}`,
      body: el ? `Από ~${clock} · ≈${mm} mm την πρώτη ώρα. Πρόγνωση 15λέπτου, όχι μέτρηση.` : `From ~${clock} · ≈${mm} mm in the first hour. 15-minute forecast, not an observation.`
    };
  }


  const enabled=(cfg,k)=>k==='rain'?cfg.rain!==false:cfg[k]===true;
  const localHour=(t,z)=>{try{return +new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:z}).format(new Date(t));}catch{return new Date(t).getUTCHours();}};
  const localDate=(t,z)=>{try{const p=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:z}).formatToParts(new Date(t)),f=k=>p.find(x=>x.type===k)?.value;return f('year')+'-'+f('month')+'-'+f('day');}catch{return new Date(t).toISOString().slice(0,10);}};
  function detectHazards(data,{now=Date.now(),cfg={}}={}){
    const h=data?.hourly;if(!Array.isArray(h?.time))return [];
    const rows=h.time.map((t,i)=>({t:t*1000,code:h.weather_code?.[i],gust:h.wind_gusts_10m?.[i]})).filter(r=>fin(r.t)&&r.t>=now-15*MIN&&r.t<=now+6*60*MIN).sort((a,b)=>a.t-b.t),events=[];
    if(enabled(cfg,'storm')){const x=rows.find(r=>[95,96,99].includes(r.code));if(x)events.push({type:'storm',id:'storm-'+Math.floor(x.t/(3*60*MIN)),start:x.t});}
    if(enabled(cfg,'wind')){const x=rows.find(r=>fin(r.gust)&&r.gust>=60);if(x)events.push({type:'wind',id:'wind-'+Math.floor(x.t/(3*60*MIN)),start:x.t,gust:x.gust});}
    return events;
  }
  function morningEvent(data,{now=Date.now(),cfg={},zone='UTC'}={}){
    if(!enabled(cfg,'morning')||localHour(now,zone)<7||localHour(now,zone)>=10)return null;
    const d=data?.daily,today=localDate(now,zone),i=Array.isArray(d?.time)?d.time.findIndex(v=>typeof v==='string'?v===today:fin(v)&&localDate(v*1000,zone)===today):-1;
    if(i<0)return null;
    const hi=d.temperature_2m_max?.[i],lo=d.temperature_2m_min?.[i],rain=d.precipitation_sum?.[i];
    return [hi,lo,rain].every(fin)&&rain>=0?{type:'morning',id:'morning-'+today,start:now,hi,lo,rain}:null;
  }
  function airEvent(data,{now=Date.now(),cfg={}}={}){
    if(!enabled(cfg,'air'))return null;
    const c=data?.current,t=typeof c?.time==='number'?c.time*1000:Date.parse(c?.time),v=c?.european_aqi;
    return fin(t)&&now-t<=3*60*MIN&&t<=now+15*MIN&&fin(v)&&v>=100?{type:'air',id:'air-'+Math.floor(t/(6*60*MIN)),start:t,aqi:v}:null;
  }
  function otherMessage(e,{lang='el',place='',zone='UTC'}={}){
    const el=lang!=='en',X=(a,b)=>el?a:b,n=v=>new Intl.NumberFormat(el?'el-GR':'en-GB',{maximumFractionDigits:1}).format(v),p=place?' · '+place:'';
    let time;try{time=new Intl.DateTimeFormat(el?'el-GR':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:zone}).format(new Date(e.start));}catch{time=new Date(e.start).toISOString().slice(11,16)+' UTC';}
    if(e.type==='storm')return {title:X('Πιθανή καταιγίδα','Thunderstorm forecast')+p,body:X('Πρόγνωση γύρω στις '+time+'. Όχι επίσημη προειδοποίηση.','Forecast around '+time+'. Not an official warning.'),page:'phen'};
    if(e.type==='wind')return {title:X('Ισχυρές ριπές ανέμου','Strong wind gusts')+p,body:X('Πρόβλεψη '+n(e.gust)+' km/h γύρω στις '+time+'. Όχι μέτρηση.','Forecast '+n(e.gust)+' km/h around '+time+'. Not observed.'),page:'hourly'};
    if(e.type==='air')return {title:X('Επιβαρυμένη ποιότητα αέρα','Poor air quality')+p,body:'European AQI '+n(e.aqi)+'. '+X('Εκτίμηση CAMS/Open-Meteo, όχι τοπική μέτρηση.','CAMS/Open-Meteo estimate, not a local reading.'),page:'environment'};
    return {title:X('Πρωινή πρόγνωση','Morning forecast')+p,body:X('Σήμερα '+n(e.lo)+'–'+n(e.hi)+'°C · '+n(e.rain)+' mm βροχής (πρόγνωση).','Today '+n(e.lo)+'–'+n(e.hi)+'°C · '+n(e.rain)+' mm forecast rain.'),page:'now'};
  }
  const airURL=cfg=>'https://air-quality-api.open-meteo.com/v1/air-quality?'+new URLSearchParams({latitude:(+cfg.lat).toFixed(4),longitude:(+cfg.lon).toFixed(4),current:'european_aqi',timezone:'auto',timeformat:'unixtime'});

  const quiet = (now, zone) => {
    try { const h = +new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: zone }).format(new Date(now)); return h >= 23 || h < 7; }
    catch { return false; }
  };

  // Shared state between page and service worker lives in the Cache API.
  async function getJSONEntry(path) {
    try { const c = await caches.open(STORE); const r = await c.match(path); return r ? await r.json() : null; } catch { return null; }
  }
  async function putJSONEntry(path, value) {
    try { const c = await caches.open(STORE); await c.put(path, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })); return true; } catch { return false; }
  }
  const forecastURL = cfg => 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: (+cfg.lat).toFixed(4), longitude: (+cfg.lon).toFixed(4), minutely_15: 'precipitation,rain,showers',
    hourly:'weather_code,wind_gusts_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_sum',
    forecast_minutely_15:'12',past_minutely_15:'2',forecast_hours:'8',forecast_days:'2',timezone:'auto',timeformat:'unixtime'
  });


  // Device-only alerts. The browser may suspend all background checks.
  async function check({fetchJSON,show,now=Date.now()}={}){
    const cfg=await getJSONEntry(CONFIG);
    if(!cfg?.on||!fin(+cfg.lat)||!fin(+cfg.lon)||Math.abs(+cfg.lat)>90||Math.abs(+cfg.lon)>180||typeof fetchJSON!=='function'||typeof show!=='function')return [];
    const data=await fetchJSON(forecastURL(cfg));if(data?.error)return [];
    const zone=data?.timezone||'UTC',stored=await getJSONEntry(LAST),last=stored?.events||{};
    if(stored?.id&&!last.rain)last.rain={id:stored.id,at:stored.at};
    const events=[];
    if(enabled(cfg,'rain')){const r=detect({data,now,last:last.rain});if(r)events.push({type:'rain',...r});}
    events.push(...detectHazards(data,{now,cfg}));
    const morning=morningEvent(data,{now,cfg,zone});if(morning)events.push(morning);
    if(enabled(cfg,'air'))try{const air=airEvent(await fetchJSON(airURL(cfg)),{now,cfg});if(air)events.push(air);}catch{}
    const sent=[];
    for(const e of events){
      const prev=last[e.type],gap=e.type==='rain'?GAP:e.type==='morning'?20*60*MIN:6*60*MIN;
      if(prev?.id===e.id||(fin(prev?.at)&&now-prev.at>=0&&now-prev.at<gap))continue;
      const m=e.type==='rain'?{...message(e,{lang:cfg.lang,place:cfg.name,zone}),page:'rain'}:otherMessage(e,{lang:cfg.lang,place:cfg.name,zone});
      try{
        await show(m.title,{body:m.body,tag:'mono-'+e.type,renotify:false,silent:quiet(now,zone),icon:'app-icon-192.png',badge:'app-icon-192.png',data:{url:'./#'+m.page}});
        last[e.type]={id:e.id,at:now};await putJSONEntry(LAST,{events:last});sent.push(e);
      }catch{} // failures must not be recorded as delivered
    }
    return sent;
  }
  const api={detect,message,feed,check,forecastURL,airURL,detectHazards,morningEvent,airEvent,otherMessage,
    getConfig:()=>getJSONEntry(CONFIG),setConfig:v=>putJSONEntry(CONFIG,v),STORE};

  root.MONORainAlerts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
