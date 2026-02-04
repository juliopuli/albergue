import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN FIREBASE ---
const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// --- VARIABLES GLOBALES ---
let isPublicMode = false;
let currentAlbergueId = null;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) { isPublicMode = true; currentAlbergueId = urlParams.get('public_id'); }

let currentUserData = null;
let currentAlbergueData = null;
let totalCapacidad = 0;
let ocupacionActual = 0;
let camasOcupadas = {};
let listaPersonasCache = []; 
let listaGlobalPrefiliacion = []; 
let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribePersonas, unsubscribeAlbergueDoc, unsubscribePool;

let personaSeleccionadaId = null;
let personaEnGestion = null;
let personaEnGestionEsGlobal = false;

let modoCambioCama = false;
let modoMapaGeneral = false;
let prefiliacionEdicionId = null;
let highlightedFamilyId = null;
let listaFamiliaresTemp = [];
let adminFamiliaresTemp = [];
let userEditingId = null;
let albergueEdicionId = null;
let isGlobalEdit = false; 

// ================================================================
// DECLARACIÓN DE FUNCIONES (HOISTING ACTIVO PARA EVITAR ERRORES)
// ================================================================

// --- SISTEMA DE LOGS Y ERRORES ---
function toggleCajaNegra() {
    const bb = document.getElementById('black-box-overlay');
    if (bb) bb.classList.toggle('hidden');
}

function limpiarCajaNegra() {
    const c = document.getElementById('black-box-content');
    if (c) c.innerHTML = "";
}

function sysLog(msg, type = 'info') {
    const c = document.getElementById('black-box-content');
    if (!c) { if(type==='error') console.error(msg); else console.log(msg); return; }
    
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    let cls = 'log-type-info';
    if(type === 'error') cls = 'log-type-error';
    if(type === 'warn') cls = 'log-type-warn';
    if(type === 'nav') cls = 'log-type-nav';

    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span class="log-time">[${time}]</span> <span class="${cls}">[${type.toUpperCase()}]</span> ${msg}`;
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
}

// --- UTILIDADES DOM ---
function el(id) { return document.getElementById(id); }
function safeHide(id) { const e = el(id); if(e) e.classList.add('hidden'); }
function safeShow(id) { const e = el(id); if(e) e.classList.remove('hidden'); }
function safeRemoveActive(id) { const e = el(id); if(e) e.classList.remove('active'); }
function safeAddActive(id) { const e = el(id); if(e) e.classList.add('active'); }
function safeVal(id) { const e = el(id); return e ? e.value : ""; }
function setVal(id, val) { const e = el(id); if (e) e.value = val; }

function formatearFecha(i) {
    let v = i.value.replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`;
    else i.value = v;
}

function verificarMenor(p) {
    const t = el(`${p}-tipo-doc`).value;
    const i = el(`${p}-doc-num`);
    if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; } 
    else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; }
}

function limpiarFormulario(p) {
    ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = el(`${p}-${f}`); if (e) e.value = ""; });
    const i = el(`${p}-doc-num`); if (i) i.disabled = false;
}

function getDatosFormulario(p) {
    return {
        nombre: safeVal(`${p}-nombre`), ap1: safeVal(`${p}-ap1`), ap2: safeVal(`${p}-ap2`),
        tipoDoc: safeVal(`${p}-tipo-doc`), docNum: safeVal(`${p}-doc-num`), 
        fechaNac: safeVal(`${p}-fecha`), telefono: safeVal(`${p}-tel`)
    };
}

function actualizarContadores() {
    const elOcc = el('ocupacion-count');
    const elCap = el('capacidad-total');
    if (elOcc) elOcc.innerText = ocupacionActual;
    if (elCap) elCap.innerText = totalCapacidad;
}

function showToast(msg) {
    const t = el('toast');
    if(t) { t.innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
}

// --- CORE: AUTH & NAV ---
async function iniciarSesion() {
    sysLog("Iniciando sesión...", "info");
    try {
        await signInWithEmailAndPassword(auth, el('login-email').value, el('login-pass').value);
        sysLog("Login correcto", "success");
    } catch(e) { sysLog(e.message, "error"); alert(e.message); }
}

function cerrarSesion() {
    sysLog("Cerrando sesión...", "warn");
    signOut(auth); location.reload();
}

function navegar(p) {
    sysLog(`Navegando a: ${p}`, "nav");
    if(unsubscribeUsers) unsubscribeUsers(); 
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio'].forEach(id=>safeHide(id));
    
    if(!currentUserData) return;
    
    if(p==='home') safeShow('screen-home');
    else if(p==='gestion-albergues') { cargarAlberguesActivos(); safeShow('screen-gestion-albergues'); }
    else if(p==='mantenimiento') { cargarAlberguesMantenimiento(); safeShow('screen-mantenimiento'); }
    else if(p==='operativa') { safeShow('screen-operativa'); const t = configurarTabsPorRol(); cambiarPestana(t); } 
    else if(p==='observatorio') { cargarObservatorio(); safeShow('screen-observatorio'); }
    else if(p==='usuarios') { cargarUsuarios(); safeShow('screen-usuarios'); }

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(p.includes('albergue')) safeAddActive('nav-albergues');
    else if(p.includes('obs')) safeAddActive('nav-obs');
    else if(p.includes('mantenimiento')) safeAddActive('nav-mto');
    else safeAddActive('nav-home');
}

function configurarDashboard() {
    const r=(currentUserData.rol||"").toLowerCase();
    if(el('user-name-display')) el('user-name-display').innerText=currentUserData.nombre;
    if(el('user-role-badge')) el('user-role-badge').innerText=r.toUpperCase();

    safeHide('header-btn-users'); safeAddActive('nav-mto'); safeHide('nav-obs'); safeHide('nav-albergues');

    if(['super_admin', 'admin'].includes(r)) { safeShow('header-btn-users'); if(el('nav-mto')) el('nav-mto').classList.remove('disabled'); }
    if(['super_admin','admin','observador'].includes(r)) safeShow('nav-obs');
    if(r !== 'observador') safeShow('nav-albergues');
    if(r==='super_admin') safeShow('container-ver-ocultos');
}

function configurarTabsPorRol() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => safeShow(id));
    if (r === 'intervencion') { safeHide('btn-tab-pref'); safeHide('btn-tab-fil'); return 'sanitaria'; }
    return 'filiacion';
}

function cambiarPestana(t) {
    sysLog(`Tab: ${t}`, "nav");
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => safeHide(id));
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => safeRemoveActive(id));
    safeAddActive(`btn-tab-${t.substring(0,3)}`);
    safeShow(`tab-${t}`);

    if (t === 'prefiliacion') {
        limpiarFormulario('man'); adminFamiliaresTemp = []; actualizarListaFamiliaresAdminUI();
        if(el('existing-family-list-ui')) el('existing-family-list-ui').innerHTML = ""; 
        cancelarEdicionPref();
        setupAutoSave();
    } else if (t === 'filiacion') {
        if(el('buscador-persona')) el('buscador-persona').value = ""; 
        safeHide('resultados-busqueda'); safeHide('panel-gestion-persona'); personaEnGestion = null;
    }
}

// --- DATA LOGIC ---
async function cargarDatosYEntrar(id) {
    currentAlbergueId = id;
    sysLog(`Cargando Albergue ${id}`, "info");
    safeShow('loading-overlay');
    try {
        const dS = await getDoc(doc(db,"albergues",id));
        if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); }
        
        if(unsubscribePersonas) unsubscribePersonas();
        unsubscribePersonas = onSnapshot(collection(db,"albergues",id,"personas"), s=>{
            listaPersonasCache=[]; camasOcupadas={}; let c=0;
            s.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
            ocupacionActual=c; actualizarContadores();
            if(personaEnGestion && !personaEnGestionEsGlobal) { 
                const u=listaPersonasCache.find(x=>x.id===personaEnGestion.id); 
                if(u) seleccionarPersona(u, false); 
            }
        });

        if(unsubscribePool) unsubscribePool();
        unsubscribePool = onSnapshot(collection(db, "pool_prefiliacion"), s => {
            listaGlobalPrefiliacion = [];
            s.forEach(d => { const p = d.data(); p.id = d.id; listaGlobalPrefiliacion.push(p); });
            sysLog(`Pool: ${listaGlobalPrefiliacion.length}`, "info");
        });

        navegar('operativa');
        if(el('app-title')) el('app-title').innerText = currentAlbergueData.nombre;
        configurarDashboard(); actualizarContadores(); safeHide('loading-overlay');
        conectarListenersBackground(id); setupAutoSave();
    } catch(e) { 
        sysLog(e.message, "error"); alert(e.message); safeHide('loading-overlay'); 
    }
}

function conectarListenersBackground(id) {
    if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();
    unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); actualizarContadores(); } });
}

function cargarAlberguesActivos() {
    const c = el('lista-albergues-activos');
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

function cargarAlberguesMantenimiento() {
    const c = el('mto-container');
    const r = (currentUserData.rol || "").toLowerCase().trim();
    const isSuper = (r === 'super_admin');
    unsubscribeAlberguesMto = onSnapshot(query(collection(db,"albergues")), s => {
        c.innerHTML = "<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";
        s.forEach(d => {
            const a = d.data();
            let extraBtn = isSuper ? `<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}', ${!a.activo})">${a.activo === false ? 'Activar' : 'Archivar'}</button>` : "";
            c.innerHTML += `<div class="mto-card ${!a.activo ? 'archived' : ''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`;
        });
    });
}

async function cargarObservatorio() {
    const list=el('obs-list-container'); if(!list)return;
    list.innerHTML='<p>Cargando...</p>'; let gW=0,gH=0,gC=0;
    try{
        const sSnap=await getDocs(query(collection(db,"albergues"),where("activo","==",true)));
        let h="";
        for(const ds of sSnap.docs){
            const d=ds.data(); const c=parseInt(d.capacidad||0); gC+=c;
            const pSnap=await getDocs(collection(db,"albergues",ds.id,"personas"));
            let sW=0,sH=0;
            pSnap.forEach(p=>{ const pd=p.data(); if(pd.estado==='espera')sW++; if(pd.estado==='ingresado')sH++; });
            gW+=sW; gH+=sH; const sF=Math.max(0,c-sH); const sP=c>0?Math.round((sH/c)*100):0;
            h+=`<div class="obs-row"><div class="obs-row-title">${d.nombre}</div><div style="display:flex;width:100%;justify-content:space-between;"><div class="obs-data-point"><span>Espera</span><strong>${sW}</strong></div><div class="obs-data-point"><span>Alojados</span><strong>${sH}</strong></div><div class="obs-data-point"><span>Libres</span><strong>${sF}</strong></div><div class="obs-data-point"><span>${sP}%</span></div></div></div>`;
        }
        if(el('kpi-espera')) el('kpi-espera').innerText=gW;
        if(el('kpi-alojados')) el('kpi-alojados').innerText=gH;
        if(el('kpi-libres')) el('kpi-libres').innerText=`${Math.max(0,gC-gH)}`;
        if(el('kpi-percent')) el('kpi-percent').innerText=`${gC>0?Math.round((gH/gC)*100):0}%`;
        list.innerHTML=h;
    } catch(e) { list.innerHTML="Error"; }
}

function cargarUsuarios() {
    const c=el('lista-usuarios-container'); const filterText=safeVal('search-user').toLowerCase().trim();
    unsubscribeUsers=onSnapshot(query(collection(db,"usuarios")),s=>{
        c.innerHTML=""; if(s.empty){c.innerHTML="<p>No hay usuarios.</p>";return;}
        s.forEach(d=>{
            const u=d.data();
            if(filterText&&!u.nombre.toLowerCase().includes(filterText)&&!u.email.toLowerCase().includes(filterText))return;
            if(currentUserData.rol==='admin'&&u.rol==='super_admin')return;
            c.innerHTML+=`<div class="user-card-item" onclick="window.abrirModalUsuario('${d.id}')"><strong>${u.nombre}</strong><br><small>${u.rol}</small></div>`;
        });
    });
}

function filtrarUsuarios() { cargarUsuarios(); }

// --- FUNCIONES FILIACIÓN & NUBE ---
function buscarPersonaEnAlbergue() {
    const txt = safeVal('buscador-persona').toLowerCase().trim();
    const res = el('resultados-busqueda');
    if(txt.length < 2) { safeHide('resultados-busqueda'); return; }

    const localHits = listaPersonasCache.filter(p => { const f = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase(); return f.includes(txt) || (p.docNum||"").toLowerCase().includes(txt); });
    const globalHits = listaGlobalPrefiliacion.filter(p => { const f = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase(); return f.includes(txt) || (p.docNum||"").toLowerCase().includes(txt); });

    res.innerHTML = "";
    if(localHits.length === 0 && globalHits.length === 0) { res.innerHTML = `<div class="search-item" style="color:#666">No encontrado</div>`; } else {
        localHits.forEach(p => { const dc = p.estado === 'ingresado' ? 'dot-green' : 'dot-red'; res.innerHTML += `<div class="search-item" onclick="window.seleccionarPersona('${p.id}', false)"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong> (Local)<div style="font-size:0.8rem;color:#666;">📄 ${p.docNum||'-'}</div></div><div class="status-dot ${dc}" title="${p.estado.toUpperCase()}"></div></div></div>`; });
        globalHits.forEach(p => { res.innerHTML += `<div class="search-item" onclick="window.seleccionarPersona('${p.id}', true)"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong> (Nube)<div style="font-size:0.8rem;color:#666;">☁️ ${p.docNum||'-'}</div></div><div class="status-dot dot-cloud" title="EN NUBE"></div></div></div>`; });
    }
    safeShow('resultados-busqueda');
}

function seleccionarPersona(pid, isGlobal) {
    if(typeof pid !== 'string') pid = pid.id; 
    let p;
    if (isGlobal) { p = listaGlobalPrefiliacion.find(x => x.id === pid); personaEnGestionEsGlobal = true; safeShow('banner-nube'); safeHide('btns-local-actions'); safeShow('btns-cloud-actions'); } 
    else { p = listaPersonasCache.find(x => x.id === pid); personaEnGestionEsGlobal = false; safeHide('banner-nube'); safeShow('btns-local-actions'); safeHide('btns-cloud-actions'); }

    if(!p) return;
    personaEnGestion = p; prefiliacionEdicionId = p.id; isGlobalEdit = isGlobal;
    safeHide('resultados-busqueda'); safeShow('panel-gestion-persona');

    if(el('gestion-nombre-titulo')) el('gestion-nombre-titulo').innerText = p.nombre;
    if(el('gestion-estado')) el('gestion-estado').innerText = isGlobal ? "EN NUBE" : p.estado.toUpperCase();
    if(el('gestion-cama-info')) el('gestion-cama-info').innerText = (p.cama && !isGlobal) ? `Cama: ${p.cama}` : "";

    setVal('edit-nombre', p.nombre); setVal('edit-ap1', p.ap1); setVal('edit-ap2', p.ap2);
    setVal('edit-tipo-doc', p.tipoDoc); setVal('edit-doc-num', p.docNum); setVal('edit-fecha', p.fechaNac); setVal('edit-tel', p.telefono);

    const flist = el('info-familia-lista'); flist.innerHTML = "";
    let fam = [];
    if(isGlobal) fam = listaGlobalPrefiliacion.filter(x => x.familiaId === p.familiaId);
    else fam = listaPersonasCache.filter(x => x.familiaId === p.familiaId);

    if(el('info-familia-resumen')) el('info-familia-resumen').innerText = fam.length > 1 ? `Familia (${fam.length})` : "Individual";
    
    fam.forEach(f => {
        if(f.id !== p.id) {
            const st = f.estado === 'ingresado' ? 'color:var(--success);' : 'color:var(--warning);';
            const ic = f.estado === 'ingresado' ? 'fa-solid fa-bed' : 'fa-solid fa-clock';
            flist.innerHTML += `<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.seleccionarPersona('${f.id}', ${isGlobal})"><div><div style="font-weight:bold;font-size:0.95rem;">${f.nombre} ${f.ap1||''}</div><div style="font-size:0.85rem;color:#666;"><i class="fa-regular fa-id-card"></i> ${f.docNum||'-'}</div></div><div style="font-size:1.2rem;${st}"><i class="${ic}"></i></div></div>`;
        }
    });
    if(!isGlobal) setupAutoSave();
}

async function guardarCambiosPersona(silent=false) {
    if(!personaEnGestion)return;
    const p=getDatosFormulario('edit');
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),p);
    registrarLog(personaEnGestion.id,"Edición Datos","Manual");
    if(!silent) alert("Guardado"); else showToast("Guardado automático");
}

function buscarEnPrefiliacion() {
    const t=safeVal('buscador-pref').toLowerCase().trim(); const r=el('resultados-pref');
    if(t.length<2){safeHide('resultados-pref');return;}
    const hits=listaGlobalPrefiliacion.filter(p=>{
        const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
        return full.includes(t)||(p.docNum||"").toLowerCase().includes(t)||(p.telefono||"").includes(t);
    });
    r.innerHTML=""; if(hits.length===0) r.innerHTML="<div class='search-item'>Sin resultados</div>";
    hits.forEach(p=>{r.innerHTML += `<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')"><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><br><small>🌐 POOL | ${p.docNum||'-'} | ${p.telefono||'-'}</small></div>`;});
    safeShow('resultados-pref');
}

function cargarParaEdicionPref(pid) {
    const p=listaGlobalPrefiliacion.find(x=>x.id===pid); if(!p)return;
    prefiliacionEdicionId=p.id; isGlobalEdit = true;
    safeHide('resultados-pref'); el('buscador-pref').value="";
    setVal('man-nombre',p.nombre);setVal('man-ap1',p.ap1);setVal('man-ap2',p.ap2);
    setVal('man-tipo-doc',p.tipoDoc);setVal('man-doc-num',p.docNum);setVal('man-fecha',p.fechaNac);setVal('man-tel',p.telefono);
    const l=el('existing-family-list-ui'); l.innerHTML="";
    if(p.familiaId){
        const fs=listaGlobalPrefiliacion.filter(x=>x.familiaId===p.familiaId&&x.id!==p.id);
        if(fs.length>0){ l.innerHTML="<h5>Familiares en Pool:</h5>"; fs.forEach(f=>{l.innerHTML+=`<div class="fam-item existing"><div><strong>${f.nombre} ${f.ap1||''}</strong><br><small style="color:#666;">${f.docNum||'-'}</small></div></div>`;}); }
    }
    el('btn-save-pref').innerText="Actualizar en Pool Global"; safeShow('btn-cancelar-edicion-pref'); safeShow('btn-ingresar-pref');
}

async function adminPrefiliarManual(silent=false) {
    if(silent && !prefiliacionEdicionId) return; 
    if(prefiliacionEdicionId && isGlobalEdit){
        const p=getDatosFormulario('man'); await updateDoc(doc(db,"pool_prefiliacion",prefiliacionEdicionId),p);
        registrarLog(prefiliacionEdicionId,"Edición Pool","Manual", true);
        if(!silent) { showToast("Pool Actualizado"); cancelarEdicionPref(); } return;
    }
    const n=safeVal('man-nombre');if(!n)return alert("Falta nombre");
    const fid=new Date().getTime().toString(); const t=getDatosFormulario('man');
    t.estado='espera';t.familiaId=fid;t.rolFamilia='TITULAR';t.fechaRegistro=new Date(); t.origenAlbergueId = currentAlbergueId;
    const ref=await addDoc(collection(db,"pool_prefiliacion"),t);
    registrarLog(ref.id,"Alta Staff","Titular", true);
    for(const f of adminFamiliaresTemp){ const refF=await addDoc(collection(db,"pool_prefiliacion"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date(), origenAlbergueId: currentAlbergueId}); registrarLog(refF.id,"Alta Staff","Familiar", true); }
    if(!silent){ alert("Guardado en Pool Global"); limpiarFormulario('man'); adminFamiliaresTemp=[]; if(el('admin-lista-familiares-ui'))el('admin-lista-familiares-ui').innerHTML="Ninguno."; }
}

async function rescatarDeGlobalDirecto() {
    if(!personaEnGestion || !personaEnGestionEsGlobal) return;
    if(!confirm(`¿Ingresar a ${personaEnGestion.nombre}?`)) return;
    try {
        const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId);
        const batch = writeBatch(db);
        familia.forEach(member => {
            const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
            const memberData = {...member}; delete memberData.id; memberData.fechaIngresoAlbergue = new Date(); memberData.origenPoolId = member.id; memberData.estado = 'espera'; 
            batch.set(localRef, memberData); batch.delete(doc(db, "pool_prefiliacion", member.id));
            batch.set(doc(collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial")), {fecha: new Date(), usuario: currentUserData.nombre, accion: "Ingreso desde Nube", detalle: "Rescatado"});
        });
        await batch.commit(); showToast("Ingreso realizado.");
        personaEnGestion = null; safeHide('panel-gestion-persona'); el('buscador-persona').value = "";
    } catch(e) { sysLog(e.message, "error"); }
}

async function darSalidaPersona() {
    if(!personaEnGestion || personaEnGestionEsGlobal) return;
    if(!confirm(`¿Dar salida a ${personaEnGestion.nombre}?`)) return;
    try {
        const familia = listaPersonasCache.filter(x => x.familiaId === personaEnGestion.familiaId);
        const batch = writeBatch(db);
        familia.forEach(member => {
            const poolRef = doc(collection(db, "pool_prefiliacion"));
            const memberData = {...member}; delete memberData.id; memberData.cama = null; memberData.estado = 'espera'; memberData.fechaSalidaAlbergue = new Date(); memberData.ultimoAlbergueId = currentAlbergueId;
            batch.set(poolRef, memberData); batch.delete(doc(db, "albergues", currentAlbergueId, "personas", member.id));
            batch.set(doc(collection(db, "pool_prefiliacion", poolRef.id, "historial")), {fecha: new Date(), usuario: currentUserData.nombre, accion: "Salida Albergue", detalle: `Salida`});
        });
        await batch.commit(); showToast("Salida completada.");
        safeHide('panel-gestion-persona'); safeHide('resultados-busqueda'); el('buscador-persona').value = "";
    } catch(e) { sysLog(e.message, "error"); }
}

// --- CAMAS ---
function abrirMapaGeneral() { modoMapaGeneral=true; mostrarGridCamas(); }
function abrirSeleccionCama() { modoMapaGeneral=false; mostrarGridCamas(); }
function cerrarMapaCamas() { highlightedFamilyId=null; safeHide('modal-cama'); }

async function guardarCama(c) {
    if (personaEnGestionEsGlobal) {
        if(!confirm(`Ingresar y asignar cama ${c}?`)) return;
        try {
            const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId);
            const batch = writeBatch(db);
            let newPersonLocalId = null;
            familia.forEach(member => {
                const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
                const memberData = {...member}; delete memberData.id; memberData.fechaIngresoAlbergue = new Date(); memberData.origenPoolId = member.id;
                if(member.id === personaEnGestion.id) { memberData.estado = 'ingresado'; memberData.cama = c.toString(); memberData.fechaIngreso = new Date(); newPersonLocalId = localRef.id; } else { memberData.estado = 'espera'; }
                batch.set(localRef, memberData); batch.delete(doc(db, "pool_prefiliacion", member.id));
                batch.set(doc(collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial")), {fecha: new Date(), usuario: currentUserData.nombre, accion: "Ingreso + Cama", detalle: `Cama ${c}`});
            });
            await batch.commit(); cerrarMapaCamas(); showToast("Ingreso realizado. Cargando...");
            setTimeout(() => {
                const newPerson = listaPersonasCache.find(p => p.id === newPersonLocalId);
                if(newPerson) seleccionarPersona(newPerson, false); else { safeHide('panel-gestion-persona'); el('buscador-persona').value = ""; }
            }, 800);
        } catch(e) { sysLog(e.message, "error"); }
        return;
    }
    if(personaEnGestion.cama){ alert(`Error: Ya tiene cama.`); return; }
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});
    registrarLog(personaEnGestion.id,"Asignación Cama",`Cama ${c}`);
    cerrarMapaCamas(); 
    // NO CERRAMOS PANEL, SOLO CAMA
}

function mostrarGridCamas() {
    const g=el('grid-camas'); g.innerHTML=""; const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8; g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
    let shadowMap={}; let famGroups={};
    listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});
    Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});
    for(let i=1;i<=totalCapacidad;i++){
        const n=i.toString(); const occName=camasOcupadas[n]; const occ=listaPersonasCache.find(p=>p.cama===n);
        let cls="bed-box"; let lbl=n; 
        if(occ&&highlightedFamilyId&&occ.familiaId===highlightedFamilyId){cls+=" bed-family-highlight";}
        if(!modoMapaGeneral&&personaEnGestion&&personaEnGestion.cama===n){cls+=" bed-current";lbl+=" (Tú)";}
        else if(occName){ cls+=" bed-busy"; if(occ){const f=`${occ.nombre} ${occ.ap1||''}`;lbl+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono||'-'}</div>`;} }
        else{ cls+=" bed-free"; if(shadowMap[n]){cls+=" bed-shadow";} }
        const d=document.createElement('div'); d.className=cls; d.innerHTML=lbl;
        d.onclick=()=>{if(occ){if(highlightedFamilyId===occ.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occ.familiaId;mostrarGridCamas();}else if(!modoMapaGeneral){guardarCama(n);}};
        d.ondblclick=()=>{if(occ)abrirModalInfoCama(occ);};
        g.appendChild(d);
    }
    safeShow('modal-cama');
}

function abrirModalInfoCama(p){
    el('info-cama-num').innerText=p.cama; el('info-nombre-completo').innerText=p.nombre; el('info-telefono').innerText=p.telefono||"No consta";
    const bh=el('btn-historial-cama'); if(['admin','super_admin'].includes(currentUserData.rol)){ safeShow('btn-historial-cama'); bh.onclick=()=>verHistorial(p.id); }else{ safeHide('btn-historial-cama'); }
    const c=el('info-familia-detalle'); const fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);
    let h=`<table class="fam-table"><thead><tr><th>Nombre</th><th>DNI/Tel</th><th>Cama</th></tr></thead><tbody>`;
    fam.forEach(f=>{ const isCurrent=f.id===p.id?'fam-row-current':''; h+=`<tr class="${isCurrent}"><td>${f.nombre} ${f.ap1||''}</td><td><small>${f.docNum||'-'}<br>${f.telefono||'-'}</small></td><td><strong>${f.cama||'-'}</strong></td></tr>`; }); h+=`</tbody></table>`; c.innerHTML=h; safeShow('modal-bed-info');
}
async function liberarCamaMantener(){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{cama:null}); sysLog("Cama liberada (Mantener)", "warn");}

// --- OTROS MODALES ---
function abrirModalFamiliar() { limpiarFormulario('fam'); safeShow('modal-add-familiar'); if(el('fam-tipo-doc')) el('fam-tipo-doc').value="MENOR"; verificarMenor('fam'); }
function cerrarModalFamiliar() { safeHide('modal-add-familiar'); }
function guardarFamiliarEnLista() { const d=getDatosFormulario('fam'); if(!d.nombre) return alert("Nombre obligatorio"); listaFamiliaresTemp.push(d); actualizarListaFamiliaresUI(); cerrarModalFamiliar(); }
function actualizarListaFamiliaresUI() { const d = el('lista-familiares-ui'); if(!d) return; d.innerHTML = ""; if (listaFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>'; return; } listaFamiliaresTemp.forEach((f, i) => { d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`; }); }
function borrarFamiliarTemp(i) { listaFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresUI(); }

function abrirModalFamiliarAdmin() { limpiarFormulario('adm-fam'); safeShow('modal-admin-add-familiar'); if(el('adm-fam-tipo-doc')) el('adm-fam-tipo-doc').value="MENOR"; verificarMenor('adm-fam'); }
function cerrarModalFamiliarAdmin() { safeHide('modal-admin-add-familiar'); }
function guardarFamiliarAdmin() { const d=getDatosFormulario('adm-fam'); if(!d.nombre) return alert("Nombre obligatorio"); adminFamiliaresTemp.push(d); actualizarListaFamiliaresAdminUI(); cerrarModalFamiliarAdmin(); }
function actualizarListaFamiliaresAdminUI() { const d = el('admin-lista-familiares-ui'); if(!d) return; d.innerHTML = ""; if (adminFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno.</p>'; return; } adminFamiliaresTemp.forEach((f, i) => { d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`; }); }
function borrarFamiliarAdminTemp(i) { adminFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresAdminUI(); }

function abrirModalVincularFamilia() { if(!personaEnGestion) return; if(el('search-vincular')) el('search-vincular').value=""; if(el('resultados-vincular')) el('resultados-vincular').innerHTML=""; safeShow('modal-vincular-familia'); }
function buscarParaVincular() { const t=safeVal('search-vincular').toLowerCase().trim(); const r=el('resultados-vincular'); r.innerHTML=""; if(t.length<2){safeAddActive('hidden');return;} const hits=listaPersonasCache.filter(p=>{ if(p.id===personaEnGestion.id)return false; return (p.nombre+" "+(p.ap1||"")).toLowerCase().includes(t); }); if(hits.length===0){ r.innerHTML="<div class='search-item'>Sin resultados</div>"; } else { hits.forEach(p=>{ const d=document.createElement('div'); d.className='search-item'; d.innerHTML=`<strong>${p.nombre}</strong>`; d.onclick=()=>vincularAFamilia(p); r.appendChild(d); }); } r.classList.remove('hidden'); }
async function vincularAFamilia(target) { if(!confirm(`¿Unir a ${personaEnGestion.nombre}?`)) return; try { const path = personaEnGestionEsGlobal ? "pool_prefiliacion" : `albergues/${currentAlbergueId}/personas`; let tid = target.familiaId; const batch = writeBatch(db); if(!tid) { tid = new Date().getTime()+"-F"; batch.update(doc(db, path, target.id), {familiaId: tid, rolFamilia: 'TITULAR'}); } batch.update(doc(db, path, personaEnGestion.id), {familiaId: tid, rolFamilia: 'MIEMBRO'}); await batch.commit(); alert("Vinculado"); safeHide('modal-vincular-familia'); seleccionarPersona(personaEnGestion, personaEnGestionEsGlobal); } catch(e) { sysLog(e.message, 'error'); } }

async function registrarLog(pid, act, det, isPool=false){ try{ await addDoc(collection(db, isPool?"pool_prefiliacion":`albergues/${currentAlbergueId}/personas`, pid, "historial"), {fecha:new Date(), usuario:currentUserData?currentUserData.nombre:"Auto-QR", accion:act, detalle:det}); }catch(e){} }
async function verHistorial(pid){ let tid=pid || (personaEnGestion?personaEnGestion.id:null); if(!tid) return; safeShow('modal-historial'); el('historial-content').innerHTML="Cargando..."; try { const path=personaEnGestionEsGlobal?collection(db,"pool_prefiliacion",tid,"historial"):collection(db,"albergues",currentAlbergueId,"personas",tid,"historial"); const q=query(path,orderBy("fecha","desc")); const snap=await getDocs(q); let h="<h4>Historial</h4>"; snap.forEach(d=>{ const f=d.data().fecha.toDate(); h+=`<div class="log-item"><strong>${d.data().accion}</strong><br><small>${f.toLocaleString()} - ${d.data().usuario}</small><br><i>${d.data().detalle}</i></div>`; }); el('historial-content').innerHTML=h; } catch(e) { el('historial-content').innerHTML="Error"; } }

function abrirModalAlbergue(id=null){albergueEdicionId=id;safeShow('modal-albergue');if(id){getDoc(doc(db,"albergues",id)).then(s=>{const d=s.data();setVal('mto-nombre',d.nombre);setVal('mto-capacidad',d.capacidad);setVal('mto-columnas',d.columnas);if(currentUserData.rol==='super_admin')safeShow('btn-delete-albergue');else safeHide('btn-delete-albergue');});}else{setVal('mto-nombre',"");setVal('mto-capacidad',"");safeHide('btn-delete-albergue');}}
async function guardarAlbergue(){const n=safeVal('mto-nombre'),c=safeVal('mto-capacidad'),col=safeVal('mto-columnas');if(!n)return;if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});safeHide('modal-albergue');}
async function eliminarAlbergueActual(){if(albergueEdicionId&&confirm("Borrar?")){await deleteDoc(doc(db,"albergues",albergueEdicionId));safeHide('modal-albergue');}}
async function cambiarEstadoAlbergue(id,st){await updateDoc(doc(db,"albergues",id),{activo:st});}

function abrirModalUsuario(id=null){userEditingId=id;safeShow('modal-crear-usuario');const s=el('new-user-role');s.innerHTML="";['super_admin','admin','intervencion','filiacion','observador'].forEach(r=>s.add(new Option(r,r)));if(id){getDoc(doc(db,"usuarios",id)).then(doc=>{setVal('new-user-name',doc.data().nombre);setVal('new-user-email',doc.data().email);s.value=doc.data().rol;if(currentUserData.rol==='super_admin')safeShow('btn-delete-user');else safeHide('btn-delete-user');});}else{setVal('new-user-name',"");setVal('new-user-email',"");safeHide('btn-delete-user');}}
async function guardarUsuario(){const e=safeVal('new-user-email'),p=safeVal('new-user-pass'),n=safeVal('new-user-name'),r=safeVal('new-user-role');if(userEditingId){await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});}else{const tApp=initializeApp(firebaseConfig,"Temp");const tAuth=getAuth(tApp);const uc=await createUserWithEmailAndPassword(tAuth,e,p);await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});await signOut(tAuth);deleteApp(tApp);}safeHide('modal-crear-usuario');}
async function eliminarUsuario(){if(userEditingId&&confirm("Borrar?")){await deleteDoc(doc(db,"usuarios",userEditingId));safeHide('modal-crear-usuario');}}

function abrirModalCambioPass(){setVal('chg-old-pass','');setVal('chg-new-pass','');setVal('chg-confirm-pass','');safeShow('modal-change-pass');}
async function ejecutarCambioPass(){const o=safeVal('chg-old-pass'),n=safeVal('chg-new-pass');try{await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,o));await updatePassword(auth.currentUser,n);alert("OK");safeHide('modal-change-pass');}catch(e){alert("Error");}}

async function publicoGuardarTodo(){
    const d=getDatosFormulario('pub'); if(!d.nombre)return alert("Nombre obligatorio");
    if(!auth.currentUser) { try { await signInAnonymously(auth); } catch(e) {} }
    const fid=new Date().getTime().toString(); const b=writeBatch(db);
    const tRef=doc(collection(db,"pool_prefiliacion"));
    b.set(tRef,{...d, familiaId:fid, rolFamilia:'TITULAR', estado:'espera', origenAlbergueId:currentAlbergueId, fechaRegistro:new Date()});
    b.set(doc(collection(db,"pool_prefiliacion",tRef.id,"historial")),{fecha:new Date(), usuario:"Auto-QR", accion:"Alta QR", detalle:"Titular"});
    listaFamiliaresTemp.forEach(f=>{
        const fRef=doc(collection(db,"pool_prefiliacion"));
        b.set(fRef,{...f, familiaId:fid, rolFamilia:'MIEMBRO', estado:'espera', origenAlbergueId:currentAlbergueId, fechaRegistro:new Date()});
    });
    await b.commit(); safeHide('public-form-container'); safeShow('public-success-msg');
}
function toggleStartButton(){ el('btn-start-public').disabled=!el('check-consent').checked; }
function iniciarRegistro(){ safeHide('public-welcome-screen'); safeShow('public-form-container'); }

// ============================================
// 3. EXPOSE TO WINDOW (FINAL BINDING)
// ============================================
// This guarantees all functions are available to HTML buttons
Object.assign(window, {
    toggleCajaNegra, limpiarCajaNegra, sysLog, el, safeHide, safeShow, safeRemoveActive, safeAddActive, safeVal, setVal, formatearFecha, verificarMenor, limpiarFormulario, getDatosFormulario, actualizarContadores, showToast,
    iniciarSesion, cerrarSesion, navegar, configurarDashboard, configurarTabsPorRol, cambiarPestana,
    cargarDatosYEntrar, conectarListenersBackground, cargarAlberguesActivos, cargarAlberguesMantenimiento, cargarObservatorio, cargarUsuarios, filtrarUsuarios,
    buscarPersonaEnAlbergue, seleccionarPersona, guardarCambiosPersona, buscarEnPrefiliacion, cargarParaEdicionPref, adminPrefiliarManual, cancelarEdicionPref,
    rescatarDeGlobalDirecto, darSalidaPersona, liberarCamaMantener,
    abrirMapaGeneral, abrirSeleccionCama, cerrarMapaCamas, guardarCama, mostrarGridCamas, abrirModalInfoCama,
    abrirModalFamiliar, cerrarModalFamiliar, guardarFamiliarEnLista, borrarFamiliarTemp, actualizarListaFamiliaresUI,
    abrirModalFamiliarAdmin, cerrarModalFamiliarAdmin, guardarFamiliarAdmin, borrarFamiliarAdminTemp, actualizarListaFamiliaresAdminUI,
    abrirModalVincularFamilia, buscarParaVincular, vincularAFamilia,
    abrirModalAlbergue, guardarAlbergue, eliminarAlbergueActual, cambiarEstadoAlbergue,
    abrirModalUsuario, guardarUsuario, eliminarUsuario,
    abrirModalCambioPass, ejecutarCambioPass,
    abrirModalQR, toggleStartButton, iniciarRegistro, publicoGuardarTodo,
    registrarLog, verHistorial, verListaObservatorio, verHistorialObservatorio
});

// Listener overrides
window.onerror = function(message, source, lineno, colno, error) { 
    sysLog(`CRITICAL: ${message} at ${lineno}`, "error"); 
    const bb = document.getElementById('black-box-overlay'); 
    if(bb && bb.classList.contains('hidden')) bb.classList.remove('hidden'); 
};
