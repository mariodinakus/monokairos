/* Public GCN bulletin titles only. No full article copying; source URL is built from a numeric ID. */
const {guard,limitedText} = require('../lib/server.cjs');
let cached=null, inflight=null;
function parse(html, now=Date.now()) {
  const items=[], seen=new Set();
  for (const m of html.matchAll(/href="\/circulars\/(\d+)"[^>]*>([^<]{1,600})</g)) {
    const title=m[2].replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/&quot;/g,'"').trim();
    const event=title.match(/\b(GRB\s*|IceCube-)(\d{2})(\d{2})(\d{2})[A-Z]?/i);
    if(!event) continue;
    const time=Date.UTC(2000+ +event[2], +event[3]-1, +event[4]);
    const id=event[0].replace(/\s/g,'').toUpperCase();
    if(seen.has(id) || time>now || now-time>14*86400e3) continue;
    seen.add(id); items.push({id,title,time,kind:/IceCube/i.test(event[1])?'neutrino':'gamma',url:'https://gcn.nasa.gov/circulars/'+m[1]});
    if(items.length===6) break;
  }
  return items;
}
module.exports=async(req,res)=>{
  if(!guard(req,res)) return;
  try {
    if(!cached || Date.now()-cached.at>600000) {
      inflight ||= (async()=>{const r=await fetch('https://gcn.nasa.gov/circulars',{signal:AbortSignal.timeout(8000),headers:{Accept:'text/html'}}); if(!r.ok) throw new Error('upstream'); const html=await limitedText(r); const items=parse(html); if(!items.length) throw new Error('No recent parseable bulletins'); return {at:Date.now(),source:'NASA GCN',items};})().finally(()=>{inflight=null;});
      cached=await inflight;
    }
    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=300'); res.status(200).json(cached);
  } catch {res.setHeader('Cache-Control','no-store');res.status(502).json({error:true,source:'NASA GCN',items:[]});}
};
module.exports.parse=parse;
