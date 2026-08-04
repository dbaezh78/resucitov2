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
