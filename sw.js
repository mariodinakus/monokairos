const CACHE = 'mono-weather-v4.54';
const ASSETS = ['./', './index.html', './styles.css', './mono-plus.css', './clarity.css', './model.js?v=4.3', './climate.js', './earth-signals.js', './earth-signals.css', './earth-globe.js', './earth-globe.css', './storm-lens.js', './storm-lens.css', './mobile-nav.css', './mobile-polish.css', './rain-intelligence.css', './rain-intelligence.js', './community-stations.js', './station-network.js', './station-network.css', './quick-screens.css', './quick-screens.js', './phenomena-map.css', './phenomena-map.js', './weather-field.css', './weather-field.js', './trainer.js?v=4.3', './geo.js', './app.js?v=4.54', './environment.js', './atmosphere.js', './space-weather.js', './gravity-observatory.js', './gravity-observatory.css', './sky.js', './cosmic.js', './forecast-core.js', './forecast.js', './forecast-motion.js', './forecast.css', './vendor/astronomy.min.js', './icon.svg', './manifest.webmanifest', './app-icon-192.png', './app-icon-512.png',
  './next-hour.js', './monthly-rain.js', './model-insights.js?v=1.1', ...['sun','moon','partly-day','partly-night','cloud','overcast','fog','drizzle','rain','snow','storm','umbrella','wind','humidity','pressure','thermometer','uv','visibility','sunrise','sunset'].map(n => `./icons/${n}.svg`)];
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
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
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
