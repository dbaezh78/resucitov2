// src/sync.js - Sincronización de configuraciones personales y globales con Firestore

import { db, auth, doc, setDoc, getDoc } from "./firebase.js";
import { transposeNote, normalizeChord } from "./chords.js";

// Sincroniza la transportación (tono) del canto
export async function guardarTonoEnNube(cantoId, tono) {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const docRef = doc(db, "usuarios", user.uid, "transportacion", cantoId);
    await setDoc(docRef, {
      tono: tono,
      ultimaActualizacion: new Date()
    });
    console.log(`☁️ [Firebase] Tono ${tono} guardado para el canto ${cantoId}`);
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudo guardar el tono (permisos/offline):", e.message || e);
  }
}

// Carga la transportación (tono) del canto y devuelve el offset en semitonos
export async function cargarTonoDesdeNube(cantoId, originalKey) {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const docRef = doc(db, "usuarios", user.uid, "transportacion", cantoId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.tono) {
        // Calcular el offset en semitonos desde originalKey a data.tono
        const normOriginal = normalizeChord(originalKey);
        const normSaved = normalizeChord(data.tono);
        
        // Buscar la distancia cromática
        const scale = ['do', 'do#', 're', 're#', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'la#', 'si'];
        
        // Eliminar 'm' y espacios para la comparación limpia de tono fundamental
        const cleanOrig = normOriginal.toLowerCase().replace('m', '').trim();
        const cleanSaved = normSaved.toLowerCase().replace('m', '').trim();
        
        const idxOriginal = scale.indexOf(cleanOrig);
        const idxSaved = scale.indexOf(cleanSaved);
        
        if (idxOriginal !== -1 && idxSaved !== -1) {
          let offset = idxSaved - idxOriginal;
          if (offset < 0) offset += 12;
          return offset;
        }
      }
    }
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudo cargar el tono (permisos/offline):", e.message || e);
  }
  return null;
}

// Sincroniza la nota personal del cantor
export async function guardarNotaEnNube(cantoId, notaPersonal) {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const docRef = doc(db, "usuarios", user.uid, "config_cantos", cantoId);
    await setDoc(docRef, {
      notaPersonal: notaPersonal || "",
      ultimaActualizacion: new Date()
    }, { merge: true });
    console.log(`☁️ [Firebase] Nota personal guardada para el canto ${cantoId}`);
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudo guardar la nota (permisos/offline):", e.message || e);
  }
}

// Carga la nota personal del cantor
export async function cargarNotaDesdeNube(cantoId) {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const docRef = doc(db, "usuarios", user.uid, "config_cantos", cantoId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().notaPersonal || "";
    }
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudo cargar la nota (permisos/offline):", e.message || e);
  }
  return null;
}

// Sincroniza posiciones de acordes personalizadas
export async function guardarPosicionesEnNube(cantoId, posiciones) {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const docRef = doc(db, "usuarios", user.uid, "posiciones", cantoId);
    // Firestore no permite arrays anidados: serializamos cada línea como string JSON
    await setDoc(docRef, {
      lizq: serializarLineas(posiciones.lizq),
      lder: serializarLineas(posiciones.lder),
      ultimaActualizacion: new Date()
    });
    console.log(`☁️ [Firebase] Posiciones personalizadas guardadas para el canto ${cantoId}`);
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudieron guardar posiciones (permisos/offline):", e.message || e);
  }
}

// Carga posiciones de acordes personalizadas
export async function cargarPosicionesDesdeNube(cantoId) {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const docRef = doc(db, "usuarios", user.uid, "posiciones", cantoId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        lizq: deserializarLineas(data.lizq),
        lder: deserializarLineas(data.lder)
      };
    }
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudieron cargar posiciones (permisos/offline):", e.message || e);
  }
  return null;
}

// Convierte las líneas a un array de strings JSON (serialización plana para Firestore)
function serializarLineas(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map(line => JSON.stringify(line));
}

// Revierte la serialización de líneas
function deserializarLineas(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map(item => {
    try { return typeof item === 'string' ? JSON.parse(item) : item; }
    catch (e) { return item; }
  });
}

// Sincroniza posiciones globales (Administrador)
export async function publicarPosicionesGlobales(cantoId, posiciones) {
  try {
    const docRef = doc(db, "global_positions", cantoId);
    // Firestore no permite arrays anidados: serializamos cada línea como string JSON
    await setDoc(docRef, {
      lizq: serializarLineas(posiciones.lizq),
      lder: serializarLineas(posiciones.lder),
      ultimaActualizacion: new Date()
    });
    console.log(`☁️ [Firebase Admin] Posiciones globales publicadas para el canto ${cantoId}`);
  } catch (e) {
    console.warn("⚠️ [Firebase Admin] No se pudieron publicar posiciones globales (permisos/offline):", e.message || e);
  }
}

// Carga posiciones globales oficiales actualizadas por administradores
export async function cargarPosicionesGlobales(cantoId) {
  try {
    const docRef = doc(db, "global_positions", cantoId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        lizq: deserializarLineas(data.lizq),
        lder: deserializarLineas(data.lder)
      };
    }
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudieron cargar posiciones globales (permisos/offline):", e.message || e);
  }
  return null;
}

// Sincroniza todos los ajustes de la aplicación con Firestore
export async function guardarAjustesEnNube() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const docRef = doc(db, "usuarios", user.uid, "configuracion", "ajustes");
    const ajustes = {
      theme: localStorage.getItem('theme') || 'light',
      songListStyle: localStorage.getItem('song-list-style') || 'simple',
      splitLayout: localStorage.getItem('split-layout') || 'true',
      lyricsFontFamily: localStorage.getItem('lyrics-font-family') || 'franklin',
      appMaxWidth: localStorage.getItem('app-max-width') || '1200',
      fontZoom: localStorage.getItem('font-zoom') || '1.0',
      fontZoomCustom: localStorage.getItem('font-zoom-custom') || 'false',
      
      // Cabeceras de preparación
      catHeaderColor: localStorage.getItem('cat-header-color') || '#d01212',
      catHeaderFontSize: localStorage.getItem('cat-header-font-size') || '16',
      catHeaderFontWeight: localStorage.getItem('cat-header-font-weight') || '700',
      
      // Cabeceras de perfil
      perfilHeaderColor: localStorage.getItem('perfil-header-color') || '#d01212',
      perfilHeaderFontSize: localStorage.getItem('perfil-header-font-size') || '16',
      perfilHeaderFontWeight: localStorage.getItem('perfil-header-font-weight') || '700',

      ultimaActualizacion: new Date()
    };

    await setDoc(docRef, ajustes);
    console.log("☁️ [Firebase] Ajustes personales guardados en la nube.");
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudieron guardar los ajustes en la nube:", e.message || e);
  }
}

// Carga los ajustes de la aplicación desde Firestore
export async function cargarAjustesDesdeNube() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const docRef = doc(db, "usuarios", user.uid, "configuracion", "ajustes");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // Guardar localmente y aplicar
      if (data.theme) localStorage.setItem('theme', data.theme);
      if (data.songListStyle) localStorage.setItem('song-list-style', data.songListStyle);
      if (data.splitLayout) localStorage.setItem('split-layout', data.splitLayout);
      if (data.lyricsFontFamily) localStorage.setItem('lyrics-font-family', data.lyricsFontFamily);
      if (data.appMaxWidth) localStorage.setItem('app-max-width', data.appMaxWidth);
      if (data.fontZoom) localStorage.setItem('font-zoom', data.fontZoom);
      if (data.fontZoomCustom) localStorage.setItem('font-zoom-custom', data.fontZoomCustom);

      if (data.catHeaderColor) localStorage.setItem('cat-header-color', data.catHeaderColor);
      if (data.catHeaderFontSize) localStorage.setItem('cat-header-font-size', data.catHeaderFontSize);
      if (data.catHeaderFontWeight) localStorage.setItem('cat-header-font-weight', data.catHeaderFontWeight);

      if (data.perfilHeaderColor) localStorage.setItem('perfil-header-color', data.perfilHeaderColor);
      if (data.perfilHeaderFontSize) localStorage.setItem('perfil-header-font-size', data.perfilHeaderFontSize);
      if (data.perfilHeaderFontWeight) localStorage.setItem('perfil-header-font-weight', data.perfilHeaderFontWeight);

      console.log("📥 [Firebase] Ajustes personales descargados de la nube.");
    }
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudieron cargar los ajustes desde la nube:", e.message || e);
  }
}

// Exponer globalmente
window.guardarAjustesEnNube = guardarAjustesEnNube;
window.cargarAjustesDesdeNube = cargarAjustesDesdeNube;
window.guardarPosicionesEnNube = guardarPosicionesEnNube;
window.cargarPosicionesDesdeNube = cargarPosicionesDesdeNube;

