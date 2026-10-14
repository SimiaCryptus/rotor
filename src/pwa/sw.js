const CACHE_NAME = 'rotor-pwa-v1';
const ASSETS = [
  './rotor.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS) {
        try {
          await cache.add(asset);
        } catch {
          // Continue if any optional asset is unavailable
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass caching for AI providers, Google Drive APIs, and local models
  if (
    url.hostname.includes('api.openai.com') ||
    url.hostname.includes('api.anthropic.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('gstatic.com') ||
    url.port === '11434'
  ) {
    return;
  }

  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200 && event.request.url.startsWith(self.location.origin)) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          }
          return networkRes;
        }).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./rotor.html');
          }
          return cached;
        });

        return cached || fetchPromise;
      })
    );
  }
});