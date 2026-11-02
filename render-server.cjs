'use strict';
/* MONO Weather backup host: original UI + same-origin essential forecast. */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const atmosphere = require('./api/atmosphere.js');
const ROOT = path.resolve(__dirname);
const API_ORIGIN = 'https://monokairos.vercel.app';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};
const DROP_HEADERS = new Set([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection',
  'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'upgrade', 'set-cookie', 'strict-transport-security', 'content-security-policy'
]);
function json(res, status, obj) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
  res.end(JSON.stringify(obj));
}
async function proxyApi(req, res, pathname, search) {
  try {
    const response = await fetch(API_ORIGIN + pathname + search, {
      method:'GET', redirect:'manual', signal:AbortSignal.timeout(22000),
      headers:{'Accept': req.headers.accept || '*/*'}
    });
    res.statusCode = response.status;
    for (const [key, value] of response.headers) if (!DROP_HEADERS.has(key.toLowerCase())) res.setHeader(key, value);
    if (!response.body) return res.end();
    Readable.fromWeb(response.body).on('error', error => {
      console.error('[MONO Render API stream]',error.message);
      res.destroy(error);
    }).pipe(res);
  } catch (error) {
    console.warn('[MONO Render API]', pathname, error.message);
    if (!res.headersSent) json(res, 502, {error:'Upstream weather service unavailable'});
    else res.end();
  }
}
async function serveStatic(res, pathname) {
  let requested;
  try {requested = decodeURIComponent(pathname);} catch {return json(res,400,{error:'Invalid path'});}
  if (requested === '/') requested = '/index.html';
  const file = path.resolve(ROOT, '.' + requested);
  if (!file.startsWith(ROOT + path.sep) || requested.split('/').some(segment => segment.startsWith('.') && segment.length > 1))
    return json(res,403,{error:'Forbidden'});
  const ext = path.extname(file).toLowerCase();
  if (!Object.hasOwn(TYPES,ext)) return json(res,404,{error:'Not found'});
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return json(res,404,{error:'Not found'});
    res.writeHead(200, {
      'Content-Type': TYPES[ext],
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' || requested === '/sw.js' ? 'no-cache' : 'public, max-age=600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
    });
    fs.createReadStream(file).on('error',error=>res.destroy(error)).pipe(res);
  } catch (error) { return json(res, error.code==='ENOENT'?404:500, {error:'Resource unavailable'}); }
}
const server = http.createServer(async (req,res) => {
  if(req.method !== 'GET' && req.method !== 'HEAD') return json(res,405,{error:'Method not allowed'});
  let url;
  try {url = new URL(req.url,'http://localhost');} catch {return json(res,400,{error:'Invalid URL'});}
  const {pathname,search}=url;
  if (pathname === '/health') return json(res,200,{ok:true,service:'mono-weather-render-backup'});
  if (pathname === '/api/atmosphere' && url.searchParams.get('mode') === 'forecast') {
    res.status = status => {res.statusCode=status;return res;};
    res.json = body => {if(!res.headersSent)res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));return res;};
    try {return await atmosphere(req,res);} catch (error) {
      console.error('[MONO Render forecast]',error.message);
      if(!res.headersSent) return json(res,502,{error:'Forecast unavailable'});
      return res.end();
    }
  }
  if (pathname.startsWith('/api/') || pathname.startsWith('/proxy/')) return proxyApi(req,res,pathname,search);
  return serveStatic(res,pathname);
});
server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('MONO Weather Render backup listening'));
