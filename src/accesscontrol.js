/**
 * src/accesscontrol.js - Módulo de Control de Acceso basado en Jerarquía de Grupos (Active Directory / RBAC)
 * 
 * Permite gestionar:
 * - Permisos individuales por Hermano.
 * - Grupos de Hermanos y su edición (Nombre, descripción y permisos).
 * - Registro automático de Hermanos iniciados sesión (cantores por defecto).
 * - Sincronización PROFUNDA y SILENCIOSA en la nube con Firebase Cloud Firestore.
 * - Asignación exclusiva de grupo primario por Hermano.
 * - Cambio de grupo de Hermanos, banear/desbanear y eliminar cuentas de la lista.
 * - Control dinámico de Hermanos invitados (sin sesión).
 * - Grupos anidados dentro de otros grupos (Herencia jerárquica estilo Active Directory).
 */

import { getCurrentUser, isCurrentUserAdmin } from "./auth.js";
import { db, doc, setDoc, getDoc, collection, getDocs, onSnapshot } from "./firebase.js";

// Lista de Permisos Disponibles en el Sistema
export const PERMISSIONS = {
  ALL: "*",
  MANAGE_ACCESS: "manage_access",
  VIEW_LOGS: "view_logs", // Permiso para ver Logs de Diagnóstico
  VIEW_USAGE: "view_usage", // Permiso para ver el Uso de la App (Firebase)
  VIEW_STATUS: "view_status", // Permiso para ver el Estado Resucitó (recursos cacheados)
  VIEW_SETTINGS_GENERAL: "view_settings_general", // Ajustes > General
  VIEW_SETTINGS_THEME: "view_settings_theme",     // Ajustes > Tema
  VIEW_SETTINGS_SONG: "view_settings_song",       // Ajustes > Canto
  VIEW_SETTINGS_USER: "view_settings_user",       // Ajustes > Usuario
  VIEW_SETTINGS_DATA: "view_settings_data",       // Ajustes > Datos
  VIEW_SETTINGS_LOG: "view_settings_log",         // Ajustes > Log
  VIEW_BOOKS: "view_books",                       // Ver Libros de Cantos
  CONTROL_CANTO: "control_canto",
  EDIT_CHORDS: "edit_chords",
  EDIT_SONG_STAGES: "edit_song_stages",
  BOOK_RESUCITO: "book_resucito",
  BOOK_JOVEN: "book_joven",
  BOOK_ACLAMACIONES: "book_aclamaciones",
  BOOK_SALMODIAS: "book_salmodias",
  BOOK_CATEQUESIS: "book_catequesis",
  BOOK_FAVORITOS: "book_favoritos",
  BOOK_EXTRAS: "book_extras" // Permiso exclusivo para el libro Extras
};

// Descripciones amigables para los permisos
export const PERMISSION_LABELS = {
  "*": "Acceso Total (* / Administrador)",
  "manage_access": "Administrar Control de Acceso",
  "view_logs": "Ver Logs de Diagnóstico",
  "view_usage": "Ver Uso de la Aplicación (Uso App)",
  "view_status": "Ver Estado de Canto Resucitó",
  "view_settings_general": "Ver Ajustes: General",
  "view_settings_theme": "Ver Ajustes: Tema",
  "view_settings_song": "Ver Ajustes: Canto",
  "view_settings_user": "Ver Ajustes: Usuario",
  "view_settings_data": "Ver Ajustes: Datos",
  "view_settings_log": "Ver Ajustes: Log",
  "view_books": "Ver Libros de Cantos",
  "control_canto": "Control Canto",
  "edit_chords": "Editar Digitaciones y Acordes",
  "edit_song_stages": "Etapas del Canto",
  "book_resucito": "Ver Libro Resucitó",
  "book_joven": "Ver Libro Canto Joven",
  "book_aclamaciones": "Ver Libro Aclamaciones",
  "book_salmodias": "Ver Libro Salmodias",
  "book_catequesis": "Ver Libro Catequesis",
  "book_favoritos": "Ver Favoritos",
  "book_extras": "Ver Libro Extras (Exclusivo)"
};

// Almacenamiento de Estado del Control de Acceso (Persistible en localStorage)
const accessControlState = {
  // Mapa de grupos: groupId -> { id, name, description, userIds: Set, subgroupIds: Set, permissions: Set }
  groups: {},
  // Permisos directos asignados a usuarios: userId/email -> Set(permissionKeys)
  userDirectPermissions: {},
  // Grupos directos asignados a usuarios: userId/email -> Set(groupIds)
  userDirectGroups: {},
  // Set de todos los usuarios que han iniciado sesión con correo real
  registeredUsers: new Set(),
  // Nombres visibles de usuarios registrados: email -> displayName
  registeredUserNames: {},
  // Set de correos baneados
  bannedUsers: new Set()
};

let unsubscribeOwnUserListener = null;

/**
 * Inicializa los grupos por defecto del sistema (Administradores, Cantores, Invitados).
 */
export function initAccessControl() {
  const savedState = localStorage.getItem("resucito_access_control");
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      Object.keys(parsed.groups || {}).forEach(gid => {
        const g = parsed.groups[gid];
        accessControlState.groups[gid] = {
          ...g,
          userIds: new Set(g.userIds || []),
          subgroupIds: new Set(g.subgroupIds || []),
          permissions: new Set(g.permissions || [])
        };
      });
      Object.keys(parsed.userDirectPermissions || {}).forEach(uid => {
        accessControlState.userDirectPermissions[uid] = new Set(parsed.userDirectPermissions[uid] || []);
      });
      Object.keys(parsed.userDirectGroups || {}).forEach(uid => {
        accessControlState.userDirectGroups[uid] = new Set(parsed.userDirectGroups[uid] || []);
      });
      if (Array.isArray(parsed.registeredUsers)) {
        accessControlState.registeredUsers = new Set(parsed.registeredUsers);
      }
      if (parsed.registeredUserNames) {
        accessControlState.registeredUserNames = { ...parsed.registeredUserNames };
      }
      if (Array.isArray(parsed.bannedUsers)) {
        accessControlState.bannedUsers = new Set(parsed.bannedUsers);
      }
      return;
    } catch (e) {
      console.warn("Error al cargar control de acceso desde localStorage, creando valores por defecto:", e);
    }
  }

  // Crear Grupo de Administradores
  createGroup("administradores", "Administradores del Sistema", [PERMISSIONS.ALL], "Grupo con control total del sistema");
  
  // Crear Grupo de Cantores
  createGroup("cantores", "Grupo General de Cantores", [
    PERMISSIONS.BOOK_RESUCITO,
    PERMISSIONS.BOOK_JOVEN,
    PERMISSIONS.BOOK_ACLAMACIONES,
    PERMISSIONS.BOOK_SALMODIAS,
    PERMISSIONS.BOOK_CATEQUESIS,
    PERMISSIONS.BOOK_FAVORITOS
  ], "Cantores registrados en la comunidad");

  // Crear Grupo de Invitados
  createGroup("invitados", "Usuarios Invitados", [
    PERMISSIONS.BOOK_RESUCITO,
    PERMISSIONS.BOOK_FAVORITOS,
    PERMISSIONS.VIEW_SETTINGS_GENERAL,
    PERMISSIONS.VIEW_SETTINGS_THEME,
    PERMISSIONS.VIEW_SETTINGS_SONG,
    PERMISSIONS.VIEW_SETTINGS_USER,
    PERMISSIONS.VIEW_SETTINGS_DATA,
    PERMISSIONS.VIEW_SETTINGS_LOG,
    PERMISSIONS.VIEW_BOOKS
  ], "Usuarios sin inicio de sesión");
  
  // El grupo Cantores incluye al grupo Invitados (Subgrupo anidado)
  addGroupToGroup("invitados", "cantores");
}

/**
 * Asigna de forma EXCLUSIVA a un Hermano su grupo primario (removiéndolo de cualquier otro grupo).
 */
export function setUserPrimaryGroup(userEmail, groupId) {
  if (!userEmail || !groupId) return;
  const uid = userEmail.toLowerCase().trim();
  const gid = groupId.toLowerCase().trim();

  // Limpiar al Hermano de todos los demás grupos
  Object.keys(accessControlState.groups).forEach(otherGid => {
    accessControlState.groups[otherGid].userIds.delete(uid);
  });

  if (!accessControlState.groups[gid]) {
    createGroup(gid, gid);
  }

  accessControlState.groups[gid].userIds.add(uid);
  accessControlState.registeredUsers.add(uid);
  accessControlState.userDirectGroups[uid] = new Set([gid]);

  saveAccessControl();
}

/**
 * Guarda el estado actual del control de acceso en localStorage.
 */
export function saveAccessControl() {
  const serializable = {
    groups: {},
    userDirectPermissions: {},
    userDirectGroups: {},
    registeredUsers: Array.from(accessControlState.registeredUsers),
    registeredUserNames: accessControlState.registeredUserNames,
    bannedUsers: Array.from(accessControlState.bannedUsers)
  };

  Object.keys(accessControlState.groups).forEach(gid => {
    const g = accessControlState.groups[gid];
    serializable.groups[gid] = {
      id: g.id,
      name: g.name,
      description: g.description,
      userIds: Array.from(g.userIds),
      subgroupIds: Array.from(g.subgroupIds),
      permissions: Array.from(g.permissions)
    };
  });

  Object.keys(accessControlState.userDirectPermissions).forEach(uid => {
    serializable.userDirectPermissions[uid] = Array.from(accessControlState.userDirectPermissions[uid]);
  });

  Object.keys(accessControlState.userDirectGroups).forEach(uid => {
    serializable.userDirectGroups[uid] = Array.from(accessControlState.userDirectGroups[uid]);
  });

  localStorage.setItem("resucito_access_control", JSON.stringify(serializable));
}

/**
 * Guarda la definición y los permisos de los grupos en Firebase Cloud Firestore.
 */
export async function saveGroupConfigToCloud() {
  saveAccessControl();
  try {
    const serializableGroups = {};
    Object.keys(accessControlState.groups).forEach(gid => {
      const g = accessControlState.groups[gid];
      serializableGroups[gid] = {
        id: g.id,
        name: g.name,
        description: g.description,
        permissions: Array.from(g.permissions),
        subgroupIds: Array.from(g.subgroupIds)
      };
    });

    await setDoc(doc(db, "system_config", "access_control"), {
      groups: serializableGroups,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("🔥 Permisos de grupos guardados en Firebase Cloud!");
  } catch (err) {
    console.warn("Error al guardar permisos de grupos en Firebase Cloud:", err);
  }
}

/**
 * Escucha en tiempo real y SILENCIOSAMENTE la configuración global de permisos de grupos desde Firebase Cloud.
 */
export function listenToGroupConfigFromFirebase() {
  try {
    onSnapshot(doc(db, "system_config", "access_control"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.groups) {
          Object.keys(data.groups).forEach(gid => {
            const gData = data.groups[gid];
            if (!accessControlState.groups[gid]) {
              accessControlState.groups[gid] = {
                id: gData.id,
                name: gData.name,
                description: gData.description || "",
                userIds: new Set(),
                subgroupIds: new Set(gData.subgroupIds || []),
                permissions: new Set(gData.permissions || [])
              };
            } else {
              accessControlState.groups[gid].name = gData.name;
              accessControlState.groups[gid].description = gData.description || "";
              accessControlState.groups[gid].permissions = new Set(gData.permissions || []);
              accessControlState.groups[gid].subgroupIds = new Set(gData.subgroupIds || []);
            }
          });
          saveAccessControl();
          // Actualización silenciosa de visibilidad de libros en la ventana principal
          if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
            window.updateBookTabsVisibility();
          }
          renderAccessControlUI();
        }
      }
    });
    console.log("🤫 Escuchando permisos de grupos silenciosamente en vivo desde Firebase Cloud.");
  } catch (err) {
    console.warn("Error al escuchar permisos de grupos de Firebase Cloud:", err);
  }
}

/**
 * Escucha SILENCIOSAMENTE en tiempo real los cambios del Hermano individual conectado.
 * Si el Administrador le cambia el grupo o lo banea en Firebase, se refleja al instante en pantalla principal.
 */
export function listenToOwnUserPermissionsSilently(user) {
  if (unsubscribeOwnUserListener) {
    unsubscribeOwnUserListener();
    unsubscribeOwnUserListener = null;
  }

  if (!user || !user.email) return;

  const email = user.email.toLowerCase().trim();
  const cleanDocId = email.replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    unsubscribeOwnUserListener = onSnapshot(doc(db, "registered_users", cleanDocId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data) {
          if (data.group) {
            setUserPrimaryGroup(email, data.group);
          }
          if (data.banned) {
            accessControlState.bannedUsers.add(email);
          } else {
            accessControlState.bannedUsers.delete(email);
          }
          saveAccessControl();
          
          // Actualizar la visibilidad de los libros silenciosamente en la ventana principal
          if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
            window.updateBookTabsVisibility();
          }
          if (typeof window !== 'undefined' && window.updateAccessControlVisibility) {
            window.updateAccessControlVisibility();
          }
          console.log("🤫 Permisos de Hermano actualizados silenciosamente desde Firebase Cloud para:", email);
        }
      }
    }, (err) => {
      // Ignorar errores silenciosamente
    });
  } catch (err) {
    // Ignorar errores silenciosamente
  }
}

/**
 * Sincronización COMPLETA y PROFUNDA de todo el Control de Acceso (Grupos, Permisos y Hermanos Registrados).
 */
export async function syncAllAccessControlFromFirebase() {
  // 1. Traer definición y permisos de grupos desde Firebase Cloud
  try {
    const docSnap = await getDoc(doc(db, "system_config", "access_control"));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.groups) {
        Object.keys(data.groups).forEach(gid => {
          const gData = data.groups[gid];
          if (!accessControlState.groups[gid]) {
            accessControlState.groups[gid] = {
              id: gData.id,
              name: gData.name,
              description: gData.description || "",
              userIds: new Set(),
              subgroupIds: new Set(gData.subgroupIds || []),
              permissions: new Set(gData.permissions || [])
            };
          } else {
            accessControlState.groups[gid].name = gData.name;
            accessControlState.groups[gid].description = gData.description || "";
            accessControlState.groups[gid].permissions = new Set(gData.permissions || []);
            accessControlState.groups[gid].subgroupIds = new Set(gData.subgroupIds || []);
          }
        });
      }
    }
  } catch (err) {
    console.warn("Error al sincronizar grupos desde Firebase Cloud:", err);
  }

  // 2. Traer todos los Hermanos registrados y sus grupos asignados
  await syncRegisteredUsersFromFirebase();

  // 3. Guardar estado local
  saveAccessControl();

  // 4. Actualizar visibilidad de libros en la pantalla principal
  if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
    window.updateBookTabsVisibility();
  }

  // 5. Renderizar interfaz de Control de Acceso
  renderAccessControlUI();
}

export function getAccessControlState() {
  return accessControlState;
}

/**
 * Registra a un Hermano que inicia sesión, lo guarda localmente y en Firebase Cloud.
 */
export async function trackLoggedInUser(user) {
  if (!user || !user.email) return;
  const email = user.email.toLowerCase().trim();
  const cleanDocId = email.replace(/[^a-zA-Z0-9_-]/g, "_");

  accessControlState.registeredUsers.add(email);
  if (user.displayName) {
    accessControlState.registeredUserNames[email] = user.displayName;
  }

  let assignedGroup = 'cantores';
  if (email === 'dbaezh78@gmail.com') {
    assignedGroup = 'administradores';
    setUserPrimaryGroup(email, 'administradores');
  } else {
    const userGroups = accessControlState.userDirectGroups[email];
    if (!userGroups || userGroups.size === 0) {
      setUserPrimaryGroup(email, 'cantores');
    } else {
      assignedGroup = Array.from(userGroups)[0] || 'cantores';
      setUserPrimaryGroup(email, assignedGroup);
    }
  }

  saveAccessControl();

  // Iniciar escuchador silencioso específico para este Hermano
  listenToOwnUserPermissionsSilently(user);

  try {
    await setDoc(doc(db, "registered_users", cleanDocId), {
      email: email,
      displayName: user.displayName || "",
      group: assignedGroup,
      banned: accessControlState.bannedUsers.has(email),
      lastLogin: new Date().toISOString()
    }, { merge: true });
    console.log("🔥 Hermano registrado guardado en Firebase Cloud:", email);
  } catch (err) {
    console.warn("No se pudo guardar Hermano en Firebase Cloud:", err);
  }
}

/**
 * Sincroniza en tiempo real la lista de Hermanos registrados desde Firebase Cloud Nube.
 */
export async function syncRegisteredUsersFromFirebase() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    const querySnapshot = await getDocs(collection(db, "registered_users"));
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.email && !data.deleted) {
        const email = data.email.toLowerCase().trim();
        accessControlState.registeredUsers.add(email);
        if (data.displayName) {
          accessControlState.registeredUserNames[email] = data.displayName;
        }
        if (data.group) {
          setUserPrimaryGroup(email, data.group);
        }
        if (data.banned) {
          accessControlState.bannedUsers.add(email);
        } else {
          accessControlState.bannedUsers.delete(email);
        }
      }
    });
    saveAccessControl();
    if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
      window.updateBookTabsVisibility();
    }
    console.log("🔥 Hermanos sincronizados desde Firebase Cloud exitosamente.");
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      console.log("ℹ️ Usuario en modo invitado (sin permisos de lectura de lista completa de registrados).");
    } else {
      console.warn("Error al sincronizar Hermanos desde Firebase Cloud:", err);
    }
  }
}

/**
 * Escucha en tiempo real (push) los nuevos Hermanos registrados desde cualquier navegador o dispositivo.
 */
export function listenToRegisteredUsersFromFirebase() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    onSnapshot(collection(db, "registered_users"), (snapshot) => {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.email) {
          const email = data.email.toLowerCase().trim();
          if (data.deleted) {
            deleteUserRecordLocal(email);
          } else {
            accessControlState.registeredUsers.add(email);
            if (data.displayName) {
              accessControlState.registeredUserNames[email] = data.displayName;
            }
            if (data.group) {
              setUserPrimaryGroup(email, data.group);
            }
            if (data.banned) {
              accessControlState.bannedUsers.add(email);
            } else {
              accessControlState.bannedUsers.delete(email);
            }
          }
        }
      });
      saveAccessControl();
      if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
        window.updateBookTabsVisibility();
      }
      renderAccessControlUI();
    }, (err) => {
      if (err && err.code === 'permission-denied') {
        console.log("ℹ️ Escuchador de registrados pausado para invitados.");
      }
    });
    console.log("🔥 Escuchando Hermanos en vivo desde Firebase Cloud.");
  } catch (err) {
    console.warn("Error al escuchar Hermanos en vivo desde Firebase:", err);
  }
}

/**
 * Cambia el grupo asignado de un Hermano registrado de forma EXCLUSIVA y lo sincroniza con Firebase Cloud.
 */
export async function changeUserPrimaryGroup(userEmail, newGroupId) {
  if (!userEmail || !newGroupId) return;
  const email = userEmail.toLowerCase().trim();
  if (email === 'dbaezh78@gmail.com') {
    alert("El grupo del Administrador Principal está protegido y no se puede cambiar.");
    return;
  }
  const newGid = newGroupId.toLowerCase().trim();
  const cleanDocId = email.replace(/[^a-zA-Z0-9_-]/g, "_");

  setUserPrimaryGroup(email, newGid);

  try {
    await setDoc(doc(db, "registered_users", cleanDocId), {
      email: email,
      group: newGid,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("🔥 Cambio de grupo guardado en Firebase Cloud para:", email);
  } catch (err) {
    console.warn("Error al guardar cambio de grupo en Firebase Cloud:", err);
  }

  if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
    window.updateBookTabsVisibility();
  }
}

/**
 * Banea a un Hermano impidiendo su acceso.
 */
export async function banUser(userEmail) {
  if (!userEmail) return;
  const email = userEmail.toLowerCase().trim();
  if (email === 'dbaezh78@gmail.com') {
    alert("No se puede banear al Administrador Principal del Sistema.");
    return;
  }

  accessControlState.bannedUsers.add(email);
  saveAccessControl();

  const cleanDocId = email.replace(/[^a-zA-Z0-9_-]/g, "_");
  try {
    await setDoc(doc(db, "registered_users", cleanDocId), {
      banned: true,
      bannedAt: new Date().toISOString()
    }, { merge: true });
    console.log("🚫 Hermano baneado en Firebase Cloud:", email);
  } catch (err) {
    console.warn("Error al banear Hermano en Firebase Cloud:", err);
  }

  if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
    window.updateBookTabsVisibility();
  }
}

/**
 * Desbanea a un Hermano.
 */
export async function unbanUser(userEmail) {
  if (!userEmail) return;
  const email = userEmail.toLowerCase().trim();
  accessControlState.bannedUsers.delete(email);
  saveAccessControl();

  const cleanDocId = email.replace(/[^a-zA-Z0-9_-]/g, "_");
  try {
    await setDoc(doc(db, "registered_users", cleanDocId), {
      banned: false,
      unbannedAt: new Date().toISOString()
    }, { merge: true });
    console.log("✅ Hermano desbaneado en Firebase Cloud:", email);
  } catch (err) {
    console.warn("Error al desbanear Hermano en Firebase Cloud:", err);
  }

  if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
    window.updateBookTabsVisibility();
  }
}

/**
 * Elimina un registro de Hermano del estado local.
 */
function deleteUserRecordLocal(userEmail) {
  const email = userEmail.toLowerCase().trim();
  accessControlState.registeredUsers.delete(email);
  delete accessControlState.registeredUserNames[email];
  accessControlState.bannedUsers.delete(email);
  Object.keys(accessControlState.groups).forEach(gid => {
    accessControlState.groups[gid].userIds.delete(email);
  });
  delete accessControlState.userDirectGroups[email];
}

/**
 * Elimina permanentemente a un Hermano de la lista de miembros.
 */
export async function deleteUserRecord(userEmail) {
  if (!userEmail) return;
  const email = userEmail.toLowerCase().trim();
  if (email === 'dbaezh78@gmail.com') {
    alert("No se puede eliminar al Administrador Principal del Sistema.");
    return;
  }

  deleteUserRecordLocal(email);
  saveAccessControl();

  const cleanDocId = email.replace(/[^a-zA-Z0-9_-]/g, "_");
  try {
    await setDoc(doc(db, "registered_users", cleanDocId), {
      deleted: true,
      deletedAt: new Date().toISOString()
    }, { merge: true });
    console.log("🗑️ Hermano eliminado en Firebase Cloud:", email);
  } catch (err) {
    console.warn("Error al eliminar Hermano en Firebase Cloud:", err);
  }
}

/**
 * Edita un grupo existente (Nombre y Descripción) y lo guarda en Firebase Cloud.
 */
export function updateGroup(groupId, newName, newDescription) {
  const gid = groupId.toLowerCase().trim();
  const group = accessControlState.groups[gid];
  if (!group) return false;

  if (newName !== undefined && newName.trim()) group.name = newName.trim();
  if (newDescription !== undefined) group.description = newDescription.trim();

  saveGroupConfigToCloud();
  return true;
}

/**
 * Crea un nuevo grupo estilo Active Directory.
 */
export function createGroup(groupId, name, permissions = [], description = "") {
  const cleanId = groupId.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
  if (!cleanId) return null;

  if (!accessControlState.groups[cleanId]) {
    accessControlState.groups[cleanId] = {
      id: cleanId,
      name: name || cleanId,
      description: description || "",
      userIds: new Set(),
      subgroupIds: new Set(),
      permissions: new Set(permissions)
    };
  } else {
    if (name) accessControlState.groups[cleanId].name = name;
    if (description) accessControlState.groups[cleanId].description = description;
    permissions.forEach(p => accessControlState.groups[cleanId].permissions.add(p));
  }
  saveGroupConfigToCloud();
  return accessControlState.groups[cleanId];
}

/**
 * Elimina un grupo.
 */
export function deleteGroup(groupId) {
  const gid = groupId.toLowerCase().trim();
  if (gid === 'administradores' || gid === 'cantores' || gid === 'invitados') {
    alert("Los grupos por defecto del sistema no se pueden eliminar.");
    return false;
  }
  delete accessControlState.groups[gid];
  Object.keys(accessControlState.groups).forEach(otherGid => {
    accessControlState.groups[otherGid].subgroupIds.delete(gid);
  });
  saveGroupConfigToCloud();
  return true;
}

/**
 * Agrega un Hermano (email/ID) a un grupo.
 */
export function addUserToGroup(userIdOrEmail, groupId) {
  if (!userIdOrEmail || !groupId) return;
  const uid = userIdOrEmail.toLowerCase().trim();
  const gid = groupId.toLowerCase().trim();

  if (!accessControlState.groups[gid]) {
    createGroup(gid, gid);
  }

  accessControlState.groups[gid].userIds.add(uid);
  accessControlState.registeredUsers.add(uid);
  
  if (!accessControlState.userDirectGroups[uid]) {
    accessControlState.userDirectGroups[uid] = new Set();
  }
  accessControlState.userDirectGroups[uid].add(gid);
  
  saveAccessControl();
}

/**
 * Elimina un Hermano de un grupo.
 */
export function removeUserFromGroup(userIdOrEmail, groupId) {
  const uid = userIdOrEmail.toLowerCase().trim();
  const gid = groupId.toLowerCase().trim();
  if (accessControlState.groups[gid]) {
    accessControlState.groups[gid].userIds.delete(uid);
  }
  if (accessControlState.userDirectGroups[uid]) {
    accessControlState.userDirectGroups[uid].delete(gid);
  }
  saveAccessControl();
}

/**
 * Agrega un subgrupo a un grupo padre (Herencia anidada estilo Active Directory).
 */
export function addGroupToGroup(subgroupId, parentGroupId) {
  const sub = subgroupId.toLowerCase().trim();
  const parent = parentGroupId.toLowerCase().trim();

  if (sub === parent) {
    alert("Un grupo no puede anidarse a sí mismo.");
    return;
  }

  if (!accessControlState.groups[sub]) createGroup(sub, sub);
  if (!accessControlState.groups[parent]) createGroup(parent, parent);

  accessControlState.groups[parent].subgroupIds.add(sub);
  saveGroupConfigToCloud();
}

/**
 * Alterna (asigna o remueve) un permiso en un grupo y sincroniza con la nube.
 */
export function togglePermissionForGroup(groupId, permissionKey) {
  const gid = groupId.toLowerCase().trim();
  const g = accessControlState.groups[gid];
  if (!g) return;
  if (g.permissions.has(permissionKey)) {
    g.permissions.delete(permissionKey);
  } else {
    g.permissions.add(permissionKey);
  }
  saveGroupConfigToCloud();

  const selectGroupPerm = document.getElementById('ac-select-group-perm');
  if (selectGroupPerm && accessControlState.groups[gid]) {
    selectGroupPerm.value = gid;
  }
  renderPermissionsPanel();

  if (typeof window !== 'undefined' && window.updateBookTabsVisibility) {
    window.updateBookTabsVisibility();
  }
}

/**
 * Obtiene de forma recursiva todos los permisos acumulados para un Hermano.
 */
export function getUserEffectivePermissions(userIdOrEmail) {
  if (!userIdOrEmail) return new Set();
  const uid = userIdOrEmail.toLowerCase().trim();
  
  const effectivePermissions = new Set();
  
  if (accessControlState.userDirectPermissions[uid]) {
    accessControlState.userDirectPermissions[uid].forEach(p => effectivePermissions.add(p));
  }

  const visitedGroups = new Set();

  function collectGroupPermissions(groupId) {
    if (visitedGroups.has(groupId)) return;
    visitedGroups.add(groupId);

    const group = accessControlState.groups[groupId];
    if (!group) return;

    group.permissions.forEach(p => effectivePermissions.add(p));

    group.subgroupIds.forEach(subId => {
      collectGroupPermissions(subId);
    });
  }

  Object.keys(accessControlState.groups).forEach(gid => {
    const g = accessControlState.groups[gid];
    if (g.userIds.has(uid)) {
      collectGroupPermissions(gid);
    }
  });

  if (accessControlState.userDirectGroups[uid]) {
    accessControlState.userDirectGroups[uid].forEach(gid => collectGroupPermissions(gid));
  }

  return effectivePermissions;
}

/**
 * Obtiene los permisos acumulados del grupo de usuarios Invitados (sin inicio de sesión).
 */
export function getGuestEffectivePermissions() {
  const effectivePermissions = new Set();
  const guestGroup = accessControlState.groups['invitados'];
  if (guestGroup) {
    guestGroup.permissions.forEach(p => effectivePermissions.add(p));
    guestGroup.subgroupIds.forEach(subId => {
      const subGroup = accessControlState.groups[subId];
      if (subGroup) {
        subGroup.permissions.forEach(p => effectivePermissions.add(p));
      }
    });
  }
  return effectivePermissions;
}

/**
 * Evalúa si un Hermano tiene un permiso específico.
 * Si no ha iniciado sesión, se evalúa con el grupo "Usuarios Invitados" (invitados).
 */
export function hasPermission(permissionKey, customUser = null) {
  const user = customUser || getCurrentUser();

  if (user && user.email && accessControlState.bannedUsers.has(user.email.toLowerCase().trim())) {
    return false;
  }

  if (isCurrentUserAdmin()) return true;

  if (!user || !user.email) {
    const guestPerms = getGuestEffectivePermissions();
    if (guestPerms.has(PERMISSIONS.ALL)) return true;
    return guestPerms.has(permissionKey);
  }

  const email = user.email.toLowerCase().trim();
  const effectivePerms = getUserEffectivePermissions(email);

  if (effectivePerms.has(PERMISSIONS.ALL)) return true;

  return effectivePerms.has(permissionKey);
}

/**
 * Evalúa si el Hermano actual (autenticado o invitado) tiene acceso al libro indicado.
 */
export function canAccessBook(bookId) {
  const user = getCurrentUser();
  if (user && user.email && accessControlState.bannedUsers.has(user.email.toLowerCase().trim())) {
    return false;
  }

  if (isCurrentUserAdmin()) {
    return true;
  }

  if (bookId === 'extras') {
    return hasPermission(PERMISSIONS.BOOK_EXTRAS);
  }

  const permKey = `book_${bookId}`;
  return hasPermission(permKey);
}

/**
 * Configuración de eventos de la interfaz visual del Control de Acceso.
 */
export function setupAccessControlUI() {
  window.switchAccessSubtab = function(targetSub) {
    const subtabBtns = document.querySelectorAll('.access-subtab-btn');
    const subpanels = document.querySelectorAll('.access-subpanel');
    subtabBtns.forEach(b => {
      const isActive = b.dataset.subtab === targetSub;
      b.classList.toggle('active', isActive);
      b.style.borderBottom = isActive ? '2px solid var(--accent-color)' : 'none';
      b.style.color = isActive ? 'var(--accent-color)' : 'var(--text-muted)';
      b.style.fontWeight = isActive ? '700' : '600';
    });

    subpanels.forEach(sp => {
      sp.style.display = sp.id === `access-subpanel-${targetSub}` ? 'block' : 'none';
    });

    if (targetSub === 'song-stages') {
      const songSelect = document.getElementById('ac-stage-song-select');
      if (songSelect && window.allSongs && songSelect.children.length === 0) {
        songSelect.innerHTML = window.allSongs.map(s => 
          `<option value="${s.id}">#${s.dbno || 'S/N'} - ${s.title}</option>`
        ).join('');
      }
      if (typeof window.renderSongStagesTable === 'function') {
        window.renderSongStagesTable();
      }
      if (typeof window.updateAddSongStageButtonState === 'function') {
        window.updateAddSongStageButtonState();
      }
    }
  };

  const subtabBtns = document.querySelectorAll('.access-subtab-btn');
  const subpanels = document.querySelectorAll('.access-subpanel');

  subtabBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetSub = btn.dataset.subtab;
      subtabBtns.forEach(b => {
        const isActive = b.dataset.subtab === targetSub;
        b.classList.toggle('active', isActive);
        b.style.borderBottom = isActive ? '2px solid var(--accent-color)' : 'none';
        b.style.color = isActive ? 'var(--accent-color)' : 'var(--text-muted)';
        b.style.fontWeight = isActive ? '700' : '600';
      });

      subpanels.forEach(sp => {
        sp.style.display = sp.id === `access-subpanel-${targetSub}` ? 'block' : 'none';
      });

      if (targetSub === 'members' || targetSub === 'permissions' || targetSub === 'groups') {
        await syncAllAccessControlFromFirebase();
      } else if (targetSub === 'song-stages') {
        const songSelect = document.getElementById('ac-stage-song-select');
        if (songSelect && window.allSongs && songSelect.children.length === 0) {
          songSelect.innerHTML = window.allSongs.map(s => 
            `<option value="${s.id}">#${s.dbno || 'S/N'} - ${s.title}</option>`
          ).join('');
        }
        if (typeof window.renderSongStagesTable === 'function') {
          window.renderSongStagesTable();
        }
        if (typeof window.updateAddSongStageButtonState === 'function') {
          window.updateAddSongStageButtonState();
        }
      }

      renderAccessControlUI();
    });
  });

  const btnRefreshMembers = document.getElementById('ac-btn-refresh-members');
  if (btnRefreshMembers) {
    btnRefreshMembers.addEventListener('click', async () => {
      const icon = btnRefreshMembers.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.style.transition = 'transform 0.8s ease';
        icon.style.transform = 'rotate(720deg)';
      }

      await syncAllAccessControlFromFirebase();

      setTimeout(() => {
        if (icon) {
          icon.style.transition = 'none';
          icon.style.transform = 'rotate(0deg)';
        }
      }, 800);
    });
  }

  const inputSearchMembers = document.getElementById('ac-search-members-input');
  if (inputSearchMembers) {
    inputSearchMembers.addEventListener('input', () => {
      renderAccessControlUI();
    });
  }

  const btnCreateGroup = document.getElementById('ac-btn-create-group');
  if (btnCreateGroup) {
    btnCreateGroup.addEventListener('click', () => {
      handleSaveGroupForm();
    });
  }

  const btnCancelGroup = document.getElementById('ac-btn-cancel-group');
  if (btnCancelGroup) {
    btnCancelGroup.addEventListener('click', () => {
      handleCancelGroupForm();
    });
  }

  const btnAddUser = document.getElementById('ac-btn-add-user');
  if (btnAddUser) {
    btnAddUser.addEventListener('click', () => {
      const selectGroup = document.getElementById('ac-select-group-user');
      const inputEmail = document.getElementById('ac-user-email-input');
      if (!selectGroup || !inputEmail || !inputEmail.value.trim()) {
        alert("Ingresa un correo electrónico válido de un Hermano.");
        return;
      }
      setUserPrimaryGroup(inputEmail.value, selectGroup.value);
      inputEmail.value = '';
      alert("Hermano agregado al grupo exitosamente.");
      renderAccessControlUI();
    });
  }

  const btnNestGroup = document.getElementById('ac-btn-nest-group');
  if (btnNestGroup) {
    btnNestGroup.addEventListener('click', () => {
      const selectSub = document.getElementById('ac-select-subgroup');
      const selectParent = document.getElementById('ac-select-parentgroup');
      if (!selectSub || !selectParent) return;
      addGroupToGroup(selectSub.value, selectParent.value);
      alert(`El subgrupo "${selectSub.value}" ahora está anidado dentro de "${selectParent.value}".`);
      renderAccessControlUI();
    });
  }

  const btnInspect = document.getElementById('ac-btn-inspect');
  if (btnInspect) {
    btnInspect.addEventListener('click', () => {
      const inputInspect = document.getElementById('ac-inspect-email-input');
      const containerResult = document.getElementById('ac-inspect-result');
      if (!inputInspect || !containerResult) return;
      const email = inputInspect.value.trim().toLowerCase();
      if (!email) {
        containerResult.innerHTML = '<span style="color: var(--text-muted);">Ingresa un correo para evaluar.</span>';
        return;
      }

      const perms = getUserEffectivePermissions(email);
      const permList = Array.from(perms).map(p => PERMISSION_LABELS[p] || p);

      containerResult.innerHTML = `
        <div style="margin-bottom: 8px;"><b>Hermano:</b> ${email}</div>
        <div style="margin-bottom: 8px;"><b>Estado:</b> ${accessControlState.bannedUsers.has(email) ? '<span style="color: red; font-weight: 700;">BANEADO</span>' : '<span style="color: green; font-weight: 700;">ACTIVO</span>'}</div>
        <div style="margin-bottom: 8px;"><b>Permisos Efectivos de este Hermano (${permList.length}):</b></div>
        ${permList.length > 0 
          ? `<ul style="margin: 0; padding-left: 20px;">${permList.map(p => `<li>${p}</li>`).join('')}</ul>`
          : '<div style="color: var(--text-muted);">Sin permisos asignados.</div>'}
      `;
    });
  }

  const selectGroupPerm = document.getElementById('ac-select-group-perm');
  if (selectGroupPerm) {
    selectGroupPerm.addEventListener('change', renderPermissionsPanel);
  }

  // --- Manejadores de Eventos de Etapas Canto ---
  const btnAddSongStage = document.getElementById('ac-btn-add-song-stage');
  if (btnAddSongStage) {
    btnAddSongStage.addEventListener('click', async () => {
      const songSelect = document.getElementById('ac-stage-song-select');
      const stageSelect = document.getElementById('ac-stage-level-select');
      if (!songSelect || !stageSelect) return;
      const songId = songSelect.value;
      const stage = stageSelect.value;
      if (!songId) return;
      
      const docRef = doc(db, "global_positions", songId);
      try {
        await setDoc(docRef, { etapa: stage }, { merge: true });
        console.log(`[Firebase] Etapa establecida para ${songId}: ${stage}`);
      } catch (err) {
        console.error("Error al establecer la etapa del canto:", err);
      }
    });
  }

  const inputSearchStages = document.getElementById('ac-stage-song-search');
  const btnClearSearchStages = document.getElementById('ac-clear-stage-song-search');
  if (inputSearchStages) {
    inputSearchStages.addEventListener('input', (e) => {
      const filterTerm = e.target.value.toLowerCase();
      if (btnClearSearchStages) {
        btnClearSearchStages.style.display = filterTerm ? 'block' : 'none';
      }
      const songSelect = document.getElementById('ac-stage-song-select');
      if (songSelect && window.allSongs) {
        const filtered = window.allSongs.filter(s => 
          s.title.toLowerCase().includes(filterTerm) || 
          (s.dbno && s.dbno.toString().includes(filterTerm))
        );
        songSelect.innerHTML = filtered.map(s => 
          `<option value="${s.id}">#${s.dbno || 'S/N'} - ${s.title}</option>`
        ).join('');
        
        // Actualizar el estado del botón inmediatamente después del filtro
        if (typeof window.updateAddSongStageButtonState === 'function') {
          window.updateAddSongStageButtonState();
        }
      }
    });
  }

  if (btnClearSearchStages && inputSearchStages) {
    btnClearSearchStages.addEventListener('click', () => {
      inputSearchStages.value = '';
      btnClearSearchStages.style.display = 'none';
      inputSearchStages.dispatchEvent(new Event('input'));
    });
  }

  const songSelectEl = document.getElementById('ac-stage-song-select');
  if (songSelectEl) {
    songSelectEl.addEventListener('change', () => {
      if (typeof window.updateAddSongStageButtonState === 'function') {
        window.updateAddSongStageButtonState();
      }
    });
  }

  const assignedStagesSearch = document.getElementById('ac-assigned-stages-search');
  const btnClearAssignedSearch = document.getElementById('ac-clear-assigned-stages-search');
  if (assignedStagesSearch) {
    assignedStagesSearch.addEventListener('input', (e) => {
      const q = e.target.value;
      if (btnClearAssignedSearch) {
        btnClearAssignedSearch.style.display = q ? 'block' : 'none';
      }
      if (typeof window.renderSongStagesTable === 'function') {
        window.renderSongStagesTable();
      }
    });
  }

  if (btnClearAssignedSearch && assignedStagesSearch) {
    btnClearAssignedSearch.addEventListener('click', () => {
      assignedStagesSearch.value = '';
      btnClearAssignedSearch.style.display = 'none';
      assignedStagesSearch.dispatchEvent(new Event('input'));
    });
  }

  renderAccessControlUI();
}

/**
 * Renderiza dinámicamente las listas y selectores del Control de Acceso.
 */
export function renderAccessControlUI() {
  const groupsList = document.getElementById('ac-groups-list');
  const membersList = document.getElementById('ac-members-list');
  const selectGroupUser = document.getElementById('ac-select-group-user');
  const selectSubgroup = document.getElementById('ac-select-subgroup');
  const selectParentgroup = document.getElementById('ac-select-parentgroup');
  const selectGroupPerm = document.getElementById('ac-select-group-perm');

  const groupKeys = Object.keys(accessControlState.groups);

  const savedGroupUserVal = selectGroupUser ? selectGroupUser.value : null;
  const savedSubgroupVal = selectSubgroup ? selectSubgroup.value : null;
  const savedParentgroupVal = selectParentgroup ? selectParentgroup.value : null;
  const savedGroupPermVal = selectGroupPerm ? selectGroupPerm.value : null;

  const optionsHtml = groupKeys.map(gid => {
    const g = accessControlState.groups[gid];
    return `<option value="${g.id}">${g.name} (${g.id})</option>`;
  }).join('');

  if (selectGroupUser) {
    selectGroupUser.innerHTML = optionsHtml;
    if (savedGroupUserVal && accessControlState.groups[savedGroupUserVal]) selectGroupUser.value = savedGroupUserVal;
  }
  if (selectSubgroup) {
    selectSubgroup.innerHTML = optionsHtml;
    if (savedSubgroupVal && accessControlState.groups[savedSubgroupVal]) selectSubgroup.value = savedSubgroupVal;
  }
  if (selectParentgroup) {
    selectParentgroup.innerHTML = optionsHtml;
    if (savedParentgroupVal && accessControlState.groups[savedParentgroupVal]) selectParentgroup.value = savedParentgroupVal;
  }
  if (selectGroupPerm) {
    selectGroupPerm.innerHTML = optionsHtml;
    if (savedGroupPermVal && accessControlState.groups[savedGroupPermVal]) selectGroupPerm.value = savedGroupPermVal;
  }

  // 1. Renderizar lista de grupos (Pestaña Grupos)
  if (groupsList) {
    groupsList.innerHTML = groupKeys.map(gid => {
      const g = accessControlState.groups[gid];
      const users = Array.from(g.userIds);
      const subgroupIds = Array.from(g.subgroupIds);
      
      return `
        <div style="background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 0.85rem; color: var(--text-color);">${g.name} <span style="font-weight: 400; color: var(--text-muted);">(${g.id})</span></strong>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button class="ac-edit-group-btn" data-gid="${g.id}" style="border: none; background: none; color: var(--accent-color); font-size: 0.75rem; font-weight: 700; cursor: pointer;">Editar</button>
              ${(g.id !== 'administradores' && g.id !== 'cantores' && g.id !== 'invitados') 
                ? `<button class="ac-delete-group-btn" data-gid="${g.id}" style="border: none; background: none; color: red; font-size: 0.75rem; cursor: pointer;">Eliminar</button>` 
                : ''}
            </div>
          </div>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">${g.description || 'Sin descripción'}</p>
          <div style="font-size: 0.7rem; color: var(--text-color); margin-top: 4px;">
            <div><b>Hermanos (${users.length}):</b> ${users.join(', ') || 'Ninguno'}</div>
            <div><b>Subgrupos anidados (${subgroupIds.length}):</b> ${subgroupIds.join(', ') || 'Ninguno'}</div>
          </div>
        </div>
      `;
    }).join('');

    groupsList.querySelectorAll('.ac-edit-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const gid = btn.getAttribute('data-gid') || btn.dataset.gid;
        if (gid) {
          loadGroupIntoForm(gid);
        }
      });
    });

    groupsList.querySelectorAll('.ac-delete-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const gid = e.target.dataset.gid;
        if (confirm(`¿Seguro que deseas eliminar el grupo "${gid}"?`)) {
          deleteGroup(gid);
          renderAccessControlUI();
        }
      });
    });
  }

  // 2. Renderizar Lista de Miembros (Hermanos)
  if (membersList) {
    const inputSearch = document.getElementById('ac-search-members-input');
    const query = inputSearch ? inputSearch.value.trim().toLowerCase() : '';

    let regUsersList = Array.from(accessControlState.registeredUsers);

    if (query) {
      regUsersList = regUsersList.filter(userEmail => {
        const name = accessControlState.registeredUserNames ? (accessControlState.registeredUserNames[userEmail] || '') : '';
        return userEmail.toLowerCase().includes(query) || name.toLowerCase().includes(query);
      });
    }

    if (regUsersList.length === 0) {
      membersList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 16px; font-size: 0.8rem;">${query ? 'No se encontraron Hermanos que coincidan con la búsqueda.' : 'No hay Hermanos registrados por el momento.'}</div>`;
    } else {
      membersList.innerHTML = regUsersList.map(userEmail => {
        let currentGid = 'cantores';
        Object.keys(accessControlState.groups).forEach(gid => {
          if (accessControlState.groups[gid].userIds.has(userEmail)) {
            currentGid = gid;
          }
        });

        const displayName = accessControlState.registeredUserNames ? accessControlState.registeredUserNames[userEmail] : '';
        const isBanned = accessControlState.bannedUsers.has(userEmail);
        const isAdminUser = (userEmail === 'dbaezh78@gmail.com');

        const selectOptions = groupKeys.map(gid => {
          const g = accessControlState.groups[gid];
          const isSel = (gid === currentGid) ? 'selected' : '';
          return `<option value="${g.id}" ${isSel}>${g.name}</option>`;
        }).join('');

        return `
          <div style="background: var(--panel-bg); border: 1px solid ${isBanned ? 'red' : 'var(--panel-border)'}; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <div>
                ${displayName ? `<div style="font-size: 0.85rem; font-weight: 700; color: var(--text-color);">${displayName}</div>` : ''}
                <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-color); word-break: break-all;">
                  ${userEmail}
                  ${isBanned ? `<span style="background: red; color: white; padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; margin-left: 6px; font-weight: 700;">BANEADO</span>` : ''}
                </div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">Grupo actual: <b>${accessControlState.groups[currentGid]?.name || currentGid}</b></div>
              </div>
              <div>
                ${isAdminUser 
                  ? `<span style="padding: 4px 10px; border-radius: 6px; border: 1px solid var(--panel-border); font-size: 0.78rem; background: rgba(0,0,0,0.03); color: var(--accent-color); font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🔒 Administradores</span>`
                  : `<select class="ac-change-user-group-select" data-email="${userEmail}" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--panel-border); font-size: 0.8rem; background: var(--panel-bg); color: var(--text-color);">
                      ${selectOptions}
                    </select>`}
              </div>
            </div>

            <!-- Botones de Acción para Hermano -->
            <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px dashed var(--panel-border); padding-top: 6px;">
              ${!isAdminUser ? `
                ${isBanned 
                  ? `<button class="ac-unban-user-btn" data-email="${userEmail}" style="background: none; border: none; color: #2e7d32; font-weight: 700; font-size: 0.75rem; cursor: pointer;">Desbanear</button>` 
                  : `<button class="ac-ban-user-btn" data-email="${userEmail}" style="background: none; border: none; color: #d32f2f; font-weight: 700; font-size: 0.75rem; cursor: pointer;">Banear</button>`}
                <button class="ac-delete-user-btn" data-email="${userEmail}" style="background: none; border: none; color: var(--text-muted); font-size: 0.75rem; cursor: pointer;">Eliminar Registro</button>
              ` : `<span style="font-size: 0.7rem; color: var(--accent-color); font-weight: 700;">Administrador Principal</span>`}
            </div>
          </div>
        `;
      }).join('');

      membersList.querySelectorAll('.ac-change-user-group-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
          const email = e.target.dataset.email;
          const newGid = e.target.value;
          await changeUserPrimaryGroup(email, newGid);
          alert(`El Hermano ${email} ha sido movido al grupo "${accessControlState.groups[newGid]?.name || newGid}".`);
          renderAccessControlUI();
        });
      });

      membersList.querySelectorAll('.ac-ban-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const email = e.target.dataset.email;
          if (confirm(`¿Seguro que deseas BANEAR al Hermano "${email}"? No podrá acceder a ningún contenido restringido.`)) {
            await banUser(email);
            renderAccessControlUI();
          }
        });
      });

      membersList.querySelectorAll('.ac-unban-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const email = e.target.dataset.email;
          if (confirm(`¿Deseas DESBANEAR al Hermano "${email}"?`)) {
            await unbanUser(email);
            renderAccessControlUI();
          }
        });
      });

      membersList.querySelectorAll('.ac-delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const email = e.target.dataset.email;
          if (confirm(`¿Seguro que deseas ELIMINAR PERMANENTEMENTE el registro del Hermano "${email}"?`)) {
            await deleteUserRecord(email);
            renderAccessControlUI();
          }
        });
      });
    }
  }

  // 3. Renderizar subpanel de permisos
  renderPermissionsPanel();
}

const PERMISSION_TREE = [
  { key: "*", label: "Acceso Total (* / Administrador)" },
  {
    key: "view_books",
    label: "Ver Libros de Cantos",
    children: [
      { key: "book_resucito", label: "Ver Libro Resucitó" },
      { key: "book_joven", label: "Ver Libro Canto Joven" },
      { key: "book_aclamaciones", label: "Ver Libro Aclamaciones" },
      { key: "book_salmodias", label: "Ver Libro Salmodias" },
      { key: "book_catequesis", label: "Ver Libro Catequesis" },
      { key: "book_favoritos", label: "Ver Favoritos" },
      { key: "book_extras", label: "Ver Libro Extras (Exclusivo)" }
    ]
  },
  {
    key: "control_canto",
    label: "Control Canto",
    children: [
      { key: "edit_chords", label: "Editar Digitaciones y Acordes" },
      { key: "edit_song_stages", label: "Etapas del Canto" }
    ]
  },

  {
    key: "view_settings_general",
    label: "Ajustes: General",
    children: [
      { key: "view_general_comun", label: "Gral Común" },
      { key: "view_general_cloud", label: "Cloud" }
    ]
  },
  {
    key: "view_settings_theme",
    label: "Ajustes: Tema",
    children: [
      {
        key: "view_theme_visual",
        label: "Tema Visual",
        children: [
          { key: "view_theme_func_barra", label: "Barra" },
          { key: "view_theme_func_canto", label: "Canto" },
          { key: "view_theme_func_libro", label: "Libro" },
          { key: "view_theme_func_etapa", label: "Etapa" },
          { key: "view_theme_func_botones", label: "Botones" },
          { key: "view_theme_func_navegador", label: "Navegador" }
        ]
      },
      { key: "view_theme_inicio", label: "Inicio" },
      { key: "view_theme_preparacion", label: "Preparación" },
      { key: "view_theme_perfil", label: "Perfil" }
    ]
  },
  { key: "view_settings_song_dup", label: "Ajustes: Canto", value: "view_settings_song" },
  {
    key: "view_settings_user",
    label: "Ajustes: Usuario",
    children: [
      {
        key: "manage_access",
        label: "Acceso",
        children: [
          { key: "view_access_miembros", label: "Miembros" },
          { key: "view_access_grupos", label: "Grupos" },
          { key: "view_access_miembros_internos", label: "Miembros Internos" },
          { key: "view_access_permisos", label: "Permisos" },
          { key: "view_access_inspector", label: "Inspector" }
        ]
      },
      { key: "view_user_cuenta", label: "Cuenta" },
      { key: "view_usage", label: "Uso App" }
    ]
  },
  { key: "view_settings_data", label: "Ajustes: Datos" },
  {
    key: "view_settings_log",
    label: "Ajustes: Log",
    children: [
      { key: "view_logs", label: "LOG" },
      { key: "view_status", label: "Estado Resucitó" }
    ]
  }
];

const expandedNodes = new Set();

function getNodeState(node, permissions) {
  const hasChildren = node.children && node.children.length > 0;
  if (!hasChildren) {
    const isChecked = permissions.has(node.value || node.key);
    return {
      allChecked: isChecked,
      anyChecked: isChecked
    };
  }

  let allChecked = true;
  let anyChecked = false;
  node.children.forEach(child => {
    const childState = getNodeState(child, permissions);
    if (!childState.allChecked) allChecked = false;
    if (childState.anyChecked) anyChecked = true;
  });

  return {
    allChecked,
    anyChecked
  };
}

function getSubtreePermissions(node) {
  let perms = [node.value || node.key];
  if (node.children) {
    node.children.forEach(child => {
      perms = perms.concat(getSubtreePermissions(child));
    });
  }
  return perms;
}

function buildTreeHtml(nodes, depth, group) {
  return nodes.map(node => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.key);
    const actualValue = node.value || node.key;
    
    let isChecked = false;
    let isIndeterminate = false;
    
    if (hasChildren) {
      const state = getNodeState(node, group.permissions);
      if (state.allChecked) {
        isChecked = true;
      } else if (state.anyChecked) {
        isChecked = true;
        isIndeterminate = true;
      }
    } else {
      isChecked = group.permissions.has(actualValue);
    }

    const toggleSign = hasChildren 
      ? `<span class="ac-tree-toggle material-symbols-outlined" data-key="${node.key}" style="font-size: 1.15rem; cursor: pointer; user-select: none; color: var(--accent-color); margin-right: 6px; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; background: rgba(0,0,0,0.03);">${isExpanded ? 'remove' : 'add'}</span>`
      : `<span style="width: 26px; display: inline-block;"></span>`;

    const paddingLeft = depth * 20;

    const childrenHtml = (hasChildren && isExpanded)
      ? `<div style="display: flex; flex-direction: column;">${buildTreeHtml(node.children, depth + 1, group)}</div>`
      : '';

    const checkboxStyle = `cursor: pointer; width: 16px; height: 16px; margin-left: 12px; accent-color: ${isIndeterminate ? '#2ec4b6' : 'var(--accent-color)'};`;

    return `
      <div class="ac-tree-row-container" style="display: flex; flex-direction: column;">
        <div class="ac-tree-row" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 12px 6px ${paddingLeft}px; border-bottom: 1px solid var(--panel-border); background: ${depth === 0 ? 'rgba(0,0,0,0.01)' : 'transparent'};">
          ${toggleSign}
          <label style="cursor: pointer; display: flex; align-items: center; flex: 1; margin: 0; padding: 4px 0;">
            <span style="font-size: 0.8rem; font-weight: ${depth === 0 ? '700' : depth === 1 ? '600' : '500'}; color: var(--text-color); flex: 1;">${node.label}</span>
            <input type="checkbox" class="ac-perm-checkbox" data-gid="${group.id}" data-key="${node.key}" data-perm="${actualValue}" ${isChecked ? 'checked' : ''} ${isIndeterminate ? 'data-indeterminate="true"' : ''} style="${checkboxStyle}">
          </label>
        </div>
        ${childrenHtml}
      </div>
    `;
  }).join('');
}

function renderPermissionsPanel() {
  const selectGroupPerm = document.getElementById('ac-select-group-perm');
  const containerCheckboxes = document.getElementById('ac-permissions-checkboxes');
  if (!selectGroupPerm || !containerCheckboxes) return;

  const currentGid = selectGroupPerm.value;
  if (!currentGid || !accessControlState.groups[currentGid]) {
    containerCheckboxes.innerHTML = '';
    return;
  }

  const group = accessControlState.groups[currentGid];

  containerCheckboxes.innerHTML = buildTreeHtml(PERMISSION_TREE, 0, group);

  containerCheckboxes.querySelectorAll('.ac-perm-checkbox[data-indeterminate="true"]').forEach(cb => {
    cb.indeterminate = true;
  });

  containerCheckboxes.querySelectorAll('.ac-tree-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.key;
      if (expandedNodes.has(key)) {
        expandedNodes.delete(key);
      } else {
        expandedNodes.add(key);
      }
      renderPermissionsPanel();
    });
  });

  containerCheckboxes.querySelectorAll('.ac-perm-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const gid = e.target.dataset.gid;
      const key = e.target.dataset.key;
      const isChecked = e.target.checked;
      
      const findNode = (nodes, targetKey) => {
        for (let n of nodes) {
          if (n.key === targetKey) return n;
          if (n.children) {
            const res = findNode(n.children, targetKey);
            if (res) return res;
          }
        }
        return null;
      };

      const targetNode = findNode(PERMISSION_TREE, key);
      if (targetNode) {
        const permsToToggle = getSubtreePermissions(targetNode);
        
        if (isChecked) {
          permsToToggle.forEach(p => group.permissions.add(p));

          const parentMap = {};
          const buildParentMap = (nodes, parent = null) => {
            nodes.forEach(node => {
              if (parent) {
                parentMap[node.key] = parent;
              }
              if (node.children) {
                buildParentMap(node.children, node);
              }
            });
          };
          buildParentMap(PERMISSION_TREE);

          let current = targetNode;
          while (current && parentMap[current.key]) {
            const parentNode = parentMap[current.key];
            const parentValue = parentNode.value || parentNode.key;
            group.permissions.add(parentValue);
            current = parentNode;
          }
        } else {
          permsToToggle.forEach(p => group.permissions.delete(p));

          const parentMap = {};
          const buildParentMap = (nodes, parent = null) => {
            nodes.forEach(node => {
              if (parent) {
                parentMap[node.key] = parent;
              }
              if (node.children) {
                buildParentMap(node.children, node);
              }
            });
          };
          buildParentMap(PERMISSION_TREE);

          let current = targetNode;
          while (current && parentMap[current.key]) {
            const parentNode = parentMap[current.key];
            const parentValue = parentNode.value || parentNode.key;
            
            const hasCheckedChild = parentNode.children.some(child => {
              const childVal = child.value || child.key;
              return group.permissions.has(childVal);
            });

            if (!hasCheckedChild) {
              group.permissions.delete(parentValue);
              current = parentNode;
            } else {
              break;
            }
          }
        }

        saveGroupConfigToCloud();
        renderPermissionsPanel();
      }
    });
  });
}

// --- Gestión de Formulario de Grupos (Crear / Editar) ---
let editingGroupGid = null;
let editingGroupOrigName = '';
let editingGroupOrigDesc = '';

export function resetGroupForm() {
  editingGroupGid = null;
  editingGroupOrigName = '';
  editingGroupOrigDesc = '';

  const titleEl = document.getElementById('ac-group-form-title');
  const inputId = document.getElementById('ac-group-id');
  const inputName = document.getElementById('ac-group-name');
  const inputDesc = document.getElementById('ac-group-desc');
  const btnSubmit = document.getElementById('ac-btn-create-group');
  const btnCancel = document.getElementById('ac-btn-cancel-group');
  const card = document.getElementById('ac-group-form-card');

  if (titleEl) titleEl.textContent = 'Crear Nuevo Grupo';
  if (inputId) {
    inputId.value = '';
    inputId.disabled = false;
    inputId.style.background = 'var(--panel-bg)';
    inputId.style.cursor = 'text';
  }
  if (inputName) inputName.value = '';
  if (inputDesc) inputDesc.value = '';

  if (btnSubmit) btnSubmit.textContent = 'Crear Grupo';
  if (btnCancel) btnCancel.style.display = 'none';

  if (card) {
    card.style.borderColor = 'var(--panel-border)';
    card.style.boxShadow = 'none';
  }
}

export function loadGroupIntoForm(gid) {
  const g = accessControlState.groups[gid];
  if (!g) return;

  editingGroupGid = gid;
  editingGroupOrigName = g.name || '';
  editingGroupOrigDesc = g.description || '';

  const titleEl = document.getElementById('ac-group-form-title');
  const inputId = document.getElementById('ac-group-id');
  const inputName = document.getElementById('ac-group-name');
  const inputDesc = document.getElementById('ac-group-desc');
  const btnSubmit = document.getElementById('ac-btn-create-group');
  const btnCancel = document.getElementById('ac-btn-cancel-group');
  const card = document.getElementById('ac-group-form-card');

  if (titleEl) titleEl.textContent = `Editar Grupo: ${g.name || gid}`;
  if (inputId) {
    inputId.value = gid;
    inputId.disabled = true;
    inputId.style.background = 'rgba(0,0,0,0.05)';
    inputId.style.cursor = 'not-allowed';
  }
  if (inputName) {
    inputName.value = editingGroupOrigName;
    setTimeout(() => inputName.focus(), 50);
  }
  if (inputDesc) inputDesc.value = editingGroupOrigDesc;

  if (btnSubmit) btnSubmit.textContent = 'Grabar';
  if (btnCancel) btnCancel.style.display = 'inline-block';

  if (card) {
    card.style.borderColor = 'var(--accent-color)';
    card.style.boxShadow = '0 0 0 2px var(--accent-glow, rgba(13, 110, 253, 0.25))';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export function handleCancelGroupForm() {
  if (editingGroupGid) {
    const inputName = document.getElementById('ac-group-name');
    const inputDesc = document.getElementById('ac-group-desc');
    const currentName = inputName ? inputName.value.trim() : '';
    const currentDesc = inputDesc ? inputDesc.value.trim() : '';

    if (currentName !== editingGroupOrigName || currentDesc !== editingGroupOrigDesc) {
      const save = confirm('Tienes cambios sin guardar. ¿Deseas guardar los cambios antes de salir?');
      if (save) {
        handleSaveGroupForm();
        return;
      }
    }
  }
  resetGroupForm();
}

export function handleSaveGroupForm() {
  const inputId = document.getElementById('ac-group-id');
  const inputName = document.getElementById('ac-group-name');
  const inputDesc = document.getElementById('ac-group-desc');

  if (editingGroupGid) {
    // Modo Edición
    const newName = inputName ? inputName.value.trim() : '';
    const newDesc = inputDesc ? inputDesc.value.trim() : '';

    if (!newName) {
      alert('Por favor ingresa un nombre para el grupo.');
      return;
    }

    updateGroup(editingGroupGid, newName, newDesc);
    resetGroupForm();
    renderAccessControlUI();
  } else {
    // Modo Creación
    if (!inputId || !inputId.value.trim()) {
      alert('Por favor ingresa un ID para el grupo.');
      return;
    }

    createGroup(inputId.value, inputName ? inputName.value : '', [], inputDesc ? inputDesc.value : '');
    resetGroupForm();
    renderAccessControlUI();
  }
}

export function renderSongStagesTable() {
  const tbody = document.getElementById('ac-song-stages-table-body');
  if (!tbody || !window.allSongs) return;
  
  const searchInput = document.getElementById('ac-assigned-stages-search');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  const customizedSongs = [];
  
  if (window.globalPositionsCache) {
    Object.keys(window.globalPositionsCache).forEach(songId => {
      const data = window.globalPositionsCache[songId];
      if (data && data.etapa !== undefined && data.etapa !== "0") {
        const songMeta = window.allSongs.find(s => s.id === songId);
        if (songMeta) {
          const matchesSearch = !query || 
                                songMeta.title.toLowerCase().includes(query) || 
                                (songMeta.dbno && songMeta.dbno.toString().includes(query));
          if (matchesSearch) {
            customizedSongs.push({
              id: songId,
              title: songMeta.title,
              dbno: songMeta.dbno,
              etapa: data.etapa
            });
          }
        }
      }
    });
  }
  
  customizedSongs.sort((a, b) => a.title.localeCompare(b.title));
  
  if (customizedSongs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 12px; color: var(--text-muted);">No hay cantos con etapa restringida que coincidan con la búsqueda.</td></tr>`;
    if (typeof window.updateAddSongStageButtonState === 'function') {
      window.updateAddSongStageButtonState();
    }
    return;
  }
  
  const stageOptions = [
    { value: "0", label: "Precatecumenado" },
    { value: "1", label: "Primer Escrutinio" },
    { value: "1.5", label: "SHEMA" },
    { value: "2", label: "Segundo Escrutinio" },
    { value: "3", label: "Iniciación a la Oración" },
    { value: "4", label: "Traditio Symboli" },
    { value: "5", label: "Redditio Symboli" },
    { value: "6", label: "Padre Nuestro" },
    { value: "7", label: "Elección" },
    { value: "8", label: "Renovación de las Promesas Bautismales" }
  ];
  
  tbody.innerHTML = customizedSongs.map(song => {
    const selectHtml = `<select class="ac-song-table-stage-select" data-song-id="${song.id}" style="padding: 4px; font-size: 0.85rem; border: 1px solid var(--panel-border); border-radius: 4px; background: var(--panel-bg); color: var(--text-color); width: 100%; outline: none;">
      ${stageOptions.map(opt => `<option value="${opt.value}" ${opt.value === song.etapa ? 'selected' : ''}>${opt.label}</option>`).join('')}
    </select>`;
    
    return `<tr style="border-bottom: 1px solid var(--panel-border);">
      <td style="padding: 8px;">#${song.dbno || 'S/N'} - <strong>${song.title}</strong></td>
      <td style="padding: 8px;">${selectHtml}</td>
      <td style="padding: 8px; text-align: center;">
        <button class="btn btn-icon ac-btn-remove-song-stage" data-song-id="${song.id}" style="width: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; color: red; background: none; border: none; cursor: pointer;" title="Eliminar restricción (volver a Precatecumenado)">
          <span class="material-symbols-outlined" style="font-size: 1.1rem;">delete</span>
        </button>
      </td>
    </tr>`;
  }).join('');
  
  tbody.querySelectorAll('.ac-song-table-stage-select').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const songId = sel.dataset.songId;
      const newStage = e.target.value;
      const docRef = doc(db, "global_positions", songId);
      try {
        await setDoc(docRef, { etapa: newStage }, { merge: true });
        console.log(`[Firebase] Actualizada etapa del canto ${songId} a ${newStage}`);
      } catch (err) {
        console.error("Error al actualizar la etapa:", err);
      }
    });
  });
  
  tbody.querySelectorAll('.ac-btn-remove-song-stage').forEach(btn => {
    btn.addEventListener('click', async () => {
      const songId = btn.dataset.songId;
      const docRef = doc(db, "global_positions", songId);
      try {
        await setDoc(docRef, { etapa: "0" }, { merge: true });
        console.log(`[Firebase] Eliminada restricción de etapa del canto ${songId}`);
      } catch (err) {
        console.error("Error al eliminar la etapa:", err);
      }
    });
  });

  if (typeof window.updateAddSongStageButtonState === 'function') {
    window.updateAddSongStageButtonState();
  }
}

export function updateAddSongStageButtonState() {
  const btn = document.getElementById('ac-btn-add-song-stage');
  const songSelect = document.getElementById('ac-stage-song-select');
  if (!btn || !songSelect) return;
  
  const songId = songSelect.value;
  let isAlreadyAssigned = false;
  if (songId && window.globalPositionsCache && window.globalPositionsCache[songId]) {
    const data = window.globalPositionsCache[songId];
    if (data.etapa !== undefined && data.etapa !== "0") {
      isAlreadyAssigned = true;
    }
  }
  
  btn.disabled = isAlreadyAssigned;
  if (isAlreadyAssigned) {
    btn.style.setProperty('background-color', '#ccc', 'important');
    btn.style.setProperty('color', '#666', 'important');
    btn.style.setProperty('border-color', '#ccc', 'important');
    btn.style.cursor = 'not-allowed';
  } else {
    btn.style.removeProperty('background-color');
    btn.style.removeProperty('color');
    btn.style.removeProperty('border-color');
    btn.style.cursor = '';
  }
}

// Inicializar módulo y escuchadores silenciosos en vivo con Firebase Cloud
initAccessControl();
listenToRegisteredUsersFromFirebase();
listenToGroupConfigFromFirebase();

window.hasPermission = hasPermission;
window.isCurrentUserAdmin = isCurrentUserAdmin;
window.renderSongStagesTable = renderSongStagesTable;
window.updateAddSongStageButtonState = updateAddSongStageButtonState;
