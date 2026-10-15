'use strict';
const buckets = new Map();
// Best effort per warm instance; platform firewall is needed for distributed abuse.
function guard(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method && req.method !== 'GET') { res.setHeader('Allow','GET'); res.status(405).json({error:'Method not allowed'}); return false; }
  const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now(), b = buckets.get(ip);
  if (b && now < b.until && b.count >= 90) { res.setHeader('Retry-After','60'); res.setHeader('Cache-Control','no-store'); res.status(429).json({error:'Too many requests'}); return false; }
  if (!b || now >= b.until) {
    if (buckets.size >= 2000) buckets.clear();
    buckets.set(ip,{count:1,until:now+60000});
  } else b.count++;
  return true;
}
function coordinates(req) {
  const u = new URL(req.url, 'https://monokairos.vercel.app'), a = u.searchParams.get('lat'), b = u.searchParams.get('lon');
  if (a === null || b === null || !a.trim() || !b.trim() || !Number.isFinite(+a) || !Number.isFinite(+b) || Math.abs(+a)>90 || Math.abs(+b)>180) return null;
  return {lat:+a,lon:+b,params:u.searchParams};
}
function bounded(params,key,fallback,min,max) {
  const raw = params.get(key); if (raw === null) return fallback;
  return raw.trim() && Number.isFinite(+raw) && +raw >= min && +raw <= max ? +raw : null;
}
async function limitedText(response, max = 1500000) {
  const reader = response.body.getReader(); let length=0; const chunks=[];
  try { for (;;) { const {done,value}=await reader.read(); if(done) break; length+=value.length; if(length>max) throw new Error('Response too large'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(()=>{}); }
  return Buffer.concat(chunks).toString('utf8');
}
module.exports={guard,coordinates,bounded,limitedText};
