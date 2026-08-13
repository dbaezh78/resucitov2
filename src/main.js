import { registerServiceWorker } from './pwa.js';
import './navegador.js';
import './js/ajustes.js';
import './js/datos.js';
import { searchSongs } from './search.js';
import { getSongScrollConfig, saveSongScrollConfig } from './scroll.js';
import { transposeNote, normalizeChord, CHROMATIC_SCALE, parseChord } from './chords.js';
import { songs } from './songs-data.js';
import { onAuthStateChanged, loginMock, logoutMock, isCurrentUserAdmin, getCurrentUser } from './auth.js';

// Exponer API de autenticación globalmente para el navegador
window.firebaseAPI = {
  login: loginMock,
  logout: logoutMock,
  onAuthReady: onAuthStateChanged,
  getCurrentUser: getCurrentUser
};
import { canAccessBook, initAccessControl, setupAccessControlUI, trackLoggedInUser, hasPermission, getAccessControlState, listenToOwnUserPermissionsSilently } from './accesscontrol.js';
import { cantoConfig, loadBisConfig, saveBisConfig, isBisEnabled, setBisForSong } from './canto.js';
import { 
  guardarNotaEnNube, 
  cargarNotaDesdeNube, 
  guardarPosicionesEnNube, 
  cargarPosicionesDesdeNube, 
  publicarPosicionesGlobales, 
  cargarPosicionesGlobales,
  guardarHistorialCantoEnNube,
  cargarHistorialCantoDesdeNube
} from './sync.js';

// --- Estado Global de la SPA ---
let allSongs = [];
let filteredSongs = [];
let currentCanto = null;
let currentKeyOffset = 0; // Transposición en semitonos
window.getCurrentKeyOffset = () => currentKeyOffset;
let originalSongKey = 'La'; // Nota base del canto cargado
let originalSongTypeSuffix = ''; // Sufijo/variación del tono original (ej: "7", "m")
let transitionDirection = null;
let loadedSongsCache = {}; // Cache de cantos con letra y acordes completos

// Zoom por defecto según dispositivo (tc: Tablet y Celular)
// (Definido en ajustes.js)
let isScrollActive = false;
let scrollIntervalId = null;
let activeStage = null;
let activeMoments = [];
let allAsambleaExpanded = true;
let currentBook = 'resucito';
// favorites e isAdmin ahora son globales e inicializados en ajustes.js
let catequesisData = null;
let defaultChordPositions = {};
let isChordEditMode = false;
// isAdmin se inicializa en ajustes.js

// Referencias del DOM
const dashboardView = document.getElementById('dashboard-view');
const songViewerView = document.getElementById('song-viewer-view');
const songsGrid = document.getElementById('songs-grid');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
const filtersPanel = document.getElementById('filters-panel');
const stageFiltersContainer = document.getElementById('stage-filters-container');
const momentFiltersContainer = document.getElementById('moment-filters-container');

// Referencias del visor
const viewerBackBtn = document.getElementById('viewer-back-btn');
const favoriteBtn = document.getElementById('favorite-btn');
const viewerSongTitle = document.getElementById('viewer-song-title');
const viewerSongSubtitle = document.getElementById('viewer-song-subtitle');
const keyBadge = document.getElementById('key-badge');
const transposeDownBtn = document.getElementById('transpose-down-btn');
const transposeUpBtn = document.getElementById('transpose-up-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const scrollPlayBtn = document.getElementById('scroll-play-btn');
// Variables globales en ajustes.js
scrollIntervalMs = parseInt(localStorage.getItem('scroll-interval')) || 40;
scrollStepPx = parseInt(localStorage.getItem('scroll-step')) || 1;
scrollIntervalLimit = parseInt(localStorage.getItem('scroll-interval-limit')) || 1000;
scrollStepLimit = parseInt(localStorage.getItem('scroll-step-limit')) || 100;
const splitLayoutBtn = document.getElementById('split-layout-btn');
const asambleaToggleBtn = document.getElementById('asamblea-toggle-btn');
const audioPlayBtn = document.getElementById('audio-play-btn');
const settingsOpenBtn = document.getElementById('settings-open-btn');
const cantoLeftCol = document.getElementById('canto-left-col');
const cantoRightCol = document.getElementById('canto-right-col');
const cantoColumnsContainer = document.getElementById('canto-columns');
const viewerAudioContainer = document.getElementById('viewer-audio-container');
const viewerAudioPlayer = document.getElementById('viewer-audio-player');
const notesTextarea = document.getElementById('notes-textarea');

// Nuevas referencias de la barra de herramientas y buscador rápido
const toneCapoTrigger = document.getElementById('tone-capo-trigger');
const capoBadge = document.getElementById('capo-badge');
const chordModalTriggerBtn = document.getElementById('chord-modal-trigger-btn');
const prevSongBtn = document.getElementById('prev-song-btn');
const nextSongBtn = document.getElementById('next-song-btn');
const toolbarSearchInput = document.getElementById('toolbar-search-input');
const toolbarSearchSuggestions = document.getElementById('toolbar-search-suggestions');
const cantoHeaderBlock = document.getElementById('canto-header-block');

// Modales
const chordModal = document.getElementById('chord-modal');
const chordModalTitle = document.getElementById('chord-modal-title');
const chordModalClose = document.getElementById('chord-modal-close');
const chordDiagramImg = document.getElementById('chord-diagram-img');
const modalChordNotePicker = document.getElementById('modal-chord-note-picker');
const modalChordTypePicker = document.getElementById('modal-chord-type-picker');

let capoSelect = null;
const dashboardSettingsBtn = document.getElementById('dashboard-settings-btn');

// Estado interno para el prontuario de acordes activo
let selectedModalNote = 'La';
let selectedModalType = 'm';
let currentEditingChordInfo = null; // Almacena { side, lineIdx, subLineIdx, chordIdx } en modo edición
isSplitLayout = localStorage.getItem('split-layout') !== 'false';
let activeSongsPlaylist = []; // Almacena el listado activo de cantos en pantalla para navegar
songListStyle = localStorage.getItem('song-list-style') || 'simple'; // Estilo visual de la lista: cards, detailed, simple

/**
 * Limpia símbolos o caracteres especiales iniciales (ej: ¡, ¿, ", «, () para ordenar alfabéticamente por la primera letra real del título.
 * Ejemplo: "¡Mirad qué estupendo!" se ordena por "M".
 */
export function getSortableTitle(title) {
  if (!title) return '';
  return title.replace(/^[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]+/, '').trim();
}

export function sortSongsAlphabetically(songsArray) {
  if (!Array.isArray(songsArray)) return;
  songsArray.sort((a, b) => {
    const keyA = getSortableTitle(a.title);
    const keyB = getSortableTitle(b.title);
    return keyA.localeCompare(keyB, 'es', { sensitivity: 'base' });
  });
}

export function updateAccessControlVisibility() {
  const userSubtabAccessBtn = document.getElementById('user-subtab-access-btn');
  const userSubpanelAccess = document.getElementById('user-subpanel-access');
  const userSubpanelAccount = document.getElementById('user-subpanel-account');
  const userSubtabAccountBtn = document.getElementById('user-subtab-account-btn');
  const canManageAccess = isCurrentUserAdmin() || hasPermission('manage_access');

  if (userSubtabAccessBtn) {
    userSubtabAccessBtn.style.display = canManageAccess ? 'inline-flex' : 'none';
  }

  if (!canManageAccess) {
    if (userSubpanelAccess && userSubpanelAccess.style.display !== 'none') {
      userSubpanelAccess.style.display = 'none';
      if (userSubpanelAccount) userSubpanelAccount.style.display = 'block';
      if (userSubtabAccountBtn) userSubtabAccountBtn.classList.add('active');
      if (userSubtabAccessBtn) userSubtabAccessBtn.classList.remove('active');
    }
  }

  // Control de visibilidad de la pestaña Log de Diagnóstico
  const settingsTabLog = document.querySelector('.settings-tab-btn[data-tab="log"]');
  const settingsPanelLog = document.getElementById('settings-panel-log');
  const canViewLogs = isCurrentUserAdmin() || hasPermission('view_logs') || hasPermission('manage_access');

  if (settingsTabLog) {
    settingsTabLog.style.display = canViewLogs ? 'flex' : 'none';
  }

  if (!canViewLogs && settingsPanelLog && settingsPanelLog.style.display !== 'none') {
    if (typeof window.openSettingsTab === 'function') {
      window.openSettingsTab('general');
    }
  }
}
window.updateAccessControlVisibility = updateAccessControlVisibility;

export function updateBookTabsVisibility() {
  document.querySelectorAll('.book-tab').forEach(tab => {
    const bookId = tab.dataset.book;
    if (bookId) {
      const hasAccess = canAccessBook(bookId);
      tab.style.display = hasAccess ? 'inline-block' : 'none';
    }
  });

  if (!canAccessBook(currentBook)) {
    currentBook = 'resucito';
    document.querySelectorAll('.book-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.book === 'resucito');
    });
    handleSearchAndFilters();
  }

  updateAccessControlVisibility();
}

export const updateExtrasTabVisibility = updateBookTabsVisibility;
window.updateBookTabsVisibility = updateBookTabsVisibility;

window.applyStickySearchPreference = function() {
  const stickyEnabled = localStorage.getItem('stickySearch') !== 'false';
  const topFlex = document.querySelector('.dashboard-top-flex');
  if (topFlex) {
    topFlex.classList.toggle('not-sticky', !stickyEnabled);
  }
};

window.limpiarFiltrosIndex = function() {
  activeStage = null;
  activeMoments = [];
  const stageContainer = document.getElementById('stage-filters-container');
  const momentContainer = document.getElementById('moment-filters-container');
  if (stageContainer) {
    stageContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  }
  if (momentContainer) {
    momentContainer.querySelectorAll('.filter-pill').forEach(b => {
      b.classList.toggle('active', b.id === 'btn-filter-indice');
    });
  }
  handleSearchAndFilters();
};

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', async () => {
  // Registrar Service Worker
  registerServiceWorker();
  
  // Cargar preferencias guardadas
  if (typeof window.initAjustes === 'function') {
    await window.initAjustes();
  }
  capoSelect = document.getElementById('capo-select');
  setupAccessControlUI();
  updateBookTabsVisibility();
  if (typeof window.applyStickySearchPreference === 'function') {
    window.applyStickySearchPreference();
  }
  
  // Cargar configuración de BIS por canto desde localStorage
  loadBisConfig();
  // Cargar índice de canciones y posiciones de acordes
  try {
    const [indexRes, posRes] = await Promise.all([
      fetch('data/songs-index.json'),
      fetch('data/chord_positions.json').catch(e => {
        console.warn('No se pudo precargar chord_positions.json, se cargará bajo demanda.', e);
        return null;
      })
    ]);
    allSongs = await indexRes.json();
    window.allSongs = allSongs;
    // Ordenar alfabéticamente por la primera letra del título (ignorando símbolos iniciales como ¡ o ¿)
    sortSongsAlphabetically(allSongs);
    handleSearchAndFilters();
    updateExtrasTabVisibility();
    
    if (posRes && posRes.ok) {
      defaultChordPositions = await posRes.json();
    }
  } catch (error) {
    console.error('Error al cargar la base de datos de canciones:', error);
    songsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: red;">Error al cargar cantos. Comprueba la conexión o intenta recargar.</div>`;
  }
  
  // Escuchar cambios de URL/Hash para ruteo virtual
  window.addEventListener('hashchange', routeSPA);
  routeSPA(); // Ruta inicial
  
  // Configurar listeners generales
  setupEventListeners();
});

// --- Ruteo de la SPA ---
function routeSPA() {
  if (!dashboardView || !songViewerView) return;
  const hash = window.location.hash;
  
  // Detener scroll al cambiar de pantalla
  stopAutoScroll();
  
  if (hash.startsWith('#canto=')) {
    const songId = hash.replace('#canto=', '');
    loadSongView(songId);
  } else {
    // Volver al buscador
    songViewerView.style.display = 'none';
    dashboardView.style.display = 'flex';
    document.title = "RESUCITÓ - Cantos Neocatecumenales";
    
    // Detener audio al volver al buscador
    if (viewerAudioPlayer) {
      viewerAudioPlayer.pause();
      viewerAudioPlayer.src = '';
    }
    if (viewerAudioContainer) {
      viewerAudioContainer.classList.remove('open');
    }
    if (audioPlayBtn) {
      audioPlayBtn.classList.remove('active');
    }

    if (hash === '#ajustes') {
      if (typeof window.abrirModalConfiguracion === 'function') {
        window.abrirModalConfiguracion();
      }
    }
  }
}

async function sincronizarCantoDesdeFirebase(songId) {
  // 1. Cargar posiciones globales oficiales de acordes si existen en Firestore
  try {
    const globalPos = await cargarPosicionesGlobales(songId);
    if (globalPos && (globalPos.lizq.length > 0 || globalPos.lder.length > 0)) {
      if (!defaultChordPositions) defaultChordPositions = {};
      defaultChordPositions[songId] = globalPos;
      console.log(`📥 [Firebase] Posiciones globales aplicadas para el canto: ${songId}`);
    }
  } catch (e) {
    console.error("Error al sincronizar posiciones globales:", e);
  }

  // 2. Si el usuario está autenticado, descargar sus datos personales
  const user = getCurrentUser();
  if (user) {
    // 2a. Descargar historial de transportación y cejilla
    try {
      const historial = await cargarHistorialCantoDesdeNube(songId);
      if (historial !== null) {
        currentKeyOffset = historial.acorde;
        
        // Aplicar la cejilla (capo) descargada a los selectores
        const selectedCapo = historial.cejilla;
        if (capoSelect) capoSelect.value = selectedCapo;
        const activeCapoBadge = document.getElementById('capo-badge');
        if (activeCapoBadge) activeCapoBadge.textContent = formatCapoText(selectedCapo);
        const modalCapoSelect = document.getElementById('modal-capo-select');
        if (modalCapoSelect) modalCapoSelect.value = selectedCapo;

        // Sincronizar nota personal y valoración del historial (Versión 1)
        if (historial.notasCantor !== undefined && historial.notasCantor !== '') {
          localStorage.setItem(`notes_${songId}`, historial.notasCantor);
          const notesTextarea = document.getElementById('notes-textarea');
          if (notesTextarea) notesTextarea.value = historial.notasCantor;
        }
        if (historial.valoracion !== undefined && historial.valoracion > 0) {
          const key = `canto-config-${songId}`;
          let dataObj = {};
          try {
            dataObj = JSON.parse(localStorage.getItem(key) || '{}');
          } catch (e) {}
          dataObj.valoracion = historial.valoracion;
          localStorage.setItem(key, JSON.stringify(dataObj));
          renderFooterStars(songId, historial.valoracion);
        }
        
        console.log(`📥 [Firebase] Historial completo cargado de la nube: acorde = ${historial.acorde}, cejilla = ${historial.cejilla}`);
      }
    } catch (e) {
      console.error("Error al sincronizar historial de tono/cejilla desde la nube:", e);
    }
    
    // 2b. Descargar nota del cantor
    try {
      const nota = await cargarNotaDesdeNube(songId);
      if (nota !== null) {
        localStorage.setItem(`notes_${songId}`, nota);
        console.log("📥 [Firebase] Nota del cantor cargada de la nube.");
      }
    } catch (e) {
      console.error("Error al sincronizar nota del cantor desde la nube:", e);
    }
    
    // 2c. Descargar posiciones personalizadas
    try {
      const personalPos = await cargarPosicionesDesdeNube(songId);
      if (personalPos && (personalPos.lizq.length > 0 || personalPos.lder.length > 0)) {
        localStorage.setItem(`custom-positions-${songId}`, JSON.stringify(personalPos));
        console.log("📥 [Firebase] Posiciones personalizadas cargadas de la nube.");
      }
    } catch (e) {
      console.error("Error al sincronizar posiciones personalizadas desde la nube:", e);
    }
  }
}

window.registrarUsoCanto = function(songId, tipo, detalle) {
  if (!songId) return;
  const key = `canto-config-${songId}`;
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {}

  const ahora = new Date().toISOString();
  data.fecha = ahora;
  if (!Array.isArray(data.historial)) {
    data.historial = [];
  }
  data.historial.push({
    fecha: ahora,
    tipo: tipo || 'view',
    detalle: detalle || 'Canto utilizado'
  });

  data.contadorCambios = (data.contadorCambios || 0) + 1;
  localStorage.setItem(key, JSON.stringify(data));
};

// --- Carga de Detalles de Canción ---
async function loadSongView(songId) {
  try {
    const initPrev = document.getElementById('canto-slide-prev');
    const initNext = document.getElementById('canto-slide-next');
    if (initPrev) initPrev.innerHTML = '';
    if (initNext) initNext.innerHTML = '';

    if (viewerSongTitle) {
      viewerSongTitle.textContent = "Cargando...";
    }
    if (viewerSongSubtitle) {
      viewerSongSubtitle.textContent = "";
    }
    cantoLeftCol.innerHTML = "";
    cantoRightCol.innerHTML = "";
    viewerAudioContainer.classList.remove('open');

    // Registrar apertura/uso del canto para el historial del calendario
    window.registrarUsoCanto(songId, 'view', 'Vista de canto');
    
    let songData;
    if (loadedSongsCache[songId]) {
      songData = loadedSongsCache[songId];
    } else {
      const folder = songId.startsWith('aet') ? 'data/songs-ae' : 'data/songs';
      const isOffline = localStorage.getItem('cantoEquipoOffline') === 'true';
      const response = await fetch(`${folder}/${songId}.json?offline=${isOffline}`);
      if (!response.ok) throw new Error('Canto no encontrado');
      songData = await response.json();
      loadedSongsCache[songId] = songData;
    }
    currentCanto = songData;
    
    // Aplicar zoom según dispositivo (tc) respetando la preferencia personalizada si existe
    applyZoom(getDefaultZoom());
    
    // Asignar el color de etapa actual a nivel de body para la cabecera y el sombreado
    const stageColor = getStageColor(currentCanto.catCanto || currentCanto.stage);
    document.body.style.setProperty('--current-stage-color', stageColor);
    
    // Asignar el fondo de etapa actual a nivel de body
    const cleanStage = (currentCanto.catCanto || currentCanto.stage || '').toLowerCase();
    let stageKey = 'pre';
    if (cleanStage.includes('pre')) stageKey = 'pre';
    else if (cleanStage.includes('cate')) stageKey = 'cate';
    else if (cleanStage.includes('ele')) stageKey = 'ele';
    else if (cleanStage.includes('lit')) stageKey = 'lit';
    else if (cleanStage.includes('cat') || cleanStage.includes('can') || cleanStage.includes('ot')) stageKey = 'cat';
    document.body.style.setProperty('--current-stage-bg', `var(--stage-bg-${stageKey})`);
    
    // Actualizar estado activo en las tarjetas del índice
    document.querySelectorAll('.song-card').forEach(card => {
      const isCurrent = card.getAttribute('href') === `#canto=${songId}`;
      card.classList.toggle('active', isCurrent);
    });
    
    // Configurar cabecera del visor (Christ block y título de libro)
    if (cantoHeaderBlock) {
      const stage = (currentCanto.catCanto || '').toUpperCase();
      const title = (currentCanto.title || currentCanto.tt || '').toUpperCase();
      const subtitle = currentCanto.subtitle || '';
      
      cantoHeaderBlock.innerHTML = `
        <div class="canto-header-left">
          <img src="img/christ.png" alt="Cristo" class="canto-header-img">
        </div>
        <div class="canto-header-center">
          <div class="canto-header-stage">${stage}</div>
          <h1 class="canto-header-title">${title}</h1>
          <div class="canto-header-subtitle">${subtitle}</div>
        </div>
        <div class="canto-header-right"></div>
      `;
    }
    
    if (viewerSongTitle) {
      viewerSongTitle.textContent = currentCanto.title || currentCanto.tt || 'Sin Título';
    }
    if (viewerSongSubtitle) {
      viewerSongSubtitle.textContent = currentCanto.subtitle || '';
    }
    document.title = `${currentCanto.title || currentCanto.tt || 'Sin Título'} - Resucitó`;
    
    renderSongContent();
    setupHeaderTitleObserver();
    if (window.applySongScrollSpeed) {
      window.applySongScrollSpeed(songId);
    }
// Tono original y cejilla desde songs-data.js
    const songFromData = songs.find(s => s.id === songId);
    let originalChordStr = 'La';
    let originalCapoStr = '';
    if (songFromData) {
      originalChordStr = songFromData.acorde || 'La';
      originalCapoStr = songFromData.cejilla || '';
    } else {
      originalChordStr = currentCanto.acorde || currentCanto.nCan || 'La';
      originalCapoStr = currentCanto.cejilla || '';
    }

    const parsed = parseChord(originalChordStr);
    originalSongKey = parsed.noteName;
    originalSongTypeSuffix = parsed.typeSuffix;
    currentKeyOffset = 0; // Reiniciar offset
    updateTransposeBadge();
    
    // Cejilla original
    const defaultCapo = parseInt(originalCapoStr) || 0;
    capoSelect.value = defaultCapo;
    
    const activeCapoBadge = document.getElementById('capo-badge');
    if (activeCapoBadge) {
      activeCapoBadge.textContent = formatCapoText(defaultCapo);
    }
    
    const modalCapoSelect = document.getElementById('modal-capo-select');
    if (modalCapoSelect) {
      modalCapoSelect.value = defaultCapo;
    }

    updateChordPanel();
    
    // Cargar notas del cantor
    notesTextarea.value = localStorage.getItem(`notes_${songId}`) || '';
    
    // Configurar estrella de favoritos
    favoriteBtn.classList.toggle('active-star', favorites.has(songId));
    
    // Sincronizar botones de navegación anterior / siguiente (solo dentro del libro seleccionado)
    const targetBook = (currentCanto && currentCanto.sourceBook) ? currentCanto.sourceBook : currentBook;
    const currentBookSongs = allSongs.filter(s => (s.sourceBook || 'resucito') === targetBook);
    
    const currentIndex = activeSongsPlaylist.findIndex(s => s.id === songId);
    const playListToUse = currentIndex !== -1 ? activeSongsPlaylist : currentBookSongs;
    const currentIdxToUse = currentIndex !== -1 ? currentIndex : currentBookSongs.findIndex(s => s.id === songId);
    
    if (currentIdxToUse !== -1) {
      prevSongBtn.style.opacity = currentIdxToUse > 0 ? '1' : '0.4';
      prevSongBtn.style.pointerEvents = currentIdxToUse > 0 ? 'auto' : 'none';
      nextSongBtn.style.opacity = currentIdxToUse < playListToUse.length - 1 ? '1' : '0.4';
      nextSongBtn.style.pointerEvents = currentIdxToUse < playListToUse.length - 1 ? 'auto' : 'none';
    } else {
      prevSongBtn.style.opacity = '0.4';
      prevSongBtn.style.pointerEvents = 'none';
      nextSongBtn.style.opacity = '0.4';
      nextSongBtn.style.pointerEvents = 'none';
    }
    
    // Limpiar buscador rápido superior
    if (toolbarSearchInput) toolbarSearchInput.value = '';
    if (toolbarSearchSuggestions) toolbarSearchSuggestions.style.display = 'none';
    
    // Configurar audio
    if (currentCanto.audioSrc) {
      viewerAudioPlayer.src = currentCanto.audioSrc;
      if (audioPlayBtn) audioPlayBtn.style.display = 'flex';
    } else {
      viewerAudioPlayer.src = '';
      if (audioPlayBtn) audioPlayBtn.style.display = 'none';
    }
    viewerAudioContainer.classList.remove('open');
    if (audioPlayBtn) audioPlayBtn.classList.remove('active');
    
    // Renderizar letras y acordes locales primero para máxima velocidad
    renderSongContent();
    
    // Descarga asíncrona de configuraciones desde Firebase en segundo plano
    sincronizarCantoDesdeFirebase(songId).then(() => {
      // Si la descarga actualizó algo, re-renderizamos para reflejar los cambios
      updateTransposeBadge();
      notesTextarea.value = localStorage.getItem(`notes_${songId}`) || '';
      renderSongContent();
    });
    
    // Configurar pie de página del canto (categorías, nota modal, estrellas y número dbno)
    setupViewerSongFooter(songId);

    // Mostrar visor
    dashboardView.style.display = 'none';
    songViewerView.style.display = 'flex';
    window.scrollTo(0, 0);
    
    // Restablecer el contenedor deslizante a su posición central por defecto
    const sliderContainer = document.getElementById('canto-slider-container');
    const slidePrev = document.getElementById('canto-slide-prev');
    const slideNext = document.getElementById('canto-slide-next');
    
    if (sliderContainer) {
      sliderContainer.style.transition = 'none';
      sliderContainer.style.transform = 'translate3d(calc(-100% / 3 - 13.333px), 0, 0)';
    }
    if (slidePrev) slidePrev.innerHTML = '';
    if (slideNext) slideNext.innerHTML = '';

    // Pre-cargar los cantos adyacentes (anterior y siguiente) en segundo plano
    if (currentIdxToUse > 0) {
      const prevSong = playListToUse[currentIdxToUse - 1];
      obtenerCantoCompleto(prevSong.id); // Prefetch en background
    }
    if (currentIdxToUse !== -1 && currentIdxToUse < playListToUse.length - 1) {
      const nextSong = playListToUse[currentIdxToUse + 1];
      obtenerCantoCompleto(nextSong.id); // Prefetch en background
    }
  } catch (error) {
    console.error('Error al cargar detalle del canto:', error);
    alert('No se pudo cargar la letra del canto.');
    window.location.hash = ''; // Volver al listado
  }
}

// --- Pie de página del Canto (Categorías, Nota Modal, Estrellas y dbno) ---
function setupViewerSongFooter(songId) {
  const footerBarLeft = document.getElementById('footer-moments-list');
  const footerRatingStars = document.getElementById('footer-rating-stars');
  const footerSongNumber = document.getElementById('footer-song-number');
  const noteBtn = document.getElementById('song-footer-note-btn');

  const songMeta = allSongs.find(s => s.id === songId) || songs.find(s => s.id === songId) || currentCanto;
  if (!songMeta) return;

  const footerBar = document.getElementById('viewer-song-footer-bar');
  if (footerBar) {
    footerBar.style.backgroundColor = 'var(--current-stage-bg)';
  }

  // 1. Categorías / Momentos (Izquierda)
  if (footerBarLeft) {
    footerBarLeft.innerHTML = '';
    let rawMoments = [];
    if (Array.isArray(songMeta.moments)) {
      rawMoments = songMeta.moments;
    } else if (Array.isArray(songMeta.category)) {
      rawMoments = songMeta.category;
    } else if (typeof songMeta.category === 'string') {
      rawMoments = [songMeta.category];
    } else if (typeof songMeta.catCanto === 'string') {
      rawMoments = [songMeta.catCanto];
    }

    const cleanMoments = rawMoments.filter(m => m && m.trim().length > 0 && m !== 'Indice');
    if (cleanMoments.length === 0 && songMeta.stage) {
      cleanMoments.push(songMeta.stage);
    }

    cleanMoments.forEach((momentName) => {
      const pill = document.createElement('span');
      pill.className = 'footer-moment-pill';
      pill.textContent = momentName;

      pill.addEventListener('click', (e) => {
        e.stopPropagation();

        // 1. Establecer filtro por Etapa o por Momento
        const stageList = ['precatecumenado', 'catecumenado', 'eleccion', 'liturgia'];
        const cleanMoment = momentName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (stageList.some(s => cleanMoment.includes(s))) {
          activeStage = momentName;
          activeMoments = [];
        } else {
          activeStage = null;
          activeMoments = [momentName];
        }

        // 2. Cambiar a la vista del índice/buscador
        if (dashboardView && songViewerView) {
          songViewerView.style.display = 'none';
          dashboardView.style.display = 'flex';
          window.location.hash = '';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // 3. Activar el botón de filtro correspondiente en el índice si existe
        document.querySelectorAll('.filter-pill').forEach(btn => {
          const dm = btn.getAttribute('data-moment') || btn.textContent.trim();
          const isActive = (dm.toLowerCase() === momentName.toLowerCase());
          btn.classList.toggle('active', isActive);
        });

        document.querySelectorAll('.stage-pill, .etapa-pill, [data-stage]').forEach(btn => {
          const ds = btn.getAttribute('data-stage') || btn.textContent.trim();
          const isActive = (ds.toLowerCase() === momentName.toLowerCase());
          btn.classList.toggle('active', isActive);
        });

        // 4. Ejecutar búsqueda y renderizado de la lista filtrada
        handleSearchAndFilters();
      });

      footerBarLeft.appendChild(pill);
    });
  }

  // 2. Icono de Nota (Centro) -> Modal de Nota
  if (noteBtn) {
    noteBtn.onclick = (e) => {
      e.stopPropagation();
      abrirModalNotaCanto(songId);
    };
  }

  // 3. Valoración de Estrellas (Derecha)
  if (footerRatingStars) {
    const keyData = localStorage.getItem(`canto-config-${songId}`) || localStorage.getItem(`data-${songId}`);
    let dataObj = {};
    if (keyData) {
      try { dataObj = JSON.parse(keyData); } catch (e) {}
    }
    const puntos = parseInt(dataObj.valoracion || 0);

    renderFooterStars(songId, puntos);
  }

  // 4. Número del canto (dbno)
  if (footerSongNumber) {
    const songNo = songMeta.dbno || songMeta.idi || currentCanto?.dbno || '';
    footerSongNumber.textContent = songNo ? songNo : '';
  }
}

function renderFooterStars(songId, puntos) {
  const container = document.getElementById('footer-rating-stars');
  if (!container) return;

  let html = '';
  for (let i = 1; i <= 5; i++) {
    const color = (i <= puntos) ? '#FFD700' : '#C0C0C0';
    html += `<span data-star="${i}" style="color: ${color};">★</span>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('span').forEach(starEl => {
    starEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const rating = parseInt(starEl.getAttribute('data-star'));
      guardarRatingCanto(songId, rating);
    });
  });
}

function guardarRatingCanto(songId, rating) {
  const key = `canto-config-${songId}`;
  let dataObj = {};
  try {
    dataObj = JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {}
  
  // Si la valoración actual es 1 y se hace clic en la primera estrella, se quita (0)
  const currentRating = parseInt(dataObj.valoracion) || 0;
  let newRating = rating;
  if (rating === 1 && currentRating === 1) {
    newRating = 0;
  }
  
  dataObj.valoracion = newRating;
  localStorage.setItem(key, JSON.stringify(dataObj));

  renderFooterStars(songId, newRating);

  if (typeof window.guardarHistorialCantoEnNube === 'function') {
    const cejillaValue = capoSelect ? (parseInt(capoSelect.value) || 0) : 0;
    window.guardarHistorialCantoEnNube(songId, currentKeyOffset, cejillaValue);
  }
}

function abrirModalNotaCanto(songId) {
  const modal = document.getElementById('song-note-modal');
  const textarea = document.getElementById('modal-notes-textarea');
  const btnSave = document.getElementById('btn-save-song-note');
  const btnClose = document.getElementById('close-song-note-modal');

  if (!modal || !textarea) return;

  textarea.value = localStorage.getItem(`notes_${songId}`) || '';

  const handleSave = (e) => {
    e.stopPropagation();
    const val = textarea.value;
    localStorage.setItem(`notes_${songId}`, val);
    if (typeof guardarNotaEnNube === 'function') {
      guardarNotaEnNube(songId, val);
    }
    modal.style.display = 'none';
    cleanup();
  };

  const handleClose = (e) => {
    e.stopPropagation();
    modal.style.display = 'none';
    cleanup();
  };

  const cleanup = () => {
    if (btnSave) btnSave.removeEventListener('click', handleSave);
    if (btnClose) btnClose.removeEventListener('click', handleClose);
  };

  if (btnSave) btnSave.addEventListener('click', handleSave);
  if (btnClose) btnClose.addEventListener('click', handleClose);

  modal.style.display = 'flex';
}

// --- Renderizado de Canción ---
function formatCapoText(capoValue) {
  const val = parseInt(capoValue) || 0;
  if (val === 0) return '0/ al aire';
  if (val === 1) return '1/ 1º traste';
  if (val === 2) return '2/ 2º traste';
  if (val === 3) return '3/ 3º traste';
  return `${val}/ ${val}º traste`;
}

// --- Renderizado de Canción ---
function renderSongContent() {
  if (!currentCanto) return;
  
  cantoLeftCol.innerHTML = '';
  cantoRightCol.innerHTML = '';
  
  // Renderizar lado izquierdo
  if (currentCanto.lizq) {
    renderSection(cantoLeftCol, currentCanto.lizq, 'lizq');
  }
  
  // Renderizar lado derecho
  if (currentCanto.lder && currentCanto.lder.length > 0) {
    cantoRightCol.style.display = '';
    renderSection(cantoRightCol, currentCanto.lder, 'lder');
  } else {
    // Si no hay lado derecho, ocultarlo para pantallas grandes
    cantoRightCol.style.display = 'none';
  }
  
  // Sincronizar el estado de la UI de edición de acordes
  updateChordEditUI();
}

function renderSection(container, lines, side) {
  lines.forEach((item, lineIdx) => {
    if (item.type === "collapsible-block") {
      // Bloque colapsable (Asamblea)
      const containerDiv = document.createElement('div');
      containerDiv.className = 'collapsible-block-container';
      containerDiv.dataset.blockId = item.id;
      
      const linesWrapper = document.createElement('div');
      linesWrapper.className = 'collapsible-lines-wrapper';
      
      const triggerLine = renderLine(item.triggerLine, side, lineIdx, -1);
      triggerLine.classList.add('collapsible-trigger');
      if (item.sC) {
        item.sC.split(' ').forEach(cls => {
          if (cls) triggerLine.classList.add(cls);
        });
      }
      if (item.color) {
        triggerLine.style.color = item.color;
      }
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'collapsible-content';
      
      item.lines.forEach((subLine, subLineIdx) => {
        contentDiv.appendChild(renderLine(subLine, side, lineIdx, subLineIdx));
      });
      
      // Manejar estado inicial de colapso
      const isExpanded = allAsambleaExpanded || item.initialState === 'expanded';
      contentDiv.style.display = isExpanded ? 'block' : 'none';
      
      const triggerLetra = triggerLine.querySelector('.letra');
      if (!isExpanded && triggerLetra && !triggerLetra.textContent.endsWith('...')) {
        triggerLetra.textContent += '...';
      }
      
      triggerLine.addEventListener('click', () => {
        const currentlyVisible = contentDiv.style.display !== 'none';
        contentDiv.style.display = currentlyVisible ? 'none' : 'block';
        const letraSpan = triggerLine.querySelector('.letra');
        if (letraSpan) {
          if (currentlyVisible) {
            if (!letraSpan.textContent.endsWith('...')) letraSpan.textContent += '...';
          } else {
            letraSpan.textContent = letraSpan.textContent.replace('...', '');
          }
        }
      });
      
      linesWrapper.appendChild(triggerLine);
      linesWrapper.appendChild(contentDiv);
      containerDiv.appendChild(linesWrapper);
      
      // Agregar indicador lateral "BIS A." a la derecha (controlado por configuración por canto)
      if (currentCanto && isBisEnabled(currentCanto.id)) {
        const bisSide = document.createElement('div');
        bisSide.className = 'collapsible-bis-side';

        const bisLine = document.createElement('div');
        bisLine.className = 'bis-line';

        const bisText = document.createElement('div');
        bisText.className = 'bis-text';
        bisText.textContent = 'BIS A.';

        bisSide.appendChild(bisLine);
        bisSide.appendChild(bisText);
        containerDiv.appendChild(bisSide);
      }
      
      container.appendChild(containerDiv);
    } else if (item.img) {
      // Entrada de imagen (Diagramas, partituras)
      const imgLineDiv = document.createElement('div');
      imgLineDiv.className = 'linea-imagen';
      const imgEl = document.createElement('img');
      imgEl.src = item.img;
      imgEl.alt = "Diagrama musical";
      imgLineDiv.appendChild(imgEl);
      container.appendChild(imgLineDiv);
    } else {
      // Línea de canto normal
      container.appendChild(renderLine(item, side, lineIdx));
    }
  });
}

function renderLine(lineItem, side, lineIdx, subLineIdx) {
  const lineDiv = document.createElement('div');
  lineDiv.className = 'linea-canto';
  
  const content = typeof lineItem === 'string' ? lineItem : (lineItem.line || '');
  const sectionClass = lineItem.sC || '';
  const textColor = lineItem.color || '';
  
  if (sectionClass) {
    sectionClass.split(' ').forEach(cls => {
      if (cls) lineDiv.classList.add(cls);
    });
  }
  
  // Parsear texto y acordes
  const firstParenIndex = content.indexOf('(');
  let rawLetra = firstParenIndex !== -1 ? content.substring(0, firstParenIndex) : content;
  
  // Quitar coma final de letra si existe (pero conservar espacios iniciales para alineación)
  let cleanLetra = rawLetra;
  if (cleanLetra.endsWith(' ')) {
    cleanLetra = cleanLetra.replace(/\s+$/, '');
  }
  if (cleanLetra.endsWith(',')) {
    cleanLetra = cleanLetra.substring(0, cleanLetra.length - 1);
  }
  // Quitar comillas si envuelven todo
  if (cleanLetra.trim().startsWith('"') && cleanLetra.trim().endsWith('"')) {
    const trimmed = cleanLetra.trim();
    cleanLetra = trimmed.substring(1, trimmed.length - 1);
  }
  
  // Coleccionar acordes de base
  const baseChords = [];
  if (firstParenIndex !== -1) {
    const chordsString = content.substring(firstParenIndex);
    const noteMatches = chordsString.match(/\(([^)]+)\)/g);
    if (noteMatches) {
      noteMatches.forEach(noteBlock => {
        const parts = noteBlock.substring(1, noteBlock.length - 1).split(',');
        const noteName = parts[0] ? parts[0].trim() : '';
        const noteType = parts[1] ? parts[1].trim() : '';
        const rawPosition = parseFloat(parts[2]) || 0;
        if (noteName) {
          baseChords.push({ name: noteName, type: noteType, originalPos: Math.round(rawPosition) });
        }
      });
    }
  }
  
  // Resolver las posiciones reales (custom de usuario, default de JSON o escala mixta)
  const matches = resolveChordPositions(side, lineIdx, subLineIdx, baseChords, cleanLetra);

  // Rellenar dinámicamente con espacios en blanco al final si hay acordes que van fuera de la letra
  if (matches.length > 0) {
    const maxPos = matches.reduce((max, m) => Math.max(max, m.position), 0);
    if (maxPos >= cleanLetra.length) {
      cleanLetra = cleanLetra.padEnd(Math.ceil(maxPos) + 1, ' ');
    }
    // Si estamos en modo edición, agregar 10 espacios de cortesía extra al final de la línea para poder arrastrar nuevos acordes hacia afuera
    if (isChordEditMode) {
      cleanLetra = cleanLetra.padEnd(cleanLetra.length + 10, ' ');
    }
    // Asegurar que las posiciones estén acotadas al nuevo tamaño de cleanLetra
    matches.forEach(m => {
      m.position = Math.max(0, Math.min(m.position, cleanLetra.length - 1));
    });
  }
  
  // Si no hay acordes, renderizar simple
  if (matches.length === 0) {
    const letraSpan = document.createElement('span');
    letraSpan.className = 'letra';
    letraSpan.textContent = cleanLetra;
    if (textColor) letraSpan.style.color = textColor;
    lineDiv.appendChild(letraSpan);
    return lineDiv;
  }
  
  // RENDERIZADO MODO EDICIÓN (ARRASTRAR CON RATÓN / TOUCH)
  if (isChordEditMode) {
    lineDiv.style.position = 'relative';
    
    const charSpans = [];
    const textToRender = cleanLetra.length > 0 ? cleanLetra : ' ';
    
    for (let i = 0; i < textToRender.length; i++) {
      const charSpan = document.createElement('span');
      charSpan.className = 'char-pos';
      charSpan.dataset.idx = i;
      charSpan.textContent = textToRender[i];
      if (textColor) charSpan.style.color = textColor;
      lineDiv.appendChild(charSpan);
      charSpans.push(charSpan);
    }
    
    matches.forEach((match, matchIdx) => {
      const chordSpan = document.createElement('span');
      chordSpan.className = 'nota-posicionada edit-mode-active';
      chordSpan.dataset.originalNote = match.noteName;
      chordSpan.dataset.noteType = match.noteType;
      
      const transposedNote = transposeNote(match.noteName, currentKeyOffset);
      chordSpan.innerHTML = `${transposedNote}${match.noteType ? ' ' + match.noteType : ''}<span class="chord-pos-num">${match.position * 10}</span>`;
      
      // Posicionar inicialmente encima del caracter correspondiente (soportando medios pasos)
      const posIndex = Math.floor(match.position);
      const targetChar = charSpans[Math.min(posIndex, charSpans.length - 1)];
      if (targetChar) {
        requestAnimationFrame(() => {
          let leftVal = targetChar.offsetLeft;
          if (match.position % 1 !== 0) {
            const nextChar = charSpans[posIndex + 1];
            leftVal += nextChar ? (nextChar.offsetLeft - targetChar.offsetLeft) / 2 : targetChar.offsetWidth / 2;
          }
          chordSpan.style.left = leftVal + 'px';
        });
      }
      
      setupChordDrag(chordSpan, side, lineIdx, subLineIdx, matchIdx, charSpans, lineDiv);
      lineDiv.appendChild(chordSpan);
    });
    
    return lineDiv;
  }
  
  // RENDERIZADO MODO NORMAL (ESTÁNDAR)
  // Ordenar acordes por posición
  matches.sort((a, b) => a.position - b.position);
  
  // Renderizar letra con acordes insertados como wrappers inline
  let lastIndex = 0;
  matches.forEach(match => {
    const pos = match.position;
    const charIndex = Math.floor(pos);
    
    // Texto previo al acorde
    if (charIndex > lastIndex) {
      const textNode = document.createTextNode(cleanLetra.substring(lastIndex, charIndex));
      lineDiv.appendChild(textNode);
    }
    
    // Carácter en la posición (o espacio/vacío si ya fue consumido o fuera de rango)
    const char = (charIndex >= lastIndex) ? (cleanLetra[charIndex] || ' ') : '';
    
    // Crear wrapper span inline
    const wrapper = document.createElement('span');
    wrapper.className = 'chord-anchor-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    
    // Crear span de nota posicionada
    const chordSpan = document.createElement('span');
    chordSpan.className = 'nota-posicionada';
    chordSpan.dataset.originalNote = match.noteName;
    chordSpan.dataset.noteType = match.noteType;
    
    // Desplazar 50% a la derecha si es una posición intermedia (.5)
    if (pos % 1 !== 0) {
      chordSpan.style.left = '50%';
    }
    
    const transposedNote = transposeNote(match.noteName, currentKeyOffset);
    chordSpan.innerHTML = `${transposedNote}${match.noteType ? ' ' + match.noteType : ''}<span class="chord-pos-num">${pos * 10}</span>`;
    
    chordSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      // Calcular la nota transpuesta de forma dinámica al hacer click para evitar capturar una variable obsoleta del closure
      const liveTransposedNote = transposeNote(match.noteName, currentKeyOffset);
      showChordDiagram(liveTransposedNote, match.noteType);
    });
    
    wrapper.appendChild(chordSpan);
    wrapper.appendChild(document.createTextNode(char));
    
    lineDiv.appendChild(wrapper);
    if (char !== '') {
      lastIndex = charIndex + 1; // saltar el carácter que metimos al wrapper
    }
  });
  
  // Agregar resto del texto
  if (lastIndex < cleanLetra.length) {
    const remainingText = document.createTextNode(cleanLetra.substring(lastIndex));
    lineDiv.appendChild(remainingText);
  }
  
  // Aplicar color de texto si corresponde
  if (textColor) {
    lineDiv.style.color = textColor;
  }
  
  return lineDiv;
}

function resolveChordPositions(side, lineIdx, subLineIdx, baseChords, cleanLetra) {
  if (!currentCanto || !side) return baseChords.map(c => ({
    noteName: c.name,
    noteType: c.type,
    position: c.originalPos
  }));

  const customKey = `custom-positions-${currentCanto.id}`;
  const customStore = localStorage.getItem(customKey);
  let customPositions = null;
  if (customStore) {
    try {
      customPositions = JSON.parse(customStore);
    } catch (e) {
      console.error(e);
    }
  }

  const getLinePositions = (db) => {
    if (!db || !db[side]) return null;
    const item = db[side][lineIdx];
    if (!item) return null;
    if (subLineIdx !== undefined && subLineIdx >= 0) {
      if (item.type === 'collapsible-block' && item.lines) {
        return item.lines[subLineIdx];
      }
      return null;
    } else {
      if (item.type === 'collapsible-block') {
        return item.triggerLine;
      }
      return item;
    }
  };

  let savedLineChords = null;
  if (customPositions) {
    savedLineChords = getLinePositions(customPositions);
  }
  if (!savedLineChords && defaultChordPositions) {
    savedLineChords = getLinePositions(defaultChordPositions[currentCanto.id]);
  }

  return baseChords.map((chord, chordIdx) => {
    let pos = chord.originalPos;
    if (savedLineChords && savedLineChords[chordIdx] !== undefined) {
      pos = savedLineChords[chordIdx].pos;
    } else {
      if (cleanLetra.length > 0 && pos >= cleanLetra.length) {
        const scaled = Math.round(pos / 10);
        if (scaled < cleanLetra.length) {
          pos = scaled;
        } else {
          pos = cleanLetra.length - 1;
        }
      }
    }
    if (cleanLetra.length > 0) {
      pos = Math.max(0, pos);
    }
    return {
      noteName: chord.name,
      noteType: chord.type,
      position: pos
    };
  });
}

function updateChordEditUI() {
  const toggleChordEditBtn = document.getElementById('toggle-chord-edit-btn');
  const saveChordPositionsBtn = document.getElementById('save-chord-positions-btn');
  const toolbarChordEditBtn = document.getElementById('toolbar-chord-edit-btn');
  const toolbarSaveChordBtn = document.getElementById('toolbar-save-chord-btn');
  
  if (toggleChordEditBtn) {
    toggleChordEditBtn.textContent = isChordEditMode ? 'Edición Activa' : 'Bloqueados';
    toggleChordEditBtn.classList.toggle('active', isChordEditMode);
  }
  if (saveChordPositionsBtn) {
    saveChordPositionsBtn.style.display = isChordEditMode ? 'block' : 'none';
  }
  if (toolbarChordEditBtn) {
    toolbarChordEditBtn.classList.toggle('active-edit', isChordEditMode);
  }
  if (toolbarSaveChordBtn) {
    const songId = currentCanto ? currentCanto.id : '';
    const customKey = `custom-positions-${songId}`;
    const hasPendingChanges = !!localStorage.getItem(customKey);
    toolbarSaveChordBtn.style.display = (isChordEditMode && isAdmin && hasPendingChanges) ? 'inline-flex' : 'none';
  }
}

function toggleChordEditMode() {
  if (!isAdmin) {
    alert('Acceso denegado: Se requieren privilegios de Administrador para editar acordes.');
    return;
  }
  isChordEditMode = !isChordEditMode;
  updateChordEditUI();
  renderSongContent();
}

async function saveChordPositionsAction() {
  if (!isAdmin) {
    alert('Acceso denegado: Se requieren privilegios de Administrador.');
    return;
  }
  if (!currentCanto) return;
  const songId = currentCanto.id;
  const customKey = `custom-positions-${songId}`;
  const customStore = localStorage.getItem(customKey);
  
  if (!customStore) {
    alert('No hay cambios de posición pendientes para guardar en este canto.');
    return;
  }
  
  const saveChordPositionsBtn = document.getElementById('save-chord-positions-btn');
  const toolbarSaveChordBtn = document.getElementById('toolbar-save-chord-btn');
  
  try {
    const parsed = JSON.parse(customStore);
    if (saveChordPositionsBtn) {
      saveChordPositionsBtn.disabled = true;
      saveChordPositionsBtn.textContent = 'Guardando...';
    }
    if (toolbarSaveChordBtn) {
      toolbarSaveChordBtn.disabled = true;
      const iconSpan = toolbarSaveChordBtn.querySelector('span');
      if (iconSpan) iconSpan.textContent = 'sync';
    }
    
    let localSaved = false;
    
    // 1. Intentar guardado local en el archivo físico (Entorno de desarrollo)
    try {
      const response = await fetch('/api/save-positions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          songId: songId,
          lizq: parsed.lizq,
          lder: parsed.lder
        })
      });
      if (response.ok) {
        localSaved = true;
        console.log("💾 Guardado local en JSON exitoso.");
      }
    } catch (e) {
      console.warn("⚠️ Servidor local no disponible o producción. Guardando solo en Firebase Firestore.");
    }
    
    // 2. Guardar en Firebase Firestore (Posiciones globales de administrador)
    await publicarPosicionesGlobales(songId, parsed);
    
    // Actualizar base de datos en memoria y limpiar localStorage
    if (!defaultChordPositions) defaultChordPositions = {};
    defaultChordPositions[songId] = { lizq: parsed.lizq, lder: parsed.lder };
    localStorage.removeItem(customKey);
    
    if (localSaved) {
      alert('¡Posiciones guardadas en el archivo local y publicadas en Firebase Firestore!');
    } else {
      alert('¡Posiciones publicadas con éxito en Firebase Firestore!');
    }
  } catch (err) {
    console.error('Error al guardar posiciones:', err);
    alert('Error al intentar guardar las posiciones en la base de datos.');
  } finally {
    if (saveChordPositionsBtn) {
      saveChordPositionsBtn.disabled = false;
      saveChordPositionsBtn.textContent = 'Guardar en Archivo';
    }
    if (toolbarSaveChordBtn) {
      toolbarSaveChordBtn.disabled = false;
      const iconSpan = toolbarSaveChordBtn.querySelector('span');
      if (iconSpan) iconSpan.textContent = 'save';
    }
    updateChordEditUI();
  }
}

function setupChordDrag(chordSpan, side, lineIdx, subLineIdx, chordIdx, charSpans, lineDiv) {
  let isDragging = false;
  let currentTempPos = -1;
  let startX = 0;
  let startY = 0;

  chordSpan.addEventListener('pointerdown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    chordSpan.setPointerCapture(e.pointerId);
    chordSpan.classList.add('dragging');
    e.preventDefault();
  });

  chordSpan.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    
    // Construir todos los slots disponibles de 5 en 5 (i*10 e i*10 + 5)
    const slots = [];
    charSpans.forEach((charSpan, i) => {
      const nextCharSpan = charSpans[i + 1];
      const leftA = charSpan.offsetLeft;
      const leftB = leftA + (nextCharSpan ? (nextCharSpan.offsetLeft - leftA) / 2 : charSpan.offsetWidth / 2);
      
      const charRect = charSpan.getBoundingClientRect();
      const rectLeftA = charRect.left;
      const rectLeftB = rectLeftA + (nextCharSpan ? (charSpans[i+1].getBoundingClientRect().left - rectLeftA) / 2 : charRect.width / 2);
      
      slots.push({
        posValue: i * 10,
        screenLeft: leftA,
        rectLeft: rectLeftA
      });
      slots.push({
        posValue: i * 10 + 5,
        screenLeft: leftB,
        rectLeft: rectLeftB
      });
    });
    
    // Buscar el slot más cercano horizontalmente
    let closestSlot = null;
    let minDistance = Infinity;
    slots.forEach(slot => {
      const dist = Math.abs(e.clientX - slot.rectLeft);
      if (dist < minDistance) {
        minDistance = dist;
        closestSlot = slot;
      }
    });
    
    if (closestSlot) {
      currentTempPos = closestSlot.posValue / 10; // Puede ser decimal (.5)
      chordSpan.style.left = closestSlot.screenLeft + 'px';
      
      const posBadge = chordSpan.querySelector('.chord-pos-num');
      if (posBadge) {
        posBadge.textContent = closestSlot.posValue;
      }
    }
  });

  chordSpan.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    chordSpan.releasePointerCapture(e.pointerId);
    chordSpan.classList.remove('dragging');
    
    const deltaX = Math.abs(e.clientX - startX);
    const deltaY = Math.abs(e.clientY - startY);
    
    if (deltaX < 4 && deltaY < 4) {
      // Es un click/tap simple (no arrastrado): abre el modal para cambiar/editar este acorde
      const noteName = chordSpan.dataset.originalNote || '';
      const noteType = chordSpan.dataset.noteType || '';
      currentEditingChordInfo = { side, lineIdx, subLineIdx, chordIdx };
      showChordDiagram(noteName, noteType);
    } else if (currentTempPos !== -1) {
      saveChordPosition(side, lineIdx, subLineIdx, chordIdx, currentTempPos);
    } else {
      renderSongContent();
    }
  });
}

function saveChordPosition(side, lineIdx, subLineIdx, chordIdx, newPos) {
  if (!currentCanto) return;
  const songId = currentCanto.id;
  const customKey = `custom-positions-${songId}`;
  
  let customPositions = localStorage.getItem(customKey);
  if (customPositions) {
    customPositions = JSON.parse(customPositions);
  } else {
    const baseDb = defaultChordPositions && defaultChordPositions[songId] ? defaultChordPositions[songId] : null;
    customPositions = {
      lizq: baseDb && baseDb.lizq ? JSON.parse(JSON.stringify(baseDb.lizq)) : extractCurrentSongChords(currentCanto.lizq, 'lizq'),
      lder: baseDb && baseDb.lder ? JSON.parse(JSON.stringify(baseDb.lder)) : extractCurrentSongChords(currentCanto.lder, 'lder')
    };
  }
  
  const getLine = (db) => {
    if (!db || !db[side]) return null;
    const item = db[side][lineIdx];
    if (!item) return null;
    if (subLineIdx !== undefined && subLineIdx >= 0) {
      if (item.type === 'collapsible-block' && item.lines) {
        return item.lines[subLineIdx];
      }
      return null;
    } else {
      if (item.type === 'collapsible-block') {
        return item.triggerLine;
      }
      return item;
    }
  };

  const lineChords = getLine(customPositions);
  if (lineChords && lineChords[chordIdx]) {
    lineChords[chordIdx].pos = newPos;
    localStorage.setItem(customKey, JSON.stringify(customPositions));
    if (typeof guardarPosicionesEnNube === 'function') {
      guardarPosicionesEnNube(songId, customPositions);
    }
    renderSongContent();
  }
}

function saveSingleChordEdit(chosenNote, chosenType) {
  if (!currentCanto || !currentEditingChordInfo) return;
  const { side, lineIdx, subLineIdx, chordIdx } = currentEditingChordInfo;
  
  const songId = currentCanto.id;
  const customKey = `custom-positions-${songId}`;
  
  let customPositions = localStorage.getItem(customKey);
  if (customPositions) {
    customPositions = JSON.parse(customPositions);
  } else {
    const baseDb = defaultChordPositions && defaultChordPositions[songId] ? defaultChordPositions[songId] : null;
    customPositions = {
      lizq: baseDb && baseDb.lizq ? JSON.parse(JSON.stringify(baseDb.lizq)) : extractCurrentSongChords(currentCanto.lizq, 'lizq'),
      lder: baseDb && baseDb.lder ? JSON.parse(JSON.stringify(baseDb.lder)) : extractCurrentSongChords(currentCanto.lder, 'lder')
    };
  }
  
  const getLine = (db) => {
    if (!db || !db[side]) return null;
    const item = db[side][lineIdx];
    if (!item) return null;
    if (subLineIdx !== undefined && subLineIdx >= 0) {
      if (item.type === 'collapsible-block' && item.lines) {
        return item.lines[subLineIdx];
      }
      return null;
    } else {
      if (item.type === 'collapsible-block') {
        return item.triggerLine;
      }
      return item;
    }
  };

  const lineChords = getLine(customPositions);
  if (lineChords && lineChords[chordIdx]) {
    if (chosenNote !== undefined) {
      const unTransposedNote = transposeNote(chosenNote, -currentKeyOffset);
      lineChords[chordIdx].name = unTransposedNote;
    }
    if (chosenType !== undefined) lineChords[chordIdx].type = chosenType;
    localStorage.setItem(customKey, JSON.stringify(customPositions));
    if (typeof guardarPosicionesEnNube === 'function') {
      guardarPosicionesEnNube(songId, customPositions);
    }
    renderSongContent();
  }
  currentEditingChordInfo = null;
}

function extractCurrentSongChords(section, side) {
  if (!section) return [];
  return section.map((item, lineIdx) => {
    if (item.type === 'collapsible-block') {
      return {
        type: 'collapsible-block',
        id: item.id,
        triggerLine: extractChordsFromLineItem(item.triggerLine, side, lineIdx, -1),
        lines: item.lines.map((line, subLineIdx) => extractChordsFromLineItem(line, side, lineIdx, subLineIdx))
      };
    } else {
      return extractChordsFromLineItem(item, side, lineIdx);
    }
  });
}

function extractChordsFromLineItem(lineItem, side, lineIdx, subLineIdx) {
  if (!lineItem) return [];
  const content = typeof lineItem === 'string' ? lineItem : (lineItem.line || '');
  const firstParenIndex = content.indexOf('(');
  let cleanLetra = firstParenIndex !== -1 ? content.substring(0, firstParenIndex) : content;
  if (cleanLetra.endsWith(' ')) cleanLetra = cleanLetra.replace(/\s+$/, '');
  if (cleanLetra.endsWith(',')) cleanLetra = cleanLetra.substring(0, cleanLetra.length - 1);
  if (cleanLetra.trim().startsWith('"') && cleanLetra.trim().endsWith('"')) {
    const trimmed = cleanLetra.trim();
    cleanLetra = trimmed.substring(1, trimmed.length - 1);
  }

  const chords = [];
  if (firstParenIndex !== -1) {
    const chordsString = content.substring(firstParenIndex);
    const noteMatches = chordsString.match(/\(([^)]+)\)/g);
    if (noteMatches) {
      noteMatches.forEach(noteBlock => {
        const parts = noteBlock.substring(1, noteBlock.length - 1).split(',');
        const noteName = parts[0] ? parts[0].trim() : '';
        const noteType = parts[1] ? parts[1].trim() : '';
        const rawPosition = parseFloat(parts[2]) || 0;
        if (noteName) {
          let pos = Math.round(rawPosition);
          if (cleanLetra.length > 0 && pos >= cleanLetra.length) {
            const scaled = Math.round(pos / 10);
            if (scaled < cleanLetra.length) {
              pos = scaled;
            } else {
              pos = cleanLetra.length - 1;
            }
          }
          chords.push({ name: noteName, type: noteType, pos: pos });
        }
      });
    }
  }
  return chords;
}

function getCleanLyrics(side, lineIdx, subLineIdx) {
  if (!currentCanto) return '';
  const section = currentCanto[side];
  if (!section) return '';
  const item = section[lineIdx];
  if (!item) return '';
  
  let lineItem = item;
  if (subLineIdx !== undefined && subLineIdx >= 0) {
    if (item.type === 'collapsible-block' && item.lines) {
      lineItem = item.lines[subLineIdx];
    } else {
      return '';
    }
  } else if (item.type === 'collapsible-block') {
    lineItem = item.triggerLine;
  }
  
  const content = typeof lineItem === 'string' ? lineItem : (lineItem.line || '');
  const firstParenIndex = content.indexOf('(');
  let cleanLetra = firstParenIndex !== -1 ? content.substring(0, firstParenIndex) : content;
  if (cleanLetra.endsWith(' ')) cleanLetra = cleanLetra.replace(/\s+$/, '');
  if (cleanLetra.endsWith(',')) cleanLetra = cleanLetra.substring(0, cleanLetra.length - 1);
  if (cleanLetra.trim().startsWith('"') && cleanLetra.trim().endsWith('"')) {
    const trimmed = cleanLetra.trim();
    cleanLetra = trimmed.substring(1, trimmed.length - 1);
  }
  return cleanLetra;
}

// --- Transposición cromática ---
function updateChordPanel() {
  if (!currentCanto) return;

  const songId = currentCanto.id;
  const songFromData = songs.find(s => s.id === songId);
  let originalChordStr = 'La';
  let originalCapoStr = '';
  if (songFromData) {
    originalChordStr = songFromData.acorde || 'La';
    originalCapoStr = songFromData.cejilla || '';
  } else {
    originalChordStr = currentCanto.acorde || currentCanto.nCan || 'La';
    originalCapoStr = currentCanto.cejilla || '';
  }

  const parsed = parseChord(originalChordStr);
  const baseOriginal = parsed.noteName;
  const suffix = parsed.typeSuffix;
  
  const baseTransposed = transposeNote(baseOriginal, currentKeyOffset);
  
  const fullOriginal = baseOriginal + (suffix ? (suffix.startsWith(' ') ? '' : ' ') + suffix : '');
  const fullTransposed = baseTransposed + (suffix ? (suffix.startsWith(' ') ? '' : ' ') + suffix : '');
  
  // 1. Acorde text: "Do 7 / Re 7" o solo "Do 7"
  let chordText = fullOriginal;
  if (currentKeyOffset !== 0) {
    chordText = `${fullOriginal} / ${fullTransposed}`;
  }

  // 2. Cejilla logic
  const originalCapo = parseInt(originalCapoStr) || 0;
  const userCapo = parseInt(capoSelect.value) || 0;

  // Let's build the HTML content
  const buildPanelHTML = (isCompact) => {
    const iconSize = isCompact ? '1.1rem' : '1.3rem';
    const imgHeight = isCompact ? '12px' : '16px';
    const styleString = isCompact ? 'filter: brightness(0) invert(1);' : '';

    let capoHTML = '';
    if (originalCapo > 0) {
      capoHTML += `<img src="ima/cejilla.png" alt="Cejilla" class="cejilla-icon-img" style="height: ${imgHeight}; width: auto; margin-left: 2px; vertical-align: middle; ${styleString}"> `;
      capoHTML += `<span class="capo-badge-text" style="vertical-align: middle;">${originalCapo}</span>`;
    }
    
    capoHTML += `<span class="capo-badge-text" style="opacity: 0.7; margin: 0 2px; vertical-align: middle;">/</span>`;
    
    if (userCapo !== originalCapo) {
      capoHTML += `<span class="capo-badge-text" style="vertical-align: middle;">${userCapo}</span>`;
    }

    return `
      <span class="material-symbols-outlined tone-music-note" style="font-size: ${iconSize}; vertical-align: middle;">music_note</span>
      <span class="key-badge-text" style="font-weight: 700; vertical-align: middle;">${chordText}</span>
      <span class="capo-badge-container capo-badge-text" style="display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; vertical-align: middle;">
        ${capoHTML}
      </span>
    `;
  };

  // Update desktop panel
  const desktopTrigger = document.getElementById('tone-capo-trigger');
  if (desktopTrigger) {
    desktopTrigger.innerHTML = buildPanelHTML(false);
  }

  // Update mobile/tablet panel
  const mobileTrigger = document.getElementById('tone-dropdown-trigger');
  if (mobileTrigger) {
    mobileTrigger.innerHTML = buildPanelHTML(true);
  }
}

// --- Control del título pegajoso en la barra superior al hacer scroll ---
let headerTitleObserver = null;

function checkTitleVisibilityOnScroll() {
  const stickyTitleContainer = document.getElementById('toolbar-sticky-title');
  if (!stickyTitleContainer) return;
  
  const mainTitleElements = document.querySelectorAll('.canto-header-title, .canto-title');
  if (!mainTitleElements || mainTitleElements.length === 0) {
    stickyTitleContainer.style.display = 'none';
    return;
  }

  let isAnyVisible = false;
  mainTitleElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    // El título H1 sigue en pantalla si su parte inferior no ha superado el header superior (~50px)
    if (rect.bottom > 50 && rect.top < window.innerHeight) {
      isAnyVisible = true;
    }
  });

  if (isAnyVisible) {
    stickyTitleContainer.style.display = 'none';
  } else {
    stickyTitleContainer.style.display = 'flex';
  }
}

function setupHeaderTitleObserver() {
  const stickyTitleContainer = document.getElementById('toolbar-sticky-title');
  const stickyTitleText = document.getElementById('toolbar-sticky-title-text');
  
  if (!stickyTitleContainer) return;

  if (currentCanto) {
    const titleText = currentCanto.title || currentCanto.tt || '';
    if (stickyTitleText) {
      stickyTitleText.textContent = titleText;
    }
  }

  if (headerTitleObserver) {
    headerTitleObserver.disconnect();
  }

  const mainTitleElements = document.querySelectorAll('.canto-header-title, .canto-title');

  if (!mainTitleElements || mainTitleElements.length === 0) {
    stickyTitleContainer.style.display = 'none';
    return;
  }

  headerTitleObserver = new IntersectionObserver(() => {
    checkTitleVisibilityOnScroll();
  }, {
    threshold: [0, 0.1, 0.5, 1.0]
  });

  mainTitleElements.forEach(el => headerTitleObserver.observe(el));
  
  window.removeEventListener('scroll', checkTitleVisibilityOnScroll);
  window.addEventListener('scroll', checkTitleVisibilityOnScroll, { passive: true });
  checkTitleVisibilityOnScroll();
}

function updateTransposeBadge() {
  const transposedKey = transposeNote(originalSongKey, currentKeyOffset);
  const activeKeyBadge = document.getElementById('key-badge');
  if (activeKeyBadge) {
    activeKeyBadge.textContent = transposedKey;
  }
  
  updateChordPanel();
}

function guardarHistorialCanto() {
  console.log("💾 [guardarHistorialCanto] Inicio del proceso para:", currentCanto ? currentCanto.id : null);
  if (!currentCanto) {
    console.warn("⚠️ [guardarHistorialCanto] No hay currentCanto activo.");
    return;
  }
  const user = getCurrentUser();
  if (!user) {
    console.warn("⚠️ [guardarHistorialCanto] No hay usuario autenticado.");
    return;
  }
  
  const cejillaValue = capoSelect ? (parseInt(capoSelect.value) || 0) : 0;
  console.log(`💾 [guardarHistorialCanto] Enviando a Firebase: acordeOffset=${currentKeyOffset}, cejillaValue=${cejillaValue}`);
  
  if (typeof window.guardarHistorialCantoEnNube === 'function') {
    window.guardarHistorialCantoEnNube(currentCanto.id, currentKeyOffset, cejillaValue);
  } else {
    console.error("❌ [guardarHistorialCanto] window.guardarHistorialCantoEnNube no es una función.");
  }
}

function shiftKey(semitones) {
  currentKeyOffset = (currentKeyOffset + semitones) % 12;
  updateTransposeBadge();
  
  // Actualizar todos los acordes en pantalla sin re-renderizar todo
  document.querySelectorAll('.nota-posicionada').forEach(span => {
    const originalNote = span.dataset.originalNote;
    const noteType = span.dataset.noteType;
    const transposedNote = transposeNote(originalNote, currentKeyOffset);
    span.textContent = transposedNote + (noteType ? ' ' : '') + noteType;
  });
  
  if (currentCanto) {
    guardarHistorialCanto();
  }
}

// --- Diagramas de Acordes ---
function updateModalChordDiagram() {
  const noteName = selectedModalNote;
  const noteType = selectedModalType;
  
  // Actualizar título según si es transporte o edición
  const titleEl = document.getElementById('chord-modal-title');
  if (titleEl) {
    if (isChordEditMode && currentEditingChordInfo) {
      titleEl.textContent = "Editar Acorde";
    } else {
      titleEl.textContent = "Transportar Acorde";
    }
  }
  
  // Actualizar acorde canto, cejilla original y acorde cantor en el modal
  const modalCantoOriginalChord = document.getElementById('modal-canto-original-chord');
  const modalCantoOriginalCapo = document.getElementById('modal-canto-original-capo');
  const modalCantorCurrentChord = document.getElementById('modal-cantor-current-chord');
  
  if (modalCantoOriginalChord) {
    modalCantoOriginalChord.textContent = `${originalSongKey}${originalSongTypeSuffix ? ' ' : ''}${originalSongTypeSuffix}`;
  }
  if (modalCantoOriginalCapo && currentCanto) {
    let capoStr = '';
    const songFromData = songs.find(s => s.id === currentCanto.id);
    if (songFromData) {
      capoStr = songFromData.cejilla || '';
    } else {
      capoStr = currentCanto.cejilla || '';
    }
    const capoNum = parseInt(capoStr) || 0;
    modalCantoOriginalCapo.textContent = capoNum > 0 ? `${capoNum}º traste` : 'Sin cejilla';
  }
  if (modalCantorCurrentChord) {
    const currentTransposedChord = transposeNote(originalSongKey, currentKeyOffset);
    modalCantorCurrentChord.textContent = `${currentTransposedChord}${originalSongTypeSuffix ? ' ' : ''}${originalSongTypeSuffix}`;
  }
  
  // Resaltar botón de Nota
  modalChordNotePicker.querySelectorAll('.btn-picker').forEach(btn => {
    const btnNote = btn.dataset.note;
    btn.classList.toggle('active', btnNote.toLowerCase() === noteName.toLowerCase());
  });
  
  // Resaltar botón de Variación
  if (modalChordTypePicker) {
    modalChordTypePicker.querySelectorAll('.btn-type-picker').forEach(btn => {
      const btnType = btn.dataset.type || '';
      btn.classList.toggle('active', btnType.toLowerCase() === (noteType || '').toLowerCase());
    });
  }
  
  // Actualizar textos informativos en el modal
  const subtitle = document.getElementById('chord-modal-subtitle');
  if (subtitle) {
    subtitle.innerHTML = `Selecciona el nuevo acorde para reemplazar a <strong>[${noteName}${noteType ? ' ' : ''}${noteType}]</strong> y transportar todo el canto completo:`;
  }
  
  const label = document.getElementById('chord-picker-label');
  if (label) {
    label.innerHTML = `Cambiar acorde <strong>[${noteName}${noteType ? ' ' : ''}${noteType}]</strong> a:`;
  }
  
  const diagTitle = document.getElementById('chord-diagram-title');
  if (diagTitle) {
    diagTitle.innerHTML = `Digitación del acorde <strong>${noteName}${noteType ? ' ' : ''}${noteType}</strong>:`;
  }
  
  // Mapear el acorde a su correspondiente nombre de imagen
  const normalizedBase = noteName.toLowerCase()
    .replace('do#', 'dos')
    .replace('re#', 'res')
    .replace('fa#', 'fas')
    .replace('sol#', 'sols')
    .replace('si♭', 'sib')
    .replace('sib', 'sib');
  
  let typeSuffix = noteType.toLowerCase()
    .replace('maj7', 'maj7')
    .replace('7', '7')
    .replace('m', 'm');
  
  let filename = `${normalizedBase}${typeSuffix}.jpg`;
  
  chordDiagramImg.src = `ima/${filename}`;
  chordDiagramImg.onerror = () => {
    // Fallback a acorde base
    chordDiagramImg.src = `ima/${normalizedBase}.jpg`;
    chordDiagramImg.onerror = () => {
      // Fallback secundario si nada carga
      chordDiagramImg.src = 'img/ico.ico';
    };
  };
}

function showChordDiagram(noteName, noteType) {
  const parsed = parseChord(noteName);
  selectedModalNote = parsed.noteName;
  selectedModalType = noteType || parsed.typeSuffix || '';
  
  updateModalChordDiagram();
  chordModal.style.display = 'flex';
}

// --- Auto-scroll ---
function toggleAutoScroll() {
  if (isScrollActive) {
    stopAutoScroll();
  } else {
    startAutoScroll();
  }
}

function startAutoScroll() {
  isScrollActive = true;
  scrollPlayBtn.querySelector('span').textContent = 'stop';
  scrollPlayBtn.classList.add('active');
  
  scrollIntervalId = setInterval(() => {
    window.scrollBy({ top: scrollStepPx, behavior: 'auto' });
    // Detener al llegar al final de la página
    if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight) {
      stopAutoScroll();
    }
  }, scrollIntervalMs);
}

function stopAutoScroll() {
  isScrollActive = false;
  if (scrollPlayBtn) {
    const span = scrollPlayBtn.querySelector('span');
    if (span) span.textContent = 'south';
    scrollPlayBtn.classList.remove('active');
  }
  if (scrollIntervalId) {
    clearInterval(scrollIntervalId);
    scrollIntervalId = null;
  }
}

function getStageColor(stageName) {
  const clean = (stageName || '').toLowerCase();
  if (clean.includes('pre')) return getComputedStyle(document.body).getPropertyValue('--color-pre').trim() || '#6c757d';
  if (clean.includes('cate')) return getComputedStyle(document.body).getPropertyValue('--color-cate').trim() || '#2196f3';
  if (clean.includes('ele')) return getComputedStyle(document.body).getPropertyValue('--color-ele').trim() || '#8bc34a';
  if (clean.includes('lit')) return getComputedStyle(document.body).getPropertyValue('--color-lit').trim() || '#FFEB3B';
  if (clean.includes('cat') || clean.includes('can') || clean.includes('ot')) return '#6f42c1';
  return '#20c997';
}

// --- Buscador y Renderizado de Lista ---
function renderSongsList(songsList) {
  window.renderSongsList = renderSongsList;
  activeSongsPlaylist = songsList;
  if (!songsGrid) return;
  songsGrid.innerHTML = '';
  
  if (songsList.length === 0) {
    songsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">No se encontraron cantos con los filtros actuales.</div>`;
    return;
  }
  
  songsList.forEach(song => {
    const card = document.createElement('a');
    card.className = 'song-card';
    if (currentCanto && song.id === currentCanto.id) {
      card.classList.add('active');
    }
    card.href = `#canto=${song.id}`;
    
    // Obtener color/estilo de la etapa
    let stageClass = 'badge-otros';
    const cleanStage = song.stage.toLowerCase();
    if (cleanStage.includes('pre')) stageClass = 'badge-precatecumenado';
    else if (cleanStage.includes('cate')) stageClass = 'badge-catecumenado';
    else if (cleanStage.includes('ele')) stageClass = 'badge-eleccion';
    else if (cleanStage.includes('lit')) stageClass = 'badge-liturgia';
    else if (cleanStage.includes('cat')) stageClass = 'badge-catolicos';
    
    // Asignar el color de etapa como variable de CSS
    card.style.setProperty('--stage-color', getStageColor(song.stage));
    
    card.innerHTML = `
      <div class="song-card-number">
        <span>Canto #${song.dbno || 'S/N'}</span>
        <span class="badge ${stageClass}">${song.stage}</span>
      </div>
      <div class="song-card-title">${song.title}</div>
      <div class="song-card-subtitle">${song.subtitle}</div>
      <div class="song-card-badges">
        ${song.hasAudio ? '<span class="badge badge-audio">Audio</span>' : ''}
        ${song.cejilla ? `<span class="badge badge-capo">Cejilla: ${song.cejilla}</span>` : ''}
        ${song.acorde ? `<span class="badge badge-capo">${song.acorde}</span>` : ''}
      </div>
    `;
    
    songsGrid.appendChild(card);
  });
}

async function renderCatequesis() {
  songsGrid.innerHTML = '';
  
  if (!catequesisData) {
    songsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">Cargando catequesis...</div>`;
    try {
      const response = await fetch('data/catequesis.json');
      catequesisData = await response.json();
    } catch (e) {
      console.error('Error al cargar catequesis:', e);
      songsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: red;">No se pudo cargar la catequesis.</div>`;
      return;
    }
  }
  
  songsGrid.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'catequesis-container';
  
  catequesisData.forEach(item => {
    const card = document.createElement('div');
    card.className = 'catequesis-card';
    
    const htmlContent = item.catequesis || '';
    const author = item.autor ? `<p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;"><b>Autor:</b> ${item.autor} | <b>Fuente:</b> ${item.fuente_biblica || 'Litúrgica'}</p>` : '';
    
    card.innerHTML = `
      <h2>${item.titulo || item.title || 'Sin Título'}</h2>
      ${author}
      <div class="catequesis-body">${htmlContent}</div>
    `;
    container.appendChild(card);
  });
  
  songsGrid.appendChild(container);
}

async function handleSearchAndFilters() {
  const searchBox = document.querySelector('.search-box-container');
  const searchRow = document.querySelector('.search-and-settings-row');
  const filtersToggleSec = document.querySelector('.filters-toggle-section');

  if (currentBook === 'catequesis') {
    if (searchBox) searchBox.style.display = 'none';
    if (searchRow) searchRow.style.display = 'none';
    if (filtersToggleSec) filtersToggleSec.style.display = 'none';
    filtersPanel.style.display = 'none';
    if (toggleFiltersBtn) toggleFiltersBtn.classList.remove('active');
    
    await renderCatequesis();
    return;
  }
  
  if (searchBox) searchBox.style.display = 'flex';
  if (searchRow) searchRow.style.display = 'flex';
  if (filtersToggleSec) filtersToggleSec.style.display = 'block';
  
  let sourceList = allSongs;
  if (currentBook === 'favoritos') {
    sourceList = allSongs.filter(song => favorites.has(song.id));
  } else {
    sourceList = allSongs.filter(song => (song.sourceBook || 'resucito') === currentBook);
  }
  
  const query = searchInput ? searchInput.value : '';
  filteredSongs = searchSongs(sourceList, query, activeStage, activeMoments);
  window.filteredSongs = filteredSongs;
  
  // Garantizar orden alfabético estricto por la primera letra real (ignorando símbolos iniciales como ¡ o ¿)
  sortSongsAlphabetically(filteredSongs);
  
  renderSongsList(filteredSongs);
}

// --- Auxiliares de Navegación con Transición ---
function navigateToSong(direction, isSwipe = false) {
  if (!currentCanto) return;
  const targetBook = (currentCanto && currentCanto.sourceBook) ? currentCanto.sourceBook : currentBook;
  const currentBookSongs = allSongs.filter(s => (s.sourceBook || 'resucito') === targetBook);
  
  const currentIndex = activeSongsPlaylist.findIndex(s => s.id === currentCanto.id);
  const playListToUse = currentIndex !== -1 ? activeSongsPlaylist : currentBookSongs;
  const currentIdxToUse = currentIndex !== -1 ? currentIndex : currentBookSongs.findIndex(s => s.id === currentCanto.id);
  
  if (direction === 'prev' && currentIdxToUse > 0) {
    const prevSong = playListToUse[currentIdxToUse - 1];
    transitionToSong(prevSong.id, 'prev', isSwipe);
  } else if (direction === 'next' && currentIdxToUse !== -1 && currentIdxToUse < playListToUse.length - 1) {
    const nextSong = playListToUse[currentIdxToUse + 1];
    transitionToSong(nextSong.id, 'next', isSwipe);
  }
}

function transitionToSong(nextSongId, direction, isSwipe = false) {
  const sliderContainer = document.getElementById('canto-slider-container');
  if (!sliderContainer) {
    window.location.hash = `#canto=${nextSongId}`;
    return;
  }
  
  stopAutoScroll();
  
  if (isSwipe) {
    // Si viene de swipe, la animación ya está en progreso o completada, actualizamos directamente el hash
    window.location.hash = `#canto=${nextSongId}`;
  } else {
    // Si viene de clic en botón, cargamos primero la vista previa en el contenedor correspondiente
    const slidePrev = document.getElementById('canto-slide-prev');
    const slideNext = document.getElementById('canto-slide-next');
    const targetSlide = direction === 'next' ? slideNext : slidePrev;
    
    // Mostramos la cabecera básica de inmediato
    const nextSongMeta = allSongs.find(s => s.id === nextSongId);
    if (nextSongMeta && targetSlide) {
      targetSlide.innerHTML = generarHtmlCantoBasico(nextSongMeta);
    }
    
    // Cargamos completo y animamos la transición del slider
    obtenerCantoCompleto(nextSongId).then(fullSong => {
      if (fullSong && targetSlide) {
        targetSlide.innerHTML = generarHtmlCanto(fullSong);
      }
      
      // Animamos el slider para mostrar el slide adyacente
      sliderContainer.style.transition = 'transform 0.25s ease';
      const targetTransform = direction === 'next' 
        ? 'translate3d(calc(-200% / 3 - 26.667px), 0, 0)' 
        : 'translate3d(0px, 0, 0)';
      sliderContainer.style.transform = targetTransform;
      
      setTimeout(() => {
        window.location.hash = `#canto=${nextSongId}`;
      }, 250);
    });
  }
}

// --- Obtener datos completos de canción desde caché o red ---
async function obtenerCantoCompleto(songId) {
  if (loadedSongsCache[songId]) {
    return loadedSongsCache[songId];
  }
  try {
    const folder = songId.startsWith('aet') ? 'data/songs-ae' : 'data/songs';
    const isOffline = localStorage.getItem('cantoEquipoOffline') === 'true';
    const response = await fetch(`${folder}/${songId}.json?offline=${isOffline}`);
    if (response.ok) {
      const songData = await response.json();
      loadedSongsCache[songId] = songData;
      return songData;
    }
  } catch (e) {
    console.error(`Error al cargar datos completos del canto ${songId}:`, e);
  }
  return null;
}

// --- Generador de HTML Básico como Marcador de Posición ---
function generarHtmlCantoBasico(song) {
  if (!song) return '';
  const stage = (song.catCanto || '').toUpperCase();
  const title = (song.title || song.tt || '').toUpperCase();
  const subtitle = song.subtitle || '';
  
  return `
    <div class="canto-header-block" style="border-bottom-color: var(--stage-color-${song.catCanto}, var(--panel-border));">
      <div class="canto-header-left">
        <img src="img/christ.png" alt="Cristo" class="canto-header-img">
      </div>
      <div class="canto-header-center">
        <div class="canto-header-stage">${stage}</div>
        <h1 class="canto-header-title">${title}</h1>
        <div class="canto-header-subtitle">${subtitle}</div>
      </div>
      <div class="canto-header-right"></div>
    </div>
    <div class="canto-columns-container">
      <div class="canto-column" style="text-align: center; color: var(--text-muted); font-style: italic; padding-top: 60px;">
        Cargando acordes y letra...
      </div>
    </div>
  `;
}

// --- Generador de HTML Estático para las diapositivas del Carrusel ---
function generarHtmlCanto(song) {
  if (!song) return '';
  const stage = (song.catCanto || '').toUpperCase();
  const title = (song.title || song.tt || '').toUpperCase();
  const subtitle = song.subtitle || '';
  
  // Recuperar offset de tono de esta canción en localStorage
  const savedKeyOffset = parseInt(localStorage.getItem(`keyOffset_${song.id}`)) || 0;
  
  let leftHtml = '';
  if (song.lizq) {
    leftHtml = song.lizq.map((lineItem, idx) => generarHtmlLinea(song, lineItem, 'lizq', idx, savedKeyOffset)).join('');
  }
  
  let rightHtml = '';
  if (song.lder && song.lder.length > 0) {
    rightHtml = song.lder.map((lineItem, idx) => generarHtmlLinea(song, lineItem, 'lder', idx, savedKeyOffset)).join('');
  }
  
  const rightColStyle = rightHtml ? '' : 'display: none;';
  
  return `
    <div class="canto-header-block" style="border-bottom-color: var(--stage-color-${song.catCanto}, var(--panel-border));">
      <div class="canto-header-left">
        <img src="img/christ.png" alt="Cristo" class="canto-header-img">
      </div>
      <div class="canto-header-center">
        <div class="canto-header-stage">${stage}</div>
        <h1 class="canto-header-title">${title}</h1>
        <div class="canto-header-subtitle">${subtitle}</div>
      </div>
      <div class="canto-header-right"></div>
    </div>
    <div class="canto-columns-container">
      <div class="canto-column">${leftHtml}</div>
      <div class="canto-column" style="${rightColStyle}">${rightHtml}</div>
    </div>
  `;
}

function generarHtmlLinea(song, lineItem, side, lineIdx, keyOffset) {
  if (lineItem.type === "collapsible-block") {
    const triggerHtml = generarHtmlLineaItem(song, lineItem.triggerLine, side, lineIdx, -1, keyOffset, 'collapsible-trigger ' + (lineItem.sC || ''));
    const subLinesHtml = lineItem.lines.map((l, subIdx) => 
      generarHtmlLineaItem(song, l, side, lineIdx, subIdx, keyOffset)
    ).join('');
    
    const isExpanded = allAsambleaExpanded || lineItem.initialState === 'expanded';
    const displayStyle = isExpanded ? 'block' : 'none';
    
    return `
      <div class="collapsible-block-container">
        <div class="collapsible-lines-wrapper">
          ${triggerHtml}
          <div class="collapsible-content" style="display: ${displayStyle};">
            ${subLinesHtml}
          </div>
        </div>
        <div class="collapsible-bis-side">
          <div class="bis-line"></div>
          <div class="bis-text">BIS A.</div>
        </div>
      </div>
    `;
  } else if (lineItem.img) {
    return `<div class="linea-imagen"><img src="${lineItem.img}" alt="Diagrama musical"></div>`;
  } else {
    return generarHtmlLineaItem(song, lineItem, side, lineIdx, undefined, keyOffset);
  }
}

function generarHtmlLineaItem(song, lineItem, side, lineIdx, subLineIdx, keyOffset, extraClasses = '') {
  const content = typeof lineItem === 'string' ? lineItem : (lineItem.line || '');
  const sectionClass = ((lineItem.sC || '') + ' ' + extraClasses).trim();
  const textColor = lineItem.color || '';
  
  const firstParenIndex = content.indexOf('(');
  let rawLetra = firstParenIndex !== -1 ? content.substring(0, firstParenIndex) : content;
  
  let cleanLetra = rawLetra;
  if (cleanLetra.endsWith(' ')) {
    cleanLetra = cleanLetra.replace(/\s+$/, '');
  }
  if (cleanLetra.endsWith(',')) {
    cleanLetra = cleanLetra.substring(0, cleanLetra.length - 1);
  }
  if (cleanLetra.trim().startsWith('"') && cleanLetra.trim().endsWith('"')) {
    const trimmed = cleanLetra.trim();
    cleanLetra = trimmed.substring(1, trimmed.length - 1);
  }
  
  const baseChords = [];
  if (firstParenIndex !== -1) {
    const chordsString = content.substring(firstParenIndex);
    const noteMatches = chordsString.match(/\(([^)]+)\)/g);
    if (noteMatches) {
      noteMatches.forEach(noteBlock => {
        const parts = noteBlock.substring(1, noteBlock.length - 1).split(',');
        const noteName = parts[0] ? parts[0].trim() : '';
        const noteType = parts[1] ? parts[1].trim() : '';
        const rawPosition = parseFloat(parts[2]) || 0;
        if (noteName) {
          baseChords.push({ name: noteName, type: noteType, originalPos: Math.round(rawPosition) });
        }
      });
    }
  }
  
  const matches = resolveChordPositionsForPreview(song, side, lineIdx, subLineIdx, baseChords);
  
  if (matches.length === 0) {
    const styleAttr = textColor ? `style="color: ${textColor};"` : '';
    return `<div class="linea-canto ${sectionClass}"><span class="letra" ${styleAttr}>${cleanLetra}</span></div>`;
  }
  
  let spansHtml = '';
  let lastPos = 0;
  
  matches.forEach(chord => {
    const pos = Math.min(chord.position, cleanLetra.length);
    const charIndex = Math.floor(pos);
    if (charIndex > lastPos) {
      spansHtml += `<span>${cleanLetra.substring(lastPos, charIndex)}</span>`;
    }
    
    const transposedNote = transposeNote(chord.noteName, keyOffset);
    const chordText = transposedNote + chord.noteType;
    
    const leftStyle = (pos % 1 !== 0) ? 'left: 50%;' : 'left: 0;';
    
    spansHtml += `<span class="chord-anchor-wrapper" style="position: relative; display: inline-block;">
      <span class="acorde-canto" style="position: absolute; top: -1.35rem; ${leftStyle} font-family: sans-serif; font-weight: bold; color: var(--chord-color);">${chordText}</span>
    </span>`;
    
    if (charIndex >= lastPos) {
      lastPos = charIndex;
    }
  });
  
  if (lastPos < cleanLetra.length) {
    spansHtml += `<span>${cleanLetra.substring(lastPos)}</span>`;
  }
  
  const styleAttr = textColor ? `style="color: ${textColor};"` : '';
  return `<div class="linea-canto ${sectionClass}" ${styleAttr}>${spansHtml}</div>`;
}

function resolveChordPositionsForPreview(song, side, lineIdx, subLineIdx, baseChords) {
  if (!song || !side) return baseChords.map(c => ({
    noteName: c.name,
    noteType: c.type,
    position: c.originalPos
  }));

  const customKey = `custom-positions-${song.id}`;
  const customStore = localStorage.getItem(customKey);
  let customPositions = null;
  if (customStore) {
    try {
      customPositions = JSON.parse(customStore);
    } catch (e) {
      console.error(e);
    }
  }

  const getLinePositions = (db) => {
    if (!db || !db[side]) return null;
    const item = db[side][lineIdx];
    if (!item) return null;
    if (subLineIdx !== undefined && subLineIdx !== -1) {
      if (item.type === "collapsible-block" && item.lines) {
        const sub = item.lines[subLineIdx];
        return sub ? sub.chordsPos : null;
      }
      return null;
    }
    return item.chordsPos;
  };

  let posArray = getLinePositions(customPositions);
  if (!posArray) {
    const globalKey = `global-positions-${song.id}`;
    const globalStore = localStorage.getItem(globalKey);
    if (globalStore) {
      try {
        const parsed = JSON.parse(globalStore);
        posArray = getLinePositions(parsed);
      } catch (e) {}
    }
  }
  if (!posArray) {
    posArray = getLinePositions(defaultChordPositions[song.id]);
  }

  if (posArray && posArray.length === baseChords.length) {
    return baseChords.map((c, i) => ({
      noteName: c.name,
      noteType: c.type,
      position: posArray[i]
    }));
  }

  return baseChords.map(c => ({
    noteName: c.name,
    noteType: c.type,
    position: c.originalPos
  }));
}

// --- Event Listeners ---
function setupEventListeners() {
  // Pestañas de Libros
  document.querySelectorAll('.book-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.book-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentBook = tab.dataset.book;
      
      // Limpiar búsqueda y filtros al cambiar de libro
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      
      // Reiniciar filtros visuales
      activeStage = null;
      stageFiltersContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      activeMoments = [];
      momentFiltersContainer.querySelectorAll('.filter-pill').forEach(b => {
        b.classList.toggle('active', b.id === 'btn-filter-indice');
      });
      
      handleSearchAndFilters();
    });
  });

  // Buscador e inputs
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearSearchBtn) clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
      handleSearchAndFilters();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        const firstCard = songsGrid.querySelector('.song-card');
        if (firstCard) {
          e.preventDefault();
          firstCard.focus();
        }
      } else if (e.key === 'Enter') {
        const firstCard = songsGrid.querySelector('.song-card');
        if (firstCard) {
          e.preventDefault();
          firstCard.click();
        }
      }
    });
  }
  
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      handleSearchAndFilters();
    });
  }
  
  // Toggle panel filtros
  if (toggleFiltersBtn) {
    toggleFiltersBtn.addEventListener('click', () => {
      if (filtersPanel) {
        const isVisible = filtersPanel.style.display !== 'none';
        filtersPanel.style.display = isVisible ? 'none' : 'flex';
        toggleFiltersBtn.classList.toggle('active', !isVisible);
      }
    });
  }
  
  // Clic en etapas
  if (stageFiltersContainer) {
    stageFiltersContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      
      const stage = btn.dataset.stage;
      if (activeStage === stage) {
        activeStage = null;
        btn.classList.remove('active');
      } else {
        stageFiltersContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        activeStage = stage;
        btn.classList.add('active');
      }

      // Si combineStageMomentFilter es false, limpiamos filtros de momentos/cantos
      const combineFilter = localStorage.getItem('combineStageMomentFilter') === 'true';
      if (!combineFilter) {
        activeMoments = [];
        if (momentFiltersContainer) {
          momentFiltersContainer.querySelectorAll('.filter-pill').forEach(b => {
            b.classList.toggle('active', b.id === 'btn-filter-indice');
          });
        }
      }

      handleSearchAndFilters();

      // Cerrar filtrado al seleccionar (solo si no está activa la opción de mantener abierto en selección de etapas)
      const closeOnSelect = localStorage.getItem('closeFiltersOnSelect') !== 'false';
      const keepStageActive = localStorage.getItem('keepStageFilterActive') !== 'false';
      if (closeOnSelect && !keepStageActive && filtersPanel) {
        filtersPanel.style.display = 'none';
        if (toggleFiltersBtn) toggleFiltersBtn.classList.remove('active');
      }
    });
  }
  
  // Clic en momentos litúrgicos
  if (momentFiltersContainer) {
    momentFiltersContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      
      const moment = btn.dataset.moment;
      const btnIndice = document.getElementById('btn-filter-indice');

      // Si combineStageMomentFilter es false y el filtro no es "Indice de Cantos", limpiamos etapa
      const combineFilter = localStorage.getItem('combineStageMomentFilter') === 'true';
      if (!combineFilter && moment !== 'Indice de Cantos') {
        activeStage = null;
        if (stageFiltersContainer) {
          stageFiltersContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        }
      }
      
      if (moment === 'Indice de Cantos') {
        // Limpiar todos los filtros de momentos
        activeMoments = [];
        momentFiltersContainer.querySelectorAll('.filter-pill').forEach(b => {
          b.classList.remove('active');
        });
        if (btnIndice) btnIndice.classList.add('active');
      } else {
        const isMultiMoment = localStorage.getItem('multiMomentFilter') === 'true';
        if (isMultiMoment) {
          const index = activeMoments.indexOf(moment);
          if (index > -1) {
            activeMoments.splice(index, 1);
            btn.classList.remove('active');
          } else {
            activeMoments.push(moment);
            btn.classList.add('active');
          }
        } else {
          // Selección única de momento
          const isCurrentlyActive = activeMoments.includes(moment);
          activeMoments = [];
          momentFiltersContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
          
          if (!isCurrentlyActive) {
            activeMoments.push(moment);
            btn.classList.add('active');
          }
        }
        
        // Ajustar estado del botón de "Índice de Cantos"
        if (activeMoments.length > 0) {
          if (btnIndice) btnIndice.classList.remove('active');
        } else {
          if (btnIndice) btnIndice.classList.add('active');
        }
      }

      handleSearchAndFilters();

      // Cerrar filtrado al seleccionar (solo si no está activa la multiselección de cantos)
      const closeOnSelect = localStorage.getItem('closeFiltersOnSelect') !== 'false';
      const isMultiMoment = localStorage.getItem('multiMomentFilter') === 'true';
      if (closeOnSelect && !isMultiMoment && filtersPanel) {
        filtersPanel.style.display = 'none';
        if (toggleFiltersBtn) toggleFiltersBtn.classList.remove('active');
      }
    });
  }
  
  // Botones de visor
  if (viewerBackBtn) {
    viewerBackBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.hash = '';
      }
    });
  }
  


  // Clic en Tone/Capo trigger para abrir transposición (Desktop y Mobile)
  const openChordModal = () => {
    if (!currentCanto) return;
    const currentTransposedNote = transposeNote(originalSongKey, currentKeyOffset);
    showChordDiagram(currentTransposedNote, originalSongTypeSuffix || '');
  };

  if (toneCapoTrigger) toneCapoTrigger.addEventListener('click', openChordModal);
  const toneDropdownTriggerBtn = document.getElementById('tone-dropdown-trigger');
  if (toneDropdownTriggerBtn) toneDropdownTriggerBtn.addEventListener('click', openChordModal);

  // Botón de acordes / transposición
  if (chordModalTriggerBtn) {
    chordModalTriggerBtn.addEventListener('click', () => {
      if (!currentCanto) return;
      const currentTransposedNote = transposeNote(originalSongKey, currentKeyOffset);
      showChordDiagram(currentTransposedNote, originalSongTypeSuffix || '');
    });
  }

  // Botón de Dividir Pantalla (Book icon)
  if (splitLayoutBtn) {
    splitLayoutBtn.addEventListener('click', () => {
      isSplitLayout = !isSplitLayout;
      localStorage.setItem('split-layout', isSplitLayout ? 'true' : 'false');
      splitLayoutBtn.classList.toggle('active', isSplitLayout);
      if (cantoColumnsContainer) {
        cantoColumnsContainer.classList.toggle('single-column', !isSplitLayout);
      }
    });
  }



  // Navegación de Canto Anterior
  if (prevSongBtn) {
    prevSongBtn.addEventListener('click', () => {
      navigateToSong('prev');
    });
  }

  // Navegación de Canto Siguiente
  if (nextSongBtn) {
    nextSongBtn.addEventListener('click', () => {
      navigateToSong('next');
    });
  }

  // Gestos táctiles en móviles y tablets para pasar de página (carrusel interactivo)
  const songViewer = document.getElementById('song-viewer-view');
  const sliderContainer = document.getElementById('canto-slider-container');
  const slidePrev = document.getElementById('canto-slide-prev');
  const slideNext = document.getElementById('canto-slide-next');
  let touchStartX = 0;
  let touchStartY = 0;
  let isDragging = false;
  let directionLocked = false;
  let isSwipeHoriz = false;
  
  if (songViewer && sliderContainer) {
    songViewer.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isDragging = true;
      directionLocked = false;
      isSwipeHoriz = false;
      sliderContainer.style.transition = 'none'; // Sin transición durante el arrastre
    }, { passive: true });
    
    songViewer.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = currentX - touchStartX;
      const diffY = currentY - touchStartY;
      
      if (!directionLocked) {
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
          directionLocked = true;
          // Si el movimiento es predominantemente horizontal, es swipe
          if (Math.abs(diffX) > Math.abs(diffY) * 1.2) {
            isSwipeHoriz = true;
          } else {
            isDragging = false; // Permitir scroll vertical nativo normal
          }
        }
      }
      
      if (isDragging && isSwipeHoriz) {
        // Prevenir el scroll y gestos nativos del navegador
        if (e.cancelable) e.preventDefault();
        
        // Carga dinámica de la vista previa de las diapositivas adyacentes si no están cargadas
        if (diffX > 0 && slidePrev && slidePrev.innerHTML === '') {
          if (currentCanto) {
            const targetBook = (currentCanto && currentCanto.sourceBook) ? currentCanto.sourceBook : currentBook;
            const currentBookSongs = allSongs.filter(s => (s.sourceBook || 'resucito') === targetBook);
            
            const currentIndex = activeSongsPlaylist.findIndex(s => s.id === currentCanto.id);
            const playListToUse = currentIndex !== -1 ? activeSongsPlaylist : currentBookSongs;
            const currentIdxToUse = currentIndex !== -1 ? currentIndex : currentBookSongs.findIndex(s => s.id === currentCanto.id);
            if (currentIdxToUse > 0) {
              const prevSong = playListToUse[currentIdxToUse - 1];
              // Si ya está en caché, renderizar síncronamente (evita parpadeos)
              if (loadedSongsCache[prevSong.id]) {
                slidePrev.innerHTML = generarHtmlCanto(loadedSongsCache[prevSong.id]);
              } else {
                slidePrev.innerHTML = generarHtmlCantoBasico(prevSong);
                obtenerCantoCompleto(prevSong.id).then(fullSong => {
                  if (isDragging && slidePrev && fullSong) {
                    slidePrev.innerHTML = generarHtmlCanto(fullSong);
                  }
                });
              }
            }
          }
        } else if (diffX < 0 && slideNext && slideNext.innerHTML === '') {
          if (currentCanto) {
            const targetBook = (currentCanto && currentCanto.sourceBook) ? currentCanto.sourceBook : currentBook;
            const currentBookSongs = allSongs.filter(s => (s.sourceBook || 'resucito') === targetBook);
            
            const currentIndex = activeSongsPlaylist.findIndex(s => s.id === currentCanto.id);
            const playListToUse = currentIndex !== -1 ? activeSongsPlaylist : currentBookSongs;
            const currentIdxToUse = currentIndex !== -1 ? currentIndex : currentBookSongs.findIndex(s => s.id === currentCanto.id);
            if (currentIdxToUse !== -1 && currentIdxToUse < playListToUse.length - 1) {
              const nextSong = playListToUse[currentIdxToUse + 1];
              // Si ya está en caché, renderizar síncronamente (evita parpadeos)
              if (loadedSongsCache[nextSong.id]) {
                slideNext.innerHTML = generarHtmlCanto(loadedSongsCache[nextSong.id]);
              } else {
                slideNext.innerHTML = generarHtmlCantoBasico(nextSong);
                obtenerCantoCompleto(nextSong.id).then(fullSong => {
                  if (isDragging && slideNext && fullSong) {
                    slideNext.innerHTML = generarHtmlCanto(fullSong);
                  }
                });
              }
            }
          }
        }
        
        // Mover el contenedor completo
        // La posición central es calc(-100% / 3 - 13.333px)
        sliderContainer.style.transform = `translate3d(calc(-100% / 3 - 13.333px + ${diffX}px), 0, 0)`;
      }
    }, { passive: false });
    
    songViewer.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      
      const touchEndX = e.changedTouches[0].clientX;
      const diffX = touchEndX - touchStartX;
      touchStartX = 0;
      
      if (!isSwipeHoriz) return;
      
      const threshold = 100; // Distancia mínima en px para cambiar de canto
      
      if (Math.abs(diffX) > threshold) {
        const direction = diffX < 0 ? 'next' : 'prev';
        
        // Verificar si cargó diapositiva de destino
        const destinationLoaded = direction === 'next' 
          ? (slideNext && slideNext.innerHTML !== '') 
          : (slidePrev && slidePrev.innerHTML !== '');
          
        if (destinationLoaded) {
          // Animar transición completa al slide de destino
          sliderContainer.style.transition = 'transform 0.25s ease';
          const targetTransform = direction === 'next'
            ? 'translate3d(calc(-200% / 3 - 26.667px), 0, 0)'
            : 'translate3d(0px, 0, 0)';
            
          sliderContainer.style.transform = targetTransform;
          
          setTimeout(() => {
            navigateToSong(direction, true);
          }, 250);
        } else {
          // Bote de vuelta al centro
          sliderContainer.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
          sliderContainer.style.transform = 'translate3d(calc(-100% / 3 - 13.333px), 0, 0)';
          setTimeout(() => {
            if (slidePrev) slidePrev.innerHTML = '';
            if (slideNext) slideNext.innerHTML = '';
          }, 320);
        }
      } else {
        // Devolverse al centro (snap back)
        sliderContainer.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        sliderContainer.style.transform = 'translate3d(calc(-100% / 3 - 13.333px), 0, 0)';
        setTimeout(() => {
          if (slidePrev) slidePrev.innerHTML = '';
          if (slideNext) slideNext.innerHTML = '';
        }, 320);
      }
    }, { passive: true });
  }

  // Evitar que el toque/clic en el buscador rápido cierre el menú desplegable ≡ o cancele el foco nativo
  if (toolbarSearchInput) {
    toolbarSearchInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    toolbarSearchInput.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: true });
  }

  // Buscador rápido de la barra de herramientas superior
  if (toolbarSearchInput) {
    let activeSuggestionIndex = -1;

    function updateActiveSuggestion(index) {
      const items = toolbarSearchSuggestions.querySelectorAll('.search-suggestion-item');
      items.forEach((item, idx) => {
        if (idx === index) {
          item.classList.add('active');
          item.scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      });
      activeSuggestionIndex = index;
    }

    toolbarSearchInput.addEventListener('input', () => {
      const query = toolbarSearchInput.value.trim();
      if (!query) {
        toolbarSearchSuggestions.style.display = 'none';
        activeSuggestionIndex = -1;
        return;
      }
      
      const matches = searchSongs(allSongs, query).slice(0, 10); // Máximo 10 sugerencias
      
      if (matches.length === 0) {
        toolbarSearchSuggestions.innerHTML = `<div class="search-suggestion-item" style="color: var(--text-muted); cursor: default;">No se encontraron cantos</div>`;
        activeSuggestionIndex = -1;
      } else {
        toolbarSearchSuggestions.innerHTML = matches.map(song => {
          const categoryText = song.stage || (Array.isArray(song.category) ? song.category.join(', ') : song.category) || '';
          return `
            <div class="search-suggestion-item" data-id="${song.id}" tabindex="0">
              <strong>${song.titulo || song.title}</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">${categoryText}</span>
            </div>
          `;
        }).join('');
        activeSuggestionIndex = -1;
      }
      toolbarSearchSuggestions.style.display = 'block';
    });

    toolbarSearchInput.addEventListener('keydown', (e) => {
      const items = toolbarSearchSuggestions.querySelectorAll('.search-suggestion-item:not([style*="cursor: default"])');
      if (toolbarSearchSuggestions.style.display === 'none' || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        let nextIndex = activeSuggestionIndex + 1;
        if (nextIndex >= items.length) nextIndex = 0;
        updateActiveSuggestion(nextIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        let prevIndex = activeSuggestionIndex - 1;
        if (prevIndex < 0) prevIndex = items.length - 1;
        updateActiveSuggestion(prevIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < items.length) {
          const activeItem = items[activeSuggestionIndex];
          if (activeItem && activeItem.dataset.id) {
            window.location.hash = `#canto=${activeItem.dataset.id}`;
            toolbarSearchSuggestions.style.display = 'none';
            toolbarSearchInput.value = '';
            activeSuggestionIndex = -1;
          }
        } else if (items.length > 0) {
          const firstItem = items[0];
          if (firstItem && firstItem.dataset.id) {
            window.location.hash = `#canto=${firstItem.dataset.id}`;
            toolbarSearchSuggestions.style.display = 'none';
            toolbarSearchInput.value = '';
            activeSuggestionIndex = -1;
          }
        }
      } else if (e.key === 'Escape') {
        toolbarSearchSuggestions.style.display = 'none';
        activeSuggestionIndex = -1;
      } else if (e.key === 'Tab' && !e.shiftKey) {
        const firstItem = items[0];
        if (firstItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    });
    
    if (toolbarSearchSuggestions) {
      toolbarSearchSuggestions.addEventListener('keydown', (e) => {
        const item = e.target.closest('.search-suggestion-item');
        if (!item || !item.dataset.id) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          window.location.hash = `#canto=${item.dataset.id}`;
          toolbarSearchSuggestions.style.display = 'none';
          toolbarSearchInput.value = '';
        } else if (e.key === 'Tab') {
          const items = Array.from(toolbarSearchSuggestions.querySelectorAll('.search-suggestion-item:not([style*="cursor: default"])'));
          const index = items.indexOf(item);
          if (e.shiftKey && index === 0) {
            e.preventDefault();
            toolbarSearchInput.focus();
          }
        }
      });

      toolbarSearchSuggestions.addEventListener('click', (e) => {
        const item = e.target.closest('.search-suggestion-item');
        if (!item || !item.dataset.id) return;
        window.location.hash = `#canto=${item.dataset.id}`;
        toolbarSearchSuggestions.style.display = 'none';
        toolbarSearchInput.value = '';
        activeSuggestionIndex = -1;
      });

      toolbarSearchSuggestions.addEventListener('mousemove', (e) => {
        const item = e.target.closest('.search-suggestion-item');
        if (item) {
          const items = toolbarSearchSuggestions.querySelectorAll('.search-suggestion-item');
          const idx = Array.from(items).indexOf(item);
          if (idx !== -1 && idx !== activeSuggestionIndex) {
            items.forEach((el, index) => {
              if (index === idx) {
                el.classList.add('active');
              } else {
                el.classList.remove('active');
              }
            });
            activeSuggestionIndex = idx;
          }
        }
      });
      
      document.addEventListener('click', (e) => {
        if (toolbarSearchSuggestions && !toolbarSearchSuggestions.contains(e.target) && e.target !== toolbarSearchInput) {
          toolbarSearchSuggestions.style.display = 'none';
        }
      });
    }
  }
  
  if (scrollPlayBtn) {
    scrollPlayBtn.addEventListener('click', toggleAutoScroll);
  }

  const scrollIntervalSlider = document.getElementById('scroll-interval-slider');
  const scrollIntervalInput = document.getElementById('scroll-interval-input');
  const scrollIntervalMinusBtn = document.getElementById('scroll-interval-minus-btn');
  const scrollIntervalPlusBtn = document.getElementById('scroll-interval-plus-btn');

  const scrollStepSlider = document.getElementById('scroll-step-slider');
  const scrollStepInput = document.getElementById('scroll-step-input');
  const scrollStepMinusBtn = document.getElementById('scroll-step-minus-btn');
  const scrollStepPlusBtn = document.getElementById('scroll-step-plus-btn');

  const scrollIntervalLimitInput = document.getElementById('scroll-interval-limit');
  const scrollStepLimitInput = document.getElementById('scroll-step-limit');

  // Initialize values in DOM
  if (scrollIntervalLimitInput) {
    scrollIntervalLimitInput.value = scrollIntervalLimit;
  }
  if (scrollIntervalSlider && scrollIntervalInput) {
    scrollIntervalSlider.max = scrollIntervalLimit;
    scrollIntervalInput.max = scrollIntervalLimit;
    scrollIntervalSlider.value = scrollIntervalMs;
    scrollIntervalInput.value = scrollIntervalMs;
  }

  if (scrollStepLimitInput) {
    scrollStepLimitInput.value = scrollStepLimit;
  }
  if (scrollStepSlider && scrollStepInput) {
    scrollStepSlider.max = scrollStepLimit;
    scrollStepInput.max = scrollStepLimit;
    scrollStepSlider.value = scrollStepPx;
    scrollStepInput.value = scrollStepPx;
  }

  window.applySongScrollSpeed = function(songId) {
    if (!songId) return;
    const cfg = getSongScrollConfig(songId);
    scrollIntervalMs = cfg.v;
    scrollStepPx = cfg.i;
    
    if (scrollIntervalSlider) scrollIntervalSlider.value = scrollIntervalMs;
    if (scrollIntervalInput) scrollIntervalInput.value = scrollIntervalMs;
    if (scrollStepSlider) scrollStepSlider.value = scrollStepPx;
    if (scrollStepInput) scrollStepInput.value = scrollStepPx;
  };

  window.addEventListener('resize', () => {
    if (currentCanto && currentCanto.id && window.applySongScrollSpeed) {
      window.applySongScrollSpeed(currentCanto.id);
    }
  });

  function updateScrollInterval(val) {
    scrollIntervalMs = Math.max(1, Math.min(scrollIntervalLimit, val));
    if (currentCanto && currentCanto.id) {
      saveSongScrollConfig(currentCanto.id, scrollIntervalMs, scrollStepPx);
    } else {
      localStorage.setItem('scroll-interval', scrollIntervalMs);
    }
    if (scrollIntervalSlider) scrollIntervalSlider.value = scrollIntervalMs;
    if (scrollIntervalInput) scrollIntervalInput.value = scrollIntervalMs;
    if (isScrollActive) {
      stopAutoScroll();
      startAutoScroll();
    }
  }

  function updateScrollStep(val) {
    scrollStepPx = Math.max(1, Math.min(scrollStepLimit, val));
    if (currentCanto && currentCanto.id) {
      saveSongScrollConfig(currentCanto.id, scrollIntervalMs, scrollStepPx);
    } else {
      localStorage.setItem('scroll-step', scrollStepPx);
    }
    if (scrollStepSlider) scrollStepSlider.value = scrollStepPx;
    if (scrollStepInput) scrollStepInput.value = scrollStepPx;
    if (isScrollActive) {
      stopAutoScroll();
      startAutoScroll();
    }
  }

  // Bind events for Desplazamiento Canto (Interval)
  if (scrollIntervalLimitInput) {
    scrollIntervalLimitInput.addEventListener('change', () => {
      let val = parseInt(scrollIntervalLimitInput.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      scrollIntervalLimit = val;
      localStorage.setItem('scroll-interval-limit', scrollIntervalLimit);
      
      if (scrollIntervalSlider) scrollIntervalSlider.max = scrollIntervalLimit;
      if (scrollIntervalInput) scrollIntervalInput.max = scrollIntervalLimit;
      
      if (scrollIntervalMs > scrollIntervalLimit) {
        updateScrollInterval(scrollIntervalLimit);
      }
    });
  }

  if (scrollIntervalSlider) {
    scrollIntervalSlider.addEventListener('input', () => {
      updateScrollInterval(parseInt(scrollIntervalSlider.value) || 40);
    });
  }
  if (scrollIntervalInput) {
    scrollIntervalInput.addEventListener('change', () => {
      updateScrollInterval(parseInt(scrollIntervalInput.value) || 40);
    });
    scrollIntervalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        updateScrollInterval(parseInt(scrollIntervalInput.value) || 40);
        scrollIntervalInput.blur();
      }
    });
  }
  if (scrollIntervalMinusBtn) {
    scrollIntervalMinusBtn.addEventListener('click', () => {
      updateScrollInterval(scrollIntervalMs - 1);
    });
  }
  if (scrollIntervalPlusBtn) {
    scrollIntervalPlusBtn.addEventListener('click', () => {
      updateScrollInterval(scrollIntervalMs + 1);
    });
  }

  // Bind events for Incremento Scroll (px)
  if (scrollStepLimitInput) {
    scrollStepLimitInput.addEventListener('change', () => {
      let val = parseInt(scrollStepLimitInput.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      scrollStepLimit = val;
      localStorage.setItem('scroll-step-limit', scrollStepLimit);
      
      if (scrollStepSlider) scrollStepSlider.max = scrollStepLimit;
      if (scrollStepInput) scrollStepInput.max = scrollStepLimit;
      
      if (scrollStepPx > scrollStepLimit) {
        updateScrollStep(scrollStepLimit);
      }
    });
  }

  if (scrollStepSlider) {
    scrollStepSlider.addEventListener('input', () => {
      updateScrollStep(parseInt(scrollStepSlider.value) || 1);
    });
  }
  if (scrollStepInput) {
    scrollStepInput.addEventListener('change', () => {
      updateScrollStep(parseInt(scrollStepInput.value) || 1);
    });
    scrollStepInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        updateScrollStep(parseInt(scrollStepInput.value) || 1);
        scrollStepInput.blur();
      }
    });
  }
  if (scrollStepMinusBtn) {
    scrollStepMinusBtn.addEventListener('click', () => {
      updateScrollStep(scrollStepPx - 1);
    });
  }
  if (scrollStepPlusBtn) {
    scrollStepPlusBtn.addEventListener('click', () => {
      updateScrollStep(scrollStepPx + 1);
    });
  }
  
  if (asambleaToggleBtn) {
    asambleaToggleBtn.addEventListener('click', () => {
      allAsambleaExpanded = !allAsambleaExpanded;
      asambleaToggleBtn.classList.toggle('active', allAsambleaExpanded);
      const iconSpan = asambleaToggleBtn.querySelector('span');
      if (iconSpan) {
        iconSpan.textContent = allAsambleaExpanded ? 'visibility' : 'visibility_off';
      }

      document.querySelectorAll('.collapsible-content').forEach(content => {
        content.style.display = allAsambleaExpanded ? 'block' : 'none';
      });
      document.querySelectorAll('.collapsible-trigger').forEach(trigger => {
        const letraSpan = trigger.querySelector('.letra');
        if (letraSpan && letraSpan.textContent) {
          if (allAsambleaExpanded) {
            letraSpan.textContent = letraSpan.textContent.replace('...', '');
          } else {
            if (!letraSpan.textContent.endsWith('...')) letraSpan.textContent += '...';
          }
        }
      });
    });
  }
  
  if (audioPlayBtn) {
    audioPlayBtn.addEventListener('click', () => {
      if (viewerAudioPlayer && viewerAudioPlayer.paused) {
        viewerAudioPlayer.play();
      } else if (viewerAudioPlayer) {
        viewerAudioPlayer.pause();
      }
    });
  }
  
  if (viewerAudioPlayer) {
    viewerAudioPlayer.addEventListener('play', () => {
      // Aplicar preferencias de bucle y ecualizador al reproducir
      viewerAudioPlayer.loop = localStorage.getItem('audioLoopEnabled') === 'true';
      if (typeof window.initAudioEqualizer === 'function') {
        window.initAudioEqualizer();
      }
      if (window.eqCtx && window.eqCtx.state === 'suspended') {
        window.eqCtx.resume();
      }
      
      if (viewerAudioContainer) viewerAudioContainer.classList.add('open');
      if (audioPlayBtn) {
        audioPlayBtn.classList.add('active');
        const iconSpan = audioPlayBtn.querySelector('span');
        if (iconSpan) iconSpan.textContent = 'pause';
      }
    });
    
    viewerAudioPlayer.addEventListener('pause', () => {
      if (viewerAudioContainer) viewerAudioContainer.classList.remove('open');
      if (audioPlayBtn) {
        audioPlayBtn.classList.remove('active');
        const iconSpan = audioPlayBtn.querySelector('span');
        if (iconSpan) iconSpan.textContent = 'play_arrow';
      }
    });
    
    viewerAudioPlayer.addEventListener('ended', () => {
      if (viewerAudioContainer) viewerAudioContainer.classList.remove('open');
      if (audioPlayBtn) {
        audioPlayBtn.classList.remove('active');
        const iconSpan = audioPlayBtn.querySelector('span');
        if (iconSpan) iconSpan.textContent = 'play_arrow';
      }
    });
  }
  
  if (settingsOpenBtn) {
    settingsOpenBtn.addEventListener('click', () => {
      window.abrirModalConfiguracion();
    });
  }
  
  // Guardado de favoritos
  if (favoriteBtn) {
    favoriteBtn.addEventListener('click', () => {
      if (!currentCanto) return;
      const songId = currentCanto.id;
      if (favorites.has(songId)) {
        favorites.delete(songId);
        favoriteBtn.classList.remove('active-star');
      } else {
        favorites.add(songId);
        favoriteBtn.classList.add('active-star');
      }
      localStorage.setItem('favorites', JSON.stringify([...favorites]));
      
      if (currentBook === 'favoritos') {
        handleSearchAndFilters();
      }
    });
  }
  
  // Guardado de notas del cantor
  if (notesTextarea) {
    let notesSaveTimeout;
    notesTextarea.addEventListener('input', () => {
      if (currentCanto) {
        const songId = currentCanto.id;
        const val = notesTextarea.value;
        localStorage.setItem(`notes_${songId}`, val);
        
        // Sincronizar con Firebase de forma debounced
        clearTimeout(notesSaveTimeout);
        notesSaveTimeout = setTimeout(() => {
          guardarNotaEnNube(songId, val);
        }, 1000);
      }
    });
  }
  
  // Cejilla select
  if (capoSelect) {
    capoSelect.addEventListener('change', () => {
      if (!currentCanto) return;
      const selectedCapo = parseInt(capoSelect.value) || 0;
      
      const activeCapoBadge = document.getElementById('capo-badge');
      if (activeCapoBadge) {
        activeCapoBadge.textContent = formatCapoText(selectedCapo);
      }
      
      const modalCapoSelect = document.getElementById('modal-capo-select');
      if (modalCapoSelect) {
        modalCapoSelect.value = selectedCapo;
      }

      updateChordPanel();
      guardarHistorialCanto();
    });
  }
  
  // Cerrar modales
  if (chordModalClose) {
    chordModalClose.addEventListener('click', () => {
      if (chordModal) chordModal.style.display = 'none';
      currentEditingChordInfo = null;
    });
  }
  if (chordModal) {
    chordModal.addEventListener('click', (e) => {
      if (e.target === chordModal) {
        chordModal.style.display = 'none';
        currentEditingChordInfo = null;
      }
    });
  }
  

  
  // Click listeners para el prontuario de acordes interactivo
  if (modalChordNotePicker) {
    modalChordNotePicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-picker');
      if (!btn) return;
      
      const chosenNote = btn.dataset.note;
      
      if (isChordEditMode && currentEditingChordInfo) {
        saveSingleChordEdit(chosenNote, undefined);
        if (chordModal) chordModal.style.display = 'none';
        return;
      }
      
      const fromIdx = CHROMATIC_SCALE.indexOf(normalizeChord(selectedModalNote));
      const toIdx = CHROMATIC_SCALE.indexOf(normalizeChord(chosenNote));
      
      if (fromIdx !== -1 && toIdx !== -1) {
        let diff = toIdx - fromIdx;
        if (diff !== 0) {
          shiftKey(diff);
          selectedModalNote = chosenNote;
          updateModalChordDiagram();
        }
        if (chordModal) chordModal.style.display = 'none';
      }
    });
  }

  if (modalChordTypePicker) {
    modalChordTypePicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-type-picker');
      if (!btn) return;
      
      const chosenType = btn.dataset.type || '';
      
      if (isChordEditMode && currentEditingChordInfo) {
        saveSingleChordEdit(undefined, chosenType);
        chordModal.style.display = 'none';
        return;
      }
      
      selectedModalType = chosenType;
      updateModalChordDiagram();
    });
  }
  


  // --- Módulo de Logs de Diagnóstico ---
  window.appLogs = window.appLogs || [];

  window.addAppLog = function(category, message, details = null) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry = {
      id: Date.now() + Math.random(),
      time: timeStr,
      category: category || 'General',
      message: message || '',
      details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : ''
    };
    window.appLogs.push(entry);
    if (window.appLogs.length > 300) window.appLogs.shift();
    if (window.renderAppLogs) window.renderAppLogs();
  };

  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;

  console.log = function(...args) {
    origLog.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    let cat = 'General';
    if (msg.includes('Buscador') || msg.includes('🔍')) cat = 'Buscador';
    else if (msg.includes('Firebase') || msg.includes('🔥') || msg.includes('Permisos')) cat = 'Firebase';
    else if (msg.includes('Service Worker') || msg.includes('sw.js')) cat = 'PWA';
    window.addAppLog(cat, msg);
  };

  console.warn = function(...args) {
    origWarn.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    window.addAppLog('General', '⚠️ ' + msg);
  };

  console.error = function(...args) {
    origErr.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    window.addAppLog('General', '❌ ' + msg);
  };

  window.renderAppLogs = function() {
    const container = document.getElementById('logs-viewer-container');
    const catSelect = document.getElementById('logs-category-select');
    if (!container) return;

    const selectedCat = catSelect ? catSelect.value : 'all';
    const filtered = window.appLogs.filter(item => selectedCat === 'all' || item.category === selectedCat);

    if (filtered.length === 0) {
      container.innerHTML = '<span style="color: #888;">No hay registros en esta categoría.</span>';
      return;
    }

    container.innerHTML = filtered.map(item => `
      <div style="margin-bottom: 6px; border-bottom: 1px dashed #333; padding-bottom: 4px;">
        <span style="color: #888;">[${item.time}]</span> 
        <span style="color: #ffc107; font-weight: bold;">[${item.category}]</span> 
        <span style="color: #00ff66;">${item.message}</span>
        ${item.details ? `<pre style="margin: 2px 0 0 10px; color: #64b5f6; font-size: 0.7rem;">${item.details}</pre>` : ''}
      </div>
    `).join('');

    container.scrollTop = container.scrollHeight;
  };

  const logsCategorySelect = document.getElementById('logs-category-select');
  if (logsCategorySelect) {
    logsCategorySelect.addEventListener('change', window.renderAppLogs);
  }

  const clearLogsBtn = document.getElementById('clear-logs-btn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      window.appLogs = [];
      window.renderAppLogs();
    });
  }

  const copyLogsBtn = document.getElementById('copy-logs-btn');
  if (copyLogsBtn) {
    copyLogsBtn.addEventListener('click', () => {
      const selectedCat = logsCategorySelect ? logsCategorySelect.value : 'all';
      const filtered = window.appLogs.filter(item => selectedCat === 'all' || item.category === selectedCat);
      const text = filtered.map(item => `[${item.time}] [${item.category}] ${item.message} ${item.details || ''}`).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        copyLogsBtn.textContent = '¡Copiados!';
        setTimeout(() => copyLogsBtn.textContent = 'Copiar Logs', 2000);
      }).catch(err => {
        alert('No se pudo copiar: ' + err);
      });
    });
  }

  // Logger de diagnóstico para inspeccionar el comportamiento táctil del buscador
  const attachSearchDiagnostics = (inputEl, label) => {
    if (!inputEl) return;
    const events = ['pointerdown', 'touchstart', 'touchend', 'click', 'focus', 'blur', 'input'];
    events.forEach(evtName => {
      inputEl.addEventListener(evtName, (e) => {
        const computed = window.getComputedStyle(inputEl);
        console.log(`🔍 [Buscador ${label}] Evento: "${evtName}"`, {
          activeElement: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : 'ninguno',
          relatedTarget: e.relatedTarget ? (e.relatedTarget.id || e.relatedTarget.tagName) : 'null',
          width: computed.width,
          fontSize: computed.fontSize,
          val: inputEl.value
        });
      });
    });
  };

  attachSearchDiagnostics(searchInput, 'Principal (#search-input)');
  attachSearchDiagnostics(toolbarSearchInput, 'Barra Superior (#toolbar-search-input)');

  // Sincronizar el toggle BIS con el canto actual
  function populateBisSongList() {
    const bisToggle = document.getElementById('bis-toggle');
    if (!bisToggle) return;
    bisToggle.checked = currentCanto ? isBisEnabled(currentCanto.id) : false;
  }
  window.populateBisSongList = populateBisSongList;

  // Listener del toggle BIS
  const bisToggleInput = document.getElementById('bis-toggle');
  if (bisToggleInput) {
    bisToggleInput.addEventListener('change', (e) => {
      if (!currentCanto) return;
      setBisForSong(currentCanto.id, e.target.checked);
      renderSongContent();
    });
  }

  // Selección de colores de etapa
  document.querySelectorAll('.color-swatch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.color-swatches');
      if (!container) return;
      const stage = container.dataset.stage;
      const color = btn.dataset.color;
      
      localStorage.setItem(`stage-color-${stage}`, color);
      applyStageColors();
      
      // Forzar renderizado para recalcular los bordes del color de etapa al instante
      if (filteredSongs && filteredSongs.length > 0) {
        renderSongsList(filteredSongs);
      } else {
        renderSongsList(allSongs);
      }
    });
  });

  // Selección de color personalizado mediante color picker
  document.querySelectorAll('.stage-color-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const stage = input.dataset.stage;
      const color = e.target.value;
      
      localStorage.setItem(`stage-color-${stage}`, color);
      applyStageColors();
      
      // Forzar renderizado para recalcular los bordes del color de etapa al instante
      if (filteredSongs && filteredSongs.length > 0) {
        renderSongsList(filteredSongs);
      } else {
        renderSongsList(allSongs);
      }
    });
  });

  // Personalizar colores de botones de etapa (default, active y text)
  document.querySelectorAll('.btn-color-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const stage = input.dataset.stage;
      const mode = input.dataset.mode; // 'default' | 'active' | 'text'
      const color = e.target.value;
      
      if (mode === 'default') {
        localStorage.setItem(`stage-color-${stage}`, color);
      } else if (mode === 'text') {
        localStorage.setItem(`btn-color-${stage}-text`, color);
      } else {
        localStorage.setItem(`btn-color-${stage}-active`, color);
      }
      applyStageColors();
    });
  });
  
  // Personalizar colores del Tema de Libro de Canto
  document.querySelectorAll('.book-theme-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const suffix = localStorage.getItem('theme') || 'light'; // 'dark' | 'light' | 'sepia'
      const type = input.dataset.type; // 'bg' | 'accent'
      const color = e.target.value;
      
      localStorage.setItem(`book-theme-${type}-${suffix}`, color);
      applyBookTheme();
    });
  });

  const resetBookThemeBtn = document.getElementById('reset-book-theme-btn');
  if (resetBookThemeBtn) {
    resetBookThemeBtn.addEventListener('click', () => {
      // Limpiar todas las configuraciones personalizadas de todos los temas a la vez
      const suffixes = ['dark', 'light', 'sepia'];
      suffixes.forEach(suffix => {
        localStorage.removeItem(`book-theme-bg-${suffix}`);
        localStorage.removeItem(`book-theme-accent-${suffix}`);
        localStorage.removeItem(`book-theme-text-${suffix}`);
        localStorage.removeItem(`book-theme-song-title-${suffix}`);
        localStorage.removeItem(`book-theme-chord-${suffix}`);
        localStorage.removeItem(`book-theme-chord-alt-${suffix}`);
        localStorage.removeItem(`book-theme-footer-link-${suffix}`);
      });
      // Limpiar claves heredadas antiguas
      localStorage.removeItem('book-theme-bg');
      localStorage.removeItem('book-theme-accent');
      localStorage.removeItem('book-theme-text');
      localStorage.removeItem('book-theme-song-title');
      localStorage.removeItem('book-theme-chord');
      localStorage.removeItem('book-theme-chord-alt');
      localStorage.removeItem('book-theme-footer-link');
      
      // Limpiar inline style overrides de body y documentElement para forzar recálculo
      const props = ['--bg-color', '--accent-color', '--text-color', '--accent-glow', '--song-title-color', '--chord-color', '--chord-color-alt', '--SangreCristo'];
      props.forEach(p => {
        document.body.style.removeProperty(p);
        document.documentElement.style.removeProperty(p);
      });
      
      applyBookTheme();
    });
  }

  // Restaurar por defecto para Colores del Canto
  const resetCantoColorsBtn = document.getElementById('reset-canto-colors-btn');
  if (resetCantoColorsBtn) {
    resetCantoColorsBtn.addEventListener('click', () => {
      const suffixes = ['dark', 'light', 'sepia'];
      suffixes.forEach(suffix => {
        localStorage.removeItem(`book-theme-song-title-${suffix}`);
        localStorage.removeItem(`book-theme-chord-${suffix}`);
        localStorage.removeItem(`book-theme-chord-alt-${suffix}`);
        localStorage.removeItem(`book-theme-footer-link-${suffix}`);
      });
      localStorage.removeItem('book-theme-song-title');
      localStorage.removeItem('book-theme-chord');
      localStorage.removeItem('book-theme-chord-alt');
      localStorage.removeItem('book-theme-footer-link');
      
      ['--song-title-color', '--chord-color', '--chord-color-alt', '--SangreCristo'].forEach(p => {
        document.body.style.removeProperty(p);
        document.documentElement.style.removeProperty(p);
      });
      applyBookTheme();
    });
  }

  // Restaurar por defecto para Colores de Etapas
  const resetStageColorsBtn = document.getElementById('reset-stage-colors-btn');
  if (resetStageColorsBtn) {
    resetStageColorsBtn.addEventListener('click', () => {
      ['pre', 'cate', 'ele', 'lit', 'cat'].forEach(stg => {
        localStorage.removeItem(`stage-color-${stg}`);
        document.body.style.removeProperty(`--color-${stg}`);
        document.documentElement.style.removeProperty(`--color-${stg}`);
      });
      applyStageColors();
    });
  }

  // Restaurar por defecto para Personalizar Botones
  const resetBtnColorsBtn = document.getElementById('reset-btn-colors-btn');
  if (resetBtnColorsBtn) {
    resetBtnColorsBtn.addEventListener('click', () => {
      ['pre', 'cate', 'ele', 'lit', 'cat'].forEach(stg => {
        localStorage.removeItem(`btn-color-${stg}-default`);
        localStorage.removeItem(`btn-color-${stg}-active`);
        localStorage.removeItem(`btn-color-${stg}-text`);
        document.body.style.removeProperty(`--color-${stg}-active`);
        document.body.style.removeProperty(`--text-${stg}`);
        document.documentElement.style.removeProperty(`--color-${stg}-active`);
        document.documentElement.style.removeProperty(`--text-${stg}`);
      });
      applyStageColors();
    });
  }

  // El control de visibilidad de secciones de tema se ha centralizado y portado a ajustes.js usando pestañas de carpeta.

  // ══════════════════════════════════════════════════
  // PESTAÑA: PREPARAR CANTO — Cabecera de grupo
  // ══════════════════════════════════════════════════
  (function initPrepararCanto() {
    const colorInput  = document.getElementById('preparar-header-color');
    const sizeInput   = document.getElementById('preparar-header-size');
    const sizeLabel   = document.getElementById('preparar-header-size-label');
    const boldOnBtn   = document.getElementById('preparar-bold-on');
    const boldOffBtn  = document.getElementById('preparar-bold-off');
    const resetBtn    = document.getElementById('preparar-header-reset');
    const prevText    = document.getElementById('prev-preparar-texto');
    const prevColor   = document.getElementById('prev-preparar-color');

    function applyPreparar() {
      const c = localStorage.getItem('cat-header-color');
      const s = localStorage.getItem('cat-header-font-size');
      const w = localStorage.getItem('cat-header-font-weight');
      if (c) document.documentElement.style.setProperty('--cat-header-color', c);
      if (s) document.documentElement.style.setProperty('--cat-header-font-size', s + 'px');
      if (w) document.documentElement.style.setProperty('--cat-header-font-weight', w);
    }

    function updatePreview() {
      if (!prevText) return;
      const c = localStorage.getItem('cat-header-color') || '#d01212';
      const s = localStorage.getItem('cat-header-font-size') || '16';
      const w = localStorage.getItem('cat-header-font-weight') || '700';
      prevText.style.color      = c;
      prevText.style.fontSize   = s + 'px';
      prevText.style.fontWeight = w;
      if (prevColor) prevColor.style.backgroundColor = c;
    }

    function setBold(w) {
      localStorage.setItem('cat-header-font-weight', w);
      document.documentElement.style.setProperty('--cat-header-font-weight', w);
      if (boldOnBtn)  boldOnBtn.classList.toggle('active', w === '700');
      if (boldOffBtn) boldOffBtn.classList.toggle('active', w === '400');
      updatePreview();
    }

    // Inicializar valores desde localStorage
    const savedC = localStorage.getItem('cat-header-color')       || '#d01212';
    const savedS = localStorage.getItem('cat-header-font-size')   || '16';
    const savedW = localStorage.getItem('cat-header-font-weight') || '700';
    if (colorInput)  colorInput.value  = savedC;
    if (sizeInput)   sizeInput.value   = savedS;
    if (sizeLabel)   sizeLabel.textContent = savedS + 'px';
    applyPreparar();
    setBold(savedW);
    updatePreview();

    if (colorInput) colorInput.addEventListener('input', e => {
      localStorage.setItem('cat-header-color', e.target.value);
      document.documentElement.style.setProperty('--cat-header-color', e.target.value);
      updatePreview();
    });

    if (sizeInput) sizeInput.addEventListener('input', e => {
      localStorage.setItem('cat-header-font-size', e.target.value);
      document.documentElement.style.setProperty('--cat-header-font-size', e.target.value + 'px');
      if (sizeLabel) sizeLabel.textContent = e.target.value + 'px';
      updatePreview();
    });

    if (boldOnBtn)  boldOnBtn.addEventListener('click',  () => setBold('700'));
    if (boldOffBtn) boldOffBtn.addEventListener('click', () => setBold('400'));

    if (resetBtn) resetBtn.addEventListener('click', () => {
      localStorage.removeItem('cat-header-color');
      localStorage.removeItem('cat-header-font-size');
      localStorage.removeItem('cat-header-font-weight');
      document.documentElement.style.removeProperty('--cat-header-color');
      document.documentElement.style.removeProperty('--cat-header-font-size');
      document.documentElement.style.removeProperty('--cat-header-font-weight');
      if (colorInput) colorInput.value = '#d01212';
      if (sizeInput)  { sizeInput.value = '16'; if (sizeLabel) sizeLabel.textContent = '16px'; }
      setBold('700');
    });
  })();

  // ══════════════════════════════════════════════════
  // PESTAÑA: PERFIL — Cabecera de grupo
  // ══════════════════════════════════════════════════
  (function initPerfilCanto() {
    const colorInput  = document.getElementById('perfil-header-color');
    const sizeInput   = document.getElementById('perfil-header-size');
    const sizeLabel   = document.getElementById('perfil-header-size-label');
    const boldOnBtn   = document.getElementById('perfil-bold-on');
    const boldOffBtn  = document.getElementById('perfil-bold-off');
    const resetBtn    = document.getElementById('perfil-header-reset');
    const prevText    = document.getElementById('prev-perfil-texto');
    const prevColor   = document.getElementById('prev-perfil-color');

    function applyPerfil() {
      const c = localStorage.getItem('perfil-header-color');
      const s = localStorage.getItem('perfil-header-font-size');
      const w = localStorage.getItem('perfil-header-font-weight');
      if (c) document.documentElement.style.setProperty('--perfil-header-color', c);
      if (s) document.documentElement.style.setProperty('--perfil-header-font-size', s + 'px');
      if (w) document.documentElement.style.setProperty('--perfil-header-font-weight', w);
    }

    function updatePreview() {
      if (!prevText) return;
      const c = localStorage.getItem('perfil-header-color') || '#d01212';
      const s = localStorage.getItem('perfil-header-font-size') || '16';
      const w = localStorage.getItem('perfil-header-font-weight') || '700';
      prevText.style.color      = c;
      prevText.style.fontSize   = s + 'px';
      prevText.style.fontWeight = w;
      if (prevColor) prevColor.style.backgroundColor = c;
    }

    function setBold(w) {
      localStorage.setItem('perfil-header-font-weight', w);
      document.documentElement.style.setProperty('--perfil-header-font-weight', w);
      if (boldOnBtn)  boldOnBtn.classList.toggle('active', w === '700');
      if (boldOffBtn) boldOffBtn.classList.toggle('active', w === '400');
      updatePreview();
    }

    const savedC = localStorage.getItem('perfil-header-color')       || '#d01212';
    const savedS = localStorage.getItem('perfil-header-font-size')   || '16';
    const savedW = localStorage.getItem('perfil-header-font-weight') || '700';
    if (colorInput)  colorInput.value  = savedC;
    if (sizeInput)   sizeInput.value   = savedS;
    if (sizeLabel)   sizeLabel.textContent = savedS + 'px';
    applyPerfil();
    setBold(savedW);
    updatePreview();

    if (colorInput) colorInput.addEventListener('input', e => {
      localStorage.setItem('perfil-header-color', e.target.value);
      document.documentElement.style.setProperty('--perfil-header-color', e.target.value);
      updatePreview();
    });

    if (sizeInput) sizeInput.addEventListener('input', e => {
      localStorage.setItem('perfil-header-font-size', e.target.value);
      document.documentElement.style.setProperty('--perfil-header-font-size', e.target.value + 'px');
      if (sizeLabel) sizeLabel.textContent = e.target.value + 'px';
      updatePreview();
    });

    if (boldOnBtn)  boldOnBtn.addEventListener('click',  () => setBold('700'));
    if (boldOffBtn) boldOffBtn.addEventListener('click', () => setBold('400'));

    if (resetBtn) resetBtn.addEventListener('click', () => {
      localStorage.removeItem('perfil-header-color');
      localStorage.removeItem('perfil-header-font-size');
      localStorage.removeItem('perfil-header-font-weight');
      document.documentElement.style.removeProperty('--perfil-header-color');
      document.documentElement.style.removeProperty('--perfil-header-font-size');
      document.documentElement.style.removeProperty('--perfil-header-font-weight');
      if (colorInput) colorInput.value = '#d01212';
      if (sizeInput)  { sizeInput.value = '16'; if (sizeLabel) sizeLabel.textContent = '16px'; }
      setBold('700');
    });
  })();

  // ── Personalización: Preparación Canto (Cabecera de Grupo de Categoría) ──
  function applyCatHeaderStyles() {
    const color = localStorage.getItem('cat-header-color');
    const size  = localStorage.getItem('cat-header-font-size');
    const weight = localStorage.getItem('cat-header-font-weight');
    if (color)  document.documentElement.style.setProperty('--cat-header-color', color);
    if (size)   document.documentElement.style.setProperty('--cat-header-font-size', size + 'px');
    if (weight) document.documentElement.style.setProperty('--cat-header-font-weight', weight);
  }
  applyCatHeaderStyles();

  function updateCatHeaderPreview() {
    const el = document.getElementById('preview-cat-header-text');
    if (!el) return;
    const color  = localStorage.getItem('cat-header-color') || getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#d01212';
    const size   = localStorage.getItem('cat-header-font-size') || '16';
    const weight = localStorage.getItem('cat-header-font-weight') || '700';
    el.style.color = color;
    el.style.fontSize = size + 'px';
    el.style.fontWeight = weight;
  }

  // Inicializar inputs de Preparación Canto
  const catColorInput  = document.getElementById('cat-header-color-input');
  const catSizeInput   = document.getElementById('cat-header-size-input');
  const catSizeDisplay = document.getElementById('cat-header-size-display');
  const catBoldBtn     = document.getElementById('cat-header-bold-btn');
  const catNormalBtn   = document.getElementById('cat-header-normal-btn');
  const resetCatBtn    = document.getElementById('reset-cat-header-btn');

  if (catColorInput) {
    const savedColor = localStorage.getItem('cat-header-color');
    if (savedColor) catColorInput.value = savedColor;
    catColorInput.addEventListener('input', (e) => {
      const val = e.target.value;
      localStorage.setItem('cat-header-color', val);
      document.documentElement.style.setProperty('--cat-header-color', val);
      const previewLabel = document.getElementById('preview-cat-header-color');
      if (previewLabel) previewLabel.style.backgroundColor = val;
      updateCatHeaderPreview();
    });
  }

  if (catSizeInput && catSizeDisplay) {
    const savedSize = localStorage.getItem('cat-header-font-size') || '16';
    catSizeInput.value = savedSize;
    catSizeDisplay.textContent = savedSize + 'px';
    catSizeInput.addEventListener('input', (e) => {
      const val = e.target.value;
      localStorage.setItem('cat-header-font-size', val);
      document.documentElement.style.setProperty('--cat-header-font-size', val + 'px');
      catSizeDisplay.textContent = val + 'px';
      updateCatHeaderPreview();
    });
  }

  function setCatHeaderBold(weight) {
    localStorage.setItem('cat-header-font-weight', weight);
    document.documentElement.style.setProperty('--cat-header-font-weight', weight);
    updateCatHeaderPreview();
    if (catBoldBtn)   catBoldBtn.classList.toggle('active', weight === '700');
    if (catNormalBtn) catNormalBtn.classList.toggle('active', weight === '400');
  }

  if (catBoldBtn)   catBoldBtn.addEventListener('click', () => setCatHeaderBold('700'));
  if (catNormalBtn) catNormalBtn.addEventListener('click', () => setCatHeaderBold('400'));

  // Marcar el botón activo al iniciar
  const initCatWeight = localStorage.getItem('cat-header-font-weight') || '700';
  setCatHeaderBold(initCatWeight);

  if (resetCatBtn) {
    resetCatBtn.addEventListener('click', () => {
      localStorage.removeItem('cat-header-color');
      localStorage.removeItem('cat-header-font-size');
      localStorage.removeItem('cat-header-font-weight');
      document.documentElement.style.removeProperty('--cat-header-color');
      document.documentElement.style.removeProperty('--cat-header-font-size');
      document.documentElement.style.removeProperty('--cat-header-font-weight');
      if (catColorInput)  catColorInput.value = '#d01212';
      if (catSizeInput)   { catSizeInput.value = '16'; catSizeDisplay.textContent = '16px'; }
      setCatHeaderBold('700');
    });
  }

  updateCatHeaderPreview();

  // ── Personalización: Perfil (Cabecera de Grupo de Categoría en Perfil) ──
  function applyPerfilHeaderStyles() {
    const color  = localStorage.getItem('perfil-header-color');
    const size   = localStorage.getItem('perfil-header-font-size');
    const weight = localStorage.getItem('perfil-header-font-weight');
    if (color)  document.documentElement.style.setProperty('--perfil-header-color', color);
    if (size)   document.documentElement.style.setProperty('--perfil-header-font-size', size + 'px');
    if (weight) document.documentElement.style.setProperty('--perfil-header-font-weight', weight);
  }
  applyPerfilHeaderStyles();

  function updatePerfilHeaderPreview() {
    const el = document.getElementById('preview-perfil-header-text');
    if (!el) return;
    const color  = localStorage.getItem('perfil-header-color') || getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#d01212';
    const size   = localStorage.getItem('perfil-header-font-size') || '16';
    const weight = localStorage.getItem('perfil-header-font-weight') || '700';
    el.style.color = color;
    el.style.fontSize = size + 'px';
    el.style.fontWeight = weight;
  }

  const perfilColorInput  = document.getElementById('perfil-header-color-input');
  const perfilSizeInput   = document.getElementById('perfil-header-size-input');
  const perfilSizeDisplay = document.getElementById('perfil-header-size-display');
  const perfilBoldBtn     = document.getElementById('perfil-header-bold-btn');
  const perfilNormalBtn   = document.getElementById('perfil-header-normal-btn');
  const resetPerfilBtn    = document.getElementById('reset-perfil-header-btn');

  if (perfilColorInput) {
    const savedColor = localStorage.getItem('perfil-header-color');
    if (savedColor) perfilColorInput.value = savedColor;
    perfilColorInput.addEventListener('input', (e) => {
      const val = e.target.value;
      localStorage.setItem('perfil-header-color', val);
      document.documentElement.style.setProperty('--perfil-header-color', val);
      const previewLabel = document.getElementById('preview-perfil-header-color');
      if (previewLabel) previewLabel.style.backgroundColor = val;
      updatePerfilHeaderPreview();
    });
  }

  if (perfilSizeInput && perfilSizeDisplay) {
    const savedSize = localStorage.getItem('perfil-header-font-size') || '16';
    perfilSizeInput.value = savedSize;
    perfilSizeDisplay.textContent = savedSize + 'px';
    perfilSizeInput.addEventListener('input', (e) => {
      const val = e.target.value;
      localStorage.setItem('perfil-header-font-size', val);
      document.documentElement.style.setProperty('--perfil-header-font-size', val + 'px');
      perfilSizeDisplay.textContent = val + 'px';
      updatePerfilHeaderPreview();
    });
  }

  function setPerfilHeaderBold(weight) {
    localStorage.setItem('perfil-header-font-weight', weight);
    document.documentElement.style.setProperty('--perfil-header-font-weight', weight);
    updatePerfilHeaderPreview();
    if (perfilBoldBtn)   perfilBoldBtn.classList.toggle('active', weight === '700');
    if (perfilNormalBtn) perfilNormalBtn.classList.toggle('active', weight === '400');
  }

  if (perfilBoldBtn)   perfilBoldBtn.addEventListener('click', () => setPerfilHeaderBold('700'));
  if (perfilNormalBtn) perfilNormalBtn.addEventListener('click', () => setPerfilHeaderBold('400'));

  const initPerfilWeight = localStorage.getItem('perfil-header-font-weight') || '700';
  setPerfilHeaderBold(initPerfilWeight);

  if (resetPerfilBtn) {
    resetPerfilBtn.addEventListener('click', () => {
      localStorage.removeItem('perfil-header-color');
      localStorage.removeItem('perfil-header-font-size');
      localStorage.removeItem('perfil-header-font-weight');
      document.documentElement.style.removeProperty('--perfil-header-color');
      document.documentElement.style.removeProperty('--perfil-header-font-size');
      document.documentElement.style.removeProperty('--perfil-header-font-weight');
      if (perfilColorInput)  perfilColorInput.value = '#d01212';
      if (perfilSizeInput)   { perfilSizeInput.value = '16'; perfilSizeDisplay.textContent = '16px'; }
      setPerfilHeaderBold('700');
    });
  }

  updatePerfilHeaderPreview();

  // Personalizar colores del Navegador (Normal y Efecto Hover)
  document.querySelectorAll('.nav-theme-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const type = input.dataset.type;
      const mode = input.dataset.mode || 'normal';
      const color = e.target.value;
      const key = mode === 'hover' ? `nav-color-${type}-hover` : `nav-color-${type}`;
      localStorage.setItem(key, color);

      // Compatibilidad de nombres de clave alternativos para btn-bg e wrapper-bg
      if (mode === 'hover' && type === 'btn-bg') {
        localStorage.setItem('nav-color-btn-hover-bg', color);
      } else if (mode === 'hover' && type === 'wrapper-bg') {
        localStorage.setItem('nav-color-wrapper-hover-bg', color);
      }

      if (typeof window.applyNavTheme === 'function') window.applyNavTheme();
      updateNavInputs();
    });
  });

  const resetNavThemeBtn = document.getElementById('reset-nav-theme-btn');
  if (resetNavThemeBtn) {
    resetNavThemeBtn.addEventListener('click', () => {
      const doReset = () => {
        const keys = [
          'nav-color-text', 'nav-color-text-hover',
          'nav-color-bg', 'nav-color-bg-hover',
          'nav-color-btn-bg', 'nav-color-btn-bg-hover', 'nav-color-btn-hover-bg',
          'nav-color-icon', 'nav-color-icon-hover',
          'nav-color-submenu-icon', 'nav-color-submenu-icon-hover',
          'nav-color-wrapper-bg', 'nav-color-wrapper-bg-hover', 'nav-color-wrapper-hover-bg'
        ];
        keys.forEach(k => localStorage.removeItem(k));
        if (typeof window.applyNavTheme === 'function') window.applyNavTheme();
        updateNavInputs();
      };

      if (window.mostrarConfirmacion) {
        window.mostrarConfirmacion({
          titulo: 'Restaurar Colores',
          mensaje: '¿Desea restaurar todos los colores del navegador a sus valores por defecto?',
          icono: 'palette',
          textoSi: 'Sí',
          textoNo: 'No',
          onConfirm: doReset
        });
      } else {
        doReset();
      }
    });
  }


  
  // Control de Edición de Acordes
  const toggleChordEditBtn = document.getElementById('toggle-chord-edit-btn');
  const saveChordPositionsBtn = document.getElementById('save-chord-positions-btn');
  const toolbarChordEditBtn = document.getElementById('toolbar-chord-edit-btn');
  const toolbarSaveChordBtn = document.getElementById('toolbar-save-chord-btn');

  if (toggleChordEditBtn) {
    toggleChordEditBtn.addEventListener('click', toggleChordEditMode);
  }
  if (saveChordPositionsBtn) {
    saveChordPositionsBtn.addEventListener('click', saveChordPositionsAction);
  }
  if (toolbarChordEditBtn) {
    toolbarChordEditBtn.addEventListener('click', toggleChordEditMode);
  }
  if (toolbarSaveChordBtn) {
    toolbarSaveChordBtn.addEventListener('click', saveChordPositionsAction);
  }

  // Cerrar con Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const chordModal = document.getElementById('chord-modal');
      const settingsModal = document.getElementById('settings-modal');
      if (chordModal) chordModal.style.display = 'none';
      if (settingsModal && settingsModal.style.display !== 'none') {
        settingsModal.style.display = 'none';
        if (typeof window.guardarAjustesEnNube === 'function') {
          window.guardarAjustesEnNube();
        }
      }
    }
  });
  
  // Recalcular posiciones en resize de pantalla (sin afectar el teclado móvil)
  let resizeTimeout;
  let lastContentResizeWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    const currentWidth = window.innerWidth;
    if (currentWidth === lastContentResizeWidth) return;
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
    }
    lastContentResizeWidth = currentWidth;

    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (currentCanto) renderSongContent();
    }, 150);
  });

  // --- Autenticación y Cuenta de Usuario ---
  const authLoginBtn = document.getElementById('auth-login-btn');
  const authLogoutBtn = document.getElementById('auth-logout-btn');
  const authUpdateBtn = document.getElementById('auth-update-btn');
  
  if (authLoginBtn) {
    authLoginBtn.addEventListener('click', async () => {
      try {
        authLoginBtn.disabled = true;
        authLoginBtn.textContent = 'Conectando...';
        await loginMock();
      } catch (err) {
        console.error('Error al iniciar sesión:', err);
        if (err && err.code !== 'auth/popup-closed-by-user') {
          alert('Error al iniciar sesión: ' + (err.message || err));
        }
      } finally {
        authLoginBtn.disabled = false;
        const unauthEl = document.getElementById('auth-unauthenticated');
        if (unauthEl && unauthEl.style.display !== 'none') {
          authLoginBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" style="background: white; border-radius: 50%; padding: 2px;">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            Iniciar Sesión con Google
          `;
        }
      }
    });
  }

  if (authLogoutBtn) {
    authLogoutBtn.addEventListener('click', () => {
      logoutMock();
    });
  }

  if (authUpdateBtn) {
    authUpdateBtn.addEventListener('click', async () => {
      if (!navigator.onLine) {
        if (window.mostrarAlerta) {
          window.mostrarAlerta({
            titulo: 'Sin Conexión',
            mensaje: 'No puede Actualizar sin internet',
            icono: 'wifi_off'
          });
        } else {
          alert("⚠️ No puede Actualizar sin internet");
        }
        return;
      }
      try {
        if (window.mostrarProgreso) {
          window.mostrarProgreso({
            titulo: 'Actualizando App',
            mensaje: 'Limpiando caché completa y forzando recarga (Ctrl + Shift + R)...',
            icono: 'system_update'
          });
        }

        authUpdateBtn.disabled = true;
        authUpdateBtn.textContent = 'Actualizando...';
        
        // 1. Limpiar toda la caché del Cache Storage
        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(
            cacheKeys.map(key => caches.delete(key))
          );
          console.log('[App] Caché de CacheStorage eliminada por completo.');
        }
        
        // 2. Desregistrar todos los Service Workers activos
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map(registration => registration.unregister())
          );
          console.log('[App] Service Workers desregistrados.');
        }
        
        // 3. Forzar recarga con timestamp de ruptura de caché (equivalente a Ctrl + Shift + R)
        setTimeout(() => {
          const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
          window.location.href = cleanUrl + '?nocache=' + Date.now();
        }, 800);
      } catch (err) {
        if (window.ocultarProgreso) window.ocultarProgreso();
        console.error('Error al actualizar la app:', err);
        alert('Ocurrió un error al actualizar: ' + err.message);
        authUpdateBtn.disabled = false;
        authUpdateBtn.textContent = 'Actualizar App';
      }
    });
  }

  const authPullPositionsBtn = document.getElementById('auth-pull-positions-btn');
  if (authPullPositionsBtn) {
    authPullPositionsBtn.addEventListener('click', async () => {
      try {
        authPullPositionsBtn.disabled = true;
        authPullPositionsBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> Sincronizando...';
        
        const response = await fetch('/api/pull-positions', {
          method: 'POST'
        });
        if (!response.ok) {
          let errMsg = 'No se pudo conectar con el servidor local o Firebase.';
          try {
            const errData = await response.json();
            if (errData && errData.error) errMsg = errData.error;
          } catch (e) {}
          throw new Error(errMsg);
        }
        const data = await response.json();
        if (data.success) {
          alert(`¡Sincronización exitosa! Se actualizaron ${data.count} cantos en el archivo local.`);
          // Recargar las posiciones en memoria
          const localResponse = await fetch('data/chord_positions.json');
          if (localResponse.ok) {
            defaultChordPositions = await localResponse.json();
          }
          if (currentCanto) renderSongContent();
        } else {
          throw new Error(data.error || 'Respuesta fallida.');
        }
      } catch (err) {
        console.error('Error al sincronizar desde Firebase:', err);
        alert('Error al sincronizar: ' + err.message);
      } finally {
        authPullPositionsBtn.disabled = false;
        authPullPositionsBtn.innerHTML = '<span class="material-symbols-outlined">cloud_download</span> Sincronizar desde Firebase';
      }
    });
  }

  // Escuchar cambios de autenticación
  onAuthStateChanged((user) => {
    isAdmin = isCurrentUserAdmin();
    if (user) {
      trackLoggedInUser(user);
      listenToOwnUserPermissionsSilently(user);
      
      // Descargar y aplicar preferencias personales de Ajustes desde la nube
      if (typeof window.cargarAjustesDesdeNube === 'function') {
        window.cargarAjustesDesdeNube().then(() => {
          if (typeof window.initAjustes === 'function') {
            window.initAjustes();
          }
        });
      }
    }
    updateExtrasTabVisibility();
    
    updateAccessControlVisibility();

    const authUnauthenticated = document.getElementById('auth-unauthenticated');
    const authAuthenticated = document.getElementById('auth-authenticated');
    const authUserEmail = document.getElementById('auth-user-email');
    const authAdminBadge = document.getElementById('auth-admin-badge');
    const authRegularBadge = document.getElementById('auth-regular-badge');
    const chordEditSettingRow = document.getElementById('chord-edit-setting-row');
    const toolbarChordEditBtn = document.getElementById('toolbar-chord-edit-btn');
    const authAdminActions = document.getElementById('auth-admin-actions');
    
    if (user) {
      if (authUnauthenticated) authUnauthenticated.style.display = 'none';
      if (authAuthenticated) authAuthenticated.style.display = 'block';
      
      const authUserPhoto = document.getElementById('auth-user-photo');
      const authUserIcon = document.getElementById('auth-user-icon');
      const authUserWelcome = document.getElementById('auth-user-welcome');

      if (user.photoURL && authUserPhoto) {
        authUserPhoto.src = user.photoURL;
        authUserPhoto.style.display = 'block';
        if (authUserIcon) authUserIcon.style.display = 'none';
      } else {
        if (authUserPhoto) authUserPhoto.style.display = 'none';
        if (authUserIcon) authUserIcon.style.display = 'block';
      }

      if (authUserWelcome) {
        const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Hermano');
        authUserWelcome.textContent = `Bienvenido: ${displayName}`;
      }

      if (authUserEmail) authUserEmail.textContent = user.email;
      
      if (authAdminBadge) authAdminBadge.style.display = isAdmin ? 'inline-flex' : 'none';
      if (authRegularBadge) {
        authRegularBadge.style.display = isAdmin ? 'none' : 'inline-flex';
        try {
          const state = getAccessControlState();
          const emailKey = user.email ? user.email.toLowerCase().trim() : '';
          const userGroups = state ? state.userDirectGroups[emailKey] : null;
          if (userGroups && userGroups.size > 0) {
            const gid = Array.from(userGroups)[0];
            const groupObj = state.groups[gid];
            const groupName = groupObj ? groupObj.name : 'Cantor';
            authRegularBadge.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;">person</span> Hermano (${groupName})`;
          } else {
            authRegularBadge.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;">person</span> Hermano Cantor`;
          }
        } catch (e) {
          authRegularBadge.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;">person</span> Hermano Cantor`;
        }
      }
      if (chordEditSettingRow) chordEditSettingRow.style.display = isAdmin ? 'flex' : 'none';
      if (toolbarChordEditBtn) toolbarChordEditBtn.style.display = isAdmin ? 'inline-flex' : 'none';
      if (authAdminActions) authAdminActions.style.display = isAdmin ? 'block' : 'none';
    } else {
      if (authUnauthenticated) authUnauthenticated.style.display = 'block';
      if (authAuthenticated) authAuthenticated.style.display = 'none';
      if (chordEditSettingRow) chordEditSettingRow.style.display = 'none';
      if (toolbarChordEditBtn) toolbarChordEditBtn.style.display = 'none';
      if (authAdminActions) authAdminActions.style.display = 'none';
      
      // Desactivar modo edición si el usuario cierra sesión
      if (isChordEditMode) {
        isChordEditMode = false;
        if (currentCanto) renderSongContent();
      }
    }
    updateChordEditUI();
  });

  // Menú Desplegable en Móviles/Tablets (Derecha)
  const dropdownTrigger = document.getElementById('toolbar-dropdown-trigger');
  const dropdownContent = document.getElementById('toolbar-dropdown-content');
  if (dropdownTrigger && dropdownContent) {
    dropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownContent.classList.toggle('show');
    });
    
    document.addEventListener('click', (e) => {
      if (!dropdownTrigger.contains(e.target) && !dropdownContent.contains(e.target)) {
        dropdownContent.classList.remove('show');
      }
    });
  }

  // Disparador compacto de Tono/Cejilla en Móviles/Tablets (Izquierda) - Abre directamente el modal
  const toneDropdownTrigger = document.getElementById('tone-dropdown-trigger');
  if (toneDropdownTrigger) {
    toneDropdownTrigger.addEventListener('click', () => {
      if (!currentCanto) return;
      const currentTransposedNote = transposeNote(originalSongKey, currentKeyOffset);
      showChordDiagram(currentTransposedNote, originalSongTypeSuffix || '');
    });
  }

  // Cejilla (Capo) selector inside Chord Modal
  const modalCapoSelect = document.getElementById('modal-capo-select');
  if (modalCapoSelect) {
    modalCapoSelect.addEventListener('change', () => {
      if (!currentCanto) return;
      const selectedCapo = parseInt(modalCapoSelect.value) || 0;
      if (capoSelect) {
        capoSelect.value = selectedCapo;
        capoSelect.dispatchEvent(new Event('change'));
      }
    });
  }

  // --- Personalización Dinámica y Reordenamiento de Iconos (Celular, Tablet, PC) ---
  const ICON_LABELS = {
    search: { label: 'Buscador Rápido', icon: 'search' },
    chord: { label: 'Transportar / Acordes (♪)', icon: 'music_note' },
    favorite: { label: 'Marcar Favorito (★)', icon: 'star' },
    split: { label: 'Vista en 2 Columnas (📖)', icon: 'menu_book' },
    asamblea: { label: 'Alternar Asamblea (👁)', icon: 'visibility' },
    audio: { label: 'Reproducir Audio (▶)', icon: 'play_arrow' },
    scroll: { label: 'Auto-desplazamiento (↓)', icon: 'south' },
    prev: { label: 'Canto Anterior (◄)', icon: 'arrow_left' },
    next: { label: 'Canto Siguiente (►)', icon: 'arrow_right' },
    settings: { label: 'Ajustes / Configuración (⚙)', icon: 'settings' }
  };

  const DEFAULT_TOOLBAR_CONFIG = {
    mobile: [
      { key: 'chord', inMenu: true },
      { key: 'favorite', inMenu: true },
      { key: 'asamblea', inMenu: true },
      { key: 'audio', inMenu: true },
      { key: 'scroll', inMenu: false },
      { key: 'prev', inMenu: false },
      { key: 'next', inMenu: false },
      { key: 'settings', inMenu: true },
      { key: 'split', inMenu: true },
      { key: 'search', inMenu: true }
    ],
    tablet: [
      { key: 'chord', inMenu: true },
      { key: 'favorite', inMenu: false },
      { key: 'asamblea', inMenu: false },
      { key: 'audio', inMenu: false },
      { key: 'scroll', inMenu: false },
      { key: 'prev', inMenu: false },
      { key: 'next', inMenu: false },
      { key: 'settings', inMenu: false },
      { key: 'split', inMenu: false },
      { key: 'search', inMenu: false }
    ],
    pc: [
      { key: 'search', inMenu: false },
      { key: 'chord', inMenu: false },
      { key: 'favorite', inMenu: false },
      { key: 'split', inMenu: false },
      { key: 'asamblea', inMenu: false },
      { key: 'audio', inMenu: false },
      { key: 'scroll', inMenu: false },
      { key: 'prev', inMenu: false },
      { key: 'next', inMenu: false },
      { key: 'settings', inMenu: false }
    ]
  };

  function getToolbarIconConfig() {
    try {
      const saved = localStorage.getItem('toolbar_icon_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        ['mobile', 'tablet', 'pc'].forEach(device => {
          if (parsed[device] && !Array.isArray(parsed[device])) {
            const oldObj = parsed[device];
            parsed[device] = Object.keys(ICON_LABELS).map(key => ({
              key,
              inMenu: oldObj[key] === false
            }));
          } else if (Array.isArray(parsed[device])) {
            parsed[device].forEach(it => {
              if (it.visible !== undefined && it.inMenu === undefined) {
                it.inMenu = !it.visible;
                delete it.visible;
              }
            });
            const existingKeys = parsed[device].map(it => it.key);
            Object.keys(ICON_LABELS).forEach(k => {
              if (!existingKeys.includes(k)) {
                const defVal = DEFAULT_TOOLBAR_CONFIG[device]?.find(d => d.key === k);
                parsed[device].push({ key: k, inMenu: defVal ? defVal.inMenu : false });
              }
            });
          }
        });
        return parsed;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_CONFIG));
  }

  function saveToolbarIconConfig(config) {
    localStorage.setItem('toolbar_icon_config', JSON.stringify(config));
    adjustToolbarForScreenSize(true);
    updateToolbarUIFromConfig();
  }

  const deviceSelect = document.getElementById('toolbar-device-select');
  const reorderContainer = document.getElementById('toolbar-icons-reorder-container');
  const resetToolbarIconsBtn = document.getElementById('reset-toolbar-icons-btn');

  function updateToolbarUIFromConfig() {
    if (!deviceSelect || !reorderContainer) return;
    const currentDevice = deviceSelect.value;
    const config = getToolbarIconConfig();
    const items = config[currentDevice] || DEFAULT_TOOLBAR_CONFIG[currentDevice];

    reorderContainer.innerHTML = '';
    const inMenuCount = items.filter(it => it.inMenu).length;

    items.forEach((item, index) => {
      const info = ICON_LABELS[item.key] || { label: item.key, icon: 'extension' };
      const isOnBar = !item.inMenu;
      const isLastInMenu = item.inMenu && inMenuCount <= 1;

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--panel-bg, #fff); border-radius: 8px; border: 1px solid var(--panel-border, #ccc); margin-bottom: 4px;';

      row.innerHTML = `
        <label style="display: flex; align-items: center; gap: 10px; font-size: 0.88rem; color: var(--text-color); cursor: pointer; flex-grow: 1;" title="${isOnBar ? 'En la barra superior' : 'En el menú desplegable ≡'}">
          <input type="checkbox" class="toolbar-icon-checkbox" data-index="${index}" ${isOnBar ? 'checked' : ''} ${isLastInMenu ? 'disabled title="Debe quedar al menos 1 icono dentro del menú desplegable ≡ para que no desaparezca"' : ''}>
          <span class="material-symbols-outlined" style="font-size: 1.15rem;">${info.icon}</span>
          <span style="font-weight: 600;">${info.label}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-left: 4px;">${isOnBar ? '(en barra)' : '(en menú ≡)'}</span>
        </label>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button class="btn btn-order-up" data-index="${index}" title="Subir orden" style="padding: 2px 8px; border-radius: 4px; border: 1px solid var(--panel-border); background: var(--input-bg); cursor: pointer; font-size: 0.8rem;" ${index === 0 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>▲</button>
          <button class="btn btn-order-down" data-index="${index}" title="Bajar orden" style="padding: 2px 8px; border-radius: 4px; border: 1px solid var(--panel-border); background: var(--input-bg); cursor: pointer; font-size: 0.8rem;" ${index === items.length - 1 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>▼</button>
        </div>
      `;

      // Listener de la casilla de verificación (Marcado = En la barra superior, Desmarcado = En menú ≡)
      const cb = row.querySelector('.toolbar-icon-checkbox');
      cb.addEventListener('change', (e) => {
        const fullConfig = getToolbarIconConfig();
        fullConfig[currentDevice][index].inMenu = !e.target.checked;
        saveToolbarIconConfig(fullConfig);
      });

      // Listener de subir en el orden
      const btnUp = row.querySelector('.btn-order-up');
      if (btnUp && index > 0) {
        btnUp.addEventListener('click', () => {
          const fullConfig = getToolbarIconConfig();
          const list = fullConfig[currentDevice];
          const temp = list[index];
          list[index] = list[index - 1];
          list[index - 1] = temp;
          saveToolbarIconConfig(fullConfig);
        });
      }

      // Listener de bajar en el orden
      const btnDown = row.querySelector('.btn-order-down');
      if (btnDown && index < items.length - 1) {
        btnDown.addEventListener('click', () => {
          const fullConfig = getToolbarIconConfig();
          const list = fullConfig[currentDevice];
          const temp = list[index];
          list[index] = list[index + 1];
          list[index + 1] = temp;
          saveToolbarIconConfig(fullConfig);
        });
      }

      reorderContainer.appendChild(row);
    });

    const selectAllRadio = document.getElementById('select-all-in-menu-radio');
    const selectNoneRadio = document.getElementById('select-none-in-menu-radio');
    if (selectAllRadio && selectNoneRadio) {
      const allOnBarExceptOne = items.filter(it => !it.inMenu).length >= items.length - 1;
      const allInMenu = items.every(it => it.inMenu);

      selectAllRadio.checked = allOnBarExceptOne && !allInMenu;
      selectNoneRadio.checked = allInMenu;
    }
  }

  const selectAllRadio = document.getElementById('select-all-in-menu-radio');
  const selectNoneRadio = document.getElementById('select-none-in-menu-radio');

  if (selectAllRadio) {
    // "Mostrar todos en la barra" -> Marcado (inMenu = false) salvo 1 elemento
    selectAllRadio.addEventListener('change', () => {
      if (!selectAllRadio.checked || !deviceSelect) return;
      const currentDevice = deviceSelect.value;
      const fullConfig = getToolbarIconConfig();
      const items = fullConfig[currentDevice] || [];

      items.forEach((it, idx) => {
        if (idx === items.length - 1) {
          it.inMenu = true;
        } else {
          it.inMenu = false;
        }
      });

      saveToolbarIconConfig(fullConfig);
    });
  }

  if (selectNoneRadio) {
    // "Mover todos al menú ≡" -> Desmarcado (inMenu = true)
    selectNoneRadio.addEventListener('change', () => {
      if (!selectNoneRadio.checked || !deviceSelect) return;
      const currentDevice = deviceSelect.value;
      const fullConfig = getToolbarIconConfig();
      const items = fullConfig[currentDevice] || [];

      items.forEach(it => {
        it.inMenu = true;
      });

      saveToolbarIconConfig(fullConfig);
    });
  }

  if (deviceSelect) {
    deviceSelect.addEventListener('change', updateToolbarUIFromConfig);
    updateToolbarUIFromConfig();
  }

  const toggleAllExceptSearchBtn = document.getElementById('toggle-all-except-search-btn');

  if (toggleAllExceptSearchBtn) {
    toggleAllExceptSearchBtn.addEventListener('click', () => {
      if (!deviceSelect) return;
      const currentDevice = deviceSelect.value;
      const fullConfig = getToolbarIconConfig();
      const items = fullConfig[currentDevice] || [];

      const nonSearchItems = items.filter(it => it.key !== 'search');
      const allInMenu = nonSearchItems.length > 0 && nonSearchItems.every(it => it.inMenu);

      const targetState = !allInMenu;
      items.forEach(it => {
        if (it.key !== 'search') {
          it.inMenu = targetState;
        }
      });

      saveToolbarIconConfig(fullConfig);
    });
  }

  if (resetToolbarIconsBtn) {
    resetToolbarIconsBtn.addEventListener('click', () => {
      saveToolbarIconConfig(JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_CONFIG)));
    });
  }

  function adjustToolbarForScreenSize() {
    const screenWidth = window.innerWidth;
    let device = 'pc';
    if (screenWidth < 600) device = 'mobile';
    else if (screenWidth <= 992) device = 'tablet';

    const items = getToolbarIconConfig()[device] || DEFAULT_TOOLBAR_CONFIG[device];
    const dropdownContent = document.getElementById('toolbar-dropdown-content');
    const toolbarRight = document.querySelector('.toolbar-right');
    const dropdownContainer = document.getElementById('toolbar-dropdown-container');

    const toneDropdownTrigger = document.getElementById('tone-dropdown-trigger');
    const toneCapoTrigger = document.getElementById('tone-capo-trigger');

    if (device !== 'pc') {
      if (toneDropdownTrigger) toneDropdownTrigger.style.display = 'inline-flex';
      if (toneCapoTrigger) toneCapoTrigger.style.display = 'none';
    } else {
      if (toneDropdownTrigger) toneDropdownTrigger.style.display = 'none';
      if (toneCapoTrigger) toneCapoTrigger.style.display = 'flex';
    }

    const iconElements = {
      search: document.querySelector('.toolbar-search-container'),
      chord: document.getElementById('chord-modal-trigger-btn'),
      favorite: document.getElementById('favorite-btn'),
      split: document.getElementById('split-layout-btn'),
      asamblea: document.getElementById('asamblea-toggle-btn'),
      audio: document.getElementById('audio-play-btn'),
      scroll: document.getElementById('scroll-play-btn'),
      prev: document.getElementById('prev-song-btn'),
      next: document.getElementById('next-song-btn'),
      settings: document.getElementById('settings-open-btn')
    };

    let itemsInDropdown = 0;

    // Insertar los elementos en el orden configurado por el usuario (excepto search que va al final a la derecha)
    items.forEach(item => {
      if (item.key === 'search') return; // Se posiciona siempre al final a la derecha

      const el = iconElements[item.key];
      if (!el) return;

      const isInMenu = item.inMenu === true;

      if (!isInMenu) {
        if (toolbarRight) {
          toolbarRight.appendChild(el);
        }
        el.style.display = 'flex';
      } else {
        if (dropdownContent) {
          dropdownContent.appendChild(el);
          el.style.display = 'flex';
          itemsInDropdown++;
        }
      }
    });

    if (dropdownContainer) {
      dropdownContainer.style.display = itemsInDropdown > 0 ? 'inline-block' : 'none';
      if (dropdownContent && itemsInDropdown === 0) {
        dropdownContent.classList.remove('show');
      }
      if (itemsInDropdown > 0 && toolbarRight) {
        toolbarRight.appendChild(dropdownContainer);
      }
    }

    // El buscador SIEMPRE debe estar en la extrema derecha de la barra superior
    const searchEl = iconElements.search || document.getElementById('toolbar-search-container');
    if (searchEl && toolbarRight) {
      toolbarRight.appendChild(searchEl);
      searchEl.style.display = 'block';
    }
  }

  adjustToolbarForScreenSize();
  let lastToolbarResizeWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    const currentWidth = window.innerWidth;
    if (currentWidth === lastToolbarResizeWidth) return;
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
    }
    lastToolbarResizeWidth = currentWidth;
    adjustToolbarForScreenSize();
  });
}

// Las funciones de zoom, fuentes, temas y preferencias han sido movidas a ajustes.js y expuestas globalmente.
