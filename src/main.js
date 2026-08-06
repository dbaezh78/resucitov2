import { registerServiceWorker } from './pwa.js';
import './navegador.js';
import { searchSongs } from './search.js';
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
  guardarTonoEnNube, 
  cargarTonoDesdeNube, 
  guardarNotaEnNube, 
  cargarNotaDesdeNube, 
  guardarPosicionesEnNube, 
  cargarPosicionesDesdeNube, 
  publicarPosicionesGlobales, 
  cargarPosicionesGlobales 
} from './sync.js';

// --- Estado Global de la SPA ---
let allSongs = [];
let filteredSongs = [];
let currentCanto = null;
let currentKeyOffset = 0; // Transposición en semitonos
let originalSongKey = 'La'; // Nota base del canto cargado
let originalSongTypeSuffix = ''; // Sufijo/variación del tono original (ej: "7", "m")
let zoomFactor = 1.0;
let transitionDirection = null;
let loadedSongsCache = {}; // Cache de cantos con letra y acordes completos

// Zoom por defecto según dispositivo
function getDefaultZoom() {
  const w = window.innerWidth;
  // Solo usar el guardado si el usuario lo cambió manualmente
  if (localStorage.getItem('font-zoom-custom') === 'true') {
    const saved = localStorage.getItem('font-zoom');
    if (saved) return parseFloat(saved);
  }
  if (w <= 384)  return 0.7;   // 📱 Celular   (≤ 384px)  =>  80%
  if (w <= 992)  return 1.4;   // 📟 Tablet    (≤ 992px)  => 150%
  return 1.0;                  // 🖥️ PC/Laptop (> 992px)  => 100%
}
let isScrollActive = false;
let scrollIntervalId = null;
let activeStage = null;
let activeMoments = [];
let allAsambleaExpanded = true;
let currentBook = 'resucito';
let favorites = new Set();
let catequesisData = null;
let defaultChordPositions = {};
let isChordEditMode = false;
let isAdmin = false; // TODO: Conectar con el sistema de usuarios. Cambiar a true para pruebas locales de administrador.

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
let scrollIntervalMs = parseInt(localStorage.getItem('scroll-interval')) || 40;
let scrollStepPx = parseInt(localStorage.getItem('scroll-step')) || 1;
let scrollIntervalLimit = parseInt(localStorage.getItem('scroll-interval-limit')) || 1000;
let scrollStepLimit = parseInt(localStorage.getItem('scroll-step-limit')) || 100;
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

const settingsModal = document.getElementById('settings-modal');
const settingsModalClose = document.getElementById('settings-modal-close');
const capoSelect = document.getElementById('capo-select');
const settingsZoomOutBtn = document.getElementById('settings-zoom-out-btn');
const settingsZoomInBtn = document.getElementById('settings-zoom-in-btn');
const settingsZoomBadge = document.getElementById('settings-zoom-badge');
const exportNotesBtn = document.getElementById('export-notes-btn');
const importNotesBtn = document.getElementById('import-notes-btn');
const dashboardSettingsBtn = document.getElementById('dashboard-settings-btn');
const listStyleBtns = document.querySelectorAll('.list-style-btn');

// Estado interno para el prontuario de acordes activo
let selectedModalNote = 'La';
let selectedModalType = 'm';
let currentEditingChordInfo = null; // Almacena { side, lineIdx, subLineIdx, chordIdx } en modo edición
let isSplitLayout = localStorage.getItem('split-layout') !== 'false';
let activeSongsPlaylist = []; // Almacena el listado activo de cantos en pantalla para navegar
let songListStyle = localStorage.getItem('song-list-style') || 'simple'; // Estilo visual de la lista: cards, detailed, simple

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
}

export const updateExtrasTabVisibility = updateBookTabsVisibility;
window.updateBookTabsVisibility = updateBookTabsVisibility;

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', async () => {
  // Registrar Service Worker
  registerServiceWorker();
  
  // Cargar preferencias guardadas
  initPreferences();
  setupAccessControlUI();
  updateBookTabsVisibility();
  
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
    // 2a. Descargar transportación
    try {
      const offset = await cargarTonoDesdeNube(songId, originalSongKey);
      if (offset !== null) {
        currentKeyOffset = offset;
        console.log(`📥 [Firebase] Transportación cargada de la nube: offset = ${offset}`);
      }
    } catch (e) {
      console.error("Error al sincronizar tono desde la nube:", e);
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

// --- Carga de Detalles de Canción ---
async function loadSongView(songId) {
  try {
    if (viewerSongTitle) {
      viewerSongTitle.textContent = "Cargando...";
    }
    if (viewerSongSubtitle) {
      viewerSongSubtitle.textContent = "";
    }
    cantoLeftCol.innerHTML = "";
    cantoRightCol.innerHTML = "";
    viewerAudioContainer.classList.remove('open');
    
    let songData;
    if (loadedSongsCache[songId]) {
      songData = loadedSongsCache[songId];
    } else {
      const response = await fetch(`data/songs/${songId}.json`);
      if (!response.ok) throw new Error('Canto no encontrado');
      songData = await response.json();
      loadedSongsCache[songId] = songData;
    }
    currentCanto = songData;
    
    // Configurar zoom por defecto según el dispositivo (Tablet vs Móvil/PC) y canto específico
  // Obtener el ancho de la pantalla
    const screenWidth = window.innerWidth;

    if (screenWidth < 768) {
      // 1. CELULAR (Menor a 768px)
      updateZoom(0.8); 

    } else if (screenWidth >= 768 && screenWidth <= 1024) {
      // 2. TABLET (Entre 768px y 1024px)
      if (songId === 'atilevantomisojos') {
        updateZoom(1.5); 
      } else {
        updateZoom(1.5); // (Ambos están en 1.5 ahora, pero tienes la estructura lista por si quieres cambiar uno)
      }

    } else {
      // 3. PC (Mayor a 1024px)
      updateZoom(1.0); // Cambia este 1.0 por el valor que prefieras para la computadora
    }
    
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

    cleanMoments.forEach((momentName, index) => {
      const pill = document.createElement('span');
      pill.className = `footer-moment-pill ${index === 0 ? 'active-pill' : ''}`;
      pill.textContent = momentName;

      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dashboardView && songViewerView) {
          songViewerView.style.display = 'none';
          dashboardView.style.display = 'flex';
          window.location.hash = '';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        activeMoments.clear();
        activeMoments.add(momentName);

        document.querySelectorAll('.filter-pill').forEach(btn => {
          const dm = btn.getAttribute('data-moment');
          btn.classList.toggle('active', dm === momentName);
        });

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
  dataObj.valoracion = rating;
  localStorage.setItem(key, JSON.stringify(dataObj));

  renderFooterStars(songId, rating);
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
    localStorage.setItem(`notes_${songId}`, textarea.value);
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
      pos = Math.max(0, Math.min(pos, cleanLetra.length - 1));
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
    const transposedKey = transposeNote(originalSongKey, currentKeyOffset);
    guardarTonoEnNube(currentCanto.id, transposedKey);
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
    const response = await fetch(`data/songs/${songId}.json`);
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
    const triggerHtml = generarHtmlLineaItem(song, lineItem.triggerLine, side, lineIdx, -1, keyOffset);
    const subLinesHtml = lineItem.lines.map((l, subIdx) => 
      generarHtmlLineaItem(song, l, side, lineIdx, subIdx, keyOffset)
    ).join('');
    
    const isExpanded = allAsambleaExpanded || lineItem.initialState === 'expanded';
    const displayStyle = isExpanded ? 'block' : 'none';
    
    return `
      <div class="collapsible-block-container">
        <div class="collapsible-lines-wrapper">
          <div class="linea-canto collapsible-trigger">${triggerHtml}</div>
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

function generarHtmlLineaItem(song, lineItem, side, lineIdx, subLineIdx, keyOffset) {
  const content = typeof lineItem === 'string' ? lineItem : (lineItem.line || '');
  const sectionClass = lineItem.sC || '';
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
  searchInput.addEventListener('input', () => {
    clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
    handleSearchAndFilters();
  });
  
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    handleSearchAndFilters();
  });
  
  // Toggle panel filtros
  toggleFiltersBtn.addEventListener('click', () => {
    const isVisible = filtersPanel.style.display !== 'none';
    filtersPanel.style.display = isVisible ? 'none' : 'flex';
    toggleFiltersBtn.classList.toggle('active', !isVisible);
  });
  
  // Clic en etapas
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
    handleSearchAndFilters();
  });
  
  // Clic en momentos litúrgicos
  momentFiltersContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    
    const moment = btn.dataset.moment;
    const btnIndice = document.getElementById('btn-filter-indice');
    
    if (moment === 'Indice de Cantos') {
      // Limpiar todos los filtros de momentos
      activeMoments = [];
      momentFiltersContainer.querySelectorAll('.filter-pill').forEach(b => {
        b.classList.remove('active');
      });
      if (btnIndice) btnIndice.classList.add('active');
    } else {
      const index = activeMoments.indexOf(moment);
      if (index > -1) {
        activeMoments.splice(index, 1);
        btn.classList.remove('active');
      } else {
        activeMoments.push(moment);
        btn.classList.add('active');
      }
      
      // Ajustar estado del botón de "Índice de Cantos"
      if (activeMoments.length > 0) {
        if (btnIndice) btnIndice.classList.remove('active');
      } else {
        if (btnIndice) btnIndice.classList.add('active');
      }
    }
    handleSearchAndFilters();
  });
  
  // Botones de visor
  viewerBackBtn.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = '';
    }
  });
  
  // Zoom settings
  if (settingsZoomOutBtn) settingsZoomOutBtn.addEventListener('click', () => updateZoom(zoomFactor - 0.1));
  if (settingsZoomInBtn) settingsZoomInBtn.addEventListener('click', () => updateZoom(zoomFactor + 0.1));

  // Selector de tipografía
  const fontFamilySelect = document.getElementById('font-family-select');
  if (fontFamilySelect) {
    // Restaurar selección guardada
    const savedFont = localStorage.getItem('lyrics-font-family') || 'franklin';
    fontFamilySelect.value = savedFont;
    applyFontFamily(savedFont);

    fontFamilySelect.addEventListener('change', () => {
      const key = fontFamilySelect.value;
      applyFontFamily(key);
      localStorage.setItem('lyrics-font-family', key);
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
        }
      } else {
        // Devolverse al centro (snap back)
        sliderContainer.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        sliderContainer.style.transform = 'translate3d(calc(-100% / 3 - 13.333px), 0, 0)';
      }
    }, { passive: true });
  }

  // Buscador rápido de la barra de herramientas superior
  if (toolbarSearchInput) {
    toolbarSearchInput.addEventListener('input', () => {
      const query = toolbarSearchInput.value.trim();
      if (!query) {
        toolbarSearchSuggestions.style.display = 'none';
        return;
      }
      
      const matches = searchSongs(allSongs, query).slice(0, 8); // Máximo 8 sugerencias
      
      if (matches.length === 0) {
        toolbarSearchSuggestions.innerHTML = `<div class="search-suggestion-item" style="color: var(--text-muted); cursor: default;">No se encontraron cantos</div>`;
      } else {
        toolbarSearchSuggestions.innerHTML = matches.map(song => `
          <div class="search-suggestion-item" data-id="${song.id}">
            <strong>${song.titulo || song.title}</strong>
            <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">${song.catCanto || ''}</span>
          </div>
        `).join('');
      }
      toolbarSearchSuggestions.style.display = 'block';
    });
    
    if (toolbarSearchSuggestions) {
      toolbarSearchSuggestions.addEventListener('click', (e) => {
        const item = e.target.closest('.search-suggestion-item');
        if (!item || !item.dataset.id) return;
        window.location.hash = `#canto=${item.dataset.id}`;
        toolbarSearchSuggestions.style.display = 'none';
        toolbarSearchInput.value = '';
      });
      
      document.addEventListener('click', (e) => {
        if (toolbarSearchSuggestions && !toolbarSearchSuggestions.contains(e.target) && e.target !== toolbarSearchInput) {
          toolbarSearchSuggestions.style.display = 'none';
        }
      });
    }
  }
  
  scrollPlayBtn.addEventListener('click', toggleAutoScroll);
  
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

  function updateScrollInterval(val) {
    scrollIntervalMs = Math.max(1, Math.min(scrollIntervalLimit, val));
    localStorage.setItem('scroll-interval', scrollIntervalMs);
    if (scrollIntervalSlider) scrollIntervalSlider.value = scrollIntervalMs;
    if (scrollIntervalInput) scrollIntervalInput.value = scrollIntervalMs;
    if (isScrollActive) {
      stopAutoScroll();
      startAutoScroll();
    }
  }

  function updateScrollStep(val) {
    scrollStepPx = Math.max(1, Math.min(scrollStepLimit, val));
    localStorage.setItem('scroll-step', scrollStepPx);
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
  
  asambleaToggleBtn.addEventListener('click', () => {
    allAsambleaExpanded = !allAsambleaExpanded;
    asambleaToggleBtn.classList.toggle('active', allAsambleaExpanded);
    asambleaToggleBtn.querySelector('span').textContent = allAsambleaExpanded ? 'visibility' : 'visibility_off';
    
    document.querySelectorAll('.collapsible-content').forEach(content => {
      content.style.display = allAsambleaExpanded ? 'block' : 'none';
    });
    document.querySelectorAll('.collapsible-trigger').forEach(trigger => {
      const letraSpan = trigger.querySelector('.letra');
      if (allAsambleaExpanded) {
        letraSpan.textContent = letraSpan.textContent.replace('...', '');
      } else {
        if (!letraSpan.textContent.endsWith('...')) letraSpan.textContent += '...';
      }
    });
  });
  
  if (audioPlayBtn) {
    audioPlayBtn.addEventListener('click', () => {
      if (viewerAudioPlayer.paused) {
        viewerAudioPlayer.play();
      } else {
        viewerAudioPlayer.pause();
      }
    });
  }
  
  if (viewerAudioPlayer) {
    viewerAudioPlayer.addEventListener('play', () => {
      viewerAudioContainer.classList.add('open');
      if (audioPlayBtn) {
        audioPlayBtn.classList.add('active');
        const iconSpan = audioPlayBtn.querySelector('span');
        if (iconSpan) iconSpan.textContent = 'pause';
      }
    });
    
    viewerAudioPlayer.addEventListener('pause', () => {
      viewerAudioContainer.classList.remove('open');
      if (audioPlayBtn) {
        audioPlayBtn.classList.remove('active');
        const iconSpan = audioPlayBtn.querySelector('span');
        if (iconSpan) iconSpan.textContent = 'play_arrow';
      }
    });
    
    viewerAudioPlayer.addEventListener('ended', () => {
      viewerAudioContainer.classList.remove('open');
      if (audioPlayBtn) {
        audioPlayBtn.classList.remove('active');
        const iconSpan = audioPlayBtn.querySelector('span');
        if (iconSpan) iconSpan.textContent = 'play_arrow';
      }
    });
  }
  
  settingsOpenBtn.addEventListener('click', () => {
    // Al abrir el modal, activar por defecto la pestaña "General" y ocultar todos los demás paneles
    openSettingsTab('general');

    populateBisSongList();
    settingsModal.style.display = 'flex';
  });
  
  // Guardado de favoritos
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
  
  // Guardado de notas del cantor
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
  
  // Cejilla select
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
  });
  
  // Cerrar modales
  chordModalClose.addEventListener('click', () => {
    chordModal.style.display = 'none';
    currentEditingChordInfo = null;
  });
  chordModal.addEventListener('click', (e) => {
    if (e.target === chordModal) {
      chordModal.style.display = 'none';
      currentEditingChordInfo = null;
    }
  });
  
  settingsModalClose.addEventListener('click', () => settingsModal.style.display = 'none');
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.style.display = 'none';
  });
  
  // Click listeners para el prontuario de acordes interactivo
  modalChordNotePicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-picker');
    if (!btn) return;
    
    const chosenNote = btn.dataset.note;
    
    if (isChordEditMode && currentEditingChordInfo) {
      saveSingleChordEdit(chosenNote, undefined);
      chordModal.style.display = 'none';
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
      // Cerrar el modal al realizar la selección
      chordModal.style.display = 'none';
    }
  });

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
  
  // Selección de temas
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      setTheme(theme);
    });
  });

  // Selección de estilo de lista
  listStyleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      setListStyle(style);
    });
  });

  // Botón de ajustes en la página principal
function openSettingsTab(tabName = 'general') {
  const tabBtns = document.querySelectorAll('.settings-tab-btn');
  tabBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });

  const panelGroups = document.querySelectorAll('.settings-panel-group');
  panelGroups.forEach((panel) => {
    panel.style.display = 'none';
  });

  const targetPanel = document.getElementById(`settings-panel-${tabName}`);
  if (targetPanel) {
    targetPanel.style.display = 'block';
  }
}

  window.abrirModalConfiguracion = function() {
    openSettingsTab('general');
    populateBisSongList();
    if (settingsModal) settingsModal.style.display = 'flex';
  };

  // Botón de ajustes en la página principal
  if (dashboardSettingsBtn) {
    dashboardSettingsBtn.addEventListener('click', () => {
      window.abrirModalConfiguracion();
    });
  }

  // Selección de pestañas del modal de Ajustes
  const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
  settingsTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      openSettingsTab(tab);

      // Poblar la lista de BIS al entrar a la pestaña Canto
      if (tab === 'canto') {
        populateBisSongList();
      }
    });
  });

  // Sincronizar el toggle BIS con el canto actual
  function populateBisSongList() {
    const bisToggle = document.getElementById('bis-toggle');
    if (!bisToggle) return;
    bisToggle.checked = currentCanto ? isBisEnabled(currentCanto.id) : false;
  }

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
        localStorage.removeItem(`book-theme-chord-${suffix}`);
        localStorage.removeItem(`book-theme-chord-alt-${suffix}`);
      });
      // Limpiar claves heredadas antiguas
      localStorage.removeItem('book-theme-bg');
      localStorage.removeItem('book-theme-accent');
      localStorage.removeItem('book-theme-text');
      localStorage.removeItem('book-theme-chord');
      localStorage.removeItem('book-theme-chord-alt');
      
      // Limpiar inline style overrides de body y documentElement para forzar recálculo
      const props = ['--bg-color', '--accent-color', '--text-color', '--accent-glow', '--chord-color', '--chord-color-alt'];
      props.forEach(p => {
        document.body.style.removeProperty(p);
        document.documentElement.style.removeProperty(p);
      });
      
      applyBookTheme();
    });
  }

  // Control de visibilidad mediante Select de Secciones en Tema
  const themeSectionSelect = document.getElementById('theme-color-section-select');
  function updateThemeSectionVisibility() {
    if (!themeSectionSelect) return;
    const selectedVal = themeSectionSelect.value;
    const sections = {
      book: document.getElementById('theme-section-book'),
      canto: document.getElementById('theme-section-canto'),
      etapas: document.getElementById('theme-section-etapas'),
      botones: document.getElementById('theme-section-botones'),
      navegador: document.getElementById('theme-section-navegador'),
      toolbar: document.getElementById('theme-section-toolbar')
    };

    Object.keys(sections).forEach(key => {
      const el = sections[key];
      if (el) {
        if (key === selectedVal) {
          el.style.display = 'block';
          el.classList.remove('collapsed');
          const content = el.querySelector('.collapsible-content');
          if (content) content.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      }
    });
  }

  if (themeSectionSelect) {
    themeSectionSelect.addEventListener('change', updateThemeSectionVisibility);
    updateThemeSectionVisibility();
  }

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

  // Manejo de secciones colapsables en Ajustes
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const parent = header.closest('.stage-colors-customizer');
      if (parent) {
        parent.classList.toggle('collapsed');
      }
    });
  });

  // Exportar / Importar notas
  exportNotesBtn.addEventListener('click', exportNotes);
  importNotesBtn.addEventListener('click', importNotes);
  
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

  // Ancho máximo del cancionero (.app-container)
  const widthSlider = document.getElementById('app-width-slider');
  const widthBadge = document.getElementById('app-width-badge');
  const widthDefaultBtn = document.getElementById('app-width-default-btn');
  
  if (widthSlider) {
    widthSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      if (widthBadge) widthBadge.textContent = val + 'px';
      document.documentElement.style.setProperty('--app-max-width', val + 'px');
      localStorage.setItem('app-max-width', val);
    });
  }
  
  if (widthDefaultBtn) {
    widthDefaultBtn.addEventListener('click', () => {
      if (widthSlider) widthSlider.value = 1200;
      if (widthBadge) widthBadge.textContent = '1200px';
      document.documentElement.style.setProperty('--app-max-width', '1200px');
      localStorage.setItem('app-max-width', '1200');
    });
  }
  
  // Cerrar con Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      chordModal.style.display = 'none';
      settingsModal.style.display = 'none';
    }
  });
  
  // Recalcular posiciones en resize de pantalla
  let resizeTimeout;
  window.addEventListener('resize', () => {
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
      try {
        authUpdateBtn.disabled = true;
        authUpdateBtn.textContent = 'Actualizando...';
        
        // 1. Limpiar caché del Service Worker (Cache Storage)
        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(
            cacheKeys.map(key => caches.delete(key))
          );
          console.log('[App] Caché de CacheStorage eliminada.');
        }
        
        // 2. Desregistrar Service Worker
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map(registration => registration.unregister())
          );
          console.log('[App] Service Worker desregistrado.');
        }
        
        // 3. Recargar página (limpia memoria y fuerza recarga de red)
        window.location.reload(true);
      } catch (err) {
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
    }
    updateExtrasTabVisibility();
    
    const settingsTabAccess = document.getElementById('settings-tab-access');
    const canManageAccess = isCurrentUserAdmin() || hasPermission('manage_access');
    if (settingsTabAccess) settingsTabAccess.style.display = canManageAccess ? 'flex' : 'none';

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
    adjustToolbarForScreenSize();
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

    // Insertar los elementos en el orden configurado por el usuario
    items.forEach(item => {
      const el = iconElements[item.key];
      if (!el) return;

      const isInMenu = item.inMenu === true;

      if (!isInMenu) {
        if (toolbarRight) {
          toolbarRight.appendChild(el);
        }
        el.style.display = (item.key === 'search') ? 'block' : 'flex';
      } else {
        if (dropdownContent) {
          dropdownContent.appendChild(el);
          el.style.display = (item.key === 'search') ? 'block' : 'flex';
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
  }

  adjustToolbarForScreenSize();
  window.addEventListener('resize', adjustToolbarForScreenSize);
}

// Aplica el zoom sin guardar (usado al inicializar el default por dispositivo)
function applyZoom(factor) {
  zoomFactor = Math.max(0.6, Math.min(2.0, factor));
  document.documentElement.style.setProperty('--font-zoom', zoomFactor);
  if (settingsZoomBadge) {
    settingsZoomBadge.textContent = `${Math.round(zoomFactor * 100)}%`;
  }
}

// Aplica el zoom Y lo persiste (usado cuando el usuario lo cambia manualmente)
function updateZoom(factor) {
  applyZoom(factor);
  localStorage.setItem('font-zoom', zoomFactor);
  localStorage.setItem('font-zoom-custom', 'true');
}


// Mapa de fuentes tipográficas (igual que en la Biblia)
const FONT_MAP = {
  'franklin': "'Franklin Gothic', 'Franklin Gothic Medium', Arial, sans-serif",
  'sans-serif': "sans-serif",
  'arial': "'Arial', sans-serif",
  'aptos': "'Aptos', sans-serif",
  'cavolini': "'Cavolini', sans-serif",
  'comic-sans': "'Comic Sans MS', cursive, sans-serif",
  'fairwater-script': "'Fairwater Script', 'Brush Script MT', cursive",
  'mv-boli': "'MV Boli', sans-serif",
  'neocat': "'Neocat', sans-serif",
  'pristina': "'Pristina', cursive, serif",
  'segoe-print': "'Segoe Print', cursive, sans-serif",
  'viner-hand': "'Viner Hand ITC', cursive, serif"
};

function applyFontFamily(key) {
  const css = FONT_MAP[key] || FONT_MAP['franklin'];
  document.documentElement.style.setProperty('--font-family-lyrics', css);
}

// --- Ajustes Visuales y Preferencias ---
function initPreferences() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
  
  const savedFavorites = localStorage.getItem('favorites');
  if (savedFavorites) {
    try {
      favorites = new Set(JSON.parse(savedFavorites));
    } catch (e) {
      console.error('Error al cargar favoritos:', e);
    }
  }

  // Inicializar clase y botón de dividir pantalla
  if (cantoColumnsContainer) {
    cantoColumnsContainer.classList.toggle('single-column', !isSplitLayout);
  }
  if (splitLayoutBtn) {
    splitLayoutBtn.classList.toggle('active', isSplitLayout);
  }

  // Inicializar estilo visual de la lista de cantos
  setListStyle(songListStyle);

  // Inicializar colores personalizados de etapas y tema del libro
  applyStageColors();
  applyBookTheme();

  // Inicializar ancho de página
  const savedWidth = localStorage.getItem('app-max-width') || '1200';
  document.documentElement.style.setProperty('--app-max-width', savedWidth + 'px');
  const widthSlider = document.getElementById('app-width-slider');
  const widthBadge = document.getElementById('app-width-badge');
  if (widthSlider) widthSlider.value = savedWidth;
  if (widthBadge) widthBadge.textContent = savedWidth + 'px';

  // Inicializar tipografía guardada
  const savedFont = localStorage.getItem('lyrics-font-family') || 'franklin';
  applyFontFamily(savedFont);

  // Inicializar zoom con valor guardado o defecto por dispositivo
  const initialZoom = getDefaultZoom();
  applyZoom(initialZoom); // no guardar: es el default automático

  // Inicializar preferencia de mantener pantalla encendida (Wake Lock)
  initWakeLockPreference();

  // Ocultar opción de edición de acordes si no es administrador (para futura autenticación)
  const chordEditSettingRow = document.getElementById('chord-edit-setting-row');
  if (chordEditSettingRow) {
    chordEditSettingRow.style.display = isAdmin ? 'flex' : 'none';
  }
}

function applyStageColors() {
  const preColor  = localStorage.getItem('stage-color-pre')  || '#ffffff';
  const cateColor = localStorage.getItem('stage-color-cate') || '#2196f3';
  const eleColor  = localStorage.getItem('stage-color-ele')  || '#8bc34a';
  const litColor  = localStorage.getItem('stage-color-lit')  || '#FFEB3B';
  const catColor  = localStorage.getItem('stage-color-cat')  || '#6f42c1';

  // Colores de estado activo para los botones de etapa
  const preActive  = localStorage.getItem('btn-color-pre-active')  || '#495057';
  const cateActive = localStorage.getItem('btn-color-cate-active') || '#1976d2';
  const eleActive  = localStorage.getItem('btn-color-ele-active')  || '#558b2f';
  const litActive  = localStorage.getItem('btn-color-lit-active')  || '#f9a825';
  const catActive  = localStorage.getItem('btn-color-cat-active')  || '#4a1d96';

  // Colores de texto de los botones de etapa
  const preText  = localStorage.getItem('btn-color-pre-text')  || '#212529';
  const cateText = localStorage.getItem('btn-color-cate-text') || '#ffffff';
  const eleText  = localStorage.getItem('btn-color-ele-text')  || '#ffffff';
  const litText  = localStorage.getItem('btn-color-lit-text')  || '#212529';
  const catText  = localStorage.getItem('btn-color-cat-text')  || '#ffffff';

  // Aplicar variables CSS de color por defecto
  document.body.style.setProperty('--color-pre', preColor);
  document.body.style.setProperty('--color-cate', cateColor);
  document.body.style.setProperty('--color-ele', eleColor);
  document.body.style.setProperty('--color-lit', litColor);
  document.body.style.setProperty('--color-cat', catColor);

  // Aplicar variables CSS de color activo
  document.body.style.setProperty('--color-pre-active', preActive);
  document.body.style.setProperty('--color-cate-active', cateActive);
  document.body.style.setProperty('--color-ele-active', eleActive);
  document.body.style.setProperty('--color-lit-active', litActive);
  document.body.style.setProperty('--color-cat-active', catActive);

  // Aplicar variables CSS de color de texto
  document.body.style.setProperty('--text-pre', preText);
  document.body.style.setProperty('--text-cate', cateText);
  document.body.style.setProperty('--text-ele', eleText);
  document.body.style.setProperty('--text-lit', litText);
  document.body.style.setProperty('--text-cat', catText);

  // Actualizar los preview labels de Personalizar Botones
  const updatePreview = (id, color) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.backgroundColor = color;
      const icon = el.querySelector('span');
      if (icon) {
        const isLight = /ffeb3b|ffffff|eeeeee|fafafa|fff9c4|f0f4c3/i.test(color.replace('#',''));
        icon.style.color = isLight ? '#212529' : '#ffffff';
      }
      const input = el.querySelector('input');
      if (input) input.value = color;
    }
  };
  updatePreview('preview-pre-default', preColor);
  updatePreview('preview-pre-active', preActive);
  updatePreview('preview-pre-text', preText);
  updatePreview('preview-cate-default', cateColor);
  updatePreview('preview-cate-active', cateActive);
  updatePreview('preview-cate-text', cateText);
  updatePreview('preview-ele-default', eleColor);
  updatePreview('preview-ele-active', eleActive);
  updatePreview('preview-ele-text', eleText);
  updatePreview('preview-lit-default', litColor);
  updatePreview('preview-lit-active', litActive);
  updatePreview('preview-lit-text', litText);
  updatePreview('preview-cat-default', catColor);
  updatePreview('preview-cat-active', catActive);
  updatePreview('preview-cat-text', catText);

  // Resaltar los botones de los circulitos de color correspondientes
  document.querySelectorAll('.color-swatches').forEach(container => {
    const stage = container.dataset.stage;
    let activeColor = '#6c757d';
    if (stage === 'pre') activeColor = preColor;
    if (stage === 'cate') activeColor = cateColor;
    if (stage === 'ele') activeColor = eleColor;
    if (stage === 'lit') activeColor = litColor;

    let presetMatched = false;
    container.querySelectorAll('.color-swatch-btn').forEach(btn => {
      const btnColor = btn.dataset.color.toLowerCase();
      const isMatched = btnColor === activeColor.toLowerCase();
      btn.classList.toggle('active', isMatched);
      if (isMatched) presetMatched = true;
    });

    const labelBtn = container.querySelector('.color-picker-label-btn');
    const inputPicker = container.querySelector('.stage-color-input');
    if (inputPicker) {
      inputPicker.value = activeColor.startsWith('#') ? activeColor : '#6c757d';
    }
    if (labelBtn) {
      if (!presetMatched) {
        labelBtn.classList.add('active');
        labelBtn.style.backgroundColor = activeColor;
        const isLight = activeColor.toLowerCase() === '#eeeeee' || activeColor.toLowerCase() === '#ffffff' || activeColor.toLowerCase() === '#ffeb3b';
        labelBtn.querySelector('span').style.color = isLight ? '#212529' : '#ffffff';
      } else {
        labelBtn.classList.remove('active');
        labelBtn.style.backgroundColor = 'var(--panel-bg)';
        labelBtn.querySelector('span').style.color = 'var(--text-color)';
      }
    }
  });
}

function applyBookTheme() {
  const suffix = localStorage.getItem('theme') || 'light'; // 'dark' | 'light' | 'sepia'
  
  const customBg = localStorage.getItem('book-theme-bg-' + suffix);
  const customAccent = localStorage.getItem('book-theme-accent-' + suffix);
  const customText = localStorage.getItem('book-theme-text-' + suffix);
  const customChord = localStorage.getItem('book-theme-chord-' + suffix);
  const customChordAlt = localStorage.getItem('book-theme-chord-alt-' + suffix);
  
  if (customBg) {
    document.body.style.setProperty('--bg-color', customBg);
  } else {
    document.body.style.removeProperty('--bg-color');
  }
  
  if (customAccent) {
    document.body.style.setProperty('--accent-color', customAccent);
    let glow = customAccent;
    if (customAccent.startsWith('#')) {
      const r = parseInt(customAccent.slice(1, 3), 16);
      const g = parseInt(customAccent.slice(3, 5), 16);
      const b = parseInt(customAccent.slice(5, 7), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        glow = `rgba(${r}, ${g}, ${b}, 0.35)`;
      }
    }
    document.body.style.setProperty('--accent-glow', glow);
  } else {
    document.body.style.removeProperty('--accent-color');
    document.body.style.removeProperty('--accent-glow');
  }

  if (customText) {
    document.body.style.setProperty('--text-color', customText);
  } else {
    document.body.style.removeProperty('--text-color');
  }

  if (customChord) {
    document.body.style.setProperty('--chord-color', customChord);
  } else {
    document.body.style.removeProperty('--chord-color');
  }

  if (customChordAlt) {
    document.body.style.setProperty('--chord-color-alt', customChordAlt);
  } else {
    document.body.style.removeProperty('--chord-color-alt');
  }
  
  // Actualizar los inputs en el customizer de tema del libro
  const bgInput = document.querySelector('.book-theme-input[data-type="bg"]');
  const accentInput = document.querySelector('.book-theme-input[data-type="accent"]');
  const textInput = document.querySelector('.book-theme-input[data-type="text"]');
  const chordInput = document.querySelector('.book-theme-input[data-type="chord"]');
  const chordAltInput = document.querySelector('.book-theme-input[data-type="chord-alt"]');
  
  requestAnimationFrame(() => {
    const computedStyle = getComputedStyle(document.body);
    const currentBg = computedStyle.getPropertyValue('--bg-color').trim();
    const currentAccent = computedStyle.getPropertyValue('--accent-color').trim();
    const currentText = computedStyle.getPropertyValue('--text-color').trim();
    const currentChord = computedStyle.getPropertyValue('--chord-color').trim();
    const currentChordAlt = computedStyle.getPropertyValue('--chord-color-alt').trim();
    
    if (bgInput) {
      const hex = formatColorToHex(currentBg) || '#0a0a0a';
      bgInput.value = hex;
      const preview = bgInput.closest('.btn-pill-preview');
      if (preview) {
        preview.style.backgroundColor = hex;
        const icon = preview.querySelector('span');
        if (icon) {
          const isLight = /ffeb3b|ffffff|eeeeee|fafafa|fff9c4|f0f4c3/i.test(hex.replace('#',''));
          icon.style.color = isLight ? '#212529' : '#ffffff';
        }
      }
    }
    
    if (accentInput) {
      const hex = formatColorToHex(currentAccent) || '#d01212';
      accentInput.value = hex;
      const preview = accentInput.closest('.btn-pill-preview');
      if (preview) {
        preview.style.backgroundColor = hex;
        const icon = preview.querySelector('span');
        if (icon) {
          const isLight = /ffeb3b|ffffff|eeeeee|fafafa|fff9c4|f0f4c3/i.test(hex.replace('#',''));
          icon.style.color = isLight ? '#212529' : '#ffffff';
        }
      }
    }

    if (textInput) {
      const hex = formatColorToHex(currentText) || '#ffffff';
      textInput.value = hex;
      const preview = textInput.closest('.btn-pill-preview');
      if (preview) {
        preview.style.backgroundColor = hex;
        const icon = preview.querySelector('span');
        if (icon) {
          const isLight = /ffeb3b|ffffff|eeeeee|fafafa|fff9c4|f0f4c3/i.test(hex.replace('#',''));
          icon.style.color = isLight ? '#212529' : '#ffffff';
        }
      }
    }

    if (chordInput) {
      const hex = formatColorToHex(currentChord) || '#d01212';
      chordInput.value = hex;
      const preview = chordInput.closest('.btn-pill-preview');
      if (preview) {
        preview.style.backgroundColor = hex;
        const icon = preview.querySelector('span');
        if (icon) {
          const isLight = /ffeb3b|ffffff|eeeeee|fafafa|fff9c4|f0f4c3/i.test(hex.replace('#',''));
          icon.style.color = isLight ? '#212529' : '#ffffff';
        }
      }
    }

    if (chordAltInput) {
      const hex = formatColorToHex(currentChordAlt) || '#944c18';
      chordAltInput.value = hex;
      const preview = chordAltInput.closest('.btn-pill-preview');
      if (preview) {
        preview.style.backgroundColor = hex;
        const icon = preview.querySelector('span');
        if (icon) {
          const isLight = /ffeb3b|ffffff|eeeeee|fafafa|fff9c4|f0f4c3/i.test(hex.replace('#',''));
          icon.style.color = isLight ? '#212529' : '#ffffff';
        }
      }
    }
    updateNavInputs();
  });
}

function updateNavInputs() {
  const inputs = document.querySelectorAll('.nav-theme-input');
  if (!inputs.length) return;

  const navBar = document.getElementById('main-navbar');
  const toggleBtn = document.getElementById('nav-toggle');
  const computedNav = navBar ? getComputedStyle(navBar) : null;
  const computedToggle = toggleBtn ? getComputedStyle(toggleBtn) : null;

  inputs.forEach(input => {
    const type = input.dataset.type;
    const mode = input.dataset.mode || 'normal';
    const key = mode === 'hover' ? `nav-color-${type}-hover` : `nav-color-${type}`;
    let colorVal = localStorage.getItem(key);

    if (!colorVal) {
      if (type === 'text') {
        colorVal = mode === 'hover' ? '#ffffff' : '#301d1d';
      } else if (type === 'bg') {
        colorVal = computedNav ? computedNav.getPropertyValue('background-color').trim() : '#ffffff';
      } else if (type === 'btn-bg') {
        colorVal = mode === 'hover' ? '#390404' : '#f7f7f7';
      } else if (type === 'icon') {
        colorVal = mode === 'hover' ? '#f4ebeb' : '#301d1d';
      } else if (type === 'submenu-icon') {
        colorVal = mode === 'hover' ? '#ffffff' : '#3d0706';
      } else if (type === 'wrapper-bg') {
        colorVal = computedToggle ? computedToggle.getPropertyValue('background-color').trim() : '#ffffff';
      }
    }

    const hex = formatColorToHex(colorVal) || '#ffffff';
    input.value = hex;

    const preview = input.closest('.btn-pill-preview');
    if (preview) {
      preview.style.backgroundColor = hex;
      const icon = preview.querySelector('span');
      if (icon) {
        const isLight = /ffeb3b|ffffff|eeeeee|fafafa|fff9c4|f0f4c3/i.test(hex.replace('#', ''));
        icon.style.color = isLight ? '#212529' : '#ffffff';
      }
    }
  });
}

function formatColorToHex(colorStr) {
  if (!colorStr) return '';
  colorStr = colorStr.trim();
  if (colorStr.startsWith('#')) return colorStr;
  
  const temp = document.createElement('div');
  temp.style.color = colorStr;
  document.body.appendChild(temp);
  const resolved = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  
  const match = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  return '';
}

function setListStyle(style) {
  songListStyle = style;
  localStorage.setItem('song-list-style', style);
  
  if (songsGrid) {
    // Aplicar clase correspondiente a la cuadrícula
    songsGrid.className = `songs-grid style-${style}`;
  }
  
  // Resaltar botón activo en ajustes
  listStyleBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === style);
  });
}

function setTheme(theme) {
  document.body.className = '';
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('theme', theme);
  
  // Resaltar botón activo en el modal de ajustes
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  applyBookTheme();
}

// --- Exportar/Importar Anotaciones locales ---
function exportNotes() {
  const notesObj = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('notes_')) {
      notesObj[key] = localStorage.getItem(key);
    }
  }
  
  const blob = new Blob([JSON.stringify(notesObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resucito_notas_cantor_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importNotes() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        let count = 0;
        for (const [key, value] of Object.entries(importedData)) {
          if (key.startsWith('notes_')) {
            localStorage.setItem(key, value);
            count++;
          }
        }
        alert(`Se importaron con éxito ${count} anotaciones de cantos.`);
        // Recargar si estamos en un canto
        if (currentCanto) {
          notesTextarea.value = localStorage.getItem(`notes_${currentCanto.id}`) || '';
        }
      } catch (err) {
        alert('El archivo no es un backup válido de notas de cantor.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// --- Wake Lock (Mantener pantalla encendida) ---
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock is active');
    }
  } catch (err) {
    console.warn('Wake Lock request failed:', err);
  }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release();
    wakeLock = null;
  }
}

async function handleVisibilityChange() {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    const isWakeLockPrefActive = localStorage.getItem('pref-wakelock') === 'true';
    if (isWakeLockPrefActive) {
      await requestWakeLock();
    }
  }
}

function initWakeLockPreference() {
  const isWakeLockPrefActive = localStorage.getItem('pref-wakelock') === 'true';
  const wakelockToggle = document.getElementById('wakelock-toggle');
  
  if (wakelockToggle) {
    wakelockToggle.checked = isWakeLockPrefActive;
    
    if (isWakeLockPrefActive) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    wakelockToggle.addEventListener('change', async (e) => {
      const active = e.target.checked;
      localStorage.setItem('pref-wakelock', active ? 'true' : 'false');
      
      if (active) {
        await requestWakeLock();
        document.addEventListener('visibilitychange', handleVisibilityChange);
      } else {
        releaseWakeLock();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    });
  }
}
