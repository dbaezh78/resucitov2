// src/js/ajustes.js
// Centralización de todos los ajustes y preferencias de la aplicación.

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

  if (tabName === 'log' && window.renderAppLogs) {
    window.renderAppLogs();
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

// Función principal de inicialización de Ajustes
window.initAjustes = async function() {
  // Cargar el HTML del modal si no existe en el DOM
  if (!document.getElementById('settings-modal')) {
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
  }
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

  // Wake Lock & Auto Hide
  window.initWakeLockPreference();
  window.initAutoHideNavPreference();

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

  // Personalizar colores de botones de etapa
  document.querySelectorAll('.btn-color-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const stage = input.dataset.stage;
      const mode = input.dataset.mode;
      const color = e.target.value;
      
      if (mode === 'default') {
        localStorage.setItem(`stage-color-${stage}`, color);
      } else if (mode === 'text') {
        localStorage.setItem(`btn-color-${stage}-text`, color);
      } else {
        localStorage.setItem(`btn-color-${stage}-active`, color);
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

  // Manejo de sub-pestañas dentro del Módulo Usuario (Cuenta y Acceso)
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
    });
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
};
