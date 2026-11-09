/* Single serverless entry point for every /api/* route (vercel.json rewrites
 * /api/<name> here). One function instead of twelve keeps the project well
 * inside the Vercel Hobby limit and leaves room for new routes.
 * Each route module stays a plain (req, res) handler in lib/routes/. */
'use strict';
const ROUTES = {
  'atmosphere': () => require('../lib/routes/atmosphere.js'),
  'cosmic-events': () => require('../lib/routes/cosmic-events.js'),
  'earth-signals': () => require('../lib/routes/earth-signals.js'),
  'history': () => require('../lib/routes/history.js'),
  'netatmo': () => require('../lib/routes/netatmo.js'),
  'news': () => require('../lib/routes/news.js'),
  'nexus': () => require('../lib/routes/nexus.js'),
  'outlook': () => require('../lib/routes/outlook.js'),
  'rain-memory': () => require('../lib/routes/rain-memory.js'),
  'space-weather': () => require('../lib/routes/space-weather.js'),
  'storm-lens': () => require('../lib/routes/storm-lens.js'),
  'synop': () => require('../lib/routes/synop.js'),
  'verify': () => require('../lib/routes/verify.js'),
  'weather-maps': () => require('../lib/routes/weather-maps.js')
};
function routeName(req) {
  try {
    const u = new URL(req.url || '/', 'https://monokairos.vercel.app');
    const explicit = u.searchParams.get('route');
    if (explicit) return explicit;
    const last = u.pathname.replace(/\/+$/, '').split('/').pop();
    return last && last !== 'mono' ? last : '';
  } catch { return ''; }
}
module.exports = async (req, res) => {
  const name = routeName(req), load = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
  if (!load) { res.setHeader('Cache-Control', 'no-store'); res.status(404).json({ error: 'Unknown route' }); return; }
  return load()(req, res);
};
module.exports.ROUTES = Object.keys(ROUTES);
module.exports.routeName = routeName;
