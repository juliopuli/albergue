
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN ---
const firebaseConfig = { 
    apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", 
    authDomain: "albergues-temporales.firebaseapp.com", 
    projectId: "albergues-temporales", 
    storageBucket: "albergues-temporales.firebasestorage.app", 
    messagingSenderId: "489999184108", 
    appId: "1:489999184108:web:32b9b580727f83158075c9" 
};
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// --- UTILIDADES ---
window.el = function(id) { return document.getElementById(id); };
window.safeHide = function(id) { const e = window.el(id); if(e) e.classList.add('hidden'); };
window.safeShow = function(id) { const e = window.el(id); if(e) e.classList.remove('hidden'); };
window.safeRemoveActive = function(id) { const e = window.el(id); if(e) e.classList.remove('active'); };
window.safeAddActive = function(id) { const e = window.el(id); if(e) e.classList.add('active'); };
window.safeVal = function(id) { const e = window.el(id); return e ? e.value : ""; };
window.setVal = function(id, val) { const e = window.el(id); if (e) e.value = val; };
window.actualizarContadores = function() { const elOcc = window.el('ocupacion-count'); const elCap = window.el('capacidad-total'); if (elOcc) elOcc.innerText = ocupacionActual; if (elCap) elCap.innerText = totalCapacidad; };
window.showToast = function(msg) { const t = window.el('toast'); if(t) { t.style.visibility = 'visible'; t.innerText = msg; t.classList.add('show'); setTimeout(() => { t.classList.remove('show'); setTimeout(()=>{t.style.visibility='hidden'},300); }, 2000); } };
window.formatearFecha = function(i) { let v = i.value.replace(/\D/g, '').slice(0, 8); if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`; else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`; else i.value = v; };
window.verificarMenor = function(p) { const t = window.el(`${p}-tipo-doc`).value; const i = window.el(`${p}-doc-num`); if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; } else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; } };
window.limpiarFormulario = function(p) { ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = window.el(`${p}-${f}`); if (e) e.value = ""; }); const i = window.el(`${p}-doc-num`); if (i) i.disabled = false; };
window.getDatosFormulario = function(p) { return { nombre: window.safeVal(`${p}-nombre`), ap1: window.safeVal(`${p}-ap1`), ap2: window.safeVal(`${p}-ap2`), tipoDoc: window.safeVal(`${p}-tipo-doc`), docNum: window.safeVal(`${p}-doc-num`), fechaNac: window.safeVal(`${p}-fecha`), telefono: window.safeVal(`${p}-tel`) }; };

window.sysLog = function(msg, type = 'info') {
    const c = document.getElementById('black-box-content');
    if (!c) { console.log(msg); return; }
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    let typeClass = 'log-type-info'; 
    if (type === 'error') typeClass = 'log-type-error'; if (type === 'warn') typeClass = 'log-type-warn'; if (type === 'nav') typeClass = 'log-type-nav';
    const div = document.createElement('div'); div.className = 'log-entry';
    div.innerHTML = `<span class="log-time">[${time}]</span> <span class="${typeClass}">[${type.toUpperCase()}]</span> ${msg}`;
    c.appendChild(div); c.scrollTop = c.scrollHeight;
    if(type === 'error') console.error(msg); else console.log(`[SYS] ${msg}`);
};
window.onerror = function(message, source, lineno, colno, error) { window.sysLog(`CRITICAL ERROR: ${message} at line ${lineno}`, "error"); if(currentUserData && currentUserData.rol === 'super_admin') { document.getElementById('black-box-overlay').classList.remove('hidden'); } };
window.toggleCajaNegra = function() { const bb = document.getElementById('black-box-overlay'); if (bb) { if (bb.classList.contains('hidden')) { bb.classList.remove('hidden'); window.sysLog("Debug activado", "info"); } else { bb.classList.add('hidden'); } } };
window.limpiarCajaNegra = function() { const c = document.getElementById('black-box-content'); if (c) c.innerHTML = ""; };

window.sysLog("Sistema Iniciado. Versión 2.7.1 (Global Badge)", "info");

// --- GLOBALES ---
let isPublicMode = false;
let currentAlbergueId = null; // Si es null, estamos en "Modo Global/Home"
let alberguesMap = {}; // Cache para nombres de albergues
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) { isPublicMode = true; currentAlbergueId = urlParams.get('public_id'); }

let currentUserData = null;
let currentAlbergueData = null;
let totalCapacidad = 0;
let ocupacionActual = 0;
let camasOcupadas = {};
let listaPersonasCache = []; 
let listaGlobalPrefiliacion = []; 
let listaNotificacionesCache = []; // Ahora guarda TODO lo pendiente globalmente
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

// --- FUNCIONES INTERFAZ BÁSICAS ---
window.resetIntervencion = function() { personaEnGestion = null; window.safeHide('view-scan-result'); window.safeShow('view-scan-ready'); resetScannerUI(); };
window.detenerEscaner = function() { if (html5QrCode && html5QrCode.isScanning) { html5QrCode.stop().then(() => { window.sysLog("Cámara detenida.", "info"); html5QrCode.clear(); }).catch(err => console.error(err)).finally(() => { resetScannerUI(); }); } else { resetScannerUI(); } };
function resetScannerUI() { window.safeHide('reader'); window.safeHide('btn-stop-camera'); window.safeShow('scan-placeholder'); window.safeShow('btn-start-camera'); }

// --- NUEVA LÓGICA DE NOTIFICACIONES GLOBALES ---

// Se llama al Login. Escucha TODO lo pendiente.
window.suscribirNotificacionesGlobales = async function() {
    if(unsubscribeNotifs) unsubscribeNotifs();
    
    // Primero, cargar mapa de nombres de albergues para mostrarlos bonitos
    try {
        const snap = await getDocs(collection(db, "albergues"));
        snap.forEach(d => { alberguesMap[d.id] = d.data().nombre; });
    } catch(e) { console.warn("No se pudo cargar mapa de albergues", e); }

    // Query Global: Dame todo lo pendiente
    let q = query(collection(db, "derivaciones_pendientes"), where("estado", "==", "pendiente"));
    window.sysLog("Iniciando escucha GLOBAL de notificaciones...", "info");

    unsubscribeNotifs = onSnapshot(q, (snapshot) => {
        const rol = currentUserData.rol || "";
        let count = 0;
        listaNotificacionesCache = []; // Reiniciamos cache global
        
        snapshot.forEach(doc => {
            const data = doc.data();
            let show = false;
            // Filtro de Rol
            if (['admin', 'super_admin'].includes(rol)) show = true;
            else if (rol === 'sanitario' && data.tipo === 'Sanitaria') show = true;
            else if (rol === 'psicosocial' && data.tipo === 'Psicosocial') show = true;
            else if (rol === 'albergue' && data.tipo === 'Entregas') show = true;
            
            if (show) { 
                count++; 
                listaNotificacionesCache.push({ id: doc.id, ...data }); 
            }
        });
        
        const badge = window.el('notification-badge-container');
        const countEl = window.el('notif-count');
        
        // Actualizar globo en el header
        if (count > 0) { 
            window.safeShow('notification-badge-container'); 
            if(countEl) countEl.innerText = count > 9 ? '9+' : count; 
        } else { 
            window.safeHide('notification-badge-container'); 
        }
    }, (error) => {
        window.sysLog(`Error Notif Global: ${error.message}`, "error");
    });
};

// Gestiona qué pasa al hacer clic en el globo según dónde estemos
window.gestionarClicGlobo = function() {
    window.safeShow('modal-notificaciones');
    const c = window.el('lista-notificaciones-content');
    c.innerHTML = "";

    if (listaNotificacionesCache.length === 0) { 
        c.innerHTML = "<p style='text-align:center;color:#666;'>No hay derivaciones pendientes.</p>"; 
        return; 
    }

    // CASO A: Estamos DENTRO de un albergue -> Mostrar solo las de este albergue para actuar
    if (currentAlbergueId) {
        const locales = listaNotificacionesCache.filter(n => n.albergueId === currentAlbergueId);
        if (locales.length === 0) {
            c.innerHTML = "<p style='text-align:center;color:#666;'>No hay pendientes en este albergue.</p><hr><p style='text-align:center;font-size:0.8em'><a href='#' onclick='window.navegar(\"home\"); window.gestionarClicGlobo();'>Ver Globales</a></p>";
            return;
        }
        locales.forEach(n => {
            let tabDestino = 'filiacion';
            if(n.tipo === 'Sanitaria') tabDestino = 'sanitaria';
            if(n.tipo === 'Psicosocial') tabDestino = 'psicosocial';
            if(n.tipo === 'Entregas') tabDestino = 'entregas';
            c.innerHTML += `<div class="notif-item" onclick="window.atenderNotificacion('${n.id}', '${n.personaId}', '${tabDestino}')"> 
                <div class="notif-info"> 
                    <strong>${n.personaNombre}</strong> 
                    <span>${n.motivo}</span> 
                    <small style="color:#999;">${new Date(n.fecha.seconds * 1000).toLocaleTimeString()}</small> 
                </div> 
                <div class="notif-type notif-${n.tipo}">${n.tipo}</div> 
            </div>`;
        });
        
    // CASO B: Estamos FUERA (Home) -> Mostrar resumen por Albergue
    } else {
        // Agrupar por albergue
        const resumen = {};
        listaNotificacionesCache.forEach(n => {
            if (!resumen[n.albergueId]) resumen[n.albergueId] = 0;
            resumen[n.albergueId]++;
        });

        c.innerHTML = "<h4 style='margin-bottom:10px; color:var(--primary);'>Resumen Global</h4>";
        Object.keys(resumen).forEach(albId => {
            const nombreAlb = alberguesMap[albId] || "Albergue Desconocido";
            const num = resumen[albId];
            c.innerHTML += `<div class="notif-item" onclick="window.cargarDatosYEntrar('${albId}')"> 
                <div class="notif-info"> 
                    <strong>${nombreAlb}</strong> 
                    <span style="color:var(--danger); font-weight:bold;">${num} Pendientes</span> 
                </div> 
                <div class="notif-type" style="background:#334155;">ENTRAR</div> 
            </div>`;
        });
    }
};

// --- AUTH & USUARIOS ---
window.iniciarSesion = async function() { try { window.sysLog("Click Login", "info"); await signInWithEmailAndPassword(auth, window.el('login-email').value, window.el('login-pass').value); window.sysLog("Auth Firebase OK", "success"); } catch(err) { window.sysLog("Error Auth: " + err.message, "error"); alert(err.message); } };
window.cerrarSesion = function() { window.sysLog("Cerrando sesión", "warn"); signOut(auth); location.reload(); };
window.cambiarEstadoUsuarioDirecto = async function(uid, nuevoEstado) { if (currentUserData.rol !== 'super_admin' && currentUserData.rol !== 'admin') { alert("Sin permisos"); window.cargarUsuarios(); return; } const targetDoc = await getDoc(doc(db, "usuarios", uid)); if (targetDoc.exists()) { const u = targetDoc.data(); if (u.rol === 'super_admin') { alert("Seguridad: No se puede desactivar a un Super Admin."); window.cargarUsuarios(); return; } if (currentUserData.rol === 'admin' && u.rol === 'admin') { alert("Seguridad: No puedes desactivar a otro Administrador."); window.cargarUsuarios(); return; } } await updateDoc(doc(db, "usuarios", uid), { activo: nuevoEstado }); window.sysLog(`Usuario ${uid} estado: ${nuevoEstado}`, "info"); };
window.filtrarUsuarios = function() { window.cargarUsuarios(); };
window.abrirModalUsuario = async function(id = null) { userEditingId = id; window.safeShow('modal-crear-usuario'); const sel = window.el('new-user-role'); sel.innerHTML = ""; let roles = ['albergue', 'sanitario', 'psicosocial', 'observador']; if (currentUserData.rol === 'super_admin') { roles = ['super_admin', 'admin', ...roles]; } else if (currentUserData.rol === 'admin') { roles = ['albergue', 'sanitario', 'psicosocial', 'observador']; } roles.forEach(r => sel.add(new Option(r, r))); window.el('new-user-active').checked = true; window.el('new-user-active').disabled = false; if (id) { const s = await getDoc(doc(db, "usuarios", String(id))); if (s.exists()) { const d = s.data(); window.setVal('new-user-name', d.nombre); window.setVal('new-user-email', d.email); if (!roles.includes(d.rol)) { const opt = new Option(d.rol, d.rol); opt.disabled = true; sel.add(opt); } sel.value = d.rol; window.el('new-user-active').checked = (d.activo !== false); if (d.rol === 'super_admin') window.el('new-user-active').disabled = true; if (currentUserData.rol === 'super_admin') window.safeShow('btn-delete-user'); else window.safeHide('btn-delete-user'); } } else { window.setVal('new-user-name', ""); window.setVal('new-user-email', ""); window.safeHide('btn-delete-user'); } };
window.guardarUsuario = async function() { const e = window.safeVal('new-user-email'), p = window.safeVal('new-user-pass'), n = window.safeVal('new-user-name'), r = window.safeVal('new-user-role'); let isActive = window.el('new-user-active').checked; if (!e || !n) return alert("Faltan datos (Email/Nombre)"); if (r === 'super_admin' && !isActive) { alert("Seguridad: Super Admin siempre activo."); isActive = true; } try { if (userEditingId) { await updateDoc(doc(db, "usuarios", userEditingId), { nombre: n, rol: r, activo: isActive }); } else { if (!p) return alert("Contraseña obligatoria para nuevo usuario"); const tApp = initializeApp(firebaseConfig, "Temp"); const tAuth = getAuth(tApp); const uc = await createUserWithEmailAndPassword(tAuth, e, p); await setDoc(doc(db, "usuarios", uc.user.uid), { email: e, nombre: n, rol: r, activo: isActive }); await signOut(tAuth); deleteApp(tApp); } window.safeHide('modal-crear-usuario'); window.sysLog("Usuario guardado.", "success"); } catch (err) { console.error(err); if (err.code === 'auth/email-already-in-use') alert("ERROR: Correo ya registrado."); else alert("Error: " + err.message); } };
window.eliminarUsuario = async function() { if (userEditingId && confirm("Borrar?")) { await deleteDoc(doc(db, "usuarios", userEditingId)); window.safeHide('modal-crear-usuario'); window.sysLog("Usuario eliminado.", "warn"); } };
window.desactivarUsuariosMasivo = async function() { if (currentUserData.rol !== 'super_admin' && currentUserData.rol !== 'admin') return alert("No tienes permisos."); if (!confirm("⚠️ ATENCIÓN ⚠️\n\nEsta acción desactivará a TODOS los usuarios operativos.")) return; window.safeShow('loading-overlay'); try { const q = query(collection(db, "usuarios")); const querySnapshot = await getDocs(q); const batch = writeBatch(db); let count = 0; querySnapshot.forEach((doc) => { const u = doc.data(); if (u.rol !== 'super_admin' && u.rol !== 'admin') { if (u.activo !== false) { batch.update(doc.ref, { activo: false }); count++; } } }); if (count > 0) { await batch.commit(); window.sysLog(`Desactivados: ${count}`, "warn"); alert(`Se han desactivado ${count} usuarios.`); } else { alert("No había usuarios para desactivar."); } } catch (e) { console.error(e); alert("Error: " + e.message); } finally { window.safeHide('loading-overlay'); } };
window.cargarUsuarios = function() { const c = window.el('lista-usuarios-container'); const filterText = window.safeVal('search-user').toLowerCase().trim(); unsubscribeUsers = onSnapshot(query(collection(db,"usuarios")), s => { c.innerHTML = ""; if(s.empty) { c.innerHTML="<p>No hay usuarios.</p>"; return; } s.forEach(d => { const u = d.data(); if(filterText && !u.nombre.toLowerCase().includes(filterText) && !u.email.toLowerCase().includes(filterText)) return; if(currentUserData.rol === 'admin' && u.rol === 'super_admin') return; const isSuper = (u.rol === 'super_admin'); const inactiveClass = (u.activo === false) ? 'inactive' : 'active'; const disabledAttr = isSuper ? 'disabled title="Super Admin no se puede desactivar"' : ''; c.innerHTML += ` <div class="user-card-item ${inactiveClass}" onclick="window.abrirModalUsuario('${d.id}')"> <div style="display:flex; justify-content:space-between; align-items:center; width:100%;"> <div><strong>${u.nombre}</strong><br><small class="role-badge role-${u.rol}">${u.rol}</small></div> <div onclick="event.stopPropagation()"> <label class="toggle-switch small"> <input type="checkbox" class="toggle-input" onchange="window.cambiarEstadoUsuarioDirecto('${d.id}', this.checked)" ${u.activo!==false?'checked':''} ${disabledAttr}> <span class="toggle-slider"></span> </label> </div> </div> </div>`; }); }); };
window.abrirModalCambioPass=function(){window.setVal('chg-old-pass','');window.setVal('chg-new-pass','');window.setVal('chg-confirm-pass','');window.safeShow('modal-change-pass');};
window.ejecutarCambioPass=async function(){const o=window.safeVal('chg-old-pass'),n=window.safeVal('chg-new-pass');try{await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,o));await updatePassword(auth.currentUser,n);alert("OK");window.safeHide('modal-change-pass');window.sysLog("Contraseña cambiada.", "success");}catch(e){alert("Error");window.sysLog("Error cambio pass: "+e.message, "error");}};

// --- SIGUE EN PARTE 2 ---
// --- PARTE 2 ---

// --- NAVEGACIÓN ---
window.navegar = function(p) {
    window.sysLog(`Navegando: ${p}`, "nav");
    // Al navegar por pantallas, NO desconectamos las notificaciones globales
    if(unsubscribeUsers) unsubscribeUsers(); 
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    
    // Si salimos a HOME o GESTION, estamos "fuera" del albergue específico
    if (p === 'home' || p === 'gestion-albergues' || p === 'usuarios' || p === 'observatorio' || p === 'mantenimiento') {
        currentAlbergueId = null; // Reset context
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

window.configurarTabsPorRol = function() { const r = (currentUserData.rol || "").toLowerCase().trim(); ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeHide(id)); if(['super_admin', 'admin'].includes(r)) { ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeShow(id)); return 'filiacion'; } if(r === 'albergue') { window.safeShow('btn-tab-pref'); window.safeShow('btn-tab-fil'); window.safeShow('btn-tab-ent'); return 'filiacion'; } if(['sanitario', 'psicosocial'].includes(r)) { window.safeShow('btn-tab-san'); window.safeShow('btn-tab-psi'); return 'sanitaria'; } return 'filiacion'; };
window.cambiarPestana = function(t) { window.sysLog(`Pestaña: ${t}`, "nav"); ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial', 'tab-entregas'].forEach(id => window.safeHide(id)); ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeRemoveActive(id)); window.safeAddActive(`btn-tab-${t.substring(0,3)}`); window.safeShow(`tab-${t}`); if (t === 'prefiliacion') { window.limpiarFormulario('man'); adminFamiliaresTemp = []; if(window.actualizarListaFamiliaresAdminUI) window.actualizarListaFamiliaresAdminUI(); if(window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML = ""; window.cancelarEdicionPref(); } else if (t === 'filiacion') { if(window.el('buscador-persona')) window.el('buscador-persona').value = ""; window.safeHide('resultados-busqueda'); window.safeHide('panel-gestion-persona'); window.personaEnGestion = null; } else if (['sanitaria','psicosocial','entregas'].includes(t)) { const prefix = t === 'sanitaria' ? 'san' : (t === 'psicosocial' ? 'psi' : 'ent'); if(window.el(`search-${prefix}`)) window.el(`search-${prefix}`).value = ""; window.safeHide(`res-${prefix}`); window.cerrarFormularioIntervencion(prefix); } };
window.configurarDashboard = function() { const r=(currentUserData.rol||"").toLowerCase(); if(window.el('user-name-display')) window.el('user-name-display').innerText=currentUserData.nombre; if(window.el('user-role-badge')) window.el('user-role-badge').innerText=r.toUpperCase(); window.safeHide('header-btn-users'); window.safeHide('container-ver-ocultos'); if(r === 'super_admin') window.safeShow('header-btn-debug'); else window.safeHide('header-btn-debug'); const navItems = document.querySelectorAll('.nav-item'); navItems.forEach(n => n.classList.remove('active', 'disabled', 'hidden')); if(['super_admin', 'admin'].includes(r)) { window.safeShow('header-btn-users'); } if(!['super_admin', 'admin'].includes(r)) { window.el('nav-mto').classList.add('disabled'); } if(['albergue', 'sanitario', 'psicosocial'].includes(r)) { window.el('nav-obs').classList.add('disabled'); } if(r === 'observador') { window.el('nav-albergues').classList.add('disabled'); } if(r === 'super_admin') { window.safeShow('container-ver-ocultos'); } window.safeAddActive('nav-home'); };

// --- CARGA DE DATOS ---
window.cargarAlberguesActivos = function() { const c = window.el('lista-albergues-activos'); if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos(); unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s=>{ c.innerHTML=""; s.forEach(async d=>{ const alb = d.data(); const div = document.createElement('div'); div.className="mto-card"; div.innerHTML=`<h3>${alb.nombre}</h3><p id="counter-${d.id}" style="font-weight:bold;color:var(--primary);margin:10px 0;">Cargando...</p><div class="mto-info">Entrar</div>`; div.onclick=()=>window.cargarDatosYEntrar(d.id); c.appendChild(div); const qCount = query(collection(db, "albergues", d.id, "personas"), where("estado", "==", "ingresado")); const snap = await getDocs(qCount); const count = snap.size; const cap = alb.capacidad || 0; const elCounter = document.getElementById(`counter-${d.id}`); if(elCounter) elCounter.innerText = `Ocupación: ${count} / ${cap}`; }); }); };
window.cargarAlberguesMantenimiento = function() { const c = window.el('mto-container'); const r = (currentUserData.rol || "").toLowerCase().trim(); const isSuper = (r === 'super_admin' || r === 'admin'); if(unsubscribeAlberguesMto) unsubscribeAlberguesMto(); unsubscribeAlberguesMto = onSnapshot(query(collection(db,"albergues")), s => { c.innerHTML = "<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>"; s.forEach(d => { const a = d.data(); let extraBtn = isSuper ? `<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}', ${!a.activo})">${a.activo === false ? 'Activar' : 'Archivar'}</button>` : ""; c.innerHTML += `<div class="mto-card ${!a.activo ? 'archived' : ''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`; }); }); };
window.cargarObservatorio = async function() { const list = window.el('obs-list-container'); if(!list) return; list.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>'; window.el('kpi-espera').innerText = "-"; window.el('kpi-alojados').innerText = "-"; window.el('kpi-libres').innerText = "-"; window.el('kpi-percent').innerText = "-%"; try { let totalEspera = 0, totalAlojados = 0, totalCapacidadGlobal = 0, htmlList = ""; const alberguesSnap = await getDocs(query(collection(db, "albergues"), where("activo", "==", true))); const promesas = alberguesSnap.docs.map(async (docAlb) => { const dataAlb = docAlb.data(); const cap = parseInt(dataAlb.capacidad || 0); const esperaSnap = await getDocs(query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", docAlb.id), where("estado", "==", "espera"))); const w = esperaSnap.size; const alojadosSnap = await getDocs(query(collection(db, "albergues", docAlb.id, "personas"), where("estado", "==", "ingresado"))); const h = alojadosSnap.size; return { id: docAlb.id, nombre: dataAlb.nombre, capacidad: cap, espera: w, alojados: h }; }); const resultados = await Promise.all(promesas); resultados.forEach(res => { totalEspera += res.espera; totalAlojados += res.alojados; totalCapacidadGlobal += res.capacidad; const libres = Math.max(0, res.capacidad - res.alojados); const porcentaje = res.capacidad > 0 ? Math.round((res.alojados / res.capacidad) * 100) : 0; let barClass = "low"; if(porcentaje > 50) barClass = "med"; if(porcentaje > 85) barClass = "high"; htmlList += `<div class="obs-row"><div class="obs-row-title">${res.nombre}</div><div class="obs-stats-group"><div class="obs-mini-stat"><span>Espera</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${res.id}', 'espera')">${res.espera}</strong></div><div class="obs-mini-stat"><span>Alojados</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${res.id}', 'alojados')">${res.alojados}</strong></div><div class="obs-mini-stat"><span>Ocupación</span><strong>${res.alojados} / ${res.capacidad}</strong></div><div class="obs-mini-stat"><span>Libres</span><strong>${libres}</strong></div></div><div class="prog-container"><div class="prog-track"><div class="prog-fill ${barClass}" style="width: ${porcentaje}%"></div></div></div></div>`; }); const globalLibres = Math.max(0, totalCapacidadGlobal - totalAlojados); const globalPercent = totalCapacidadGlobal > 0 ? Math.round((totalAlojados / totalCapacidadGlobal) * 100) : 0; window.el('kpi-espera').innerText = totalEspera; window.el('kpi-alojados').innerText = totalAlojados; window.el('kpi-libres').innerText = globalLibres; window.el('kpi-percent').innerText = `${globalPercent}%`; list.innerHTML = htmlList; } catch(e) { window.sysLog("Error obs: " + e.message, "error"); list.innerHTML = "<p>Error cargando datos.</p>"; } };
window.verListaObservatorio = async function(albId, tipo) { const c = window.el('obs-modal-content'); const t = window.el('obs-modal-title'); c.innerHTML = '<div style="text-align:center;"><div class="spinner"></div></div>'; t.innerText = tipo === 'espera' ? 'Personas en Espera' : 'Personas Alojadas'; window.safeShow('modal-obs-detalle'); try { let q; let isGlobal = false; if (tipo === 'espera') { q = query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", albId), where("estado", "==", "espera")); isGlobal = true; } else { q = query(collection(db, "albergues", albId, "personas"), where("estado", "==", "ingresado")); } const snap = await getDocs(q); if (snap.empty) { c.innerHTML = '<p>Sin registros.</p>'; return; } let data = []; snap.forEach(d => data.push({ id: d.id, ...d.data() })); if (tipo === 'espera') { data.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0)); } else { data.sort((a, b) => { if (!a.cama && !b.cama) return 0; if (!a.cama) return -1; if (!b.cama) return 1; return parseInt(a.cama) - parseInt(b.cama); }); } let h = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`; if(tipo === 'alojados') h += `<th>Cama</th>`; h += `<th>Nombre</th><th>DNI</th><th>Tel</th></tr></thead><tbody>`; data.forEach(d => { const histBtn = `<button class="btn-icon-small" onclick="window.verHistorialObservatorio('${d.id}', ${isGlobal}, '${albId}')"><i class="fa-solid fa-clock-rotate-left"></i></button>`; h += `<tr><td style="text-align:center;">${histBtn}</td>`; if(tipo === 'alojados') h += `<td><strong>${d.cama || '-'}</strong></td>`; h += `<td>${d.nombre} ${d.ap1||''}</td><td>${d.docNum||'-'}</td><td>${d.telefono||'-'}</td></tr>`; }); h += '</tbody></table>'; c.innerHTML = h; } catch (e) { window.sysLog("Error list: " + e.message, "error"); c.innerHTML = "<p>Error al cargar lista.</p>"; } };
window.verHistorialObservatorio = function(pId, isGlobal, albId){ window.verHistorial(pId, isGlobal, albId); };

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
        window.configurarDashboard(); window.actualizarContadores(); window.safeHide('loading-overlay'); window.conectarListenersBackground(id); window.setupAutoSave();
    } catch(e) { window.sysLog(`Error Cargando: ${e.message}`, "error"); alert(e.message); window.safeHide('loading-overlay'); }
};

window.atenderNotificacion = async function(notifId, personaId, tabDestino) {
    window.safeHide('modal-notificaciones');
    try { await updateDoc(doc(db, "derivaciones_pendientes", notifId), { estado: 'atendida' }); } catch(e) { console.error("Error updating notif", e); }
    window.cambiarPestana(tabDestino);
    const p = listaPersonasCache.find(x => x.id === personaId);
    if(p) {
        let prefix = '';
        if(tabDestino === 'sanitaria') prefix = 'san'; else if(tabDestino === 'psicosocial') prefix = 'psi'; else if(tabDestino === 'entregas') prefix = 'ent';
        if(prefix) { window.abrirFormularioIntervencion(p.id, prefix); }
    } else { alert("La persona ya no se encuentra en el listado activo."); }
};

window.confirmarDerivacion = async function() {
    const motivo = window.el('derivacion-motivo').value;
    if(!motivo) return alert("Escribe un motivo.");
    if(personaEnGestion) {
        await window.registrarLog(personaEnGestion.id, `Derivación ${tipoDerivacionActual}`, motivo);
        try { 
            window.sysLog("Guardando notificación...", "warn");
            await addDoc(collection(db, "derivaciones_pendientes"), { albergueId: currentAlbergueId, personaId: personaEnGestion.id, personaNombre: `${personaEnGestion.nombre} ${personaEnGestion.ap1 || ''}`, tipo: tipoDerivacionActual, motivo: motivo, fecha: new Date(), estado: 'pendiente' }); 
            window.sysLog("Notificación guardada OK.", "success");
        } catch(e) { window.sysLog(`ERROR Notif: ${e.message}`, "error"); }
    }
    window.safeHide('modal-derivacion'); window.showToast("✅ Derivación enviada"); window.resetIntervencion();
};

window.conectarListenersBackground = function(id) { if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc(); unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); window.actualizarContadores(); } }); };
window.setupAutoSave = function() { const inputsFil = ['edit-nombre','edit-ap1','edit-ap2','edit-doc-num','edit-tel','edit-fecha']; inputsFil.forEach(id => { const el = window.el(id); if(el && !el.dataset.hasAutosave) { el.addEventListener('blur', () => window.guardarCambiosPersona(true)); el.dataset.hasAutosave = "true"; if(id === 'edit-fecha') el.oninput = function() { window.formatearFecha(this); }; } }); const inputsPref = ['man-nombre','man-ap1','man-ap2','man-doc-num','man-tel','man-fecha']; inputsPref.forEach(id => { const el = window.el(id); if(el && !el.dataset.hasAutosave) { el.addEventListener('blur', () => { if(prefiliacionEdicionId) window.adminPrefiliarManual(true); }); el.dataset.hasAutosave = "true"; if(id === 'man-fecha') el.oninput = function() { window.formatearFecha(this); }; } }); };
window.buscarEnPrefiliacion=function(){const t=window.safeVal('buscador-pref').toLowerCase().trim();const r=window.el('resultados-pref');if(t.length<2){window.safeHide('resultados-pref');return;}const hits=listaGlobalPrefiliacion.filter(p=>{const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();return full.includes(t)||(p.docNum||"").toLowerCase().includes(t)||(p.telefono||"").includes(t);});r.innerHTML="";if(hits.length===0)r.innerHTML="<div class='search-item'>Sin resultados en Pool Global</div>";hits.forEach(p=>{r.innerHTML+=`<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')"><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><br><small>🌐 POOL | ${p.docNum||'-'} | ${p.telefono||'-'}</small></div>`;});window.safeShow('resultados-pref');};
window.cargarParaEdicionPref=function(pid){const p=listaGlobalPrefiliacion.find(x=>x.id===pid);if(!p)return;prefiliacionEdicionId=p.id;isGlobalEdit=true;window.safeHide('resultados-pref');window.el('buscador-pref').value="";window.setVal('man-nombre',p.nombre);window.setVal('man-ap1',p.ap1);window.setVal('man-ap2',p.ap2);window.setVal('man-tipo-doc',p.tipoDoc);window.setVal('man-doc-num',p.docNum);window.setVal('man-fecha',p.fechaNac);window.setVal('man-tel',p.telefono);const l=window.el('existing-family-list-ui');l.innerHTML="";if(p.familiaId){const fs=listaGlobalPrefiliacion.filter(x=>x.familiaId===p.familiaId&&x.id!==p.id);if(fs.length>0){l.innerHTML="<h5>Familiares en Pool:</h5>";fs.forEach(f=>{l.innerHTML+=`<div class="fam-item existing"><div><strong>${f.nombre} ${f.ap1||''}</strong><br><small style="color:#666;">${f.docNum||'-'}</small></div></div>`;});}}window.el('btn-save-pref').innerText="Actualizar en Pool Global";window.safeShow('btn-cancelar-edicion-pref');};
window.darSalidaPersona=async function(){if(!personaEnGestion||personaEnGestionEsGlobal)return;if(!confirm(`¿Dar salida a ${personaEnGestion.nombre}? Saldrá individualmente al Pool Global.`))return;try{const batch=writeBatch(db);const poolRef=doc(collection(db,"pool_prefiliacion"));const memberData={...personaEnGestion};delete memberData.id;memberData.cama=null;memberData.estado='espera';memberData.fechaSalidaAlbergue=new Date();memberData.ultimoAlbergueId=currentAlbergueId;batch.set(poolRef,memberData);batch.delete(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id));const logRef=collection(db,"pool_prefiliacion",poolRef.id,"historial");batch.set(doc(logRef),{fecha:new Date(),usuario:currentUserData.nombre,accion:"Salida Albergue",detalle:`Salida Individual de ${currentAlbergueData.nombre}`});await batch.commit();window.sysLog(`Salida individual realizada.`,"nav");window.showToast("Salida completada.");window.safeHide('panel-gestion-persona');window.safeHide('resultados-busqueda');window.el('buscador-persona').value="";}catch(e){window.sysLog("Error salida: "+e.message,"error");alert("Error: "+e.message);}};
window.buscarPersonaEnAlbergue=function(){const txt=window.safeVal('buscador-persona').toLowerCase().trim();const res=window.el('resultados-busqueda');if(txt.length<2){window.safeHide('resultados-busqueda');return;}const localHits=listaPersonasCache.filter(p=>{const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();return full.includes(txt)||(p.docNum||"").toLowerCase().includes(txt);});const globalHits=listaGlobalPrefiliacion.filter(p=>{const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();return full.includes(txt)||(p.docNum||"").toLowerCase().includes(txt);});res.innerHTML="";if(localHits.length===0&&globalHits.length===0){res.innerHTML=`<div class="search-item" style="color:#666">No encontrado</div>`;}else{localHits.forEach(p=>{const dc=p.estado==='ingresado'?'dot-green':'dot-red';res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}', false)"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong> (Local)<div style="font-size:0.8rem;color:#666;">📄 ${p.docNum||'-'}</div></div><div class="status-dot ${dc}" title="${p.estado.toUpperCase()}"></div></div></div>`;});globalHits.forEach(p=>{res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}', true)"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong> (Nube)<div style="font-size:0.8rem;color:#666;">☁️ ${p.docNum||'-'}</div></div><div class="status-dot dot-cloud" title="EN NUBE"></div></div></div>`;});}window.safeShow('resultados-busqueda');};
window.seleccionarPersona=function(pid,isGlobal){if(typeof pid!=='string')pid=pid.id;let p;if(isGlobal){p=listaGlobalPrefiliacion.find(x=>x.id===pid);personaEnGestionEsGlobal=true;window.safeShow('banner-nube');window.safeHide('btns-local-actions');window.safeShow('btns-cloud-actions');}else{p=listaPersonasCache.find(x=>x.id===pid);personaEnGestionEsGlobal=false;window.safeHide('banner-nube');window.safeShow('btns-local-actions');window.safeHide('btns-cloud-actions');}if(!p)return;personaEnGestion=p;prefiliacionEdicionId=p.id;isGlobalEdit=isGlobal;window.safeHide('resultados-busqueda');window.safeShow('panel-gestion-persona');if(window.el('gestion-nombre-titulo'))window.el('gestion-nombre-titulo').innerText=p.nombre;if(window.el('gestion-estado'))window.el('gestion-estado').innerText=isGlobal?"EN NUBE":p.estado.toUpperCase();if(window.el('gestion-cama-info'))window.el('gestion-cama-info').innerText=(p.cama&&!isGlobal)?`Cama: ${p.cama}`:"";window.setVal('edit-nombre',p.nombre);window.setVal('edit-ap1',p.ap1);window.setVal('edit-ap2',p.ap2);window.setVal('edit-tipo-doc',p.tipoDoc);window.setVal('edit-doc-num',p.docNum);window.setVal('edit-fecha',p.fechaNac);window.setVal('edit-tel',p.telefono);const flist=window.el('info-familia-lista');flist.innerHTML="";let fam=[];if(isGlobal){fam=listaGlobalPrefiliacion.filter(x=>x.familiaId===p.familiaId);}else{fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);}if(window.el('info-familia-resumen'))window.el('info-familia-resumen').innerText=fam.length>1?`Familia (${fam.length})`:"Individual";fam.forEach(f=>{if(f.id!==p.id){const hasBed=f.estado==='ingresado'&&f.cama;const st=hasBed?'color:var(--success);':'color:var(--warning);';const ic=hasBed?'fa-solid fa-bed':'fa-solid fa-clock';flist.innerHTML+=`<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.seleccionarPersona('${f.id}', ${isGlobal})"><div><div style="font-weight:bold;font-size:0.95rem;">${f.nombre} ${f.ap1||''}</div><div style="font-size:0.85rem;color:#666;"><i class="fa-regular fa-id-card"></i> ${f.docNum||'-'}</div></div><div style="font-size:1.2rem;${st}"><i class="${ic}"></i></div></div>`;}});if(!isGlobal)window.setupAutoSave();};
window.guardarCambiosPersona=async function(silent=false){if(!personaEnGestion)return;const p=window.getDatosFormulario('edit');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),p);window.registrarLog(personaEnGestion.id,"Edición Datos","Manual");if(!silent)alert("Guardado");else window.showToast("Guardado automático");window.sysLog(`Actualizada persona local: ${personaEnGestion.nombre}`,"info");};
window.abrirMapaGeneral=function(){modoMapaGeneral=true;window.mostrarGridCamas();};
window.abrirSeleccionCama=function(){modoMapaGeneral=false;window.mostrarGridCamas();};
window.cerrarMapaCamas=function(){highlightedFamilyId=null;window.safeHide('modal-cama');};
window.mostrarGridCamas=function(){const g=window.el('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};let famGroups={};listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occName=camasOcupadas[n];const occ=listaPersonasCache.find(p=>p.cama===n);let cls="bed-box";let lbl=n;if(occ&&highlightedFamilyId&&occ.familiaId===highlightedFamilyId){cls+=" bed-family-highlight";}if(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n){cls+=" bed-current";lbl+=" (Tú)";}else if(occName){cls+=" bed-busy";if(occ){const f=`${occ.nombre} ${occ.ap1||''}`;lbl+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono||'-'}</div>`;const presencia = occ.presencia || 'dentro';if(presencia === 'dentro') cls += " bed-status-in";else cls += " bed-status-out";}}else{cls+=" bed-free";if(shadowMap[n]){cls+=" bed-shadow";}}const d=document.createElement('div');d.className=cls;d.innerHTML=lbl;d.onclick=()=>{if(occ){if(highlightedFamilyId===occ.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occ.familiaId;window.mostrarGridCamas();}else if(!window.modoMapaGeneral){window.guardarCama(n);}};d.ondblclick=()=>{if(occ)window.abrirModalInfoCama(occ);};g.appendChild(d);}window.
