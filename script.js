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
let modoCambioCama = false;
let modoMapaGeneral = false;
// For global pool edit, this ID refers to the POOL document ID
let prefiliacionEdicionId = null; 
let highlightedFamilyId = null;

let listaFamiliaresTemp = [];
let adminFamiliaresTemp = [];
let userEditingId = null;
let albergueEdicionId = null;

// --- 3. UTILIDADES ---
window.el = function(id) { return document.getElementById(id); }
window.safeHide = function(id) { const e = window.el(id); if(e) e.classList.add('hidden'); }
window.safeShow = function(id) { const e = window.el(id); if(e) e.classList.remove('hidden'); }
window.safeRemoveActive = function(id) { const e = window.el(id); if(e) e.classList.remove('active'); }
window.safeAddActive = function(id) { const e = window.el(id); if(e) e.classList.add('active'); }
window.safeVal = function(id) { const e = window.el(id); return e ? e.value : ""; }
window.setVal = function(id, val) { const e = window.el(id); if (e) e.value = val; }

window.formatearFecha = function(i) {
    let v = i.value.replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`;
    else i.value = v;
}

window.verificarMenor = function(p) {
    const t = window.el(`${p}-tipo-doc`).value;
    const i = window.el(`${p}-doc-num`);
    if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; }
    else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; }
}

window.limpiarFormulario = function(p) {
    ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = window.el(`${p}-${f}`); if (e) e.value = ""; });
    const i = window.el(`${p}-doc-num`); if (i) i.disabled = false;
}

window.getDatosFormulario = function(p) {
    return {
        nombre: window.safeVal(`${p}-nombre`), ap1: window.safeVal(`${p}-ap1`), ap2: window.safeVal(`${p}-ap2`),
        tipoDoc: window.safeVal(`${p}-tipo-doc`), docNum: window.safeVal(`${p}-doc-num`), fechaNac: window.safeVal(`${p}-fecha`), telefono: window.safeVal(`${p}-tel`)
    };
}

window.actualizarContadores = function() {
    const elOcc = window.el('ocupacion-count'); const elCap = window.el('capacidad-total');
    if (elOcc) elOcc.innerText = ocupacionActual; if (elCap) elCap.innerText = totalCapacidad;
}

window.showToast = function(msg) {
    const t = window.el('toast');
    if(t) { t.innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
}

window.guardarSiCorresponde = async function() {
    if(personaEnGestion && window.el('tab-filiacion') && !window.el('tab-filiacion').classList.contains('hidden')) {
        await window.guardarCambiosPersona(true);
    }
}

// --- 4. QR LÓGICA (GLOBAL POOL) ---
window.actualizarListaFamiliaresUI = function() {
    const d = window.el('lista-familiares-ui'); if(!d) return; d.innerHTML = "";
    if (listaFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>'; return; }
    listaFamiliaresTemp.forEach((f, i) => { d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`; });
}
window.borrarFamiliarTemp = function(i) { listaFamiliaresTemp.splice(i, 1); window.actualizarListaFamiliaresUI(); }
window.abrirModalFamiliar = function() { window.limpiarFormulario('fam'); window.safeShow('modal-add-familiar'); if(window.el('fam-tipo-doc')) window.el('fam-tipo-doc').value="MENOR"; window.verificarMenor('fam'); }
window.cerrarModalFamiliar = function() { window.safeHide('modal-add-familiar'); }
window.guardarFamiliarEnLista = function() { const d=window.getDatosFormulario('fam'); if(!d.nombre) return alert("Nombre obligatorio"); listaFamiliaresTemp.push(d); window.actualizarListaFamiliaresUI(); window.cerrarModalFamiliar(); }

window.publicoGuardarTodo = async function() {
    const mainData = window.getDatosFormulario('pub'); if(!mainData.nombre) return alert("Nombre titular obligatorio.");
    if(!auth.currentUser) { try { await signInAnonymously(auth); } catch(e) {} }

    try {
        const fid = new Date().getTime().toString(); const b = writeBatch(db);
        // Write to GLOBAL POOL
        const tRef = doc(collection(db, "pool_prefiliacion"));
        b.set(tRef, { ...mainData, familiaId: fid, rolFamilia: 'TITULAR', estado: 'espera', fechaRegistro: new Date() });
        
        try { const logRef = collection(db, "pool_prefiliacion", tRef.id, "historial"); await addDoc(logRef, { fecha: new Date(), usuario: "Auto-QR", accion: "Pre-Filiación Global", detalle: "Alta desde QR" }); } catch(e){}

        listaFamiliaresTemp.forEach(async f => {
            const fRef = doc(collection(db, "pool_prefiliacion"));
            b.set(fRef, { ...f, familiaId: fid, rolFamilia: 'MIEMBRO', estado: 'espera', fechaRegistro: new Date() });
        });

        await b.commit();
        window.safeHide('public-form-container');
        window.safeShow('public-success-msg');
    } catch(e) { alert("Error: " + e.message); }
}

// --- 5. LÓGICA PREFILIACIÓN GLOBAL (NUBE) ---
window.buscarEnPrefiliacion = async function(){
    const t = window.safeVal('buscador-pref').toLowerCase().trim();
    const r = window.el('resultados-pref');
    if(t.length < 2) { window.safeHide('resultados-pref'); return; }
    
    // Only search in Global Pool
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
            r.innerHTML += `<div class="search-item" onclick="window.cargarDesdePool('${p.id}')">
                <strong>${p.nombre} ${p.ap1||''} ${p.ap2||''} <span class="badge-global">NUBE</span></strong><br>
                <small>📄 ${p.docNum||'-'}</small>
            </div>`;
        });
        window.safeShow('resultados-pref');
    } catch(e) { console.error(e); }
};

window.cargarDesdePool = async function(pid) {
    window.safeHide('resultados-pref');
    window.el('buscador-pref').value="";
    
    const snap = await getDoc(doc(db, "pool_prefiliacion", pid));
    if(!snap.exists()) return;
    const p = snap.data();
    prefiliacionEdicionId = pid; // ID in the pool

    window.setVal('man-nombre',p.nombre);window.setVal('man-ap1',p.ap1);window.setVal('man-ap2',p.ap2);
    window.setVal('man-tipo-doc',p.tipoDoc);window.setVal('man-doc-num',p.docNum);
    window.setVal('man-fecha',p.fechaNac);window.setVal('man-tel',p.telefono);
    
    // Buttons for Pool Action
    window.safeShow('btn-ingresar-global'); // Show the "Ingresar" button
    window.el('btn-save-pref').innerText = "Guardar Nuevo en Nube"; // Reset text
    window.safeShow('btn-cancelar-edicion-pref');
}

window.ingresarDesdeGlobalAction = async function() {
    if(!prefiliacionEdicionId) return;
    if(!confirm(`¿Ingresar a ${window.safeVal('man-nombre')} en este albergue?`)) return;

    try {
        const batch = writeBatch(db);
        const data = window.getDatosFormulario('man');
        
        // 1. Create in Local Albergue
        const newLocalRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
        batch.set(newLocalRef, {
            ...data,
            estado: 'espera', // Ready for bed assignment
            fechaIngresoAlbergue: new Date(),
            origenGlobal: true
        });

        // 2. Log in Local
        const logRef = doc(collection(db, "albergues", currentAlbergueId, "personas", newLocalRef.id, "historial"));
        batch.set(logRef, {
            fecha: new Date(),
            usuario: currentUserData.nombre,
            accion: `Entrada a Albergue ${currentAlbergueData.nombre}`,
            detalle: "Transferido desde Nube"
        });

        // 3. Delete from Global Pool
        const poolRef = doc(db, "pool_prefiliacion", prefiliacionEdicionId);
        batch.delete(poolRef);

        await batch.commit();
        alert("Persona ingresada correctamente.");
        window.cancelarEdicionPref();
        window.cambiarPestana('filiacion'); // Go to list to assign bed
    } catch(e) {
        alert("Error al ingresar: " + e.message);
    }
}

window.crearNuevoEnPool = async function() {
    const data = window.getDatosFormulario('man');
    if(!data.nombre) return alert("Nombre obligatorio");
    
    try {
        await addDoc(collection(db, "pool_prefiliacion"), {
            ...data,
            fechaRegistro: new Date(),
            estado: 'espera',
            familiaId: new Date().getTime().toString(),
            rolFamilia: 'TITULAR' // Default
        });
        alert("Creado en la Nube Global");
        window.cancelarEdicionPref();
    } catch(e) { alert(e.message); }
}

// --- 6. LÓGICA FILIACIÓN (SALIDA) ---
window.darSalidaPersona = async function() {
    if(!personaEnGestion) return;
    if(!confirm(`¿Confirmar SALIDA de ${personaEnGestion.nombre}?\nPasará a la Nube Global y liberará la cama.`)) return;
    
    await window.guardarSiCorresponde();
    
    try {
        const batch = writeBatch(db);
        const p = personaEnGestion;
        
        // 1. Add to Global Pool
        const poolRef = doc(collection(db, "pool_prefiliacion"));
        const poolData = {
            ...p,
            cama: null,
            estado: 'espera', // Ready to be picked by another albergue
            ultimoAlbergue: currentAlbergueData.nombre,
            fechaSalida: new Date()
        };
        delete poolData.id; // Don't copy local ID
        batch.set(poolRef, poolData);

        // 2. Add Log to Global Pool (Traceability)
        const poolLogRef = doc(collection(db, "pool_prefiliacion", poolRef.id, "historial"));
        batch.set(poolLogRef, {
            fecha: new Date(),
            usuario: currentUserData.nombre,
            accion: `Salida del Albergue ${currentAlbergueData.nombre}`,
            detalle: "Transferido a Nube"
        });

        // 3. Delete from Local (Move complete)
        const localRef = doc(db, "albergues", currentAlbergueId, "personas", p.id);
        batch.delete(localRef);

        await batch.commit();
        alert("Salida realizada. Persona movida a la Nube.");
        window.seleccionarPersona(null); // Clear selection
        window.safeHide('panel-gestion-persona');
        window.buscarPersonaEnAlbergue(); // Refresh list
    } catch(e) {
        alert("Error en salida: " + e.message);
    }
}

// --- STANDARD FUNCTIONS (UNCHANGED LOGIC) ---
window.actualizarListaFamiliaresAdminUI = function() {
    const d = window.el('admin-lista-familiares-ui'); if(!d) return; d.innerHTML = "";
    if (adminFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno.</p>'; return; }
    adminFamiliaresTemp.forEach((f, i) => { d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`; });
}
window.borrarFamiliarAdminTemp = function(i) { adminFamiliaresTemp.splice(i, 1); window.actualizarListaFamiliaresAdminUI(); }
window.abrirModalFamiliarAdmin = function() { window.limpiarFormulario('adm-fam'); window.safeShow('modal-admin-add-familiar'); if(window.el('adm-fam-tipo-doc')) window.el('adm-fam-tipo-doc').value="MENOR"; window.verificarMenor('adm-fam'); }
window.cerrarModalFamiliarAdmin = function() { window.safeHide('modal-admin-add-familiar'); }
window.guardarFamiliarAdmin = function() { const d=window.getDatosFormulario('adm-fam'); if(!d.nombre) return alert("Nombre obligatorio"); adminFamiliaresTemp.push(d); window.actualizarListaFamiliaresAdminUI(); window.cerrarModalFamiliarAdmin(); }
window.abrirModalVincularFamilia = function() { if(!personaEnGestion) return; if(window.el('search-vincular')) window.el('search-vincular').value=""; if(window.el('resultados-vincular')) window.el('resultados-vincular').innerHTML=""; window.safeShow('modal-vincular-familia'); }
window.buscarParaVincular = function() {
    const t=window.safeVal('search-vincular').toLowerCase().trim(); const r=window.el('resultados-vincular'); r.innerHTML="";
    if(t.length<2){window.safeAddActive('hidden');return;}
    const hits=listaPersonasCache.filter(p=>{ if(p.id===personaEnGestion.id)return false; return (p.nombre+" "+(p.ap1||"")).toLowerCase().includes(t); });
    if(hits.length===0){ r.innerHTML="<div class='search-item'>Sin resultados</div>"; }
    else { hits.forEach(p=>{ const d=document.createElement('div'); d.className='search-item'; d.innerHTML=`<strong>${p.nombre}</strong>`; d.onclick=()=>window.vincularAFamilia(p); r.appendChild(d); }); }
    r.classList.remove('hidden');
}
window.vincularAFamilia = async function(target) {
    if(!confirm(`¿Unir a ${personaEnGestion.nombre}?`)) return;
    let tid = target.familiaId; 
    if(!tid) { tid = new Date().getTime().toString()+"-F"; await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",target.id), {familiaId:tid, rolFamilia:'TITULAR'}); }
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id), {familiaId:tid, rolFamilia:'MIEMBRO'});
    alert("Vinculado"); window.safeHide('modal-vincular-familia'); window.seleccionarPersona(personaEnGestion);
}
window.iniciarSesion = async function() { try { await signInWithEmailAndPassword(auth, window.el('login-email').value, window.el('login-pass').value); } catch(e){ alert(e.message); } }
window.cerrarSesion = function() { signOut(auth); location.reload(); }
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
}
window.configurarTabsPorRol = function() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeShow(id));
    if (r === 'intervencion') { window.safeHide('btn-tab-pref'); window.safeHide('btn-tab-fil'); return 'sanitaria'; }
    else if (r === 'filiacion') { window.safeHide('btn-tab-san'); window.safeHide('btn-tab-psi'); return 'prefiliacion'; }
    return 'prefiliacion';
}
window.cambiarPestana = async function(t) {
    await window.guardarSiCorresponde();
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => window.safeHide(id));
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeRemoveActive(id));
    window.safeAddActive(`btn-tab-${t.substring(0,3)}`);
    window.safeShow(`tab-${t}`);
    if (t === 'prefiliacion') {
        window.limpiarFormulario('man'); adminFamiliaresTemp = []; window.actualizarListaFamiliaresAdminUI();
        if(window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML = ""; 
        window.safeHide('panel-gestion-persona');
        window.cancelarEdicionPref();
        window.safeHide('resultados-pref');
    } else if (t === 'filiacion') {
        if(window.el('buscador-persona')) window.el('buscador-persona').value = ""; 
        window.safeHide('resultados-busqueda'); 
        window.safeHide('panel-gestion-persona');
    }
}
window.cancelarEdicionPref = function() {
    prefiliacionEdicionId = null; window.limpiarFormulario('man');
    if(window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML="";
    window.safeHide('btn-historial-pref');
    if(window.el('btn-save-pref')) window.el('btn-save-pref').innerText="Actualizar Registro";
    window.safeHide('btn-cancelar-edicion-pref');
    window.safeHide('btn-ingresar-global'); // Hide global button
}
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
}
window.cargarDatosYEntrar = async function(id) {
    currentAlbergueId = id;
    window.safeShow('loading-overlay');
    try {
        const [dS, qS] = await Promise.all([ getDoc(doc(db,"albergues",id)), getDocs(collection(db,"albergues",id,"personas")) ]);
        if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); }
        listaPersonasCache = []; camasOcupadas = {}; let c=0;
        qS.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
        ocupacionActual = c;
        window.navegar('operativa');
        if(window.el('app-title')) window.el('app-title').innerText = currentAlbergueData.nombre;
        window.configurarDashboard(); window.actualizarContadores();
        window.safeHide('loading-overlay');
        window.conectarListenersBackground(id);
    } catch(e) { alert(e.message); window.safeHide('loading-overlay'); }
}
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
}
window.cargarAlberguesActivos = function() {
    const c = window.el('lista-albergues-activos');
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const div=document.createElement('div'); div.className="mto-card";
            div.innerHTML=`<h3>${d.data().nombre}</h3><div class="mto-info">Entrar</div>`;
            div.onclick=()=>window.cargarDatosYEntrar(d.id);
            c.appendChild(div);
        });
    });
}
window.registrarLog = async function(personaId, accion, detalle = "") {try {const usuarioLog = currentUserData ? currentUserData.nombre : "Auto-Registro QR";await addDoc(collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial"), {fecha: new Date(), usuario: usuarioLog, accion: accion, detalle: detalle});} catch (e) { console.error(e); }};
window.verHistorial = async function(pId = null, altAlbId = null) {const targetId = pId || (personaEnGestion ? personaEnGestion.id : null);const targetAlbId = altAlbId || currentAlbergueId;if(!targetId || !targetAlbId) return;await window.guardarSiCorresponde();window.safeShow('modal-historial');const content = window.el('historial-content');content.innerHTML = "Cargando...";try {const q = query(collection(db, "albergues", targetAlbId, "personas", targetId, "historial"), orderBy("fecha", "desc"));const snap = await getDocs(q);if(snap.empty){ content.innerHTML = "<p>No hay movimientos.</p>"; return; }let html = "";snap.forEach(doc => {const d = doc.data();const f = d.fecha.toDate();const fmt = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;html += `<div class="log-item"><strong>${d.accion}</strong><span>${fmt} - Por: ${d.usuario}</span>${d.detalle ? `<br><i>${d.detalle}</i>` : ''}</div>`;});content.innerHTML = html;} catch (e) { content.innerHTML = "Error cargando historial."; }};
window.verHistorialObservatorio = function(albId, pId) { window.verHistorial(pId, albId); };
window.cargarAlberguesMantenimiento = function() {
    const c = window.el('mto-container');
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
};
window.cargarObservatorio=async function(){const list=window.el('obs-list-container');if(!list)return;list.innerHTML='<p>Cargando...</p>';let gW=0,gH=0,gC=0;try{const sSnap=await getDocs(query(collection(db,"albergues"),where("activo","==",true)));let h="";for(const ds of sSnap.docs){const d=ds.data();const c=parseInt(d.capacidad||0);gC+=c;const pSnap=await getDocs(collection(db,"albergues",ds.id,"personas"));let sW=0,sH=0;pSnap.forEach(p=>{const pd=p.data();if(pd.estado==='espera')sW++;if(pd.estado==='ingresado')sH++;});gW+=sW;gH+=sH;const sF=Math.max(0,c-sH);const sP=c>0?Math.round((sH/c)*100):0;h+=`<div class="obs-row"><div class="obs-row-title">${d.nombre}</div><div style="display:flex;width:100%;justify-content:space-between;"><div class="obs-data-point"><span>Espera</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${ds.id}', 'espera')">${sW}</strong></div><div class="obs-data-point"><span>Alojados</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${ds.id}', 'ingresado')">${sH}</strong></div><div class="obs-data-point"><span>Libres</span><strong>${sF} / ${c}</strong></div><div class="obs-data-point"><span>${sP}%</span></div></div></div>`;}if(window.el('kpi-espera'))window.el('kpi-espera').innerText=gW;if(window.el('kpi-alojados'))window.el('kpi-alojados').innerText=gH;if(window.el('kpi-libres'))window.el('kpi-libres').innerText=`${Math.max(0,gC-gH)}`;if(window.el('kpi-percent'))window.el('kpi-percent').innerText=`${gC>0?Math.round((gH/gC)*100):0}%`;list.innerHTML=h;}catch(e){list.innerHTML="Error";}};
window.verListaObservatorio = async function(albId, est) {const c = window.el('obs-modal-content');const t = window.el('obs-modal-title');c.innerHTML = '<p>Cargando...</p>';t.innerText = est === 'espera' ? 'En Espera' : 'Alojados';window.safeShow('modal-obs-detalle');try {const s = await getDocs(query(collection(db, "albergues", albId, "personas"), where("estado", "==", est)));if (s.empty) { c.innerHTML = '<p>Sin registros.</p>'; return; }let dataArray = [];s.forEach(doc => { dataArray.push({ id: doc.id, ...doc.data() }); });if (est === 'ingresado') {dataArray.sort((a, b) => (parseInt(a.cama)||0) - (parseInt(b.cama)||0));} else {dataArray.sort((a, b) => (b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0));}let h = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`;if(est==='ingresado') h+=`<th>Cama</th>`;h+=`<th>Nombre</th><th>DNI</th><th>Tel</th></tr></thead><tbody>`;dataArray.forEach(d => { h += `<tr><td style="text-align:center;"><button class="btn-icon-small" onclick="window.verHistorialObservatorio('${albId}', '${d.id}')"><i class="fa-solid fa-clock-rotate-left"></i></button></td>`;if(est==='ingresado') h+=`<td><strong>${d.cama||'-'}</strong></td>`;h+=`<td>${d.nombre} ${d.ap1||''}</td><td>${d.docNum||'-'}</td><td>${d.telefono||'-'}</td></tr>`; });h += '</tbody></table>'; c.innerHTML = h;} catch(e) { c.innerHTML = "Error."; }};
window.cargarUsuarios=function(){const c=window.el('lista-usuarios-container');const filterText=window.safeVal('search-user').toLowerCase().trim();unsubscribeUsers=onSnapshot(query(collection(db,"usuarios")),s=>{c.innerHTML="";if(s.empty){c.innerHTML="<p>No hay usuarios.</p>";return;}s.forEach(d=>{const u=d.data();if(filterText&&!u.nombre.toLowerCase().includes(filterText)&&!u.email.toLowerCase().includes(filterText))return;if(currentUserData.rol==='admin'&&u.rol==='super_admin')return;c.innerHTML+=`<div class="user-card-item" onclick="window.abrirModalUsuario('${d.id}')"><strong>${u.nombre}</strong><br><small>${u.rol}</small></div>`;});});};
window.filtrarUsuarios=function(){window.cargarUsuarios();};
window.abrirModalUsuario=async function(id=null){
    userEditingId=id;
    window.safeShow('modal-crear-usuario');
    const sel=window.el('new-user-role');
    sel.innerHTML="";
    ['super_admin','admin','intervencion','filiacion','observador'].forEach(r=>sel.add(new Option(r,r)));
    
    // FIX: Show delete button for super_admin if editing
    if(id){
        const s=await getDoc(doc(db,"usuarios",String(id)));
        if(s.exists()){
            const d=s.data();
            window.setVal('new-user-name',d.nombre);
            window.setVal('new-user-email',d.email);
            sel.value=d.rol;
            if(currentUserData.rol === 'super_admin') window.safeShow('btn-delete-user'); 
            else window.safeHide('btn-delete-user');
        }
    } else {
        window.setVal('new-user-name',"");
        window.setVal('new-user-email',"");
        window.safeHide('btn-delete-user');
    }
};
window.guardarUsuario=async function(){const e=window.safeVal('new-user-email'),p=window.safeVal('new-user-pass'),n=window.safeVal('new-user-name'),r=window.safeVal('new-user-role');if(userEditingId){await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});}else{const tApp=initializeApp(firebaseConfig,"Temp");const tAuth=getAuth(tApp);const uc=await createUserWithEmailAndPassword(tAuth,e,p);await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});await signOut(tAuth);deleteApp(tApp);}window.safeHide('modal-crear-usuario');};
window.eliminarUsuario=async function(){if(userEditingId&&confirm("Borrar?")){await deleteDoc(doc(db,"usuarios",userEditingId));window.safeHide('modal-crear-usuario');}};
window.abrirModalQR=function(){window.safeShow('modal-qr');const d=window.el("qrcode-display");d.innerHTML="";new QRCode(d,{text:window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`,width:250,height:250});};
window.toggleStartButton=function(){window.el('btn-start-public').disabled=!window.el('check-consent').checked;};
window.iniciarRegistro=function(){window.safeHide('public-welcome-screen');window.safeShow('public-form-container');};

// --- INIT ---
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
            currentUserData = {...s.data(), uid: u.uid};
            window.safeHide('login-screen');
            window.safeShow('app-shell');
            window.configurarDashboard();
            window.navegar('home');
        }
    } else {
        window.safeHide('app-shell');
        window.safeShow('login-screen');
    }
});
