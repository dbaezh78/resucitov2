// sw.js - Service Worker para el cancionero Resucito
const CACHE_NAME = 'resucito-cache-v208'; // Incrementado para forzar actualización inmediata
const STATIC_ASSETS = [
  './',
  'index.html',
  'perfil.html',
  'preparar.html',
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
  'data/paises.json',
  'data/ajustes_modal.html'
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

// Mensaje para forzar skipWaiting desde el cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Interceptar peticiones
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Evitar interceptar llamadas de APIs externas o de Firebase Auth
  if (url.origin !== self.location.origin) {
    return;
  }

  // Comprobar si es un recurso de código/interfaz (HTML, JS, CSS)
  const isCodeResource = 
    url.pathname === '/' || 
    url.pathname.endsWith('index.html') || 
    url.pathname.includes('.js') || 
    url.pathname.includes('.css');

  if (isCodeResource) {
    // ESTRATEGIA: Network-First (Intentar red primero, si falla usar caché)
    // Esto asegura que las actualizaciones se vean al instante sin perder el modo sin conexión
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Si no hay red, servir desde caché
          return caches.match(event.request);
        })
    );
  } else {
    // Para cantos, si el modo sin conexión no está activo, servir directamente de la red sin usar ni rellenar caché
    const isSongJson = url.pathname.includes('/data/songs/') || url.pathname.includes('/data/songs-ae/');
    if (isSongJson) {
      const isOfflineMode = url.searchParams.get('offline') === 'true';
      if (!isOfflineMode) {
        event.respondWith(fetch(event.request));
        return;
      }
    }

    // ESTRATEGIA: Cache-First con Stale-While-Revalidate para imágenes y JSON de datos
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          // Devolver el recurso en caché e intentar actualizarlo en background
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(err => console.log('[Service Worker] Error al actualizar en background:', err));
          return cachedResponse;
        }

        // Si no está en caché, ir a la red
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            // Guardar en la caché
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(error => {
          console.error('[Service Worker] Error de red:', error);
        });
      })
    );
  }
});
