/* Service Worker — Portal Pelanggan OPEN-ISP
   Strategi: HTML & CSS/JS = network-first (selalu ambil terbaru saat online),
   gambar & manifest & font = cache-first (jarang berubah).
   Naikkan CACHE_NAME bila perlu purge (v4 → v5 → ...). */
const CACHE_NAME = 'customer-pwa-v7';
const PRECACHE_URLS = [
  // Aset inti (network-first tapi disimpan untuk offline)
  '/css/auth.css',
  '/css/landing.css',
  '/css/dashboard.css',
  '/css/pages.css',
  '/css/theme-toggle.css',
  '/js/theme-toggle.js',
  // Ikon & manifest PWA
  '/img/icons/icon-192.png',
  '/img/icons/icon-512.png',
  '/img/icons/icon-maskable-192.png',
  '/img/icons/icon-maskable-512.png',
  '/img/icons/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/manifest-landing.webmanifest',
  // Halaman shell untuk fallback offline
  '/offline.html',
  '/customer/login',
  '/customer/register'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Tambah satu-per-satu agar satu URL gagal tidak membatalkan semuanya
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => null)
        )
      )
    ).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
      ),
      self.clients.claim()
    ])
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    const cache = await caches.open(CACHE_NAME);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response('Offline', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // version.txt → selalu network (mekanisme deteksi update)
  if (path === '/version.txt') return;

  // Navigasi halaman pelanggan → network-first
  if (req.mode === 'navigate') {
    if (path.startsWith('/customer/')) event.respondWith(networkFirst(req, '/customer/login'));
    else event.respondWith(networkFirst(req));
    return;
  }

  // CSS & JS → network-first agar perubahan desain langsung terlihat
  if (path.startsWith('/css/') || path.startsWith('/js/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Gambar, ikon, manifest, font → cache-first
  if (
    path.startsWith('/img/') ||
    path.startsWith('/fonts/') ||
    path === '/manifest.webmanifest' ||
    path === '/manifest-landing.webmanifest'
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
