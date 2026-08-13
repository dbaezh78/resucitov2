// src/js/perfil.js - Lógica del Perfil de Salmista (Resucitó v2)
import { auth, db, doc, getDoc, setDoc, collection, getDocs } from '../firebase.js';
import { onAuthStateChanged, getCurrentUser } from '../auth.js';
import { songs } from '../songs-data.js';

const MAPA_ACORDES = {
  "0": "Do",
  "1": "Do#",
  "2": "Re",
  "3": "Re#",
  "4": "Mi",
  "5": "Fa",
  "6": "Fa#",
  "7": "Sol",
  "8": "Sol#",
  "9": "La",
  "10": "Sib",
  "11": "Si"
};

function calcularAcordeTransportado(canto, offsetStr) {
  if (!canto) return "-";
  const offset = parseInt(offsetStr) || 0;
  const originalKey = canto.acorde || "La m";
  const CHROMATIC_SCALE = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "Sib", "Si"];
  const esMenor = originalKey.toLowerCase().includes("m");
  const notaBasePura = originalKey.split(" ")[0].replace("m", "").trim();
  const idxOriginal = CHROMATIC_SCALE.indexOf(notaBasePura);
  if (idxOriginal !== -1) {
    let finalIdx = (idxOriginal + offset) % 12;
    if (finalIdx < 0) finalIdx += 12;
    return CHROMATIC_SCALE[finalIdx] + (esMenor ? " m" : "");
  }
  return originalKey;
}

// Normalizador de texto para búsqueda limpia
const normalizarTexto = (texto) => {
  if (!texto) return "";
  return texto.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
};

// Carga inicial al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
  setupCollapsibles();
  await cargarPaises();
  llenarComunidades();
  initAuthState();
});

// Inicializar colapsables
function setupCollapsibles() {
  document.querySelectorAll('.perfil-section').forEach(section => {
    const header = section.querySelector('.section-header');
    const content = section.querySelector('.section-content');
    if (header && content && !header.getAttribute('onclick')) {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button, select, input, a')) return;
        const isCollapsed = section.classList.toggle('collapsed');
        if (isCollapsed) {
          content.classList.add('cfg-close');
        } else {
          content.classList.remove('cfg-close');
        }
      });
    }
  });
}

// Cargar Países desde data/paises.json
async function cargarPaises() {
  const selectPais = document.getElementById('userCountry');
  if (!selectPais) return;

  try {
    const res = await fetch('./data/paises.json');
    if (!res.ok) throw new Error('No se pudo cargar paises.json');
    const paises = await res.json();
    selectPais.innerHTML = '<option value="">Selecciona tu país</option>';
    paises.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.nombre;
      opt.textContent = p.nombre;
      selectPais.appendChild(opt);
    });
  } catch (e) {
    console.error("Error cargando países:", e);
    selectPais.innerHTML = '<option value="">Error al cargar países</option>';
  }
}

// Llenar comunidades (1 a 73)
function llenarComunidades() {
  const select = document.getElementById('userComunidad');
  if (!select) return;
  select.innerHTML = '<option value="">Seleccione la comunidad</option>';
  for (let i = 1; i <= 73; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.innerText = `Comunidad ${i}`;
    select.appendChild(opt);
  }
}

// Escuchar Auth y cargar datos del usuario desde Firestore
function initAuthState() {
  onAuthStateChanged(async (user) => {
    const aviso = document.getElementById('overlay-auth-aviso');

    if (user) {
      if (aviso) aviso.remove();

      const profileInfoBox = document.getElementById('profile-info');
      const userPhoto = document.getElementById('user-photo');
      const userNameEl = document.getElementById('user-name');
      const userEmailEl = document.getElementById('user-email');
      const inputUserName = document.getElementById('userName');

      if (profileInfoBox) profileInfoBox.style.display = 'flex';
      if (userPhoto) userPhoto.src = user.photoURL || '/img/christ.png';
      if (userNameEl) userNameEl.innerText = user.displayName || 'Usuario';
      if (userEmailEl) userEmailEl.innerText = user.email || '';
      if (inputUserName) inputUserName.value = user.displayName || 'Usuario';

      // 1. Cargar datos de perfil desde Firestore (/usuarios/{uid}/perfil/config)
      try {
        let perfilData = null;
        const docRefConfig = doc(db, "usuarios", user.uid, "perfil", "config");
        const docSnapConfig = await getDoc(docRefConfig);

        if (docSnapConfig.exists()) {
          perfilData = docSnapConfig.data();
        }

        if (perfilData) {
          aplicarDatosPerfil(perfilData);
        } else {
          const localProfile = localStorage.getItem('user_profile_data');
          if (localProfile) aplicarDatosPerfil(JSON.parse(localProfile));
        }

        // 2. Registrar inicio de sesión en /usuarios/{uid}/perfil/config/inicioSesion
        const yaRegistrado = sessionStorage.getItem('login_registrado_' + user.uid);
        if (!yaRegistrado) {
          const fechaId = new Date().getTime();
          const docRefLogin = doc(db, "usuarios", user.uid, "perfil", "config", "inicioSesion", fechaId.toString());
          await setDoc(docRefLogin, {
            fecha: new Date().toLocaleString(),
            timestamp: fechaId
          }, { merge: true });
          sessionStorage.setItem('login_registrado_' + user.uid, 'true');
        }

      } catch (err) {
        console.warn("⚠️ Error cargando el perfil desde Firestore:", err);
      }

      await renderizarTablaCantos();
    } else {
      // Esperar a que Firebase Auth termine de validar la sesión guardada
      setTimeout(() => {
        const currentUser = getCurrentUser() || auth.currentUser;
        if (currentUser) {
          const avisoLocal = document.getElementById('overlay-auth-aviso');
          if (avisoLocal) avisoLocal.remove();
        } else {
          mostrarBloqueoAcceso();
        }
      }, 600);
    }
  });
}

function mostrarBloqueoAcceso() {
  if (document.getElementById('overlay-auth-aviso')) return;

  const overlay = document.createElement('div');
  overlay.id = "overlay-auth-aviso";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content-card" style="text-align: center;">
      <span class="material-symbols-outlined" style="font-size: 64px; color: var(--accent-color, #d01212);">lock</span>
      <h2 style="margin: 16px 0 8px; font-size: 1.4rem;">Cuenta Necesaria</h2>
      <p style="color: var(--text-muted, #666); font-size: 0.9rem; line-height: 1.5; margin-bottom: 24px;">
        Para entrar a tu Perfil de Salmista y sincronizar tus cejillas, notas y valoraciones en la nube, debes iniciar sesión con tu cuenta de Google.
      </p>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-modal-login" style="background: var(--accent-color, #d01212); color: white; border: none; padding: 12px; border-radius: 12px; font-weight: bold; font-size: 0.95rem; cursor: pointer;">
          Iniciar Sesión con Google
        </button>
        <button id="btn-modal-back" style="background: rgba(0,0,0,0.06); color: var(--text-color, #333); border: none; padding: 12px; border-radius: 12px; font-weight: bold; font-size: 0.95rem; cursor: pointer;">
          Volver al Inicio
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('btn-modal-login')?.addEventListener('click', () => {
    if (window.firebaseAPI?.login) window.firebaseAPI.login();
  });
  document.getElementById('btn-modal-back')?.addEventListener('click', () => {
    window.location.href = './index.html';
  });
}

function aplicarDatosPerfil(data) {
  if (!data) return;
  const selPais = document.getElementById('userCountry');
  const selParr = document.getElementById('userParroquia');
  const selComu = document.getElementById('userComunidad');
  const selStep = document.getElementById('userStep');

  if (selPais && data.pais) selPais.value = data.pais;
  if (selParr && (data.parroquia || data.nombreParroquia)) selParr.value = data.parroquia || data.nombreParroquia;
  if (selComu && (data.comunidad || data.numeroComunidad)) selComu.value = data.comunidad || data.numeroComunidad;
  if (selStep && (data.etapa !== undefined || data.etapaCamino !== undefined)) selStep.value = data.etapa ?? data.etapaCamino;
}

// Guardar Perfil
window.guardarPerfil = async function () {
  const elName = document.getElementById('userName');
  const elPais = document.getElementById('userCountry');
  const elParroquia = document.getElementById('userParroquia');
  const elComunidad = document.getElementById('userComunidad');
  const elStep = document.getElementById('userStep');

  const perfilData = {
    nombre: elName ? elName.value : "",
    pais: elPais ? elPais.value : "",
    parroquia: elParroquia ? elParroquia.value : "",
    comunidad: elComunidad ? elComunidad.value : "",
    etapa: elStep ? elStep.value : "0",
    ultimaActualizacion: new Date().toISOString()
  };

  localStorage.setItem('user_profile_data', JSON.stringify(perfilData));

  const user = getCurrentUser() || auth.currentUser;
  if (!user) {
    if (window.mostrarConfirmacion) {
      window.mostrarConfirmacion({
        titulo: 'Perfil Guardado',
        mensaje: 'Perfil guardado localmente en este dispositivo. Inicia sesión para sincronizarlo con la nube.',
        icono: 'save',
        textoSi: 'Aceptar',
        textoNo: 'Cerrar'
      });
    }
    return;
  }

  try {
    const docRefConfig = doc(db, "usuarios", user.uid, "perfil", "config");
    await setDoc(docRefConfig, perfilData, { merge: true });

    if (window.mostrarConfirmacion) {
      window.mostrarConfirmacion({
        titulo: 'Perfil Guardado',
        mensaje: '¡Todo listo! Tu perfil de salmista se ha guardado y sincronizado en la nube 🎸',
        icono: 'cloud_done',
        textoSi: 'Aceptar',
        textoNo: 'Cerrar'
      });
    }
  } catch (e) {
    console.error("Error guardando perfil en Firestore:", e);
    if (window.mostrarConfirmacion) {
      window.mostrarConfirmacion({
        titulo: 'Guardado Local',
        mensaje: 'Perfil guardado en este teléfono. Ocurrió un detalle al sincronizar con la nube.',
        icono: 'warning',
        textoSi: 'Aceptar',
        textoNo: 'Cerrar'
      });
    }
  }
};

let cacheFirestoreCantos = {};

async function cargarDatosFirestoreCantos() {
  const user = getCurrentUser() || auth.currentUser;
  if (!user) return;

  try {
    const dbdataRef = collection(db, "usuarios", user.uid, "dbdata");
    const snap = await getDocs(dbdataRef);
    snap.forEach(docSnap => {
      const songKey = docSnap.id.toLowerCase().trim();
      const dataDoc = docSnap.data();
      const val = dataDoc.valor || dataDoc;
      cacheFirestoreCantos[songKey] = val;
    });
  } catch (e) {
    console.warn("⚠️ Error cargando dbdata de Firestore:", e);
  }
}

// Renderizado de Tabla de Cantos
async function renderizarTablaCantos() {
  const contenedor = document.getElementById('lista-cantos-gestion');
  if (!contenedor) return;

  if (Object.keys(cacheFirestoreCantos).length === 0) {
    await cargarDatosFirestoreCantos();
  }

  // Filtrar cantos que tengan ID válido
  const cantos = songs.filter(s => s.id);

  cantos.sort((a, b) => 
    normalizarTexto(a.title || a.titulo).localeCompare(normalizarTexto(b.title || b.titulo))
  );

  if (cantos.length === 0) {
    contenedor.innerHTML = "<p style='text-align:center; padding: 20px;'>Cargando base de datos de canciones...</p>";
    return;
  }

  let html = `
    <div style="position: relative; width: 100%; margin-bottom: 15px;">
      <input id="inputBuscador" type="text" placeholder="🔍 Buscar por título..." 
        style="width: 100%; padding: 10px 40px 10px 14px; border-radius: 20px; border: 1.5px solid var(--panel-border, #ccc); background: #ffffff !important; color: #212529 !important; font-size: 0.9rem; box-sizing: border-box;">
      <span id="btnLimpiar" style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #888; font-size: 20px; font-weight: bold; display: none;">&times;</span>
    </div>
    
    <div class="tabla-wrapper">
      <table class="tabla-gestion" id="tablaCantos">
        <thead>
          <tr>
            <th style="text-align: left;">Canto</th>
            <th>Valoración</th>
            <th>Uso</th>
            <th>Cejilla</th>
            <th>Tono</th>
          </tr>
        </thead>
        <tbody id="cuerpo-tabla-perfil">
  `;

  cantos.forEach(canto => {
    const cantoId = canto.id;
    const cleanId = cantoId.toLowerCase().trim();

    const keyData = localStorage.getItem(`canto-config-${cantoId}`) || localStorage.getItem(`data-${cantoId}`);
    let datosRAM = null;
    if (keyData) {
      try { datosRAM = JSON.parse(keyData); } catch (e) {}
    }

    const datosFS = cacheFirestoreCantos[cleanId] || null;
    const datosFinales = (datosRAM || datosFS) ? Object.assign({}, datosFS, datosRAM) : null;

    let cejillaVisual = "-";
    if (datosFinales && (datosFinales.cejilla !== undefined || datosFinales.capo !== undefined)) {
      const cVal = String(datosFinales.cejilla ?? datosFinales.capo).trim();
      if (cVal !== "") cejillaVisual = cVal;
    }

    let acordeTexto = "-";
    if (datosFinales && (datosFinales.acorde !== undefined || datosFinales.key !== undefined)) {
      const numAc = String(datosFinales.acorde ?? datosFinales.key).trim();
      acordeTexto = calcularAcordeTransportado(canto, numAc);
    }

    let fechaTexto = "---";
    if (datosFinales && (datosFinales.fecha || datosFinales.valor)) {
      const fRaw = datosFinales.fecha || datosFinales.valor;
      let f = null;
      if (fRaw && typeof fRaw.toDate === 'function') {
        f = fRaw.toDate();
      } else if (fRaw && fRaw.seconds) {
        f = new Date(fRaw.seconds * 1000);
      } else if (fRaw) {
        f = new Date(fRaw);
      }
      if (f && !isNaN(f.getTime())) {
        const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
        fechaTexto = `${String(f.getDate()).padStart(2, '0')} ${meses[f.getMonth()]}`;
      }
    }

    const enlaceCanto = `./#canto=${cantoId}`;
    const nombreMostrar = canto.title || canto.titulo || "Sin título";

    html += `
      <tr class="fila-canto" id="fila-${cantoId}">
        <td style="text-align:left;">
          <a href="${enlaceCanto}" class="listcanto">
            ${nombreMostrar}
          </a>
        </td>
        <td id="valoracion-${cantoId}">
          ${renderEstrellas(cantoId, datosFinales?.valoracion || 0)}
        </td>
        <td id="uso-${cantoId}">
          ${fechaTexto} <span onclick="window.abrirCalendario('${cantoId}', '${nombreMostrar.replace(/'/g, "\\'")}')" style="cursor:pointer; font-size:16px;">📅</span>
        </td>
        <td>${canto.cejilla || 0} / <b id="cejilla-tu-${cantoId}" style="color: var(--accent-color, #d01212);">${cejillaVisual}</b></td>
        <td>${canto.acorde || 'La'} / <b id="acorde-tu-${cantoId}" style="color: var(--accent-color, #d01212);">${acordeTexto}</b></td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  contenedor.innerHTML = html;

  // Escuchadores del buscador
  const inputBuscador = document.getElementById('inputBuscador');
  const btnLimpiar = document.getElementById('btnLimpiar');

  if (inputBuscador) {
    inputBuscador.addEventListener('input', () => {
      const q = normalizarTexto(inputBuscador.value);
      if (btnLimpiar) btnLimpiar.style.display = q ? 'block' : 'none';
      document.querySelectorAll('#cuerpo-tabla-perfil tr').forEach(row => {
        const text = normalizarTexto(row.textContent);
        row.style.display = text.includes(q) ? '' : 'none';
      });
    });
    inputBuscador.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        const firstRow = Array.from(document.querySelectorAll('#cuerpo-tabla-perfil tr'))
          .find(row => row.style.display !== 'none');
        if (firstRow) {
          const link = firstRow.querySelector('.listcanto');
          if (link) {
            e.preventDefault();
            link.focus();
          }
        }
      } else if (e.key === 'Enter') {
        const firstRow = Array.from(document.querySelectorAll('#cuerpo-tabla-perfil tr'))
          .find(row => row.style.display !== 'none');
        if (firstRow) {
          const link = firstRow.querySelector('.listcanto');
          if (link) {
            e.preventDefault();
            link.click();
          }
        }
      }
    });
  }

  if (btnLimpiar && inputBuscador) {
    btnLimpiar.addEventListener('click', () => {
      inputBuscador.value = '';
      btnLimpiar.style.display = 'none';
      document.querySelectorAll('#cuerpo-tabla-perfil tr').forEach(row => row.style.display = '');
    });
  }
}

function renderEstrellas(cantoId, puntos) {
  let html = `<div class="estrellas-contenedor" style="cursor:pointer;">`;
  for (let i = 1; i <= 5; i++) {
    const color = (i <= puntos) ? '#FFD700' : '#C0C0C0';
    html += `<span onclick="window.guardarValoracion('${cantoId}', ${i})" style="color: ${color}; padding: 0 1px;">★</span>`;
  }
  html += `</div>`;
  return html;
}

window.guardarValoracion = function(cantoId, rating) {
  const key = `canto-config-${cantoId}`;
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {}
  
  // Si la valoración actual es 1 y se hace clic en la primera estrella, se quita (0)
  const currentRating = parseInt(data.valoracion) || 0;
  let newRating = rating;
  if (rating === 1 && currentRating === 1) {
    newRating = 0;
  }
  
  data.valoracion = newRating;
  localStorage.setItem(key, JSON.stringify(data));

  const celda = document.getElementById(`valoracion-${cantoId}`);
  if (celda) celda.innerHTML = renderEstrellas(cantoId, newRating);

  // Sincronizar en la nube (dbdata y su historial)
  if (typeof window.guardarHistorialCantoEnNube === 'function') {
    const cleanId = cantoId.toLowerCase().trim();
    const datosFS = cacheFirestoreCantos[cleanId] || {};
    const cejillaValue = datosFS.cejilla || "0";
    const acordeValue = datosFS.acorde || "0";
    window.guardarHistorialCantoEnNube(cantoId, acordeValue, cejillaValue);
  }
};

// Abrir Calendario de Historial de Uso (Estilo Resucitó v1)
let calendarCurrentYear = new Date().getFullYear();
let calendarCurrentMonth = new Date().getMonth();
let calendarActiveSongId = null;
let calendarActiveSongTitle = '';
let calendarViewMode = 'days'; // 'days' | 'months' | 'years'
let calendarHistorialCache = [];

window.abrirCalendario = async function(cantoId, titulo) {
  calendarActiveSongId = cantoId;
  calendarActiveSongTitle = titulo;
  calendarViewMode = 'days';
  calendarHistorialCache = [];

  const modal = document.getElementById('modalCalendario');
  const nombreEl = document.getElementById('nombreCantoCalendario');
  const container = document.getElementById('calendarioDinamico');

  if (!modal) return;
  if (nombreEl) nombreEl.innerText = titulo || `Canto #${cantoId}`;

  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 10px; color: #777;">
        <div class="spinner" style="border: 3px solid rgba(0,0,0,0.1); border-top: 3px solid #d4af37; border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 12px;"></div>
        <p style="margin: 0; font-size: 0.9rem;">Cargando historial desde Firebase...</p>
      </div>
    `;
  }
  modal.style.display = 'flex';

  // 1. Obtener registros directamente desde Firebase Firestore
  const user = getCurrentUser() || auth.currentUser;
  if (user) {
    try {
      const cleanCantoId = cantoId.toLowerCase().trim();
      const historialRef = collection(db, "usuarios", user.uid, "dbdata", cleanCantoId, "historial");
      const snap = await getDocs(historialRef);

      snap.forEach(docSnap => {
        const idDoc = docSnap.id;
        const dataDoc = docSnap.data();
        const val = dataDoc.valor || dataDoc;

        let dateObj = null;
        if (val.fecha) {
          if (typeof val.fecha.toDate === 'function') {
            dateObj = val.fecha.toDate();
          } else if (val.fecha.seconds) {
            dateObj = new Date(val.fecha.seconds * 1000);
          } else if (!isNaN(new Date(val.fecha).getTime())) {
            dateObj = new Date(val.fecha);
          }
        }
        if (!dateObj || isNaN(dateObj.getTime())) {
          const tsNum = Number(idDoc);
          if (!isNaN(tsNum)) {
            dateObj = new Date(tsNum);
          } else {
            dateObj = new Date();
          }
        }

        calendarHistorialCache.push({
          id: idDoc,
          timestamp: dateObj.getTime(),
          dateObj: dateObj,
          acorde: val.acorde,
          cejilla: val.cejilla,
          valoracion: val.valoracion,
          detalle: `Acorde: ${val.acorde !== undefined ? val.acorde : '-'}, Cejilla: ${val.cejilla || '0'}`
        });
      });
    } catch (e) {
      console.warn("⚠️ Error cargando historial desde Firebase:", e);
    }
  }

  // 2. Fallback a localStorage si Firestore no contiene ítems
  if (calendarHistorialCache.length === 0) {
    const keyData = localStorage.getItem(`canto-config-${cantoId}`) || localStorage.getItem(`data-${cantoId}`);
    if (keyData) {
      try {
        const parsed = JSON.parse(keyData);
        const localHist = Array.isArray(parsed.historial) ? parsed.historial : [];
        localHist.forEach(h => {
          if (h && h.fecha) {
            const f = new Date(h.fecha);
            if (!isNaN(f.getTime())) {
              calendarHistorialCache.push({
                timestamp: f.getTime(),
                dateObj: f,
                acorde: h.acorde !== undefined ? h.acorde : (parsed.acorde || parsed.key || "0"),
                cejilla: h.cejilla !== undefined ? h.cejilla : (parsed.cejilla || parsed.capo || "0"),
                valoracion: parsed.valoracion || 0,
                detalle: h.detalle || 'Uso registrado'
              });
            }
          }
        });
        if (calendarHistorialCache.length === 0 && (parsed.fecha || parsed.valor)) {
          const f = new Date(parsed.fecha || parsed.valor);
          if (!isNaN(f.getTime())) {
            calendarHistorialCache.push({
              timestamp: f.getTime(),
              dateObj: f,
              acorde: parsed.acorde || parsed.key || "0",
              cejilla: parsed.cejilla || parsed.capo || "0",
              valoracion: parsed.valoracion || 0,
              detalle: 'Uso registrado'
            });
          }
        }
      } catch (e) {}
    }
  }

  // 3. Establecer mes y año inicial según el registro más reciente
  if (calendarHistorialCache.length > 0) {
    calendarHistorialCache.sort((a, b) => b.timestamp - a.timestamp);
    const masReciente = calendarHistorialCache[0].dateObj;
    calendarCurrentYear = masReciente.getFullYear();
    calendarCurrentMonth = masReciente.getMonth();
  } else {
    const hoy = new Date();
    calendarCurrentYear = hoy.getFullYear();
    calendarCurrentMonth = hoy.getMonth();
  }

  renderizarCalendarioMes();
};

function renderizarCalendarioMes() {
  const container = document.getElementById('calendarioDinamico');
  if (!container || !calendarActiveSongId) return;

  const mapaFechas = {};
  calendarHistorialCache.forEach(item => {
    if (item && item.dateObj) {
      const f = item.dateObj;
      const keyFecha = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
      if (!mapaFechas[keyFecha]) mapaFechas[keyFecha] = [];
      mapaFechas[keyFecha].push(item);
    }
  });

  const totalCambios = calendarHistorialCache.length;
  const nombresMeses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  const nombreMes = nombresMeses[calendarCurrentMonth];

  if (calendarViewMode === 'months') {
    let mesesGrid = '';
    nombresMeses.forEach((mNombre, idx) => {
      const isCurrent = idx === calendarCurrentMonth;
      const bg = isCurrent ? '#d4af37' : 'var(--panel-bg, #ffffff)';
      const color = isCurrent ? '#ffffff' : 'var(--text-color, #333)';
      const shadow = isCurrent ? 'box-shadow: 0 3px 8px rgba(212, 175, 55, 0.4);' : 'border: 1px solid var(--panel-border, rgba(0,0,0,0.1));';
      mesesGrid += `
        <button class="cal-select-month-btn" data-month="${idx}" style="background: ${bg}; color: ${color}; ${shadow} padding: 12px 6px; border-radius: 0px; font-weight: 700; font-size: 0.85rem; cursor: pointer; border: none; text-transform: uppercase;">
          ${mNombre.slice(0, 3)}
        </button>
      `;
    });

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <span style="font-size: 1.1rem; font-weight: 700; color: var(--text-color);">Seleccionar Mes</span>
        <button id="btn-cal-year-trigger" style="background: rgba(0,0,0,0.08); border: none; border-radius: 8px; padding: 6px 12px; font-weight: 800; cursor: pointer; color: var(--accent-color, #d01212); font-size: 0.95rem;">
          ${calendarCurrentYear} ▾
        </button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px;">
        ${mesesGrid}
      </div>

      <div style="text-align: center; margin-top: 10px;">
        <button id="btn-cal-cancel-nav" style="background: transparent; border: none; color: var(--text-muted, #777); font-size: 0.85rem; font-weight: 600; cursor: pointer; text-decoration: underline;">Volver al Calendario</button>
      </div>
    `;

    document.getElementById('btn-cal-year-trigger')?.addEventListener('click', () => {
      calendarViewMode = 'years';
      renderizarCalendarioMes();
    });

    document.getElementById('btn-cal-cancel-nav')?.addEventListener('click', () => {
      calendarViewMode = 'days';
      renderizarCalendarioMes();
    });

    container.querySelectorAll('.cal-select-month-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        calendarCurrentMonth = parseInt(btn.dataset.month);
        calendarViewMode = 'days';
        renderizarCalendarioMes();
      });
    });

    return;
  }

  if (calendarViewMode === 'years') {
    const startYear = 2020;
    const endYear = new Date().getFullYear() + 5;
    let añosGrid = '';
    for (let y = startYear; y <= endYear; y++) {
      const isCurrent = y === calendarCurrentYear;
      const bg = isCurrent ? '#d4af37' : 'var(--panel-bg, #ffffff)';
      const color = isCurrent ? '#ffffff' : 'var(--text-color, #333)';
      const shadow = isCurrent ? 'box-shadow: 0 3px 8px rgba(212, 175, 55, 0.4);' : 'border: 1px solid var(--panel-border, rgba(0,0,0,0.1));';
      añosGrid += `
        <button class="cal-select-year-btn" data-year="${y}" style="background: ${bg}; color: ${color}; ${shadow} padding: 12px 6px; border-radius: 10px; font-weight: 700; font-size: 0.95rem; cursor: pointer; border: none;">
          ${y}
        </button>
      `;
    }

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <span style="font-size: 1.1rem; font-weight: 700; color: var(--text-color);">Seleccionar Año</span>
        <button id="btn-cal-back-to-months" style="background: rgba(0,0,0,0.08); border: none; border-radius: 8px; padding: 6px 12px; font-weight: 700; cursor: pointer; color: var(--text-color); font-size: 0.85rem;">
          Meses
        </button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-height: 240px; overflow-y: auto; padding-right: 4px; margin-bottom: 16px;">
        ${añosGrid}
      </div>

      <div style="text-align: center; margin-top: 10px;">
        <button id="btn-cal-cancel-nav-years" style="background: transparent; border: none; color: var(--text-muted, #777); font-size: 0.85rem; font-weight: 600; cursor: pointer; text-decoration: underline;">Volver al Calendario</button>
      </div>
    `;

    document.getElementById('btn-cal-back-to-months')?.addEventListener('click', () => {
      calendarViewMode = 'months';
      renderizarCalendarioMes();
    });

    document.getElementById('btn-cal-cancel-nav-years')?.addEventListener('click', () => {
      calendarViewMode = 'days';
      renderizarCalendarioMes();
    });

    container.querySelectorAll('.cal-select-year-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        calendarCurrentYear = parseInt(btn.dataset.year);
        calendarViewMode = 'months';
        renderizarCalendarioMes();
      });
    });

    return;
  }

  const primerDiaSemana = new Date(calendarCurrentYear, calendarCurrentMonth, 1).getDay();
  const diasEnMes = new Date(calendarCurrentYear, calendarCurrentMonth + 1, 0).getDate();

  let diasHtml = '';
  for (let i = 0; i < primerDiaSemana; i++) {
    diasHtml += `<div></div>`;
  }

  for (let d = 1; d <= diasEnMes; d++) {
    const keyFecha = `${calendarCurrentYear}-${String(calendarCurrentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const tieneActividad = !!mapaFechas[keyFecha];
    
    if (tieneActividad) {
      diasHtml += `
        <div class="dia-calendario activo" data-fecha="${keyFecha}" style="background: #d4af37; color: #ffffff; font-weight: 800; border-radius: 0px; padding: 6px 0; text-align: center; cursor: pointer; box-shadow: 0 3px 8px rgba(212, 175, 55, 0.4); font-size: 0.95rem;">
          ${d}
        </div>
      `;
    } else {
      diasHtml += `
        <div class="dia-calendario" style="color: var(--text-color, #333); font-weight: 500; padding: 6px 0; text-align: center; font-size: 0.95rem;">
          ${d}
        </div>
      `;
    }
  }

  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
      <button id="btn-cal-prev" style="background: rgba(0,0,0,0.08); border: none; border-radius: 6px; padding: 4px 14px; font-weight: bold; cursor: pointer; color: var(--text-color); font-size: 1rem;">&lt;</button>
      
      <button id="btn-cal-title-selector" class="cCalendar" title="Toca para cambiar Mes y Año">
        <span>${nombreMes} ${calendarCurrentYear}</span>
        <span style="font-size: 0.75rem; color: var(--accent-color, #d01212);">▼</span>
      </button>

      <button id="btn-cal-next" style="background: rgba(0,0,0,0.08); border: none; border-radius: 6px; padding: 4px 14px; font-weight: bold; cursor: pointer; color: var(--text-color); font-size: 1rem;">&gt;</button>
    </div>

    <div style="background: var(--input-bg, #fafafa); border: 1px solid var(--panel-border, rgba(0,0,0,0.08)); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-weight: 700; font-size: 0.8rem; color: var(--text-muted, #777); margin-bottom: 10px;">
        <div>D</div><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; align-items: center;">
        ${diasHtml}
      </div>
    </div>

    <hr style="border: none; border-top: 1px solid var(--panel-border, rgba(0,0,0,0.1)); margin: 14px 0;">

    <div style="text-align: center;">
      <p style="margin: 0; font-size: 0.95rem; color: var(--text-color);">
        Has cambiado el Acordes o Cejilla <b id="btn-ver-reporte-historial" style="color: #d01212; border-bottom: 2px solid #d01212; font-size: 1.15rem; cursor: pointer;" title="Toca para ver el reporte de historial">${totalCambios}</b> veces
      </p>
      <p style="margin: 4px 0 0 0; font-size: 0.75rem; color: var(--text-muted, #888); font-style: italic;">
        (Toca el número para ver el detalle)
      </p>
    </div>

    <div id="cal-detalle-box" style="display: none; margin-top: 12px; background: rgba(0,0,0,0.03); border: 1px solid var(--panel-border); border-radius: 8px; padding: 10px; font-size: 0.8rem;"></div>
  `;

  document.getElementById('btn-ver-reporte-historial')?.addEventListener('click', () => {
    window.abrirReporteHistorial(calendarActiveSongId, calendarActiveSongTitle);
  });

  document.getElementById('btn-cal-title-selector')?.addEventListener('click', () => {
    calendarViewMode = 'months';
    renderizarCalendarioMes();
  });

  document.getElementById('btn-cal-prev')?.addEventListener('click', () => {
    calendarCurrentMonth--;
    if (calendarCurrentMonth < 0) {
      calendarCurrentMonth = 11;
      calendarCurrentYear--;
    }
    renderizarCalendarioMes();
  });

  document.getElementById('btn-cal-next')?.addEventListener('click', () => {
    calendarCurrentMonth++;
    if (calendarCurrentMonth > 11) {
      calendarCurrentMonth = 0;
      calendarCurrentYear++;
    }
    renderizarCalendarioMes();
  });

  container.querySelectorAll('.dia-calendario.activo').forEach(diaBtn => {
    diaBtn.addEventListener('click', () => {
      const fechaKey = diaBtn.dataset.fecha;
      const eventos = mapaFechas[fechaKey] || [];
      const box = document.getElementById('cal-detalle-box');
      if (!box) return;

      if (eventos.length > 0) {
        const partesFecha = fechaKey.split('-');
        const fechaLegible = `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}`;
        box.innerHTML = `
          <strong style="color: var(--accent-color, #d01212);">📅 Detalle del ${fechaLegible}:</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 18px;">
            ${eventos.map(ev => {
              const hora = ev.fecha ? new Date(ev.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
              return `<li>${ev.detalle || 'Actividad registrada'} ${hora ? `(${hora})` : ''}</li>`;
            }).join('')}
          </ul>
        `;
        box.style.display = 'block';
      }
    });
  });
}

// Abrir Modal de Reporte Tu Historial
window.abrirReporteHistorial = async function(cantoId, titulo) {
  const modal = document.getElementById('modalReporteHistorial');
  const tituloEl = document.getElementById('reporteCantoTitulo');
  const listaEl = document.getElementById('reporteHistorialLista');

  if (!modal || !listaEl) return;
  if (tituloEl) tituloEl.textContent = titulo || `Canto #${cantoId}`;

  listaEl.innerHTML = `
    <div style="text-align: center; padding: 30px 10px; color: #777;">
      <div class="spinner" style="border: 3px solid rgba(0,0,0,0.1); border-top: 3px solid #d4af37; border-radius: 50%; width: 26px; height: 26px; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
      <p style="margin: 0; font-size: 0.85rem;">Cargando tu historial desde la nube...</p>
    </div>
  `;
  modal.style.display = 'flex';

  const user = getCurrentUser() || auth.currentUser;
  let itemsHistorial = [];

  // 1. Obtener registros desde Firestore (/usuarios/{uid}/dbdata/{cantoId}/historial)
  if (user) {
    try {
      const cleanCantoId = cantoId.toLowerCase().trim();
      const historialRef = collection(db, "usuarios", user.uid, "dbdata", cleanCantoId, "historial");
      const snap = await getDocs(historialRef);

      snap.forEach(docSnap => {
        const idDoc = docSnap.id;
        const dataDoc = docSnap.data();
        const val = dataDoc.valor || dataDoc;
        
        let dateObj = null;
        if (val.fecha) {
          if (typeof val.fecha.toDate === 'function') {
            dateObj = val.fecha.toDate();
          } else if (val.fecha.seconds) {
            dateObj = new Date(val.fecha.seconds * 1000);
          } else if (!isNaN(new Date(val.fecha).getTime())) {
            dateObj = new Date(val.fecha);
          }
        }
        if (!dateObj || isNaN(dateObj.getTime())) {
          const tsNum = Number(idDoc);
          if (!isNaN(tsNum)) {
            dateObj = new Date(tsNum);
          } else {
            dateObj = new Date();
          }
        }

        itemsHistorial.push({
          timestamp: dateObj.getTime(),
          dateObj: dateObj,
          acorde: val.acorde,
          cejilla: val.cejilla,
          valoracion: val.valoracion
        });
      });
    } catch (err) {
      console.warn("⚠️ Error leyendo historial desde Firestore:", err);
    }
  }

  // 2. Si Firestore no tiene datos o está offline, usar localStorage
  if (itemsHistorial.length === 0) {
    const keyData = localStorage.getItem(`canto-config-${cantoId}`) || localStorage.getItem(`data-${cantoId}`);
    if (keyData) {
      try {
        const parsed = JSON.parse(keyData);
        const localHist = Array.isArray(parsed.historial) ? parsed.historial : [];
        localHist.forEach(h => {
          if (h && h.fecha) {
            const f = new Date(h.fecha);
            if (!isNaN(f.getTime())) {
              itemsHistorial.push({
                timestamp: f.getTime(),
                dateObj: f,
                acorde: h.acorde !== undefined ? h.acorde : (parsed.acorde || parsed.key || "0"),
                cejilla: h.cejilla !== undefined ? h.cejilla : (parsed.cejilla || parsed.capo || "0"),
                valoracion: parsed.valoracion || 0
              });
            }
          }
        });
        if (itemsHistorial.length === 0 && (parsed.fecha || parsed.valor)) {
          const f = new Date(parsed.fecha || parsed.valor);
          if (!isNaN(f.getTime())) {
            itemsHistorial.push({
              timestamp: f.getTime(),
              dateObj: f,
              acorde: parsed.acorde || parsed.key || "0",
              cejilla: parsed.cejilla || parsed.capo || "0",
              valoracion: parsed.valoracion || 0
            });
          }
        }
      } catch (e) {}
    }
  }

  if (itemsHistorial.length === 0) {
    listaEl.innerHTML = `
      <div style="text-align: center; padding: 30px 10px; color: #777;">
        <span class="material-symbols-outlined" style="font-size: 40px; color: #ccc; margin-bottom: 8px;">history</span>
        <p style="margin: 0; font-size: 0.9rem;">No hay registros de historial de cejilla o acorde para este canto.</p>
      </div>
    `;
    return;
  }

  // Ordenar de más reciente a más antiguo
  itemsHistorial.sort((a, b) => b.timestamp - a.timestamp);

  const total = itemsHistorial.length;
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  const canto = songs.find(s => s.id === cantoId);
  let htmlLista = '';
  itemsHistorial.forEach((item, idx) => {
    const numRef = total - idx; // #28, #27... #1
    const d = item.dateObj;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = meses[d.getMonth()];
    const anio = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const fechaTexto = `${dia} ${mes} ${anio} - ${hora}:${min}`;

    let acordeNombre = "-";
    if (item.acorde !== undefined && item.acorde !== null) {
      const rawAc = String(item.acorde).trim();
      acordeNombre = calcularAcordeTransportado(canto, rawAc);
    }

    const cejillaNum = item.cejilla !== undefined && item.cejilla !== null ? String(item.cejilla) : "0";

    htmlLista += `
      <div style="padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.06); display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
          <span style="color: #888; font-weight: 500;">${fechaTexto}</span>
          <span style="color: #d4af37; font-weight: 800; font-size: 0.85rem;">#${numRef}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 1.05rem; color: #212529;">
            <span style="font-size: 1rem;">🎸</span>
            <span>${acordeNombre}</span>
          </div>
          <div style="background: rgba(0,0,0,0.05); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.85rem; color: #333; display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 0.9rem;">🗜️</span>
            <span>${cejillaNum}</span>
          </div>
        </div>
      </div>
    `;
  });

  listaEl.innerHTML = htmlLista;
};

// Cerrar modales (Calendario y Reporte Historial)
document.addEventListener('click', (e) => {
  const modalCal = document.getElementById('modalCalendario');
  const closeCal = document.getElementById('closeCalendario');
  if (modalCal && (e.target === modalCal || e.target === closeCal)) {
    modalCal.style.display = 'none';
  }

  const modalRep = document.getElementById('modalReporteHistorial');
  const closeRep = document.getElementById('closeReporteHistorial');
  if (modalRep && (e.target === modalRep || e.target === closeRep)) {
    modalRep.style.display = 'none';
  }
});
