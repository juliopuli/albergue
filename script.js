import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
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
let personaEnGestionEsGlobal = false;
let modoCambioCama = false; 
let modoMapaGeneral = false;
let prefiliacionEdicionId = null; 
let highlightedFamilyId = null;

let listaFamiliaresTemp = [];
let adminFamiliaresTemp = [];
let userEditingId = null;
let albergueEdicionId = null;

// --- LOGGER ---
window.logError = function(msg) {
    console.log(msg);
    const box = document.getElementById('debug-box');
    if(box) {
        box.innerHTML += `<div style="border-bottom:1px solid #333;">> ${msg}</div>`;
        box.scrollTop = box.scrollHeight;
    }
};

// --- 3. UTILIDADES ---
window.el = function(id) { return document.getElementById(id); };
window.safeHide = function(id) { const e = window.el(id); if(e) e.classList.add('hidden'); };
window.safeShow = function(id) { const e = window.el(id); if(e) e.classList.remove('hidden'); };
window.safeRemoveActive = function(id) { const e = window.el(id); if(e) e.classList.remove('active'); };
window.safeAddActive = function(id) { const e = window.el(id); if(e) e.classList.add('active'); };
window.safeVal = function(id) { const e = window.el(id); return e ? e.value : ""; };
window.setVal = function(id, val) { const e = window.el(id); if (e) e.value = val; };
window.formatearFecha = function(i) { let v = i.value.replace(/\D/g, '').slice(0, 8); if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`; else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`; else i.value = v; };
window.verificarMenor = function(p) { const t = window.el(`${p}-tipo-doc`).value; const i = window.el(`${p}-doc-num`); if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; } else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; } };
window.limpiarFormulario = function(p) { ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = window.el(`${p}-${f}`); if (e) e.value = ""; }); const i = window.el(`${p}-doc-num`); if (i) i.disabled = false; };
window.getDatosFormulario = function(p) { return { nombre: window.safeVal(`${p}-nombre`), ap1: window.safeVal(`${p}-ap1`), ap2: window.safeVal(`${p}-ap2`), tipoDoc: window.safeVal(`${p}-tipo-doc`), docNum: window.safeVal(`${p}-doc-num`), fechaNac: window.safeVal(`${p}-fecha`), telefono: window.safeVal(`${p}-tel`) }; };
window.actualizarContadores = function() { const elOcc = window.el('ocupacion-count'); const elCap = window.el('capacidad-total'); if (elOcc) elOcc.innerText = ocupacionActual; if (elCap) elCap.innerText = totalCapacidad; };
window.showToast = function(msg) { const t = window.el('toast'); if(t) { t.innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); } };

// --- 4. AUTH ---
window.iniciarSesion = async function() { 
    try { await signInWithEmailAndPassword(auth, window.el('login-email').value, window.el('login-pass').value); } 
    catch(e){ alert(e.message); } 
};
window.cerrarSesion = function() { signOut(auth); location.reload(); };

// --- 5. SMART SAVE ---
window.setupAutoSave = function() {}; 
window.guardarSiCorresponde = async function() {
    // Only auto-save local records to avoid accidental global writes
    try {
        if (personaEnGestion && !personaEnGestionEsGlobal && window.el('tab-filiacion') && !window.el('tab-filiacion').classList.contains('hidden')) { await window.guardarCambiosPersona(true); }
    } catch(e) { window.logError("Autosave skipped: " + e.message); }
};

// --- 6. QR & PUBLIC ---
window.actualizarListaFamiliaresUI = function() { const d = window.el('lista-familiares-ui'); if(!d) return; d.innerHTML = ""; if (listaFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>'; return; } listaFamiliaresTemp.forEach((f, i) => { d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`; }); };
window.borrarFamiliarTemp = function(i) { listaFamiliaresTemp.splice(i, 1); window.actualizarListaFamiliaresUI(); };
window.abrirModalFamiliar = function() { window.limpiarFormulario('fam'); window.safeShow('modal-add-familiar'); if(window.el('fam-tipo-doc')) window.el('fam-tipo-doc').value="MENOR"; window.verificarMenor('fam'); };
window.cerrarModalFamiliar = function() { window.safeHide('modal-add-familiar'); };
window.guardarFamiliarEnLista = function() { const d=window.getDatosFormulario('fam'); if(!d.nombre) return alert("Nombre obligatorio"); listaFamiliaresTemp.push(d); window.actualizarListaFamiliaresUI(); window.cerrarModalFamiliar(); };

window.publicoGuardarTodo = async function() {
    const mainData = window.getDatosFormulario('pub'); if(!mainData.nombre) return alert("Nombre titular obligatorio.");
    if(!auth.currentUser) { try { await signInAnonymously(auth); } catch(e) {} }
    try {
        const fid = new Date().getTime().toString(); const b = writeBatch(db);
        const tRef = doc(collection(db, "pool_prefiliacion"));
        b.set(tRef, { ...mainData, familiaId: fid, rolFamilia: 'TITULAR', estado: 'espera', fechaRegistro: new Date() });
        const logRef = doc(collection(db, "pool_prefiliacion", tRef.id, "historial")); 
        b.set(logRef, { fecha: new Date(), usuario: "Auto-QR", accion: "Pre-Filiación Global", detalle: "Alta desde QR" });
        listaFamiliaresTemp.forEach(async f => {
            const fRef = doc(collection(db, "pool_prefiliacion"));
            b.set(fRef, { ...f, familiaId: fid, rolFamilia: 'MIEMBRO', estado: 'espera', fechaRegistro: new Date() });
        });
        await b.commit();
        window.safeHide('public-form-container'); window.safeShow('public-success-msg');
    } catch(e) { alert("Error: " + e.message); }
};

// --- 7. UNIFIED SEARCH & MANAGEMENT ---
window.buscarPersonaEnAlbergue = async function() {
    const txt = window.safeVal('buscador-persona').toLowerCase().trim(); const res = window.el('resultados-busqueda');
    if(txt.length < 2) { window.safeHide('resultados-busqueda'); return; }
    
    // Local Search
    const localHits = listaPersonasCache.filter(p => {
        const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
        return full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt);
    });

    // Global Search
    let globalHits = [];
    try {
        const snap = await getDocs(collection(db, "pool_prefiliacion"));
        snap.forEach(doc => {
            const p = doc.data(); p.id = doc.id; p.isGlobal = true;
            const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
            if(full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt)) globalHits.push(p);
        });
    } catch(e) { window.logError("Global Search Error: " + e.message); }

    res.innerHTML = "";
    if(localHits.length === 0 && globalHits.length === 0){
        res.innerHTML = `<div class="search-item" style="color:#666">No encontrado</div>`;
    } else {
        localHits.forEach(p => {
            const dc = p.estado==='ingresado' ? 'dot-green' : 'dot-red';
            res.innerHTML += `<div class="search-item" onclick="window.seleccionarPersona('${p.id}')"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong><br><span class="badge-global" style="background:#e0e7ff;color:#333;">LOCAL</span></div><div class="status-dot ${dc}"></div></div></div>`;
        });
        globalHits.forEach(p => {
            window.tempGlobalMatch = window.tempGlobalMatch || {}; window.tempGlobalMatch[p.id] = p;
            res.innerHTML += `<div class="search-item" onclick="window.seleccionarPersonaGlobal('${p.id}')" style="background:#f0f9ff;"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong><br><span class="badge-global">NUBE</span></div><div class="status-dot dot-orange"></div></div></div>`;
        });
    }
    window.safeShow('resultados-busqueda');
};

window.seleccionarPersona = function(pid) {
    if(typeof pid!=='string')pid=pid.id; const p = listaPersonasCache.find(x => x.id === pid); if(!p) return;
    personaEnGestion = p; personaEnGestionEsGlobal = false;
    window.safeHide('resultados-busqueda'); window.safeShow('panel-gestion-persona');
    if(window.el('gestion-nombre-titulo')) window.el('gestion-nombre-titulo').innerText = p.nombre;
    if(window.el('gestion-estado')) window.el('gestion-estado').innerText = p.estado.toUpperCase();
    if(window.el('gestion-cama-info')) window.el('gestion-cama-info').innerText = p.cama ? `Cama: ${p.cama}` : "";
    window.setVal('edit-nombre', p.nombre); window.setVal('edit-ap1', p.ap1); window.setVal('edit-ap2', p.ap2); window.setVal('edit-tipo-doc', p.tipoDoc); window.setVal('edit-doc-num', p.docNum); window.setVal('edit-fecha', p.fechaNac); window.setVal('edit-tel', p.telefono);
    window.safeShow('btn-guardar-cambios'); window.safeShow('btn-liberar-cama'); window.safeShow('btn-dar-salida'); window.safeShow('btn-vincular-familia');
    const r=(currentUserData.rol||"").toLowerCase().trim(); if(['admin','super_admin'].includes(r)) window.safeShow('btn-historial-ficha'); else window.safeHide('btn-historial-ficha');
    const flist = window.el('info-familia-lista'); flist.innerHTML = ""; const fam = listaPersonasCache.filter(x => x.familiaId && x.familiaId === p.familiaId);
    if(window.el('info-familia-resumen')) window.el('info-familia-resumen').innerText = fam.length > 1 ? `Familia (${fam.length})` : "Individual";
    fam.forEach(f => { if(f.id !== p.id) { flist.innerHTML += `<div style="padding:10px;border-bottom:1px solid #eee;">${f.nombre} ${f.ap1||''}</div>`; } });
    window.setupAutoSave();
};

window.seleccionarPersonaGlobal = function(gid) {
    const p = window.tempGlobalMatch[gid]; if(!p) return;
    personaEnGestion = p; personaEnGestionEsGlobal = true;
    window.safeHide('resultados-busqueda'); window.safeShow('panel-gestion-persona');
    
    if(window.el('gestion-nombre-titulo')) window.el('gestion-nombre-titulo').innerText = p.nombre + " (Nube)";
    if(window.el('gestion-estado')) window.el('gestion-estado').innerText = "EN ESPERA";
    if(window.el('gestion-cama-info')) window.el('gestion-cama-info').innerText = "Sin Asignar";
    
    window.setVal('edit-nombre', p.nombre); window.setVal('edit-ap1', p.ap1); window.setVal('edit-ap2', p.ap2); 
    window.setVal('edit-tipo-doc', p.tipoDoc); window.setVal('edit-doc-num', p.docNum); 
    window.setVal('edit-fecha', p.fechaNac); window.setVal('edit-tel', p.telefono);
    
    // Disable local actions until admitted
    window.safeHide('btn-guardar-cambios'); window.safeHide('btn-liberar-cama'); 
    window.safeHide('btn-dar-salida'); window.safeHide('btn-vincular-familia'); window.safeHide('btn-historial-ficha');
    
    if(window.el('info-familia-resumen')) window.el('info-familia-resumen').innerText = "Datos de la Nube";
    window.el('info-familia-lista').innerHTML = "<p>Asigna cama para ingresar y ver familia.</p>";
};

// --- 8. ATOMIC BED ASSIGNMENT (FIXED) ---
window.guardarCama = async function(c) {
    const camaStr = c.toString();
    if(camasOcupadas[camaStr]) return alert("Cama ocupada.");
    
    // CASE A: LOCAL UPDATE
    if(!personaEnGestionEsGlobal) {
        if(personaEnGestion.cama) return alert("Ya tiene cama.");
        await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id), {
            estado: 'ingresado', cama: camaStr, fechaIngreso: new Date()
        });
        window.registrarLog(personaEnGestion.id, "Asignación Cama", `Cama ${c}`);
        window.cerrarMapaCamas();
        return;
    }
    
    // CASE B: GLOBAL -> LOCAL (TRANSFER)
    if(!confirm(`¿INGRESAR a ${personaEnGestion.nombre} desde la Nube y asignar cama ${c}?`)) return;
    
    try {
        const batch = writeBatch(db);
        
        // 1. Create Local Record
        const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
        const data = { ...personaEnGestion };
        delete data.id; delete data.isGlobal;
        batch.set(localRef, { ...data, estado: 'ingresado', cama: camaStr, fechaIngresoAlbergue: new Date(), origenGlobal: true });
        
        // 2. Logs
        const logRef1 = doc(collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial"));
        batch.set(logRef1, { fecha: new Date(), usuario: currentUserData.nombre, accion: `Entrada a Albergue ${currentAlbergueData.nombre}`, detalle: "Desde Nube" });
        const logRef2 = doc(collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial"));
        batch.set(logRef2, { fecha: new Date(), usuario: currentUserData.nombre, accion: "Asignación Cama", detalle: `Cama ${c}` });
        
        // 3. Delete Global Record
        const globalRef = doc(db, "pool_prefiliacion", personaEnGestion.id);
        batch.delete(globalRef);
        
        await batch.commit();
        alert("Persona ingresada y cama asignada.");
        window.cerrarMapaCamas();
        window.seleccionarPersona(null); 
        window.safeHide('panel-gestion-persona');
        // List refreshes automatically via snapshot
    } catch(e) { alert("Error: " + e.message); window.logError(e.message); }
};

// --- 9. PREFILIACIÓN & POOL ---
window.buscarEnPrefiliacion = async function(){
    const t = window.safeVal('buscador-pref').toLowerCase().trim();
    const r = window.el('resultados-pref');
    if(t.length < 2) { window.safeHide('resultados-pref'); return; }
    try {
        const snap = await getDocs(collection(db, "pool_prefiliacion"));
        let matches = [];
        snap.forEach(doc => {
            const p = doc.data(); p.id = doc.id;
            const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
            if(full.includes(t) || (p.docNum||"").toLowerCase().includes(t)) matches.push(p);
        });
        r.innerHTML="";
        matches.forEach(p => { 
            window.tempGlobalMatch = window.tempGlobalMatch || {}; window.tempGlobalMatch[p.id] = p;
            r.innerHTML += `<div class="search-item" onclick="window.cargarDesdePool('${p.id}')"><strong>${p.nombre} ${p.ap1||''} <span class="badge-global">NUBE</span></strong><br><small>📄 ${p.docNum||'-'}</small></div>`; 
        });
        window.safeShow('resultados-pref');
    } catch(e) { console.error(e); }
};

window.cargarDesdePool = async function(pid) {
    // Only used for manual editing in Prefiliación tab, does not assign bed immediately
    window.safeHide('resultados-pref');
    const p = window.tempGlobalMatch[pid]; if(!p) return;
    prefiliacionEdicionId = pid;
    window.setVal('man-nombre',p.nombre);window.setVal('man-ap1',p.ap1);window.setVal('man-ap2',p.ap2);
    window.setVal('man-tipo-doc',p.tipoDoc);window.setVal('man-doc-num',p.docNum);
    window.setVal('man-fecha',p.fechaNac);window.setVal('man-tel',p.telefono);
    window.safeShow('btn-cancelar-edicion-pref');
};

window.crearNuevoEnPool = async function() {
    const data = window.getDatosFormulario('man'); if(!data.nombre) return alert("Nombre obligatorio");
    try { await addDoc(collection(db, "pool_prefiliacion"), { ...data, fechaRegistro: new Date(), estado: 'espera', familiaId: new Date().getTime().toString(), rolFamilia: 'TITULAR' }); alert("Creado en la Nube Global"); window.cancelarEdicionPref(); } catch(e) { alert(e.message); }
};

window.darSalidaPersona = async function() {
    if(!personaEnGestion) return; if(!confirm(`¿Confirmar SALIDA de ${personaEnGestion.nombre}?`)) return;
    await window.guardarSiCorresponde();
    try {
        const batch = writeBatch(db); const p = personaEnGestion;
        const poolRef = doc(collection(db, "pool_prefiliacion"));
        const poolData = { ...p, cama: null, estado: 'espera', ultimoAlbergue: currentAlbergueData.nombre, fechaSalida: new Date() }; delete poolData.id; 
        batch.set(poolRef, poolData);
        const poolLogRef = doc(collection(db, "pool_prefiliacion", poolRef.id, "historial"));
        batch.set(poolLogRef, { fecha: new Date(), usuario: currentUserData.nombre, accion: `Salida del Albergue ${currentAlbergueData.nombre}`, detalle: "A Nube" });
        const localRef = doc(db, "albergues", currentAlbergueId, "personas", p.id); batch.delete(localRef);
        await batch.commit(); alert("Salida realizada."); window.seleccionarPersona(null); window.safeHide('panel-gestion-persona');
    } catch(e) { alert("Error: " + e.message); }
};

// --- CORE ---
window.navegar = async function(p) {
    if(currentUserData) await window.guardarSiCorresponde();
    if(unsubscribeUsers) unsubscribeUsers(); if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio'].forEach(id=>window.safeHide(id));
    if(!currentUserData) return;
    if(p==='home') window.safeShow('screen-home');
    else if(p==='gestion-albergues') { window.cargarAlberguesActivos(); window.safeShow('screen-gestion-albergues'); }
    else if(p==='mantenimiento') { window.cargarAlberguesMantenimiento(); window.safeShow('screen-mantenimiento'); }
    else if(p==='operativa') { window.safeShow('screen-operativa'); const t = window.configurarTabsPorRol(); window.cambiarPestana(t); } 
    else if(p==='observatorio') { window.cargarObservatorio(); window.safeShow('screen-observatorio'); }
    else if(p==='usuarios') { window.cargarUsuarios(); window.safeShow('screen-usuarios'); }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(p.includes('albergue')) window.safeAddActive('nav-albergues');
    else if(p.includes('obs')) window.safeAddActive('nav-obs');
    else if(p.includes('mantenimiento')) window.safeAddActive('nav-mto');
    else window.safeAddActive('nav-home');
};
window.configurarTabsPorRol = function() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeShow(id));
    if (r === 'intervencion') { window.safeHide('btn-tab-pref'); window.safeHide('btn-tab-fil'); return 'sanitaria'; }
    else if (r === 'filiacion') { window.safeHide('btn-tab-san'); window.safeHide('btn-tab-psi'); return 'prefiliacion'; }
    return 'prefiliacion';
};
window.cambiarPestana = async function(t) {
    await window.guardarSiCorresponde();
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => window.safeHide(id));
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeRemoveActive(id));
    window.safeAddActive(`btn-tab-${t.substring(0,3)}`);
    window.safeShow(`tab-${t}`);
    if (t === 'prefiliacion') {
        window.limpiarFormulario('man'); prefiliacionEdicionId = null; window.safeHide('btn-cancelar-edicion-pref');
    } else if (t === 'filiacion') {
        window.safeHide('resultados-busqueda'); window.safeHide('panel-gestion-persona');
    }
};
window.cancelarEdicionPref = function() {
    prefiliacionEdicionId = null; window.limpiarFormulario('man'); window.safeHide('btn-cancelar-edicion-pref');
};
window.configurarDashboard = function() {
    const r=(currentUserData.rol||"").toLowerCase();
    if(window.el('user-name-display')) window.el('user-name-display').innerText=currentUserData.nombre;
    if(window.el('user-role-badge')) window.el('user-role-badge').innerText=r.toUpperCase();
    window.safeHide('header-btn-users'); window.safeAddActive('nav-mto'); 
    window.safeHide('nav-obs'); window.safeHide('nav-albergues');
    if(['super_admin', 'admin'].includes(r)) { window.safeShow('header-btn-users'); if(window.el('nav-mto')) window.el('nav-mto').classList.remove('disabled'); }
    if(['super_admin','admin','observador'].includes(r)) window.safeShow('nav-obs');
    if(r !== 'observador') window.safeShow('nav-albergues');
    if(r==='super_admin') window.safeShow('container-ver-ocultos');
};
window.cargarDatosYEntrar = async function(id) {
    currentAlbergueId = id; window.safeShow('loading-overlay');
    try {
        const [dS, qS] = await Promise.all([ getDoc(doc(db,"albergues",id)), getDocs(collection(db,"albergues",id,"personas")) ]);
        if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); }
        listaPersonasCache = []; camasOcupadas = {}; let c=0;
        qS.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
        ocupacionActual = c; window.navegar('operativa');
        if(window.el('app-title')) window.el('app-title').innerText = currentAlbergueData.nombre;
        window.configurarDashboard(); window.actualizarContadores(); window.safeHide('loading-overlay');
        window.conectarListenersBackground(id); window.setupAutoSave();
    } catch(e) { alert(e.message); window.safeHide('loading-overlay'); }
};
window.conectarListenersBackground = function(id) {
    if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();
    unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); window.actualizarContadores(); } });
    if(unsubscribePersonas) unsubscribePersonas();
    unsubscribePersonas = onSnapshot(collection(db,"albergues",id,"personas"), s=>{
        listaPersonasCache=[]; camasOcupadas={}; let c=0;
        s.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
        ocupacionActual=c; window.actualizarContadores();
        if(personaEnGestion) { const u=listaPersonasCache.find(x=>x.id===personaEnGestion.id); if(u) window.seleccionarPersona(u); }
    });
};
window.cargarAlberguesActivos = function() {
    const c = window.el('lista-albergues-activos');
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s=>{
        c.innerHTML="";
        s.forEach(d=>{ const div=document.createElement('div'); div.className="mto-card"; div.innerHTML=`<h3>${d.data().nombre}</h3><div class="mto-info">Entrar</div>`; div.onclick=()=>window.cargarDatosYEntrar(d.id); c.appendChild(div); });
    });
};
window.registrarLog = async function(personaId, accion, detalle = "") {try {const usuarioLog = currentUserData ? currentUserData.nombre : "Auto-Registro QR";await addDoc(collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial"), {fecha: new Date(), usuario: usuarioLog, accion: accion, detalle: detalle});} catch (e) { console.error(e); }};
window.verHistorial = async function(pId = null, altAlbId = null) {
    const targetId = pId || (personaEnGestion ? personaEnGestion.id : null);
    if(!targetId) return;
    await window.guardarSiCorresponde();
    window.safeShow('modal-historial');const content = window.el('historial-content');content.innerHTML = "Cargando...";
    try {
        let q;
        if(personaEnGestionEsGlobal) {
             q = query(collection(db, "pool_prefiliacion", targetId, "historial"), orderBy("fecha", "desc"));
        } else {
             q = query(collection(db, "albergues", currentAlbergueId, "personas", targetId, "historial"), orderBy("fecha", "desc"));
        }
        const snap = await getDocs(q);
        if(snap.empty){ content.innerHTML = "<p>No hay movimientos.</p>"; return; }
        let html = "";
        snap.forEach(doc => {const d = doc.data();const f = d.fecha.toDate();const fmt = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;html += `<div class="log-item"><strong>${d.accion}</strong><span>${fmt} - Por: ${d.usuario}</span>${d.detalle ? `<br><i>${d.detalle}</i>` : ''}</div>`;});
        content.innerHTML = html;
    } catch (e) { content.innerHTML = "Error cargando historial."; }
};
window.verHistorialObservatorio = function(albId, pId) { window.verHistorial(pId, albId); };
window.cargarAlberguesMantenimiento = function() {const c = window.el('mto-container');unsubscribeAlberguesMto = onSnapshot(query(collection(db,"albergues")), s => {c.innerHTML = "<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";s.forEach(d => {const a = d.data();let extraBtn = currentUserData.rol==='super_admin' ? `<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}', ${!a.activo})">${a.activo === false ? 'Activar' : 'Archivar'}</button>` : "";c.innerHTML += `<div class="mto-card ${!a.activo ? 'archived' : ''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`;});});};
window.abrirModalAlbergue=async function(id=null){albergueEdicionId=id;window.safeShow('modal-albergue');const b=window.el('btn-delete-albergue');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();window.setVal('mto-nombre',d.nombre);window.setVal('mto-capacidad',d.capacidad);window.setVal('mto-columnas',d.columnas);const r=(currentUserData.rol||"").toLowerCase().trim();if(r==='super_admin')window.safeShow('btn-delete-albergue');else window.safeHide('btn-delete-albergue');}else{window.setVal('mto-nombre',"");window.setVal('mto-capacidad',"");window.safeHide('btn-delete-albergue');}};
window.cargarObservatorio=async function(){const list=window.el('obs-list-container');if(!list)return;list.innerHTML='<p>Cargando...</p>';let gW=0,gH=0,gC=0;try{const sSnap=await getDocs(query(collection(db,"albergues"),where("activo","==",true)));let h="";for(const ds of sSnap.docs){const d=ds.data();const c=parseInt(d.capacidad||0);gC+=c;const pSnap=await getDocs(collection(db,"albergues",ds.id,"personas"));let sW=0,sH=0;pSnap.forEach(p=>{const pd=p.data();if(pd.estado==='espera')sW++;if(pd.estado==='ingresado')sH++;});gW+=sW;gH+=sH;const sF=Math.max(0,c-sH);const sP=c>0?Math.round((sH/c)*100):0;h+=`<div class="obs-row" onclick="window.activarVistaSplitObservatorio('${ds.id}')"><div class="obs-row-title">${d.nombre}</div><div style="display:flex;width:100%;justify-content:space-between;"><div class="obs-data-point"><span>Espera</span><strong class="obs-clickable" onclick="event.stopPropagation();window.verListaObservatorio('${ds.id}', 'espera')">${sW}</strong></div><div class="obs-data-point"><span>Alojados</span><strong class="obs-clickable" onclick="event.stopPropagation();window.verListaObservatorio('${ds.id}', 'ingresado')">${sH}</strong></div><div class="obs-data-point"><span>Libres</span><strong>${sF} / ${c}</strong></div><div class="obs-data-point"><span>${sP}%</span></div></div></div>`;}if(window.el('kpi-espera'))window.el('kpi-espera').innerText=gW;if(window.el('kpi-alojados'))window.el('kpi-alojados').innerText=gH;if(window.el('kpi-libres'))window.el('kpi-libres').innerText=`${Math.max(0,gC-gH)}`;if(window.el('kpi-percent'))window.el('kpi-percent').innerText=`${gC>0?Math.round((gH/gC)*100):0}%`;list.innerHTML=h;}catch(e){list.innerHTML="Error";}};
window.activarVistaSplitObservatorio = async function(albId) {const layout=window.el('obs-layout-container');const miniGrid=window.el('mini-bed-grid');const title=window.el('mini-map-title');layout.classList.add('active');miniGrid.innerHTML='<div class="spinner"></div>';try{const [docSnap,pSnap]=await Promise.all([getDoc(doc(db,"albergues",albId)),getDocs(query(collection(db,"albergues",albId,"personas"),where("estado","==","ingresado")))]);const albData=docSnap.data();title.innerText="Mapa: "+albData.nombre;const cap=parseInt(albData.capacidad||0);const cols=parseInt(albData.columnas||8);let occupiedBeds={};pSnap.forEach(d=>{const p=d.data();if(p.cama)occupiedBeds[p.cama]=true;});miniGrid.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;miniGrid.innerHTML="";for(let i=1;i<=cap;i++){const n=i.toString();const d=document.createElement('div');d.className="mini-bed "+(occupiedBeds[n]?"bg-busy":"bg-free");d.innerHTML=`<div class="mini-bed-content">${n}</div>`;miniGrid.appendChild(d);}}catch(e){miniGrid.innerHTML="Error.";}};
window.cerrarDetalleObservatorio = function() { window.el('obs-layout-container').classList.remove('active'); };
window.verListaObservatorio = async function(albId, est) {const c = window.el('obs-modal-content');const t = window.el('obs-modal-title');c.innerHTML = '<p>Cargando...</p>';t.innerText = est === 'espera' ? 'En Espera' : 'Alojados';window.safeShow('modal-obs-detalle');try {const s = await getDocs(query(collection(db, "albergues", albId, "personas"), where("estado", "==", est)));if (s.empty) { c.innerHTML = '<p>Sin registros.</p>'; return; }let dataArray = [];s.forEach(doc => { dataArray.push({ id: doc.id, ...doc.data() }); });if (est === 'ingresado') {dataArray.sort((a, b) => (parseInt(a.cama)||0) - (parseInt(b.cama)||0));} else {dataArray.sort((a, b) => (b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0));}let h = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`;if(est==='ingresado') h+=`<th>Cama</th>`;h+=`<th>Nombre</th><th>DNI</th><th>Tel</th></tr></thead><tbody>`;dataArray.forEach(d => { h += `<tr><td style="text-align:center;"><button class="btn-icon-small" onclick="window.verHistorialObservatorio('${albId}', '${d.id}')"><i class="fa-solid fa-clock-rotate-left"></i></button></td>`;if(est==='ingresado') h+=`<td><strong>${d.cama||'-'}</strong></td>`;h+=`<td>${d.nombre} ${d.ap1||''}</td><td>${d.docNum||'-'}</td><td>${d.telefono||'-'}</td></tr>`; });h += '</tbody></table>'; c.innerHTML = h;} catch(e) { c.innerHTML = "Error."; }};
window.cargarUsuarios=function(){const c=window.el('lista-usuarios-container');const filterText=window.safeVal('search-user').toLowerCase().trim();unsubscribeUsers=onSnapshot(query(collection(db,"usuarios")),s=>{c.innerHTML="";if(s.empty){c.innerHTML="<p>No hay usuarios.</p>";return;}s.forEach(d=>{const u=d.data();if(filterText&&!u.nombre.toLowerCase().includes(filterText)&&!u.email.toLowerCase().includes(filterText))return;if(currentUserData.rol==='admin'&&u.rol==='super_admin')return;c.innerHTML+=`<div class="user-card-item" onclick="window.abrirModalUsuario('${d.id}')"><strong>${u.nombre}</strong><br><small>${u.rol}</small></div>`;});});};
window.filtrarUsuarios=function(){window.cargarUsuarios();};
window.abrirModalUsuario=async function(id=null){userEditingId=id;window.safeShow('modal-crear-usuario');const sel=window.el('new-user-role');sel.innerHTML="";['super_admin','admin','intervencion','filiacion','observador'].forEach(r=>sel.add(new Option(r,r)));if(id){const s=await getDoc(doc(db,"usuarios",String(id)));if(s.exists()){const d=s.data();window.setVal('new-user-name',d.nombre);window.setVal('new-user-email',d.email);sel.value=d.rol;if(currentUserData.rol==='super_admin')window.safeShow('btn-delete-user');else window.safeHide('btn-delete-user');}}else{window.setVal('new-user-name',"");window.setVal('new-user-email',"");window.safeHide('btn-delete-user');}};
window.guardarUsuario=async function(){const e=window.safeVal('new-user-email'),p=window.safeVal('new-user-pass'),n=window.safeVal('new-user-name'),r=window.safeVal('new-user-role');if(userEditingId){await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});}else{const tApp=initializeApp(firebaseConfig,"Temp");const tAuth=getAuth(tApp);const uc=await createUserWithEmailAndPassword(tAuth,e,p);await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});await signOut(tAuth);deleteApp(tApp);}window.safeHide('modal-crear-usuario');};
window.eliminarUsuario=async function(){if(userEditingId&&confirm("Borrar?")){await deleteDoc(doc(db,"usuarios",userEditingId));window.safeHide('modal-crear-usuario');}};
window.abrirModalQR=function(){window.safeShow('modal-qr');const d=window.el("qrcode-display");d.innerHTML="";new QRCode(d,{text:window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`,width:250,height:250});};
window.toggleStartButton=function(){window.el('btn-start-public').disabled=!window.el('check-consent').checked;};
window.iniciarRegistro=function(){window.safeHide('public-welcome-screen');window.safeShow('public-form-container');};

// --- INIT ---
window.onload = () => {
    if(isPublicMode){
        window.safeHide('login-screen'); window.safeShow('public-register-screen'); window.safeShow('public-welcome-screen'); window.safeHide('public-form-container');
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
            currentUserData = {...s.data(), uid: u.uid};
            window.safeHide('login-screen'); window.safeShow('app-shell'); window.configurarDashboard(); window.navegar('home');
        } else {
            // SAFEGUARD: User authenticated but no DB record
            alert("Usuario sin permisos o eliminado. Contacte al administrador.");
            signOut(auth);
        }
    } else {
        window.safeHide('app-shell'); window.safeShow('login-screen');
    }
});
