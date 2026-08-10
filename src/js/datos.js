// src/js/datos.js - Gestión de Módulo Datos & Tipos de Celebración con Firebase Cloud Sync

import { auth, db } from '../firebase.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export const BUILTIN_TIPOS = ["Eucaristía", "Celebración", "Convivencia", "Pasos", "Otros"];
const STORAGE_KEY = 'cache_tipos_celebracion';

/**
 * Obtiene la lista completa de tipos de celebración (Predeterminados + Personalizados)
 */
export function obtenerTiposCelebracion() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const combinados = [...BUILTIN_TIPOS];
        parsed.forEach(t => {
          if (t && typeof t === 'string' && !combinados.includes(t)) {
            combinados.push(t);
          }
        });
        return combinados;
      }
    }
  } catch (e) {
    console.error("Error al leer tipos de celebración del localStorage:", e);
  }
  return [...BUILTIN_TIPOS];
}

/**
 * Agrega un nuevo tipo de celebración y lo guarda localmente y en Firebase
 */
export async function agregarTipoCelebracion(nuevoTipoRaw) {
  if (!nuevoTipoRaw || typeof nuevoTipoRaw !== 'string') return false;
  
  const limpio = nuevoTipoRaw.trim();
  if (!limpio) return false;

  const formato = limpio.charAt(0).toUpperCase() + limpio.slice(1);
  const listaActual = obtenerTiposCelebracion();

  if (listaActual.some(t => t.toLowerCase() === formato.toLowerCase())) {
    alert(`⚠️ El tipo de celebración "${formato}" ya existe.`);
    return false;
  }

  listaActual.push(formato);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listaActual));

  const user = auth.currentUser;
  if (user) {
    try {
      const docRef = doc(db, "usuarios", user.uid, "configuracion", "tiposCelebracion");
      const personalizados = listaActual.filter(t => !BUILTIN_TIPOS.includes(t));
      await setDoc(docRef, {
        personalizados: personalizados,
        ultimaActualizacion: new Date().toISOString()
      }, { merge: true });
      console.log("🔥 Tipos de celebración sincronizados en Firebase.");
    } catch (e) {
      console.warn("No se pudo sincronizar tipos de celebración en Firebase:", e);
    }
  }

  window.dispatchEvent(new CustomEvent('tiposCelebracionChanged', { detail: { tipos: listaActual } }));
  renderDatosModule();
  return true;
}

/**
 * Elimina un tipo de celebración personalizado
 */
export async function eliminarTipoCelebracion(tipo) {
  if (BUILTIN_TIPOS.includes(tipo)) {
    alert("No se pueden eliminar los tipos de celebración predeterminados del sistema.");
    return false;
  }

  if (!confirm(`¿Deseas eliminar el tipo de celebración "${tipo}"?`)) return false;

  let listaActual = obtenerTiposCelebracion();
  listaActual = listaActual.filter(t => t !== tipo);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listaActual));

  const user = auth.currentUser;
  if (user) {
    try {
      const docRef = doc(db, "usuarios", user.uid, "configuracion", "tiposCelebracion");
      const personalizados = listaActual.filter(t => !BUILTIN_TIPOS.includes(t));
      await setDoc(docRef, {
        personalizados: personalizados,
        ultimaActualizacion: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn("Error al actualizar Firebase tras eliminar tipo:", e);
    }
  }

  window.dispatchEvent(new CustomEvent('tiposCelebracionChanged', { detail: { tipos: listaActual } }));
  renderDatosModule();
  return true;
}

/**
 * Renderiza el panel de Datos en el modal de Ajustes con scroll limit de ~4 registros
 */
export function renderDatosModule() {
  const panel = document.getElementById('settings-panel-datos');
  if (!panel) return;

  const inputNuevo = document.getElementById('inputNuevoTipoCelebracion');
  const btnAgregar = document.getElementById('btnAgregarTipoCelebracion');
  const listaContainer = document.getElementById('listaTiposCelebracion');

  // Enlazar eventos de agregar si no están enlazados
  if (btnAgregar && inputNuevo && !btnAgregar.dataset.bound) {
    btnAgregar.dataset.bound = "true";
    btnAgregar.addEventListener('click', () => {
      if (inputNuevo.value) {
        agregarTipoCelebracion(inputNuevo.value);
        inputNuevo.value = '';
      }
    });
    inputNuevo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && inputNuevo.value) {
        agregarTipoCelebracion(inputNuevo.value);
        inputNuevo.value = '';
      }
    });
  }

  if (!listaContainer) return;

  // Aplicar formato de contenedor desplazable (~4 ítems de alto)
  listaContainer.style.cssText = `
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--panel-border, #ccc);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.02);
    width: 100%;
    box-sizing: border-box;
    margin-top: 10px;
  `;

  const tipos = obtenerTiposCelebracion();
  listaContainer.innerHTML = '';

  tipos.forEach(t => {
    const esPredeterminado = BUILTIN_TIPOS.includes(t);
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--panel-bg, #ffffff);
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-sizing: border-box;
    `;

    row.innerHTML = `
      <span style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 0.9rem; color: var(--text-color, #212529);">
        <span class="material-symbols-outlined" style="font-size: 18px; color: var(--accent-color, #d01212);">celebration</span>
        ${t}
      </span>
      ${esPredeterminado 
        ? '<span class="material-symbols-outlined" style="font-size: 16px; opacity: 0.5;" title="Predeterminado del sistema">lock</span>' 
        : `<button class="btn-icono delete btn-eliminar-tipo" style="width: 28px; height: 28px;" title="Eliminar ${t}"><span class="material-symbols-outlined" style="font-size: 16px;">delete</span></button>`
      }
    `;

    if (!esPredeterminado) {
      const btnDel = row.querySelector('.btn-eliminar-tipo');
      if (btnDel) {
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          eliminarTipoCelebracion(t);
        });
      }
    }

    listaContainer.appendChild(row);
  });
}

// Sincronización al iniciar sesión con Firebase
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const docRef = doc(db, "usuarios", user.uid, "configuracion", "tiposCelebracion");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.personalizados)) {
          const combinados = [...BUILTIN_TIPOS];
          data.personalizados.forEach(p => {
            if (p && typeof p === 'string' && !combinados.includes(p)) {
              combinados.push(p);
            }
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(combinados));
          window.dispatchEvent(new CustomEvent('tiposCelebracionChanged', { detail: { tipos: combinados } }));
          renderDatosModule();
        }
      }
    } catch (e) {
      console.warn("No se pudo cargar tipos de celebración de Firebase:", e);
    }
  }
});

// Registrar eventos globales en el window
window.renderDatosModule = renderDatosModule;
window.obtenerTiposCelebracion = obtenerTiposCelebracion;
window.agregarTipoCelebracion = agregarTipoCelebracion;
window.eliminarTipoCelebracion = eliminarTipoCelebracion;
