import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- 0. INICIALIZACIÓN DE FIREBASE ---
const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// --- 1. SISTEMA DE LOGS ---
window.sysLog = function(msg, type = 'info') {
    const c = document.getElementById('black-box-content');
    if (!c) { console.log(msg); return; }
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    let typeClass = 'log-type-info';
    if (type === 'error') typeClass = 'log-type-error';
    if (type === 'warn') typeClass = 'log-type-warn';
    if (type === 'nav') typeClass = 'log-type-nav';
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span class="log-time">[${time}]</span> <span class="${typeClass}">[${type.toUpperCase()}]</span> ${msg}`;
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
    if(type === 'error') console.error(msg); else console.log(`[SYS] ${msg}`);
};

window.onerror = function(message, source, lineno, colno, error) {
    window.sysLog(`CRITICAL ERROR: ${message} at line ${lineno}`, "error");
    const bb = document.getElementById('black-box-overlay');
    if(bb && bb.classList.contains('hidden')) bb.classList.remove('hidden');
};

window.toggleCajaNegra = function() {
    const bb = document.getElementById('black-box-overlay');
    if (bb) { if (bb.classList.contains('hidden')) { bb.classList.remove('hidden'); window.sysLog("Debug activado", "info"); } else { bb.classList.add('hidden'); } }
};
window.limpiarCajaNegra = function() { const c = document.getElementById('black-box-content'); if (c) c.innerHTML = ""; };

window.sysLog("Sistema Iniciado. Versión 38.13.0 (Nuevos Roles)", "info");

// --- 2. GLOBALES ---
let isPublicMode = false;
let currentAlbergueId = null;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) { isPublicMode = true; currentAlbergueId = urlParams.get('public_id'); window.sysLog(`Modo Público: ${currentAlbergueId}`, "info"); }

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
let savingLock = false; 

// --- 3. UTILIDADES DOM ---
window.el = function(id) { return document.getElementById(id); };
window.safeHide = function(id) { const e = window.el(id); if(e) e.classList.add('hidden'); };
window.safeShow = function(id) { const e = window.el(id); if(e) e.classList.remove('hidden'); };
window.safeRemoveActive = function(id) { const e = window.el(id); if(e) e.classList.remove('active'); };
window.safeAddActive = function(id) { const e = window.el(id); if(e) e.classList.add('active'); };
window.safeVal = function(id) { const e = window.el(id); return e ? e.value : ""; };
window.setVal = function(id, val) { const e = window.el(id); if (e) e.value = val; };
window.actualizarContadores = function() { const elOcc = window.el('ocupacion-count'); const elCap = window.el('capacidad-total'); if (elOcc) elOcc.innerText = ocupacionActual; if (elCap) elCap.innerText = totalCapacidad; };
window.showToast = function(msg) { const t = window.el('toast'); if(t) { t.innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); } };
window.formatearFecha = function(i) { let v = i.value.replace(/\D/g, '').slice(0, 8); if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`; else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`; else i.value = v; };
window.verificarMenor = function(p) { const t = window.el(`${p}-tipo-doc`).value; const i = window.el(`${p}-doc-num`); if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; } else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; } };
window.limpiarFormulario = function(p) { ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = window.el(`${p}-${f}`); if (e) e.value = ""; }); const i = window.el(`${p}-doc-num`); if (i) i.disabled = false; };
window.getDatosFormulario = function(p) { return { nombre: window.safeVal(`${p}-nombre`), ap1: window.safeVal(`${p}-ap1`), ap2: window.safeVal(`${p}-ap2`), tipoDoc: window.safeVal(`${p}-tipo-doc`), docNum: window.safeVal(`${p}-doc-num`), fechaNac: window.safeVal(`${p}-fecha`), telefono: window.safeVal(`${p}-tel`) }; };

// --- 4. CORE APP ---
window.iniciarSesion = async function() { try { window.sysLog("Click Login", "info"); await signInWithEmailAndPassword(auth, window.el('login-email').value, window.el('login-pass').value); window.sysLog("Auth Firebase OK", "success"); } catch(err) { window.sysLog("Error Auth: " + err.message, "error"); alert(err.message); } };
window.cerrarSesion = function() { window.sysLog("Cerrando sesión", "warn"); signOut(auth); location.reload(); };

window.navegar = function(p) {
    window.sysLog(`Navegando: ${p}`, "nav");
    if(unsubscribeUsers) unsubscribeUsers(); 
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio'].forEach(id=>window.safeHide(id));
    if(!currentUserData) return;
    if(p==='home') window.safeShow('screen-home');
    else if(p==='gestion-albergues') { window.cargarAlberguesActivos(); window.safeShow('screen-gestion-albergues'); }
    else if(p==='mantenimiento') { window.cargarAlberguesMantenimiento(); window.safeShow('screen-mantenimiento'); }
    else if(p==='operativa') { window.safeShow('screen-operativa'); const t = window.configurarTabsPorRol(); window.cambiarPestana(t); } 
    else if(p==='observatorio') { window.cargarObservatorio(); window.safeShow('screen-observatorio'); }
    else if(p==='usuarios') { window.cargarUsuarios(); window.safeShow('screen-usuarios'); }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(p.includes('albergue')) window.safeAddActive('nav-albergues'); else if(p.includes('obs')) window.safeAddActive('nav-obs'); else if(p.includes('mantenimiento')) window.safeAddActive('nav-mto'); else window.safeAddActive('nav-home');
};

// --- MODIFICADO: CONFIGURACIÓN DASHBOARD CON GRISES (DISABLED) ---
window.configurarDashboard = function() {
    const r = (currentUserData.rol || "").toLowerCase();
    if(window.el('user-name-display')) window.el('user-name-display').innerText = currentUserData.nombre;
    if(window.el('user-role-badge')) window.el('user-role-badge').innerText = r.toUpperCase();
    
    // Reset all nav items: Remove active, remove disabled, show all
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => {
        n.classList.remove('active', 'disabled', 'hidden');
    });
    window.safeHide('header-btn-users');
    window.safeHide('container-ver-ocultos');

    // -- LOGIC PER ROLE --

    // 1. GESTIÓN USUARIOS (HEADER)
    if(['super_admin', 'admin'].includes(r)) {
        window.safeShow('header-btn-users');
    }

    // 2. MANTENIMIENTO (NAV)
    if(!['super_admin', 'admin'].includes(r)) {
        window.el('nav-mto').classList.add('disabled');
    }

    // 3. OBSERVATORIO (NAV)
    if(['albergue', 'sanitario', 'psicosocial'].includes(r)) {
        window.el('nav-obs').classList.add('disabled');
    }

    // 4. GESTIÓN ALBERGUES (NAV)
    if(r === 'observador') {
        window.el('nav-albergues').classList.add('disabled');
    }

    // 5. SUPER ADMIN EXTRAS
    if(r === 'super_admin') {
        window.safeShow('container-ver-ocultos');
    }

    window.safeAddActive('nav-home');
};

// --- MODIFICADO: TABS INTERNAS SEGÚN ROL ---
window.configurarTabsPorRol = function() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    // Reset: Hide all first
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeHide(id));

    if(['super_admin', 'admin'].includes(r)) {
        // Show ALL
        ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeShow(id));
        return 'filiacion';
    }

    if(r === 'albergue') {
        window.safeShow('btn-tab-pref');
        window.safeShow('btn-tab-fil');
        return 'filiacion';
    }

    if(['sanitario', 'psicosocial', 'intervencion'].includes(r)) {
        window.safeShow('btn-tab-san');
        window.safeShow('btn-tab-psi');
        return 'sanitaria';
    }

    // Fallback
    return 'filiacion';
};

window.cambiarPestana = function(t) { window.sysLog(`Pestaña: ${t}`, "nav"); ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => window.safeHide(id)); ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeRemoveActive(id)); window.safeAddActive(`btn-tab-${t.substring(0,3)}`); window.safeShow(`tab-${t}`); if (t === 'prefiliacion') { window.limpiarFormulario('man'); adminFamiliaresTemp = []; if(window.actualizarListaFamiliaresAdminUI) window.actualizarListaFamiliaresAdminUI(); if(window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML = ""; window.cancelarEdicionPref(); } else if (t === 'filiacion') { if(window.el('buscador-persona')) window.el('buscador-persona').value = ""; window.safeHide('resultados-busqueda'); window.safeHide('panel-gestion-persona'); window.personaEnGestion = null; } };

// --- 5. LOGICA DE NEGOCIO ---
window.cargarDatosYEntrar = async function(id) {
    currentAlbergueId = id; window.sysLog(`Entrando en Albergue: ${id}`, "info"); window.safeShow('loading-overlay');
    try {
        const dS = await getDoc(doc(db,"albergues",id));
        if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); }
        if(unsubscribePersonas) unsubscribePersonas();
        unsubscribePersonas = onSnapshot(collection(db,"albergues",id,"personas"), s=>{
            listaPersonasCache=[]; camasOcupadas={}; let c=0;
            s.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
            ocupacionActual=c; window.actualizarContadores();
            if(personaEnGestion && !personaEnGestionEsGlobal) { const u=listaPersonasCache.find(x=>x.id===personaEnGestion.id); if(u) window.seleccionarPersona(u, false); }
        });
        if(unsubscribePool) unsubscribePool();
        unsubscribePool = onSnapshot(collection(db, "pool_prefiliacion"), s => { listaGlobalPrefiliacion = []; s.forEach(d => { const p = d.data(); p.id = d.id; listaGlobalPrefiliacion.push(p); }); window.sysLog(`Pool Global: ${listaGlobalPrefiliacion.length} registros`, "info"); });
        window.navegar('operativa');
        if(window.el('app-title')) window.el('app-title').innerText = currentAlbergueData.nombre;
        window.configurarDashboard(); window.actualizarContadores(); window.safeHide('loading-overlay'); window.conectarListenersBackground(id); window.setupAutoSave();
    } catch(e) { window.sysLog(`Error Cargando: ${e.message}`, "error"); alert(e.message); window.safeHide('loading-overlay'); }
};
window.conectarListenersBackground = function(id) { if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc(); unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); window.actualizarContadores(); } }); };

// --- CAMAS ---
window.abrirMapaGeneral = function() { modoMapaGeneral=true; window.mostrarGridCamas(); };
window.abrirSeleccionCama = function() { modoMapaGeneral=false; window.mostrarGridCamas(); };
window.cerrarMapaCamas = function(){ highlightedFamilyId=null; window.safeHide('modal-cama'); };
window.guardarCama=async function(c){if(savingLock)return;savingLock=true;if(personaEnGestionEsGlobal){if(!confirm(`¿Ingresar y asignar cama ${c}?`)){savingLock=false;return;}try{const familia=listaGlobalPrefiliacion.filter(x=>x.familiaId===personaEnGestion.familiaId);const batch=writeBatch(db);let newPersonLocalId=null;familia.forEach(member=>{const localRef=doc(collection(db,"albergues",currentAlbergueId,"personas"));const memberData={...member};delete memberData.id;memberData.fechaIngresoAlbergue=new Date();memberData.origenPoolId=member.id;if(member.id===personaEnGestion.id){memberData.estado='ingresado';memberData.cama=c.toString();memberData.fechaIngreso=new Date();newPersonLocalId=localRef.id;}else{memberData.estado='espera';}batch.set(localRef,memberData);batch.delete(doc(db,"pool_prefiliacion",member.id));const logRef=collection(db,"albergues",currentAlbergueId,"personas",localRef.id,"historial");batch.set(doc(logRef),{fecha:new Date(),usuario:currentUserData.nombre,accion:"Ingreso + Cama",detalle:`Cama ${c}`});});await batch.commit();window.sysLog(`Ingreso + Cama ${c} OK`, "success");window.cerrarMapaCamas();window.showToast("Ingresado. Cargando...");setTimeout(()=>{const newPerson=listaPersonasCache.find(p=>p.id===newPersonLocalId);if(newPerson)window.seleccionarPersona(newPerson,false);else{window.safeHide('panel-gestion-persona');window.el('buscador-persona').value="";}savingLock=false;},1000);}catch(e){window.sysLog("Error: "+e.message,"error");savingLock=false;}return;}if(personaEnGestion.cama){alert(`Error: Ya tiene cama.`);savingLock=false;return;}personaEnGestion.cama=c.toString();personaEnGestion.estado='ingresado';try{await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});window.registrarLog(personaEnGestion.id,"Asignación Cama",`Cama ${c}`);window.cerrarMapaCamas();window.sysLog(`Cama ${c} asignada`,"success");}catch(e){window.sysLog("Error saving bed: "+e.message,"error");alert("Error al guardar cama");}savingLock=false;};
window.mostrarGridCamas=function(){const g=window.el('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};let famGroups={};listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});let myFamId,famMembers=[],assignedMembers=[],neededForMe=1;if(!window.modoMapaGeneral&&window.personaEnGestion){myFamId=window.personaEnGestion.familiaId;if(myFamId)famMembers=listaPersonasCache.filter(m=>m.familiaId===myFamId);else famMembers=[window.personaEnGestion];assignedMembers=famMembers.filter(m=>m.cama&&m.id!==window.personaEnGestion.id);neededForMe=famMembers.length-assignedMembers.length;}for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occName=camasOcupadas[n];const occ=listaPersonasCache.find(p=>p.cama===n);let cls="bed-box"; let lbl=n; if(occ&&highlightedFamilyId&&occ.familiaId===highlightedFamilyId){cls+=" bed-family-highlight";}if(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n){cls+=" bed-current";lbl+=" (Tú)";}else if(occName){cls+=" bed-busy";if(occ){const f=`${occ.nombre} ${occ.ap1||''}`;lbl+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono||'-'}</div>`;}}else{cls+=" bed-free";if(shadowMap[n]){cls+=" bed-shadow";}}const d=document.createElement('div');d.className=cls;d.innerHTML=lbl;d.onclick=()=>{if(occ){if(highlightedFamilyId===occ.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occ.familiaId;window.mostrarGridCamas();}else if(!window.modoMapaGeneral){window.guardarCama(n);}};d.ondblclick=()=>{if(occ)window.abrirModalInfoCama(occ);};g.appendChild(d);}window.safeShow('modal-cama');};
window.abrirModalInfoCama=function(p){window.el('info-cama-num').innerText=p.cama;window.el('info-nombre-completo').innerText=p.nombre;window.el('info-telefono').innerText=p.telefono||"No consta";const bh=window.el('btn-historial-cama');if(['admin','super_admin'].includes(currentUserData.rol)){window.safeShow('btn-historial-cama');bh.onclick=()=>window.verHistorial(p.id);}else{window.safeHide('btn-historial-cama');}const c=window.el('info-familia-detalle');const fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);let h=`<table class="fam-table"><thead><tr><th>Nombre</th><th>DNI/Tel</th><th>Cama</th></tr></thead><tbody>`;fam.forEach(f=>{const isCurrent=f.id===p.id?'fam-row-current':'';h+=`<tr class="${isCurrent}"><td>${f.nombre} ${f.ap1||''}</td><td><small>${f.docNum||'-'}<br>${f.telefono||'-'}</small></td><td><strong>${f.cama||'-'}</strong></td></tr>`;});h+=`</tbody></table>`;c.innerHTML=h;window.safeShow('modal-bed-info');};
window.liberarCamaMantener=async function(){if(!personaEnGestion)return;if(!confirm(`¿Liberar cama de ${personaEnGestion.nombre}?`))return;try{await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{cama:null});window.registrarLog(personaEnGestion.id,"Liberar Cama","Se mantiene en albergue");window.sysLog("Cama liberada.","success");if(!modoMapaGeneral)window.cerrarMapaCamas();}catch(e){window.sysLog("Error liberando cama: "+e.message,"error");}};
window.cargarAlberguesActivos = function() {
    const c = window.el('lista-albergues-activos');
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s=>{
        c.innerHTML="";
        s.forEach(async d=>{
            const alb = d.data();
            const div = document.createElement('div');
            div.className="mto-card";
            div.innerHTML=`<h3>${alb.nombre}</h3><p id="counter-${d.id}" style="font-weight:bold;color:var(--primary);margin:10px 0;">Cargando...</p><div class="mto-info">Entrar</div>`;
            div.onclick=()=>window.cargarDatosYEntrar(d.id);
            c.appendChild(div);
            const qCount = query(collection(db, "albergues", d.id, "personas"), where("estado", "==", "ingresado"));
            const snap = await getDocs(qCount);
            const count = snap.size;
            const cap = alb.capacidad || 0;
            const elCounter = document.getElementById(`counter-${d.id}`);
            if(elCounter) elCounter.innerText = `Ocupación: ${count} / ${cap}`;
        });
    });
};
window.cargarObservatorio = async function() {
    const list = window.el('obs-list-container'); 
    if(!list) return;
    list.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>';
    window.el('kpi-espera').innerText = "-"; window.el('kpi-alojados').innerText = "-";
    window.el('kpi-libres').innerText = "-"; window.el('kpi-percent').innerText = "-%";
    try {
        let totalEspera = 0, totalAlojados = 0, totalCapacidadGlobal = 0, htmlList = "";
        const alberguesSnap = await getDocs(query(collection(db, "albergues"), where("activo", "==", true)));
        const promesas = alberguesSnap.docs.map(async (docAlb) => {
            const dataAlb = docAlb.data();
            const cap = parseInt(dataAlb.capacidad || 0);
            const esperaSnap = await getDocs(query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", docAlb.id), where("estado", "==", "espera")));
            const w = esperaSnap.size;
            const alojadosSnap = await getDocs(query(collection(db, "albergues", docAlb.id, "personas"), where("estado", "==", "ingresado")));
            const h = alojadosSnap.size;
            return { id: docAlb.id, nombre: dataAlb.nombre, capacidad: cap, espera: w, alojados: h };
        });
        const resultados = await Promise.all(promesas);
        resultados.forEach(res => {
            totalEspera += res.espera; totalAlojados += res.alojados; totalCapacidadGlobal += res.capacidad;
            const libres = Math.max(0, res.capacidad - res.alojados);
            const porcentaje = res.capacidad > 0 ? Math.round((res.alojados / res.capacidad) * 100) : 0;
            let barClass = "low"; if(porcentaje > 50) barClass = "med"; if(porcentaje > 85) barClass = "high";
            htmlList += `<div class="obs-row"><div class="obs-row-title">${res.nombre}</div><div class="obs-stats-group"><div class="obs-mini-stat"><span>Espera</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${res.id}', 'espera')">${res.espera}</strong></div><div class="obs-mini-stat"><span>Alojados</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${res.id}', 'alojados')">${res.alojados}</strong></div><div class="obs-mini-stat"><span>Ocupación</span><strong>${res.alojados} / ${res.capacidad}</strong></div><div class="obs-mini-stat"><span>Libres</span><strong>${libres}</strong></div></div><div class="prog-container"><div class="prog-track"><div class="prog-fill ${barClass}" style="width: ${porcentaje}%"></div></div></div></div>`;
        });
        const globalLibres = Math.max(0, totalCapacidadGlobal - totalAlojados);
        const globalPercent = totalCapacidadGlobal > 0 ? Math.round((totalAlojados / totalCapacidadGlobal) * 100) : 0;
        window.el('kpi-espera').innerText = totalEspera; window.el('kpi-alojados').innerText = totalAlojados;
        window.el('kpi-libres').innerText = globalLibres; window.el('kpi-percent').innerText = `${globalPercent}%`;
        list.innerHTML = htmlList;
    } catch(e) { window.sysLog("Error obs: " + e.message, "error"); list.innerHTML = "<p>Error cargando datos.</p>"; }
};
window.verListaObservatorio = async function(albId, tipo) {
    const c = window.el('obs-modal-content'); const t = window.el('obs-modal-title');
    c.innerHTML = '<div style="text-align:center;"><div class="spinner"></div></div>';
    t.innerText = tipo === 'espera' ? 'Personas en Espera' : 'Personas Alojadas';
    window.safeShow('modal-obs-detalle');
    try {
        let q;
        let isGlobal = false;
        if (tipo === 'espera') {
            q = query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", albId), where("estado", "==", "espera"));
            isGlobal = true;
        } else {
            q = query(collection(db, "albergues", albId, "personas"), where("estado", "==", "ingresado"));
        }
        const snap = await getDocs(q);
        if (snap.empty) { c.innerHTML = '<p>Sin registros.</p>'; return; }
        let data = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));
        if (tipo === 'espera') {
            data.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0));
        } else {
            data.sort((a, b) => {
                if (!a.cama && !b.cama) return 0;
                if (!a.cama) return -1;
                if (!b.cama) return 1;
                return parseInt(a.cama) - parseInt(b.cama);
            });
        }
        let h = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`;
        if(tipo === 'alojados') h += `<th>Cama</th>`;
        h += `<th>Nombre</th><th>DNI</th><th>Tel</th></tr></thead><tbody>`;
        data.forEach(d => {
            const histBtn = `<button class="btn-icon-small" onclick="window.verHistorialObservatorio('${d.id}', ${isGlobal}, '${albId}')"><i class="fa-solid fa-clock-rotate-left"></i></button>`;
            h += `<tr><td style="text-align:center;">${histBtn}</td>`;
            if(tipo === 'alojados') h += `<td><strong>${d.cama || '-'}</strong></td>`;
            h += `<td>${d.nombre} ${d.ap1||''}</td><td>${d.docNum||'-'}</td><td>${d.telefono||'-'}</td></tr>`;
        });
        h += '</tbody></table>';
        c.innerHTML = h;
    } catch (e) { window.sysLog("Error list: " + e.message, "error"); c.innerHTML = "<p>Error al cargar lista.</p>"; }
};
window.verHistorialObservatorio = function(pId, isGlobal, albId) { window.verHistorial(pId, isGlobal, albId); };

// --- GESTIÓN DE USUARIOS (CON SEGURIDAD SUPER_ADMIN & ROLES NUEVOS) ---
window.cargarUsuarios = function() {
    const c = window.el('lista-usuarios-container');
    const filterText = window.safeVal('search-user').toLowerCase().trim();
    unsubscribeUsers = onSnapshot(query(collection(db,"usuarios")), s => {
        c.innerHTML = "";
        if(s.empty) { c.innerHTML="<p>No hay usuarios.</p>"; return; }
        s.forEach(d => {
            const u = d.data();
            if(filterText && !u.nombre.toLowerCase().includes(filterText) && !u.email.toLowerCase().includes(filterText)) return;
            if(currentUserData.rol === 'admin' && u.rol === 'super_admin') return;
            
            const isSuper = (u.rol === 'super_admin');
            const inactiveClass = (u.activo === false) ? 'inactive' : 'active';
            const disabledAttr = isSuper ? 'disabled title="Super Admin no se puede desactivar"' : '';
            
            c.innerHTML += `
            <div class="user-card-item ${inactiveClass}" onclick="window.abrirModalUsuario('${d.id}')">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <div><strong>${u.nombre}</strong><br><small class="role-badge role-${u.rol}">${u.rol}</small></div>
                    <div onclick="event.stopPropagation()">
                        <label class="toggle-switch small">
                            <input type="checkbox" class="toggle-input" onchange="window.cambiarEstadoUsuarioDirecto('${d.id}', this.checked)" ${u.activo!==false?'checked':''} ${disabledAttr}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>`;
        });
    });
};

window.cambiarEstadoUsuarioDirecto = async function(uid, nuevoEstado) {
    if(currentUserData.rol !== 'super_admin' && currentUserData.rol !== 'admin') { 
        alert("Sin permisos"); window.cargarUsuarios(); return; 
    }
    const targetDoc = await getDoc(doc(db, "usuarios", uid));
    if(targetDoc.exists()) {
        const u = targetDoc.data();
        if(u.rol === 'super_admin') { alert("Seguridad: No se puede desactivar a un Super Admin."); window.cargarUsuarios(); return; }
        // NEW: Admin cannot deactivate another Admin
        if(currentUserData.rol === 'admin' && u.rol === 'admin') { alert("Seguridad: No puedes desactivar a otro Administrador."); window.cargarUsuarios(); return; }
    }
    await updateDoc(doc(db,"usuarios",uid), { activo: nuevoEstado });
    window.sysLog(`Usuario ${uid} estado: ${nuevoEstado}`, "info");
};

window.filtrarUsuarios=function(){window.cargarUsuarios();};
window.abrirModalUsuario=async function(id=null){
    userEditingId=id; window.safeShow('modal-crear-usuario');
    const sel=window.el('new-user-role'); sel.innerHTML="";
    
    // NEW ROLES LIST
    let roles = ['albergue', 'sanitario', 'psicosocial', 'observador'];
    // Only Super Admin can create Super Admins/Admins
    if(currentUserData.rol === 'super_admin') {
        roles = ['super_admin', 'admin', ...roles];
    } else if(currentUserData.rol === 'admin') {
         // Admin can create 'admin' ? Prompt said: "crear admin o super_admin" as restriction?
         // "admin... hace todo con las restricciones de... crear admin o super_admin".
         // So Admin CANNOT create admin/super_admin. They see only operational roles.
         // Wait, logic check: Admin can manage users but cannot create Admins. Correct.
    }

    roles.forEach(r=>sel.add(new Option(r,r)));
    
    window.el('new-user-active').checked=true;
    window.el('new-user-active').disabled=false;

    if(id){
        const s=await getDoc(doc(db,"usuarios",String(id)));
        if(s.exists()){
            const d=s.data();
            window.setVal('new-user-name',d.nombre);
            window.setVal('new-user-email',d.email);
            
            // If the role of the user being edited is NOT in the list (e.g. editing an Admin as an Admin), add it temporarily so it shows up
            if(!roles.includes(d.rol)) {
                 const opt = new Option(d.rol, d.rol);
                 opt.disabled = true; // Cannot switch back to it if changed? Or just let them see it.
                 sel.add(opt);
            }
            sel.value=d.rol;
            window.el('new-user-active').checked=(d.activo!==false);
            
            if(d.rol === 'super_admin') window.el('new-user-active').disabled = true;

            if(currentUserData.rol==='super_admin')window.safeShow('btn-delete-user');else window.safeHide('btn-delete-user');
        }
    }else{
        window.setVal('new-user-name',"");
        window.setVal('new-user-email',"");
        window.safeHide('btn-delete-user');
    }
};

window.guardarUsuario=async function(){
    const e=window.safeVal('new-user-email'),p=window.safeVal('new-user-pass'),n=window.safeVal('new-user-name'),r=window.safeVal('new-user-role');
    let isActive=window.el('new-user-active').checked;
    
    if(r === 'super_admin' && !isActive) { alert("Seguridad: Super Admin siempre activo."); isActive = true; }

    if(userEditingId){
        await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r,activo:isActive});
    }else{
        const tApp=initializeApp(firebaseConfig,"Temp");
        const tAuth=getAuth(tApp);
        const uc=await createUserWithEmailAndPassword(tAuth,e,p);
        await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r,activo:isActive});
        await signOut(tAuth);
        deleteApp(tApp);
    }
    window.safeHide('modal-crear-usuario');
    window.sysLog("Usuario guardado.", "success");
};

window.eliminarUsuario=async function(){if(userEditingId&&confirm("Borrar?")){await deleteDoc(doc(db,"usuarios",userEditingId));window.safeHide('modal-crear-usuario');window.sysLog("Usuario eliminado.", "warn");}};
window.abrirModalQR=function(){window.safeShow('modal-qr');const d=window.el("qrcode-display");d.innerHTML="";new QRCode(d,{text:window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`,width:250,height:250});};
window.toggleStartButton=function(){window.el('btn-start-public').disabled=!window.el('check-consent').checked;};
window.iniciarRegistro=function(){window.safeHide('public-welcome-screen');window.safeShow('public-form-container');};
window.publicoGuardarTodo=async function(){const d=window.getDatosFormulario('pub');if(!d.nombre)return alert("Falta nombre");if(!auth.currentUser){try{await signInAnonymously(auth);}catch(e){}}const b=writeBatch(db);const fid=new Date().getTime().toString();const tRef=doc(collection(db,"pool_prefiliacion"));b.set(tRef,{...d,familiaId:fid,rolFamilia:'TITULAR',estado:'espera',origenAlbergueId:currentAlbergueId,fechaRegistro:new Date()});const lRef=collection(db,"pool_prefiliacion",tRef.id,"historial");b.set(doc(lRef),{fecha:new Date(),usuario:"Auto-QR",accion:"Alta en Pool",detalle:`Desde QR Albergue ${currentAlbergueId}`});listaFamiliaresTemp.forEach(async f=>{const fRef=doc(collection(db,"pool_prefiliacion"));b.set(fRef,{...f,familiaId:fid,rolFamilia:'MIEMBRO',estado:'espera',origenAlbergueId:currentAlbergueId,fechaRegistro:new Date()});});await b.commit();window.safeHide('public-form-container');window.safeShow('public-success-msg');}
window.registrarLog=async function(pid,act,det,isPool=false){try{const usuarioLog=currentUserData?currentUserData.nombre:"Auto-QR";let path=isPool?collection(db,"pool_prefiliacion",pid,"historial"):collection(db,"albergues",currentAlbergueId,"personas",pid,"historial");await addDoc(path,{fecha:new Date(),usuario:usuarioLog,accion:act,detalle:det});window.sysLog(`Audit Log (${isPool?'Pool':'Local'}): ${act} - ${det}`,"info");}catch(e){console.error(e);}};
window.verHistorial=async function(pId=null, forceIsGlobal=null, forceAlbId=null){let targetId=pId;let isPool=(forceIsGlobal!==null)?forceIsGlobal:personaEnGestionEsGlobal;const activeAlbId=forceAlbId||currentAlbergueId;if(!targetId&&personaEnGestion)targetId=personaEnGestion.id;if(pId&&forceIsGlobal===null&&listaPersonasCache.find(x=>x.id===pId))isPool=false;if(!targetId)return;window.safeShow('modal-historial');const content=window.el('historial-content');content.innerHTML="Cargando...";try{let path=isPool?collection(db,"pool_prefiliacion",targetId,"historial"):collection(db,"albergues",activeAlbId,"personas",targetId,"historial");const q=query(path,orderBy("fecha","desc"));const snap=await getDocs(q);if(snap.empty){content.innerHTML="<p>No hay movimientos.</p>";return;}let html=`<h4>Historial (${isPool?'Global':'Local'})</h4>`;snap.forEach(doc=>{const d=doc.data();const f=d.fecha.toDate();const fmt=`${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;html+=`<div class="log-item"><strong>${d.accion}</strong><span>${fmt} - Por: ${d.usuario}</span>${d.detalle?`<br><i>${d.detalle}</i>`:''}</div>`;});content.innerHTML=html;}catch(e){content.innerHTML="Error cargando historial.";window.sysLog("Error historial: "+e.message,"error");}};

window.desactivarUsuariosMasivo = async function() {
    if (currentUserData.rol !== 'super_admin' && currentUserData.rol !== 'admin') return alert("No tienes permisos.");
    if (!confirm("⚠️ ATENCIÓN ⚠️\n\nEsta acción desactivará a TODOS los usuarios operativos.\n\nSolo quedarán activos los Administradores.\n\n¿Estás seguro?")) return;
    window.safeShow('loading-overlay');
    try {
        const q = query(collection(db, "usuarios"));
        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);
        let count = 0;
        querySnapshot.forEach((doc) => {
            const u = doc.data();
            // PROTECCIÓN: No tocar admins ni super_admins
            if (u.rol !== 'super_admin' && u.rol !== 'admin') {
                if (u.activo !== false) {
                    batch.update(doc.ref, { activo: false });
                    count++;
                }
            }
        });
        if (count > 0) { await batch.commit(); window.sysLog(`Desactivados: ${count}`, "warn"); alert(`Se han desactivado ${count} usuarios.`); } else { alert("No había usuarios para desactivar."); }
    } catch (e) { console.error(e); alert("Error: " + e.message); } finally { window.safeHide('loading-overlay'); }
};

// --- INIT (NO HOISTING NEEDED, RUNS LAST) ---
window.onload = () => {
    if(isPublicMode){
        window.safeHide('login-screen');
        window.safeShow('public-register-screen');
        window.safeShow('public-welcome-screen');
        window.safeHide('public-form-container');
        getDoc(doc(db,"albergues",currentAlbergueId)).then(s=>{if(s.exists())window.el('public-albergue-name').innerText=s.data().nombre;});
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
            const d = s.data();
            // CHECK ACTIVE STATUS
            if (d.activo === false) {
                window.sysLog("Acceso denegado: Usuario inactivo", "warn");
                alert("Este usuario ha sido desactivado por administración.");
                signOut(auth);
                return;
            }
            currentUserData = {...d, uid: u.uid};
            window.sysLog(`Usuario autenticado: ${currentUserData.nombre} (${currentUserData.rol})`, "success");
            window.safeHide('login-screen');
            window.safeShow('app-shell');
            window.configurarDashboard();
            window.navegar('home');
        }
    } else {
        window.sysLog("Esperando inicio de sesión...", "info");
        window.safeHide('app-shell');
        window.safeShow('login-screen');
    }
});
