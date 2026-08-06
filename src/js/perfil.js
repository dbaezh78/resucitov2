// src/js/perfil.js - Lógica del Perfil de Salmista (Resucitó v2)
import { auth, db, doc, getDoc, setDoc } from '../firebase.js';
import { onAuthStateChanged, getCurrentUser } from '../auth.js';
import { songs } from '../songs-data.js';

const MAPA_ACORDES = {
  "0": "La m", "1": "Si b m", "2": "Si m", "3": "Do m",
  "4": "Do# m", "5": "Re m", "6": "Re# m", "7": "Mi m",
  "8": "Fa m", "9": "Fa# m", "10": "Sol m", "11": "Sol# m"
};

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
    if (header && content) {
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

// Renderizado de Tabla de Cantos
async function renderizarTablaCantos() {
  const contenedor = document.getElementById('lista-cantos-gestion');
  if (!contenedor) return;

  const cantos = (songs || []).filter(c => 
    c.id !== 'cancionero' && 
    c.id !== 'Salmodias' && 
    c.visible !== 'index' && 
    !c.title?.toLowerCase().includes('indice cancionero')
  );

  if (cantos.length === 0) {
    contenedor.innerHTML = "<p style='text-align:center; padding: 20px;'>Cargando base de datos de canciones...</p>";
    return;
  }

  let html = `
    <div style="position: relative; width: 100%; margin-bottom: 15px;">
      <input id="inputBuscador" type="text" placeholder="🔍 Buscar por título..." 
        style="width: 100%; padding: 10px 40px 10px 14px; border-radius: 20px; border: 1.5px solid var(--panel-border, #ccc); background: var(--input-bg, #fff); color: var(--text-color, #212529); font-size: 0.9rem; box-sizing: border-box;">
      <span id="btnLimpiar" style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #888; font-size: 20px; font-weight: bold; display: none;">&times;</span>
    </div>
    
    <div class="tabla-wrapper">
      <table class="tabla-gestion" id="tablaCantos">
        <thead>
          <tr>
            <th style="text-align: left;">Canto</th>
            <th>Valoración</th>
            <th>Uso</th>
            <th>Cejilla (Orig / Tuya)</th>
            <th>Tono (Orig / Tuyo)</th>
          </tr>
        </thead>
        <tbody id="cuerpo-tabla-perfil">
  `;

  cantos.forEach(canto => {
    const cantoId = canto.id;
    const keyData = localStorage.getItem(`canto-config-${cantoId}`) || localStorage.getItem(`data-${cantoId}`);
    let datosRAM = null;
    if (keyData) {
      try { datosRAM = JSON.parse(keyData); } catch (e) {}
    }

    const cejillaVisual = datosRAM ? (datosRAM.cejilla || datosRAM.capo || "0") : "-";
    const numAcorde = datosRAM ? String(datosRAM.acorde || datosRAM.key || 0) : "0";
    const acordeTexto = MAPA_ACORDES[numAcorde] || "La m";

    let fechaTexto = "---";
    if (datosRAM && (datosRAM.fecha || datosRAM.valor)) {
      const fRaw = datosRAM.fecha || datosRAM.valor;
      const f = new Date(fRaw);
      if (!isNaN(f.getTime())) {
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
          ${renderEstrellas(cantoId, datosRAM?.valoracion || 0)}
        </td>
        <td id="uso-${cantoId}">
          ${fechaTexto} <span onclick="window.abrirCalendario('${cantoId}', '${nombreMostrar.replace(/'/g, "\\'")}')" style="cursor:pointer; font-size:16px;">📅</span>
        </td>
        <td>${canto.cejilla || 0} / <b id="cejilla-tu-${cantoId}" style="color: var(--accent-color, #d01212);">${cejillaVisual}</b></td>
        <td>${canto.acorde || 'La m'} / <b id="acorde-tu-${cantoId}" style="color: var(--accent-color, #d01212);">${acordeTexto}</b></td>
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
  data.valoracion = rating;
  localStorage.setItem(key, JSON.stringify(data));

  const celda = document.getElementById(`valoracion-${cantoId}`);
  if (celda) celda.innerHTML = renderEstrellas(cantoId, rating);
};

// Abrir Calendario de Historial de Uso
window.abrirCalendario = function(cantoId, titulo) {
  const modal = document.getElementById('modalCalendario');
  const nombreEl = document.getElementById('nombreCantoCalendario');
  const calendarioEl = document.getElementById('calendarioDinamico');

  if (!modal || !calendarioEl) return;

  if (nombreEl) nombreEl.innerText = titulo || `Canto #${cantoId}`;

  const keyData = localStorage.getItem(`canto-config-${cantoId}`) || localStorage.getItem(`data-${cantoId}`);
  let fechaUso = null;
  if (keyData) {
    try {
      const parsed = JSON.parse(keyData);
      fechaUso = parsed.fecha || parsed.valor || null;
    } catch (e) {}
  }

  if (fechaUso) {
    const f = new Date(fechaUso);
    calendarioEl.innerHTML = `
      <p style="text-align: center; font-size: 1.1rem; color: var(--text-color);">
        🗓️ Última vez utilizado el: <br>
        <strong style="color: var(--accent-color, #d01212); font-size: 1.2rem;">${f.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
      </p>
    `;
  } else {
    calendarioEl.innerHTML = `
      <p style="text-align: center; color: var(--text-muted, #666);">
        Sin registro de uso reciente para este canto.
      </p>
    `;
  }

  modal.style.display = 'flex';
};

// Cerrar modal calendario
document.addEventListener('click', (e) => {
  const modal = document.getElementById('modalCalendario');
  const closeBtn = document.getElementById('closeCalendario');
  if (modal && (e.target === modal || e.target === closeBtn)) {
    modal.style.display = 'none';
  }
});
