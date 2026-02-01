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
    if(window.log) window.log("Modo público activado. ID: " + currentAlbergueId);
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

// --- 3. DEFINICIÓN DIRECTA EN WINDOW (SOLUCIÓN DEFINITIVA) ---

window.safeVal = function(id) { const el = document.getElementById(id); return el ? el.value : ""; }
window.setVal = function(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

window.formatearFecha = function(i) {
    let v = i.value.replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`;
    else i.value = v;
}

window.verificarMenor = function(p) {
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

window.limpiarFormulario = function(p) {
    ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => {
        const el = document.getElementById(`${p}-${f}`);
        if (el) el.value = "";
    });
    const i = document.getElementById(`${p}-doc-num`);
    if (i) i.disabled = false;
}

window.getDatosFormulario = function(p) {
    return {
        nombre: window.safeVal(`${p}-nombre`), ap1: window.safeVal(`${p}-ap1`), ap2: window.safeVal(`${p}-ap2`),
        tipoDoc: window.safeVal(`${p}-tipo-doc`), docNum: window.safeVal(`${p}-doc-num`), fechaNac: window.safeVal(`${p}-fecha`), telefono: window.safeVal(`${p}-tel`)
    };
}

window.actualizarContadores = function() {
    const elOcc = document.getElementById('ocupacion-count');
    const elCap = document.getElementById('capacidad-total');
    if (elOcc) elOcc.innerText = ocupacionActual;
    if (elCap) elCap.innerText = totalCapacidad;
}

// --- LÓGICA QR ---
window.actualizarListaFamiliaresUI = function() {
    const d = document.getElementById('lista-familiares-ui'); d.innerHTML = "";
    if (listaFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>'; return; }
    listaFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`;
    });
}
window.borrarFamiliarTemp = function(i) { listaFamiliaresTemp.splice(i, 1); window.actualizarListaFamiliaresUI(); }
window.abrirModalFamiliar = function() { window.limpiarFormulario('fam'); document.getElementById('modal-add-familiar').classList.remove('hidden'); document.getElementById('fam-tipo-doc').value="MENOR"; window.verificarMenor('fam'); }
window.cerrarModalFamiliar = function() { document.getElementById('modal-add-familiar').classList.add('hidden'); }
window.guardarFamiliarEnLista = function() {
    const d=window.getDatosFormulario('fam');
    if(!d.nombre) return alert("Nombre obligatorio");
    listaFamiliaresTemp.push(d);
    window.actualizarListaFamiliaresUI();
    window.cerrarModalFamiliar();
}
window.publicoGuardarTodo = async function() {
    const mainData = window.getDatosFormulario('pub');
    if(!mainData.nombre) return alert("Nombre obligatorio.");
    if(!currentAlbergueId) return alert("Error ID");
    try {
        const fid = new Date().getTime().toString(); const b = writeBatch(db);
        const tRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
        b.set(tRef, { ...mainData, familiaId: fid, rolFamilia: 'TITULAR', estado: 'espera', fechaRegistro: new Date() });
        const logRef = collection(db, "albergues", currentAlbergueId, "personas", tRef.id, "historial");
        await addDoc(logRef, { fecha: new Date(), usuario: "Auto-QR", accion: "Auto-Registro QR", detalle: "Titular" });
        listaFamiliaresTemp.forEach(async f => {
            const fRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
            b.set(fRef, { ...f, familiaId: fid, rolFamilia: 'MIEMBRO', estado: 'espera', fechaRegistro: new Date() });
             const fLogRef = collection(db, "albergues", currentAlbergueId, "personas", fRef.id, "historial");
             await addDoc(fLogRef, { fecha: new Date(), usuario: "Auto-QR", accion: "Auto-Registro QR", detalle: "Familiar" });
        });
        await b.commit();
        document.getElementById('public-form-container').classList.add('hidden');
        document.getElementById('public-success-msg').classList.remove('hidden');
    } catch(e) { alert("Error: " + e.message); }
}

// --- ADMIN LOGIC ---
window.actualizarListaFamiliaresAdminUI = function() {
    const d = document.getElementById('admin-lista-familiares-ui'); d.innerHTML = "";
    if (adminFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno.</p>'; return; }
    adminFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`;
    });
}
window.borrarFamiliarAdminTemp = function(i) { adminFamiliaresTemp.splice(i, 1); window.actualizarListaFamiliaresAdminUI(); }
window.abrirModalFamiliarAdmin = function() { window.limpiarFormulario('adm-fam'); document.getElementById('modal-admin-add-familiar').classList.remove('hidden'); document.getElementById('adm-fam-tipo-doc').value="MENOR"; window.verificarMenor('adm-fam'); }
window.cerrarModalFamiliarAdmin = function() { document.getElementById('modal-admin-add-familiar').classList.add('hidden'); }
window.guardarFamiliarAdmin = function() {
    const d=window.getDatosFormulario('adm-fam');
    if(!d.nombre) return alert("Nombre obligatorio");
    adminFamiliaresTemp.push(d);
    window.actualizarListaFamiliaresAdminUI();
    window.cerrarModalFamiliarAdmin();
}

window.abrirModalVincularFamilia = function() { if(!personaEnGestion) return; document.getElementById('search-vincular').value=""; document.getElementById('resultados-vincular').innerHTML=""; document.getElementById('modal-vincular-familia').classList.remove('hidden'); }
window.buscarParaVincular = function() {
    const t=window.safeVal('search-vincular').toLowerCase().trim(); const r=document.getElementById('resultados-vincular'); r.innerHTML="";
    if(t.length<2){r.classList.add('hidden');return;}
    const hits=listaPersonasCache.filter(p=>{ if(p.id===personaEnGestion.id)return false; return (p.nombre+" "+(p.ap1||"")).toLowerCase().includes(t); });
    if(hits.length===0){ r.innerHTML="<div class='search-item'>Sin resultados</div>"; }
    else { hits.forEach(p=>{ const d=document.createElement('div'); d.className='search-item'; d.innerHTML=`<strong>${p.nombre}</strong>`; d.onclick=()=>window.vincularAFamilia(p); r.appendChild(d); }); }
    r.classList.remove('hidden');
}
window.vincularAFamilia = async function(target) {
    if(!confirm(`¿Unir a ${personaEnGestion.nombre} con la familia de ${target.nombre}?`)) return;
    let tid = target.familiaId; 
    if(!tid) { tid = new Date().getTime().toString()+"-F"; await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",target.id), {familiaId:tid, rolFamilia:'TITULAR'}); }
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id), {familiaId:tid, rolFamilia:'MIEMBRO'});
    alert("Vinculado"); document.getElementById('modal-vincular-familia').classList.add('hidden'); window.seleccionarPersona(personaEnGestion);
}

// --- TABS & NAV ---
window.configurarTabsPorRol = function() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('hidden');
    });
    if (r === 'intervencion') { document.getElementById('btn-tab-pref').classList.add('hidden'); document.getElementById('btn-tab-fil').classList.add('hidden'); return 'sanitaria'; }
    else if (r === 'filiacion') { document.getElementById('btn-tab-san').classList.add('hidden'); document.getElementById('btn-tab-psi').classList.add('hidden'); return 'prefiliacion'; }
    return 'prefiliacion';
}

window.cambiarPestana = function(t) {
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('active');
    });

    const btnTarget = `btn-tab-${t.substring(0, 3)}`;
    const btnEl = document.getElementById(btnTarget);
    if(btnEl) btnEl.classList.add('active');

    const tabEl = document.getElementById(`tab-${t}`);
    if(tabEl) tabEl.classList.remove('hidden');

    if (t === 'prefiliacion') {
        window.limpiarFormulario('man'); adminFamiliaresTemp = []; window.actualizarListaFamiliaresAdminUI();
        document.getElementById('existing-family-list-ui').innerHTML = "";
        document.getElementById('panel-gestion-persona').classList.add('hidden');
        window.cancelarEdicionPref();
    } else if (t === 'filiacion') {
        document.getElementById('buscador-persona').value = "";
        document.getElementById('resultados-busqueda').classList.add('hidden');
        document.getElementById('panel-gestion-persona').classList.add('hidden');
    }
}

window.cancelarEdicionPref = function() {
    prefiliacionEdicionId = null; window.limpiarFormulario('man');
    document.getElementById('existing-family-list-ui').innerHTML="";
    document.getElementById('btn-historial-pref').classList.add('hidden');
    document.getElementById('btn-save-pref').innerText="Guardar Nuevo";
    document.getElementById('btn-cancelar-edicion-pref').classList.add('hidden');
}

window.iniciarSesion = async function() { try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value); } catch(e){ alert(e.message); } }
window.cerrarSesion = function() { signOut(auth); location.reload(); }

window.navegar = function(p) {
    if(unsubscribeUsers) unsubscribeUsers(); if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    if(!currentUserData) return;
    if(p==='home') document.getElementById('screen-home').classList.remove('hidden');
    else if(p==='gestion-albergues') { window.cargarAlberguesActivos(); document.getElementById('screen-gestion-albergues').classList.remove('hidden'); }
    else if(p==='mantenimiento') { window.cargarAlberguesMantenimiento(); document.getElementById('screen-mantenimiento').classList.remove('hidden'); }
    else if(p==='operativa') { document.getElementById('screen-operativa').classList.remove('hidden'); const t = window.configurarTabsPorRol(); window.cambiarPestana(t); }
    else if(p==='observatorio') { window.cargarObservatorio(); document.getElementById('screen-observatorio').classList.remove('hidden'); }
    else if(p==='usuarios') { window.cargarUsuarios(); document.getElementById('screen-usuarios').classList.remove('hidden'); }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(p.includes('albergue')) document.getElementById('nav-albergues').classList.add('active');
    else if(p.includes('obs')) document.getElementById('nav-obs').classList.add('active');
    else document.getElementById('nav-home').classList.add('active');
}

window.configurarDashboard = function() {
    const r=(currentUserData.rol||"").toLowerCase();
    document.getElementById('user-name-display').innerText=currentUserData.nombre;
    document.getElementById('user-role-badge').innerText=r.toUpperCase();
    if(['super_admin','admin'].includes(r)) { document.getElementById('header-btn-users').classList.remove('hidden'); document.getElementById('nav-mto').classList.remove('disabled'); document.getElementById('nav-obs').classList.remove('hidden'); }
    if(r==='observador') document.getElementById('nav-obs').classList.remove('hidden');
    
    // SAFETY CHECK FOR ADMIN MENU
    const c = document.getElementById('container-ver-ocultos');
    if(c) {
         if(r==='super_admin') c.classList.remove('hidden'); else c.classList.add('hidden');
    }
}

// --- DATA ---
window.cargarDatosYEntrar = async function(id) {
    currentAlbergueId = id;
    document.getElementById('loading-overlay').classList.remove('hidden');
    try {
        const [dS, qS] = await Promise.all([ getDoc(doc(db,"albergues",id)), getDocs(collection(db,"albergues",id,"personas")) ]);
        if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); }
        listaPersonasCache = []; camasOcupadas = {}; let c=0;
        qS.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
        ocupacionActual = c;
        window.navegar('operativa');
        document.getElementById('app-title').innerText = currentAlbergueData.nombre;
        window.configurarDashboard(); window.actualizarContadores();
        const t = window.configurarTabsPorRol(); window.cambiarPestana(t);
        document.getElementById('loading-overlay').classList.add('hidden');
        window.conectarListenersBackground(id);
    } catch(e) { alert(e.message); document.getElementById('loading-overlay').classList.add('hidden'); }
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
    const c = document.getElementById('lista-albergues-activos');
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

// ... Resto de funciones también asignadas a window ...
window.registrarLog = async function(personaId, accion, detalle = "") {try {const usuarioLog = currentUserData ? currentUserData.nombre : "Auto-Registro QR";await addDoc(collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial"), {fecha: new Date(), usuario: usuarioLog, accion: accion, detalle: detalle});} catch (e) { console.error(e); }};
window.verHistorial = async function(pId = null, altAlbId = null) {const targetId = pId || (personaEnGestion ? personaEnGestion.id : null);const targetAlbId = altAlbId || currentAlbergueId;if(!targetId || !targetAlbId) return;const modal = document.getElementById('modal-historial');const content = document.getElementById('historial-content');content.innerHTML = "Cargando...";modal.classList.remove('hidden');try {const q = query(collection(db, "albergues", targetAlbId, "personas", targetId, "historial"), orderBy("fecha", "desc"));const snap = await getDocs(q);if(snap.empty){ content.innerHTML = "<p>No hay movimientos.</p>"; return; }let html = "";snap.forEach(doc => {const d = doc.data();const f = d.fecha.toDate();const fmt = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;html += `<div class="log-item"><strong>${d.accion}</strong><span>${fmt} - Por: ${d.usuario}</span>${d.detalle ? `<br><i>${d.detalle}</i>` : ''}</div>`;});content.innerHTML = html;} catch (e) { content.innerHTML = "Error cargando historial."; }};
window.verHistorialObservatorio = function(albId, pId) { window.verHistorial(pId, albId); };

// ... Y las demás ... (Solo pongo las críticas para no hacer el código gigante, pero el patrón es el mismo)
window.buscarEnPrefiliacion=function(){const t=window.safeVal('buscador-pref').toLowerCase().trim();const r=document.getElementById('resultados-pref');if(t.length<2){r.classList.add('hidden');return;}const hits=listaPersonasCache.filter(p=>{if(p.estado!=='espera') return false;const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();return full.includes(t)||(p.docNum||"").toLowerCase().includes(t)||(p.telefono||"").includes(t);});r.innerHTML="";hits.forEach(p=>{r.innerHTML += `<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')"><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><br><small>📄 ${p.docNum||'-'} | 📞 ${p.telefono||'-'}</small></div>`;});r.classList.remove('hidden');};
window.cargarParaEdicionPref=function(pid){const p=listaPersonasCache.find(x=>x.id===pid); if(!p)return;prefiliacionEdicionId=p.id;document.getElementById('resultados-pref').classList.add('hidden');document.getElementById('buscador-pref').value="";window.setVal('man-nombre',p.nombre);window.setVal('man-ap1',p.ap1);window.setVal('man-ap2',p.ap2);window.setVal('man-tipo-doc',p.tipoDoc);window.setVal('man-doc-num',p.docNum);window.setVal('man-fecha',p.fechaNac);window.setVal('man-tel',p.telefono);const l=document.getElementById('existing-family-list-ui'); l.innerHTML="";if(p.familiaId){const fs=listaPersonasCache.filter(x=>x.familiaId===p.familiaId&&x.id!==p.id);if(fs.length>0){l.innerHTML="<h5>Familiares:</h5>";fs.forEach(f=>{l.innerHTML+=`<div class="fam-item existing"><div><strong>${f.nombre} ${f.ap1||''}</strong><br><small style="color:#666;">${f.docNum||'-'} | ${f.telefono||'-'}</small></div></div>`;});}}const btnH=document.getElementById('btn-historial-pref');if(['admin','super_admin'].includes(currentUserData.rol)) { btnH.classList.remove('hidden'); btnH.onclick=()=>window.verHistorial(p.id); } else btnH.classList.add('hidden');document.getElementById('btn-save-pref').innerText="Actualizar Registro";document.getElementById('btn-cancelar-edicion-pref').classList.remove('hidden');};
window.buscarPersonaEnAlbergue=function(){const txt=window.safeVal('buscador-persona').toLowerCase().trim();const res=document.getElementById('resultados-busqueda');if(txt.length<2){res.classList.add('hidden');return;}const hits=listaPersonasCache.filter(p=>{const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();return full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt);});res.innerHTML="";if(hits.length===0){res.innerHTML=`<div class="search-item" style="color:#666">No encontrado</div>`;}else{hits.forEach(p=>{const dc=p.estado==='ingresado'?'dot-green':'dot-red';res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}')"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><div style="font-size:0.8rem;color:#666;">📄 ${p.docNum||'-'} | 📞 ${p.telefono||'-'}</div></div><div class="status-dot ${dc}" title="${p.estado.toUpperCase()}"></div></div></div>`;});}res.classList.remove('hidden');};
window.seleccionarPersona=function(pid){if(typeof pid!=='string')pid=pid.id;const p=listaPersonasCache.find(x=>x.id===pid);if(!p)return;personaEnGestion=p;document.getElementById('resultados-busqueda').classList.add('hidden');document.getElementById('panel-gestion-persona').classList.remove('hidden');document.getElementById('gestion-nombre-titulo').innerText=p.nombre;document.getElementById('gestion-estado').innerText=p.estado.toUpperCase();document.getElementById('gestion-cama-info').innerText=p.cama?`Cama: ${p.cama}`:"";window.setVal('edit-nombre',p.nombre);window.setVal('edit-ap1',p.ap1);window.setVal('edit-ap2',p.ap2);window.setVal('edit-tipo-doc',p.tipoDoc);window.setVal('edit-doc-num',p.docNum);window.setVal('edit-fecha',p.fechaNac);window.setVal('edit-tel',p.telefono);const r=(currentUserData.rol||"").toLowerCase().trim();const btnH=document.getElementById('btn-historial-ficha');if(['admin','super_admin'].includes(r)) btnH.classList.remove('hidden'); else btnH.classList.add('hidden');const flist=document.getElementById('info-familia-lista'); flist.innerHTML="";const fam=listaPersonasCache.filter(x=>x.familiaId&&x.familiaId===p.familiaId);document.getElementById('info-familia-resumen').innerText=fam.length>1?`Familia (${fam.length})`:"Individual";fam.forEach(f=>{if(f.id!==p.id){const st=f.estado==='ingresado'?'color:var(--success);':'color:var(--warning);';const ic=f.estado==='ingresado'?'fa-solid fa-bed':'fa-solid fa-clock';flist.innerHTML+=`<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.seleccionarPersona('${f.id}')"><div><div style="font-weight:bold;font-size:0.95rem;">${f.nombre} ${f.ap1||''}</div><div style="font-size:0.85rem;color:#666;"><i class="fa-regular fa-id-card"></i> ${f.docNum||'-'} &nbsp;|&nbsp; <i class="fa-solid fa-phone"></i> ${f.telefono||'-'}</div></div><div style="font-size:1.2rem;${st}"><i class="${ic}"></i></div></div>`;}});};
window.guardarCambiosPersona=async function(){if(!personaEnGestion)return;const p=window.getDatosFormulario('edit');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),p);window.registrarLog(personaEnGestion.id,"Edición Datos","Manual");alert("Guardado");};
window.adminPrefiliarManual=async function(){if(prefiliacionEdicionId){const p=window.getDatosFormulario('man');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),p);window.registrarLog(prefiliacionEdicionId,"Edición Pre-filiación","Manual");if(adminFamiliaresTemp.length>0){const tit=listaPersonasCache.find(x=>x.id===prefiliacionEdicionId);const fid=tit.familiaId||new Date().getTime().toString();if(!tit.familiaId){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),{familiaId:fid,rolFamilia:'TITULAR'});}for(const f of adminFamiliaresTemp){const ref=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});window.registrarLog(ref.id,"Registro Familiar","Manual");}}alert("Actualizado");window.cancelarEdicionPref();return;}const n=window.safeVal('man-nombre');if(!n)return alert("Falta nombre");const fid=new Date().getTime().toString();const t=window.getDatosFormulario('man');t.estado='espera';t.familiaId=fid;t.rolFamilia='TITULAR';t.fechaRegistro=new Date();const ref=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),t);window.registrarLog(ref.id,"Registro Manual","Titular");for(const f of adminFamiliaresTemp){const refF=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});window.registrarLog(refF.id,"Registro Manual","Familiar");}alert("Guardado");window.limpiarFormulario('man');adminFamiliaresTemp=[];document.getElementById('admin-lista-familiares-ui').innerHTML="Ninguno.";};
window.abrirMapaGeneral = function() { modoMapaGeneral=true; window.mostrarGridCamas(); };
window.abrirSeleccionCama = function() { modoMapaGeneral=false; window.mostrarGridCamas(); };
window.cerrarMapaCamas = function(){highlightedFamilyId=null;document.getElementById('modal-cama').classList.add('hidden');};
window.highlightFamily = function(pid){const o=listaPersonasCache.find(p=>p.id===pid);if(!o||!o.familiaId)return;highlightedFamilyId=(highlightedFamilyId===o.familiaId)?null:o.familiaId;window.mostrarGridCamas();};
window.guardarCama = async function(c){if(personaEnGestion.cama){alert(`Error: Ya tiene cama.`);return;}await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});window.registrarLog(personaEnGestion.id,"Asignación Cama",`Cama ${c}`);window.cerrarMapaCamas();}
window.mostrarGridCamas=function(){const g=document.getElementById('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};listaPersonasCache.forEach(p=>{if(p.familiaId)shadowMap[p.cama]=p.familiaId;});for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occ=listaPersonasCache.find(p=>p.cama===n);const d=document.createElement('div');d.className="bed-box "+(occ?"bed-busy":"bed-free");d.innerText=n;if(occ)d.innerHTML+=`<div style="font-size:0.6em">${occ.nombre}</div>`;d.onclick=()=>{if(occ&&!modoMapaGeneral){window.abrirModalInfoCama(occ);}else if(!occ&&!modoMapaGeneral){window.guardarCama(n);}};d.ondblclick=()=>{if(occ)window.abrirModalInfoCama(occ);};g.appendChild(d);}document.getElementById('modal-cama').classList.remove('hidden');}
window.abrirModalInfoCama=function(p){document.getElementById('info-cama-num').innerText=p.cama;document.getElementById('info-nombre-completo').innerText=p.nombre;document.getElementById('modal-bed-info').classList.remove('hidden');};
window.liberarCamaMantener=async function(){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{cama:null});};
window.regresarPrefiliacion=async function(){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{estado:'espera',cama:null});};
window.abrirModalAlbergue=async function(id=null){albergueEdicionId=id;document.getElementById('modal-albergue').classList.remove('hidden');const b=document.getElementById('btn-delete-albergue');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();window.setVal('mto-nombre',d.nombre);window.setVal('mto-capacidad',d.capacidad);window.setVal('mto-columnas',d.columnas);const r=(currentUserData.rol||"").toLowerCase().trim();if(r==='super_admin')b.classList.remove('hidden');else b.classList.add('hidden');}else{window.setVal('mto-nombre',"");window.setVal('mto-capacidad',"");b.classList.add('hidden');}};
window.guardarAlbergue=async function(){const n=window.safeVal('mto-nombre'),c=window.safeVal('mto-capacidad'),col=window.safeVal('mto-columnas');if(!n||!c)return alert("Datos inc.");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});document.getElementById('modal-albergue').classList.add('hidden');};
window.eliminarAlbergueActual=async function(){if(albergueEdicionId&&confirm("¿Borrar?")){const ps=await getDocs(collection(db,"albergues",albergueEdicionId,"personas"));const b=writeBatch(db);ps.forEach(d=>b.delete(d.ref));await b.commit();await deleteDoc(doc(db,"albergues",albergueEdicionId));alert("Borrado");document.getElementById('modal-albergue').classList.add('hidden');}};
window.cargarAlberguesMantenimiento=function(){const c=document.getElementById('mto-container');unsubscribeAlberguesMto=onSnapshot(query(collection(db,"albergues")),s=>{c.innerHTML="<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";s.forEach(d=>{const a=d.data();let extraBtn=currentUserData.rol==='super_admin'?`<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}',${!a.activo})">${a.activo===false?'Activar':'Archivar'}</button>`:"";c.innerHTML+=`<div class="mto-card ${!a.activo?'archived':''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`;});});};
window.cambiarEstadoAlbergue=async function(id,st){await updateDoc(doc(db,"albergues",id),{activo:st});};
window.cargarObservatorio=async function(){const list=document.getElementById('obs-list-container');if(!list)return;list.innerHTML='<p>Cargando...</p>';let gW=0,gH=0,gC=0;try{const sSnap=await getDocs(query(collection(db,"albergues"),where("activo","==",true)));let h="";for(const ds of sSnap.docs){const d=ds.data();const c=parseInt(d.capacidad||0);gC+=c;const pSnap=await getDocs(collection(db,"albergues",ds.id,"personas"));let sW=0,sH=0;pSnap.forEach(p=>{const pd=p.data();if(pd.estado==='espera')sW++;if(pd.estado==='ingresado')sH++;});gW+=sW;gH+=sH;const sF=Math.max(0,c-sH);const sP=c>0?Math.round((sH/c)*100):0;h+=`<div class="obs-row"><div class="obs-row-title">${d.nombre}</div><div style="display:flex;width:100%;justify-content:space-between;"><div class="obs-data-point"><span>Espera</span><strong>${sW}</strong></div><div class="obs-data-point"><span>Alojados</span><strong>${sH}</strong></div><div class="obs-data-point"><span>Libres</span><strong>${sF}</strong></div><div class="obs-data-point"><span>${sP}%</span></div></div></div>`;}document.getElementById('kpi-espera').innerText=gW;document.getElementById('kpi-alojados').innerText=gH;document.getElementById('kpi-libres').innerText=`${Math.max(0,gC-gH)}`;document.getElementById('kpi-percent').innerText=`${gC>0?Math.round((gH/gC)*100):0}%`;list.innerHTML=h;}catch(e){list.innerHTML="Error";}};
window.cargarUsuarios=function(){const c=document.getElementById('lista-usuarios-container');const filterText=window.safeVal('search-user').toLowerCase().trim();unsubscribeUsers=onSnapshot(query(collection(db,"usuarios")),s=>{c.innerHTML="";if(s.empty){c.innerHTML="<p>No hay usuarios.</p>";return;}s.forEach(d=>{const u=d.data();if(filterText&&!u.nombre.toLowerCase().includes(filterText)&&!u.email.toLowerCase().includes(filterText))return;if(currentUserData.rol==='admin'&&u.rol==='super_admin')return;c.innerHTML+=`<div class="user-card-item" onclick="window.abrirModalUsuario('${d.id}')"><strong>${u.nombre}</strong><br><small>${u.rol}</small></div>`;});});};
window.filtrarUsuarios=function(){window.cargarUsuarios();};
window.abrirModalUsuario=async function(id=null){userEditingId=id;document.getElementById('modal-crear-usuario').classList.remove('hidden');const sel=document.getElementById('new-user-role');sel.innerHTML="";['super_admin','admin','intervencion','filiacion','observador'].forEach(r=>sel.add(new Option(r,r)));if(id){const s=await getDoc(doc(db,"usuarios",String(id)));if(s.exists()){const d=s.data();window.setVal('new-user-name',d.nombre);window.setVal('new-user-email',d.email);sel.value=d.rol;}}else{window.setVal('new-user-name',"");window.setVal('new-user-email',"");}};
window.guardarUsuario=async function(){const e=window.safeVal('new-user-email'),p=window.safeVal('new-user-pass'),n=window.safeVal('new-user-name'),r=window.safeVal('new-user-role');if(userEditingId){await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});}else{const tApp=initializeApp(firebaseConfig,"Temp");const tAuth=getAuth(tApp);const uc=await createUserWithEmailAndPassword(tAuth,e,p);await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});await signOut(tAuth);deleteApp(tApp);}document.getElementById('modal-crear-usuario').classList.add('hidden');};
window.eliminarUsuario=async function(){if(userEditingId&&confirm("Borrar?")){await deleteDoc(doc(db,"usuarios",userEditingId));document.getElementById('modal-crear-usuario').classList.add('hidden');}};
window.abrirModalCambioPass=function(){window.setVal('chg-old-pass','');window.setVal('chg-new-pass','');window.setVal('chg-confirm-pass','');document.getElementById('modal-change-pass').classList.remove('hidden');};
window.ejecutarCambioPass=async function(){const o=window.safeVal('chg-old-pass'),n=window.safeVal('chg-new-pass');try{await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,o));await updatePassword(auth.currentUser,n);alert("OK");document.getElementById('modal-change-pass').classList.add('hidden');}catch(e){alert("Error");}};
window.abrirModalQR=function(){document.getElementById('modal-qr').classList.remove('hidden');const d=document.getElementById("qrcode-display");d.innerHTML="";new QRCode(d,{text:window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`,width:250,height:250});};
window.toggleStartButton=function(){document.getElementById('btn-start-public').disabled=!document.getElementById('check-consent').checked;};
window.iniciarRegistro=function(){document.getElementById('public-welcome-screen').classList.add('hidden');document.getElementById('public-form-container').classList.remove('hidden');};

// --- INIT ---
window.onload = () => {
    if(isPublicMode){
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('public-register-screen').classList.remove('hidden');
        document.getElementById('public-welcome-screen').classList.remove('hidden');
        document.getElementById('public-form-container').classList.add('hidden');
        getDoc(doc(db,"albergues",currentAlbergueId)).then(s=>{if(s.exists())document.getElementById('public-albergue-name').innerText=s.data().nombre;});
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
            window.configurarDashboard();
            window.navegar('home');
        }
    } else {
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
});
