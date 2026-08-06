/**
 * Registro del Service Worker para soporte sin conexión (PWA) con recarga automática en actualizaciones.
 */

export function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('Service Worker registrado con éxito. Scope:', registration.scope);
                    
                    // Si ya hay un SW esperando activación, forzar skipWaiting
                    if (registration.waiting) {
                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                    
                    // Si se encuentra una nueva versión instalándose
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (window.mostrarProgreso) {
                            window.mostrarProgreso({
                                titulo: 'Actualizando App',
                                mensaje: 'Instalando la nueva versión en segundo plano...',
                                icono: 'system_update'
                            });
                        }
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Enviar señal para omitir la espera e instalar la nueva versión de inmediato
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                            }
                        });
                    });
                })
                .catch(error => {
                    console.error('Error al registrar el Service Worker:', error);
                });
        });

        // Escuchar el cambio de controlador para recargar la página inmediatamente
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    } else {
        console.warn('Tu navegador no soporta Service Workers. El modo offline no estará disponible.');
    }
}
