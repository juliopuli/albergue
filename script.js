import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  orderBy,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

/* ---------------- FIREBASE ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI",
  authDomain: "albergues-temporales.firebaseapp.com",
  projectId: "albergues-temporales",
  storageBucket: "albergues-temporales.firebasestorage.app",
  messagingSenderId: "489999184108",
  appId: "1:489999184108:web:32b9b580727f83158075c9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- STATE ---------------- */
let currentUserData = null;
let currentAlbergueId = null;
let currentAlbergueData = null;
let totalCapacidad = 0;
let ocupacionActual = 0;
let camasOcupadas = {};
let listaPersonasCache = [];

let unsubscribeUsers = null;
let unsubscribeAlberguesActivos = null;
let unsubscribeAlberguesMto = null;
let unsubscribePersonas = null;
let unsubscribeAlbergueDoc = null;

window.personaEnGestion = null;
let listaFamiliaresTemp = [];
let userEditingId = null;
let albergueEdicionId = null;
let isPublicMode = false;

/* ---------------- INIT ---------------- */
window.onload = () => {
  const p = new URLSearchParams(window.location.search);
  if (p.get("public_id")) {
    isPublicMode = true;
    currentAlbergueId = p.get("public_id");
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-shell").classList.add("hidden");
    document.getElementById("public-register-screen").classList.remove("hidden");
  }
};

/* ---------------- AUTH ---------------- */
window.iniciarSesion = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("login-email").value,
      document.getElementById("login-pass").value
    );
  } catch (e) {
    alert(e.message);
  }
};

window.cerrarSesion = () => {
  signOut(auth);
  location.reload();
};

window.recuperarContrasena = async () => {
  const email = prompt("Email:");
  if (!email) return;
  try {
    await sendPasswordResetEmail(auth, email);
    alert("Correo enviado");
  } catch (e) {
    alert(e.message);
  }
};

onAuthStateChanged(auth, async (user) => {
  if (isPublicMode) return;

  if (user) {
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    if (snap.exists()) {
      currentUserData = { ...snap.data(), uid: user.uid };
      document.getElementById("login-screen").classList.add("hidden");
      document.getElementById("app-shell").classList.remove("hidden");
      configurarDashboard();
      navegar("home");
    }
  } else {
    document.getElementById("app-shell").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
  }
});

/* ---------------- DASHBOARD ---------------- */
function configurarDashboard() {
  document.getElementById("user-name-display").innerText = currentUserData.nombre;
  document.getElementById("user-role-badge").innerText = currentUserData.rol;

  if (["super_admin", "admin"].includes(currentUserData.rol)) {
    document.getElementById("header-btn-users").classList.remove("hidden");
  }
}

/* ---------------- NAV ---------------- */
window.navegar = (pantalla) => {
  ["screen-home", "screen-usuarios", "screen-gestion-albergues", "screen-mantenimiento", "screen-operativa"]
    .forEach(id => document.getElementById(id).classList.add("hidden"));

  if (pantalla !== "usuarios" && unsubscribeUsers) unsubscribeUsers();
  if (pantalla !== "gestion-albergues" && unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
  if (pantalla !== "mantenimiento" && unsubscribeAlberguesMto) unsubscribeAlberguesMto();

  document.getElementById(`screen-${pantalla}`).classList.remove("hidden");

  if (pantalla === "usuarios") cargarUsuarios();
  if (pantalla === "gestion-albergues") cargarAlberguesActivos();
  if (pantalla === "mantenimiento") cargarAlberguesMantenimiento();
};

/* ---------------- USUARIOS ---------------- */
window.abrirModalUsuario = async (id = null) => {
  userEditingId = id;
  document.getElementById("modal-crear-usuario").classList.remove("hidden");

  if (id) {
    const snap = await getDoc(doc(db, "usuarios", id));
    if (snap.exists()) {
      const d = snap.data();
      document.getElementById("new-user-name").value = d.nombre;
      document.getElementById("new-user-email").value = d.email;
      document.getElementById("new-user-role").value = d.rol;
    }
  }
};

window.guardarUsuario = async () => {
  const nombre = document.getElementById("new-user-name").value;
  const email = document.getElementById("new-user-email").value;
  const pass = document.getElementById("new-user-pass").value;
  const rol = document.getElementById("new-user-role").value;

  if (!nombre || !rol) return alert("Datos incompletos");

  if (userEditingId) {
    await updateDoc(doc(db, "usuarios", userEditingId), { nombre, rol });
  } else {
    if (!email || !pass) return alert("Email y contraseña obligatorios");

    let tempApp;
    try {
      tempApp = initializeApp(firebaseConfig, "TEMP_APP");
      const tempAuth = getAuth(tempApp);
      const cred = await createUserWithEmailAndPassword(tempAuth, email, pass);
      await setDoc(doc(db, "usuarios", cred.user.uid), { nombre, email, rol });
      await signOut(tempAuth);
    } finally {
      if (tempApp) await deleteApp(tempApp);
    }
  }

  document.getElementById("modal-crear-usuario").classList.add("hidden");
  cargarUsuarios();
};

window.cargarUsuarios = () => {
  const cont = document.getElementById("lista-usuarios-container");
  unsubscribeUsers = onSnapshot(query(collection(db, "usuarios"), orderBy("nombre")), snap => {
    cont.innerHTML = "";
    snap.forEach(d => {
      const u = d.data();
      cont.innerHTML += `
        <div class="list-item" onclick="abrirModalUsuario('${d.id}')">
          <strong>${u.nombre}</strong><br><small>${u.email}</small>
        </div>`;
    });
  });
};

/* ---------------- ALBERGUES ---------------- */
window.cargarAlberguesActivos = () => {
  const cont = document.getElementById("lista-albergues-activos");
  unsubscribeAlberguesActivos = onSnapshot(
    query(collection(db, "albergues"), where("activo", "==", true)),
    async snap => {
      cont.innerHTML = "";
      for (const d of snap.docs) {
        const a = d.data();
        const ps = await getDocs(
          query(collection(db, "albergues", d.id, "personas"), where("estado", "==", "ingresado"))
        );
        cont.innerHTML += `
          <div class="mto-card" onclick="entrarAlbergue('${d.id}')">
            <h3>${a.nombre}</h3>
            <p>${ps.size} / ${a.capacidad}</p>
          </div>`;
      }
    }
  );
};

/* ---------------- OPERATIVA ---------------- */
window.entrarAlbergue = (id) => {
  currentAlbergueId = id;
  if (unsubscribePersonas) unsubscribePersonas();
  if (unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();

  navegar("operativa");

  unsubscribeAlbergueDoc = onSnapshot(doc(db, "albergues", id), snap => {
    currentAlbergueData = snap.data();
    totalCapacidad = currentAlbergueData.capacidad;
    actualizarContadores();
  });

  unsubscribePersonas = onSnapshot(collection(db, "albergues", id, "personas"), snap => {
    listaPersonasCache = [];
    camasOcupadas = {};
    ocupacionActual = 0;

    snap.forEach(d => {
      const p = { ...d.data(), id: d.id };
      listaPersonasCache.push(p);
      if (p.estado === "ingresado") {
        ocupacionActual++;
        if (p.cama) camasOcupadas[p.cama] = p.nombre;
      }
    });
    actualizarContadores();
  });
};

function actualizarContadores() {
  document.getElementById("ocupacion-count").innerText = ocupacionActual;
  document.getElementById("capacidad-total").innerText = totalCapacidad;
}
