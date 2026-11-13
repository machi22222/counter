'use strict';

/* ============================================================
   Service Worker: macht die App offline-fähig (Cache-first).
   WICHTIG: Bei jedem Update der App-Dateien VERSION um 1 erhöhen –
   nur dann erkennt das iPhone, dass es eine neue Version gibt.
   ============================================================ */
const VERSION = 3;
const PREFIX = 'zaehler-';
const CACHE = PREFIX + 'v' + VERSION;
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Installation: alle App-Dateien vorab speichern.
// cache: 'reload' umgeht den Browser-Cache, damit wirklich die neue Version landet.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' })))
    )
  );
});

// Aktivierung: alte Versionen löschen. Nur Caches dieser App (Präfix), damit andere
// Projekte unter derselben github.io-Adresse unberührt bleiben.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Ein Update übernimmt erst, wenn in der App auf „Update verfügbar – neu laden“ getippt wird
// (oder beim nächsten vollständigen Neustart der App).
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

// Anfragen: zuerst aus dem eigenen Cache, nur falls dort nicht vorhanden aus dem Netz.
// Fremde Adressen werden nicht angefasst (die App fragt ohnehin keine an).
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(request, { ignoreSearch: true, ignoreVary: true }))
      .then((hit) => hit || fetch(request))
  );
});
