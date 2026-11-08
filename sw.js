const CACHE = 'mono-weather-v4.64';
const ALERTS = 'mono-alerts';
try { importScripts('./rain-alerts.js?v=1.0'); } catch (err) { console.warn('[MONO SW] rain alerts unavailable', err?.message); }
const ASSETS = ['./', './index.html', './styles.css?v=4.10', './mono-plus.css', './clarity.css', './model.js?v=4.4', './climate.js', './earth-signals.js', './earth-signals.css', './earth-globe.js', './earth-globe.css', './storm-lens.js', './storm-lens.css', './mobile-nav.css', './mobile-polish.css', './rain-intelligence.css', './rain-intelligence.js', './community-stations.js', './station-network.js', './station-network.css', './quick-screens.css', './quick-screens.js', './phenomena-map.css', './phenomena-map.js', './weather-field.css', './weather-field.js', './trainer.js?v=4.4', './geo.js', './app.js?v=4.57', './environment.js', './atmosphere.js', './space-weather.js', './gravity-observatory.js', './gravity-observatory.css', './sky.js', './cosmic.js', './forecast-core.js', './forecast.js', './forecast-motion.js', './forecast.css', './vendor/astronomy.min.js', './icon.svg', './manifest.webmanifest', './app-icon-192.png', './app-icon-512.png',
  './next-hour.js', './monthly-rain.js?v=1.2', './model-insights.js?v=1.1', './forecast-confidence.js?v=1.0', './forecast-confidence.css?v=1.0', './day-compare.js?v=1.0', './yesterday-check.js?v=1.0', './rain-alerts.js?v=1.0', './mono-reliability.js?v=1.0', './mobile-polish.css?v=1.5', './app.js?v=4.64', ...['sun','moon','partly-day','partly-night','cloud','overcast','fog','drizzle','rain','snow','storm','umbrella','wind','humidity','pressure','thermometer','uv','visibility','sunrise','sunset'].map(n => `./icons/${n}.svg`)];
// Cache assets individually with limited concurrency: one missing optional file must
// never prevent a new service worker from activating.
self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const queue = ASSETS.slice();
  await Promise.all(Array.from({length: 4}, async () => {
    while (queue.length) {
      const path = queue.shift();
      try { await cache.add(path); } catch (err) {
        console.warn('[MONO SW] Optional asset could not be precached:', path, err?.message);
      }
    }
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== ALERTS).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Network first for the app shell; weather APIs are cross-origin and never cached here.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/proxy/')) return;
  const documentRequest = e.request.mode === 'navigate';
  const html = r => !!r && (r.headers.get('content-type') || '').toLowerCase().includes('text/html');
  e.respondWith((async () => {
    try {
      let response = await fetch(e.request, documentRequest ? { cache: 'no-store' } : undefined);
      // Never deliver or cache HTML served as text/plain: Android WebView
      // previously displayed the entire <!doctype html> source in that case.
      if (documentRequest && response.ok && !html(response)) {
        response = await fetch(new URL('index.html?mono_html_recovery=v4.49', self.registration.scope), { cache: 'no-store' });
        if (!response.ok || !html(response)) throw new Error('HTML content-type mismatch');
      }
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return response;
    } catch (err) {
      const cached = await caches.match(e.request);
      if (cached && (!documentRequest || html(cached))) return cached;
      if (documentRequest) {
        const fallback = await caches.match('./index.html');
        if (html(fallback)) return fallback;
      }
      return Response.error();
    }
  })());
});

// Rain alerts: Periodic Background Sync (installed app, where the browser allows it).
async function rainCheck() {
  if (!self.MONORainAlerts) return;
  await self.MONORainAlerts.check({
    fetchJSON: async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
    show: (title, options) => self.registration.showNotification(title, options)
  }).catch(err => console.warn('[MONO SW] rain check failed', err?.message));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'mono-rain') e.waitUntil(rainCheck()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './#rain', self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = list.find(c => new URL(c.url).origin === self.location.origin);
    if (open) { open.postMessage({ type: 'mono-goto', page: new URL(target).hash.slice(1) || 'rain' }); return open.focus(); }
    return self.clients.openWindow(target);
  })());
});
