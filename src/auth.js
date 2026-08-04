// src/auth.js - Módulo de autenticación y roles de usuario real con Firebase

import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged as onFirebaseAuthStateChanged 
} from "./firebase.js";

// Lista de correos con privilegios de administrador
const ADMIN_EMAILS = ['dbaezh78@gmail.com'];

let currentUser = null;
const authStateListeners = [];

// Escuchar cambios reales de Firebase Auth
onFirebaseAuthStateChanged(auth, (user) => {
  currentUser = user;
  notifyListeners();
});

export function getCurrentUser() {
  return currentUser;
}

export function isCurrentUserAdmin() {
  if (!currentUser || !currentUser.email) return false;
  return ADMIN_EMAILS.includes(currentUser.email.toLowerCase().trim());
}

export function onAuthStateChanged(callback) {
  authStateListeners.push(callback);
  // Llamar inmediatamente con el estado actual del usuario
  callback(currentUser);
}

function notifyListeners() {
  authStateListeners.forEach(callback => callback(currentUser));
}

// Iniciar sesión real con Google Popup
export async function loginConGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("Usuario identificado en Firebase:", result.user.displayName);
    return result.user;
  } catch (error) {
    console.error("Error al autenticar con Firebase:", error);
    throw error;
  }
}

// Cerrar sesión real con Firebase
export async function logout() {
  try {
    await signOut(auth);
    console.log("Sesión cerrada de Firebase");
  } catch (error) {
    console.error("Error al cerrar sesión de Firebase:", error);
    throw error;
  }
}

// Compatibilidad con main.js
export const loginMock = loginConGoogle;
export const logoutMock = logout;
