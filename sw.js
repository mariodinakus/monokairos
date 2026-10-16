const CACHE = 'mono-weather-v4.7';
const ASSETS = ['./', './index.html', './styles.css', './mono-plus.css', './model.js', './climate.js', './trainer.js', './geo.js', './app.js', './environment.js', './atmosphere.js', './space-weather.js', './sky.js', './cosmic.js', './forecast-core.js', './forecast.js', './forecast-motion.js', './forecast.css', './vendor/astronomy.min.js', './icon.svg', './manifest.webmanifest', './app-icon-192.png', './app-icon-512.png',
  ...['sun','moon','partly-day','partly-night','cloud','overcast','fog','drizzle','rain','snow','storm','umbrella','wind','humidity','pressure','thermometer','uv','visibility','sunrise','sunset'].map(n => `./icons/${n}.svg`)];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Network first for the app shell; weather APIs are cross-origin and never cached here.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/proxy/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html'))));
});
