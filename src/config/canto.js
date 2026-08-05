// src/config/canto.js
// Configuración del módulo de canto
// Centralizamos las opciones relacionadas con la visualización y comportamiento de los cantos.
// El BIS se maneja por canto individual: cada canto tiene su propio estado habilitado/deshabilitado.

export const cantoConfig = {
  // Mapa de estados BIS por canto: { songId: true/false }
  bisEnabledMap: {},
  // Intervalo base de desplazamiento en ms (por defecto 40ms)
  scrollInterval: 40,
  // Incremento de desplazamiento en píxeles (por defecto 1px)
  scrollIncrement: 1,
};

// Cargar estados BIS y configuración de desplazamiento desde localStorage
export function loadBisConfig() {
  try {
    const saved = localStorage.getItem('bis-enabled-map');
    if (saved) {
      cantoConfig.bisEnabledMap = JSON.parse(saved);
    }
    const savedInterval = localStorage.getItem('scroll-interval');
    if (savedInterval) {
      cantoConfig.scrollInterval = parseInt(savedInterval, 10);
    }
    const savedInc = localStorage.getItem('scroll-increment');
    if (savedInc) {
      cantoConfig.scrollIncrement = parseInt(savedInc, 10);
    }
  } catch (e) {
    console.warn('Error al cargar configuración de Canto:', e);
  }
}

// Guardar estados BIS en localStorage
export function saveBisConfig() {
  localStorage.setItem('bis-enabled-map', JSON.stringify(cantoConfig.bisEnabledMap));
}

// Guardar configuración de desplazamiento en localStorage
export function saveCantoSettings() {
  localStorage.setItem('scroll-interval', cantoConfig.scrollInterval);
  localStorage.setItem('scroll-increment', cantoConfig.scrollIncrement);
}

// Verificar si el BIS está habilitado para un canto específico
export function isBisEnabled(songId) {
  return cantoConfig.bisEnabledMap[songId] === true;
}

// Habilitar o deshabilitar BIS para un canto específico
export function setBisForSong(songId, enabled) {
  cantoConfig.bisEnabledMap[songId] = enabled;
  saveBisConfig();
}
