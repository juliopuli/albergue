import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// --- 1. DETECCIÓN PÚBLICA INMEDIATA ---
let isPublicMode = false;
let currentAlbergueId = null;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) {
    isPublicMode = true;
    currentAlbergueId = urlParams.get('public_id');
    window.log("Modo público detectado. ID: " + currentAlbergueId);
}

// --- 2. GLOBALES ---
let currentUserData = null;
let currentAlbergueData = null;
let totalCapacidad = 0;
let ocupacionActual = 0;
let camasOcupadas = {};
let listaPersonasCache = [];

let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribePersonas, unsubscribeAlbergueDoc;

let personaSeleccionadaId = null;
let personaEnGestion = null;
let modoCambioCama = false;
let modoMapaGeneral = false;
let prefiliacionEdicionId = null;
let highlightedFamilyId = null;

let listaFamiliaresTemp = [];
let adminFamiliaresTemp = [];
let userEditingId = null;
let albergueEdicionId = null;

// --- 3. UTILIDADES ---
function safeVal(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

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
        nombre: safeVal(`${p}-nombre`), ap1: safeVal(`${p}-ap1`), ap2: safeVal(`${p}-ap2`),
        tipoDoc: safeVal(`${p}-tipo-doc`), docNum: safeVal(`${p}-doc-num`), fechaNac: safeVal(`${p}-fecha`), telefono: safeVal(`${p}-tel`)
    };
}

function actualizarContadores() {
    const elOcc = document.getElementById('ocupacion-count');
    const elCap = document.getElementById('capacidad-total');
    if (elOcc) elOcc.innerText = ocupacionActual;
    if (elCap) elCap.innerText = totalCapacidad;
}

// --- 4. LÓGICA QR PÚBLICA ---
function actualizarListaFamiliaresUI() {
    const d = document.getElementById('lista-familiares-ui'); d.innerHTML = "";
    if (listaFamiliaresTemp.length === 0) {
        d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>';
        return;
    }
    listaFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`;
    });
}

function borrarFamiliarTemp(i) {
    listaFamiliaresTemp.splice(i, 1);
    actualizarListaFamiliaresUI();
}

function abrirModalFamiliar() {
    limpiarFormulario('fam');
    document.getElementById('modal-add-familiar').classList.remove('hidden');
    document.getElementById('fam-tipo-doc').value = "MENOR";
    verificarMenor('fam');
}

function cerrarModalFamiliar() {
    document.getElementById('modal-add-familiar').classList.add('hidden');
}

function guardarFamiliarEnLista() {
    const d = getDatosFormulario('fam');
    if (!d.nombre) return alert("El nombre es obligatorio");
    listaFamiliaresTemp.push(d);
    actualizarListaFamiliaresUI();
    cerrarModalFamiliar();
}

async function publicoGuardarTodo() {
    const mainData = getDatosFormulario('pub');
    if (!mainData.nombre) return alert("Nombre titular obligatorio.");
    if (!currentAlbergueId) return alert("Error ID Albergue");

    try {
        const fid = new Date().getTime().toString();
        const b = writeBatch(db);

        const tRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
        b.set(tRef, { ...mainData, familiaId: fid, rolFamilia: 'TITULAR', estado: 'espera', fechaRegistro: new Date() });
        
        // Log manual here since registrarLog uses currentUser
        const logRef = collection(db, "albergues", currentAlbergueId, "personas", tRef.id, "historial");
        await addDoc(logRef, { fecha: new Date(), usuario: "Auto-QR", accion: "Auto-Registro QR", detalle: "Titular" });

        listaFamiliaresTemp.forEach(async f => {
            const fRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
            b.set(fRef, { ...f, familiaId: fid, rolFamilia: 'MIEMBRO', estado: 'espera', fechaRegistro: new Date() });
             // Log for family
             const fLogRef = collection(db, "albergues", currentAlbergueId, "personas", fRef.id, "historial");
             await addDoc(fLogRef, { fecha: new Date(), usuario: "Auto-QR", accion: "Auto-Registro QR", detalle: "Familiar" });
        });

        await b.commit();
        document.getElementById('public-form-container').classList.add('hidden');
        document.getElementById('public-success-msg').classList.remove('hidden');

    } catch(e) {
        alert("Error: " + e.message);
        window.log("Error guardando QR: " + e.message, "error");
    }
}

// --- 5. LÓGICA ADMIN (FAMILIA) ---
function actualizarListaFamiliaresAdminUI() {
    const d = document.getElementById('admin-lista-familiares-ui');
    d.innerHTML = "";
    if (adminFamiliaresTemp.length === 0) {
        d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno.</p>';
        return;
    }
    adminFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`;
    });
}

function borrarFamiliarAdminTemp(i) {
    adminFamiliaresTemp.splice(i, 1);
    actualizarListaFamiliaresAdminUI();
}

function abrirModalFamiliarAdmin() {
    limpiarFormulario('adm-fam');
    document.getElementById('modal-admin-add-familiar').classList.remove('hidden');
    document.getElementById('adm-fam-tipo-doc').value = "MENOR";
    verificarMenor('adm-fam');
}

function cerrarModalFamiliarAdmin() {
    document.getElementById('modal-admin-add-familiar').classList.add('hidden');
}

function guardarFamiliarAdmin() {
    const d = getDatosFormulario('adm-fam');
    if (!d.nombre) return alert("Nombre obligatorio");
    adminFamiliaresTemp.push(d);
    actualizarListaFamiliaresAdminUI();
    cerrarModalFamiliarAdmin();
}

// --- 6. CORE APP (LOGIN, NAV) ---

async function iniciarSesion() {
    try {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        window.log("Login Error: " + e.message, "error");
        alert("Error: " + e.message);
    }
}

function cerrarSesion() {
    signOut(auth);
    location.reload();
}

function navegar(p) {
    try {
        if (unsubscribeUsers) unsubscribeUsers();
        if (unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
        if (unsubscribeAlberguesMto) unsubscribeAlberguesMto();
        if (unsubscribePersonas) unsubscribePersonas();
        if (unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();

        ['screen-home', 'screen-usuarios', 'screen-gestion-albergues', 'screen-mantenimiento', 'screen-operativa', 'screen-observatorio'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });

        if (!currentUserData) return;
        const r = (currentUserData.rol || "").toLowerCase().trim();

        if (p === 'home') {
            document.getElementById('screen-home').classList.remove('hidden');
            document.getElementById('nav-home').classList.add('active');
        } else if (p === 'gestion-albergues') {
            cargarAlberguesActivos();
            document.getElementById('screen-gestion-albergues').classList.remove('hidden');
        } else if (p === 'mantenimiento') {
            cargarAlberguesMantenimiento();
            document.getElementById('screen-mantenimiento').classList.remove('hidden');
        } else if (p === 'operativa') {
            document.getElementById('screen-operativa').classList.remove('hidden');
            const t = configurarTabsPorRol();
            cambiarPestana(t);
        } else if (p === 'observatorio') {
            cargarObservatorio();
            document.getElementById('screen-observatorio').classList.remove('hidden');
        } else if (p === 'usuarios') {
            cargarUsuarios();
            document.getElementById('screen-usuarios').classList.remove('hidden');
        }

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        if (p.includes('albergue')) document.getElementById('nav-albergues').classList.add('active');
        else if (p.includes('obs')) document.getElementById('nav-obs').classList.add('active');
        else if (p.includes('mantenimiento')) document.getElementById('nav-mto').classList.add('active');
        else document.getElementById('nav-home').classList.add('active');
    } catch(e) {
        window.log("Error navegando: " + e.message, "error");
    }
}

function configurarDashboard() {
    if (!currentUserData) return;
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
    if (r === 'super_admin') document.getElementById('container-ver-ocultos').classList.remove('hidden');
}

// --- 7. CARGA DE DATOS ---
async function cargarDatosYEntrar(id) {
    currentAlbergueId = id;
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
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

        try { listaPersonasCache.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0)); } catch (e) { }
        ocupacionActual = c;

        navegar('operativa');
        document.getElementById('app-title').innerText = currentAlbergueData.nombre;
        
        configurarDashboard(); 
        actualizarContadores();

        const tab = configurarTabsPorRol();
        cambiarPestana(tab);

        document.getElementById('loading-overlay').classList.add('hidden');
        conectarListenersBackground(id);

    } catch (e) {
        window.log("Error cargando albergue: " + e.message, "error");
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
        try { listaPersonasCache.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0)); } catch (e) { }
        ocupacionActual = c;
        actualizarContadores();

        if (personaEnGestion) {
            const upd = listaPersonasCache.find(x => x.id === personaEnGestion.id);
            if (upd) selectingPersona(upd);
        }
    });
}

function selectingPersona(p) {
    if (!p) return;
    personaEnGestion = p;
    document.getElementById('resultados-busqueda').classList.add('hidden');
    document.getElementById('panel-gestion-persona').classList.remove('hidden');
    document.getElementById('gestion-nombre-titulo').innerText = p.nombre;
    document.getElementById('gestion-estado').innerText = p.estado.toUpperCase();
    document.getElementById('gestion-cama-info').innerText = p.cama ? `Cama: ${p.cama}` : "";
    setVal('edit-nombre', p.nombre); setVal('edit-ap1', p.ap1); setVal('edit-ap2', p.ap2);
    setVal('edit-tipo-doc', p.tipoDoc); setVal('edit-doc-num', p.docNum);
    setVal('edit-fecha', p.fechaNac); setVal('edit-tel', p.telefono);
    
    const r = (currentUserData.rol || "").toLowerCase().trim();
    const btnH = document.getElementById('btn-historial-ficha');
    if (['admin', 'super_admin'].includes(r)) btnH.classList.remove('hidden'); else btnH.classList.add('hidden');

    const flist = document.getElementById('info-familia-lista'); flist.innerHTML = "";
    const fam = listaPersonasCache.filter(x => x.familiaId && x.familiaId === p.familiaId);
    document.getElementById('info-familia-resumen').innerText = fam.length > 1 ? `Familia (${fam.length})` : "Individual";
    fam.forEach(f => {
        if (f.id !== p.id) {
            const st = f.estado === 'ingresado' ? 'color:var(--success);' : 'color:var(--warning);';
            const ic = f.estado === 'ingresado' ? 'fa-solid fa-bed' : 'fa-solid fa-clock';
            flist.innerHTML += `<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.seleccionarPersona('${f.id}')">
                <div><div style="font-weight:bold;font-size:0.95rem;">${f.nombre} ${f.ap1 || ''}</div>
                <div style="font-size:0.85rem;color:#666;"><i class="fa-regular fa-id-card"></i> ${f.docNum || '-'} &nbsp;|&nbsp; <i class="fa-solid fa-phone"></i> ${f.telefono || '-'}</div></div>
                <div style="font-size:1.2rem;${st}"><i class="${ic}"></i></div>
            </div>`;
        }
    });
}
window.seleccionarPersona = (pid) => {
    if (typeof pid !== 'string') pid = pid.id;
    const p = listaPersonasCache.find(x => x.id === pid);
    selectingPersona(p);
}

// --- OTROS COMPONENTES ---

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
    window.log("App iniciada. Modo público: " + isPublicMode);
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
    } catch(e) { window.logError(e.message); }
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

// ADD MISSING EXPORTS
window.actualizarListaFamiliaresUI = actualizarListaFamiliaresUI;
window.borrarFamiliarTemp = borrarFamiliarTemp;
window.abrirModalFamiliar = abrirModalFamiliar;
window.cerrarModalFamiliar = cerrarModalFamiliar;
window.guardarFamiliarEnLista = guardarFamiliarEnLista;
window.publicoGuardarTodo = publicoGuardarTodo;
window.actualizarListaFamiliaresAdminUI = actualizarListaFamiliaresAdminUI;
window.borrarFamiliarAdminTemp = borrarFamiliarAdminTemp;
window.abrirModalFamiliarAdmin = abrirModalFamiliarAdmin;
window.cerrarModalFamiliarAdmin = cerrarModalFamiliarAdmin;
window.guardarFamiliarAdmin = guardarFamiliarAdmin;
window.abrirModalVincularFamilia = abrirModalVincularFamilia;
window.buscarParaVincular = buscarParaVincular;
window.vincularAFamilia = vincularAFamilia;
window.buscarEnPrefiliacion = buscarEnPrefiliacion;
window.cargarParaEdicionPref = cargarParaEdicionPref;
window.cancelarEdicionPref = cancelarEdicionPref;
window.adminPrefiliarManual = adminPrefiliarManual;
window.buscarPersonaEnAlbergue = buscarPersonaEnAlbergue;
window.guardarCambiosPersona = guardarCambiosPersona;
window.eliminarAlbergueActual = eliminarAlbergueActual;
window.cambiarEstadoAlbergue = cambiarEstadoAlbergue;
window.abrirModalCambioPass = abrirModalCambioPass;
window.ejecutarCambioPass = ejecutarCambioPass;
window.cargarUsuarios = cargarUsuarios;
window.filtrarUsuarios = filtrarUsuarios;
window.abrirModalUsuario = abrirModalUsuario;
window.guardarUsuario = guardarUsuario;
window.eliminarUsuario = eliminarUsuario;
window.abrirModalQR = abrirModalQR;
window.liberarCamaMantener = async () => await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id), { cama: null });
window.regresarPrefiliacion = async () => await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id), { estado: 'espera', cama: null });
window.toggleStartButton = () => document.getElementById('btn-start-public').disabled = !document.getElementById('check-consent').checked;
window.iniciarRegistro = () => { document.getElementById('public-welcome-screen').classList.add('hidden'); document.getElementById('public-form-container').classList.remove('hidden'); };
