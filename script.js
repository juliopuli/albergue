import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// ============================================
// 0. DEFINICIONES GLOBALES
// ============================================

let isPublicMode = false;
let currentAlbergueId = null;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) {
    isPublicMode = true;
    currentAlbergueId = urlParams.get('public_id');
}

let currentUserData = null;
let currentAlbergueData = null;
let totalCapacidad = 0;
let ocupacionActual = 0;
let camasOcupadas = {};
let listaPersonasCache = []; // Local
let listaGlobalPrefiliacion = []; // Global
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

// --- CAJA NEGRA & UTILS ---
window.toggleCajaNegra = function() {
    const bb = document.getElementById('black-box-overlay');
    if (bb) { if (bb.classList.contains('hidden')) { bb.classList.remove('hidden'); window.sysLog("CAJA NEGRA: Visualización activada", "info"); } else { bb.classList.add('hidden'); } }
};
window.limpiarCajaNegra = function() { const c = document.getElementById('black-box-content'); if (c) c.innerHTML = ""; };
window.sysLog = function(msg, type = 'info') {
    const c = document.getElementById('black-box-content'); if (!c) return;
    const now = new Date(); const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}.${now.getMilliseconds().toString().padStart(3,'0')}`;
    let typeClass = 'log-type-info'; if (type === 'error') typeClass = 'log-type-error'; if (type === 'warn') typeClass = 'log-type-warn'; if (type === 'nav') typeClass = 'log-type-nav';
    const div = document.createElement('div'); div.className = 'log-entry'; div.innerHTML = `<span class="log-time">[${time}]</span> <span class="${typeClass}">[${type.toUpperCase()}]</span> ${msg}`;
    c.appendChild(div); c.scrollTop = c.scrollHeight;
    if(type === 'error') console.error(msg); else console.log(`[SYS] ${msg}`);
};
window.onerror = function(message, source, lineno, colno, error) { window.sysLog(`CRITICAL ERROR: ${message} at ${source}:${lineno}`, "error"); const bb = document.getElementById('black-box-overlay'); if(bb && bb.classList.contains('hidden')) bb.classList.remove('hidden'); };

if(isPublicMode) window.sysLog(`Modo Público Activado. Albergue: ${currentAlbergueId}`, "info"); else window.sysLog("Sistema Iniciado (Modo Privado).", "info");

// --- DOM UTILS ---
window.el = function(id) { return document.getElementById(id); }
window.safeHide = function(id) { const e = window.el(id); if(e) e.classList.add('hidden'); }
window.safeShow = function(id) { const e = window.el(id); if(e) e.classList.remove('hidden'); }
window.safeRemoveActive = function(id) { const e = window.el(id); if(e) e.classList.remove('active'); }
window.safeAddActive = function(id) { const e = window.el(id); if(e) e.classList.add('active'); }
window.safeVal = function(id) { const e = window.el(id); return e ? e.value : ""; }
window.setVal = function(id, val) { const e = window.el(id); if (e) e.value = val; }
window.formatearFecha = function(i) { let v = i.value.replace(/\D/g, '').slice(0, 8); if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`; else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`; else i.value = v; }
window.verificarMenor = function(p) { const t = window.el(`${p}-tipo-doc`).value; const i = window.el(`${p}-doc-num`); if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; } else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; } }
window.limpiarFormulario = function(p) { ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = window.el(`${p}-${f}`); if (e) e.value = ""; }); const i = window.el(`${p}-doc-num`); if (i) i.disabled = false; }
window.getDatosFormulario = function(p) { return { nombre: window.safeVal(`${p}-nombre`), ap1: window.safeVal(`${p}-ap1`), ap2: window.safeVal(`${p}-ap2`), tipoDoc: window.safeVal(`${p}-tipo-doc`), docNum: window.safeVal(`${p}-doc-num`), fechaNac: window.safeVal(`${p}-fecha`), telefono: window.safeVal(`${p}-tel`) }; }
window.actualizarContadores = function() { const elOcc = window.el('ocupacion-count'); const elCap = window.el('capacidad-total'); if (elOcc) elOcc.innerText = ocupacionActual; if (elCap) elCap.innerText = totalCapacidad; }
window.showToast = function(msg) { const t = window.el('toast'); if(t) { t.innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); } }

// ============================================
// 1. FUNCIONES UI - EL SUPER BLOQUE
// ============================================

window.vincularAFamilia = async function(target) {
    if(!confirm(`¿Unir a ${personaEnGestion.nombre}?`)) return;
    try {
        const collectionPath = personaEnGestionEsGlobal ? "pool_prefiliacion" : `albergues/${currentAlbergueId}/personas`;
        
        let tid = target.familiaId;
        const batch = writeBatch(db);

        // If target has no family ID, create one and update target
        if(!tid) {
            tid = new Date().getTime().toString() + "-F";
            const targetRef = doc(db, collectionPath, target.id);
            batch.update(targetRef, {familiaId: tid, rolFamilia: 'TITULAR'});
        }

        // Update current person
        const currentRef = doc(db, collectionPath, personaEnGestion.id);
        batch.update(currentRef, {familiaId: tid, rolFamilia: 'MIEMBRO'});

        await batch.commit();
        window.sysLog(`Vinculación familiar exitosa`, "success");
        alert("Vinculado");
        window.safeHide('modal-vincular-familia');
        // Refresh selection to show new family
        // We pass the same flag as before to keep context
        window.seleccionarPersona(personaEnGestion, personaEnGestionEsGlobal);
    } catch(e) {
        window.sysLog("Error vinculando: " + e.message, "error");
        console.error(e);
    }
}

window.guardarCama = async function(c) {
    // CLOUD CASE (Import + Assign)
    if (personaEnGestionEsGlobal) {
        if(!confirm(`La persona está en la nube. ¿Ingresarla y asignarle la cama ${c}?`)) return;
        try {
            const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId);
            const batch = writeBatch(db);
            
            // We need to find the new ID for the currently managed person to refresh the UI
            let newPersonLocalId = null;

            familia.forEach(member => {
                const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
                const memberData = {...member};
                delete memberData.id;
                memberData.fechaIngresoAlbergue = new Date();
                memberData.origenPoolId = member.id;
                
                if(member.id === personaEnGestion.id) {
                    memberData.estado = 'ingresado';
                    memberData.cama = c.toString();
                    memberData.fechaIngreso = new Date();
                    newPersonLocalId = localRef.id;
                } else {
                    memberData.estado = 'espera'; 
                }

                batch.set(localRef, memberData);
                batch.delete(doc(db, "pool_prefiliacion", member.id));
                
                const logRef = collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial");
                batch.set(doc(logRef), {fecha: new Date(), usuario: currentUserData.nombre, accion: "Ingreso + Cama", detalle: `Cama ${c}`});
            });

            await batch.commit();
            window.sysLog(`Ingreso automático y cama ${c} asignada.`, "success");
            window.cerrarMapaCamas();
            
            // Critical UX: Switch to local context without closing panel if possible
            // Since Firestore is fast but async, we might not have the new local person in 'listaPersonasCache' instantly.
            // We will set a small timeout or just inform the user.
            window.showToast("Ingreso realizado. Cargando ficha local...");
            
            setTimeout(() => {
                // Try to find the new person in local cache (listener should have fired)
                const newPerson = listaPersonasCache.find(p => p.id === newPersonLocalId);
                if(newPerson) {
                    window.seleccionarPersona(newPerson, false); // Switch to local view
                } else {
                    window.safeHide('panel-gestion-persona'); // Fallback
                    window.el('buscador-persona').value = "";
                }
            }, 1000);

        } catch(e) {
            window.sysLog("Error asignando cama global: " + e.message, "error");
            alert("Error: " + e.message);
        }
        return;
    }

    // LOCAL CASE
    if(personaEnGestion.cama){ alert(`Error: Ya tiene cama.`); return; }
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});
    window.registrarLog(personaEnGestion.id,"Asignación Cama",`Cama ${c}`);
    window.cerrarMapaCamas(); 
    // We DO NOT close the panel here, so user can continue working
    window.sysLog(`Cama ${c} asignada a ${personaEnGestion.nombre}`, "success");
}

window.setupAutoSave = function() {
    const inputsFil = ['edit-nombre','edit-ap1','edit-ap2','edit-doc-num','edit-tel','edit-fecha'];
    inputsFil.forEach(id => {
        const el = document.getElementById(id);
        if(el && !el.dataset.hasAutosave) {
            el.addEventListener('blur', () => window.guardarCambiosPersona(true));
            el.dataset.hasAutosave = "true";
            if(id === 'edit-fecha') el.oninput = function() { window.formatearFecha(this); };
        }
    });
}

window.adminPrefiliarManual=async function(silent=false){
    if(silent && !prefiliacionEdicionId) return; 
    
    if(prefiliacionEdicionId && isGlobalEdit){
        const p=window.getDatosFormulario('man');
        await updateDoc(doc(db,"pool_prefiliacion",prefiliacionEdicionId),p);
        window.registrarLog(prefiliacionEdicionId,"Edición Pool","Manual", true);
        if(!silent)alert("Actualizado en Pool Global");else window.showToast("Pool Actualizado"); 
        if(!silent)window.cancelarEdicionPref(); 
        return;
    }
    const n=window.safeVal('man-nombre');if(!n)return alert("Falta nombre");
    const fid=new Date().getTime().toString();
    const t=window.getDatosFormulario('man');
    t.estado='espera';t.familiaId=fid;t.rolFamilia='TITULAR';t.fechaRegistro=new Date(); t.origenAlbergueId = currentAlbergueId;
    const ref=await addDoc(collection(db,"pool_prefiliacion"),t);
    window.registrarLog(ref.id,"Alta Staff","Titular", true);
    for(const f of adminFamiliaresTemp){
        const refF=await addDoc(collection(db,"pool_prefiliacion"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date(), origenAlbergueId: currentAlbergueId});
        window.registrarLog(refF.id,"Alta Staff","Familiar", true);
    }
    alert("Guardado en Pool Global");
    window.limpiarFormulario('man');adminFamiliaresTemp=[];
    if(window.el('admin-lista-familiares-ui'))window.el('admin-lista-familiares-ui').innerHTML="Ninguno."; 
    window.sysLog("Nuevo registro Pool creado.", "success");
};

window.registrarLog = async function(personaId, accion, detalle = "", isPool = false) {
    try {
        const usuarioLog = currentUserData ? currentUserData.nombre : "Auto-Registro QR";
        let path = isPool 
            ? collection(db, "pool_prefiliacion", personaId, "historial")
            : collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial");
        
        await addDoc(path, {fecha: new Date(), usuario: usuarioLog, accion: accion, detalle: detalle}); 
        window.sysLog(`Audit Log (${isPool?'Pool':'Local'}): ${accion} - ${detalle}`, "info"); 
    } catch (e) { console.error(e); }
};

window.abrirModalFamiliarAdmin = function() { 
    window.limpiarFormulario('adm-fam'); 
    window.safeShow('modal-admin-add-familiar'); 
    if(window.el('adm-fam-tipo-doc')) window.el('adm-fam-tipo-doc').value="MENOR"; 
    window.verificarMenor('adm-fam'); 
}

window.cerrarModalFamiliarAdmin = function() { 
    window.safeHide('modal-admin-add-familiar'); 
}

window.guardarFamiliarAdmin = function() { 
    const d=window.getDatosFormulario('adm-fam'); 
    if(!d.nombre) return alert("Nombre obligatorio"); 
    adminFamiliaresTemp.push(d); 
    window.actualizarListaFamiliaresAdminUI(); 
    window.cerrarModalFamiliarAdmin(); 
}

window.actualizarListaFamiliaresAdminUI = function() { 
    const d = window.el('admin-lista-familiares-ui'); 
    if(!d) return; 
    d.innerHTML = ""; 
    if (adminFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno.</p>'; return; } 
    adminFamiliaresTemp.forEach((f, i) => { d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`; }); 
}

window.borrarFamiliarAdminTemp = function(i) { 
    adminFamiliaresTemp.splice(i, 1); 
    window.actualizarListaFamiliaresAdminUI(); 
}

window.abrirMapaGeneral = function() { 
    modoMapaGeneral=true; 
    window.mostrarGridCamas(); 
}

window.abrirSeleccionCama = function() { 
    modoMapaGeneral=false; 
    window.mostrarGridCamas(); 
}

window.cerrarMapaCamas = function(){
    highlightedFamilyId=null;
    window.safeHide('modal-cama');
}

window.mostrarGridCamas=function(){
    const g=window.el('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};let famGroups={};listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});let myFamId,famMembers=[],assignedMembers=[],neededForMe=1;if(!window.modoMapaGeneral&&window.personaEnGestion){myFamId=window.personaEnGestion.familiaId;if(myFamId)famMembers=listaPersonasCache.filter(m=>m.familiaId===myFamId);else famMembers=[window.personaEnGestion];assignedMembers=famMembers.filter(m=>m.cama&&m.id!==window.personaEnGestion.id);neededForMe=famMembers.length-assignedMembers.length;}
    for(let i=1;i<=totalCapacidad;i++){
        const n=i.toString();
        const occName=camasOcupadas[n];
        const occ=listaPersonasCache.find(p=>p.cama===n);
        let cls="bed-box"; 
        let lbl=n; 
        if(occ&&highlightedFamilyId&&occ.familiaId===highlightedFamilyId){cls+=" bed-family-highlight";}
        if(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n){cls+=" bed-current";lbl+=" (Tú)";}
        else if(occName){
            cls+=" bed-busy";
            if(occ){const f=`${occ.nombre} ${occ.ap1||''}`;lbl+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono||'-'}</div>`;}
        }else{
            cls+=" bed-free";
            if(shadowMap[n]){cls+=" bed-shadow";}
        }
        const d=document.createElement('div');
        d.className=cls;
        d.innerHTML=lbl;
        d.onclick=()=>{if(occ){if(highlightedFamilyId===occ.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occ.familiaId;window.mostrarGridCamas();}else if(!window.modoMapaGeneral){window.guardarCama(n);}};
        d.ondblclick=()=>{if(occ)window.abrirModalInfoCama(occ);};
        g.appendChild(d);
    }
    window.safeShow('modal-cama');
}

window.abrirModalInfoCama=function(p){
    window.el('info-cama-num').innerText=p.cama;
    window.el('info-nombre-completo').innerText=p.nombre;
    window.el('info-telefono').innerText=p.telefono||"No consta";
    const bh=window.el('btn-historial-cama');
    if(['admin','super_admin'].includes(currentUserData.rol)){
        window.safeShow('btn-historial-cama');
        bh.onclick=()=>window.verHistorial(p.id);
    }else{
        window.safeHide('btn-historial-cama');
    }
    const c=window.el('info-familia-detalle');
    const fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);
    let h=`<table class="fam-table"><thead><tr><th>Nombre</th><th>DNI/Tel</th><th>Cama</th></tr></thead><tbody>`;
    fam.forEach(f=>{
        const isCurrent=f.id===p.id?'fam-row-current':'';
        h+=`<tr class="${isCurrent}"><td>${f.nombre} ${f.ap1||''}</td><td><small>${f.docNum||'-'}<br>${f.telefono||'-'}</small></td><td><strong>${f.cama||'-'}</strong></td></tr>`;
    });
    h+=`</tbody></table>`;
    c.innerHTML=h;
    window.safeShow('modal-bed-info');
};

window.iniciarSesion = async function() { try { window.sysLog("Intentando iniciar sesión...", "info"); await signInWithEmailAndPassword(auth, window.el('login-email').value, window.el('login-pass').value); window.sysLog("Login exitoso.", "success"); } catch(e){ window.sysLog("Error Login: " + e.message, "error"); alert(e.message); } }
window.cerrarSesion = function() { window.sysLog("Cerrando sesión...", "warn"); signOut(auth); location.reload(); }
window.navegar = function(p) { window.sysLog(`Navegando a: ${p}`, "nav"); if(unsubscribeUsers) unsubscribeUsers(); if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos(); ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio'].forEach(id=>window.safeHide(id)); if(!currentUserData) return; if(p==='home') window.safeShow('screen-home'); else if(p==='gestion-albergues') { window.cargarAlberguesActivos(); window.safeShow('screen-gestion-albergues'); } else if(p==='mantenimiento') { window.cargarAlberguesMantenimiento(); window.safeShow('screen-mantenimiento'); } else if(p==='operativa') { window.safeShow('screen-operativa'); const t = window.configurarTabsPorRol(); window.cambiarPestana(t); } else if(p==='observatorio') { window.cargarObservatorio(); window.safeShow('screen-observatorio'); } else if(p==='usuarios') { window.cargarUsuarios(); window.safeShow('screen-usuarios'); } document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); if(p.includes('albergue')) window.safeAddActive('nav-albergues'); else if(p.includes('obs')) window.safeAddActive('nav-obs'); else if(p.includes('mantenimiento')) window.safeAddActive('nav-mto'); else window.safeAddActive('nav-home'); }
window.configurarDashboard = function() { window.sysLog("Configurando Dashboard...", "info"); const r=(currentUserData.rol||"").toLowerCase(); if(window.el('user-name-display')) window.el('user-name-display').innerText=currentUserData.nombre; if(window.el('user-role-badge')) window.el('user-role-badge').innerText=r.toUpperCase(); window.safeHide('header-btn-users'); window.safeAddActive('nav-mto'); window.safeHide('nav-obs'); window.safeHide('nav-albergues'); if(['super_admin', 'admin'].includes(r)) { window.safeShow('header-btn-users'); if(window.el('nav-mto')) window.el('nav-mto').classList.remove('disabled'); } if(['super_admin','admin','observador'].includes(r)) window.safeShow('nav-obs'); if(r !== 'observador') window.safeShow('nav-albergues'); if(r==='super_admin') window.safeShow('container-ver-ocultos'); }
window.configurarTabsPorRol = function() { const r = (currentUserData.rol || "").toLowerCase().trim(); ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeShow(id)); if (r === 'intervencion') { window.safeHide('btn-tab-pref'); window.safeHide('btn-tab-fil'); return 'sanitaria'; } return 'filiacion'; }
window.cambiarPestana = function(t) { window.sysLog(`Cambio Pestaña -> ${t}`, "nav"); ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => window.safeHide(id)); ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeRemoveActive(id)); window.safeAddActive(`btn-tab-${t.substring(0,3)}`); window.safeShow(`tab-${t}`); if (t === 'prefiliacion') { window.limpiarFormulario('man'); adminFamiliaresTemp = []; window.actualizarListaFamiliaresAdminUI(); if(window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML = ""; window.cancelarEdicionPref(); } else if (t === 'filiacion') { if(window.el('buscador-persona')) window.el('buscador-persona').value = ""; window.safeHide('resultados-busqueda'); window.safeHide('panel-gestion-persona'); window.personaEnGestion = null; } }
window.cancelarEdicionPref = function() { prefiliacionEdicionId = null; window.limpiarFormulario('man'); if(window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML=""; window.safeHide('btn-cancelar-edicion-pref'); window.safeHide('btn-ingresar-pref'); }
window.buscarEnPrefiliacion=function(){ const t=window.safeVal('buscador-pref').toLowerCase().trim(); const r=window.el('resultados-pref'); if(t.length<2){window.safeHide('resultados-pref');return;} const hits=listaGlobalPrefiliacion.filter(p=>{ const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase(); return full.includes(t)||(p.docNum||"").toLowerCase().includes(t)||(p.telefono||"").includes(t); }); r.innerHTML=""; if(hits.length === 0) r.innerHTML = "<div class='search-item'>Sin resultados en Pool Global</div>"; hits.forEach(p=>{r.innerHTML += `<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')"><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><br><small>🌐 POOL | ${p.docNum||'-'} | ${p.telefono||'-'}</small></div>`;}); window.safeShow('resultados-pref'); };
window.cargarParaEdicionPref=function(pid){ const p=listaGlobalPrefiliacion.find(x=>x.id===pid); if(!p)return; prefiliacionEdicionId=p.id; isGlobalEdit = true; window.safeHide('resultados-pref'); window.el('buscador-pref').value=""; window.setVal('man-nombre',p.nombre);window.setVal('man-ap1',p.ap1);window.setVal('man-ap2',p.ap2); window.setVal('man-tipo-doc',p.tipoDoc);window.setVal('man-doc-num',p.docNum); window.setVal('man-fecha',p.fechaNac);window.setVal('man-tel',p.telefono); const l=window.el('existing-family-list-ui'); l.innerHTML=""; if(p.familiaId){ const fs=listaGlobalPrefiliacion.filter(x=>x.familiaId===p.familiaId&&x.id!==p.id); if(fs.length>0){ l.innerHTML="<h5>Familiares en Pool:</h5>"; fs.forEach(f=>{l.innerHTML+=`<div class="fam-item existing"><div><strong>${f.nombre} ${f.ap1||''}</strong><br><small style="color:#666;">${f.docNum||'-'}</small></div></div>`;}); } } window.el('btn-save-pref').innerText="Actualizar en Pool Global"; window.safeShow('btn-cancelar-edicion-pref'); };
window.rescatarDeGlobalDirecto = async function() { if(!personaEnGestion || !personaEnGestionEsGlobal) return; if(!confirm(`¿Ingresar a ${personaEnGestion.nombre} (y familia) en este albergue?`)) return; try { const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId); const batch = writeBatch(db); familia.forEach(member => { const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas")); const memberData = {...member}; delete memberData.id; memberData.fechaIngresoAlbergue = new Date(); memberData.origenPoolId = member.id; memberData.estado = 'espera'; batch.set(localRef, memberData); batch.delete(doc(db, "pool_prefiliacion", member.id)); const logRef = collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial"); batch.set(doc(logRef), {fecha: new Date(), usuario: currentUserData.nombre, accion: "Ingreso desde Nube", detalle: "Rescatado"}); }); await batch.commit(); window.sysLog(`Familia ingresada desde Nube.`, "success"); alert("Ingreso realizado. Ahora asigne cama si es necesario."); window.personaEnGestion = null; window.safeHide('panel-gestion-persona'); window.el('buscador-persona').value = ""; } catch(e) { window.sysLog("Error ingreso: " + e.message, "error"); alert("Error: " + e.message); } };
window.darSalidaPersona = async function() { if(!personaEnGestion || personaEnGestionEsGlobal) return; if(!confirm(`¿Dar salida a ${personaEnGestion.nombre} y su familia? Volverán a la Nube Global.`)) return; try { const familia = listaPersonasCache.filter(x => x.familiaId === personaEnGestion.familiaId); const batch = writeBatch(db); familia.forEach(member => { const poolRef = doc(collection(db, "pool_prefiliacion")); const memberData = {...member}; delete memberData.id; memberData.cama = null; memberData.estado = 'espera'; memberData.fechaSalidaAlbergue = new Date(); memberData.ultimoAlbergueId = currentAlbergueId; batch.set(poolRef, memberData); batch.delete(doc(db, "albergues", currentAlbergueId, "personas", member.id)); const logRef = collection(db, "pool_prefiliacion", poolRef.id, "historial"); batch.set(doc(logRef), {fecha: new Date(), usuario: currentUserData.nombre, accion: "Salida Albergue", detalle: `Salida de ${currentAlbergueData.nombre}`}); }); await batch.commit(); window.sysLog(`Salida realizada para ${personaEnGestion.nombre}.`, "nav"); alert("Salida realizada."); window.safeHide('panel-gestion-persona'); window.safeHide('resultados-busqueda'); window.el('buscador-persona').value = ""; } catch(e) { window.sysLog("Error salida: " + e.message, "error"); alert("Error: " + e.message); } };
window.liberarCamaMantener=async function(){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{cama:null}); window.sysLog("Cama liberada (Mantener en Albergue).", "warn");};

// --- REST OF NON-BLOCKING FUNCTIONS ---
window.cargarDatosYEntrar = async function(id) {
    currentAlbergueId = id;
    window.sysLog(`Cargando Albergue ID: ${id}`, "info");
    window.safeShow('loading-overlay');
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
        unsubscribePool = onSnapshot(collection(db, "pool_prefiliacion"), s => {
            listaGlobalPrefiliacion = [];
            s.forEach(d => { const p = d.data(); p.id = d.id; listaGlobalPrefiliacion.push(p); });
            window.sysLog(`Pool Global actualizado: ${listaGlobalPrefiliacion.length} registros.`, "info");
        });
        window.navegar('operativa');
        if(window.el('app-title')) window.el('app-title').innerText = currentAlbergueData.nombre;
        window.configurarDashboard(); window.actualizarContadores();
        window.safeHide('loading-overlay');
        window.conectarListenersBackground(id);
        window.setupAutoSave();
        window.sysLog("Datos cargados correctamente (Dual Mode).", "success");
    } catch(e) { window.sysLog(`Error Cargando Datos: ${e.message}`, "error"); alert(e.message); window.safeHide('loading-overlay'); }
}
window.conectarListenersBackground = function(id) { if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc(); unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); window.actualizarContadores(); } }); }
window.buscarPersonaEnAlbergue = function() {
    const txt = window.safeVal('buscador-persona').toLowerCase().trim();
    const res = window.el('resultados-busqueda');
    if(txt.length < 2) { window.safeHide('resultados-busqueda'); return; }
    const localHits = listaPersonasCache.filter(p => { const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase(); return full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt); });
    const globalHits = listaGlobalPrefiliacion.filter(p => { const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase(); return full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt); });
    res.innerHTML = "";
    if(localHits.length === 0 && globalHits.length === 0) { res.innerHTML = `<div class="search-item" style="color:#666">No encontrado</div>`; } else {
        localHits.forEach(p => { const dc = p.estado === 'ingresado' ? 'dot-green' : 'dot-red'; res.innerHTML += `<div class="search-item" onclick="window.seleccionarPersona('${p.id}', false)"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong> (Local)<div style="font-size:0.8rem;color:#666;">📄 ${p.docNum||'-'}</div></div><div class="status-dot ${dc}" title="${p.estado.toUpperCase()}"></div></div></div>`; });
        globalHits.forEach(p => { res.innerHTML += `<div class="search-item" onclick="window.seleccionarPersona('${p.id}', true)"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong> (Nube)<div style="font-size:0.8rem;color:#666;">☁️ ${p.docNum||'-'}</div></div><div class="status-dot dot-cloud" title="EN NUBE"></div></div></div>`; });
    }
    window.safeShow('resultados-busqueda');
};
window.seleccionarPersona = function(pid, isGlobal) {
    if(typeof pid !== 'string') pid = pid.id; 
    let p;
    if (isGlobal) { p = listaGlobalPrefiliacion.find(x => x.id === pid); personaEnGestionEsGlobal = true; window.safeShow('banner-nube'); window.safeHide('btns-local-actions'); window.safeShow('btns-cloud-actions'); } else { p = listaPersonasCache.find(x => x.id === pid); personaEnGestionEsGlobal = false; window.safeHide('banner-nube'); window.safeShow('btns-local-actions'); window.safeHide('btns-cloud-actions'); }
    if(!p) return;
    personaEnGestion = p; prefiliacionEdicionId = p.id; isGlobalEdit = isGlobal;
    window.safeHide('resultados-busqueda'); window.safeShow('panel-gestion-persona');
    if(window.el('gestion-nombre-titulo')) window.el('gestion-nombre-titulo').innerText = p.nombre;
    if(window.el('gestion-estado')) window.el('gestion-estado').innerText = isGlobal ? "EN NUBE" : p.estado.toUpperCase();
    if(window.el('gestion-cama-info')) window.el('gestion-cama-info').innerText = (p.cama && !isGlobal) ? `Cama: ${p.cama}` : "";
    window.setVal('edit-nombre', p.nombre); window.setVal('edit-ap1', p.ap1); window.setVal('edit-ap2', p.ap2); window.setVal('edit-tipo-doc', p.tipoDoc); window.setVal('edit-doc-num', p.docNum); window.setVal('edit-fecha', p.fechaNac); window.setVal('edit-tel', p.telefono);
    const flist = window.el('info-familia-lista'); flist.innerHTML = "";
    let fam = [];
    if(isGlobal) { fam = listaGlobalPrefiliacion.filter(x => x.familiaId === p.familiaId); } else { fam = listaPersonasCache.filter(x => x.familiaId === p.familiaId); }
    if(window.el('info-familia-resumen')) window.el('info-familia-resumen').innerText = fam.length > 1 ? `Familia (${fam.length})` : "Individual";
    fam.forEach(f => { if(f.id !== p.id) { const st = f.estado === 'ingresado' ? 'color:var(--success);' : 'color:var(--warning);'; const ic = f.estado === 'ingresado' ? 'fa-solid fa-bed' : 'fa-solid fa-clock'; flist.innerHTML += `<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.seleccionarPersona('${f.id}', ${isGlobal})"><div><div style="font-weight:bold;font-size:0.95rem;">${f.nombre} ${f.ap1||''}</div><div style="font-size:0.85rem;color:#666;"><i class="fa-regular fa-id-card"></i> ${f.docNum||'-'}</div></div><div style="font-size:1.2rem;${st}"><i class="${ic}"></i></div></div>`; } });
    if(!isGlobal) window.setupAutoSave();
};
window.guardarCambiosPersona=async function(silent=false){if(!personaEnGestion)return;const p=window.getDatosFormulario('edit');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),p);window.registrarLog(personaEnGestion.id,"Edición Datos","Manual");if(!silent)alert("Guardado");else window.showToast("Guardado automático"); window.sysLog(`Actualizada persona local: ${personaEnGestion.nombre}`, "info");};
window.abrirModalAlbergue=async function(id=null){albergueEdicionId=id;window.safeShow('modal-albergue');const b=window.el('btn-delete-albergue');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();window.setVal('mto-nombre',d.nombre);window.setVal('mto-capacidad',d.capacidad);window.setVal('mto-columnas',d.columnas);const r=(currentUserData.rol||"").toLowerCase().trim();if(r==='super_admin')window.safeShow('btn-delete-albergue');else window.safeHide('btn-delete-albergue');}else{window.setVal('mto-nombre',"");window.setVal('mto-capacidad',"");window.safeHide('btn-delete-albergue');}};
window.guardarAlbergue=async function(){const n=window.safeVal('mto-nombre'),c=window.safeVal('mto-capacidad'),col=window.safeVal('mto-columnas');if(!n||!c)return alert("Datos inc.");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});window.safeHide('modal-albergue'); window.sysLog("Albergue guardado.", "success");};
window.eliminarAlbergueActual=async function(){if(albergueEdicionId&&confirm("¿Borrar todo?")){const ps=await getDocs(collection(db,"albergues",albergueEdicionId,"personas"));const b=writeBatch(db);ps.forEach(d=>b.delete(d.ref));await b.commit();await deleteDoc(doc(db,"albergues",albergueEdicionId));alert("Borrado");window.safeHide('modal-albergue'); window.sysLog("Albergue eliminado.", "warn");}};
window.cargarAlberguesActivos = function() { const c = window.el('lista-albergues-activos'); unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s=>{ c.innerHTML=""; s.forEach(d=>{ const div=document.createElement('div'); div.className="mto-card"; div.innerHTML=`<h3>${d.data().nombre}</h3><div class="mto-info">Entrar</div>`; div.onclick=()=>window.cargarDatosYEntrar(d.id); c.appendChild(div); }); }); }
window.cargarAlberguesMantenimiento = function() { const c = window.el('mto-container'); const r = (currentUserData.rol || "").toLowerCase().trim(); const isSuper = (r === 'super_admin'); unsubscribeAlberguesMto = onSnapshot(query(collection(db,"albergues")), s => { c.innerHTML = "<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>"; s.forEach(d => { const a = d.data(); let extraBtn = isSuper ? `<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}', ${!a.activo})">${a.activo === false ? 'Activar' : 'Archivar'}</button>` : ""; c.innerHTML += `<div class="mto-card ${!a.activo ? 'archived' : ''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`; }); }); };
window.cambiarEstadoAlbergue=async function(id,st){await updateDoc(doc(db,"albergues",id),{activo:st}); window.sysLog(`Estado Albergue ${id}: ${st}`, "info");};
window.abrirModalCambioPass=function(){window.setVal('chg-old-pass','');window.setVal('chg-new-pass','');window.setVal('chg-confirm-pass','');window.safeShow('modal-change-pass');};
window.ejecutarCambioPass=async function(){const o=window.safeVal('chg-old-pass'),n=window.safeVal('chg-new-pass');try{await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,o));await updatePassword(auth.currentUser,n);alert("OK");window.safeHide('modal-change-pass'); window.sysLog("Contraseña cambiada.", "success");}catch(e){alert("Error"); window.sysLog("Error cambio pass: " + e.message, "error");}};
window.cargarUsuarios=function(){const c=window.el('lista-usuarios-container');const filterText=window.safeVal('search-user').toLowerCase().trim();unsubscribeUsers=onSnapshot(query(collection(db,"usuarios")),s=>{c.innerHTML="";if(s.empty){c.innerHTML="<p>No hay usuarios.</p>";return;}s.forEach(d=>{const u=d.data();if(filterText&&!u.nombre.toLowerCase().includes(filterText)&&!u.email.toLowerCase().includes(filterText))return;if(currentUserData.rol==='admin'&&u.rol==='super_admin')return;c.innerHTML+=`<div class="user-card-item" onclick="window.abrirModalUsuario('${d.id}')"><strong>${u.nombre}</strong><br><small>${u.rol}</small></div>`;});});};
window.filtrarUsuarios=function(){window.cargarUsuarios();};
window.abrirModalUsuario=async function(id=null){ userEditingId=id; window.safeShow('modal-crear-usuario'); const sel=window.el('new-user-role'); sel.innerHTML=""; ['super_admin','admin','intervencion','filiacion','observador'].forEach(r=>sel.add(new Option(r,r))); if(id){ const s=await getDoc(doc(db,"usuarios",String(id))); if(s.exists()){ const d=s.data(); window.setVal('new-user-name',d.nombre); window.setVal('new-user-email',d.email); sel.value=d.rol; if(currentUserData.rol === 'super_admin') window.safeShow('btn-delete-user'); else window.safeHide('btn-delete-user'); } } else { window.setVal('new-user-name',""); window.setVal('new-user-email',""); window.safeHide('btn-delete-user'); } };
window.guardarUsuario=async function(){const e=window.safeVal('new-user-email'),p=window.safeVal('new-user-pass'),n=window.safeVal('new-user-name'),r=window.safeVal('new-user-role');if(userEditingId){await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});}else{const tApp=initializeApp(firebaseConfig,"Temp");const tAuth=getAuth(tApp);const uc=await createUserWithEmailAndPassword(tAuth,e,p);await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});await signOut(tAuth);deleteApp(tApp);}window.safeHide('modal-crear-usuario'); window.sysLog("Usuario guardado/creado.", "success");};
window.eliminarUsuario=async function(){if(userEditingId&&confirm("Borrar?")){await deleteDoc(doc(db,"usuarios",userEditingId));window.safeHide('modal-crear-usuario'); window.sysLog("Usuario eliminado.", "warn");}};
window.abrirModalQR=function(){window.safeShow('modal-qr');const d=window.el("qrcode-display");d.innerHTML="";new QRCode(d,{text:window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`,width:250,height:250});};
window.toggleStartButton=function(){window.el('btn-start-public').disabled=!window.el('check-consent').checked;};
window.iniciarRegistro=function(){window.safeHide('public-welcome-screen');window.safeShow('public-form-container');};
window.cargarObservatorio=async function(){const list=window.el('obs-list-container');if(!list)return;list.innerHTML='<p>Cargando...</p>';let gW=0,gH=0,gC=0;try{const sSnap=await getDocs(query(collection(db,"albergues"),where("activo","==",true)));let h="";for(const ds of sSnap.docs){const d=ds.data();const c=parseInt(d.capacidad||0);gC+=c;const pSnap=await getDocs(collection(db,"albergues",ds.id,"personas"));let sW=0,sH=0;pSnap.forEach(p=>{const pd=p.data();if(pd.estado==='espera')sW++;if(pd.estado==='ingresado')sH++;});gW+=sW;gH+=sH;const sF=Math.max(0,c-sH);const sP=c>0?Math.round((sH/c)*100):0;h+=`<div class="obs-row"><div class="obs-row-title">${d.nombre}</div><div style="display:flex;width:100%;justify-content:space-between;"><div class="obs-data-point"><span>Espera</span><strong>${sW}</strong></div><div class="obs-data-point"><span>Alojados</span><strong>${sH}</strong></div><div class="obs-data-point"><span>Libres</span><strong>${sF}</strong></div><div class="obs-data-point"><span>${sP}%</span></div></div></div>`;}if(window.el('kpi-espera'))window.el('kpi-espera').innerText=gW;if(window.el('kpi-alojados'))window.el('kpi-alojados').innerText=gH;if(window.el('kpi-libres'))window.el('kpi-libres').innerText=`${Math.max(0,gC-gH)}`;if(window.el('kpi-percent'))window.el('kpi-percent').innerText=`${gC>0?Math.round((gH/gC)*100):0}%`;list.innerHTML=h;}catch(e){list.innerHTML="Error";}};
window.verListaObservatorio = async function(albId, est) {const c = window.el('obs-modal-content');const t = window.el('obs-modal-title');c.innerHTML = '<p>Cargando...</p>';t.innerText = est === 'espera' ? 'En Espera' : 'Alojados';window.safeShow('modal-obs-detalle');try {const s = await getDocs(query(collection(db, "albergues", albId, "personas"), where("estado", "==", est)));if (s.empty) { c.innerHTML = '<p>Sin registros.</p>'; return; }let dataArray = [];s.forEach(doc => { dataArray.push({ id: doc.id, ...doc.data() }); });if (est === 'ingresado') {dataArray.sort((a, b) => (parseInt(a.cama)||0) - (parseInt(b.cama)||0));} else {dataArray.sort((a, b) => (b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0));}let h = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`;if(est==='ingresado') h+=`<th>Cama</th>`;h+=`<th>Nombre</th><th>DNI</th><th>Tel</th></tr></thead><tbody>`;dataArray.forEach(d => { h += `<tr><td style="text-align:center;"><button class="btn-icon-small" onclick="window.verHistorialObservatorio('${albId}', '${d.id}')"><i class="fa-solid fa-clock-rotate-left"></i></button></td>`;if(est==='ingresado') h+=`<td><strong>${d.cama||'-'}</strong></td>`;h+=`<td>${d.nombre} ${d.ap1||''}</td><td>${d.docNum||'-'}</td><td>${d.telefono||'-'}</td></tr>`; });h += '</tbody></table>'; c.innerHTML = h;} catch(e) { c.innerHTML = "Error."; }};
window.verHistorialObservatorio = function(albId, pId) { window.verHistorial(pId, albId); };

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
