import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// ============================================
// 1. STATE VARIABLES
// ============================================
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

// ============================================
// 2. FUNCTION DECLARATIONS (HOISTED)
// ============================================

// --- LOGGING ---
function toggleCajaNegra() { const bb = document.getElementById('black-box-overlay'); if(bb) bb.classList.toggle('hidden'); }
function limpiarCajaNegra() { const c = document.getElementById('black-box-content'); if(c) c.innerHTML = ""; }
function sysLog(msg, type='info') {
    const c = document.getElementById('black-box-content'); if(!c) return;
    const now = new Date(); const t = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    const div = document.createElement('div'); div.className = 'log-entry';
    div.innerHTML = `<span class="log-time">[${t}]</span> <span class="log-type-${type}">[${type.toUpperCase()}]</span> ${msg}`;
    c.appendChild(div); c.scrollTop = c.scrollHeight;
    if(type==='error') console.error(msg); else console.log(msg);
}

// --- CORE AUTH & NAV ---
async function iniciarSesion() { try{ await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value); }catch(e){ sysLog(e.message,'error'); alert(e.message); } }
function cerrarSesion() { signOut(auth); location.reload(); }
function navegar(p) {
    sysLog(`Navegando a ${p}`, 'nav');
    if(unsubscribeUsers) unsubscribeUsers(); if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
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
function configurarTabsPorRol() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => safeShow(id));
    if (r === 'intervencion') { safeHide('btn-tab-pref'); safeHide('btn-tab-fil'); return 'sanitaria'; }
    return 'filiacion';
}
function cambiarPestana(t) {
    sysLog(`Tab: ${t}`, 'nav');
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => safeHide(id));
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => safeRemoveActive(id));
    safeAddActive(`btn-tab-${t.substring(0,3)}`); safeShow(`tab-${t}`);
    if (t === 'prefiliacion') { limpiarFormulario('man'); adminFamiliaresTemp=[]; actualizarListaFamiliaresAdminUI(); if(el('existing-family-list-ui')) el('existing-family-list-ui').innerHTML=""; cancelarEdicionPref(); }
    else if (t === 'filiacion') { if(el('buscador-persona')) el('buscador-persona').value=""; safeHide('resultados-busqueda'); safeHide('panel-gestion-persona'); personaEnGestion=null; }
}

// --- DATA LOGIC ---
async function cargarDatosYEntrar(id) {
    currentAlbergueId = id; sysLog(`Cargando Albergue ${id}`, 'info'); safeShow('loading-overlay');
    try {
        const dS = await getDoc(doc(db,"albergues",id));
        if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); }
        if(unsubscribePersonas) unsubscribePersonas();
        unsubscribePersonas = onSnapshot(collection(db,"albergues",id,"personas"), s=>{
            listaPersonasCache=[]; camasOcupadas={}; let c=0;
            s.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
            ocupacionActual=c; actualizarContadores();
            if(personaEnGestion && !personaEnGestionEsGlobal) { const u=listaPersonasCache.find(x=>x.id===personaEnGestion.id); if(u) seleccionarPersona(u, false); }
        });
        if(unsubscribePool) unsubscribePool();
        unsubscribePool = onSnapshot(collection(db, "pool_prefiliacion"), s => {
            listaGlobalPrefiliacion = []; s.forEach(d => { const p = d.data(); p.id = d.id; listaGlobalPrefiliacion.push(p); });
            sysLog(`Pool actualizado: ${listaGlobalPrefiliacion.length}`, 'info');
        });
        navegar('operativa');
        if(el('app-title')) el('app-title').innerText = currentAlbergueData.nombre;
        configurarDashboard(); actualizarContadores(); safeHide('loading-overlay');
        conectarListenersBackground(id); setupAutoSave();
    } catch(e) { sysLog(e.message, 'error'); safeHide('loading-overlay'); }
}
function conectarListenersBackground(id) { if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc(); unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); actualizarContadores(); } }); }

// --- ACTIONS ---
async function guardarCama(c) {
    if (personaEnGestionEsGlobal) {
        if(!confirm(`¿Ingresar desde nube y asignar cama ${c}?`)) return;
        try {
            const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId);
            const batch = writeBatch(db);
            let newLocalId = null;
            familia.forEach(member => {
                const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
                const mData = {...member}; delete mData.id; mData.fechaIngresoAlbergue = new Date(); mData.origenPoolId = member.id;
                if(member.id === personaEnGestion.id) { mData.estado='ingresado'; mData.cama=c.toString(); mData.fechaIngreso=new Date(); newLocalId=localRef.id; } else { mData.estado='espera'; }
                batch.set(localRef, mData); batch.delete(doc(db, "pool_prefiliacion", member.id));
                batch.set(doc(collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial")), {fecha: new Date(), usuario: currentUserData.nombre, accion: "Ingreso+Cama", detalle: `Cama ${c}`});
            });
            await batch.commit();
            cerrarMapaCamas(); showToast("Ingreso realizado.");
            // Try to switch context to local
            setTimeout(()=>{
                const newP = listaPersonasCache.find(p=>p.id===newLocalId);
                if(newP) seleccionarPersona(newP, false); else safeHide('panel-gestion-persona');
            }, 1000);
        } catch(e) { sysLog(e.message,'error'); }
        return;
    }
    if(personaEnGestion.cama){ alert("Ya tiene cama"); return; }
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});
    registrarLog(personaEnGestion.id,"Asignación Cama",`Cama ${c}`);
    cerrarMapaCamas();
}

async function vincularAFamilia(target) {
    if(!confirm(`¿Unir a ${personaEnGestion.nombre}?`)) return;
    try {
        const path = personaEnGestionEsGlobal ? "pool_prefiliacion" : `albergues/${currentAlbergueId}/personas`;
        let tid = target.familiaId; const batch = writeBatch(db);
        if(!tid) { tid = new Date().getTime()+"-F"; batch.update(doc(db, path, target.id), {familiaId: tid, rolFamilia: 'TITULAR'}); }
        batch.update(doc(db, path, personaEnGestion.id), {familiaId: tid, rolFamilia: 'MIEMBRO'});
        await batch.commit(); alert("Vinculado"); safeHide('modal-vincular-familia'); seleccionarPersona(personaEnGestion, personaEnGestionEsGlobal);
    } catch(e) { sysLog(e.message,'error'); }
}

async function adminPrefiliarManual(silent=false) {
    if(silent && !prefiliacionEdicionId) return;
    if(prefiliacionEdicionId && isGlobalEdit){
        const p=getDatosFormulario('man'); await updateDoc(doc(db,"pool_prefiliacion",prefiliacionEdicionId),p);
        registrarLog(prefiliacionEdicionId,"Edición Pool","Manual", true);
        if(!silent){ alert("Actualizado"); cancelarEdicionPref(); }
        return;
    }
    const n=safeVal('man-nombre'); if(!n) return alert("Falta nombre");
    const fid=new Date().getTime().toString(); const t=getDatosFormulario('man');
    t.estado='espera'; t.familiaId=fid; t.rolFamilia='TITULAR'; t.fechaRegistro=new Date(); t.origenAlbergueId=currentAlbergueId;
    const ref=await addDoc(collection(db,"pool_prefiliacion"),t);
    registrarLog(ref.id,"Alta Staff","Titular", true);
    for(const f of adminFamiliaresTemp){
        const refF=await addDoc(collection(db,"pool_prefiliacion"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date(), origenAlbergueId: currentAlbergueId});
        registrarLog(refF.id,"Alta Staff","Familiar", true);
    }
    alert("Guardado en Nube"); limpiarFormulario('man'); adminFamiliaresTemp=[]; actualizarListaFamiliaresAdminUI();
}

async function darSalidaPersona() {
    if(!personaEnGestion || personaEnGestionEsGlobal) return;
    if(!confirm("¿Dar salida al Pool Global?")) return;
    try {
        const fam = listaPersonasCache.filter(x => x.familiaId === personaEnGestion.familiaId);
        const batch = writeBatch(db);
        fam.forEach(m => {
            const newRef = doc(collection(db, "pool_prefiliacion"));
            const d = {...m}; delete d.id; d.cama=null; d.estado='espera'; d.fechaSalida=new Date();
            batch.set(newRef, d); batch.delete(doc(db, "albergues", currentAlbergueId, "personas", m.id));
            batch.set(doc(collection(db, "pool_prefiliacion", newRef.id, "historial")), {fecha:new Date(), usuario:currentUserData.nombre, accion:"Salida", detalle:"Salida Albergue"});
        });
        await batch.commit(); alert("Salida realizada"); safeHide('panel-gestion-persona'); safeHide('resultados-busqueda'); el('buscador-persona').value="";
    } catch(e) { sysLog(e.message, 'error'); }
}

async function rescatarDeGlobalDirecto() {
    if(!personaEnGestion || !personaEnGestionEsGlobal) return;
    if(!confirm("¿Ingresar en albergue?")) return;
    try {
        const fam = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId);
        const batch = writeBatch(db);
        fam.forEach(m => {
            const newRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
            const d = {...m}; delete d.id; d.fechaIngresoAlbergue=new Date(); d.origenPoolId=m.id; d.estado='espera';
            batch.set(newRef, d); batch.delete(doc(db, "pool_prefiliacion", m.id));
            batch.set(doc(collection(db, "albergues", currentAlbergueId, "personas", newRef.id, "historial")), {fecha:new Date(), usuario:currentUserData.nombre, accion:"Ingreso", detalle:"Desde Nube"});
        });
        await batch.commit(); alert("Ingresado. Asigne cama."); personaEnGestion=null; safeHide('panel-gestion-persona'); el('buscador-persona').value="";
    } catch(e) { sysLog(e.message, 'error'); }
}

// --- UTILS & HELPERS (Hoisted automatically but defined clearly) ---
function el(id) { return document.getElementById(id); }
function safeHide(id) { const e = el(id); if(e) e.classList.add('hidden'); }
function safeShow(id) { const e = el(id); if(e) e.classList.remove('hidden'); }
function safeRemoveActive(id) { const e = el(id); if(e) e.classList.remove('active'); }
function safeAddActive(id) { const e = el(id); if(e) e.classList.add('active'); }
function safeVal(id) { const e = el(id); return e ? e.value : ""; }
function setVal(id, val) { const e = el(id); if (e) e.value = val; }
function formatearFecha(i) { let v = i.value.replace(/\D/g, '').slice(0, 8); if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`; else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`; else i.value = v; }
function verificarMenor(p) { const t = el(`${p}-tipo-doc`).value; const i = el(`${p}-doc-num`); if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; } else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; } }
function limpiarFormulario(p) { ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = el(`${p}-${f}`); if (e) e.value = ""; }); const i = el(`${p}-doc-num`); if (i) i.disabled = false; }
function configurarDashboard() { const r=(currentUserData.rol||"").toLowerCase(); if(el('user-name-display')) el('user-name-display').innerText=currentUserData.nombre; if(el('user-role-badge')) el('user-role-badge').innerText=r.toUpperCase(); safeHide('header-btn-users'); safeAddActive('nav-mto'); safeHide('nav-obs'); safeHide('nav-albergues'); if(['super_admin', 'admin'].includes(r)) { safeShow('header-btn-users'); if(el('nav-mto')) el('nav-mto').classList.remove('disabled'); } if(['super_admin','admin','observador'].includes(r)) safeShow('nav-obs'); if(r !== 'observador') safeShow('nav-albergues'); if(r==='super_admin') safeShow('container-ver-ocultos'); }

function buscarEnPrefiliacion() {
    const t=safeVal('buscador-pref').toLowerCase().trim(); const r=el('resultados-pref');
    if(t.length<2){safeHide('resultados-pref');return;}
    const hits=listaGlobalPrefiliacion.filter(p=>{ const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase(); return full.includes(t)||(p.docNum||"").toLowerCase().includes(t)||(p.telefono||"").includes(t); });
    r.innerHTML=""; if(hits.length===0) r.innerHTML="<div class='search-item'>Sin resultados</div>";
    hits.forEach(p=>{r.innerHTML += `<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')"><strong>${p.nombre} ${p.ap1||''}</strong> (Nube)</div>`;});
    safeShow('resultados-pref');
}
function cargarParaEdicionPref(pid) {
    const p=listaGlobalPrefiliacion.find(x=>x.id===pid); if(!p)return; prefiliacionEdicionId=p.id; isGlobalEdit=true; safeHide('resultados-pref');
    el('buscador-pref').value=""; setVal('man-nombre',p.nombre); setVal('man-ap1',p.ap1); setVal('man-ap2',p.ap2); setVal('man-tipo-doc',p.tipoDoc); setVal('man-doc-num',p.docNum); setVal('man-fecha',p.fechaNac); setVal('man-tel',p.telefono);
    const l=el('existing-family-list-ui'); l.innerHTML=""; 
    if(p.familiaId){ const fs=listaGlobalPrefiliacion.filter(x=>x.familiaId===p.familiaId&&x.id!==p.id); if(fs.length>0){ l.innerHTML="<h5>Familiares:</h5>"; fs.forEach(f=>{l.innerHTML+=`<div>${f.nombre}</div>`;}); } }
    el('btn-save-pref').innerText="Actualizar Global"; safeShow('btn-cancelar-edicion-pref');
}
function buscarPersonaEnAlbergue() {
    const t=safeVal('buscador-persona').toLowerCase().trim(); const r=el('resultados-busqueda');
    if(t.length<2){safeHide('resultados-busqueda');return;}
    const local=listaPersonasCache.filter(p=>{ const f=`${p.nombre} ${p.ap1||''}`.toLowerCase(); return f.includes(t)||(p.docNum||"").includes(t); });
    const global=listaGlobalPrefiliacion.filter(p=>{ const f=`${p.nombre} ${p.ap1||''}`.toLowerCase(); return f.includes(t)||(p.docNum||"").includes(t); });
    r.innerHTML="";
    local.forEach(p=>{ r.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}',false)">${p.nombre} (Local)</div>`; });
    global.forEach(p=>{ r.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}',true)">${p.nombre} (Nube)</div>`; });
    safeShow('resultados-busqueda');
}
function seleccionarPersona(pid, isGlobal) {
    let p; if(isGlobal) p=listaGlobalPrefiliacion.find(x=>x.id===pid); else p=listaPersonasCache.find(x=>x.id===pid);
    if(!p)return; personaEnGestion=p; prefiliacionEdicionId=p.id; isGlobalEdit=isGlobal; personaEnGestionEsGlobal=isGlobal;
    safeHide('resultados-busqueda'); safeShow('panel-gestion-persona');
    el('gestion-nombre-titulo').innerText=p.nombre; el('gestion-estado').innerText=isGlobal?"NUBE":p.estado; el('gestion-cama-info').innerText=p.cama?`Cama: ${p.cama}`:"";
    setVal('edit-nombre',p.nombre); setVal('edit-ap1',p.ap1); setVal('edit-ap2',p.ap2); setVal('edit-tipo-doc',p.tipoDoc); setVal('edit-doc-num',p.docNum); setVal('edit-fecha',p.fechaNac); setVal('edit-tel',p.telefono);
    if(isGlobal) { safeShow('banner-nube'); safeHide('btns-local-actions'); safeShow('btns-cloud-actions'); } else { safeHide('banner-nube'); safeShow('btns-local-actions'); safeHide('btns-cloud-actions'); }
    // Family
    const fl=el('info-familia-lista'); fl.innerHTML="";
    let fam; if(isGlobal) fam=listaGlobalPrefiliacion.filter(x=>x.familiaId===p.familiaId); else fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);
    fam.forEach(f=>{ if(f.id!==p.id) fl.innerHTML+=`<div onclick="window.seleccionarPersona('${f.id}',${isGlobal})" style="cursor:pointer;">${f.nombre}</div>`; });
    if(!isGlobal) setupAutoSave();
}
function cargarAlberguesActivos(){ const c=el('lista-albergues-activos'); unsubscribeAlberguesActivos=onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s=>{ c.innerHTML=""; s.forEach(d=>{ const div=document.createElement('div'); div.className="mto-card"; div.innerHTML=`<h3>${d.data().nombre}</h3>`; div.onclick=()=>cargarDatosYEntrar(d.id); c.appendChild(div); }); }); }
function cargarAlberguesMantenimiento(){ const c=el('mto-container'); unsubscribeAlberguesMto=onSnapshot(query(collection(db,"albergues")), s=>{ c.innerHTML="<div class='mto-card' onclick='window.abrirModalAlbergue()'>+</div>"; s.forEach(d=>{ c.innerHTML+=`<div class='mto-card' onclick='window.abrirModalAlbergue("${d.id}")'>${d.data().nombre}</div>`; }); }); }
function abrirModalAlbergue(id){ albergueEdicionId=id; safeShow('modal-albergue'); if(id) { getDoc(doc(db,"albergues",id)).then(s=>{ setVal('mto-nombre',s.data().nombre); setVal('mto-capacidad',s.data().capacidad); setVal('mto-columnas',s.data().columnas); }); } else { setVal('mto-nombre',""); } }
async function guardarAlbergue(){ const n=safeVal('mto-nombre'),c=safeVal('mto-capacidad'),col=safeVal('mto-columnas'); if(!n)return; if(albergueEdicionId) await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)}); else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true}); safeHide('modal-albergue'); }
async function eliminarAlbergueActual(){ if(albergueEdicionId && confirm("Borrar?")) { await deleteDoc(doc(db,"albergues",albergueEdicionId)); safeHide('modal-albergue'); } }
function cargarUsuarios(){ const c=el('lista-usuarios-container'); unsubscribeUsers=onSnapshot(query(collection(db,"usuarios")), s=>{ c.innerHTML=""; s.forEach(d=>{ c.innerHTML+=`<div onclick="window.abrirModalUsuario('${d.id}')">${d.data().nombre}</div>`; }); }); }
function abrirModalUsuario(id){ userEditingId=id; safeShow('modal-crear-usuario'); if(id) getDoc(doc(db,"usuarios",id)).then(s=>{ setVal('new-user-name',s.data().nombre); setVal('new-user-email',s.data().email); }); }
async function guardarUsuario(){ const n=safeVal('new-user-name'); if(userEditingId) await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n}); safeHide('modal-crear-usuario'); }
function filtrarUsuarios(){ cargarUsuarios(); }
async function publicoGuardarTodo(){ const d=getDatosFormulario('pub'); if(!d.nombre)return alert("Falta nombre"); await addDoc(collection(db,"pool_prefiliacion"),{...d, fechaRegistro:new Date(), origen:currentAlbergueId}); safeHide('public-form-container'); safeShow('public-success-msg'); }
async function registrarLog(pid, act, det, isPool=false){ try{ await addDoc(collection(db, isPool?"pool_prefiliacion":`albergues/${currentAlbergueId}/personas`, pid, "historial"), {fecha:new Date(), accion:act, detalle:det}); }catch(e){} }
async function verHistorial(pid){ safeShow('modal-historial'); el('historial-content').innerHTML="Cargando..."; } 

// ============================================
// 3. EXPOSE TO WINDOW (THE FINAL BINDING)
// ============================================
Object.assign(window, {
    toggleCajaNegra, limpiarCajaNegra, sysLog,
    el, safeHide, safeShow, safeRemoveActive, safeAddActive, safeVal, setVal, formatearFecha, verificarMenor, limpiarFormulario, getDatosFormulario, actualizarContadores, showToast,
    iniciarSesion, cerrarSesion, navegar, configurarDashboard, configurarTabsPorRol, cambiarPestana, cancelarEdicionPref,
    buscarEnPrefiliacion, cargarParaEdicionPref, buscarPersonaEnAlbergue, seleccionarPersona,
    rescatarDeGlobalDirecto, darSalidaPersona, guardarCama, setupAutoSave, adminPrefiliarManual, registrarLog, verHistorial,
    abrirModalQR, cerrarMapaCamas, abrirModalInfoCama, mostrarGridCamas, abrirMapaGeneral, abrirSeleccionCama,
    abrirModalFamiliarAdmin, cerrarModalFamiliarAdmin, guardarFamiliarAdmin, actualizarListaFamiliaresAdminUI, borrarFamiliarAdminTemp,
    abrirModalFamiliar, cerrarModalFamiliar, guardarFamiliarEnLista, actualizarListaFamiliaresUI, borrarFamiliarTemp,
    abrirModalVincularFamilia, buscarParaVincular, vincularAFamilia,
    abrirModalAlbergue, guardarAlbergue, eliminarAlbergueActual, cargarAlberguesActivos, cargarAlberguesMantenimiento,
    abrirModalCambioPass, ejecutarCambioPass,
    cargarUsuarios, filtralUsuarios: filtrarUsuarios, abrirModalUsuario, guardarUsuario,
    publicoGuardarTodo, toggleStartButton, iniciarRegistro, cargarDatosYEntrar, liberarCamaMantener
});

// Listener overrides
window.onerror = function(message, source, lineno, colno, error) { 
    sysLog(`CRITICAL: ${message} at ${lineno}`, "error"); 
    const bb = document.getElementById('black-box-overlay'); 
    if(bb && bb.classList.contains('hidden')) bb.classList.remove('hidden'); 
};
