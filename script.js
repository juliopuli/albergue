import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// --- DETECCIÓN MODO PÚBLICO ---
let isPublicMode = false;
let currentAlbergueId = null;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) {
    isPublicMode = true;
    currentAlbergueId = urlParams.get('public_id');
}

// --- VARIABLES GLOBALES ---
let currentUserData = null; 
let currentAlbergueData = null;
let totalCapacidad = 0;
let ocupacionActual = 0;
let camasOcupadas = {};
let listaPersonasCache = [];

let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribePersonas, unsubscribeAlbergueDoc;

// Estado de UI
let personaSeleccionadaId = null;
let personaEnGestion = null;
let modoCambioCama = false;
let modoMapaGeneral = false;
let prefiliacionEdicionId = null;
let highlightedFamilyId = null;

// Listas Temporales
let listaFamiliaresTemp = [];
let adminFamiliaresTemp = [];
let userEditingId = null;
let albergueEdicionId = null;


// --- FUNCIONES DE UTILIDAD (PRIMER NIVEL) ---

// 1. Helpers
function safeVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function formatearFecha(i) {
    let v = i.value.replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`;
    else i.value = v;
}

function verificarMenor(p) {
    const t = document.getElementById(`${p}-tipo-doc`).value;
    const i = document.getElementById(`${p}-doc-num`);
    if (t === 'MENOR') {
        i.value = "MENOR-SIN-DNI";
        i.disabled = true;
    } else {
        i.disabled = false;
        if (i.value === "MENOR-SIN-DNI") i.value = "";
    }
}

function limpiarFormulario(p) {
    ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => {
        const el = document.getElementById(`${p}-${f}`);
        if (el) el.value = "";
    });
    const i = document.getElementById(`${p}-doc-num`);
    if (i) i.disabled = false;
}

function getDatosFormulario(p) {
    return {
        nombre: safeVal(`${p}-nombre`),
        ap1: safeVal(`${p}-ap1`),
        ap2: safeVal(`${p}-ap2`),
        tipoDoc: safeVal(`${p}-tipo-doc`),
        docNum: safeVal(`${p}-doc-num`),
        fechaNac: safeVal(`${p}-fecha`),
        telefono: safeVal(`${p}-tel`)
    };
}

// --- FUNCIONES CRÍTICAS DE NAVEGACIÓN ---

async function iniciarSesion() {
    try {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        alert("Error: " + e.message);
    }
}

function cerrarSesion() {
    signOut(auth);
    location.reload();
}

function navegar(p) {
    // Limpieza de escuchas
    if (unsubscribeUsers) unsubscribeUsers();
    if (unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    if (unsubscribeAlberguesMto) unsubscribeAlberguesMto();
    if (unsubscribePersonas) unsubscribePersonas();
    if (unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();

    // Ocultar todo
    ['screen-home', 'screen-usuarios', 'screen-gestion-albergues', 'screen-mantenimiento', 'screen-operativa', 'screen-observatorio'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });

    if (!currentUserData) return;
    const r = (currentUserData.rol || "").toLowerCase().trim();

    // Enrutamiento
    if (p === 'home') {
        document.getElementById('screen-home').classList.remove('hidden');
        document.getElementById('nav-home').classList.add('active');
    } else if (p === 'usuarios') {
        if (['super_admin', 'admin'].includes(r)) {
            document.getElementById('screen-usuarios').classList.remove('hidden');
            cargarUsuarios();
        }
    } else if (p === 'gestion-albergues') {
        if (['super_admin', 'admin', 'intervencion', 'filiacion'].includes(r)) {
            cargarAlberguesActivos();
            document.getElementById('screen-gestion-albergues').classList.remove('hidden');
            document.getElementById('nav-albergues').classList.add('active');
        }
    } else if (p === 'mantenimiento') {
        if (['super_admin', 'admin'].includes(r)) {
            cargarAlberguesMantenimiento();
            document.getElementById('screen-mantenimiento').classList.remove('hidden');
            document.getElementById('nav-mto').classList.add('active');
        }
    } else if (p === 'operativa') {
        document.getElementById('screen-operativa').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
        // NOTA: Configuración de tabs se hace en cargarDatosYEntrar
    } else if (p === 'observatorio') {
        if (['super_admin', 'admin', 'observador'].includes(r)) {
            cargarObservatorio();
            document.getElementById('screen-observatorio').classList.remove('hidden');
            document.getElementById('nav-obs').classList.add('active');
        }
    }

    // Actualizar menú activo visualmente
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (p.includes('albergue')) document.getElementById('nav-albergues').classList.add('active');
    else if (p.includes('obs')) document.getElementById('nav-obs').classList.add('active');
    else if (p.includes('mantenimiento')) document.getElementById('nav-mto').classList.add('active');
    else document.getElementById('nav-home').classList.add('active');
}

function configurarDashboard() {
    if(!currentUserData) return;
    const r = (currentUserData.rol || "").toLowerCase().trim();
    document.getElementById('user-name-display').innerText = currentUserData.nombre;
    document.getElementById('user-role-badge').innerText = r.toUpperCase();

    const btnUsers = document.getElementById('header-btn-users');
    const navMto = document.getElementById('nav-mto');
    const navObs = document.getElementById('nav-obs');
    const navGest = document.getElementById('nav-albergues');

    btnUsers.classList.add('hidden');
    navMto.classList.add('disabled');
    navObs.classList.add('hidden');
    navGest.classList.add('hidden');

    if (['super_admin', 'admin'].includes(r)) btnUsers.classList.remove('hidden');
    if (['super_admin', 'admin'].includes(r)) navMto.classList.remove('disabled');
    if (['super_admin', 'admin', 'observador'].includes(r)) navObs.classList.remove('hidden');
    if (r !== 'observador') navGest.classList.remove('hidden');

    if (r === 'super_admin') {
        const cont = document.getElementById('container-ver-ocultos');
        if(cont) cont.classList.remove('hidden');
    }
}

// --- LÓGICA DE ALBERGUES ---

async function cargarDatosYEntrar(id) {
    currentAlbergueId = id;
    // 1. Loading
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        // 2. Fetch Data
        const [docSnap, querySnap] = await Promise.all([
            getDoc(doc(db, "albergues", id)),
            getDocs(collection(db, "albergues", id, "personas"))
        ]);

        if (docSnap.exists()) {
            currentAlbergueData = docSnap.data();
            totalCapacidad = parseInt(currentAlbergueData.capacidad || 0);
        }

        listaPersonasCache = [];
        camasOcupadas = {};
        let c = 0;

        querySnap.forEach(d => {
            const p = d.data();
            p.id = d.id;
            listaPersonasCache.push(p);
            if (p.estado === 'ingresado') {
                c++;
                if (p.cama) camasOcupadas[p.cama] = p.nombre;
            }
        });

        // Sort
        try {
            listaPersonasCache.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0));
        } catch (e) {}

        ocupacionActual = c;

        // 3. Render
        navegar('operativa');
        document.getElementById('app-title').innerText = currentAlbergueData.nombre;
        
        // Re-apply dashboard config just in case
        configurarDashboard();
        
        actualizarContadores();

        const tab = configurarTabsPorRol();
        cambiarPestana(tab);

        // 4. Remove Loading
        document.getElementById('loading-overlay').classList.add('hidden');

        // 5. Connect Listeners
        conectarListenersBackground(id);

    } catch (e) {
        alert("Error cargando: " + e.message);
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

function conectarListenersBackground(id) {
    if (unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();
    unsubscribeAlbergueDoc = onSnapshot(doc(db, "albergues", id), d => {
        if (d.exists()) {
            currentAlbergueData = d.data();
            totalCapacidad = parseInt(currentAlbergueData.capacidad || 0);
            actualizarContadores();
        }
    });

    if (unsubscribePersonas) unsubscribePersonas();
    unsubscribePersonas = onSnapshot(collection(db, "albergues", id, "personas"), s => {
        listaPersonasCache = [];
        camasOcupadas = {};
        let c = 0;
        s.forEach(d => {
            const p = d.data();
            p.id = d.id;
            listaPersonasCache.push(p);
            if (p.estado === 'ingresado') {
                c++;
                if (p.cama) camasOcupadas[p.cama] = p.nombre;
            }
        });
        try { listaPersonasCache.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0)); } catch (e) {}
        ocupacionActual = c;
        actualizarContadores();

        // Refresh UI if managing someone
        if (personaEnGestion) {
            const upd = listaPersonasCache.find(x => x.id === personaEnGestion.id);
            if (upd) seleccionarPersona(upd);
        }
    });
}

function actualizarContadores() {
    document.getElementById('ocupacion-count').innerText = ocupacionActual;
    document.getElementById('capacidad-total').innerText = totalCapacidad;
}

function configurarTabsPorRol() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    });

    if (r === 'intervencion') {
        document.getElementById('btn-tab-pref').classList.add('hidden');
        document.getElementById('btn-tab-fil').classList.add('hidden');
        return 'sanitaria';
    } else if (r === 'filiacion') {
        document.getElementById('btn-tab-san').classList.add('hidden');
        document.getElementById('btn-tab-psi').classList.add('hidden');
        return 'prefiliacion';
    }
    return 'prefiliacion';
}

function cambiarPestana(t) {
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    const targetBtn = document.getElementById(`btn-tab-${t.substring(0,3)}`);
    if(targetBtn) targetBtn.classList.add('active');

    document.getElementById(`tab-${t}`).classList.remove('hidden');

    if (t === 'prefiliacion') {
        limpiarFormulario('man');
        adminFamiliaresTemp = [];
        actualizarListaFamiliaresAdminUI();
        document.getElementById('existing-family-list-ui').innerHTML = "";
        document.getElementById('panel-gestion-persona').classList.add('hidden');
        cancelarEdicionPref();
    } else if (t === 'filiacion') {
        document.getElementById('buscador-persona').value = "";
        document.getElementById('resultados-busqueda').classList.add('hidden');
        document.getElementById('panel-gestion-persona').classList.add('hidden');
    }
}

// --- LOGICA DE LISTAS DE ALBERGUES ---

function cargarAlberguesActivos() {
    const c = document.getElementById('lista-albergues-activos');
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db, "albergues"), where("activo", "==", true)), s => {
        c.innerHTML = "";
        s.forEach(async d => {
            const a = d.data();
            const div = document.createElement('div');
            div.className = "mto-card";
            div.innerHTML = `<h3>${a.nombre}</h3><div class="mto-info" id="info-${d.id}">Calculando...</div>`;
            div.onclick = () => cargarDatosYEntrar(d.id);
            c.appendChild(div);
            // Async count
            getDocs(query(collection(db, "albergues", d.id, "personas"), where("estado", "==", "ingresado")))
                .then(snap => {
                    const el = document.getElementById(`info-${d.id}`);
                    if (el) el.innerHTML = `Ocupación: <strong>${snap.size}</strong> / ${a.capacidad}`;
                });
        });
    });
}

// --- ASIGNACIÓN GLOBAL ---
// Esta es la parte más importante: pegamos las funciones al objeto window
window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;
window.navegar = navegar;
window.cargarDatosYEntrar = cargarDatosYEntrar;
window.safeVal = safeVal;
window.setVal = setVal;
window.formatearFecha = formatearFecha;
window.verificarMenor = verificarMenor;
window.limpiarFormulario = limpiarFormulario;
window.getDatosFormulario = getDatosFormulario;
window.actualizarContadores = actualizarContadores;
window.configurarTabsPorRol = configurarTabsPorRol;
window.cambiarPestana = cambiarPestana;
window.configurarDashboard = configurarDashboard;
window.limpiarListeners = limpiarListeners;

// --- FUNCIONES MAPA CAMAS ---
function mostrarGridCamas() {
    const g=document.getElementById('grid-camas'); g.innerHTML="";
    const cols = (currentAlbergueData && currentAlbergueData.columnas) ? currentAlbergueData.columnas : 8;
    g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
    let shadowMap={}; listaPersonasCache.forEach(p=>{if(p.familiaId)shadowMap[p.cama]=p.familiaId;});
    for(let i=1;i<=totalCapacidad;i++){
        const n=i.toString(); const occ=listaPersonasCache.find(p=>p.cama===n);
        const d=document.createElement('div'); d.className="bed-box "+(occ?"bed-busy":"bed-free"); d.innerText=n;
        if(occ) d.innerHTML += `<div style="font-size:0.6em">${occ.nombre}</div>`;
        d.onclick=()=>{ if(occ && !modoMapaGeneral){ window.abrirModalInfoCama(occ); } else if(!occ && !modoMapaGeneral){ window.guardarCama(n); } };
        d.ondblclick=()=>{ if(occ) window.abrirModalInfoCama(occ); };
        g.appendChild(d);
    }
    document.getElementById('modal-cama').classList.remove('hidden');
}
window.mostrarGridCamas = mostrarGridCamas;
window.abrirMapaGeneral = () => { modoMapaGeneral=true; mostrarGridCamas(); };
window.abrirSeleccionCama = () => { modoMapaGeneral=false; mostrarGridCamas(); };
window.cerrarMapaCamas = () => { highlightedFamilyId = null; document.getElementById('modal-cama').classList.add('hidden'); };
window.guardarCama = async function (c) { if (personaEnGestion.cama) { alert(`Error: Ya tiene cama.`); return; } await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id), { estado: 'ingresado', cama: c.toString(), fechaIngreso: new Date() }); registrarLog(personaEnGestion.id, "Asignación Cama", `Cama ${c}`); cerrarMapaCamas(); }
window.abrirModalInfoCama = (p) => { document.getElementById('info-cama-num').innerText=p.cama; document.getElementById('info-nombre-completo').innerText=p.nombre; document.getElementById('modal-bed-info').classList.remove('hidden'); };

// --- RESTO DE FUNCIONES DEL SISTEMA ---
window.cargarAlberguesActivos = cargarAlberguesActivos;
window.registrarLog = registrarLog;
window.verHistorial = verHistorial;
window.verHistorialObservatorio = (albId, pId) => { window.verHistorial(pId, albId); };

// ... (Rest of maintenance and user functions similar to above, explicit define then attach)
// Por brevedad, incluyo las esenciales que fallaban en la V9:
window.cargarAlberguesMantenimiento = () => {
    const c = document.getElementById('mto-container');
    const r = (currentUserData.rol || "").toLowerCase().trim();
    const isSuper = (r === 'super_admin');
    unsubscribeAlberguesMto = onSnapshot(query(collection(db, "albergues")), s => {
        c.innerHTML = "<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";
        s.forEach(d => {
            const a = d.data();
            let extraBtn = isSuper ? `<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}', ${!a.activo})">${a.activo === false ? 'Activar' : 'Archivar'}</button>` : "";
            c.innerHTML += `<div class="mto-card ${!a.activo ? 'archived' : ''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`;
        });
    });
};
window.abrirModalAlbergue = async (id = null) => {
    albergueEdicionId = id;
    document.getElementById('modal-albergue').classList.remove('hidden');
    const b = document.getElementById('btn-delete-albergue');
    if (id) {
        const s = await getDoc(doc(db, "albergues", id));
        const d = s.data();
        setVal('mto-nombre', d.nombre); setVal('mto-capacidad', d.capacidad); setVal('mto-columnas', d.columnas);
        if (currentUserData.rol === 'super_admin') b.classList.remove('hidden'); else b.classList.add('hidden');
    } else {
        setVal('mto-nombre', ""); setVal('mto-capacidad', ""); b.classList.add('hidden');
    }
};
window.guardarAlbergue = async () => {
    const n = safeVal('mto-nombre'), c = safeVal('mto-capacidad'), col = safeVal('mto-columnas');
    if (!n || !c) return alert("Datos inc.");
    if (albergueEdicionId) await updateDoc(doc(db, "albergues", albergueEdicionId), { nombre: n, capacidad: parseInt(c), columnas: parseInt(col) });
    else await addDoc(collection(db, "albergues"), { nombre: n, capacidad: parseInt(c), columnas: parseInt(col), activo: true });
    document.getElementById('modal-albergue').classList.add('hidden');
};

// --- INITIALIZATION ---
window.onload = () => {
    // Check Public Mode Immediately
    const p = new URLSearchParams(window.location.search);
    if(p.get('public_id')){
        isPublicMode = true; 
        currentAlbergueId = p.get('public_id');
        initPublicMode();
    } else {
        const passInput = document.getElementById('login-pass');
        if(passInput) passInput.addEventListener('keypress', e=>{ if(e.key==='Enter') window.iniciarSesion(); });
    }
};

async function initPublicMode() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('public-register-screen').classList.remove('hidden');
    document.getElementById('public-welcome-screen').classList.remove('hidden');
    document.getElementById('public-form-container').classList.add('hidden');
    try {
        const snap = await getDoc(doc(db, "albergues", currentAlbergueId));
        if (snap.exists()) document.getElementById('public-albergue-name').innerText = snap.data().nombre;
    } catch(e) { console.log(e); }
}

onAuthStateChanged(auth, async (u) => {
    if (isPublicMode) return;
    if (u) {
        const s = await getDoc(doc(db, "usuarios", u.uid));
        if (s.exists()) {
            currentUserData = { ...s.data(), uid: u.uid };
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-shell').classList.remove('hidden');
            configurarDashboard();
            navegar('home');
        }
    } else {
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
});
