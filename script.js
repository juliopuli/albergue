import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- 1. CONFIGURACIÓN ---
const firebaseConfig = { 
    apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", 
    authDomain: "albergues-temporales.firebaseapp.com", 
    projectId: "albergues-temporales", 
    storageBucket: "albergues-temporales.firebasestorage.app", 
    messagingSenderId: "489999184108", 
    appId: "1:489999184108:web:32b9b580727f83158075c9" 
};
const app = initializeApp(firebaseConfig); 
const auth = getAuth(app); 
const db = getFirestore(app);

// --- 2. VARIABLES GLOBALES ---
let isPublicMode = false;
let currentAlbergueId = null; 
let alberguesMap = {}; 

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) { isPublicMode = true; currentAlbergueId = urlParams.get('public_id'); }

let currentUserData = null;
let currentAlbergueData = null;
let totalCapacidad = 0;
let ocupacionActual = 0;
let camasOcupadas = {};
let listaPersonasCache = []; 
let listaGlobalPrefiliacion = []; 
let listaNotificacionesCache = [];
let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribePersonas, unsubscribeAlbergueDoc, unsubscribePool, unsubscribeNotifs;

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
let tipoDerivacionActual = null; 
let html5QrCode = null;
let personaIntervencionActiva = null; 

const TIPOS_INTERVENCION = {
    san: { titulo: "Sanitaria", opciones: ["Atención Urgente / Primeros Auxilios", "Toma de Constantes", "Administración de Medicación", "Cura de Heridas", "Consulta Médica", "Derivación Hospitalaria", "Otros"] },
    psi: { titulo: "Psicosocial", opciones: ["Valoración Inicial", "Acompañamiento / Contención Emocional", "Comunicación de Malas Noticias", "Gestión de Trámites", "Resolución de Conflictos", "Atención a Menores", "Otros"] },
    ent: { titulo: "Entregas", opciones: ["Entrega de Kit de Higiene", "Entrega de Ropa / Calzado", "Entrega de Manta / Abrigo", "Entrega de Alimentos (Biberones...)", "Entrega de Juguetes / Material Infantil", "Otros"] }
};

// --- 3. UTILIDADES ---
window.el = id => document.getElementById(id);
window.safeHide = id => { const e = window.el(id); if(e) e.classList.add('hidden'); };
window.safeShow = id => { const e = window.el(id); if(e) e.classList.remove('hidden'); };
window.safeRemoveActive = id => { const e = window.el(id); if(e) e.classList.remove('active'); };
window.safeAddActive = id => { const e = window.el(id); if(e) e.classList.add('active'); };
window.safeVal = id => { const e = window.el(id); return e ? e.value : ""; };
window.setVal = (id, v) => { const e = window.el(id); if (e) e.value = v; };

window.actualizarContadores = () => { 
    const elOcc = window.el('ocupacion-count'); 
    const elCap = window.el('capacidad-total'); 
    if (elOcc) elOcc.innerText = ocupacionActual; 
    if (elCap) elCap.innerText = totalCapacidad; 
};

window.showToast = msg => { 
    const t = window.el('toast'); 
    if(t) { 
        t.style.visibility = 'visible'; 
        t.innerText = msg; 
        t.classList.add('show'); 
        setTimeout(() => { t.classList.remove('show'); setTimeout(()=>{t.style.visibility='hidden'},300); }, 2000); 
    } 
};

window.formatearFecha = i => { 
    let v = i.value.replace(/\D/g, '').slice(0, 8); 
    if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`; 
    else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`; 
    else i.value = v; 
};

window.verificarMenor = p => { 
    const t = window.el(`${p}-tipo-doc`).value; 
    const i = window.el(`${p}-doc-num`); 
    if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; } 
    else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; } 
};

window.limpiarFormulario = p => { 
    ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = window.el(`${p}-${f}`); if (e) e.value = ""; }); 
    const i = window.el(`${p}-doc-num`); if (i) i.disabled = false; 
};

window.getDatosFormulario = p => ({ 
    nombre: window.safeVal(`${p}-nombre`), ap1: window.safeVal(`${p}-ap1`), ap2: window.safeVal(`${p}-ap2`), 
    tipoDoc: window.safeVal(`${p}-tipo-doc`), docNum: window.safeVal(`${p}-doc-num`), 
    fechaNac: window.safeVal(`${p}-fecha`), telefono: window.safeVal(`${p}-tel`) 
});

window.sysLog = (msg, type = 'info') => { 
    const c = document.getElementById('black-box-content'); 
    if (!c) return; 
    const d = document.createElement('div'); 
    d.className = 'log-entry'; 
    d.innerText = `[${new Date().toLocaleTimeString()}] [${type}] ${msg}`; 
    c.appendChild(d); 
    c.scrollTop = c.scrollHeight; 
};

window.onerror = (m, s, l) => { 
    window.sysLog(`CRITICAL ERROR: ${m} at line ${l}`, "error"); 
    if(currentUserData && currentUserData.rol === 'super_admin') window.safeShow('black-box-overlay'); 
};
window.toggleCajaNegra = () => { const b = window.el('black-box-overlay'); if (b) b.classList.toggle('hidden'); };
window.limpiarCajaNegra = () => { window.el('black-box-content').innerHTML = ""; };

// --- 4. FUNCIONES SEGURAS UI (Arriba para evitar errores de referencia) ---
window.resetIntervencion = function() { 
    personaEnGestion = null; 
    window.safeHide('view-scan-result'); 
    window.safeShow('view-scan-ready'); 
    if(typeof resetScannerUI === 'function') resetScannerUI();
};
window.detenerEscaner = function() { 
    if (html5QrCode && html5QrCode.isScanning) { 
        html5QrCode.stop().then(() => { html5QrCode.clear(); window.resetIntervencion(); }).catch(e=>{}); 
    } else { window.resetIntervencion(); }
};
function resetScannerUI() { 
    window.safeHide('reader'); window.safeHide('btn-stop-camera'); 
    window.safeShow('scan-placeholder'); window.safeShow('btn-start-camera'); 
}

window.sysLog("Sistema Iniciado. Versión 3.1.0 (Full)", "info");

// --- 5. NAVEGACIÓN ---
window.navegar = function(p) {
    window.sysLog(`Navegando: ${p}`, "nav");
    
    // Limpiamos suscripciones locales si cambiamos de contexto
    if(unsubscribeUsers) unsubscribeUsers(); 
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    // NO tocamos unsubscribeNotifs aquí para que el globo persista

    if (p === 'home' || p === 'gestion-albergues') {
        currentAlbergueId = null;
        if(window.el('app-title')) window.el('app-title').innerText = "Albergue Pro";
    }

    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio', 'screen-intervencion'].forEach(id=>window.safeHide(id));
    
    if(!currentUserData) return;
    
    if(p !== 'intervencion') { window.resetIntervencion(); window.detenerEscaner(); }

    if(p==='home') window.safeShow('screen-home');
    else if(p==='intervencion') { window.safeShow('screen-intervencion'); }
    else if(p==='gestion-albergues') { window.cargarAlberguesActivos(); window.safeShow('screen-gestion-albergues'); }
    else if(p==='mantenimiento') { window.cargarAlberguesMantenimiento(); window.safeShow('screen-mantenimiento'); }
    else if(p==='operativa') { window.safeShow('screen-operativa'); const t = window.configurarTabsPorRol(); window.cambiarPestana(t); } 
    else if(p==='observatorio') { window.cargarObservatorio(); window.safeShow('screen-observatorio'); }
    else if(p==='usuarios') { window.cargarUsuarios(); window.safeShow('screen-usuarios'); }
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(p.includes('albergue')) window.safeAddActive('nav-albergues'); 
    else if(p.includes('obs')) window.safeAddActive('nav-obs'); 
    else if(p.includes('mantenimiento')) window.safeAddActive('nav-mto'); 
    else if(p === 'intervencion') window.safeAddActive('nav-intervencion');
    else window.safeAddActive('nav-home');
};

window.configurarTabsPorRol = function() { 
    const r = (currentUserData.rol || "").toLowerCase().trim(); 
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeHide(id)); 
    if(['super_admin', 'admin'].includes(r)) { ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeShow(id)); return 'filiacion'; } 
    if(r === 'albergue') { window.safeShow('btn-tab-pref'); window.safeShow('btn-tab-fil'); window.safeShow('btn-tab-ent'); return 'filiacion'; } 
    if(['sanitario', 'psicosocial'].includes(r)) { window.safeShow('btn-tab-san'); window.safeShow('btn-tab-psi'); return 'sanitaria'; } 
    return 'filiacion'; 
};

window.cambiarPestana = function(t) { 
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial', 'tab-entregas'].forEach(id => window.safeHide(id)); 
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeRemoveActive(id)); 
    window.safeAddActive(`btn-tab-${t.substring(0,3)}`); window.safeShow(`tab-${t}`); 
    if (t === 'prefiliacion') { window.cancelarEdicionPref(); } 
    else if (t === 'filiacion') { 
        if(window.el('buscador-persona')) window.el('buscador-persona').value = ""; 
        window.safeHide('resultados-busqueda'); window.safeHide('panel-gestion-persona'); 
        window.personaEnGestion = null; 
    } else if (['sanitaria','psicosocial','entregas'].includes(t)) {
        const prefix = t === 'sanitaria' ? 'san' : (t === 'psicosocial' ? 'psi' : 'ent');
        if(window.el(`search-${prefix}`)) window.el(`search-${prefix}`).value = "";
        window.safeHide(`res-${prefix}`);
        window.cerrarFormularioIntervencion(prefix);
    }
};

window.configurarDashboard = function() { 
    const r=(currentUserData.rol||"").toLowerCase(); 
    if(window.el('user-name-display')) window.el('user-name-display').innerText=currentUserData.nombre; 
    if(window.el('user-role-badge')) window.el('user-role-badge').innerText=r.toUpperCase(); 
    window.safeHide('header-btn-users'); window.safeHide('container-ver-ocultos'); 
    if(r === 'super_admin') window.safeShow('header-btn-debug'); 
    if(['super_admin', 'admin'].includes(r)) { window.safeShow('header-btn-users'); } 
    const navItems = document.querySelectorAll('.nav-item'); 
    navItems.forEach(n => n.classList.remove('active', 'disabled', 'hidden')); 
    if(!['super_admin', 'admin'].includes(r)) { window.el('nav-mto').classList.add('disabled'); } 
    if(['albergue', 'sanitario', 'psicosocial'].includes(r)) { window.el('nav-obs').classList.add('disabled'); } 
    if(r === 'observador') { window.el('nav-albergues').classList.add('disabled'); } 
    if(r === 'super_admin') { window.safeShow('container-ver-ocultos'); } 
    window.safeAddActive('nav-home'); 
};

// --- 6. NOTIFICACIONES GLOBALES ---
window.suscribirNotificacionesGlobales = async function() {
    if(unsubscribeNotifs) unsubscribeNotifs();
    try { const snap = await getDocs(collection(db, "albergues")); snap.forEach(d => { alberguesMap[d.id] = d.data().nombre; }); } catch(e){}
    
    // Consulta sin filtro de albergue
    let q = query(collection(db, "derivaciones_pendientes"), where("estado", "==", "pendiente"));
    window.sysLog("Escuchando notificaciones globales...", "info");

    unsubscribeNotifs = onSnapshot(q, (snapshot) => {
        const rol = currentUserData.rol || "";
        let count = 0;
        listaNotificacionesCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            let show = false;
            if (['admin', 'super_admin'].includes(rol)) show = true;
            else if (rol === 'sanitario' && data.tipo === 'Sanitaria') show = true;
            else if (rol === 'psicosocial' && data.tipo === 'Psicosocial') show = true;
            else if (rol === 'albergue' && data.tipo === 'Entregas') show = true;
            if (show) { count++; listaNotificacionesCache.push({ id: doc.id, ...data }); }
        });
        const countEl = window.el('notif-count');
        if (count > 0) { 
            window.safeShow('notification-badge-container'); 
            if(countEl) countEl.innerText = count > 9 ? '9+' : count; 
        } else { window.safeHide('notification-badge-container'); }
    }, (error) => { window.sysLog(`Error Notif Global: ${error.message}`, "error"); });
};

window.gestionarClicGlobo = function() {
    window.safeShow('modal-notificaciones');
    const c = window.el('lista-notificaciones-content');
    c.innerHTML = "";
    if (listaNotificacionesCache.length === 0) { c.innerHTML = "<p style='text-align:center;color:#666;'>No hay derivaciones pendientes.</p>"; return; }

    if (currentAlbergueId) {
        const locales = listaNotificacionesCache.filter(n => n.albergueId === currentAlbergueId);
        if (locales.length === 0) {
            c.innerHTML = "<p style='text-align:center;color:#666;'>No hay pendientes en este albergue.</p><hr><p style='text-align:center;'><button class='secondary' onclick='window.navegar(\"home\"); window.gestionarClicGlobo();'>Ver Globales</button></p>";
            return;
        }
        locales.forEach(n => {
            let tabDestino = 'filiacion';
            if(n.tipo === 'Sanitaria') tabDestino = 'sanitaria';
            if(n.tipo === 'Psicosocial') tabDestino = 'psicosocial';
            if(n.tipo === 'Entregas') tabDestino = 'entregas';
            c.innerHTML += `<div class="notif-item" onclick="window.atenderNotificacion('${n.id}', '${n.personaId}', '${tabDestino}')"> 
                <div class="notif-info"> <strong>${n.personaNombre}</strong> <span>${n.motivo}</span> <small style="color:#999;">${new Date(n.fecha.seconds * 1000).toLocaleTimeString()}</small> </div> 
                <div class="notif-type notif-${n.tipo}">${n.tipo}</div> 
            </div>`;
        });
    } else {
        const resumen = {};
        listaNotificacionesCache.forEach(n => { if (!resumen[n.albergueId]) resumen[n.albergueId] = 0; resumen[n.albergueId]++; });
        c.innerHTML = "<h4 style='margin-bottom:15px; color:var(--primary); text-align:center;'>Resumen Global</h4>";
        Object.keys(resumen).forEach(albId => {
            const nombreAlb = alberguesMap[albId] || "Albergue Desconocido";
            c.innerHTML += `<div class="notif-item" onclick="window.cargarDatosYEntrar('${albId}')"> 
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <div class="notif-info"> <strong>${nombreAlb}</strong> </div> 
                    <span class="badge badge-active" style="background:var(--danger);">${resumen[albId]} Pendientes</span> 
                </div>
            </div>`;
        });
    }
};

window.atenderNotificacion = async function(notifId, personaId, tabDestino) {
    window.safeHide('modal-notificaciones');
    try { await updateDoc(doc(db, "derivaciones_pendientes", notifId), { estado: 'atendida' }); } catch(e) { console.error(e); }
    window.cambiarPestana(tabDestino);
    // RETARDO PARA ASEGURAR CARGA DE FICHA
    setTimeout(() => {
        const p = listaPersonasCache.find(x => x.id === personaId);
        if(p) {
            let prefix = '';
            if(tabDestino === 'sanitaria') prefix = 'san'; 
            else if(tabDestino === 'psicosocial') prefix = 'psi'; 
            else if(tabDestino === 'entregas') prefix = 'ent';
            if(prefix) { window.abrirFormularioIntervencion(p.id, prefix); }
        } else {
            alert("La persona no se encuentra en la lista activa de este albergue.");
        }
    }, 200);
};

// --- SIGUE EN PARTE 2 ---
// --- PARTE 2 ---

// --- 7. CARGADORES DE DATOS ---
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
            const elCounter = document.getElementById(`counter-${d.id}`);
            if(elCounter) elCounter.innerText = `Ocupación: ${snap.size} / ${alb.capacidad||0}`;
        });
    });
};

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
            if(personaEnGestion && !personaEnGestionEsGlobal) { const u=listaPersonasCache.find(x=>x.id===personaEnGestion.id); if(u) { if(!document.getElementById('view-scan-result').classList.contains('hidden')) window.cargarInterfazIntervencion(u); if(!document.getElementById('panel-gestion-persona').classList.contains('hidden')) personaEnGestion=u; } }
        });
        if(unsubscribePool) unsubscribePool(); unsubscribePool = onSnapshot(collection(db, "pool_prefiliacion"), s => { listaGlobalPrefiliacion = []; s.forEach(d => { const p = d.data(); p.id = d.id; listaGlobalPrefiliacion.push(p); }); });
        
        window.navegar('operativa');
        if(window.el('app-title')) window.el('app-title').innerText = currentAlbergueData.nombre;
        window.configurarDashboard(); window.actualizarContadores(); window.safeHide('loading-overlay'); 
        window.conectarListenersBackground(id); 
        window.setupAutoSave();
    } catch(e) { window.sysLog(`Error Cargando: ${e.message}`, "error"); alert(e.message); window.safeHide('loading-overlay'); }
};

window.cargarAlberguesMantenimiento = function() { 
    const c = window.el('mto-container'); 
    const isSuper = (currentUserData.rol === 'super_admin' || currentUserData.rol === 'admin');
    if(unsubscribeAlberguesMto) unsubscribeAlberguesMto(); 
    unsubscribeAlberguesMto = onSnapshot(query(collection(db,"albergues")), s => { 
        c.innerHTML = "<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>"; 
        s.forEach(d => { 
            const a = d.data(); 
            let extraBtn = isSuper ? `<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}', ${!a.activo})">${a.activo === false ? 'Activar' : 'Archivar'}</button>` : "";
            c.innerHTML += `<div class="mto-card ${!a.activo ? 'archived' : ''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`; 
        }); 
    }); 
};

window.cargarObservatorio = async function() { 
    const list = window.el('obs-list-container'); 
    if(!list) return; 
    list.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>'; 
    window.el('kpi-espera').innerText = "-"; window.el('kpi-alojados').innerText = "-"; window.el('kpi-libres').innerText = "-"; window.el('kpi-percent').innerText = "-%"; 
    try { 
        let totalEspera = 0, totalAlojados = 0, totalCapacidadGlobal = 0, htmlList = ""; 
        const alberguesSnap = await getDocs(query(collection(db, "albergues"), where("activo", "==", true))); 
        const promesas = alberguesSnap.docs.map(async (docAlb) => { 
            const dataAlb = docAlb.data(); const cap = parseInt(dataAlb.capacidad || 0); 
            const esperaSnap = await getDocs(query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", docAlb.id), where("estado", "==", "espera"))); 
            const w = esperaSnap.size; 
            const alojadosSnap = await getDocs(query(collection(db, "albergues", docAlb.id, "personas"), where("estado", "==", "ingresado"))); 
            const h = alojadosSnap.size; 
            return { id: docAlb.id, nombre: dataAlb.nombre, capacidad: cap, espera: w, alojados: h }; 
        }); 
        const resultados = await Promise.all(promesas); 
        resultados.forEach(res => { 
            totalEspera += res.espera; totalAlojados += res.alojados; totalCapacidadGlobal += res.capacidad; const libres = Math.max(0, res.capacidad - res.alojados); const porcentaje = res.capacidad > 0 ? Math.round((res.alojados / res.capacidad) * 100) : 0; 
            let barClass = "low"; if(porcentaje > 50) barClass = "med"; if(porcentaje > 85) barClass = "high"; 
            htmlList += `<div class="obs-row"><div class="obs-row-title">${res.nombre}</div><div class="obs-stats-group"><div class="obs-mini-stat"><span>Espera</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${res.id}', 'espera')">${res.espera}</strong></div><div class="obs-mini-stat"><span>Alojados</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${res.id}', 'alojados')">${res.alojados}</strong></div><div class="obs-mini-stat"><span>Ocupación</span><strong>${res.alojados} / ${res.capacidad}</strong></div><div class="obs-mini-stat"><span>Libres</span><strong>${libres}</strong></div></div><div class="prog-container"><div class="prog-track"><div class="prog-fill ${barClass}" style="width: ${porcentaje}%"></div></div></div></div>`; 
        }); 
        const globalLibres = Math.max(0, totalCapacidadGlobal - totalAlojados); const globalPercent = totalCapacidadGlobal > 0 ? Math.round((totalAlojados / totalCapacidadGlobal) * 100) : 0; 
        window.el('kpi-espera').innerText = totalEspera; window.el('kpi-alojados').innerText = totalAlojados; window.el('kpi-libres').innerText = globalLibres; window.el('kpi-percent').innerText = `${globalPercent}%`; list.innerHTML = htmlList; 
    } catch(e) { window.sysLog("Error obs: " + e.message, "error"); list.innerHTML = "<p>Error cargando datos.</p>"; } 
};

window.verListaObservatorio = async function(albId, tipo) { 
    const c = window.el('obs-modal-content'); const t = window.el('obs-modal-title'); 
    c.innerHTML = '<div style="text-align:center;"><div class="spinner"></div></div>'; 
    t.innerText = tipo === 'espera' ? 'Personas en Espera' : 'Personas Alojadas'; 
    window.safeShow('modal-obs-detalle'); 
    try { 
        let q; let isGlobal = false; 
        if (tipo === 'espera') { q = query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", albId), where("estado", "==", "espera")); isGlobal = true; } 
        else { q = query(collection(db, "albergues", albId, "personas"), where("estado", "==", "ingresado")); } 
        const snap = await getDocs(q); 
        if (snap.empty) { c.innerHTML = '<p>Sin registros.</p>'; return; } 
        let data = []; 
        snap.forEach(d => data.push({ id: d.id, ...d.data() })); 
        if (tipo === 'espera') { data.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0)); } 
        else { data.sort((a, b) => { if (!a.cama && !b.cama) return 0; if (!a.cama) return -1; if (!b.cama) return 1; return parseInt(a.cama) - parseInt(b.cama); }); } 
        let h = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`; 
        if(tipo === 'alojados') h += `<th>Cama</th>`; h += `<th>Nombre</th><th>DNI</th><th>Tel</th></tr></thead><tbody>`; 
        data.forEach(d => { const histBtn = `<button class="btn-icon-small" onclick="window.verHistorialObservatorio('${d.id}', ${isGlobal}, '${albId}')"><i class="fa-solid fa-clock-rotate-left"></i></button>`; h += `<tr><td style="text-align:center;">${histBtn}</td>`; if(tipo === 'alojados') h += `<td><strong>${d.cama || '-'}</strong></td>`; h += `<td>${d.nombre} ${d.ap1||''}</td><td>${d.docNum||'-'}</td><td>${d.telefono||'-'}</td></tr>`; }); 
        h += '</tbody></table>'; c.innerHTML = h; 
    } catch (e) { window.sysLog("Error list: " + e.message, "error"); c.innerHTML = "<p>Error al cargar lista.</p>"; } 
};

window.cargarUsuarios = function() { 
    const c = window.el('lista-usuarios-container'); 
    const filterText = window.safeVal('search-user').toLowerCase().trim(); 
    unsubscribeUsers = onSnapshot(query(collection(db,"usuarios")), s => { 
        c.innerHTML = ""; 
        s.forEach(d => { 
            const u = d.data(); 
            if(filterText && !u.nombre.toLowerCase().includes(filterText) && !u.email.toLowerCase().includes(filterText)) return; 
            c.innerHTML += `<div class="user-card-item ${u.activo===false?'inactive':'active'}" onclick="window.abrirModalUsuario('${d.id}')"><strong>${u.nombre}</strong><br><small>${u.rol}</small></div>`; 
        }); 
    }); 
};

// --- 8. INTERVENCIONES, CAMAS Y FAMILIA ---
window.buscarParaIntervencion = function(tipo) {
    const txt = window.safeVal(`search-${tipo}`).toLowerCase().trim();
    const res = window.el(`res-${tipo}`);
    if (txt.length < 2) { res.classList.add('hidden'); return; }
    const hits = listaPersonasCache.filter(p => {
        const full = `${p.nombre} ${p.ap1 || ''} ${p.ap2 || ''}`.toLowerCase();
        return full.includes(txt) || (p.docNum || "").toLowerCase().includes(txt);
    });
    res.innerHTML = "";
    if (hits.length === 0) { res.innerHTML = "<div class='search-item'>Sin resultados locales.</div>"; } 
    else { 
        hits.forEach(p => { 
            const hasBed = p.cama ? `Cama ${p.cama}` : "Sin Cama"; 
            res.innerHTML += ` 
            <div class="search-item" onclick="window.abrirFormularioIntervencion('${p.id}', '${tipo}')"> 
                <div> <strong>${p.nombre} ${p.ap1 || ''}</strong> <div style="font-size:0.8rem;color:#666;">${p.docNum || '-'} | ${hasBed}</div> </div> 
                <button class="btn-icon-small" style="background:var(--primary);color:white;">Selecionar</button> 
            </div>`; 
        }); 
    }
    res.classList.remove('hidden');
};

window.abrirFormularioIntervencion = function(pid, tipo) {
    const p = listaPersonasCache.find(x => x.id === pid);
    if(!p) return;
    personaIntervencionActiva = p;
    window.safeHide(`res-${tipo}`);
    window.safeShow(`form-int-${tipo}`);
    window.el(`search-${tipo}`).value = ""; 
    window.el(`name-int-${tipo}`).innerText = `${p.nombre} ${p.ap1 || ''}`;
    const sel = window.el(`sel-int-${tipo}`);
    sel.innerHTML = "";
    TIPOS_INTERVENCION[tipo].opciones.forEach(op => { sel.add(new Option(op, op)); });
    window.el(`det-int-${tipo}`).value = "";
};

window.cerrarFormularioIntervencion = function(tipo) { window.safeHide(`form-int-${tipo}`); personaIntervencionActiva = null; };

window.registrarIntervencion = async function(tipo) {
    if(!personaIntervencionActiva) return;
    const subtipo = window.safeVal(`sel-int-${tipo}`);
    const detalle = window.safeVal(`det-int-${tipo}`);
    const nombrePersona = personaIntervencionActiva.nombre; 
    if(!subtipo) return alert("Selecciona un tipo.");
    try {
        const data = { fecha: new Date(), usuario: currentUserData.nombre, tipo: TIPOS_INTERVENCION[tipo].titulo, subtipo: subtipo, detalle: detalle };
        await addDoc(collection(db, "albergues", currentAlbergueId, "personas", personaIntervencionActiva.id, "intervenciones"), data);
        window.showToast("Intervención Registrada");
        window.sysLog(`Intervención ${tipo} registrada para ${nombrePersona}`, "success");
        window.cerrarFormularioIntervencion(tipo); 
    } catch(e) { console.error(e); alert("Error al guardar: " + e.message); }
};

window.verHistorialIntervencion = function(tipo) { if(personaIntervencionActiva) window.verHistorial(personaIntervencionActiva.id); };

window.abrirMapaGeneral = function() { modoMapaGeneral = true; window.mostrarGridCamas(); };
window.abrirSeleccionCama = function() { modoMapaGeneral = false; window.mostrarGridCamas(); };
window.cerrarMapaCamas = function() { highlightedFamilyId = null; window.safeHide('modal-cama'); };

window.mostrarGridCamas = function() {
    const g = window.el('grid-camas');
    g.innerHTML = "";
    const cols = (currentAlbergueData && currentAlbergueData.columnas) ? currentAlbergueData.columnas : 8;
    g.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    let shadowMap = {}; let famGroups = {};
    listaPersonasCache.forEach(p => { if (p.familiaId) { if (!famGroups[p.familiaId]) famGroups[p.familiaId] = { members: [], beds: [] }; famGroups[p.familiaId].members.push(p); if (p.cama) famGroups[p.familiaId].beds.push(parseInt(p.cama)); } });
    Object.values(famGroups).forEach(fam => { let assigned = fam.beds.length; let total = fam.members.length; let needed = total - assigned; if (assigned > 0 && needed > 0) { let startBed = Math.max(...fam.beds); let placed = 0; let check = startBed + 1; while (placed < needed && check <= totalCapacidad) { if (!camasOcupadas[check.toString()]) { shadowMap[check.toString()] = fam.members[0].familiaId; placed++; } check++; } } });
    for (let i = 1; i <= totalCapacidad; i++) {
        const n = i.toString(); const occName = camasOcupadas[n]; const occ = listaPersonasCache.find(p => p.cama === n); let cls = "bed-box"; let lbl = n;
        if (occ && highlightedFamilyId && occ.familiaId === highlightedFamilyId) { cls += " bed-family-highlight"; }
        if (!window.modoMapaGeneral && window.personaEnGestion && window.personaEnGestion.cama === n) { cls += " bed-current"; lbl += " (Tú)"; } else if (occName) { cls += " bed-busy"; if (occ) { const f = `${occ.nombre} ${occ.ap1 || ''}`; lbl += `<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono || '-'}</div>`; const presencia = occ.presencia || 'dentro'; if (presencia === 'dentro') cls += " bed-status-in"; else cls += " bed-status-out"; } } else { cls += " bed-free"; if (shadowMap[n]) { cls += " bed-shadow"; } }
        const d = document.createElement('div'); d.className = cls; d.innerHTML = lbl; d.onclick = () => { if (occ) { if (highlightedFamilyId === occ.familiaId) highlightedFamilyId = null; else highlightedFamilyId = occ.familiaId; window.mostrarGridCamas(); } else if (!window.modoMapaGeneral) { window.guardarCama(n); } }; d.ondblclick = () => { if (occ) window.abrirModalInfoCama(occ); }; g.appendChild(d);
    }
    window.safeShow('modal-cama');
};

window.abrirModalInfoCama = function(p) {
    window.el('info-cama-num').innerText = p.cama; window.el('info-nombre-completo').innerText = p.nombre; window.el('info-telefono').innerText = p.telefono || "No consta";
    const bh = window.el('btn-historial-cama');
    if(['admin','super_admin'].includes(currentUserData.rol)) { window.safeShow('btn-historial-cama'); bh.onclick = () => window.verHistorial(p.id); } else { window.safeHide('btn-historial-cama'); }
    const c = window.el('info-familia-detalle'); const fam = listaPersonasCache.filter(x => x.familiaId === p.familiaId);
    let h = `<table class="fam-table"><thead><tr><th>Nombre</th><th>DNI/Tel</th><th>Cama</th></tr></thead><tbody>`;
    fam.forEach(f => { const isCurrent = f.id === p.id ? 'fam-row-current' : ''; h += `<tr class="${isCurrent}"><td>${f.nombre} ${f.ap1 || ''}</td><td><small>${f.docNum || '-'}<br>${f.telefono || '-'}</small></td><td><strong>${f.cama || '-'}</strong></td></tr>`; });
    h += `</tbody></table>`; c.innerHTML = h; window.safeShow('modal-bed-info');
};

window.guardarCama = async function(c) {
    if (savingLock) return; savingLock = true;
    if (personaEnGestionEsGlobal) { if (!confirm(`¿Ingresar y asignar cama ${c}?`)) { savingLock = false; return; } try { const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId); const batch = writeBatch(db); let newPersonLocalId = null; for (const member of familia) { const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas")); const memberData = { ...member }; delete memberData.id; memberData.fechaIngresoAlbergue = new Date(); memberData.origenPoolId = member.id; if (member.id === personaEnGestion.id) { memberData.estado = 'ingresado'; memberData.cama = c.toString(); memberData.fechaIngreso = new Date(); newPersonLocalId = localRef.id; } else { memberData.estado = 'espera'; } batch.set(localRef, memberData); batch.delete(doc(db, "pool_prefiliacion", member.id)); const logRef = collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial"); batch.set(doc(logRef), { fecha: new Date(), usuario: currentUserData.nombre, accion: "Ingreso + Cama", detalle: `Cama ${c}` }); } await batch.commit(); window.sysLog(`Ingreso + Cama ${c} OK`, "success"); window.cerrarMapaCamas(); window.showToast("Ingresado. Cargando..."); setTimeout(() => { const newPerson = listaPersonasCache.find(p => p.id === newPersonLocalId); if (newPerson) window.seleccionarPersona(newPerson, false); else { window.safeHide('panel-gestion-persona'); window.el('buscador-persona').value = ""; } savingLock = false; }, 1000); } catch (e) { window.sysLog("Error: " + e.message, "error"); savingLock = false; } return; }
    if (personaEnGestion.cama) { alert(`Error: Ya tiene cama.`); savingLock = false; return; }
    try { await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id), { estado: 'ingresado', cama: c.toString(), fechaIngreso: new Date() }); window.registrarLog(personaEnGestion.id, "Asignación Cama", `Cama ${c}`); window.cerrarMapaCamas(); window.sysLog(`Cama ${c} asignada`, "success"); } catch (e) { window.sysLog("Error saving bed: " + e.message, "error"); alert("Error al guardar cama"); } savingLock = false;
};

window.liberarCamaMantener = async function() { if(!personaEnGestion) return; if(!confirm(`¿Liberar cama?`)) return; try { await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id), { cama: null }); window.registrarLog(personaEnGestion.id, "Liberar Cama", "Se mantiene en albergue"); window.sysLog("Cama liberada.", "success"); if(!modoMapaGeneral) window.cerrarMapaCamas(); } catch(e) { window.sysLog("Error liberando cama: " + e.message, "error"); } };

// --- SIGUE EN PARTE 3 ---
// --- PARTE 3 ---

window.buscarPersonaEnAlbergue = function() { 
    const t=window.safeVal('buscador-persona').toLowerCase().trim(); const r=window.el('resultados-busqueda'); 
    if(t.length<2){ window.safeHide('resultados-busqueda'); return; } 
    const l=listaPersonasCache.filter(p=>(p.nombre+" "+p.ap1).toLowerCase().includes(t)||(p.docNum||"").toLowerCase().includes(t)); 
    const g=listaGlobalPrefiliacion.filter(p=>(p.nombre+" "+p.ap1).toLowerCase().includes(t)||(p.docNum||"").toLowerCase().includes(t)); 
    r.innerHTML=""; 
    if(l.length===0&&g.length===0) r.innerHTML="<div>No encontrado</div>"; 
    else { 
        l.forEach(p=>{ r.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}',false)">${p.nombre} ${p.ap1} (Local)</div>`; }); 
        g.forEach(p=>{ r.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}',true)">${p.nombre} ${p.ap1} (Nube)</div>`; }); 
    } 
    window.safeShow('resultados-busqueda'); 
};

window.seleccionarPersona = function(pid, isGlobal) { 
    if(typeof pid!=='string') pid=pid.id; let p; 
    if(isGlobal) { p=listaGlobalPrefiliacion.find(x=>x.id===pid); personaEnGestionEsGlobal=true; window.safeShow('banner-nube'); window.safeHide('btns-local-actions'); window.safeShow('btns-cloud-actions'); } 
    else { p=listaPersonasCache.find(x=>x.id===pid); personaEnGestionEsGlobal=false; window.safeHide('banner-nube'); window.safeShow('btns-local-actions'); window.safeHide('btns-cloud-actions'); }
    if(!p) return; 
    personaEnGestion=p; prefiliacionEdicionId=p.id; isGlobalEdit=isGlobal; 
    window.safeHide('resultados-busqueda'); window.safeShow('panel-gestion-persona'); 
    window.el('gestion-nombre-titulo').innerText=p.nombre; window.el('gestion-estado').innerText=isGlobal?"EN NUBE":p.estado; window.el('gestion-cama-info').innerText=(p.cama&&!isGlobal)?`Cama: ${p.cama}`:""; 
    window.setVal('edit-nombre',p.nombre); window.setVal('edit-ap1',p.ap1); window.setVal('edit-ap2',p.ap2); window.setVal('edit-tipo-doc',p.tipoDoc); window.setVal('edit-doc-num',p.docNum); window.setVal('edit-fecha',p.fechaNac); window.setVal('edit-tel',p.telefono); 
    const flist=window.el('info-familia-lista'); flist.innerHTML=""; let fam=[]; 
    if(isGlobal) fam=listaGlobalPrefiliacion.filter(x=>x.familiaId===p.familiaId); else fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId); 
    window.el('info-familia-resumen').innerText=fam.length>1?`Familia (${fam.length})`:"Individual"; 
    fam.forEach(f=>{ if(f.id!==p.id){ flist.innerHTML+=`<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;" onclick="window.seleccionarPersona('${f.id}',${isGlobal})"><strong>${f.nombre}</strong><br>${f.docNum||'-'}</div>`; } }); 
    if(!isGlobal) window.setupAutoSave(); 
};

window.guardarCambiosPersona = async function() { if(!personaEnGestion) return; const p=window.getDatosFormulario('edit'); await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),p); window.registrarLog(personaEnGestion.id,"Edición","Manual"); window.showToast("Guardado"); };
window.darSalidaPersona = async function() { if(!confirm("Dar salida?")) return; const b=writeBatch(db); const pr=doc(collection(db,"pool_prefiliacion")); const md={...personaEnGestion}; delete md.id; md.cama=null; md.estado='espera'; md.fechaSalida=new Date(); b.set(pr,md); b.delete(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id)); await b.commit(); window.showToast("Salida OK"); window.safeHide('panel-gestion-persona'); };

window.verHistorial = async function(pId = null, forceIsGlobal = null, forceAlbId = null) {
    let targetId = pId; let isPool = (forceIsGlobal !== null) ? forceIsGlobal : personaEnGestionEsGlobal; const activeAlbId = forceAlbId || currentAlbergueId;
    if (!targetId && personaEnGestion) targetId = personaEnGestion.id;
    if (pId && forceIsGlobal === null && listaPersonasCache.find(x => x.id === pId)) isPool = false;
    if (!targetId) return;
    let nombrePersona = "Usuario";
    if (personaEnGestion && personaEnGestion.id === targetId) nombrePersona = `${personaEnGestion.nombre} ${personaEnGestion.ap1 || ''}`;
    else if (listaPersonasCache.length > 0) { const found = listaPersonasCache.find(x => x.id === targetId); if (found) nombrePersona = `${found.nombre} ${found.ap1 || ''}`; }
    else if (listaGlobalPrefiliacion.length > 0) { const found = listaGlobalPrefiliacion.find(x => x.id === targetId); if (found) nombrePersona = `${found.nombre} ${found.ap1 || ''}`; }
    const headerEl = window.el('hist-modal-header'); if (headerEl) headerEl.innerText = `Historial de: ${nombrePersona}`;
    window.safeShow('modal-historial'); const content = window.el('historial-content'); content.innerHTML = '<div style="text-align:center"><div class="spinner"></div></div>';
    try {
        let items = [];
        let pathHist = isPool ? collection(db, "pool_prefiliacion", targetId, "historial") : collection(db, "albergues", activeAlbId, "personas", targetId, "historial");
        const snapHist = await getDocs(pathHist); snapHist.forEach(d => { const data = d.data(); items.push({ ...data, type: 'movimiento', id: d.id, sortDate: data.fecha.toDate() }); });
        if (!isPool) {
            let pathInt = collection(db, "albergues", activeAlbId, "personas", targetId, "intervenciones");
            const snapInt = await getDocs(pathInt); snapInt.forEach(d => { const data = d.data(); items.push({ usuario: data.usuario, accion: data.tipo + ": " + data.subtipo, detalle: data.detalle, fecha: data.fecha, type: 'intervencion', rawType: data.tipo, id: d.id, sortDate: data.fecha.toDate() }); });
        }
        items.sort((a, b) => b.sortDate - a.sortDate);
        if (items.length === 0) { content.innerHTML = "<p>No hay registros.</p>"; return; }
        let html = `<div class="hist-timeline">`;
        items.forEach(d => {
            const f = d.sortDate; const fmt = `${f.getDate().toString().padStart(2, '0')}/${(f.getMonth() + 1).toString().padStart(2, '0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2, '0')}:${f.getMinutes().toString().padStart(2, '0')}`;
            let extraClass = '';
            if (d.type === 'intervencion') { if (d.rawType === 'Sanitaria') extraClass = 'hist-type-san'; else if (d.rawType === 'Psicosocial') extraClass = 'hist-type-psi'; else if (d.rawType === 'Entregas') extraClass = 'hist-type-ent'; }
            const icon = d.type === 'intervencion' ? '<i class="fa-solid fa-hand-holding-medical"></i>' : '<i class="fa-solid fa-shoe-prints"></i>';
            html += `<div class="hist-item ${extraClass}"><div class="hist-header"><span class="hist-date"><i class="fa-regular fa-clock"></i> ${fmt}</span><span class="hist-user"><i class="fa-solid fa-user-tag"></i> ${d.usuario}</span></div><span class="hist-action">${icon} ${d.accion}</span>${d.detalle ? `<span class="hist-detail">${d.detalle}</span>` : ''}</div>`;
        });
        html += `</div>`; content.innerHTML = html;
    } catch (e) { content.innerHTML = "Error cargando datos."; window.sysLog("Error historial mixto: " + e.message, "error"); }
};
window.verHistorialObservatorio = function(pId, isGlobal, albId){ window.verHistorial(pId, isGlobal, albId); };

window.cancelarEdicionPref=function(){prefiliacionEdicionId=null;window.limpiarFormulario('man');if(window.el('existing-family-list-ui'))window.el('existing-family-list-ui').innerHTML="";window.safeHide('btn-cancelar-edicion-pref');window.safeHide('btn-ingresar-pref');};
window.adminPrefiliarManual=async function(silent=false){if(silent&&!prefiliacionEdicionId)return;if(prefiliacionEdicionId&&isGlobalEdit){const p=window.getDatosFormulario('man');await updateDoc(doc(db,"pool_prefiliacion",prefiliacionEdicionId),p);window.registrarLog(prefiliacionEdicionId,"Edición Pool","Manual",true);if(!silent){window.showToast("Pool Actualizado");window.cancelarEdicionPref();}return;}const n=window.safeVal('man-nombre');if(!n)return alert("Falta nombre");const fid=new Date().getTime().toString();const t=window.getDatosFormulario('man');t.estado='espera';t.familiaId=fid;t.rolFamilia='TITULAR';t.fechaRegistro=new Date();t.origenAlbergueId=currentAlbergueId;const ref=await addDoc(collection(db,"pool_prefiliacion"),t);window.registrarLog(ref.id,"Alta Staff","Titular",true);for(const f of adminFamiliaresTemp){const refF=await addDoc(collection(db,"pool_prefiliacion"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date(),origenAlbergueId:currentAlbergueId});window.registrarLog(refF.id,"Alta Staff","Familiar",true);}if(!silent){alert("Guardado en Pool Global");window.limpiarFormulario('man');adminFamiliaresTemp=[];if(window.el('admin-lista-familiares-ui'))window.el('admin-lista-familiares-ui').innerHTML="Ninguno.";}};
window.rescatarDeGlobalDirecto = async function() { if (!personaEnGestion || !personaEnGestionEsGlobal) return; if (!confirm(`¿Ingresar a ${personaEnGestion.nombre}?`)) return; try { const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId); const batch = writeBatch(db); for (const member of familia) { const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas")); const memberData = { ...member }; delete memberData.id; memberData.fechaIngresoAlbergue = new Date(); memberData.origenPoolId = member.id; memberData.estado = 'espera'; batch.set(localRef, memberData); batch.delete(doc(db, "pool_prefiliacion", member.id)); const logRef = collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial"); batch.set(doc(logRef), { fecha: new Date(), usuario: currentUserData.nombre, accion: "Ingreso desde Nube", detalle: "Rescatado" }); const oldHistSnap = await getDocs(collection(db, "pool_prefiliacion", member.id, "historial")); oldHistSnap.forEach(h => { const newHistRef = doc(logRef); batch.set(newHistRef, h.data()); }); } await batch.commit(); window.sysLog(`Familia ingresada con historial.`, "success"); window.showToast("Ingreso realizado."); window.personaEnGestion = null; window.safeHide('panel-gestion-persona'); window.el('buscador-persona').value = ""; } catch (e) { window.sysLog("Error ingreso: " + e.message, "error"); } };
window.publicoGuardarTodo = async function() { const d = window.getDatosFormulario('pub'); if (!d.nombre) return alert("Falta nombre"); if (!auth.currentUser) { try { await signInAnonymously(auth); } catch (e) {} } let nombreAlb = "Albergue (QR)"; const hAlb = window.el('public-albergue-name'); if(hAlb) nombreAlb = hAlb.innerText; const b = writeBatch(db); const fid = new Date().getTime().toString(); const tRef = doc(collection(db, "pool_prefiliacion")); b.set(tRef, { ...d, familiaId: fid, rolFamilia: 'TITULAR', estado: 'espera', origenAlbergueId: currentAlbergueId, fechaRegistro: new Date() }); const lRef = collection(db, "pool_prefiliacion", tRef.id, "historial"); b.set(doc(lRef), { fecha: new Date(), usuario: "Auto-QR", accion: "Alta en Pool", detalle: `Desde QR ${nombreAlb}` }); listaFamiliaresTemp.forEach(async f => { const fRef = doc(collection(db, "pool_prefiliacion")); b.set(fRef, { ...f, familiaId: fid, rolFamilia: 'MIEMBRO', estado: 'espera', origenAlbergueId: currentAlbergueId, fechaRegistro: new Date() }); }); await b.commit(); window.safeHide('public-form-container'); window.safeShow('public-success-msg'); }

window.conectarListenersBackground = function(id) { if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc(); unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); window.actualizarContadores(); } }); };
window.setupAutoSave = function() { const inputsFil = ['edit-nombre','edit-ap1','edit-ap2','edit-doc-num','edit-tel','edit-fecha']; inputsFil.forEach(id => { const el = window.el(id); if(el && !el.dataset.hasAutosave) { el.addEventListener('blur', () => window.guardarCambiosPersona(true)); el.dataset.hasAutosave = "true"; if(id === 'edit-fecha') el.oninput = function() { window.formatearFecha(this); }; } }); const inputsPref = ['man-nombre','man-ap1','man-ap2','man-doc-num','man-tel','man-fecha']; inputsPref.forEach(id => { const el = window.el(id); if(el && !el.dataset.hasAutosave) { el.addEventListener('blur', () => { if(prefiliacionEdicionId) window.adminPrefiliarManual(true); }); el.dataset.hasAutosave = "true"; if(id === 'man-fecha') el.oninput = function() { window.formatearFecha(this); }; } }); };
window.registrarLog=async function(pid,act,det,isPool=false){try{const usuarioLog=currentUserData?currentUserData.nombre:"Auto-QR";let path=isPool?collection(db,"pool_prefiliacion",pid,"historial"):collection(db,"albergues",currentAlbergueId,"personas",pid,"historial");await addDoc(path,{fecha:new Date(),usuario:usuarioLog,accion:act,detalle:det});window.sysLog(`Audit Log (${isPool?'Pool':'Local'}): ${act} - ${det}`,"info");}catch(e){console.error(e);}};
window.confirmarDerivacion = async function() { const m = window.el('derivacion-motivo').value; if(!m) return alert("Motivo?"); await addDoc(collection(db,"derivaciones_pendientes"),{ albergueId: currentAlbergueId, personaId: personaEnGestion.id, personaNombre: personaEnGestion.nombre, tipo: tipoDerivacionActual, motivo: m, fecha: new Date(), estado: 'pendiente' }); window.showToast("Enviado"); window.safeHide('modal-derivacion'); };

// --- INIT ---
window.onload = async () => {
    if(isPublicMode){
        window.safeHide('login-screen');
        window.safeShow('public-register-screen');
        window.safeShow('public-welcome-screen');
        window.safeHide('public-form-container');
        window.safeHide('app-shell'); 
        try {
            await signInAnonymously(auth);
            const docRef = doc(db, "albergues", currentAlbergueId);
            const docSnap = await getDoc(docRef);
            if(docSnap.exists()){
                const d = docSnap.data();
                if(window.el('public-albergue-name')) window.el('public-albergue-name').innerText = d.nombre;
            }
        } catch(e) { console.error("Error init público:", e); alert("Error de conexión con el albergue."); }
    } else {
        const passInput = document.getElementById('login-pass');
        if(passInput) passInput.addEventListener('keypress', e=>{ if(e.key==='Enter') window.iniciarSesion(); });
    }
    const params = new URLSearchParams(window.location.search);
    if(params.get('action') === 'scan') { window.sysLog("Deep Link detectado. Esperando Auth...", "info"); }
};

onAuthStateChanged(auth, async (u) => {
    if(isPublicMode) return;
    if(u){
        window.suscribirNotificacionesGlobales(); // CARGAR GLOBO AL INICIO
        const s = await getDoc(doc(db,"usuarios",u.uid));
        if(s.exists()){
            const d = s.data();
            if (d.activo === false) { window.sysLog("Acceso denegado: Usuario inactivo", "warn"); alert("Este usuario ha sido desactivado por administración."); signOut(auth); return; }
            currentUserData = {...d, uid: u.uid};
            window.sysLog(`Usuario autenticado: ${currentUserData.nombre} (${currentUserData.rol})`, "success");
            window.safeHide('login-screen');
            window.safeShow('app-shell');
            window.configurarDashboard();
            const params = new URLSearchParams(window.location.search);
            if(params.get('action') === 'scan' && params.get('aid') && params.get('pid')) { window.iniciarModoFocalizado(params.get('aid'), params.get('pid')); } else { window.navegar('home'); }
        } else {
            window.sysLog("Usuario fantasma detectado. Restaurando INACTIVO...", "warn");
            await setDoc(doc(db,"usuarios",u.uid), { email: u.email, nombre: u.email.split('@')[0], rol: "observador", activo: false });
            alert("Tu usuario ha sido restaurado pero está INACTIVO por seguridad.\n\nContacta con un administrador para que te active.");
            signOut(auth);
        }
    } else {
        window.sysLog("Esperando inicio de sesión...", "info");
        window.safeHide('app-shell');
        window.safeShow('login-screen');
    }
});
