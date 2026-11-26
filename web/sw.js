// Uygulama dosyaları ve veri: önce ağ (her açılışta en güncel sürüm), ağ yoksa ya da çok yavaşsa önbellek.
// İstekler tarayıcının HTTP önbelleğini atlayıp sunucuya doğrulatılır (değişmediyse sunucu 304 döner, hızlıdır).
// Grafik kütüphanesi sabit sürümlü olduğu için önbellekten verilir.
const VERSION = 'tahta-v51';
const SHELL = ['./', 'index.html', 'style.css', 'ind.js', 'manifest.webmanifest',
  'js/util.js', 'js/dom.js', 'js/store.js', 'js/data.js', 'js/fields.js', 'js/tedbir.js', 'js/screener.js', 'js/detail.js', 'js/compare.js', 'js/transfer.js', 'js/backup.js', 'js/guide.js', 'js/quality.js', 'js/signals.js', 'js/setupviz.js', 'js/archive.js', 'js/home.js', 'js/dcf.js', 'js/pfcore.js', 'js/portfolio.js', 'js/sync.js', 'js/main.js',
  'vendor/lightweight-charts.standalone.production.js', 'icons/icon-192.png'];
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('./') : null);
    if (hit) return hit;
    throw new Error('çevrimdışı ve önbellekte yok');
  }
}

// Sürüm etiketli veri dosyaları (?v=güncelleme zamanı): önce önbellek. Aynı güncelleme içinde ağa gidilmez; yeni güncellemede
// adres değişir, yenisi alınır ve aynı dosyanın eski sürümü silinir. Çevrimdışıyken eski sürüm verilir.
const VERSIONED = /\/data\/(hist|histx|fin)\/[^/]+\.json$|\/data\/trades\.json$/;
async function cacheVersioned(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const url = new URL(req.url);
      for (const k of await cache.keys()) {
        const u = new URL(k.url);
        if (u.pathname === url.pathname && u.search !== url.search) cache.delete(k);
      }
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const old = await cache.match(req, { ignoreSearch: true });
    if (old) return old;
    throw new Error('çevrimdışı ve önbellekte yok');
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }
  if (url.searchParams.has('v') && VERSIONED.test(url.pathname)) {
    e.respondWith(cacheVersioned(req));
    return;
  }
  e.respondWith(networkFirst(req));
});
