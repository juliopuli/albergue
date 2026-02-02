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

// --- 4. AUTH (MOVED UP FOR SAFETY) ---
window.iniciarSesion = async function() { 
    try { 
        await signInWithEmailAndPassword(auth, window.el('login-email').value, window.el('login-pass').value); 
    } catch(e){ alert(e.message); } 
}
window.cerrarSesion = function() { signOut(auth); location.reload(); }

// --- 5. SMART SAVE (ROBUST) ---
window.setupAutoSave = function() {
    // Only set listeners, logic is handled in guardarSiCorresponde
    // V43: We actually removed the aggressive onBlur to avoid freezes
}

window.guardarSiCorresponde = async function() {
    try {
        // Prevent saving if person is Global (Read-only) or null
        if (!personaEnGestion || personaEnGestionEsGlobal) return;

        // Save Local Person (Filiacion Tab active)
        if (window.el('tab-filiacion') && !window.el('tab-filiacion').classList.contains('hidden')) {
            await window.guardarCambiosPersona(true);
        }
        // Save Prefiliacion Edit (Prefiliacion Tab active AND Editing existing ID)
        else if (prefiliacionEdicionId && window.el('tab-prefiliacion') && !window.el('tab-prefiliacion').classList.contains('hidden')) {
            await window.adminPrefiliarManual(true);
        }
    } catch (e) {
        console.error("Autosave skipped", e); // Non-blocking error
    }
}


// --- 6. QR & PUBLIC ---
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
    const mainData = window.getDatosFormulario('pub'); if(!mainData.nombre) return alert("Nombre titular obligatorio."); if(!currentAlbergueId) return alert("Error ID");
    if(!auth.currentUser) { try { await signInAnonymously(auth); } catch(e) {} }

    try {
        const fid = new Date().getTime().toString(); const b = writeBatch(db);
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

// --- 7. UNIFIED SEARCH & MANAGEMENT ---
window.buscarPersonaEnAlbergue = async function() {
    const txt = window.safeVal('buscador-persona').toLowerCase().trim();
    const res = window.el('resultados-busqueda');
    if(txt.length < 2) { window.safeHide('resultados-busqueda'); return; }
    
    // 1. LOCAL SEARCH
    const localHits = listaPersonasCache.filter(p => {
        const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
        return full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt);
    });

    // 2. GLOBAL SEARCH
    let globalHits = [];
    try {
        const snap = await getDocs(collection(db, "pool_prefiliacion"));
        snap.forEach(doc => {
            const p = doc.data(); p.id = doc.id; p.isGlobal = true;
            const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
            if(full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt)) globalHits.push(p);
        });
    } catch(e) { console.log(e); }

    res.innerHTML = "";
    
    if(localHits.length === 0 && globalHits.length === 0){
        res.innerHTML = `<div class="search-item" style="color:#666">No encontrado</div>`;
    } else {
        // RENDER LOCAL
        localHits.forEach(p => {
            const dc = p.estado==='ingresado' ? 'dot-green' : 'dot-red';
            res.innerHTML += `<div class="search-item" onclick="window.seleccionarPersona('${p.id}')">
                <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                    <div><strong>${p.nombre} ${p.ap1||''}</strong><br><span class="badge-global" style="background:#e0e7ff;color:#333;">LOCAL</span></div>
                    <div class="status-dot ${dc}"></div>
                </div>
            </div>`;
        });
        // RENDER GLOBAL
        globalHits.forEach(p => {
            window.tempGlobalMatch = window.tempGlobalMatch || {};
            window.tempGlobalMatch[p.id] = p;
            res.innerHTML += `<div class="search-item" onclick="window.seleccionarPersonaGlobal('${p.id}')" style="background:#f0f9ff;">
                <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                    <div><strong>${p.nombre} ${p.ap1||''}</strong><br><span class="badge-global">NUBE</span></div>
                    <div class="status-dot dot-orange"></div>
                </div>
            </div>`;
        });
    }
    window.safeShow('resultados-busqueda');
}

window.seleccionarPersona = function(pid) {
    if(typeof pid!=='string')pid=pid.id;
    const p = listaPersonasCache.find(x => x.id === pid);
    if(!p) return;
    
    personaEnGestion = p;
    personaEnGestionEsGlobal = false;
    
    window.safeHide('resultados-busqueda');
    window.safeShow('panel-gestion-persona');
    
    if(window.el('gestion-nombre-titulo')) window.el('gestion-nombre-titulo').innerText = p.nombre;
    if(window.el('gestion-estado')) window.el('gestion-estado').innerText = p.estado.toUpperCase();
    if(window.el('gestion-cama-info')) window.el('gestion-cama-info').innerText = p.cama ? `Cama: ${p.cama}` : "";
    
    window.setVal('edit-nombre', p.nombre); window.setVal('edit-ap1', p.ap1); window.setVal('edit-ap2', p.ap2);
    window.setVal('edit-tipo-doc', p.tipoDoc); window.setVal('edit-doc-num', p.docNum);
    window.setVal('edit-fecha', p.fechaNac); window.setVal('edit-tel', p.telefono);
    
    window.safeShow('btn-guardar-cambios'); window.safeShow('btn-liberar-cama'); window.safeShow('btn-dar-salida');
    window.safeShow('btn-vincular-familia');
    
    const r=(currentUserData.rol||"").toLowerCase().trim();
    if(['admin','super_admin'].includes(r)) window.safeShow('btn-historial-ficha'); else window.safeHide('btn-historial-ficha');
    
    const flist = window.el('info-familia-lista'); flist.innerHTML = "";
    const fam = listaPersonasCache.filter(x => x.familiaId && x.familiaId === p.familiaId);
    if(window.el('info-familia-resumen')) window.el('info-familia-resumen').innerText = fam.length > 1 ? `Familia (${fam.length})` : "Individual";
    fam.forEach(f => {
        if(f.id !== p.id) {
            flist.innerHTML += `<div style="padding:10px;border-bottom:1px solid #eee;">${f.nombre} ${f.ap1||''}</div>`;
        }
    });
};

window.seleccionarPersonaGlobal = function(gid) {
    const p = window.tempGlobalMatch[gid];
    if(!p) return;
    
    personaEnGestion = p;
    personaEnGestionEsGlobal = true;
    
    window.safeHide('resultados-busqueda');
    window.safeShow('panel-gestion-persona');
    
    if(window.el('gestion-nombre-titulo')) window.el('gestion-nombre-titulo').innerText = p.nombre + " (Nube)";
    if(window.el('gestion-estado')) window.el('gestion-estado').innerText = "EN ESPERA";
    if(window.el('gestion-cama-info')) window.el('gestion-cama-info').innerText = "Sin Asignar";
    
    window.setVal('edit-nombre', p.nombre); window.setVal('edit-ap1', p.ap1); window.setVal('edit-ap2', p.ap2);
    window.setVal('edit-tipo-doc', p.tipoDoc); window.setVal('edit-doc-num', p.docNum);
    window.setVal('edit-fecha', p.fechaNac); window.setVal('edit-tel', p.telefono);
    
    window.safeHide('btn-guardar-cambios');
    window.safeHide('btn-liberar-cama');
    window.safeHide('btn-dar-salida');
    window.safeHide('btn-vincular-familia');
    window.safeHide('btn-historial-ficha');
    
    if(window.el('info-familia-resumen')) window.el('info-familia-resumen').innerText = "Datos de la Nube";
    window.el('info-familia-lista').innerHTML = "<p>Asigna cama para ingresar y ver familia.</p>";
}

// --- 8. ATOMIC BED ASSIGNMENT ---
window.guardarCama = async function(c) {
    const camaStr = c.toString();
    if(camasOcupadas[camaStr]) return alert("Cama ocupada.");
    
    if(!personaEnGestionEsGlobal) {
        if(personaEnGestion.cama) return alert("Ya tiene cama.");
        await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id), {
            estado: 'ingresado', cama: camaStr, fechaIngreso: new Date()
        });
        window.registrarLog(personaEnGestion.id, "Asignación Cama", `Cama ${c}`);
        window.cerrarMapaCamas();
        return;
    }
    
    if(!confirm(`¿INGRESAR a ${personaEnGestion.nombre} desde la Nube y asignar cama ${c}?`)) return;
    
    try {
        const batch = writeBatch(db);
        
        // A. Create Local
        const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
        const data = { ...personaEnGestion };
        delete data.id; // Remove global ID
        delete data.isGlobal;
        
        batch.set(localRef, {
            ...data,
            estado: 'ingresado',
            cama: camaStr,
            fechaIngresoAlbergue: new Date(),
            origenGlobal: true
        });
        
        // B. Log 1: Entry
        const logRef1 = doc(collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial"));
        batch.set(logRef1, { fecha: new Date(), usuario: currentUserData.nombre, accion: `Entrada a Albergue ${currentAlbergueData.nombre}`, detalle: "Desde Nube" });
        
        // C. Log 2: Bed
        const logRef2 = doc(collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial"));
        batch.set(logRef2, { fecha: new Date(), usuario: currentUserData.nombre, accion: "Asignación Cama", detalle: `Cama ${c}` });
        
        // D. Delete from Global
        const globalRef = doc(db, "pool_prefiliacion", personaEnGestion.id);
        batch.delete(globalRef);
        
        await batch.commit();
        alert("Persona ingresada y cama asignada.");
        window.cerrarMapaCamas();
        window.seleccionarPersona(null); // Clear form
        window.safeHide('panel-gestion-persona');
        
    } catch(e) { alert("Error: " + e.message); }
}

// --- 9. PREFILIACIÓN ---
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
        matches.forEach(p => { r.innerHTML += `<div class="search-item" onclick="window.cargarDesdePool('${p.id}')"><strong>${p.nombre} ${p.ap1||''} <span class="badge-global">NUBE</span></strong><br><small>📄 ${p.docNum||'-'}</small></div>`; });
        window.safeShow('resultados-pref');
    } catch(e) { console.error(e); }
};

window.cargarDesdePool = async function(pid) {
    window.safeHide('resultados-pref');
    window.el('buscador-pref').value="";
    const snap = await getDoc(doc(db, "pool_prefiliacion", pid));
    if(!snap.exists()) return;
    const p = snap.data();
    prefiliacionEdicionId = pid;
    window.setVal('man-nombre',p.nombre);window.setVal('man-ap1',p.ap1);window.setVal('man-ap2',p.ap2);
    window.setVal('man-tipo-doc',p.tipoDoc);window.setVal('man-doc-num',p.docNum);
    window.setVal('man-fecha',p.fechaNac);window.setVal('man-tel',p.telefono);
    window.safeShow('btn-ingresar-global');
    window.el('btn-save-pref').innerText = "Guardar Nuevo en Nube";
    window.safeShow('btn-cancelar-edicion-pref');
}

window.ingresarDesdeGlobalAction = async function() {
    if(!prefiliacionEdicionId) return;
    if(!confirm(`¿Ingresar a ${window.safeVal('man-nombre')} en este albergue?`)) return;
    try {
        const batch = writeBatch(db);
        const data = window.getDatosFormulario('man');
        const newLocalRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
        batch.set(newLocalRef, { ...data, estado: 'espera', fechaIngresoAlbergue: new Date(), origenGlobal: true });
        const logRef = doc(collection(db, "albergues", currentAlbergueId, "personas", newLocalRef.id, "historial"));
        batch.set(logRef, { fecha: new Date(), usuario: currentUserData.nombre, accion: `Entrada a Albergue ${currentAlbergueData.nombre}`, detalle: "Transferido desde Nube" });
        const poolRef = doc(db, "pool_prefiliacion", prefiliacionEdicionId);
        batch.delete(poolRef);
        await batch.commit();
        alert("Persona ingresada correctamente.");
        window.cancelarEdicionPref();
        window.cambiarPestana('filiacion');
    } catch(e) { alert("Error al ingresar: " + e.message); }
}

window.crearNuevoEnPool = async function() {
    const data = window.getDatosFormulario('man');
    if(!data.nombre) return alert("Nombre obligatorio");
    try {
        await addDoc(collection(db, "pool_prefiliacion"), { ...data, fechaRegistro: new Date(), estado: 'espera', familiaId: new Date().getTime().toString(), rolFamilia: 'TITULAR' });
        alert("Creado en la Nube Global");
        window.cancelarEdicionPref();
    } catch(e) { alert(e.message); }
}

window.darSalidaPersona = async function() {
    if(!personaEnGestion) return;
    if(!confirm(`¿Confirmar SALIDA de ${personaEnGestion.nombre}?`)) return;
    await window.guardarSiCorresponde();
    try {
        const batch = writeBatch(db);
        const p = personaEnGestion;
        const poolRef = doc(collection(db, "pool_prefiliacion"));
        const poolData = { ...p, cama: null, estado: 'espera', ultimoAlbergue: currentAlbergueData.nombre, fechaSalida: new Date() };
        delete poolData.id; 
        batch.set(poolRef, poolData);
        const poolLogRef = doc(collection(db, "pool_prefiliacion", poolRef.id, "historial"));
        batch.set(poolLogRef, { fecha: new Date(), usuario: currentUserData.nombre, accion: `Salida del Albergue ${currentAlbergueData.nombre}`, detalle: "Transferido a Nube" });
        const localRef = doc(db, "albergues", currentAlbergueId, "personas", p.id);
        batch.delete(localRef);
        await batch.commit();
        alert("Salida realizada.");
        window.seleccionarPersona(null); 
        window.safeHide('panel-gestion-persona');
        window.buscarPersonaEnAlbergue();
    } catch(e) { alert("Error: " + e.message); }
}

// --- STANDARD FUNCTIONS ---
window.abrirMapaGeneral = function() { modoMapaGeneral=true; window.mostrarGridCamas(); };
window.abrirSeleccionCama = async function() { await window.guardarSiCorresponde(); modoMapaGeneral=false; window.mostrarGridCamas(); };
window.cerrarMapaCamas = function(){highlightedFamilyId=null;window.safeHide('modal-cama');};
window.highlightFamily = function(pid){const o=listaPersonasCache.find(p=>p.id===pid);if(!o||!o.familiaId)return;highlightedFamilyId=(highlightedFamilyId===o.familiaId)?null:o.familiaId;window.mostrarGridCamas();};
window.mostrarGridCamas=function(){
    const g=window.el('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};let famGroups={};listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});let myFamId,famMembers=[],assignedMembers=[],neededForMe=1;if(!window.modoMapaGeneral&&window.personaEnGestion){myFamId=window.personaEnGestion.familiaId;if(myFamId)famMembers=listaPersonasCache.filter(m=>m.familiaId===myFamId);else famMembers=[window.personaEnGestion];assignedMembers=famMembers.filter(m=>m.cama&&m.id!==window.personaEnGestion.id);neededForMe=famMembers.length-assignedMembers.length;}
    for(let i=1;i<=totalCapacidad;i++){
        const n=i.toString();
        const occName=camasOcupadas[n];
        const occ=listaPersonasCache.find(p=>p.cama===n);
        let cls="bed-box"; let lbl=n;
        if(occ&&highlightedFamilyId&&occ.familiaId===highlightedFamilyId){cls+=" bed-family-highlight";}
        if(!window.modoMapaGeneral&&!personaEnGestionEsGlobal&&window.personaEnGestion&&window.personaEnGestion.cama===n){cls+=" bed-current";lbl+=" (Tú)";}
        else if(occName){
            cls+=" bed-busy";
            if(occ){const f=`${occ.nombre} ${occ.ap1||''}`;lbl+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono||'-'}</div>`;}
        }else{ cls+=" bed-free"; if(shadowMap[n]){cls+=" bed-shadow";} }
        const d=document.createElement('div'); d.className=cls; d.innerHTML=lbl;
        d.onclick=()=>{if(occ){if(highlightedFamilyId===occ.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occ.familiaId;window.mostrarGridCamas();}else if(!window.modoMapaGeneral){window.guardarCama(n);}};
        d.ondblclick=()=>{if(occ)window.abrirModalInfoCama(occ);};
        g.appendChild(d);
    }
    window.safeShow('modal-cama');
}
window.abrirModalInfoCama=function(p){window.el('info-cama-num').innerText=p.cama;window.el('info-nombre-completo').innerText=p.nombre;window.el('info-telefono').innerText=p.telefono||"No consta";const bh=window.el('btn-historial-cama');if(['admin','super_admin'].includes(currentUserData.rol)){window.safeShow('btn-historial-cama');bh.onclick=()=>window.verHistorial(p.id);}else{window.safeHide('btn-historial-cama');}const c=window.el('info-familia-detalle');const fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);let h=`<table class="fam-table"><thead><tr><th>Nombre</th><th>DNI/Tel</th><th>Cama</th></tr></thead><tbody>`;fam.forEach(f=>{const isCurrent=f.id===p.id?'fam-row-current':'';h+=`<tr class="${isCurrent}"><td>${f.nombre} ${f.ap1||''}</td><td><small>${f.docNum||'-'}<br>${f.telefono||'-'}</small></td><td><strong>${f.cama||'-'}</strong></td></tr>`;});h+=`</tbody></table>`;c.innerHTML=h;window.safeShow('modal-bed-info');};
window.liberarCamaMantener=async function(){await window.guardarSiCorresponde(); await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{cama:null});};
window.regresarPrefiliacion=async function(){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{estado:'espera',cama:null});};
window.abrirModalAlbergue=async function(id=null){albergueEdicionId=id;window.safeShow('modal-albergue');const b=window.el('btn-delete-albergue');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();window.setVal('mto-nombre',d.nombre);window.setVal('mto-capacidad',d.capacidad);window.setVal('mto-columnas',d.columnas);const r=(currentUserData.rol||"").toLowerCase().trim();if(r==='super_admin')window.safeShow('btn-delete-albergue');else window.safeHide('btn-delete-albergue');}else{window.setVal('mto-nombre',"");window.setVal('mto-capacidad',"");window.safeHide('btn-delete-albergue');}};
window.guardarAlbergue=async function(){const n=window.safeVal('mto-nombre'),c=window.safeVal('mto-capacidad'),col=window.safeVal('mto-columnas');if(!n||!c)return alert("Datos inc.");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});window.safeHide('modal-albergue');};
window.eliminarAlbergueActual=async function(){if(albergueEdicionId&&confirm("¿Borrar todo?")){const ps=await getDocs(collection(db,"albergues",albergueEdicionId,"personas"));const b=writeBatch(db);ps.forEach(d=>b.delete(d.ref));await b.commit();await deleteDoc(doc(db,"albergues",albergueEdicionId));alert("Borrado");window.safeHide('modal-albergue');}};
window.cargarAlberguesMantenimiento=function(){const c=window.el('mto-container');unsubscribeAlberguesMto=onSnapshot(query(collection(db,"albergues")),s=>{c.innerHTML="<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";s.forEach(d=>{const a=d.data();let extraBtn=currentUserData.rol==='super_admin'?`<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}',${!a.activo})">${a.activo===false?'Activar':'Archivar'}</button>`:"";c.innerHTML+=`<div class="mto-card ${!a.activo?'archived':''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`;});});};
window.cambiarEstadoAlbergue=async function(id,st){await updateDoc(doc(db,"albergues",id),{activo:st});};
window.abrirModalCambioPass=function(){window.setVal('chg-old-pass','');window.setVal('chg-new-pass','');window.setVal('chg-confirm-pass','');window.safeShow('modal-change-pass');};
window.ejecutarCambioPass=async function(){const o=window.safeVal('chg-old-pass'),n=window.safeVal('chg-new-pass');try{await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,o));await updatePassword(auth.currentUser,n);alert("OK");window.safeHide('modal-change-pass');}catch(e){alert("Error");}};
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
