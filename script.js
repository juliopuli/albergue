import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// --- DETECCIÓN INSTANTÁNEA DE MODO PÚBLICO (V.10.3.0) ---
let isPublicMode = false;
let currentAlbergueId = null;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) {
    isPublicMode = true;
    currentAlbergueId = urlParams.get('public_id');
}

// --- 1. VARIABLES GLOBALES ---
let currentUserData=null; 
let currentAlbergueData=null, totalCapacidad=0, ocupacionActual=0, camasOcupadas={}, listaPersonasCache=[];
let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribePersonas, unsubscribeAlbergueDoc;
let personaSeleccionadaId=null; let personaEnGestion=null; let modoCambioCama=false; let modoMapaGeneral=false;
let listaFamiliaresTemp=[], adminFamiliaresTemp=[], userEditingId=null, albergueEdicionId=null;
let prefiliacionEdicionId = null;
let highlightedFamilyId = null;


// --- 2. UTILIDADES BÁSICAS ---
function safeVal(id){ const el=document.getElementById(id); return el?el.value:""; }
function setVal(id,val){ const el=document.getElementById(id); if(el)el.value=val; }

function formatearFecha(i){ let v=i.value.replace(/\D/g,'').slice(0,8);if(v.length>=5)i.value=`${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;else if(v.length>=3)i.value=`${v.slice(0,2)}/${v.slice(2)}`;else i.value=v; }
function verificarMenor(p){ 
    const t=document.getElementById(`${p}-tipo-doc`).value;
    const i=document.getElementById(`${p}-doc-num`);
    if(t==='MENOR'){ i.value="MENOR-SIN-DNI"; i.disabled=true; }
    else{ i.disabled=false; if(i.value==="MENOR-SIN-DNI")i.value=""; }
}

function limpiarFormulario(p){
    ['nombre','ap1','ap2','doc-num','fecha','tel'].forEach(f=>{ const el=document.getElementById(`${p}-${f}`); if(el)el.value=""; });
    const i=document.getElementById(`${p}-doc-num`); if(i)i.disabled=false;
}

function getDatosFormulario(p) {
    return {
        nombre: safeVal(`${p}-nombre`), ap1: safeVal(`${p}-ap1`), ap2: safeVal(`${p}-ap2`),
        tipoDoc: safeVal(`${p}-tipo-doc`), docNum: safeVal(`${p}-doc-num`), fechaNac: safeVal(`${p}-fecha`), telefono: safeVal(`${p}-tel`)
    };
}

function actualizarContadores(){
    document.getElementById('ocupacion-count').innerText = ocupacionActual;
    document.getElementById('capacidad-total').innerText = totalCapacidad;
}

// --- 3. LÓGICA QR PÚBLICA ---
function actualizarListaFamiliaresUI() {
    const d = document.getElementById('lista-familiares-ui'); d.innerHTML = "";
    if (listaFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>'; return; }
    listaFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`;
    });
}
function borrarFamiliarTemp(i) { listaFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresUI(); }
function abrirModalFamiliar() { limpiarFormulario('fam'); document.getElementById('modal-add-familiar').classList.remove('hidden'); document.getElementById('fam-tipo-doc').value="MENOR"; verificarMenor('fam'); }
function cerrarModalFamiliar() { document.getElementById('modal-add-familiar').classList.add('hidden'); }
function guardarFamiliarEnLista() { const d=getDatosFormulario('fam'); if(!d.nombre) return alert("Nombre obligatorio"); listaFamiliaresTemp.push(d); actualizarListaFamiliaresUI(); cerrarModalFamiliar(); }

async function publicoGuardarTodo() {
    const mainData = getDatosFormulario('pub');
    if(!mainData.nombre) return alert("Nombre titular obligatorio.");
    if(!currentAlbergueId) return alert("Error ID Albergue");
    try {
        const fid = new Date().getTime().toString(); const b = writeBatch(db);
        const tRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
        b.set(tRef, { ...mainData, familiaId: fid, rolFamilia: 'TITULAR', estado: 'espera', fechaRegistro: new Date() });
        registrarLog(tRef.id, "Auto-Registro QR", "Titular");
        listaFamiliaresTemp.forEach(f => {
            const fRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
            b.set(fRef, { ...f, familiaId: fid, rolFamilia: 'MIEMBRO', estado: 'espera', fechaRegistro: new Date() });
            registrarLog(fRef.id, "Auto-Registro QR", "Familiar");
        });
        await b.commit();
        document.getElementById('public-form-container').classList.add('hidden');
        document.getElementById('public-success-msg').classList.remove('hidden');
    } catch(e) { alert("Error: " + e.message); }
}

// --- 4. LÓGICA ADMIN Y NAVEGACIÓN ---
function actualizarListaFamiliaresAdminUI(){
    const d = document.getElementById('admin-lista-familiares-ui'); d.innerHTML = "";
    if (adminFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno.</p>'; return; }
    adminFamiliaresTemp.forEach((f, i) => { d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`; });
}
function borrarFamiliarAdminTemp(i) { adminFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresAdminUI(); }
function abrirModalFamiliarAdmin() { limpiarFormulario('adm-fam'); document.getElementById('modal-admin-add-familiar').classList.remove('hidden'); document.getElementById('adm-fam-tipo-doc').value="MENOR"; verificarMenor('adm-fam'); }
function cerrarModalFamiliarAdmin() { document.getElementById('modal-admin-add-familiar').classList.add('hidden'); }
function guardarFamiliarAdmin() { const d=getDatosFormulario('adm-fam'); if(!d.nombre) return alert("Nombre obligatorio"); adminFamiliaresTemp.push(d); actualizarListaFamiliaresAdminUI(); cerrarModalFamiliarAdmin(); }

function abrirModalVincularFamilia() { if(!personaEnGestion) return; document.getElementById('search-vincular').value=""; document.getElementById('resultados-vincular').innerHTML=""; document.getElementById('modal-vincular-familia').classList.remove('hidden'); }
function buscarParaVincular() {
    const t=document.getElementById('search-vincular').value.toLowerCase().trim(); const r=document.getElementById('resultados-vincular'); r.innerHTML="";
    if(t.length<2){r.classList.add('hidden');return;}
    const hits=listaPersonasCache.filter(p=>{ if(p.id===personaEnGestion.id)return false; return (p.nombre+" "+(p.ap1||"")).toLowerCase().includes(t); });
    if(hits.length===0){ r.innerHTML="<div class='search-item'>Sin resultados</div>"; }
    else { hits.forEach(p=>{ const d=document.createElement('div'); d.className='search-item'; d.innerHTML=`<strong>${p.nombre}</strong>`; d.onclick=()=>vincularAFamilia(p); r.appendChild(d); }); }
    r.classList.remove('hidden');
}
async function vincularAFamilia(target) {
    if(!confirm(`¿Unir a ${personaEnGestion.nombre} con ${target.nombre}?`)) return;
    let tid = target.familiaId; 
    if(!tid) { tid = new Date().getTime().toString()+"-F"; await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",target.id), {familiaId:tid, rolFamilia:'TITULAR'}); }
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id), {familiaId:tid, rolFamilia:'MIEMBRO'});
    alert("Vinculado"); document.getElementById('modal-vincular-familia').classList.add('hidden'); seleccionarPersona(personaEnGestion);
}

function configurarTabsPorRol() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.remove('hidden'); });
    if (r === 'intervencion') { document.getElementById('btn-tab-pref').classList.add('hidden'); document.getElementById('btn-tab-fil').classList.add('hidden'); return 'sanitaria'; }
    else if (r === 'filiacion') { document.getElementById('btn-tab-san').classList.add('hidden'); document.getElementById('btn-tab-psi').classList.add('hidden'); return 'prefiliacion'; }
    return 'prefiliacion';
}

function cambiarPestana(t) {
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.add('hidden'); });
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.remove('active'); });
    document.getElementById(`btn-tab-${t.substring(0,3)}`).classList.add('active');
    document.getElementById(`tab-${t}`).classList.remove('hidden');
    if (t === 'prefiliacion') {
        limpiarFormulario('man'); adminFamiliaresTemp=[]; actualizarListaFamiliaresAdminUI();
        document.getElementById('existing-family-list-ui').innerHTML=""; document.getElementById('panel-gestion-persona').classList.add('hidden'); cancelarEdicionPref();
    } else if(t === 'filiacion') {
        document.getElementById('buscador-persona').value=""; document.getElementById('resultados-busqueda').classList.add('hidden'); document.getElementById('panel-gestion-persona').classList.add('hidden');
    }
}

async function cargarDatosYEntrar(id) {
    currentAlbergueId = id;
    document.getElementById('loading-overlay').classList.remove('hidden');
    try {
        const [dS, qS] = await Promise.all([ getDoc(doc(db,"albergues",id)), getDocs(collection(db,"albergues",id,"personas")) ]);
        if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); }
        listaPersonasCache = []; camasOcupadas = {}; let c=0;
        qS.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
        ocupacionActual = c;
        navegar('operativa');
        document.getElementById('app-title').innerText = currentAlbergueData.nombre;
        configurarDashboard(); actualizarContadores();
        const t = configurarTabsPorRol(); cambiarPestana(t);
        document.getElementById('loading-overlay').classList.add('hidden');
        conectarListenersBackground(id);
    } catch(e) { alert(e.message); document.getElementById('loading-overlay').classList.add('hidden'); }
}

function conectarListenersBackground(id) {
    if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();
    unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); actualizarContadores(); } });
    if(unsubscribePersonas) unsubscribePersonas();
    unsubscribePersonas = onSnapshot(collection(db,"albergues",id,"personas"), s=>{
        listaPersonasCache=[]; camasOcupadas={}; let c=0;
        s.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
        ocupacionActual=c; actualizarContadores();
        if(personaEnGestion) { const u=listaPersonasCache.find(x=>x.id===personaEnGestion.id); if(u) seleccionarPersona(u); }
    });
}

function cargarAlberguesActivos() {
    const c = document.getElementById('lista-albergues-activos');
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const div=document.createElement('div'); div.className="mto-card";
            div.innerHTML=`<h3>${d.data().nombre}</h3><div class="mto-info">Entrar</div>`;
            div.onclick=()=>cargarDatosYEntrar(d.id);
            c.appendChild(div);
        });
    });
}

function navegar(p) {
    if(unsubscribeUsers) unsubscribeUsers(); if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    if(!currentUserData) return;
    if(p==='home') document.getElementById('screen-home').classList.remove('hidden');
    else if(p==='gestion-albergues') { cargarAlberguesActivos(); document.getElementById('screen-gestion-albergues').classList.remove('hidden'); }
    else if(p==='mantenimiento') { cargarAlberguesMantenimiento(); document.getElementById('screen-mantenimiento').classList.remove('hidden'); }
    else if(p==='operativa') { document.getElementById('screen-operativa').classList.remove('hidden'); const t = configurarTabsPorRol(); cambiarPestana(t); }
    else if(p==='observatorio') { cargarObservatorio(); document.getElementById('screen-observatorio').classList.remove('hidden'); }
    else if(p==='usuarios') { cargarUsuarios(); document.getElementById('screen-usuarios').classList.remove('hidden'); }
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(p.includes('albergue')) document.getElementById('nav-albergues').classList.add('active');
    else if(p.includes('obs')) document.getElementById('nav-obs').classList.add('active');
    else document.getElementById('nav-home').classList.add('active');
}

function configurarDashboard(){
    const r=(currentUserData.rol||"").toLowerCase();
    document.getElementById('user-name-display').innerText=currentUserData.nombre;
    document.getElementById('user-role-badge').innerText=r.toUpperCase();
    if(['super_admin','admin'].includes(r)) { document.getElementById('header-btn-users').classList.remove('hidden'); document.getElementById('nav-mto').classList.remove('disabled'); document.getElementById('nav-obs').classList.remove('hidden'); }
    if(r==='observador') document.getElementById('nav-obs').classList.remove('hidden');
}

function limpiarListeners() {
    if(unsubscribeUsers) unsubscribeUsers();
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    if(unsubscribeAlberguesMto) unsubscribeAlberguesMto();
    if(unsubscribePersonas) unsubscribePersonas();
    if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();
}

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

// --- EXPORT TO WINDOW ---
window.safeVal = safeVal;
window.setVal = setVal;
window.formatearFecha = formatearFecha;
window.verificarMenor = verificarMenor;
window.limpiarFormulario = limpiarFormulario;
window.getDatosFormulario = getDatosFormulario;
window.actualizarContadores = actualizarContadores;
window.actualizarListaFamiliaresUI = actualizarListaFamiliaresUI;
window.actualizarListaFamiliaresAdminUI = actualizarListaFamiliaresAdminUI;
window.configurarTabsPorRol = configurarTabsPorRol;
window.cambiarPestana = cambiarPestana;
window.configurarDashboard = configurarDashboard;
window.limpiarListeners = limpiarListeners;

window.borrarFamiliarTemp = borrarFamiliarTemp;
window.borrarFamiliarAdminTemp = borrarFamiliarAdminTemp;
window.abrirModalFamiliar = abrirModalFamiliar;
window.cerrarModalFamiliar = cerrarModalFamiliar;
window.guardarFamiliarEnLista = guardarFamiliarEnLista;
window.publicoGuardarTodo = publicoGuardarTodo;
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
window.seleccionarPersona = seleccionarPersona;
window.guardarCambiosPersona = guardarCambiosPersona;
window.abrirMapaGeneral = () => { modoMapaGeneral=true; mostrarGridCamas(); };
window.abrirSeleccionCama = () => { modoMapaGeneral=false; mostrarGridCamas(); };
window.cerrarMapaCamas = cerrarMapaCamas;
window.guardarCama = async (c) => { if(personaEnGestion.cama) return alert("Ya tiene cama"); await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id), {estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()}); registrarLog(personaEnGestion.id, "Asignación Cama", `Cama ${c}`); cerrarMapaCamas(); };
window.liberarCamaMantener = async () => await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id), {cama:null});
window.regresarPrefiliacion = async () => await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id), {estado:'espera',cama:null});
window.verHistorial = verHistorial;
window.registrarLog = registrarLog;
window.abrirModalAlbergue = async(id=null) => { albergueEdicionId=id; document.getElementById('modal-albergue').classList.remove('hidden'); if(id){ const s=await getDoc(doc(db,"albergues",id)); const d=s.data(); setVal('mto-nombre',d.nombre); setVal('mto-capacidad',d.capacidad); setVal('mto-columnas',d.columnas); } else { setVal('mto-nombre',""); setVal('mto-capacidad',""); } };
window.guardarAlbergue = async() => { const n=safeVal('mto-nombre'), c=safeVal('mto-capacidad'), col=safeVal('mto-columnas'); if(albergueEdicionId) await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)}); else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true}); document.getElementById('modal-albergue').classList.add('hidden'); };
window.eliminarAlbergueActual = async() => { if(albergueEdicionId && confirm("Borrar?")) await deleteDoc(doc(db,"albergues",albergueEdicionId)); };
window.cargarAlberguesMantenimiento = cargarAlberguesMantenimiento;
window.cargarObservatorio = cargarObservatorio;
window.verListaObservatorio = verListaObservatorio;
window.abrirModalUsuario = abrirModalUsuario;
window.guardarUsuario = guardarUsuario;
window.eliminarUsuario = eliminarUsuario;
window.filtrarUsuarios = filtrarUsuarios;
window.abrirModalCambioPass = abrirModalCambioPass;
window.ejecutarCambioPass = ejecutarCambioPass;
window.toggleStartButton = () => document.getElementById('btn-start-public').disabled = !document.getElementById('check-consent').checked;
window.iniciarRegistro = () => { document.getElementById('public-welcome-screen').classList.add('hidden'); document.getElementById('public-form-container').classList.remove('hidden'); };
window.iniciarSesion = async () => { try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value); } catch(e){ alert(e.message); } };
window.cerrarSesion = () => { signOut(auth); location.reload(); };
window.navegar = navegar;
window.cargarDatosYEntrar = cargarDatosYEntrar;
window.abrirModalQR = () => { document.getElementById('modal-qr').classList.remove('hidden'); new QRCode(document.getElementById("qrcode-display"), { text: window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`, width: 250, height: 250 }); };
window.conectarListenersBackground = conectarListenersBackground; // Exported to be called by cargarDatosYEntrar

// --- INIT (LAST) ---
window.onload = () => {
    if(isPublicMode){
        initPublicMode();
    } else {
        const passInput = document.getElementById('login-pass');
        if(passInput) passInput.addEventListener('keypress', e=>{ if(e.key==='Enter') window.iniciarSesion(); });
    }
};

onAuthStateChanged(auth, async (u) => {
    if(isPublicMode) return;
    if(u){
        const s = await getDoc(doc(db,"usuarios",u.uid));
        if(s.exists()){
            currentUserData = {...s.data(), uid: u.uid};
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

// Helper for map
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
window.abrirModalInfoCama = (p) => { document.getElementById('info-cama-num').innerText=p.cama; document.getElementById('info-nombre-completo').innerText=p.nombre; document.getElementById('modal-bed-info').classList.remove('hidden'); };
