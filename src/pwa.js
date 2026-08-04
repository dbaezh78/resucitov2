/**
 * Registro del Service Worker para soporte sin conexión (PWA).
 */

export function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('Service Worker registrado con éxito. Scope:', registration.scope);
                })
                .catch(error => {
                    console.error('Error al registrar el Service Worker:', error);
                });
        });
    } else {
        console.warn('Tu navegador no soporta Service Workers. El modo offline no estará disponible.');
    }
}
