const CACHE_NAME = 'puzzle-gauntlet-v4'
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './puzzles.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
]

// Requests that should always try the network first, falling back to cache
// only when offline. This keeps puzzle data and the app shell fresh after
// deploys, instead of serving a stale cached copy indefinitely.
const NETWORK_FIRST = [/puzzles\.json$/, /index\.html$/]

function isNetworkFirst(request) {
  return NETWORK_FIRST.some((re) => re.test(request.url)) || request.mode === 'navigate'
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  if (isNetworkFirst(event.request)) {
    // Network-first: fetch fresh data, cache it, fall back to cache if offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Stale-while-revalidate for static assets (hashed JS/CSS, icons, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
})
