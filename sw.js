// sw.js - Service Worker para el cancionero Resucito
const CACHE_NAME = 'resucito-cache-v60';
const STATIC_ASSETS = [
  './',
  'index.html',
  'src/main.js',
  'src/style.css',
  'src/search.js',
  'src/chords.js',
  'src/pwa.js',
  'src/auth.js',
  'src/firebase.js',
  'src/sync.js',
  'data/songs-index.json',
  'data/chord_positions.json',
  'data/catequesis.json',
  'data/paises.json'
];

// Instalar SW y cachear recursos iniciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Pre-cacheando recursos estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activar SW y limpiar cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché obsoleta:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar peticiones
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Evitar interceptar llamadas API externas que no sean de audio o imágenes
  if (url.origin !== self.location.origin) {
    // Si es una petición a audioSrc (opcional, si queremos cachear audios ligeros. Pero los audios suelen ser grandes, mejor no cachearlos de golpe, o usar cache especial)
    return;
  }

  // Estrategia: Cache-First con Network Fallback y actualización en segundo plano (Stale-While-Revalidate)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Devolver respuesta cacheada inmediatamente e ir al servidor a actualizar en background
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(err => console.log('[Service Worker] Error al actualizar recurso en segundo plano:', err));
        
        return cachedResponse;
      }

      // No está en caché, ir a la red
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Cachear las respuestas exitosas de datos, cantos e imágenes locales
        if (url.pathname.includes('/data/') || url.pathname.includes('/ima/') || url.pathname.includes('.js')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }

        return networkResponse;
      }).catch(error => {
        console.error('[Service Worker] Falla de red y recurso no cacheado:', error);
        // Podríamos retornar un fallback offline.html para navegación si es necesario
      });
    })
  );
});
