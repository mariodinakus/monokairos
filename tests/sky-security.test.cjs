const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sky=require('../sky.js'), Cosmic=require('../cosmic.js'), {guard}=require('../lib/server.cjs');
const now=Date.parse('2026-10-15T10:00:00Z');
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}});
test('local solar eclipse search finds the April 2024 total eclipse in Dallas',()=>{
 const s=Sky.snapshot({lat:32.78,lon:-96.8,now:Date.parse('2024-04-01T00:00:00Z')});
 const e=s.events.find(x=>x.type==='solar');
 assert.equal(e.kind,'total'); assert.equal(e.obscuration,1);
 assert.ok(Math.abs(e.time-Date.parse('2024-04-08T18:42:00Z'))<5*60000);
 assert.ok(e.altitude>50);
});
test('night window and lunar events work across hemispheres, date line and polar daylight',()=>{
 for(const [lat,lon] of [[40.64,22.94],[-33.87,151.21],[0,179.9],[78.2,15.6]]){
  const s=Sky.snapshot({lat,lon,now});
  assert.ok(s.events.every(e=>e.time>=now)); assert.ok(s.illumination>=0&&s.illumination<=1);
  if(s.start&&s.end)assert.ok(s.end>s.start);
  for(const lang of ['el','en'])assert.ok(!/NaN|undefined|Infinity/.test(Sky.render({lat,lon,now,lang,zone:'Pacific/Auckland'})));
 }
 const polar=Sky.snapshot({lat:78.2,lon:15.6,now:Date.parse('2026-06-21T12:00:00Z')});assert.equal(polar.start,null);
 assert.equal(Sky.snapshot({lat:91,lon:0,now}),null);
});
test('particle readings preserve zero, reject null/future and flag stale data',()=>{
 const feed=[{energy:'>=10 MeV',flux:null,time_tag:new Date(now).toISOString()},{energy:'>=10 MeV',flux:0,time_tag:new Date(now-60000).toISOString()},{energy:'>=10 MeV',flux:999,time_tag:new Date(now+3600000).toISOString()}];
 assert.equal(Cosmic.particle(feed,'>=10 MeV',now).value,0);
 assert.equal(Cosmic.particle(feed,'>=10 MeV',now+3600000).fresh,true);
 assert.equal(Cosmic.particle(feed.slice(0,2),'>=10 MeV',now+3600000).fresh,false);
});
test('GCN cards escape content and reject injected links; unavailable data never means no events',()=>{
 const html=Cosmic.render({}, {at:now,items:[{time:now,kind:'gamma',title:'<img src=x onerror=alert(1)>',url:'https://gcn.nasa.gov/circulars/123'},{time:now,title:'bad',url:'javascript:alert(1)'}]}, {now});
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('javascript:'));
 assert.ok(Cosmic.render(null,{error:true},{now}).includes('Δεν σημαίνει απουσία συμβάντων'));
 assert.ok(Sky.render({lat:40,lon:23,now,compact:true,city:'<script>x</script>'}).includes('&lt;script&gt;'));
});
test('API rejects unsupported methods and repeated bursts',()=>{
 const post=response();assert.equal(guard({method:'POST'},post),false);assert.equal(post.code,405);
 for(let i=0;i<90;i++)assert.equal(guard({method:'GET',headers:{'x-forwarded-for':'192.0.2.45'}},response()),true);
 const blocked=response();assert.equal(guard({method:'GET',headers:{'x-forwarded-for':'192.0.2.45'}},blocked),false);assert.equal(blocked.code,429);
});
test('SYNOP rejects missing, out of range or unbounded inputs before fetching',async()=>{
 const original=global.fetch;global.fetch=async()=>assert.fail('invalid input contacted upstream');
 try{for(const url of ['/api/synop','/api/synop?lat=&lon=0','/api/synop?lat=91&lon=0','/api/synop?lat=40&lon=23&hours=-1','/api/synop?lat=40&lon=23&km=Infinity']){const r=response();await require('../api/synop.js')({url},r);assert.equal(r.code,400);}}finally{global.fetch=original;}
});
test('GCN parser deduplicates followups, dates events and discards old reports',()=>{
 const parse=require('../api/cosmic-events.js').parse;
 const html='<a href="/circulars/7">GRB 261014A: Fermi detection</a><a href="/circulars/6">GRB 261014A: follow-up</a><a href="/circulars/5">IceCube-261013A: observation</a><a href="/circulars/4">GRB 240101A: old</a>';
 const items=parse(html,now);assert.equal(items.length,2);assert.equal(items[1].kind,'neutrino');assert.equal(items[0].time,Date.parse('2026-10-14T00:00:00Z'));
});
