// src/js/ajustes.js
// Centralización de todos los ajustes y preferencias de la aplicación.
import { auth, db, doc, getDoc, setDoc, collection, getDocs } from '../firebase.js';
import { getCurrentUser } from '../auth.js';

// --- Indicador de Estado del Canto Offline ---
export function updateCantoEquipoBadge() {
  const badge = document.getElementById('cloud-connection-badge');
  if (!badge) return;
  const toggle = document.getElementById('canto-equipo-toggle');
  const isActive = toggle ? toggle.checked : (localStorage.getItem('cantoEquipoOffline') === 'true');
  
  if (isActive) {
    badge.textContent = "OnLine";
    badge.style.background = "#28a745";
    badge.style.boxShadow = "0 0 10px rgba(40, 167, 69, 0.8)";
  } else {
    badge.textContent = "OffLine";
    badge.style.background = "#dc3545";
    badge.style.boxShadow = "0 0 10px rgba(220, 53, 69, 0.8)";
  }
}

// 1. Exponer variables de ajustes en `window` mediante getters/setters que leen/escriben en `localStorage`.
// De esta manera, cualquier acceso o asignación (ej: `scrollIntervalMs = 50`) actualiza automáticamente localStorage y el estado.

Object.defineProperty(window, 'scrollIntervalMs', {
  get() { return parseInt(localStorage.getItem('scroll-interval')) || 40; },
  set(v) { localStorage.setItem('scroll-interval', v); },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'scrollStepPx', {
  get() { return parseInt(localStorage.getItem('scroll-step')) || 1; },
  set(v) { localStorage.setItem('scroll-step', v); },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'scrollIntervalLimit', {
  get() { return parseInt(localStorage.getItem('scroll-interval-limit')) || 1000; },
  set(v) { localStorage.setItem('scroll-interval-limit', v); },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'scrollStepLimit', {
  get() { return parseInt(localStorage.getItem('scroll-step-limit')) || 100; },
  set(v) { localStorage.setItem('scroll-step-limit', v); },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'isSplitLayout', {
  get() { return localStorage.getItem('split-layout') !== 'false'; },
  set(v) { localStorage.setItem('split-layout', v ? 'true' : 'false'); },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'songListStyle', {
  get() { return localStorage.getItem('song-list-style') || 'simple'; },
  set(v) { localStorage.setItem('song-list-style', v); },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'zoomFactor', {
  get() {
    if (localStorage.getItem('font-zoom-custom') === 'true') {
      const saved = localStorage.getItem('font-zoom');
      if (saved) return parseFloat(saved);
    }
    return window.getDefaultZoom ? window.getDefaultZoom() : 1.0;
  },
  set(v) {
    localStorage.setItem('font-zoom', v);
    localStorage.setItem('font-zoom-custom', 'true');
  },
  configurable: true,
  enumerable: true
});

// Inicializar favoritos globalmente
if (!window.favorites) {
  window.favorites = new Set();
  const savedFavorites = localStorage.getItem('favorites');
  if (savedFavorites) {
    try {
      window.favorites = new Set(JSON.parse(savedFavorites));
    } catch (e) {
      console.error('Error al cargar favoritos:', e);
    }
  }
}

// Inicializar administrador globalmente
if (typeof window.isAdmin === 'undefined') {
  window.isAdmin = false;
}

// Mapa de fuentes tipográficas
window.FONT_MAP = {
  'franklin': "'Franklin Gothic Medium', Arial, sans-serif",
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

// 2. Funciones globales de aplicación de estilos y temas

window.getDefaultZoom = function() {
  if (localStorage.getItem('font-zoom-custom') === 'true') {
    const saved = localStorage.getItem('font-zoom');
    if (saved) return parseFloat(saved);
  }
  const w = window.innerWidth;
  if (w < 768)   return 0.8;   // 📱 Celular (< 768px) => 80%
  if (w <= 1024) return 1.5;   // 📟 Tablet  (768-1024px) => 150%
  return 1.0;                  // 🖥️ PC/Laptop (> 1024px) => 100%
};

window.applyZoom = function(factor) {
  const zoom = Math.max(0.6, Math.min(2.0, factor));
  document.documentElement.style.setProperty('--font-zoom', zoom);
  const settingsZoomBadge = document.getElementById('settings-zoom-badge');
  if (settingsZoomBadge) {
    settingsZoomBadge.textContent = `${Math.round(zoom * 100)}%`;
  }
};

window.updateZoom = function(factor) {
  window.zoomFactor = factor; // Usa el setter que guarda en localStorage
  window.applyZoom(factor);
};

window.applyFontFamily = function(key) {
  const css = window.FONT_MAP[key] || window.FONT_MAP['franklin'];
  document.documentElement.style.setProperty('--font-family-lyrics', css);
};

window.setTheme = function(theme) {
  document.body.className = '';
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('theme', theme);
  
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  window.applyBookTheme();
};

window.setListStyle = function(style) {
  window.songListStyle = style; // setter
  const songsGrid = document.getElementById('songs-grid');
  if (songsGrid) {
    songsGrid.className = `songs-grid style-${style}`;
  }
  document.querySelectorAll('.list-style-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === style);
  });
};

window.formatColorToHex = function(colorStr) {
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
};

window.applyStageColors = function() {
  const preColor  = localStorage.getItem('stage-color-pre')  || '#ffffff';
  const cateColor = localStorage.getItem('stage-color-cate') || '#2196f3';
  const eleColor  = localStorage.getItem('stage-color-ele')  || '#8bc34a';
  const litColor  = localStorage.getItem('stage-color-lit')  || '#FFEB3B';
  const catColor  = localStorage.getItem('stage-color-cat')  || '#6f42c1';

  const preActive  = localStorage.getItem('btn-color-pre-active')  || '#495057';
  const cateActive = localStorage.getItem('btn-color-cate-active') || '#1976d2';
  const eleActive  = localStorage.getItem('btn-color-ele-active')  || '#558b2f';
  const litActive  = localStorage.getItem('btn-color-lit-active')  || '#f9a825';
  const catActive  = localStorage.getItem('btn-color-cat-active')  || '#4a1d96';

  const preText  = localStorage.getItem('btn-color-pre-text')  || '#212529';
  const cateText = localStorage.getItem('btn-color-cate-text') || '#ffffff';
  const eleText  = localStorage.getItem('btn-color-ele-text')  || '#ffffff';
  const litText  = localStorage.getItem('btn-color-lit-text')  || '#212529';
  const catText  = localStorage.getItem('btn-color-cat-text')  || '#ffffff';

  const settingsBtnBg = localStorage.getItem('settings-btn-bg') || '#d01212';
  const settingsBtnText = localStorage.getItem('settings-btn-text') || '#ffffff';

  document.body.style.setProperty('--color-pre', preColor);
  document.body.style.setProperty('--color-cate', cateColor);
  document.body.style.setProperty('--color-ele', eleColor);
  document.body.style.setProperty('--color-lit', litColor);
  document.body.style.setProperty('--color-cat', catColor);

  document.body.style.setProperty('--color-pre-active', preActive);
  document.body.style.setProperty('--color-cate-active', cateActive);
  document.body.style.setProperty('--color-ele-active', eleActive);
  document.body.style.setProperty('--color-lit-active', litActive);
  document.body.style.setProperty('--color-cat-active', catActive);

  document.body.style.setProperty('--text-pre', preText);
  document.body.style.setProperty('--text-cate', cateText);
  document.body.style.setProperty('--text-ele', eleText);
  document.body.style.setProperty('--text-lit', litText);
  document.body.style.setProperty('--text-cat', catText);

  document.body.style.setProperty('--settings-btn-bg', settingsBtnBg);
  document.body.style.setProperty('--settings-btn-text', settingsBtnText);
  document.documentElement.style.setProperty('--settings-btn-bg', settingsBtnBg);
  document.documentElement.style.setProperty('--settings-btn-text', settingsBtnText);

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
  updatePreview('preview-settings-btn-bg', settingsBtnBg);
  updatePreview('preview-settings-btn-text', settingsBtnText);

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
};

window.applyBookTheme = function() {
  const suffix = localStorage.getItem('theme') || 'light';
  
  const customBg = localStorage.getItem('book-theme-bg-' + suffix);
  const customAccent = localStorage.getItem('book-theme-accent-' + suffix);
  const customText = localStorage.getItem('book-theme-text-' + suffix);
  const customSongTitle = localStorage.getItem('book-theme-song-title-' + suffix);
  const customChord = localStorage.getItem('book-theme-chord-' + suffix);
  const customChordAlt = localStorage.getItem('book-theme-chord-alt-' + suffix);
  const customFooterLink = localStorage.getItem('book-theme-footer-link-' + suffix);
  
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

  if (customSongTitle) {
    document.body.style.setProperty('--song-title-color', customSongTitle);
  } else {
    document.body.style.removeProperty('--song-title-color');
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

  if (customFooterLink) {
    document.body.style.setProperty('--SangreCristo', customFooterLink);
  } else {
    document.body.style.removeProperty('--SangreCristo');
  }
  
  const bgInput = document.querySelector('.book-theme-input[data-type="bg"]');
  const accentInput = document.querySelector('.book-theme-input[data-type="accent"]');
  const textInput = document.querySelector('.book-theme-input[data-type="text"]');
  const songTitleInput = document.querySelector('.book-theme-input[data-type="song-title"]');
  const chordInput = document.querySelector('.book-theme-input[data-type="chord"]');
  const chordAltInput = document.querySelector('.book-theme-input[data-type="chord-alt"]');
  const footerLinkInput = document.querySelector('.book-theme-input[data-type="footer-link"]');
  
  requestAnimationFrame(() => {
    const computedStyle = getComputedStyle(document.body);
    const currentBg = computedStyle.getPropertyValue('--bg-color').trim();
    const currentAccent = computedStyle.getPropertyValue('--accent-color').trim();
    const currentText = computedStyle.getPropertyValue('--text-color').trim();
    const currentSongTitle = computedStyle.getPropertyValue('--song-title-color').trim() || currentAccent || '#d01212';
    const currentChord = computedStyle.getPropertyValue('--chord-color').trim();
    const currentChordAlt = computedStyle.getPropertyValue('--chord-color-alt').trim();
    const currentFooterLink = computedStyle.getPropertyValue('--SangreCristo').trim() || '#3d0706';
    
    if (bgInput) {
      const hex = window.formatColorToHex(currentBg) || '#0a0a0a';
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
      const hex = window.formatColorToHex(currentAccent) || '#d01212';
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
      const hex = window.formatColorToHex(currentText) || '#ffffff';
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

    if (songTitleInput) {
      const hex = window.formatColorToHex(currentSongTitle) || '#d01212';
      songTitleInput.value = hex;
      const preview = songTitleInput.closest('.btn-pill-preview');
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
      const hex = window.formatColorToHex(currentChord) || '#d01212';
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
      const hex = window.formatColorToHex(currentChordAlt) || '#944c18';
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

    if (footerLinkInput) {
      const hex = window.formatColorToHex(currentFooterLink) || '#3d0706';
      footerLinkInput.value = hex;
      const preview = footerLinkInput.closest('.btn-pill-preview');
      if (preview) {
        preview.style.backgroundColor = hex;
        const icon = preview.querySelector('span');
        if (icon) {
          const isLight = /ffeb3b|ffffff|eeeeee|fafafa|fff9c4|f0f4c3/i.test(hex.replace('#',''));
          icon.style.color = isLight ? '#212529' : '#ffffff';
        }
      }
    }
    window.updateNavInputs();
  });
};

window.updateNavInputs = function() {
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

    const hex = window.formatColorToHex(colorVal) || '#ffffff';
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
};

window.openSettingsTab = function(tabName = 'general') {
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

  if (tabName === 'log') {
    if (typeof window.switchLogSubmodule === 'function') {
      const canViewLogs = (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) || 
                          (typeof window.hasPermission === 'function' && window.hasPermission('view_logs'));
      const canViewStatus = (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) || 
                            (typeof window.hasPermission === 'function' && window.hasPermission('view_status'));
      
      if (canViewLogs) {
        window.switchLogSubmodule('console');
      } else if (canViewStatus) {
        window.switchLogSubmodule('status');
      } else {
        window.switchLogSubmodule('console');
      }
    }
    if (window.renderAppLogs) {
      window.renderAppLogs();
    }
  }
  if (tabName === 'datos' && window.renderDatosModule) {
    window.renderDatosModule();
  }
};

window.abrirModalConfiguracion = function() {
  window.openSettingsTab('general');
  if (typeof window.populateBisSongList === 'function') {
    try { window.populateBisSongList(); } catch (e) {}
  }
  if (typeof window.switchThemeSubmodule === 'function') {
    window.switchThemeSubmodule('visual');
  }
  if (typeof window.switchThemeFunctionModule === 'function') {
    window.switchThemeFunctionModule('toolbar');
  }
  const accountBtn = document.getElementById('user-subtab-account-btn');
  if (accountBtn) {
    accountBtn.click();
  }
  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'flex';
};

window.exportNotes = function() {
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
};

window.importNotes = function() {
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
        const notesTextarea = document.getElementById('notes-textarea');
        if (window.currentCanto && notesTextarea) {
          notesTextarea.value = localStorage.getItem(`notes_${window.currentCanto.id}`) || '';
        }
      } catch (err) {
        alert('El archivo no es un backup válido de notas de cantor.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

// Wake Lock (Pantalla encendida)
let wakeLock = null;
window.requestWakeLock = async function() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock is active');
    }
  } catch (err) {
    console.warn('Wake Lock request failed:', err);
  }
};

window.releaseWakeLock = function() {
  if (wakeLock !== null) {
    wakeLock.release();
    wakeLock = null;
  }
};

window.handleVisibilityChange = async function() {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    const isWakeLockPrefActive = localStorage.getItem('pref-wakelock') === 'true';
    if (isWakeLockPrefActive) {
      await window.requestWakeLock();
    }
  }
};

window.initWakeLockPreference = function() {
  const isWakeLockPrefActive = localStorage.getItem('pref-wakelock') === 'true';
  const wakelockToggle = document.getElementById('wakelock-toggle');
  
  if (wakelockToggle) {
    wakelockToggle.checked = isWakeLockPrefActive;
    
    if (isWakeLockPrefActive) {
      window.requestWakeLock();
      document.addEventListener('visibilitychange', window.handleVisibilityChange);
    }

    wakelockToggle.addEventListener('change', async (e) => {
      const active = e.target.checked;
      localStorage.setItem('pref-wakelock', active ? 'true' : 'false');
      
      if (active) {
        await window.requestWakeLock();
        document.addEventListener('visibilitychange', window.handleVisibilityChange);
      } else {
        window.releaseWakeLock();
        document.removeEventListener('visibilitychange', window.handleVisibilityChange);
      }
    });
  }
};

window.initAutoHideNavPreference = function() {
  const isAutoHideActive = localStorage.getItem('pref-autohide-nav') === 'true';
  const autohideToggle = document.getElementById('autohide-nav-toggle');

  if (autohideToggle) {
    autohideToggle.checked = isAutoHideActive;

    autohideToggle.addEventListener('change', (e) => {
      const active = e.target.checked;
      localStorage.setItem('pref-autohide-nav', active ? 'true' : 'false');
      if (typeof window.startAutoHideTimer === 'function') {
        window.startAutoHideTimer();
      }
    });
  }
};

// Estilos de cabecera de grupo de categoría (Preparación y Perfil)
window.applyCatHeaderStyles = function() {
  const color = localStorage.getItem('cat-header-color');
  const size  = localStorage.getItem('cat-header-font-size');
  const weight = localStorage.getItem('cat-header-font-weight');
  if (color)  document.documentElement.style.setProperty('--cat-header-color', color);
  if (size)   document.documentElement.style.setProperty('--cat-header-font-size', size + 'px');
  if (weight) document.documentElement.style.setProperty('--cat-header-font-weight', weight);
};

window.updateCatHeaderPreview = function() {
  const el = document.getElementById('preview-cat-header-text');
  const prevText = document.getElementById('prev-preparar-texto');
  const prevColor = document.getElementById('prev-preparar-color');

  const color  = localStorage.getItem('cat-header-color') || '#d01212';
  const size   = localStorage.getItem('cat-header-font-size') || '16';
  const weight = localStorage.getItem('cat-header-font-weight') || '700';

  if (el) {
    el.style.color = color;
    el.style.fontSize = size + 'px';
    el.style.fontWeight = weight;
  }
  if (prevText) {
    prevText.style.color      = color;
    prevText.style.fontSize   = size + 'px';
    prevText.style.fontWeight = weight;
  }
  if (prevColor) prevColor.style.backgroundColor = color;
};

window.applyPerfilHeaderStyles = function() {
  const color  = localStorage.getItem('perfil-header-color');
  const size   = localStorage.getItem('perfil-header-font-size');
  const weight = localStorage.getItem('perfil-header-font-weight');
  if (color)  document.documentElement.style.setProperty('--perfil-header-color', color);
  if (size)   document.documentElement.style.setProperty('--perfil-header-font-size', size + 'px');
  if (weight) document.documentElement.style.setProperty('--perfil-header-font-weight', weight);
};

window.updatePerfilHeaderPreview = function() {
  const el = document.getElementById('preview-perfil-header-text');
  const prevText = document.getElementById('prev-perfil-texto');
  const prevColor = document.getElementById('prev-perfil-color');

  const color  = localStorage.getItem('perfil-header-color') || '#d01212';
  const size   = localStorage.getItem('perfil-header-font-size') || '16';
  const weight = localStorage.getItem('perfil-header-font-weight') || '700';

  if (el) {
    el.style.color = color;
    el.style.fontSize = size + 'px';
    el.style.fontWeight = weight;
  }
  if (prevText) {
    prevText.style.color      = color;
    prevText.style.fontSize   = size + 'px';
    prevText.style.fontWeight = weight;
  }
  if (prevColor) prevColor.style.backgroundColor = color;
};

let settingsModalPromise = null;

// Función principal de inicialización de Ajustes
window.initAjustes = async function() {
  // Cargar el HTML del modal si no existe en el DOM
  if (!document.getElementById('settings-modal')) {
    if (!settingsModalPromise) {
      settingsModalPromise = (async () => {
        try {
          const response = await fetch('data/ajustes_modal.html');
          if (response.ok) {
            const html = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            document.body.appendChild(tempDiv.firstElementChild);
          }
        } catch (e) {
          console.error('Error al cargar el modal de ajustes dinámicamente:', e);
        }
      })();
    }
    await settingsModalPromise;
  }

  // Actualizar placa de conexión del submódulo Cloud
  if (typeof updateCantoEquipoBadge === 'function') {
    updateCantoEquipoBadge();
  }
  
  // Evitar duplicar los escuchadores de eventos si initAjustes se ejecuta de nuevo
  if (window.ajustesListenersAttached) {
    const loopToggle = document.getElementById('audio-loop-toggle');
    const player = document.getElementById('viewer-audio-player');
    if (loopToggle && player) {
      const loopEnabled = localStorage.getItem('audioLoopEnabled') === 'true';
      loopToggle.checked = loopEnabled;
      player.loop = loopEnabled;
    }
    
    const bassSlider = document.getElementById('eq-bass-slider');
    const midSlider = document.getElementById('eq-mid-slider');
    const trebleSlider = document.getElementById('eq-treble-slider');
    const bassVal = document.getElementById('eq-bass-val');
    const midVal = document.getElementById('eq-mid-val');
    const trebleVal = document.getElementById('eq-treble-val');
    
    if (bassSlider) {
      const bassValDB = localStorage.getItem('eqGainBass') || '0';
      bassSlider.value = bassValDB;
      if (bassVal) bassVal.textContent = parseFloat(bassValDB) > 0 ? `+${bassValDB} dB` : `${bassValDB} dB`;
    }
    if (midSlider) {
      const midValDB = localStorage.getItem('eqGainMid') || '0';
      midSlider.value = midValDB;
      if (midVal) midVal.textContent = parseFloat(midValDB) > 0 ? `+${midValDB} dB` : `${midValDB} dB`;
    }
    if (trebleSlider) {
      const trebleValDB = localStorage.getItem('eqGainTreble') || '0';
      trebleSlider.value = trebleValDB;
      if (trebleVal) trebleVal.textContent = parseFloat(trebleValDB) > 0 ? `+${trebleValDB} dB` : `${trebleValDB} dB`;
    }

    // Sincronizar Inicio Toggles
    const closeFiltersToggle = document.getElementById('close-filters-on-select-toggle');
    if (closeFiltersToggle) {
      closeFiltersToggle.checked = localStorage.getItem('closeFiltersOnSelect') !== 'false';
    }
    const multiMomentToggle = document.getElementById('multi-moment-filter-toggle');
    if (multiMomentToggle) {
      multiMomentToggle.checked = localStorage.getItem('multiMomentFilter') === 'true';
    }
    const combineStageMomentToggle = document.getElementById('combine-stage-moment-filter-toggle');
    if (combineStageMomentToggle) {
      combineStageMomentToggle.checked = localStorage.getItem('combineStageMomentFilter') === 'true';
    }
    const stickySearchToggle = document.getElementById('sticky-search-toggle');
    if (stickySearchToggle) {
      stickySearchToggle.checked = localStorage.getItem('stickySearch') !== 'false';
    }
    const keepStageToggle = document.getElementById('keep-stage-filter-active-toggle');
    if (keepStageToggle) {
      keepStageToggle.checked = localStorage.getItem('keepStageFilterActive') !== 'false';
    }
    const cantoEquipoToggle = document.getElementById('canto-equipo-toggle');
    if (cantoEquipoToggle) {
      cantoEquipoToggle.checked = localStorage.getItem('cantoEquipoOffline') === 'true';
    }
    if (typeof updateCantoEquipoBadge === 'function') {
      updateCantoEquipoBadge();
    }
    
    return;
  }
  window.ajustesListenersAttached = true;
  // 1. Inicializar preferencias visuales generales
  const savedTheme = localStorage.getItem('theme') || 'light';
  window.setTheme(savedTheme);
  window.setListStyle(window.songListStyle);
  window.applyStageColors();
  window.applyBookTheme();
  window.applyCatHeaderStyles();
  window.applyPerfilHeaderStyles();

  // Zoom
  const initialZoom = window.getDefaultZoom();
  window.applyZoom(initialZoom);

  // Ancho
  const savedWidth = localStorage.getItem('app-max-width') || '1200';
  document.documentElement.style.setProperty('--app-max-width', savedWidth + 'px');
  const widthSlider = document.getElementById('app-width-slider');
  const widthBadge = document.getElementById('app-width-badge');
  const widthDefaultBtn = document.getElementById('app-width-default-btn');
  if (widthSlider) {
    widthSlider.value = savedWidth;
    widthSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      if (widthBadge) widthBadge.textContent = val + 'px';
      document.documentElement.style.setProperty('--app-max-width', val + 'px');
      localStorage.setItem('app-max-width', val);
    });
  }
  if (widthBadge) widthBadge.textContent = savedWidth + 'px';
  if (widthDefaultBtn) {
    widthDefaultBtn.addEventListener('click', () => {
      if (widthSlider) widthSlider.value = 1200;
      if (widthBadge) widthBadge.textContent = '1200px';
      document.documentElement.style.setProperty('--app-max-width', '1200px');
      localStorage.setItem('app-max-width', '1200');
    });
  }

  // Tipografía
  const savedFont = localStorage.getItem('lyrics-font-family') || 'franklin';
  window.applyFontFamily(savedFont);
  const fontFamilySelect = document.getElementById('font-family-select');
  if (fontFamilySelect) {
    fontFamilySelect.value = savedFont;
    fontFamilySelect.addEventListener('change', () => {
      const key = fontFamilySelect.value;
      window.applyFontFamily(key);
      localStorage.setItem('lyrics-font-family', key);
    });
  }

  window.initWakeLockPreference();
  window.initAutoHideNavPreference();

  // --- SUBMÓDULO INICIO ---
  const closeFiltersToggle = document.getElementById('close-filters-on-select-toggle');
  if (closeFiltersToggle) {
    const isCloseOnSelect = localStorage.getItem('closeFiltersOnSelect') !== 'false';
    closeFiltersToggle.checked = isCloseOnSelect;
    closeFiltersToggle.addEventListener('change', (e) => {
      localStorage.setItem('closeFiltersOnSelect', e.target.checked);
    });
  }

  const multiMomentToggle = document.getElementById('multi-moment-filter-toggle');
  if (multiMomentToggle) {
    const isMultiMoment = localStorage.getItem('multiMomentFilter') === 'true';
    multiMomentToggle.checked = isMultiMoment;
    multiMomentToggle.addEventListener('change', (e) => {
      localStorage.setItem('multiMomentFilter', e.target.checked);
      if (typeof window.limpiarFiltrosIndex === 'function') {
        window.limpiarFiltrosIndex();
      }
    });
  }

  const combineStageMomentToggle = document.getElementById('combine-stage-moment-filter-toggle');
  if (combineStageMomentToggle) {
    const isCombine = localStorage.getItem('combineStageMomentFilter') === 'true';
    combineStageMomentToggle.checked = isCombine;
    combineStageMomentToggle.addEventListener('change', (e) => {
      localStorage.setItem('combineStageMomentFilter', e.target.checked);
      if (typeof window.limpiarFiltrosIndex === 'function') {
        window.limpiarFiltrosIndex();
      }
    });
  }

  const keepStageToggle = document.getElementById('keep-stage-filter-active-toggle');
  if (keepStageToggle) {
    const isKeepActive = localStorage.getItem('keepStageFilterActive') !== 'false';
    keepStageToggle.checked = isKeepActive;
    keepStageToggle.addEventListener('change', (e) => {
      localStorage.setItem('keepStageFilterActive', e.target.checked);
    });
  }

  const stickySearchToggle = document.getElementById('sticky-search-toggle');
  if (stickySearchToggle) {
    const isSticky = localStorage.getItem('stickySearch') !== 'false';
    stickySearchToggle.checked = isSticky;
    if (typeof window.applyStickySearchPreference === 'function') {
      window.applyStickySearchPreference();
    }
    stickySearchToggle.addEventListener('change', (e) => {
      localStorage.setItem('stickySearch', e.target.checked);
      if (typeof window.applyStickySearchPreference === 'function') {
        window.applyStickySearchPreference();
      }
    });
  }

  // Loop de Reproducción
  const loopToggle = document.getElementById('audio-loop-toggle');
  const player = document.getElementById('viewer-audio-player');
  if (loopToggle && player) {
    const loopEnabled = localStorage.getItem('audioLoopEnabled') === 'true';
    loopToggle.checked = loopEnabled;
    player.loop = loopEnabled;
    
    loopToggle.addEventListener('change', (e) => {
      localStorage.setItem('audioLoopEnabled', e.target.checked);
      player.loop = e.target.checked;
    });
  }

  // Ecualizador de Audio (Bucle y Filtros)
  const eqHeader = document.getElementById('eq-accordion-header');
  const eqContainer = document.getElementById('eq-controls-container');
  const eqIcon = document.getElementById('eq-collapse-icon');
  
  if (eqHeader && eqContainer) {
    eqHeader.addEventListener('click', () => {
      const isOpen = eqContainer.style.display !== 'none';
      eqContainer.style.display = isOpen ? 'none' : 'flex';
      if (eqIcon) {
        eqIcon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    });
  }

  window.initAudioEqualizer = function() {
    if (window.eqCtx) return; // Ya inicializado
    const playerEl = document.getElementById('viewer-audio-player');
    if (!playerEl) return;
    
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      window.eqCtx = new AudioContextClass();
      
      // Crear filtros
      window.eqBassFilter = window.eqCtx.createBiquadFilter();
      window.eqBassFilter.type = 'lowshelf';
      window.eqBassFilter.frequency.value = 200;
      
      window.eqMidFilter = window.eqCtx.createBiquadFilter();
      window.eqMidFilter.type = 'peaking';
      window.eqMidFilter.frequency.value = 1000;
      window.eqMidFilter.Q.value = 1.0;
      
      window.eqTrebleFilter = window.eqCtx.createBiquadFilter();
      window.eqTrebleFilter.type = 'highshelf';
      window.eqTrebleFilter.frequency.value = 4000;
      
      // Permitir CORS dinámicamente
      playerEl.crossOrigin = 'anonymous';
      
      // Crear fuente y conectar
      window.eqSource = window.eqCtx.createMediaElementSource(playerEl);
      window.eqSource.connect(window.eqBassFilter);
      window.eqBassFilter.connect(window.eqMidFilter);
      window.eqMidFilter.connect(window.eqTrebleFilter);
      window.eqTrebleFilter.connect(window.eqCtx.destination);
      
      // Aplicar ganancias iniciales desde localStorage
      const bassG = parseFloat(localStorage.getItem('eqGainBass') || '0');
      const midG = parseFloat(localStorage.getItem('eqGainMid') || '0');
      const trebleG = parseFloat(localStorage.getItem('eqGainTreble') || '0');
      
      window.eqBassFilter.gain.value = bassG;
      window.eqMidFilter.gain.value = midG;
      window.eqTrebleFilter.gain.value = trebleG;
    } catch (err) {
      console.error("Error al inicializar el ecualizador Web Audio:", err);
    }
  };

  // Manejar Sliders del Ecualizador
  const bassSlider = document.getElementById('eq-bass-slider');
  const midSlider = document.getElementById('eq-mid-slider');
  const trebleSlider = document.getElementById('eq-treble-slider');
  
  const bassVal = document.getElementById('eq-bass-val');
  const midVal = document.getElementById('eq-mid-val');
  const trebleVal = document.getElementById('eq-treble-val');
  
  const resetBtn = document.getElementById('eq-reset-btn');
  
  const updateBass = (val) => {
    localStorage.setItem('eqGainBass', val);
    if (bassVal) bassVal.textContent = val > 0 ? `+${val} dB` : `${val} dB`;
    if (window.initAudioEqualizer) window.initAudioEqualizer();
    if (window.eqBassFilter) window.eqBassFilter.gain.value = parseFloat(val);
  };
  
  const updateMid = (val) => {
    localStorage.setItem('eqGainMid', val);
    if (midVal) midVal.textContent = val > 0 ? `+${val} dB` : `${val} dB`;
    if (window.initAudioEqualizer) window.initAudioEqualizer();
    if (window.eqMidFilter) window.eqMidFilter.gain.value = parseFloat(val);
  };
  
  const updateTreble = (val) => {
    localStorage.setItem('eqGainTreble', val);
    if (trebleVal) trebleVal.textContent = val > 0 ? `+${val} dB` : `${val} dB`;
    if (window.initAudioEqualizer) window.initAudioEqualizer();
    if (window.eqTrebleFilter) window.eqTrebleFilter.gain.value = parseFloat(val);
  };
  
  if (bassSlider) {
    bassSlider.value = localStorage.getItem('eqGainBass') || '0';
    updateBass(bassSlider.value);
    bassSlider.addEventListener('input', (e) => {
      if (window.eqCtx && window.eqCtx.state === 'suspended') window.eqCtx.resume();
      updateBass(e.target.value);
    });
  }
  if (midSlider) {
    midSlider.value = localStorage.getItem('eqGainMid') || '0';
    updateMid(midSlider.value);
    midSlider.addEventListener('input', (e) => {
      if (window.eqCtx && window.eqCtx.state === 'suspended') window.eqCtx.resume();
      updateMid(e.target.value);
    });
  }
  if (trebleSlider) {
    trebleSlider.value = localStorage.getItem('eqGainTreble') || '0';
    updateTreble(trebleSlider.value);
    trebleSlider.addEventListener('input', (e) => {
      if (window.eqCtx && window.eqCtx.state === 'suspended') window.eqCtx.resume();
      updateTreble(e.target.value);
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (window.eqCtx && window.eqCtx.state === 'suspended') window.eqCtx.resume();
      if (bassSlider) { bassSlider.value = '0'; updateBass('0'); }
      if (midSlider) { midSlider.value = '0'; updateMid('0'); }
      if (trebleSlider) { trebleSlider.value = '0'; updateTreble('0'); }
    });
  }

  // 2. Adjuntar listeners para controles del modal de Ajustes
  
  // Selección de pestañas
  const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
  settingsTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      window.openSettingsTab(tab);
      if (tab === 'canto' && typeof window.populateBisSongList === 'function') {
        window.populateBisSongList();
      }
    });
  });

  // Botones de tema
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      window.setTheme(theme);
    });
  });

  // Botones de estilo de lista
  document.querySelectorAll('.list-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      window.setListStyle(style);
    });
  });

  // Botones de zoom en ajustes
  const settingsZoomOutBtn = document.getElementById('settings-zoom-out-btn');
  const settingsZoomInBtn = document.getElementById('settings-zoom-in-btn');
  if (settingsZoomOutBtn) {
    settingsZoomOutBtn.addEventListener('click', () => {
      window.updateZoom(window.zoomFactor - 0.1);
    });
  }
  if (settingsZoomInBtn) {
    settingsZoomInBtn.addEventListener('click', () => {
      window.updateZoom(window.zoomFactor + 0.1);
    });
  }

  // Importar / Exportar Notas
  const exportNotesBtn = document.getElementById('export-notes-btn');
  const importNotesBtn = document.getElementById('import-notes-btn');
  if (exportNotesBtn) exportNotesBtn.addEventListener('click', window.exportNotes);
  if (importNotesBtn) importNotesBtn.addEventListener('click', window.importNotes);

  // Manejo de subpestañas dentro del Módulo General (Gral Común y Cloud)
  window.switchGeneralSubmodule = function(subtab) {
    const btns = document.querySelectorAll('.general-subtab-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.dataset.subtab === subtab);
      if (b.dataset.subtab === subtab) {
        b.style.borderBottom = '2.5px solid var(--accent-color)';
        b.style.color = 'var(--accent-color)';
        b.style.fontWeight = '700';
      } else {
        b.style.borderBottom = 'none';
        b.style.color = 'var(--text-muted)';
        b.style.fontWeight = '600';
      }
    });

    const panels = {
      'comun': document.getElementById('general-submodule-comun-content'),
      'cloud': document.getElementById('general-submodule-cloud-content')
    };

    for (const [key, el] of Object.entries(panels)) {
      if (el) {
        el.style.display = key === subtab ? 'block' : 'none';
      }
    }
  };

  const generalSubtabBtns = document.querySelectorAll('.general-subtab-btn');
  generalSubtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.switchGeneralSubmodule(btn.dataset.subtab);
    });
  });

  // Manejo de subpestañas dentro del Módulo LOG (LOG y Estado Resucitó)
  window.switchLogSubmodule = function(subtab) {
    const btns = document.querySelectorAll('.log-subtab-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.dataset.subtab === subtab);
      if (b.dataset.subtab === subtab) {
        b.style.borderBottom = '2.5px solid var(--accent-color)';
        b.style.color = 'var(--accent-color)';
        b.style.fontWeight = '700';
      } else {
        b.style.borderBottom = 'none';
        b.style.color = 'var(--text-muted)';
        b.style.fontWeight = '600';
      }
    });

    const panels = {
      'console': document.getElementById('log-submodule-console-content'),
      'status': document.getElementById('log-submodule-status-content')
    };

    for (const [key, el] of Object.entries(panels)) {
      if (el) {
        el.style.display = key === subtab ? 'block' : 'none';
      }
    }

    if (subtab === 'status') {
      window.recalcularEstadoRecursos();
    }
  };

  const logSubtabBtns = document.querySelectorAll('.log-subtab-btn');
  logSubtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.switchLogSubmodule(btn.dataset.subtab);
    });
  });

  // --- MÓDULO ESTADO RESUCITÓ ---
  async function loadResourceIntoCache(url) {
    try {
      const keys = await caches.keys();
      const cacheName = keys.find(k => k.startsWith('resucito-cache-')) || 'resucito-cache-v208';
      const cache = await caches.open(cacheName);
      
      const res = await fetch(url);
      if (res.ok) {
        await cache.put(url, res.clone());
        return true;
      }
    } catch (e) {
      console.error('Error cargando recurso a caché:', url, e);
    }
    return false;
  }

  function bindStatusButtons() {
    // Botones individuales "Cargar recurso"
    document.querySelectorAll('.btn-status-load-single').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = btn.dataset.url;
        btn.disabled = true;
        btn.textContent = 'Cargando...';
        const success = await loadResourceIntoCache(url);
        if (success) {
          window.recalcularEstadoRecursos();
        } else {
          btn.disabled = false;
          btn.textContent = 'Reintentar';
          if (window.mostrarAlerta) {
            window.mostrarAlerta({
              titulo: 'Error de carga',
              mensaje: `No se pudo descargar el recurso: ${url}. Verifique su conexión a Internet.`,
              icono: 'error'
            });
          } else {
            alert(`No se pudo descargar el recurso: ${url}`);
          }
        }
      });
    });

    // Botones de grupo "Cargar faltantes"
    document.querySelectorAll('.btn-status-load-group').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const urls = JSON.parse(btn.dataset.urls);
        btn.disabled = true;
        btn.textContent = 'Cargando...';
        
        let loaded = 0;
        for (const url of urls) {
          const success = await loadResourceIntoCache(url);
          if (success) loaded++;
        }
        
        window.recalcularEstadoRecursos();
      });
    });
  }

  // Vincular botón "Cargar todos los faltantes" (general) una sola vez al cargar el DOM o usar delegación
  document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'btn-status-load-all') {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target;
      const urls = JSON.parse(btn.dataset.urls || '[]');
      if (urls.length === 0) return;
      
      btn.disabled = true;
      btn.textContent = 'Cargando todos...';
      
      for (const url of urls) {
        await loadResourceIntoCache(url);
      }
      
      window.recalcularEstadoRecursos();
    }
    
    if (e.target && e.target.id === 'btn-status-refresh') {
      e.preventDefault();
      e.stopPropagation();
      window.recalcularEstadoRecursos();
    }
  });

  window.recalcularEstadoRecursos = async function() {
    const listEl = document.getElementById('status-resources-list');
    const totalRatioEl = document.getElementById('status-total-ratio');
    const loadAllBtn = document.getElementById('btn-status-load-all');
    const missingCountEl = document.getElementById('status-missing-count');
    const missingListEl = document.getElementById('status-missing-list');

    if (!listEl) return;

    listEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px 0;">Escaneando recursos en la caché local...</div>';

    try {
      // 1. Obtener recursos estáticos de las páginas HTML
      const htmlResources = [
        { label: 'Inicio o Index.html', url: 'index.html' },
        { label: 'Perfil Cuenta (HTML)', url: 'perfil.html' },
        { label: 'Preparar Cantos (HTML)', url: 'preparar.html' },
        { label: 'Ajustes de la App (HTML)', url: 'data/ajustes_modal.html' }
      ];

      // JSONs de datos estáticos
      const jsonResources = [
        { label: 'Índice de Búsqueda (JSON)', url: 'data/songs-index.json' },
        { label: 'Posiciones de Acordes (JSON)', url: 'data/chord_positions.json' },
        { label: 'Catequesis (JSON)', url: 'data/catequesis.json' },
        { label: 'Paises y Diócesis (JSON)', url: 'data/paises.json' }
      ];

      // Descubrir JS, CSS e imágenes analizando los HTMLs locales
      const htmlsToParse = ['index.html', 'perfil.html', 'preparar.html'];
      const jsSet = new Set();
      const cssSet = new Set();
      const assetSet = new Set(); // Imágenes, fuentes, manifest

      // Agregar Service Worker
      jsSet.add('sw.js');
      assetSet.add('manifest.json');

      for (const htmlPath of htmlsToParse) {
        try {
          const res = await fetch(htmlPath);
          if (res.ok) {
            const text = await res.text();
            // Buscar JS
            const jsMatches = text.matchAll(/src="([^"]+\.js)"/g);
            for (const m of jsMatches) {
              jsSet.add(m[1].replace(/^\.\//, ''));
            }
            // Buscar CSS
            const cssMatches = text.matchAll(/href="([^"]+\.css)"/g);
            for (const m of cssMatches) {
              cssSet.add(m[1].replace(/^\.\//, ''));
            }
            // Buscar imágenes
            const imgMatches = text.matchAll(/src="([^"]+\.(png|jpg|jpeg|gif|ico|svg))"/g);
            for (const m of imgMatches) {
              assetSet.add(m[1].replace(/^\.\//, ''));
            }
            // Buscar preloads de JS/CSS
            const preloadMatches = text.matchAll(/href="([^"]+\.(js|css))"/g);
            for (const m of preloadMatches) {
              if (m[2] === 'js') jsSet.add(m[1].replace(/^\.\//, ''));
              else if (m[2] === 'css') cssSet.add(m[1].replace(/^\.\//, ''));
            }
          }
        } catch (e) {
          console.warn('Error escaneando HTML:', htmlPath, e);
        }
      }

      // Convertir Sets a arrays
      const jsResources = Array.from(jsSet).map(url => ({ url }));
      const cssResources = Array.from(cssSet).map(url => ({ url }));
      const assetResources = Array.from(assetSet).map(url => ({ url }));

      // JSONs de Cantos
      const songIds = window.allSongs ? window.allSongs.map(s => s.id) : [];
      const songResources = songIds.map(id => {
        const folder = id.startsWith('aet') ? 'data/songs-ae' : 'data/songs';
        return { url: `${folder}/${id}.json?offline=true` };
      });

      // 2. Conectar a la caché
      const keys = await caches.keys();
      const cacheName = keys.find(k => k.startsWith('resucito-cache-')) || 'resucito-cache-v208';
      const cache = await caches.open(cacheName);
      
      // Obtener todas las claves cacheadas para búsqueda rápida
      const cachedRequests = await cache.keys();
      const cachedUrls = new Set(cachedRequests.map(r => {
        const urlObj = new URL(r.url, window.location.href);
        // Retornamos la ruta relativa limpia
        let path = urlObj.pathname;
        if (path.startsWith('/')) {
          path = path.substring(1);
        }
        return path + urlObj.search;
      }));

      // Helper para comprobar existencia en caché
      const checkCached = (relUrl) => {
        let cleanRel = relUrl.replace(/^\.\//, '');
        if (cleanRel.startsWith('/')) {
          cleanRel = cleanRel.substring(1);
        }
        return cachedUrls.has(cleanRel);
      };

      // 3. Evaluar el estado de cada categoría
      let totalCount = 0;
      let cachedCount = 0;
      const missingFiles = [];

      const evaluateGroup = (resourcesList) => {
        let groupTotal = resourcesList.length;
        let groupCached = 0;
        const missingGroup = [];
        
        resourcesList.forEach(r => {
          const isCached = checkCached(r.url);
          if (isCached) {
            groupCached++;
          } else {
            missingGroup.push(r.url);
            missingFiles.push(r.url);
          }
        });
        
        totalCount += groupTotal;
        cachedCount += groupCached;
        
        return { total: groupTotal, cached: groupCached, missing: missingGroup };
      };

      // Evaluar archivos HTML individuales
      const htmlResults = htmlResources.map(r => {
        const isCached = checkCached(r.url);
        totalCount++;
        if (isCached) cachedCount++;
        else missingFiles.push(r.url);
        return { ...r, isCached };
      });

      // Evaluar grupos
      const jsResults = evaluateGroup(jsResources);
      const cssResults = evaluateGroup(cssResources);
      const jsonResults = evaluateGroup(jsonResources);
      const songResults = evaluateGroup(songResources);
      const assetResults = evaluateGroup(assetResources);

      // 4. Renderizar UI
      let html = '';

      // Renderizar HTMLs individuales
      htmlResults.forEach(r => {
        const dotColor = r.isCached ? '#28a745' : '#dc3545';
        const dotSize = '1.8rem';
        const buttonHtml = r.isCached ? '' : `
          <button class="btn theme-btn btn-status-load-single" data-url="${r.url}" style="font-size: 0.75rem; padding: 4px 10px;">Cargar recurso</button>
        `;
        html += `
          <div class="status-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1.5px solid var(--panel-border); border-radius: 12px; background: var(--input-bg);">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: ${dotSize}; line-height: 1; color: ${dotColor}; user-select: none; margin-top: -4px;">•</span>
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 0.88rem; font-weight: 700; color: var(--text-color);">${r.label}</span>
                <span style="font-size: 0.7rem; color: var(--text-muted);">${r.url}</span>
              </div>
            </div>
            ${buttonHtml}
          </div>
        `;
      });

      // Renderizar filas de grupos
      const renderGroupRow = (title, detailsText, results) => {
        const isComplete = results.cached === results.total;
        const dotColor = isComplete ? '#28a745' : '#dc3545';
        const dotSize = '1.8rem';
        const buttonHtml = isComplete ? '' : `
          <button class="btn theme-btn btn-status-load-group" data-urls='${JSON.stringify(results.missing)}' style="font-size: 0.75rem; padding: 4px 10px;">Cargar faltantes</button>
        `;
        html += `
          <div class="status-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1.5px solid var(--panel-border); border-radius: 12px; background: var(--input-bg);">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: ${dotSize}; line-height: 1; color: ${dotColor}; user-select: none; margin-top: -4px;">•</span>
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 0.88rem; font-weight: 700; color: var(--text-color);">${title}</span>
                <span style="font-size: 0.72rem; color: var(--text-muted);">${results.cached}/${results.total} archivos (${detailsText})</span>
              </div>
            </div>
            ${buttonHtml}
          </div>
        `;
      };

      renderGroupRow('Archivos JavaScript (.js)', 'Scripts de la aplicación', jsResults);
      renderGroupRow('Archivos CSS (.css)', 'Estilos visuales', cssResults);
      renderGroupRow('Archivos JSON de Datos', 'Diócesis, catequesis, acordes', jsonResults);
      renderGroupRow('Archivos JSON de Cantos', 'Acordes, letras y cejillas', songResults);
      renderGroupRow('Otros Recursos', 'Imágenes, fuentes y PWA Manifest', assetResults);

      listEl.innerHTML = html;

      // Actualizar Totales
      totalRatioEl.textContent = `${cachedCount}/${totalCount}`;
      if (missingFiles.length === 0) {
        totalRatioEl.style.color = '#28a745';
      } else {
        totalRatioEl.style.color = '#dc3545';
      }
      missingCountEl.textContent = missingFiles.length;

      // Actualizar color de la nube (verde si está completo, rojo si falta algo)
      const cloudIconEl = document.getElementById('status-cloud-icon');
      if (cloudIconEl) {
        if (missingFiles.length === 0) {
          cloudIconEl.style.color = '#28a745';
        } else {
          cloudIconEl.style.color = '#dc3545';
        }
      }

      if (missingFiles.length > 0) {
        loadAllBtn.style.display = 'block';
        loadAllBtn.dataset.urls = JSON.stringify(missingFiles);
        missingListEl.innerHTML = missingFiles.map(f => `<div style="word-break: break-all; color: #dc3545; padding: 2px 0;">• ${f}</div>`).join('');
      } else {
        loadAllBtn.style.display = 'none';
        missingListEl.innerHTML = '<div style="color: #28a745; font-weight: 600;">¡Todos los recursos están cargados correctamente!</div>';
      }

      bindStatusButtons();

    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div style="text-align: center; color: #dc3545; padding: 20px 0;">Error al evaluar recursos: ${err.message}</div>`;
    }
  };


  // --- MÓDULO CLOUD ---
  function updateCloudProgress(statusText, percentage) {
    const container = document.getElementById('cloud-progress-container');
    const status = document.getElementById('cloud-progress-status');
    const pctText = document.getElementById('cloud-progress-percentage');
    const fill = document.getElementById('cloud-progress-bar-fill');
    
    if (container) container.style.display = 'block';
    if (status) {
      status.textContent = statusText;
      // Remover negrita si es el mensaje de éxito de descarga o sincronización
      if (statusText === "¡Todos los cantos descargados offline con éxito!" || statusText === "¡Tus cejillas y notas se activaron de forma offline!") {
        status.style.fontWeight = 'normal';
      } else {
        status.style.fontWeight = '600';
      }
    }
    if (pctText) pctText.textContent = `${percentage}%`;
    if (fill) fill.style.width = `${percentage}%`;
  }
  
  function hideCloudProgress() {
    const container = document.getElementById('cloud-progress-container');
    if (container) {
      setTimeout(() => {
        container.style.display = 'none';
      }, 3000);
    }
  }

  const cantoEquipoToggle = document.getElementById('canto-equipo-toggle');
  if (cantoEquipoToggle) {
    cantoEquipoToggle.checked = localStorage.getItem('cantoEquipoOffline') === 'true';
    if (typeof updateCantoEquipoBadge === 'function') {
      updateCantoEquipoBadge();
    }
    cantoEquipoToggle.addEventListener('change', async () => {
      // Comprobar si hay conexión a Internet para cualquier cambio (activar o desactivar)
      if (!navigator.onLine) {
        if (window.mostrarAlerta) {
          window.mostrarAlerta({
            titulo: 'Sin Conexión',
            mensaje: 'No puedes Habilitar Resucitó sin Internet si no tienes internet',
            icono: 'wifi_off'
          });
        } else {
          alert("⚠️ Sin Conexión\nNo puedes Habilitar Resucitó sin Internet si no tienes internet");
        }
        // Revertir al estado persistido previamente
        cantoEquipoToggle.checked = localStorage.getItem('cantoEquipoOffline') === 'true';
        updateCantoEquipoBadge();
        return;
      }

      updateCantoEquipoBadge();
      const isChecked = cantoEquipoToggle.checked;
      if (isChecked) {

        // ACTIVAR: Descargar todos los cantos
        cantoEquipoToggle.disabled = true;
        try {
          updateCloudProgress("Iniciando descarga...", 0);
          
          const keys = await caches.keys();
          const cacheName = keys.find(k => k.startsWith('resucito-cache-')) || 'resucito-cache-v208';
          const cache = await caches.open(cacheName);
          
          const songIds = window.allSongs ? window.allSongs.map(s => s.id) : [];
          if (songIds.length === 0) {
            throw new Error("No hay cantos cargados en la aplicación para descargar.");
          }
          
          let downloaded = 0;
          const total = songIds.length;
          const batchSize = 15;
          
          for (let i = 0; i < total; i += batchSize) {
            const batch = songIds.slice(i, i + batchSize);
            await Promise.all(batch.map(async (id) => {
              const folder = id.startsWith('aet') ? 'data/songs-ae' : 'data/songs';
              const url = `${folder}/${id}.json?offline=true`;
              try {
                const res = await fetch(url);
                if (res.ok) {
                  await cache.put(url, res.clone());
                }
              } catch (err) {
                console.warn(`Error descargando canto ${id}:`, err);
              }
              downloaded++;
            }));
            
            const pct = Math.min(100, Math.round((downloaded / total) * 100));
            updateCloudProgress(`Descargando cantos (${downloaded}/${total})...`, pct);
          }
          
          localStorage.setItem('cantoEquipoOffline', 'true');
          updateCloudProgress("¡Todos los cantos descargados offline con éxito!", 100);
        } catch (err) {
          console.error(err);
          if (window.mostrarAlerta) {
            window.mostrarAlerta({
              titulo: 'Error',
              mensaje: 'Error al descargar cantos: ' + err.message,
              icono: 'error'
            });
          } else {
            alert("Error al descargar cantos: " + err.message);
          }
          updateCloudProgress("Error en la descarga", 0);
          cantoEquipoToggle.checked = false;
          updateCantoEquipoBadge();
        } finally {
          cantoEquipoToggle.disabled = false;
          hideCloudProgress();
        }
      } else {
        // DESACTIVAR: Eliminar cantos de la caché
        const doDeactivate = async () => {
          cantoEquipoToggle.disabled = true;
          try {
            updateCloudProgress("Eliminando cantos guardados...", 20);
            const keys = await caches.keys();
            const cacheName = keys.find(k => k.startsWith('resucito-cache-')) || 'resucito-cache-v208';
            const cache = await caches.open(cacheName);
            
            const songIds = window.allSongs ? window.allSongs.map(s => s.id) : [];
            let deleted = 0;
            
            for (const id of songIds) {
              const folder = id.startsWith('aet') ? 'data/songs-ae' : 'data/songs';
              const url = `${folder}/${id}.json?offline=true`;
              await cache.delete(url);
              deleted++;
              const pct = 20 + Math.round((deleted / songIds.length) * 80);
              updateCloudProgress(`Eliminando canto ${deleted}/${songIds.length}...`, pct);
            }
            
            localStorage.setItem('cantoEquipoOffline', 'false');
            updateCloudProgress("¡Modo sin conexión desactivado y caché liberada!", 100);
          } catch (err) {
            console.error(err);
            if (window.mostrarAlerta) {
              window.mostrarAlerta({
                titulo: 'Error',
                mensaje: 'Error al desactivar: ' + err.message,
                icono: 'error'
              });
            } else {
              alert("Error al desactivar: " + err.message);
            }
            cantoEquipoToggle.checked = true;
            updateCantoEquipoBadge();
          } finally {
            cantoEquipoToggle.disabled = false;
            hideCloudProgress();
          }
        };

        if (window.mostrarConfirmacion) {
          window.mostrarConfirmacion({
            titulo: 'Resucitó solo con Internet',
            mensaje: '¿Deseas desactivar el modo sin conexión y eliminar los cantos guardados localmente?',
            icono: 'wifi',
            textoSi: 'Sí',
            textoNo: 'No',
            onConfirm: doDeactivate,
            onCancel: () => {
              cantoEquipoToggle.checked = true;
              updateCantoEquipoBadge();
            }
          });
        } else {
          if (confirm("¿Deseas desactivar el modo sin conexión y eliminar los cantos guardados localmente?")) {
            doDeactivate();
          } else {
            cantoEquipoToggle.checked = true;
            updateCantoEquipoBadge();
          }
        }
      }
    });
  }

  const btnSyncOffline = document.getElementById('btn-cloud-sync-offline');
  if (btnSyncOffline) {
    btnSyncOffline.addEventListener('click', async () => {
      const user = getCurrentUser() || auth.currentUser;
      if (!user) {
        if (window.mostrarAlerta) {
          window.mostrarAlerta({
            titulo: 'Iniciar Sesión',
            mensaje: 'Debes iniciar sesión con tu cuenta de Google para descargar tus datos desde la nube.',
            icono: 'account_circle'
          });
        } else {
          alert("⚠️ Debes iniciar sesión con tu cuenta de Google para descargar tus datos desde la nube.");
        }
        return;
      }
      
      btnSyncOffline.disabled = true;
      try {
        updateCloudProgress("Conectando con la nube...", 10);
        
        const dbdataRef = collection(db, "usuarios", user.uid, "dbdata");
        const snap = await getDocs(dbdataRef);
        
        updateCloudProgress("Procesando datos del salmista...", 40);
        
        if (snap.empty) {
          updateCloudProgress("No tienes datos personales guardados en la nube.", 100);
          return;
        }
        
        let processed = 0;
        const total = snap.docs.length;
        
        snap.forEach(docSnap => {
          const songId = docSnap.id;
          const dataDoc = docSnap.data();
          const val = dataDoc.valor || dataDoc;
          
          const localConfig = {
            valoracion: parseInt(val.valoracion) || 0,
            cejilla: String(val.cejilla || "0"),
            acorde: String(val.acorde || "0")
          };
          localStorage.setItem(`canto-config-${songId}`, JSON.stringify(localConfig));
          
          if (val.notesCantor !== undefined) {
            localStorage.setItem(`notes_${songId}`, val.notesCantor);
          }
          
          processed++;
          const pct = 40 + Math.round((processed / total) * 60);
          updateCloudProgress(`Guardando datos del canto ${processed}/${total}...`, pct);
        });
        
        updateCloudProgress("¡Tus cejillas y notas se activaron de forma offline!", 100);
        if (typeof window.routeSPA === 'function') window.routeSPA();
      } catch (err) {
        console.error(err);
        if (window.mostrarAlerta) {
          window.mostrarAlerta({
            titulo: 'Error',
            mensaje: 'Error al descargar datos personales: ' + err.message,
            icono: 'error'
          });
        } else {
          alert("Error al descargar datos personales: " + err.message);
        }
        updateCloudProgress("Error al activar offline", 0);
      } finally {
        btnSyncOffline.disabled = false;
        hideCloudProgress();
      }
    });
  }

  const btnClearCache = document.getElementById('btn-cloud-clear-cache');
  if (btnClearCache) {
    btnClearCache.addEventListener('click', async () => {
      if (!navigator.onLine) {
        if (window.mostrarAlerta) {
          window.mostrarAlerta({
            titulo: 'Sin Conexión',
            mensaje: 'No puedes limpiar la caché estando sin conexión. Es obligatorio tener conexión a Internet para garantizar la re-descarga de recursos necesarios.',
            icono: 'wifi_off'
          });
        } else {
          alert("⚠️ No puedes limpiar la caché estando sin conexión. Es obligatorio tener conexión a Internet para garantizar la re-descarga de recursos necesarios.");
        }
        return;
      }
      
      const doClear = async () => {
        btnClearCache.disabled = true;
        try {
          updateCloudProgress("Eliminando caché...", 20);
          const keys = await caches.keys();
          let deletedCount = 0;
          
          for (const key of keys) {
            await caches.delete(key);
            deletedCount++;
            const pct = 20 + Math.round((deletedCount / keys.length) * 80);
            updateCloudProgress(`Eliminado caché: ${key}...`, pct);
          }
          
          if (window.loadedSongsCache) {
            window.loadedSongsCache = {};
          }
          
          localStorage.setItem('cantoEquipoOffline', 'false'); // Desactivar el toggle de canto offline
          
          updateCloudProgress("¡Caché limpiada con éxito! Recargando aplicación...", 100);
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (err) {
          console.error(err);
          if (window.mostrarAlerta) {
            window.mostrarAlerta({
              titulo: 'Error',
              mensaje: 'Error al limpiar caché: ' + err.message,
              icono: 'error'
            });
          } else {
            alert("Error al limpiar caché: " + err.message);
          }
          updateCloudProgress("Error al limpiar", 0);
          btnClearCache.disabled = false;
          hideCloudProgress();
        }
      };

      if (window.mostrarConfirmacion) {
        window.mostrarConfirmacion({
          titulo: 'Limpiar Caché',
          mensaje: '¿Estás seguro de que deseas limpiar la caché de la aplicación? Esto forzará la descarga de las últimas versiones de cantos y recursos la próxima vez que los abras.',
          icono: 'delete_forever',
          textoSi: 'Sí',
          textoNo: 'No',
          onConfirm: doClear
        });
      } else {
        if (confirm("¿Estás seguro de que deseas limpiar la caché de la aplicación? Esto forzará la descarga de las últimas versiones de cantos y recursos la próxima vez que los abras.")) {
          doClear();
        }
      }
    });
  }


  // Sliders de zoom / ancho
  if (widthSlider) {
    widthSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      localStorage.setItem('app-max-width', val);
      document.documentElement.style.setProperty('--app-max-width', val + 'px');
      if (widthBadge) widthBadge.textContent = val + 'px';
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
      window.applyStageColors();
      
      // Forzar renderizado
      if (window.filteredSongs && window.filteredSongs.length > 0) {
        if (typeof window.renderSongsList === 'function') window.renderSongsList(window.filteredSongs);
      } else if (window.allSongs) {
        if (typeof window.renderSongsList === 'function') window.renderSongsList(window.allSongs);
      }
    });
  });

  // Color pickers personalizados para etapas
  document.querySelectorAll('.stage-color-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const stage = input.dataset.stage;
      const color = e.target.value;
      
      localStorage.setItem(`stage-color-${stage}`, color);
      window.applyStageColors();
      
      if (window.filteredSongs && window.filteredSongs.length > 0) {
        if (typeof window.renderSongsList === 'function') window.renderSongsList(window.filteredSongs);
      } else if (window.allSongs) {
        if (typeof window.renderSongsList === 'function') window.renderSongsList(window.allSongs);
      }
    });
  });

  // Personalizar colores de botones de etapa y de ajustes
  document.querySelectorAll('.btn-color-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const stage = input.dataset.stage;
      const mode = input.dataset.mode;
      const color = e.target.value;
      
      if (stage === 'settings-btn') {
        if (mode === 'bg') {
          localStorage.setItem('settings-btn-bg', color);
        } else if (mode === 'text') {
          localStorage.setItem('settings-btn-text', color);
        }
      } else {
        if (mode === 'default') {
          localStorage.setItem(`stage-color-${stage}`, color);
        } else if (mode === 'text') {
          localStorage.setItem(`btn-color-${stage}-text`, color);
        } else {
          localStorage.setItem(`btn-color-${stage}-active`, color);
        }
      }
      window.applyStageColors();
    });
  });

  // Personalizar colores del Tema de Libro de Canto
  document.querySelectorAll('.book-theme-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const suffix = localStorage.getItem('theme') || 'light';
      const type = input.dataset.type;
      const color = e.target.value;
      
      localStorage.setItem(`book-theme-${type}-${suffix}`, color);
      window.applyBookTheme();
    });
  });

  // Reset del tema de libro
  const resetBookThemeBtn = document.getElementById('reset-book-theme-btn');
  if (resetBookThemeBtn) {
    resetBookThemeBtn.addEventListener('click', () => {
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
      const props = ['--bg-color', '--accent-color', '--text-color', '--accent-glow', '--song-title-color', '--chord-color', '--chord-color-alt', '--SangreCristo'];
      props.forEach(p => {
        document.body.style.removeProperty(p);
        document.documentElement.style.removeProperty(p);
      });
      window.applyBookTheme();
    });
  }

  // Reset de colores de canto
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
      ['--song-title-color', '--chord-color', '--chord-color-alt', '--SangreCristo'].forEach(p => {
        document.body.style.removeProperty(p);
        document.documentElement.style.removeProperty(p);
      });
      window.applyBookTheme();
    });
  }

  // Reset de colores de etapas
  const resetStageColorsBtn = document.getElementById('reset-stage-colors-btn');
  if (resetStageColorsBtn) {
    resetStageColorsBtn.addEventListener('click', () => {
      ['pre', 'cate', 'ele', 'lit', 'cat'].forEach(stg => {
        localStorage.removeItem(`stage-color-${stg}`);
        document.body.style.removeProperty(`--color-${stg}`);
        document.documentElement.style.removeProperty(`--color-${stg}`);
      });
      window.applyStageColors();
    });
  }

  // Reset de colores de botones
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
      localStorage.removeItem('settings-btn-bg');
      localStorage.removeItem('settings-btn-text');
      document.body.style.removeProperty('--settings-btn-bg');
      document.body.style.removeProperty('--settings-btn-text');
      document.documentElement.style.removeProperty('--settings-btn-bg');
      document.documentElement.style.removeProperty('--settings-btn-text');
      window.applyStageColors();
    });
  }

  // Personalizar colores del Navegador
  document.querySelectorAll('.nav-theme-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const type = input.dataset.type;
      const mode = input.dataset.mode || 'normal';
      const color = e.target.value;
      const key = mode === 'hover' ? `nav-color-${type}-hover` : `nav-color-${type}`;
      localStorage.setItem(key, color);
      if (mode === 'hover' && type === 'btn-bg') {
        localStorage.setItem('nav-color-btn-hover-bg', color);
      } else if (mode === 'hover' && type === 'wrapper-bg') {
        localStorage.setItem('nav-color-wrapper-hover-bg', color);
      }
      window.updateNavInputs();
    });
  });

  const resetNavThemeBtn = document.getElementById('reset-nav-theme-btn');
  if (resetNavThemeBtn) {
    resetNavThemeBtn.addEventListener('click', () => {
      const types = ['text', 'bg', 'btn-bg', 'icon', 'submenu-icon', 'wrapper-bg'];
      types.forEach(t => {
        localStorage.removeItem(`nav-color-${t}`);
        localStorage.removeItem(`nav-color-${t}-hover`);
      });
      localStorage.removeItem('nav-color-btn-hover-bg');
      localStorage.removeItem('nav-color-wrapper-hover-bg');
      window.updateNavInputs();
    });
  }

  // ══════════════════════════════════════════════════
  // PESTAÑA: PREPARAR CANTO — Cabecera de grupo
  // ══════════════════════════════════════════════════
  (function setupPrepararCantoListeners() {
    const colorInput  = document.getElementById('preparar-header-color');
    const sizeInput   = document.getElementById('preparar-header-size');
    const sizeLabel   = document.getElementById('preparar-header-size-label');
    const boldOnBtn   = document.getElementById('preparar-bold-on');
    const boldOffBtn  = document.getElementById('preparar-bold-off');
    const resetBtn    = document.getElementById('preparar-header-reset');

    function setBold(w) {
      localStorage.setItem('cat-header-font-weight', w);
      document.documentElement.style.setProperty('--cat-header-font-weight', w);
      if (boldOnBtn)  boldOnBtn.classList.toggle('active', w === '700');
      if (boldOffBtn) boldOffBtn.classList.toggle('active', w === '400');
      window.updateCatHeaderPreview();
    }

    const savedC = localStorage.getItem('cat-header-color')       || '#d01212';
    const savedS = localStorage.getItem('cat-header-font-size')   || '16';
    const savedW = localStorage.getItem('cat-header-font-weight') || '700';

    if (colorInput) colorInput.value = savedC;
    if (sizeInput)  sizeInput.value  = savedS;
    if (sizeLabel)  sizeLabel.textContent = savedS + 'px';

    setBold(savedW);
    window.updateCatHeaderPreview();

    if (colorInput) {
      colorInput.addEventListener('input', e => {
        localStorage.setItem('cat-header-color', e.target.value);
        document.documentElement.style.setProperty('--cat-header-color', e.target.value);
        window.updateCatHeaderPreview();
      });
    }

    if (sizeInput) {
      sizeInput.addEventListener('input', e => {
        localStorage.setItem('cat-header-font-size', e.target.value);
        document.documentElement.style.setProperty('--cat-header-font-size', e.target.value + 'px');
        if (sizeLabel) sizeLabel.textContent = e.target.value + 'px';
        window.updateCatHeaderPreview();
      });
    }

    if (boldOnBtn)  boldOnBtn.addEventListener('click',  () => setBold('700'));
    if (boldOffBtn) boldOffBtn.addEventListener('click', () => setBold('400'));

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
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
    }
  })();

  // ══════════════════════════════════════════════════
  // PESTAÑA: PERFIL — Cabecera de grupo
  // ══════════════════════════════════════════════════
  (function setupPerfilCantoListeners() {
    const colorInput  = document.getElementById('perfil-header-color');
    const sizeInput   = document.getElementById('perfil-header-size');
    const sizeLabel   = document.getElementById('perfil-header-size-label');
    const boldOnBtn   = document.getElementById('perfil-bold-on');
    const boldOffBtn  = document.getElementById('perfil-bold-off');
    const resetBtn    = document.getElementById('perfil-header-reset');

    function setBold(w) {
      localStorage.setItem('perfil-header-font-weight', w);
      document.documentElement.style.setProperty('--perfil-header-font-weight', w);
      if (boldOnBtn)  boldOnBtn.classList.toggle('active', w === '700');
      if (boldOffBtn) boldOffBtn.classList.toggle('active', w === '400');
      window.updatePerfilHeaderPreview();
    }

    const savedC = localStorage.getItem('perfil-header-color')       || '#d01212';
    const savedS = localStorage.getItem('perfil-header-font-size')   || '16';
    const savedW = localStorage.getItem('perfil-header-font-weight') || '700';

    if (colorInput) colorInput.value = savedC;
    if (sizeInput)  sizeInput.value  = savedS;
    if (sizeLabel)  sizeLabel.textContent = savedS + 'px';

    setBold(savedW);
    window.updatePerfilHeaderPreview();

    if (colorInput) {
      colorInput.addEventListener('input', e => {
        localStorage.setItem('perfil-header-color', e.target.value);
        document.documentElement.style.setProperty('--perfil-header-color', e.target.value);
        window.updatePerfilHeaderPreview();
      });
    }

    if (sizeInput) {
      sizeInput.addEventListener('input', e => {
        localStorage.setItem('perfil-header-font-size', e.target.value);
        document.documentElement.style.setProperty('--perfil-header-font-size', e.target.value + 'px');
        if (sizeLabel) sizeLabel.textContent = e.target.value + 'px';
        window.updatePerfilHeaderPreview();
      });
    }

    if (boldOnBtn)  boldOnBtn.addEventListener('click',  () => setBold('700'));
    if (boldOffBtn) boldOffBtn.addEventListener('click', () => setBold('400'));

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
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
    }
  })();

  // Manejo de la navegación de subpestañas de Tema
  window.switchThemeSubmodule = function(subtab) {
    const btns = document.querySelectorAll('.theme-subtab-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.dataset.subtab === subtab);
    });
    
    const subPanels = {
      'visual': document.getElementById('theme-submodule-visual-content'),
      'inicio': document.getElementById('theme-submodule-inicio-content'),
      'preparar-canto': document.getElementById('theme-submodule-preparar-content'),
      'perfil': document.getElementById('theme-submodule-perfil-content')
    };
    
    for (const [key, el] of Object.entries(subPanels)) {
      if (el) {
        el.style.display = key === subtab ? 'block' : 'none';
      }
    }
  };

  // Manejo de la navegación de subpestañas de Función (Personalizar Función)
  window.switchThemeFunctionModule = function(funcKey) {
    const btns = document.querySelectorAll('.func-subtab-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.dataset.func === funcKey);
    });
    
    const sections = {
      book: document.getElementById('theme-section-book'),
      canto: document.getElementById('theme-section-canto'),
      etapas: document.getElementById('theme-section-etapas'),
      botones: document.getElementById('theme-section-botones'),
      navegador: document.getElementById('theme-section-navegador'),
      toolbar: document.getElementById('theme-section-toolbar')
    };

    for (const [key, el] of Object.entries(sections)) {
      if (el) {
        if (key === funcKey) {
          el.style.display = 'block';
          el.classList.remove('collapsed');
          const content = el.querySelector('.collapsible-content');
          if (content) content.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      }
    }
  };

  const funcSubtabBtns = document.querySelectorAll('.func-subtab-btn');
  funcSubtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.switchThemeFunctionModule(btn.dataset.func);
    });
  });

  const themeSubtabBtns = document.querySelectorAll('.theme-subtab-btn');
  themeSubtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.switchThemeSubmodule(btn.dataset.subtab);
    });
  });

  // Manejo de sub-pestañas dentro del Módulo Usuario (Cuenta, Acceso y Uso App)
  const userSubtabBtns = document.querySelectorAll('.user-subtab-btn');
  userSubtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.dataset.subtab;
      userSubtabBtns.forEach(b => b.classList.toggle('active', b.dataset.subtab === subtab));

      const subpanels = document.querySelectorAll('.user-subpanel');
      subpanels.forEach(p => p.style.display = 'none');

      const targetSubpanel = document.getElementById(`user-subpanel-${subtab}`);
      if (targetSubpanel) {
        targetSubpanel.style.display = 'block';
      }

      if (subtab === 'usage') {
        window.renderUsoAppModule();
      }
    });
  });

  // --- REGISTRO DE USO DE LA APP EN FIREBASE ---
  function getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('usoAppDeviceId');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
      localStorage.setItem('usoAppDeviceId', deviceId);
    }
    return deviceId;
  }

  function getDeviceDescription() {
    const ua = navigator.userAgent;
    let os = 'Desconocido';
    if (/android/i.test(ua)) os = 'Android';
    else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) os = 'iOS';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'Desconocido';
    if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/edge|edg/i.test(ua)) browser = 'Edge';
    else if (/msie|trident/i.test(ua)) browser = 'IE';

    let type = 'Escritorio';
    if (/tablet|ipad|playbook|silk/i.test(ua)) type = 'Tablet';
    else if (/Mobile|Android|iP(hone|od)|IEMobile/i.test(ua)) type = 'Móvil';

    return `${type} (${os} / ${browser})`;
  }

  window.registrarUsoApp = async function() {
    try {
      const deviceId = getOrCreateDeviceId();
      const device = getDeviceDescription();
      
      let ip = 'Desconocida';
      let pais = 'Desconocido';
      
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          ip = data.ip || 'Desconocida';
          pais = data.country_name || 'Desconocido';
        }
      } catch (e1) {
        console.warn('Error al consultar ipapi.co, intentando fallback:', e1);
        try {
          const res = await fetch('https://api.db-ip.com/v2/free/self');
          if (res.ok) {
            const data = await res.json();
            ip = data.ipAddress || 'Desconocida';
            pais = data.countryName || 'Desconocido';
          }
        } catch (e2) {
          console.warn('Error en fallback de geolocalización:', e2);
        }
      }

      const currentUser = getCurrentUser();
      const usageData = {
        uid: currentUser ? currentUser.uid : 'Invitado',
        nombre: currentUser ? (currentUser.displayName || 'Usuario Google') : 'Invitado',
        email: currentUser ? (currentUser.email || '') : '',
        ip: ip,
        pais: pais,
        dispositivo: device,
        lastActive: Date.now()
      };

      const docRef = doc(db, "registro_uso", deviceId);
      await setDoc(docRef, usageData, { merge: true });
      console.log("📊 Registro de uso de la app sincronizado con Firebase.");
    } catch (err) {
      console.warn("⚠️ No se pudo registrar el uso en Firebase:", err);
    }
  };

  let usageTableZoom = parseFloat(localStorage.getItem('usageTableZoom')) || 0.8;

  function makeTableResizable(table) {
    const row = table.querySelector('thead tr');
    const cols = row ? row.children : [];
    if (cols.length === 0) return;
    
    table.style.tableLayout = 'fixed';
    
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (!col.style.width) {
        col.style.width = col.clientWidth + 'px';
      }
      
      if (!col.querySelector('.resize-handle')) {
        col.style.position = 'relative';
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.style.position = 'absolute';
        handle.style.right = '0';
        handle.style.top = '0';
        handle.style.bottom = '0';
        handle.style.width = '8px';
        handle.style.cursor = 'col-resize';
        handle.style.userSelect = 'none';
        handle.style.zIndex = '5';
        
        handle.addEventListener('mouseenter', () => { handle.style.backgroundColor = 'rgba(0,0,0,0.15)'; });
        handle.addEventListener('mouseleave', () => { handle.style.backgroundColor = 'transparent'; });
        
        col.appendChild(handle);
        
        let startX, startWidth;
        
        const onMouseDown = (e) => {
          startX = e.pageX !== undefined ? e.pageX : e.touches[0].pageX;
          startWidth = parseFloat(col.style.width);
          
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
          document.addEventListener('touchmove', onMouseMove);
          document.addEventListener('touchend', onMouseUp);
          
          handle.style.backgroundColor = 'rgba(0,0,0,0.25)';
          document.body.style.cursor = 'col-resize';
        };
        
        const onMouseMove = (e) => {
          const pageX = e.pageX !== undefined ? e.pageX : e.touches[0].pageX;
          const dx = pageX - startX;
          const newWidth = Math.max(50, startWidth + dx);
          col.style.width = newWidth + 'px';
        };
        
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.removeEventListener('touchmove', onMouseMove);
          document.removeEventListener('touchend', onMouseUp);
          
          handle.style.backgroundColor = 'transparent';
          document.body.style.cursor = 'default';
        };
        
        handle.addEventListener('mousedown', onMouseDown);
        handle.addEventListener('touchstart', onMouseDown, { passive: true });
      }
    }
  }

  let lastUsageRecords = [];

  window.applyUsageFilters = function() {
    const tableBody = document.getElementById('usage-users-table-body');
    if (!tableBody) return;

    const searchInput = document.getElementById('usage-search-input');
    const countrySelect = document.getElementById('usage-country-filter');

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedCountry = countrySelect ? countrySelect.value : 'all';

    const filtered = lastUsageRecords.filter(r => {
      // Filtro de País
      if (selectedCountry !== 'all') {
        const countryVal = r.pais || 'Desconocido';
        if (countryVal !== selectedCountry) return false;
      }

      // Filtro de búsqueda por texto
      if (query) {
        const name = (r.nombre || '').toLowerCase();
        const email = (r.email || '').toLowerCase();
        const ip = (r.ip || '').toLowerCase();
        const device = (r.dispositivo || '').toLowerCase();
        const country = (r.pais || '').toLowerCase();

        if (!name.includes(query) && 
            !email.includes(query) && 
            !ip.includes(query) && 
            !device.includes(query) && 
            !country.includes(query)) {
          return false;
        }
      }
      return true;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 20px; text-align: center; color: var(--text-muted);">
            Ningún registro coincide con los filtros aplicados.
          </td>
        </tr>
      `;
      return;
    }

    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;

    tableBody.innerHTML = filtered.map(r => {
      const lastActiveTime = r.lastActive ? new Date(r.lastActive) : null;
      const lastActiveStr = lastActiveTime 
        ? lastActiveTime.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) 
        : 'Desconocida';
      
      const diff = now - (r.lastActive || 0);
      const isOnline = diff < oneHourMs;
      const statusBadge = isOnline 
        ? `<span style="padding: 3px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; background: rgba(40, 167, 69, 0.15); color: #28a745; text-transform: uppercase;">OnLine</span>`
        : `<span style="padding: 3px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; background: rgba(220, 53, 69, 0.15); color: #dc3545; text-transform: uppercase;">OffLine</span>`;

      const userHtml = r.nombre === 'Invitado' 
        ? `<span style="font-weight: 600; color: var(--text-muted);">Invitado</span>`
        : `
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 700; color: var(--text-color);">${r.nombre}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${r.email || ''}</span>
          </div>
        `;

      return `
        <tr style="border-bottom: 1px solid var(--panel-border); transition: background 0.2s;">
          <td style="padding: 10px 12px; vertical-align: middle; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${userHtml}</td>
          <td style="padding: 10px 12px; vertical-align: middle; font-family: monospace; font-size: 0.75rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${r.ip || 'Desconocida'}</td>
          <td style="padding: 10px 12px; vertical-align: middle; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${r.pais || 'Desconocido'}</td>
          <td style="padding: 10px 12px; vertical-align: middle; font-size: 0.75rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${r.dispositivo || 'Desconocido'}</td>
          <td style="padding: 10px 12px; vertical-align: middle; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${statusBadge}</td>
          <td style="padding: 10px 12px; vertical-align: middle; font-size: 0.75rem; color: var(--text-muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${lastActiveStr}</td>
        </tr>
      `;
    }).join('');

    const table = document.getElementById('usage-users-table');
    if (table) {
      table.style.fontSize = `${usageTableZoom}rem`;
      makeTableResizable(table);
    }
  };

  window.renderUsoAppModule = async function() {
    const tableBody = document.getElementById('usage-users-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 20px; text-align: center; color: var(--text-muted);">
          Obteniendo registros de uso desde Firebase...
        </td>
      </tr>
    `;

    try {
      const colRef = collection(db, "registro_uso");
      const snap = await getDocs(colRef);
      
      const records = [];
      snap.forEach(docSnap => {
        records.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      records.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
      lastUsageRecords = records;

      if (records.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="padding: 20px; text-align: center; color: var(--text-muted);">
              No hay registros de uso en Firebase.
            </td>
          </tr>
        `;
        return;
      }

      // Rellenar dinámicamente el selector de países
      const countrySelect = document.getElementById('usage-country-filter');
      if (countrySelect) {
        const currentSel = countrySelect.value || 'all';
        const countries = Array.from(new Set(records.map(r => r.pais || 'Desconocido'))).filter(Boolean).sort();
        countrySelect.innerHTML = `<option value="all">Todos los países</option>` + 
          countries.map(c => `<option value="${c}">${c}</option>`).join('');
        
        if (countries.includes(currentSel)) {
          countrySelect.value = currentSel;
        } else {
          countrySelect.value = 'all';
        }
      }

      // Aplicar filtros (renderiza el contenido final)
      window.applyUsageFilters();

    } catch (err) {
      console.error("Error al cargar registros de uso:", err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 20px; text-align: center; color: #dc3545; font-weight: 600;">
            Error al conectar con Firebase: ${err.message}
          </td>
        </tr>
      `;
    }
  };

  // Registrar uso automáticamente cada vez que se detecte cambio de sesión
  auth.onAuthStateChanged(() => {
    window.registrarUsoApp();
  });

  // Escuchar clicks de refrescar y zoom de letra en la tabla
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-usage-refresh') {
      e.preventDefault();
      e.stopPropagation();
      window.renderUsoAppModule();
    }
    
    if (e.target && e.target.id === 'btn-usage-zoom-in') {
      e.preventDefault();
      e.stopPropagation();
      usageTableZoom = Math.min(1.4, usageTableZoom + 0.05);
      localStorage.setItem('usageTableZoom', usageTableZoom);
      const table = document.getElementById('usage-users-table');
      if (table) table.style.fontSize = `${usageTableZoom}rem`;
    }

    if (e.target && e.target.id === 'btn-usage-zoom-out') {
      e.preventDefault();
      e.stopPropagation();
      usageTableZoom = Math.max(0.55, usageTableZoom - 0.05);
      localStorage.setItem('usageTableZoom', usageTableZoom);
      const table = document.getElementById('usage-users-table');
      if (table) table.style.fontSize = `${usageTableZoom}rem`;
    }
  });

  // Escuchar entrada en el buscador y filtros por país de la tabla de uso
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'usage-search-input') {
      window.applyUsageFilters();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'usage-country-filter') {
      window.applyUsageFilters();
    }
  });
  
  // Manejo del cierre del modal de Ajustes (guardando los cambios en la nube)
  const btnCloseModal = document.getElementById('settings-modal-close');
  const modalContainer = document.getElementById('settings-modal');
  
  const closeModalAction = () => {
    if (modalContainer) modalContainer.style.display = 'none';
    if (typeof window.guardarAjustesEnNube === 'function') {
      window.guardarAjustesEnNube();
    }
  };

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', closeModalAction);
  }
  if (modalContainer) {
    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) {
        closeModalAction();
      }
    });
  }

  // Forzar el estado por defecto al iniciar
  window.switchThemeSubmodule('visual');
  window.switchThemeFunctionModule('toolbar');
  window.switchGeneralSubmodule('comun');
};
