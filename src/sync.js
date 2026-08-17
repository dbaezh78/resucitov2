// src/sync.js - Sincronización de configuraciones personales y globales con Firestore

import { db, auth, doc, setDoc, getDoc, collection, getDocs, query, orderBy, limit, onSnapshot } from "./firebase.js";
import { transposeNote, normalizeChord } from "./chords.js";



// Sincroniza la nota personal del cantor
export async function guardarNotaEnNube(cantoId, notaPersonal) {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    // 1. Sincronizar en config_cantos por retrocompatibilidad
    const docRefLegacy = doc(db, "usuarios", user.uid, "config_cantos", cantoId);
    await setDoc(docRefLegacy, {
      notaPersonal: notaPersonal || "",
      ultimaActualizacion: new Date()
    }, { merge: true });

    // 2. Sincronizar en la estructura unificada dbdata y su historial (Versión 1)
    let currentOffset = 0;
    let currentCapo = 0;
    try {
      if (typeof window.getCurrentKeyOffset === 'function') {
        currentOffset = window.getCurrentKeyOffset() || 0;
      }
      const capoEl = document.getElementById('capo-select') || document.getElementById('modal-capo-select');
      if (capoEl) {
        currentCapo = parseInt(capoEl.value) || 0;
      }
    } catch (e) {}

    let ratingValue = 0;
    try {
      const localConfig = JSON.parse(localStorage.getItem(`canto-config-${cantoId}`) || '{}');
      ratingValue = parseInt(localConfig.valoracion) || 0;
    } catch (e) {}

    const timestamp = Date.now().toString();
    const refCantoRaiz = doc(db, "usuarios", user.uid, "dbdata", cantoId);
    const refHist = doc(db, "usuarios", user.uid, "dbdata", cantoId, "historial", timestamp);

    const datosDB = {
      acorde: String(currentOffset),
      cejilla: String(currentCapo),
      fecha: new Date(),
      notasCantor: notaPersonal || "",
      valoracion: ratingValue
    };

    await setDoc(refCantoRaiz, { valor: datosDB }, { merge: true });
    await setDoc(refHist, { valor: datosDB }, { merge: true });

    console.log(`☁️ [Firebase] Nota personal guardada y sincronizada en dbdata/historial para ${cantoId}`);
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudo guardar la nota en la nube:", e.message || e);
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

// Sincroniza la cejilla y el acorde en la colección 'historial' de cada canto y en la raíz dbdata
export async function guardarHistorialCantoEnNube(cantoId, acordeOffset, cejillaValue) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const timestamp = Date.now().toString();
    const refCantoRaiz = doc(db, "usuarios", user.uid, "dbdata", cantoId);
    const refHist = doc(db, "usuarios", user.uid, "dbdata", cantoId, "historial", timestamp);

    // Obtener notas y valoración actuales de localStorage
    const notesValue = localStorage.getItem(`notes_${cantoId}`) || "";
    let ratingValue = 0;
    try {
      const localConfig = JSON.parse(localStorage.getItem(`canto-config-${cantoId}`) || '{}');
      ratingValue = parseInt(localConfig.valoracion) || 0;
    } catch (e) {}

    const datosDB = {
      acorde: String(acordeOffset),
      cejilla: String(cejillaValue),
      fecha: new Date(),
      notasCantor: notesValue,
      valoracion: ratingValue
    };

    // A. Actualizar la Raíz de dbdata para este canto
    await setDoc(refCantoRaiz, { valor: datosDB }, { merge: true });

    // B. Crear la entrada en el historial
    await setDoc(refHist, { valor: datosDB }, { merge: true });

    console.log(`☁️ [Firebase] Historial de canto ${cantoId} guardado: acorde=${acordeOffset}, cejilla=${cejillaValue}, notasCantor=${notesValue ? 'sí' : 'no'}, valoración=${ratingValue}`);
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudo guardar el historial del canto en la nube:", e.message || e);
  }
}

// Descarga el historial más reciente de cejilla y acorde del canto
export async function cargarHistorialCantoDesdeNube(cantoId) {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const colRef = collection(db, "usuarios", user.uid, "dbdata", cantoId, "historial");
    const querySnapshot = await getDocs(colRef);

    if (!querySnapshot.empty) {
      const docs = querySnapshot.docs;
      // Ordenar en memoria por el ID del documento (timestamp string) de forma descendente
      docs.sort((a, b) => b.id.localeCompare(a.id));
      
      const docSnap = docs[0];
      const data = docSnap.data();
      if (data && data.valor) {
        return {
          acorde: parseInt(data.valor.acorde) || 0,
          cejilla: parseInt(data.valor.cejilla) || 0,
          notasCantor: data.valor.notasCantor || "",
          valoracion: parseInt(data.valor.valoracion) || 0
        };
      }
    }
  } catch (e) {
    console.warn("⚠️ [Firebase] No se pudo cargar el historial del canto desde la nube:", e.message || e);
  }
  return null;
}

// Exponer globalmente
window.guardarAjustesEnNube = guardarAjustesEnNube;
window.cargarAjustesDesdeNube = cargarAjustesDesdeNube;
window.guardarPosicionesEnNube = guardarPosicionesEnNube;
window.cargarPosicionesDesdeNube = cargarPosicionesDesdeNube;
window.guardarHistorialCantoEnNube = guardarHistorialCantoEnNube;
window.cargarHistorialCantoDesdeNube = cargarHistorialCantoDesdeNube;

// --- Control de Etapas de Cantos ---
window.globalPositionsCache = {};

export function listenToGlobalPositions() {
  try {
    const colRef = collection(db, "global_positions");
    onSnapshot(colRef, (snapshot) => {
      snapshot.forEach((doc) => {
        window.globalPositionsCache[doc.id] = doc.data();
      });
      // Forzar recálculo del buscador y catálogo
      if (typeof window.handleSearchAndFilters === 'function') {
        window.handleSearchAndFilters();
      }
      // Forzar renderizado de la tabla de etapas si está visible
      if (typeof window.renderSongStagesTable === 'function') {
        window.renderSongStagesTable();
      }
    }, (error) => {
      console.warn("⚠️ [Firebase] Error escuchando global_positions:", error);
    });
  } catch (e) {
    console.warn("⚠️ [Firebase] Error al iniciar listenToGlobalPositions:", e);
  }
}

export function canCurrentUserSeeSong(songId) {
  // Administradores se saltan cualquier restricción de etapa
  if (window.isCurrentUserAdmin && window.isCurrentUserAdmin()) {
    return true;
  }
  
  // Obtener etapa del perfil del usuario (default: 0 - Precatecumenado)
  let userStage = 0;
  const profileStr = localStorage.getItem('user_profile_data');
  if (profileStr) {
    try {
      const profile = JSON.parse(profileStr);
      if (profile && profile.etapa !== undefined) {
        userStage = parseFloat(profile.etapa);
      }
    } catch (e) {}
  }
  
  // Obtener etapa requerida del canto
  let requiredStage = 0;
  if (window.globalPositionsCache && window.globalPositionsCache[songId]) {
    const customData = window.globalPositionsCache[songId];
    if (customData.etapa !== undefined) {
      requiredStage = parseFloat(customData.etapa);
    }
  }
  
  return userStage >= requiredStage;
}

window.canCurrentUserSeeSong = canCurrentUserSeeSong;
window.listenToGlobalPositions = listenToGlobalPositions;

// Iniciar la escucha inmediatamente
listenToGlobalPositions();

