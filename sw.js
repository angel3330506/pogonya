// Офлайн-кэш: страница, скрипты, иконки и шрифты кэшируются при установке.
const V = '2';                 // = APP_VERSION в index.html
const VERSION = 'pogonya-v' + V;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  `js/game.js?v=${V}`,
  'js/vox.js', 'js/cars.js', 'js/world.js', 'js/audio.js',
  'vendor/three.module.min.js',
];
const FONT_CSS = ['https://fonts.googleapis.com/css2?family=Russo+One&family=Rubik:wght@500;700;800&display=swap'];

async function cacheFonts(c) {
  for (const href of FONT_CSS) {
    try {
      const r = await fetch(href, { mode: 'cors' });
      if (!r.ok) continue;
      await c.put(href, r.clone());
      const urls = [...(await r.text()).matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
      await Promise.all(urls.map(u => c.add(u).catch(() => {})));
    } catch (e) { /* без шрифтов игра работает на системных */ }
  }
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))).then(() => cacheFonts(c)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Страница и скрипты игры: сначала сеть (чтобы обновления приходили), без сети — кэш
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.includes('/js/'))) {
    e.respondWith(
      fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req.mode === 'navigate' ? 'index.html' : req, copy)); return r; })
        .catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req))
    );
    return;
  }
  if (url.origin === location.origin || url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return r;
      }))
    );
  }
});
