// src/firebase.js - Inicialización de Firebase SDK para la aplicación Resucito

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  getFirestore,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCnUXqn8MXgy00Bk1lb1D_n-pxlZmcJ124",
  authDomain: "cristoresucito.firebaseapp.com",
  projectId: "cristoresucito",
  storageBucket: "cristoresucito.firebasestorage.app",
  messagingSenderId: "558116648057",
  appId: "1:558116648057:web:15db4912b0a840daa7d0a8",
  measurementId: "G-ETSQBMPBEE"
};

// Inicializar la aplicación Firebase
const app = initializeApp(firebaseConfig);

// Obtener e inicializar Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Configurar e inicializar Firestore con caché persistente (habilitando uso sin conexión)
let dbTemp;
try {
  dbTemp = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
  console.log("🔥 Firestore offline persistence enabled.");
} catch (e) {
  console.warn("Failed to initialize Firestore with persistent cache, falling back:", e);
  dbTemp = getFirestore(app);
}

export const db = dbTemp;
export { doc, setDoc, getDoc, signInWithPopup, signOut, onAuthStateChanged };
