// Bump VERSION whenever you change the app files.
const VERSION = 'yumrun-v1';
const TILES = 'yumrun-tiles';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname.endsWith('basemaps.cartocdn.com')) { e.respondWith(tile(e.request)); return; }
  if (url.origin === location.origin) {
    // network first (so updates show up), cached copy when offline
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
async function tile(req) {
  const c = await caches.open(TILES);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok) { c.put(req, r.clone()); trim(c); } return r; }).catch(() => hit);
  return hit || net;
}
let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); for (let i = 0; i < keys.length - 400; i++) await c.delete(keys[i]); }
  finally { trimming = false; }
}
