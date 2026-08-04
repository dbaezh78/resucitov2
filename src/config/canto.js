// src/config/canto.js
// Configuración del módulo de canto
// Centralizamos las opciones relacionadas con la visualización y comportamiento de los cantos.
// El BIS se maneja por canto individual: cada canto tiene su propio estado habilitado/deshabilitado.

export const cantoConfig = {
  // Mapa de estados BIS por canto: { songId: true/false }
  // Por defecto vacío = todos deshabilitados
  bisEnabledMap: {},
};

// Cargar estados BIS desde localStorage
export function loadBisConfig() {
  try {
    const saved = localStorage.getItem('bis-enabled-map');
    if (saved) {
      cantoConfig.bisEnabledMap = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Error al cargar configuración BIS:', e);
  }
}

// Guardar estados BIS en localStorage
export function saveBisConfig() {
  localStorage.setItem('bis-enabled-map', JSON.stringify(cantoConfig.bisEnabledMap));
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
