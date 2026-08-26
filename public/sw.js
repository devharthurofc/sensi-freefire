'use strict';

/* ============ SENSI PRO · Service Worker ============
 * App shell em cache para funcionar offline.
 * Chamadas de API (/api/) SEMPRE vão direto pro servidor (dados ao vivo).
 * Ao publicar atualização nova, aumente a versão do CACHE (v2, v3...).
 */

const CACHE = 'sensipro-v1';

const PRECACHE = [
  '/',
  '/app.js',
  '/particles.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // dados sempre ao vivo

  // navegação: tenta rede primeiro, cai pro cache se estiver offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // estáticos: cache primeiro
  e.respondWith(
    caches.match(req).then(hit => hit || (
      fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    ))
  );
});
