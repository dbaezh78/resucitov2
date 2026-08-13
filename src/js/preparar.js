// src/js/preparar.js - Lógica completa de Gestión y Preparación de Listas para Resucitó v2

import { auth, db } from '../firebase.js';
import { 
    doc, setDoc, getDoc, deleteDoc, 
    collection, query, onSnapshot, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { songs } from '../songs-data.js';
import { obtenerTiposCelebracion, BUILTIN_TIPOS } from './datos.js';

// --- ZONA DE VARIABLES DE ESTADO ---
let listaOrdenada = [];
let todosLosCantos = [];
let listasLocalesCache = [];
let sincronizando = false;
let bloqueoSnapshot = false;

// --- ESTADO DE FILTRADO Y MOMENTOS LITÚRGICOS ---
let filtroCategoriaSeleccionada = 'Todos';
let momentoSeleccionado = 'Libre';
const MAPA_ETIQUETAS = {
    "Entrada": "E",
    "Paz": "P",
    "Liturgia": "L",
    "Comunión": "C",
    "Final": "F"
};

export function poblarSelectYFiltrosCelebracion() {
    const tipos = obtenerTiposCelebracion();

    // 1. Poblar select #tipoCelebracion
    const selectTipo = document.getElementById('tipoCelebracion');
    if (selectTipo) {
        const valActual = selectTipo.value;
        selectTipo.innerHTML = tipos.map(t => `<option value="${t}">${t}</option>`).join('');
        if (valActual && tipos.includes(valActual)) {
            selectTipo.value = valActual;
        }
    }

    // 2. Poblar select de filtro #contenedor-filtros-categoria
    const contFiltros = document.getElementById('contenedor-filtros-categoria');
    if (contFiltros) {
        let html = `<label for="select-filtro-categoria" class="label-filtro-categoria">Seleccionar:</label>`;
        html += `<select id="select-filtro-categoria" class="select-filtro-categoria" onchange="window.setFiltroCategoria(null, this.value)">`;
        html += `<option value="Todos" ${filtroCategoriaSeleccionada === 'Todos' ? 'selected' : ''}>Todos</option>`;
        tipos.forEach(t => {
            const isSelected = (filtroCategoriaSeleccionada === t);
            html += `<option value="${t}" ${isSelected ? 'selected' : ''}>${t}</option>`;
        });
        html += `</select>`;
        contFiltros.innerHTML = html;
    }
}

window.addEventListener('tiposCelebracionChanged', () => {
    poblarSelectYFiltrosCelebracion();
    renderizarListasUI(listasLocalesCache);
});

// Cargar cantos excluyendo los visibilidad "index" si aplicara
todosLosCantos = Array.isArray(songs) 
    ? songs.filter(canto => canto.visible !== "index") 
    : [];

// --- NORMALIZADOR DE TEXTO ---
const normalizarTexto = (texto) => {
    if (!texto) return "";
    return texto.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ñ/g, "n")
        .replace(/[^a-z0-9\s]/g, "")
        .trim();
};

// --- MOTOR DE CACHÉ LOCAL (OFFLINE-FIRST) ---
const cargarDesdeEquipo = () => {
    try {
        const datosLocales = localStorage.getItem('cache_listas_personalizadas');
        if (datosLocales) {
            listasLocalesCache = JSON.parse(datosLocales);
            renderizarListasUI(listasLocalesCache);
        }
    } catch (e) {
        console.error("Error al cargar caché local de listas:", e);
    }
};

cargarDesdeEquipo();

// --- SINCRONIZACIÓN FIREBASE EN SEGUNDO PLANO ---
async function ejecutarSincronizacionFondo() {
    const user = auth.currentUser;
    if (!user || sincronizando) return;
    sincronizando = true;
    console.log("🔄 Iniciando sincronización de fondo...");

    try {
        // A. Procesar eliminaciones pendientes
        let pendingDeletions = JSON.parse(localStorage.getItem('cache_listas_eliminadas_pendientes') || "[]");
        let deletionsUpdated = false;

        if (pendingDeletions.length > 0 && navigator.onLine) {
            for (let i = pendingDeletions.length - 1; i >= 0; i--) {
                const idLista = pendingDeletions[i];
                try {
                    await deleteDoc(doc(db, "usuarios", user.uid, "listasPersonalizadas", idLista));
                    console.log(`🔥 Sincronizada eliminación offline: ${idLista}`);
                    pendingDeletions.splice(i, 1);
                    deletionsUpdated = true;
                } catch (e) {
                    console.warn(`No se pudo sincronizar eliminación de ${idLista}:`, e);
                }
            }
        }
        if (deletionsUpdated) {
            localStorage.setItem('cache_listas_eliminadas_pendientes', JSON.stringify(pendingDeletions));
        }

        // B. Procesar subidas/actualizaciones pendientes
        let cache = JSON.parse(localStorage.getItem('cache_listas_personalizadas') || "[]");
        let huboCambios = false;

        if (navigator.onLine) {
            for (let i = 0; i < cache.length; i++) {
                const lista = cache[i];
                if (lista.pendingSync) {
                    try {
                        const listaLimpia = lista.ids_cantos.map(item => ({
                            id: typeof item === 'object' ? item.id : item,
                            tag: typeof item === 'object' ? item.etiqueta || item.tag : "N"
                        }));

                        await setDoc(doc(db, "usuarios", user.uid, "listasPersonalizadas", lista.id), { 
                            id: lista.id,
                            nombre: lista.nombre,
                            categoria: lista.categoria || "Otros",
                            ids_cantos: listaLimpia,
                            ultimaActualizacion: new Date().toISOString(),
                            origin: 'cloud' 
                        });

                        console.log(`☁️ Sincronizada lista offline: ${lista.nombre}`);
                        lista.origin = 'cloud';
                        delete lista.pendingSync;
                        huboCambios = true;
                    } catch (e) {
                        console.warn(`No se pudo sincronizar lista ${lista.nombre}:`, e);
                    }
                }
            }
        }

        if (huboCambios) {
            localStorage.setItem('cache_listas_personalizadas', JSON.stringify(cache));
            listasLocalesCache = cache;
            renderizarListasUI(cache);
        }
    } catch (e) {
        console.error("Error en sincronización de fondo:", e);
    } finally {
        sincronizando = false;
    }
}

window.addEventListener('online', () => {
    console.log("🌐 Conexión restablecida. Sincronizando datos...");
    ejecutarSincronizacionFondo();
});

// Escuchar cambios de autenticación
onAuthStateChanged(auth, (user) => {
    detectarLinkCompartido();

    if (user) {
        console.log("👤 Sesión activa:", user.displayName);
        const q = query(collection(db, "usuarios", user.uid, "listasPersonalizadas"), orderBy("ultimaActualizacion", "desc"));
        
        onSnapshot(q, (snapshot) => {
            if (bloqueoSnapshot) return;
            if (snapshot.metadata.fromCache && listasLocalesCache.length > 0) return;
            
            const cloudLists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const pendingDeletions = JSON.parse(localStorage.getItem('cache_listas_eliminadas_pendientes') || "[]");
            const filteredCloudLists = cloudLists.filter(l => !pendingDeletions.includes(l.id));
            
            let localCache = JSON.parse(localStorage.getItem('cache_listas_personalizadas') || "[]");
            
            // Mapa para prevenir duplicados y priorizar cambios locales recientes
            const mapaListas = new Map();

            // 1. Insertar primero las listas locales no eliminadas
            localCache.forEach(l => {
                if (l && l.id && !pendingDeletions.includes(l.id)) {
                    mapaListas.set(l.id, l);
                }
            });

            // 2. Fusionar con datos de la nube
            filteredCloudLists.forEach(cloud => {
                const local = mapaListas.get(cloud.id);
                if (!local) {
                    mapaListas.set(cloud.id, cloud);
                } else {
                    if (local.pendingSync) {
                        // Conservar local mientras esté pendiente de sincronización
                    } else {
                        const timeLocal = new Date(local.ultimaActualizacion || 0).getTime();
                        const timeCloud = new Date(cloud.ultimaActualizacion || 0).getTime();
                        if (timeCloud >= timeLocal) {
                            mapaListas.set(cloud.id, cloud);
                        }
                    }
                }
            });

            const mergedLists = Array.from(mapaListas.values());
            mergedLists.sort((a, b) => new Date(b.ultimaActualizacion || 0) - new Date(a.ultimaActualizacion || 0));

            listasLocalesCache = mergedLists;
            renderizarListasUI(listasLocalesCache);
            localStorage.setItem('cache_listas_personalizadas', JSON.stringify(listasLocalesCache));

            const pendingLists = localCache.filter(l => l.pendingSync === true);
            if (pendingLists.length > 0 || pendingDeletions.length > 0) {
                ejecutarSincronizacionFondo();
            }
        });
    } else {
        const datosLocales = localStorage.getItem('cache_listas_personalizadas');
        if (datosLocales) {
            listasLocalesCache = JSON.parse(datosLocales);
            renderizarListasUI(listasLocalesCache);
        } else {
            renderizarListasUI([]);
        }
    }
});

// --- RENDERIZADO DE LA INTERFAZ CON AGRUPACIÓN Y FILTRADO POR CATEGORÍA ---

window.setFiltroCategoria = (elemento, cat) => {
    filtroCategoriaSeleccionada = cat;
    const selectEl = document.getElementById('select-filtro-categoria');
    if (selectEl && selectEl.value !== cat) {
        selectEl.value = cat;
    }
    renderizarListasUI(listasLocalesCache);
};

function crearTarjetaLista(idLista, data, contenedor) {
    if (!data) return;

    const ids = data.ids_cantos || [];
    const nombre = data.nombre || "Sin nombre";
    const categoria = data.categoria || "Otros";
    const nombreEscapado = nombre.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const catEscapada = categoria.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    
    const esNube = (data.origin === 'cloud');
    const icono = esNube ? '☁️' : '🏠';
    
    const div = document.createElement('div');
    div.className = 'tarjeta-lista-wrapper';
    div.innerHTML = `
        <div class="tarjeta-lista" onclick="window.toggleDetalleLista('${idLista}')">
            <div class="info-lista">
                <strong>${nombre}</strong>
                <span title="${esNube ? 'Sincronizada' : 'Local'}">${icono}</span>
                <span>${ids.length} cantos</span>
            </div>
            <div class="acciones-lista" onclick="event.stopPropagation()">
                <button class="btn-icono share-universal" onclick="window.compartirUniversal('${idLista}')" title="Compartir"><span class="material-symbols-outlined">share</span></button>
                <button class="btn-icono link" onclick="window.copiarSoloLink('${idLista}')" title="Copiar enlace"><span class="material-symbols-outlined">link</span></button>
                <button class="btn-icono export" onclick="window.exportarLista('${idLista}')" title="Descargar archivo"><span class="material-symbols-outlined">download</span></button>
                <button class="btn-icono edit" onclick="window.cargarListaParaEditar('${idLista}', ${JSON.stringify(ids).replace(/"/g, '&quot;')}, '${nombreEscapado}', '${catEscapada}')" title="Editar"><span class="material-symbols-outlined">edit</span></button>
                <button class="btn-icono delete" onclick="window.eliminarLista('${idLista}', '${nombreEscapado}')" title="Eliminar"><span class="material-symbols-outlined">delete</span></button>
            </div>
        </div>
        <div id="detalle-${idLista}" class="detalle-lista-cantos cfg-close"></div>
    `;
    contenedor.appendChild(div);
}

function renderizarListasUI(listas) {
    const contenedor = document.getElementById('lista-colecciones');
    if (!contenedor) return;
    
    contenedor.innerHTML = '';

    if (!listas || listas.length === 0) {
        contenedor.innerHTML = `
            <div class="status-msg-vacia">
                <p>No hay listas creadas aún.</p>
                <a href="javascript:void(0)" onclick="window.irANuevaLista()" class="link-crear-lista">¿Deseas crear una ahora?</a>
            </div>`;
        return;
    }

    const CATEGORIAS_ORDEN = obtenerTiposCelebracion();

    const grupos = {};
    CATEGORIAS_ORDEN.forEach(c => { grupos[c] = []; });

    // Deduplicar listas por ID para evitar duplicaciones
    const idsProcesados = new Set();
    listas.forEach(l => {
        if (l && l.id && !idsProcesados.has(l.id)) {
            idsProcesados.add(l.id);
            const cat = (l.categoria && CATEGORIAS_ORDEN.includes(l.categoria)) ? l.categoria : "Otros";
            if (!grupos[cat]) grupos[cat] = [];
            grupos[cat].push(l);
        }
    });

    let categoriasAMostrar = [...CATEGORIAS_ORDEN];
    if (filtroCategoriaSeleccionada !== 'Todos') {
        categoriasAMostrar = [
            filtroCategoriaSeleccionada,
            ...CATEGORIAS_ORDEN.filter(c => c !== filtroCategoriaSeleccionada)
        ];
    }

    let mostroAlguna = false;

    categoriasAMostrar.forEach(catName => {
        const items = grupos[catName] || [];
        
        // Si hay un filtro de búsqueda textual activo o filtro por botón
        if (items.length === 0 && filtroCategoriaSeleccionada !== 'Todos' && catName !== filtroCategoriaSeleccionada) {
            return;
        }

        mostroAlguna = true;
        const grupoWrapper = document.createElement('div');
        grupoWrapper.className = 'categoria-grupo-wrapper';
        const groupId = `cat-grupo-${catName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "-")}`;
        
        const estaColapsado = (filtroCategoriaSeleccionada !== 'Todos' && catName !== filtroCategoriaSeleccionada);

        grupoWrapper.innerHTML = `
            <div class="categoria-grupo-header" onclick="window.toggleCategoriaGrupo('${groupId}')">
                <h3>
                    <span class="material-symbols-outlined arrow-icon" id="arrow-${groupId}">${estaColapsado ? 'expand_more' : 'expand_less'}</span>
                    ${catName}
                </h3>
                <span class="badge-count">${items.length} ${items.length === 1 ? 'lista' : 'listas'}</span>
            </div>
            <div id="${groupId}" class="categoria-grupo-body ${estaColapsado ? 'collapsed' : ''}"></div>
        `;
        contenedor.appendChild(grupoWrapper);

        const bodyContainer = grupoWrapper.querySelector('.categoria-grupo-body');
        if (bodyContainer) {
            if (items.length === 0) {
                bodyContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; margin: 0; text-align: center; padding: 8px;">No hay listas en esta categoría.</p>`;
            } else {
                items.forEach(l => crearTarjetaLista(l.id, l, bodyContainer));
            }
        }
    });

    if (!mostroAlguna) {
        contenedor.innerHTML = `<p style="text-align: center; padding: 20px; color: var(--text-muted);">No se encontraron listas en esta categoría.</p>`;
    }
}

window.toggleCategoriaGrupo = (groupId) => {
    const body = document.getElementById(groupId);
    const arrow = document.getElementById(`arrow-${groupId}`);
    if (body) {
        const isCollapsed = body.classList.toggle('collapsed');
        if (arrow) arrow.textContent = isCollapsed ? 'expand_more' : 'expand_less';
    }
};

function renderizarLista(lista) {
    const contenedor = document.getElementById('contenedor-seleccion');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    const listaOrdenadaParaMostrar = [...lista].sort((a, b) => {
        if (momentoSeleccionado === 'Libre') return 0;
        const esDelMomentoA = a.moments && a.moments.includes(momentoSeleccionado);
        const esDelMomentoB = b.moments && b.moments.includes(momentoSeleccionado);
        if (esDelMomentoA && !esDelMomentoB) return -1;
        if (!esDelMomentoA && esDelMomentoB) return 1;
        return 0;
    });

    listaOrdenadaParaMostrar.forEach(canto => {
        const div = document.createElement('div');
        div.className = 'item-canto';
        div.tabIndex = 0;
        
        const esDelMomento = canto.moments && canto.moments.includes(momentoSeleccionado);
        if (momentoSeleccionado !== 'Libre' && !esDelMomento) {
            div.style.opacity = "0.65";
        }

        const nombreAMostrar = canto.title || canto.titulo || "Sin título";
        const isChecked = listaOrdenada.some(item => String(item.id) === String(canto.id));
        
        div.onclick = () => window.toggleCanto(canto.id);
        div.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.toggleCanto(canto.id);
            }
        };
        div.innerHTML = `
            <span class="titulo-canto-seleccion">${nombreAMostrar}</span>
            <label class="toggle-switch" onclick="event.stopPropagation()">
                <input type="checkbox" data-id="${canto.id}" ${isChecked ? 'checked' : ''} onchange="window.toggleCanto('${canto.id}')">
                <span class="toggle-slider"></span>
            </label>`;
        contenedor.appendChild(div);
    });
}

// --- BUSCADORES Y FILTROS ---
window.filtrarSeleccion = () => {
    const input = document.getElementById('inputBuscadorCantos');
    const btnX = document.getElementById('btnLimpiarCantos');
    if (!input) return;

    if (btnX) btnX.style.display = input.value.length > 0 ? 'block' : 'none';

    const busquedaRaw = input.value.toLowerCase();
    const busquedaLimpia = normalizarTexto(busquedaRaw);
    const busquedaPegada = busquedaLimpia.replace(/\s/g, "");

    const filtrados = todosLosCantos.filter(canto => {
        const t = normalizarTexto(canto.title || canto.titulo || "");
        const s = normalizarTexto(canto.subtitle || canto.subtitulo || "");
        const c = normalizarTexto(canto.content || canto.letra || "");

        const poolConEspacios = `${t} ${s} ${c}`;
        const poolSinEspacios = poolConEspacios.replace(/\s/g, "");

        const palabras = busquedaLimpia.split(/\s+/).filter(p => p.length > 0);
        const coincidePalabras = palabras.length > 0 && palabras.every(p => poolConEspacios.includes(p));
        const coincideElastic = busquedaPegada.length > 2 && poolSinEspacios.includes(busquedaPegada);

        return busquedaLimpia === "" || coincidePalabras || coincideElastic;
    });
    
    renderizarLista(filtrados);
};

window.limpiarBuscadorSeleccion = () => {
    const input = document.getElementById('inputBuscadorCantos');
    if (input) {
        input.value = '';
        window.filtrarSeleccion();
        input.focus();
    }
};

window.filtrarMisListas = () => {
    const input = document.getElementById('inputBuscadorListas');
    const btnX = document.getElementById('btnLimpiarListas');
    if (!input) return;

    if (btnX) btnX.style.display = input.value.length > 0 ? 'block' : 'none';

    const busqueda = normalizarTexto(input.value);
    const filtradas = listasLocalesCache.filter(l => 
        normalizarTexto(l.nombre).includes(busqueda)
    );
    renderizarListasUI(filtradas);
};

window.limpiarBuscadorListas = () => {
    const input = document.getElementById('inputBuscadorListas');
    if (input) {
        input.value = '';
        window.filtrarMisListas();
        input.focus();
    }
};

// --- LÓGICA DE SELECCIÓN Y ORDENACIÓN ---
window.toggleCanto = (id) => {
    const stringId = String(id);
    const index = listaOrdenada.findIndex(item => String(item.id) === stringId);

    if (index !== -1) {
        listaOrdenada.splice(index, 1);
    } else {
        let etiqueta;
        if (momentoSeleccionado === 'Libre') {
            const numericos = listaOrdenada
                .filter(item => !['E', 'P', 'L', 'C', 'F'].includes(item.etiqueta))
                .map(item => parseInt(item.etiqueta))
                .filter(num => !isNaN(num))
                .sort((a, b) => a - b);
            
            let num = 1;
            while (numericos.includes(num)) num++;
            etiqueta = num.toString();
        } else {
            etiqueta = MAPA_ETIQUETAS[momentoSeleccionado] || "N";
        }
        
        listaOrdenada.push({ id: stringId, etiqueta: etiqueta });
    }

    const prioridad = { 'E': 1, 'P': 2, 'L': 3, 'C': 4, 'F': 5 };
    
    listaOrdenada.sort((a, b) => {
        const getPeso = (item) => {
            if (prioridad[item.etiqueta]) return prioridad[item.etiqueta];
            return 2;
        };

        const pesoA = getPeso(a);
        const pesoB = getPeso(b);

        if (pesoA !== pesoB) return pesoA - pesoB;
        return parseInt(a.etiqueta || 0) - parseInt(b.etiqueta || 0);
    });

    actualizarInterfazSeleccion();
};

function actualizarInterfazSeleccion() {
    const contador = document.getElementById('contador-seleccion');
    if (contador) contador.innerText = listaOrdenada.length;
    
    const cola = document.getElementById('cola-seleccion');
    if (cola) {
        cola.innerHTML = '';
        listaOrdenada.forEach((item) => {
            const idCanto = (typeof item === 'object' && item !== null) ? item.id : item;
            const etiqueta = (typeof item === 'object' && item !== null) ? item.etiqueta : "N";
            const canto = todosLosCantos.find(c => String(c.id) === String(idCanto));
            
            if (canto) {
                const tag = document.createElement('div');
                tag.className = 'canto-tag';
                tag.innerHTML = `<span>${etiqueta}</span> ${canto.title || canto.titulo}`;
                tag.onclick = (e) => { 
                    e.stopPropagation(); 
                    window.toggleCanto(idCanto); 
                };
                cola.appendChild(tag);
            }
        });
    }

    document.querySelectorAll('#contenedor-seleccion .item-canto input[type="checkbox"]').forEach(input => {
        const idInput = input.getAttribute('data-id');
        const existe = listaOrdenada.some(item => {
            const id = typeof item === 'object' ? item.id : item;
            return String(id) === String(idInput);
        });
        input.checked = existe;
    });
}

function solicitarDecisionListaExistente(nombreLista) {
    return new Promise((resolve) => {
        // Ocultar modal de ajustes si estuviera abierto
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) settingsModal.style.display = 'none';

        const modal = document.getElementById('modal-conflicto-lista');
        const spanNombre = document.getElementById('modal-nombre-lista-existente');
        const btnUnir = document.getElementById('btn-conflicto-unir');
        const btnSustituir = document.getElementById('btn-conflicto-sustituir');
        const btnCancelar = document.getElementById('btn-conflicto-cancelar');

        if (!modal || !btnUnir || !btnSustituir || !btnCancelar) {
            console.warn("Modal de conflicto no encontrado, usando confirm fallback.");
            const res = confirm(`⚠️ Ya existe una lista con el nombre "${nombreLista}". ¿Deseas sobrescribirla?`);
            return resolve(res ? 'sustituir' : 'cancelar');
        }

        if (spanNombre) spanNombre.textContent = nombreLista;
        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            btnUnir.onclick = null;
            btnSustituir.onclick = null;
            btnCancelar.onclick = null;
        };

        btnUnir.onclick = (e) => { e.preventDefault(); cleanup(); resolve('unir'); };
        btnSustituir.onclick = (e) => { e.preventDefault(); cleanup(); resolve('sustituir'); };
        btnCancelar.onclick = (e) => { e.preventDefault(); cleanup(); resolve('cancelar'); };
    });
}

window.mostrarAlertaCustom = (mensaje, titulo = "Atención", icono = "warning") => {
    return new Promise((resolve) => {
        // Ocultar modal de ajustes si estuviera abierto
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) settingsModal.style.display = 'none';

        const modal = document.getElementById('modal-alerta-custom');
        const txtTitulo = document.getElementById('modal-alerta-titulo');
        const txtMensaje = document.getElementById('modal-alerta-mensaje');
        const icnModal = document.getElementById('modal-alerta-icon');
        const btnOk = document.getElementById('modal-alerta-btn-ok');

        if (!modal || !txtMensaje || !btnOk) {
            alert(mensaje);
            return resolve();
        }

        if (txtTitulo) txtTitulo.textContent = titulo;
        if (txtMensaje) txtMensaje.textContent = mensaje;
        if (icnModal) icnModal.textContent = icono;

        modal.style.display = 'flex';

        const onOk = (e) => {
            if (e) e.preventDefault();
            modal.style.display = 'none';
            btnOk.onclick = null;
            resolve();
        };

        btnOk.onclick = onOk;
    });
};

// --- GUARDAR LISTA ---
window.guardarListaFirebase = async (btn) => {
    const nombreInput = document.getElementById('nombreLista');
    const tipoSelect = document.getElementById('tipoCelebracion');
    const nombre = nombreInput ? nombreInput.value.trim() : '';
    const categoria = tipoSelect ? tipoSelect.value : 'Eucaristía';
    const user = auth.currentUser;

    if (!nombre) {
        mostrarAlertaCustom("Ingresa un nombre para la lista.", "Nombre Requerido", "edit_note");
        return;
    }
    if (listaOrdenada.length === 0) {
        mostrarAlertaCustom("Selecciona al menos un canto para guardar la lista.", "Selección Requerida", "playlist_add");
        return;
    }

    const listaId = nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    const nombreNormalizado = normalizarTexto(nombre);
    
    let cache = JSON.parse(localStorage.getItem('cache_listas_personalizadas') || "[]");
    const listadoBase = (Array.isArray(listasLocalesCache) && listasLocalesCache.length > 0) ? listasLocalesCache : cache;

    // Coincidencia estricta por ID o Nombre normalizado
    const existe = listadoBase.find(l => 
        l.id === listaId || 
        (l.nombre && normalizarTexto(l.nombre) === nombreNormalizado)
    );

    let finalIdsCantos = listaOrdenada.map(item => ({
        id: typeof item === 'object' ? item.id : item,
        tag: typeof item === 'object' ? item.etiqueta || item.tag : "N"
    }));

    if (existe && window.editingId !== existe.id && window.editingId !== listaId) {
        const decision = await solicitarDecisionListaExistente(nombre);
        if (decision === 'cancelar') return;

        if (decision === 'unir') {
            const cantosExistentes = Array.isArray(existe.ids_cantos) ? existe.ids_cantos : [];
            const idsProcesados = new Set(cantosExistentes.map(c => String(typeof c === 'object' ? c.id : c)));
            
            const cantosNuevos = [];
            finalIdsCantos.forEach(item => {
                const itemStrId = String(typeof item === 'object' ? item.id : item);
                if (!idsProcesados.has(itemStrId)) {
                    cantosNuevos.push(item);
                }
            });

            finalIdsCantos = [...cantosExistentes, ...cantosNuevos];
        }
    }

    // Si se estaba editando una lista previa cuyo ID original cambió
    if (window.editingId && window.editingId !== listaId) {
        let pendingDeletions = JSON.parse(localStorage.getItem('cache_listas_eliminadas_pendientes') || "[]");
        if (!pendingDeletions.includes(window.editingId)) {
            pendingDeletions.push(window.editingId);
            localStorage.setItem('cache_listas_eliminadas_pendientes', JSON.stringify(pendingDeletions));
        }
        if (user) {
            try {
                deleteDoc(doc(db, "usuarios", user.uid, "listasPersonalizadas", window.editingId));
            } catch (e) {
                console.warn("No se pudo eliminar ID previo en Firebase:", e);
            }
        }
    }

    const nuevaLista = { 
        id: listaId, 
        nombre, 
        categoria,
        ids_cantos: finalIdsCantos, 
        ultimaActualizacion: new Date().toISOString(),
        origin: 'local',
        pendingSync: user ? true : false
    };

    cache = cache.filter(l => l.id !== listaId && l.id !== window.editingId);
    cache.unshift(nuevaLista);
    localStorage.setItem('cache_listas_personalizadas', JSON.stringify(cache));
    listasLocalesCache = cache;
    
    renderizarListasUI(cache);
    
    if (nombreInput) nombreInput.value = '';
    window.editingId = null;
    listaOrdenada = [];
    actualizarInterfazSeleccion();

    // Contraer la sección "Crear o Editar Lista" tras guardar o editar
    window.contraerSeccionNuevaLista();

    // Notificación verde flotante en la parte superior durante 5 segundos
    mostrarNotificacionVerde("Lista Guardada");

    if (user) {
        ejecutarSincronizacionFondo();
    }

    if (btn) {
        const contenidoOriginal = btn.innerHTML;
        btn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> Guardado`;
        setTimeout(() => {
            btn.innerHTML = contenidoOriginal;
        }, 2000);
    }
};

function mostrarNotificacionVerde(mensaje = "Lista Guardada") {
    let toast = document.getElementById('toast-notificacion-verde');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notificacion-verde';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-20px);
            background: #28a745;
            color: #ffffff;
            padding: 12px 24px;
            border-radius: 30px;
            font-size: 0.95rem;
            font-weight: 700;
            box-shadow: 0 8px 24px rgba(40, 167, 69, 0.4);
            z-index: 99999;
            opacity: 0;
            transition: opacity 0.35s ease, transform 0.35s ease;
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        document.body.appendChild(toast);
    }

    toast.innerHTML = `<span class="material-symbols-outlined" style="font-size: 20px;">check_circle</span> ${mensaje}`;
    
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 5000);
}

window.eliminarLista = async (idLista, nombreLista) => {
    if (!confirm(`¿Eliminar la lista "${nombreLista}"?`)) return;

    let cache = JSON.parse(localStorage.getItem('cache_listas_personalizadas') || "[]");
    cache = cache.filter(l => l.id !== idLista);
    localStorage.setItem('cache_listas_personalizadas', JSON.stringify(cache));
    listasLocalesCache = cache;

    renderizarListasUI(cache);

    if (auth.currentUser) {
        let pendingDeletions = JSON.parse(localStorage.getItem('cache_listas_eliminadas_pendientes') || "[]");
        if (!pendingDeletions.includes(idLista)) {
            pendingDeletions.push(idLista);
            localStorage.setItem('cache_listas_eliminadas_pendientes', JSON.stringify(pendingDeletions));
        }
        ejecutarSincronizacionFondo();
    }
};

// --- COMPARTIR Y ARCHIVOS ---
window.compartirUniversal = async (idLista) => {
    const lista = listasLocalesCache.find(l => l.id === idLista);
    if (!lista) return;

    try {
        const idCorto = Math.random().toString(36).substring(2, 8);
        const docRef = doc(db, "listasCompartidas", idCorto);
        
        await setDoc(docRef, {
            n: lista.nombre,
            c: lista.categoria || "Otros",
            i: lista.ids_cantos,
            creado: serverTimestamp()
        });

        const urlFinal = `${window.location.origin}${window.location.pathname}?v=${idCorto}`;
        const mensaje = `🎼 Lista de Cantos (${lista.categoria || 'Celebración'}): *${lista.nombre}*`;

        if (navigator.share) {
            await navigator.share({
                title: lista.nombre,
                text: mensaje,
                url: urlFinal,
            });
        } else {
            const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje + "\n" + urlFinal)}`;
            window.open(whatsappUrl, '_blank');
        }
    } catch (e) { 
        console.error("Error al compartir universal:", e); 
    }
};

window.copiarSoloLink = async (idLista) => {
    const lista = listasLocalesCache.find(l => l.id === idLista);
    if (!lista) return;

    try {
        const idCorto = Math.random().toString(36).substring(2, 8);
        const docRef = doc(db, "listasCompartidas", idCorto);
        
        await setDoc(docRef, {
            n: lista.nombre,
            c: lista.categoria || "Otros",
            i: lista.ids_cantos,
            creado: serverTimestamp()
        });

        const urlFinal = `${window.location.origin}${window.location.pathname}?v=${idCorto}`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(urlFinal);
            alert("✅ Enlace copiado al portapapeles. ¡Listo para enviar!");
        } else {
            throw new Error("Clipboard API no disponible");
        }
    } catch (e) { 
        console.error("Error al copiar link:", e);
        alert("No se pudo copiar el enlace automáticamente.");
    }
};

window.exportarLista = (idLista) => {
    const lista = listasLocalesCache.find(l => l.id === idLista);
    if (!lista) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lista));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Resucito_${lista.nombre.replace(/\s+/g, '_')}.resucito`);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.importarLista = (event) => {
    const archivo = event.target.files[0];
    if (!archivo) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const l = JSON.parse(e.target.result);
            l.id = "imp-" + Date.now();
            if (!l.categoria) l.categoria = "Otros";
            
            if (!l.nombre.includes("📂") && !l.nombre.includes("🔗")) {
                l.nombre = "📂 " + l.nombre;
            }

            const user = auth.currentUser;
            l.origin = 'local';
            if (user) {
                l.pendingSync = true;
            }

            let cache = JSON.parse(localStorage.getItem('cache_listas_personalizadas') || "[]");
            cache.unshift(l);
            localStorage.setItem('cache_listas_personalizadas', JSON.stringify(cache));
            listasLocalesCache = cache;
            
            renderizarListasUI(cache);
        } catch (err) { alert("El archivo seleccionado no es válido."); }
    };
    reader.readAsText(archivo);
};

// --- UTILIDADES DE INTERFAZ Y EXPANSIÓN ---
window.expandirSeccionNuevaLista = () => {
    const content = document.getElementById('content-nueva-lista');
    const wrapper = document.getElementById('wrapper-nueva-lista');
    if (content) content.classList.remove('cfg-close');
    if (wrapper) wrapper.classList.remove('collapsed');
    const arrow = wrapper ? wrapper.querySelector('.arrow-icon') : null;
    if (arrow) arrow.textContent = 'expand_less';
};

window.contraerSeccionNuevaLista = () => {
    const content = document.getElementById('content-nueva-lista');
    const wrapper = document.getElementById('wrapper-nueva-lista');
    if (content) content.classList.add('cfg-close');
    if (wrapper) wrapper.classList.add('collapsed');
    const arrow = wrapper ? wrapper.querySelector('.arrow-icon') : null;
    if (arrow) arrow.textContent = 'expand_more';
};

window.cancelarEdicionLista = () => {
    const inputNombre = document.getElementById('nombreLista');
    if (inputNombre) inputNombre.value = '';
    
    window.editingId = null;
    listaOrdenada = [];
    actualizarInterfazSeleccion();
    renderizarLista(todosLosCantos);
    
    window.contraerSeccionNuevaLista();
};

window.limpiarTodosLosCantos = () => {
    if (listaOrdenada.length === 0) return;
    listaOrdenada = [];
    actualizarInterfazSeleccion();
    renderizarLista(todosLosCantos);
};

window.irANuevaLista = () => {
    window.expandirSeccionNuevaLista();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => { document.getElementById('nombreLista')?.focus(); }, 300);
};

window.toggleDetalleLista = (idLista) => {
    const detalleDiv = document.getElementById(`detalle-${idLista}`);
    if (!detalleDiv) return;
    
    const estaCerrado = detalleDiv.classList.contains('cfg-close');
    document.querySelectorAll('.detalle-lista-cantos').forEach(d => d.classList.add('cfg-close'));
    
    if (estaCerrado) {
        detalleDiv.classList.remove('cfg-close');
        const lista = listasLocalesCache.find(l => l.id === idLista);
        if (!lista) return;

        detalleDiv.innerHTML = lista.ids_cantos.map((item, i) => {
            const id = (typeof item === 'object' && item !== null) ? item.id : item;
            const etiqueta = (typeof item === 'object' && item !== null) ? item.tag : (i + 1);
            const c = todosLosCantos.find(can => String(can.id) === String(id));
            
            return `<div class="sub-item-canto" onclick="window.abrirVisorCanto('${id}')">
                <span class="num">${etiqueta}</span><span>${c ? (c.title || c.titulo) : "Canto desconocido"}</span>
            </div>`;
        }).join('');
    }
};

window.cargarListaParaEditar = (docId, ids, nombre, categoria) => {
    window.editingId = docId;
    
    listaOrdenada = ids.map(item => {
        if (typeof item === 'object' && item !== null) {
            return { 
                id: String(item.id), 
                etiqueta: item.etiqueta || item.tag || "N" 
            };
        }
        return { id: String(item), etiqueta: "N" };
    });

    const inputNombre = document.getElementById('nombreLista');
    if (inputNombre) inputNombre.value = nombre;
    
    const selectTipo = document.getElementById('tipoCelebracion');
    if (selectTipo && categoria) selectTipo.value = categoria;
    
    window.expandirSeccionNuevaLista();
    
    actualizarInterfazSeleccion(); 
    renderizarLista(todosLosCantos); 
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.abrirVisorCanto = (idCanto) => {
    window.location.href = `./index.html#canto=${idCanto}`;
};

window.toggleSection = (contentId, wrapperId) => {
    const content = document.getElementById(contentId);
    const wrapper = document.getElementById(wrapperId);
    if (content && wrapper) {
        const estaCerradoActualmente = content.classList.contains('cfg-close') || wrapper.classList.contains('collapsed');
        if (estaCerradoActualmente) {
            content.classList.remove('cfg-close');
            wrapper.classList.remove('collapsed');
        } else {
            content.classList.add('cfg-close');
            wrapper.classList.add('collapsed');
        }
        
        const arrow = wrapper.querySelector('.arrow-icon');
        if (arrow) {
            arrow.textContent = estaCerradoActualmente ? 'expand_less' : 'expand_more';
        }
    }
};

// Auto importación de links compartidos
const detectarLinkCompartido = async () => {
    const params = new URLSearchParams(window.location.search);
    const idCorto = params.get('v'); 

    if (idCorto) {
        bloqueoSnapshot = true;
        try {
            const docRef = doc(db, "listasCompartidas", idCorto);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const datosCanto = docSnap.data();
                if (datosCanto && datosCanto.n && datosCanto.i) {
                    const idFinal = "imp-" + Date.now();
                    let nombreLimpio = datosCanto.n.replace(/🔗/g, '').replace(/📂/g, '').trim();
                    const nl = { 
                        id: idFinal, 
                        nombre: "🔗 " + nombreLimpio, 
                        categoria: datosCanto.c || "Otros",
                        ids_cantos: datosCanto.i, 
                        ultimaActualizacion: new Date().toISOString(),
                        origin: 'local',
                        pendingSync: auth.currentUser ? true : false
                    };

                    let cache = JSON.parse(localStorage.getItem('cache_listas_personalizadas') || "[]");
                    cache.unshift(nl);
                    localStorage.setItem('cache_listas_personalizadas', JSON.stringify(cache));
                    listasLocalesCache = cache;

                    window.history.replaceState({}, document.title, window.location.pathname);
                    renderizarListasUI(cache);
                }
            } else {
                alert("El enlace compartido no existe o ha expirado.");
                bloqueoSnapshot = false;
            }
        } catch (e) {
            console.error("Error al importar link compartido:", e);
            bloqueoSnapshot = false;
        }
    }
};

// Selección de Momentos
window.setMomento = (elemento, momento) => {
    momentoSeleccionado = momento;
    if (elemento) {
        const padre = elemento.parentElement;
        padre.querySelectorAll('.opcion-momento').forEach(el => el.classList.remove('active'));
        elemento.classList.add('active');
    }
    renderizarLista(todosLosCantos);
};

// Inicialización de DOM y Eventos
document.addEventListener('DOMContentLoaded', () => {
    poblarSelectYFiltrosCelebracion();
    if (todosLosCantos.length > 0) {
        renderizarLista(todosLosCantos);
    }
    
    // Escuchadores de teclado para el buscador en preparar
    const input = document.getElementById('inputBuscadorCantos');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.shiftKey) {
                const firstItem = document.querySelector('#contenedor-seleccion .item-canto');
                if (firstItem) {
                    e.preventDefault();
                    firstItem.focus();
                }
            } else if (e.key === 'Enter') {
                const firstItem = document.querySelector('#contenedor-seleccion .item-canto');
                if (firstItem) {
                    e.preventDefault();
                    firstItem.click();
                }
            }
        });
    }
});
