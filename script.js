import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = { 
    apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", 
    authDomain: "albergues-temporales.firebaseapp.com", 
    projectId: "albergues-temporales", 
    storageBucket: "albergues-temporales.firebasestorage.app", 
    messagingSenderId: "489999184108", 
    appId: "1:489999184108:web:32b9b580727f83158075c9" 
};
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
    if(currentUserData && currentUserData.rol === 'super_admin') {
        const bb = document.getElementById('black-box-overlay');
        if(bb && bb.classList.contains('hidden')) bb.classList.remove('hidden');
    }
};

window.toggleCajaNegra = function() {
    const bb = document.getElementById('black-box-overlay');
    if (bb) { if (bb.classList.contains('hidden')) { bb.classList.remove('hidden'); window.sysLog("Debug activado", "info"); } else { bb.classList.add('hidden'); } }
};
window.limpiarCajaNegra = function() { const c = document.getElementById('black-box-content'); if (c) c.innerHTML = ""; };

window.sysLog("Sistema Iniciado. Versión 1.5.0 (Public & Secure)", "info");

// --- 2. GLOBALES ---
let isPublicMode = false;
let currentAlbergueId = null;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('public_id')) { 
    isPublicMode = true; 
    currentAlbergueId = urlParams.get('public_id'); 
    window.sysLog(`Modo Público: ${currentAlbergueId}`, "info"); 
}

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
let tipoDerivacionActual = null; 
let html5QrCode = null;

// --- 3. UTILIDADES DOM ---
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

// --- 4. CORE APP & NAVIGATION ---
window.iniciarSesion = async function() { try { window.sysLog("Click Login", "info"); await signInWithEmailAndPassword(auth, window.el('login-email').value, window.el('login-pass').value); window.sysLog("Auth Firebase OK", "success"); } catch(err) { window.sysLog("Error Auth: " + err.message, "error"); alert(err.message); } };
window.cerrarSesion = function() { window.sysLog("Cerrando sesión", "warn"); signOut(auth); location.reload(); };

// --- GESTIÓN DE USUARIOS ---
window.cambiarEstadoUsuarioDirecto = async function(uid, nuevoEstado) {
    if (currentUserData.rol !== 'super_admin' && currentUserData.rol !== 'admin') { alert("Sin permisos"); window.cargarUsuarios(); return; }
    const targetDoc = await getDoc(doc(db, "usuarios", uid));
    if (targetDoc.exists()) {
        const u = targetDoc.data();
        if (u.rol === 'super_admin') { alert("Seguridad: No se puede desactivar a un Super Admin."); window.cargarUsuarios(); return; }
        if (currentUserData.rol === 'admin' && u.rol === 'admin') { alert("Seguridad: No puedes desactivar a otro Administrador."); window.cargarUsuarios(); return; }
    }
    await updateDoc(doc(db, "usuarios", uid), { activo: nuevoEstado });
    window.sysLog(`Usuario ${uid} estado: ${nuevoEstado}`, "info");
};

window.filtrarUsuarios = function() { window.cargarUsuarios(); };
window.abrirModalUsuario = async function(id = null) { userEditingId = id; window.safeShow('modal-crear-usuario'); const sel = window.el('new-user-role'); sel.innerHTML = ""; let roles = ['albergue', 'sanitario', 'psicosocial', 'observador']; if (currentUserData.rol === 'super_admin') { roles = ['super_admin', 'admin', ...roles]; } else if (currentUserData.rol === 'admin') { roles = ['albergue', 'sanitario', 'psicosocial', 'observador']; } roles.forEach(r => sel.add(new Option(r, r))); window.el('new-user-active').checked = true; window.el('new-user-active').disabled = false; if (id) { const s = await getDoc(doc(db, "usuarios", String(id))); if (s.exists()) { const d = s.data(); window.setVal('new-user-name', d.nombre); window.setVal('new-user-email', d.email); if (!roles.includes(d.rol)) { const opt = new Option(d.rol, d.rol); opt.disabled = true; sel.add(opt); } sel.value = d.rol; window.el('new-user-active').checked = (d.activo !== false); if (d.rol === 'super_admin') window.el('new-user-active').disabled = true; if (currentUserData.rol === 'super_admin') window.safeShow('btn-delete-user'); else window.safeHide('btn-delete-user'); } } else { window.setVal('new-user-name', ""); window.setVal('new-user-email', ""); window.safeHide('btn-delete-user'); } };
window.guardarUsuario = async function() { const e = window.safeVal('new-user-email'), p = window.safeVal('new-user-pass'), n = window.safeVal('new-user-name'), r = window.safeVal('new-user-role'); let isActive = window.el('new-user-active').checked; if (!e || !n) return alert("Faltan datos (Email/Nombre)"); if (r === 'super_admin' && !isActive) { alert("Seguridad: Super Admin siempre activo."); isActive = true; } try { if (userEditingId) { await updateDoc(doc(db, "usuarios", userEditingId), { nombre: n, rol: r, activo: isActive }); } else { if (!p) return alert("Contraseña obligatoria para nuevo usuario"); const tApp = initializeApp(firebaseConfig, "Temp"); const tAuth = getAuth(tApp); const uc = await createUserWithEmailAndPassword(tAuth, e, p); await setDoc(doc(db, "usuarios", uc.user.uid), { email: e, nombre: n, rol: r, activo: isActive }); await signOut(tAuth); deleteApp(tApp); } window.safeHide('modal-crear-usuario'); window.sysLog("Usuario guardado.", "success"); } catch (err) { console.error(err); if (err.code === 'auth/email-already-in-use') alert("ERROR: Correo ya registrado."); else alert("Error: " + err.message); } };
window.eliminarUsuario = async function() { if (userEditingId && confirm("Borrar?")) { await deleteDoc(doc(db, "usuarios", userEditingId)); window.safeHide('modal-crear-usuario'); window.sysLog("Usuario eliminado.", "warn"); } };
window.desactivarUsuariosMasivo = async function() { if (currentUserData.rol !== 'super_admin' && currentUserData.rol !== 'admin') return alert("No tienes permisos."); if (!confirm("⚠️ ATENCIÓN ⚠️\n\nEsta acción desactivará a TODOS los usuarios operativos.")) return; window.safeShow('loading-overlay'); try { const q = query(collection(db, "usuarios")); const querySnapshot = await getDocs(q); const batch = writeBatch(db); let count = 0; querySnapshot.forEach((doc) => { const u = doc.data(); if (u.rol !== 'super_admin' && u.rol !== 'admin') { if (u.activo !== false) { batch.update(doc.ref, { activo: false }); count++; } } }); if (count > 0) { await batch.commit(); window.sysLog(`Desactivados: ${count}`, "warn"); alert(`Se han desactivado ${count} usuarios.`); } else { alert("No había usuarios para desactivar."); } } catch (e) { console.error(e); alert("Error: " + e.message); } finally { window.safeHide('loading-overlay'); } };

// --- PUBLIC QR & REGISTER ---
window.abrirModalQR = function() {
    setTimeout(() => {
        window.safeShow('modal-qr');
        const d = window.el("qrcode-display"); d.innerHTML = "";
        new QRCode(d, { text: window.location.href.split('?')[0] + `?public_id=${currentAlbergueId}`, width: 250, height: 250 });
    }, 100);
};

window.toggleStartButton = function() { window.el('btn-start-public').disabled = !window.el('check-consent').checked; };
window.iniciarRegistro = function() { window.safeHide('public-welcome-screen'); window.safeShow('public-form-container'); };

window.publicoGuardarTodo = async function() {
    const d = window.getDatosFormulario('pub'); if (!d.nombre) return alert("Falta nombre");
    if (!auth.currentUser) { try { await signInAnonymously(auth); } catch (e) {} }
    const b = writeBatch(db);
    const fid = new Date().getTime().toString();
    const tRef = doc(collection(db, "pool_prefiliacion"));
    b.set(tRef, { ...d, familiaId: fid, rolFamilia: 'TITULAR', estado: 'espera', origenAlbergueId: currentAlbergueId, fechaRegistro: new Date() });
    const lRef = collection(db, "pool_prefiliacion", tRef.id, "historial");
    b.set(doc(lRef), { fecha: new Date(), usuario: "Auto-QR", accion: "Alta en Pool", detalle: `Desde QR Albergue ${currentAlbergueId}` });
    listaFamiliaresTemp.forEach(async f => {
        const fRef = doc(collection(db, "pool_prefiliacion"));
        b.set(fRef, { ...f, familiaId: fid, rolFamilia: 'MIEMBRO', estado: 'espera', origenAlbergueId: currentAlbergueId, fechaRegistro: new Date() });
    });
    await b.commit();
    window.safeHide('public-form-container');
    window.safeShow('public-success-msg');
}


// --- FUNCIONES DE CARGA ---
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

window.cargarAlberguesMantenimiento = function() {
    const c = window.el('mto-container');
    const r = (currentUserData.rol || "").toLowerCase().trim();
    const isSuper = (r === 'super_admin' || r === 'admin');
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

window.verHistorialObservatorio = function(pId, isGlobal, albId){
    window.verHistorial(pId, isGlobal, albId);
};

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

// --- NAVEGACIÓN ---

window.navegar = function(p) {
    window.sysLog(`Navegando: ${p}`, "nav");
    if(unsubscribeUsers) unsubscribeUsers(); 
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio', 'screen-intervencion'].forEach(id=>window.safeHide(id));
    if(!currentUserData) return;
    
    if(p !== 'intervencion') {
        window.resetIntervencion();
        window.detenerEscaner(); 
    }

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
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeHide(id));
    if(['super_admin', 'admin'].includes(r)) { ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeShow(id)); return 'filiacion'; }
    if(r === 'albergue') { window.safeShow('btn-tab-pref'); window.safeShow('btn-tab-fil'); return 'filiacion'; }
    if(['sanitario', 'psicosocial'].includes(r)) { window.safeShow('btn-tab-san'); window.safeShow('btn-tab-psi'); return 'sanitaria'; }
    return 'filiacion';
};

window.cambiarPestana = function(t) { window.sysLog(`Pestaña: ${t}`, "nav"); ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => window.safeHide(id)); ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => window.safeRemoveActive(id)); window.safeAddActive(`btn-tab-${t.substring(0,3)}`); window.safeShow(`tab-${t}`); if (t === 'prefiliacion') { window.limpiarFormulario('man'); adminFamiliaresTemp = []; if(window.actualizarListaFamiliaresAdminUI) window.actualizarListaFamiliaresAdminUI(); if(window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML = ""; window.cancelarEdicionPref(); } else if (t === 'filiacion') { if(window.el('buscador-persona')) window.el('buscador-persona').value = ""; window.safeHide('resultados-busqueda'); window.safeHide('panel-gestion-persona'); window.personaEnGestion = null; } };

window.configurarDashboard = function() { 
    const r=(currentUserData.rol||"").toLowerCase(); 
    if(window.el('user-name-display')) window.el('user-name-display').innerText=currentUserData.nombre; 
    if(window.el('user-role-badge')) window.el('user-role-badge').innerText=r.toUpperCase(); 
    
    window.safeHide('header-btn-users'); window.safeHide('container-ver-ocultos');
    if(r === 'super_admin') window.safeShow('header-btn-debug'); else window.safeHide('header-btn-debug');

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => n.classList.remove('active', 'disabled', 'hidden'));
    
    if(['super_admin', 'admin'].includes(r)) { window.safeShow('header-btn-users'); }
    if(!['super_admin', 'admin'].includes(r)) { window.el('nav-mto').classList.add('disabled'); }
    if(['albergue', 'sanitario', 'psicosocial'].includes(r)) { window.el('nav-obs').classList.add('disabled'); }
    if(r === 'observador') { window.el('nav-albergues').classList.add('disabled'); }
    if(r === 'super_admin') { window.safeShow('container-ver-ocultos'); }

    window.safeAddActive('nav-home');
};

// --- LOGICA DE INTERVENCIÓN ---

window.iniciarEscanerReal = function() {
    window.detenerEscaner();
    window.safeHide('scan-placeholder');
    window.safeHide('btn-start-camera');
    window.safeShow('reader');
    window.safeShow('btn-stop-camera');

    setTimeout(() => {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }
        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
        html5QrCode.start({ facingMode: "environment" }, config, window.onScanSuccess, (errorMessage) => { })
        .catch(err => {
            console.warn(err);
            window.sysLog(`Error cámara: ${err}`, "error");
            alert("Error al iniciar cámara. Comprueba permisos y HTTPS.");
            window.detenerEscaner();
        });
    }, 300);
};

window.detenerEscaner = function() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            window.sysLog("Cámara detenida.", "info");
            html5QrCode.clear();
        }).catch(err => console.error(err)).finally(() => { resetScannerUI(); });
    } else {
        resetScannerUI();
    }
};

function resetScannerUI() {
    window.safeHide('reader');
    window.safeHide('btn-stop-camera');
    window.safeShow('scan-placeholder');
    window.safeShow('btn-start-camera');
}

window.onScanSuccess = function(decodedText, decodedResult) {
    if(html5QrCode) html5QrCode.stop().then(() => {
        window.sysLog(`QR Leído: ${decodedText}`, "success");
        html5QrCode.clear(); 
        resetScannerUI();

        try {
            const url = new URL(decodedText);
            const aid = url.searchParams.get("aid");
            const pid = url.searchParams.get("pid");
            if(!aid || !pid) throw new Error("QR inválido");

            if(currentAlbergueId && aid !== currentAlbergueId) {
                if(confirm(`Este QR es de otro albergue. ¿Quieres cambiar a ese albergue?`)) {
                    window.cambiarAlberguePorQR(aid, pid);
                    return;
                } else {
                    return;
                }
            }
            if(!currentAlbergueId) {
                 window.cambiarAlberguePorQR(aid, pid);
                 return;
            }
            window.procesarLecturaPersona(pid);
        } catch (e) {
            alert("QR no válido o formato incorrecto.");
        }
    });
};

window.cambiarAlberguePorQR = async function(aid, pid) {
    window.sysLog(`Cambiando albergue por QR a: ${aid}`, "warn");
    currentAlbergueId = aid;
    window.safeShow('loading-overlay');
    try {
        const dS = await getDoc(doc(db,"albergues",aid));
        if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); }
        else { alert("Albergue no existe"); window.safeHide('loading-overlay'); return; }
        
        if(unsubscribePersonas) unsubscribePersonas();
        unsubscribePersonas = onSnapshot(collection(db,"albergues",aid,"personas"), s=>{
            listaPersonasCache=[]; camasOcupadas={};
            s.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
            
            const target = listaPersonasCache.find(p => p.id === pid);
            if(target) {
                window.safeHide('loading-overlay');
                window.navegar('intervencion'); 
                window.cargarInterfazIntervencion(target);
            }
        });
        window.conectarListenersBackground(aid);
    } catch(e) { console.error(e); window.safeHide('loading-overlay'); }
};


window.procesarLecturaPersona = function(pid) {
    const targetPerson = listaPersonasCache.find(p => p.id === pid);
    if(targetPerson) {
        window.cargarInterfazIntervencion(targetPerson);
    } else {
        getDoc(doc(db, "albergues", currentAlbergueId, "personas", pid)).then(docSnap => {
            if(docSnap.exists()) {
                 const pData = { id: docSnap.id, ...docSnap.data() };
                 window.cargarInterfazIntervencion(pData);
            } else {
                alert("Persona no encontrada en este albergue.");
            }
        });
    }
};

window.cargarInterfazIntervencion = function(persona) {
    if(!persona) return;
    personaEnGestion = persona; 
    
    window.safeHide('view-scan-ready');
    window.safeHide('reader');
    window.safeHide('btn-stop-camera');
    window.safeShow('view-scan-result');
    window.safeShow('btn-exit-focused'); 
    
    window.el('interv-nombre').innerText = `${persona.nombre} ${persona.ap1 || ""}`;
    window.el('interv-doc').innerText = persona.docNum || "Sin Documento";
    window.el('interv-estado').innerText = (persona.estado || "Desconocido").toUpperCase();
    
    const presencia = persona.presencia || 'dentro';
    const badgePresencia = window.el('interv-presencia');
    badgePresencia.innerText = presencia.toUpperCase();
    
    if(presencia === 'dentro') {
        badgePresencia.style.backgroundColor = '#dcfce7'; 
        badgePresencia.style.color = '#166534'; 
    } else {
        badgePresencia.style.backgroundColor = '#fee2e2'; 
        badgePresencia.style.color = '#991b1b'; 
    }
    
    if(currentAlbergueData) {
        const hName = window.el('interv-albergue-name');
        if(hName) hName.innerText = currentAlbergueData.nombre || "ALBERGUE";
    }
};

window.resetIntervencion = function() {
    personaEnGestion = null;
    window.safeHide('view-scan-result');
    window.safeShow('view-scan-ready');
    resetScannerUI();
};

window.salirModoFocalizado = function() {
    document.body.classList.remove('focused-mode');
    window.navegar('home');
    window.history.pushState({}, document.title, window.location.pathname);
};

window.iniciarModoFocalizado = async function(aid, pid) {
    window.sysLog(`Iniciando MODO FOCALIZADO. Alb: ${aid}, Pers: ${pid}`, "warn");
    document.body.classList.add('focused-mode');
    // Re-use logic
    window.cambiarAlberguePorQR(aid, pid);
};

window.registrarMovimiento = async function(tipo) {
    if(!personaEnGestion || !currentAlbergueId) return;
    try {
        const estadoPresencia = (tipo === 'entrada') ? 'dentro' : 'fuera';
        const pRef = doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id);
        await updateDoc(pRef, { presencia: estadoPresencia });
        await window.registrarLog(personaEnGestion.id, "Movimiento", tipo.toUpperCase());
        window.sysLog(`Movimiento: ${tipo} para ${personaEnGestion.nombre}`, "info");
        window.showToast(`✅ ${tipo.toUpperCase()} Registrada`);
        window.resetIntervencion();
    } catch(e) {
        console.error(e);
        alert("Error al registrar movimiento: " + e.message);
    }
};

window.abrirModalDerivacion = function(tipo) {
    tipoDerivacionActual = tipo;
    window.el('derivacion-titulo').innerText = `Derivar a ${tipo}`;
    window.el('derivacion-motivo').value = ""; 
    window.safeShow('modal-derivacion');
};

window.confirmarDerivacion = async function() {
    const motivo = window.el('derivacion-motivo').value;
    if(!motivo) return alert("Escribe un motivo.");
    if(personaEnGestion) {
        await window.registrarLog(personaEnGestion.id, `Derivación ${tipoDerivacionActual}`, motivo);
    }
    window.sysLog(`Derivación a ${tipoDerivacionActual}: ${motivo}`, "warn");
    window.safeHide('modal-derivacion');
    window.showToast("✅ Derivación enviada");
    window.resetIntervencion();
};

// --- NEW DEEP LINK QR ---
window.verCarnetQR = function() { if(!personaEnGestion) return; window.safeShow('modal-carnet-qr'); const container = window.el('carnet-qrcode-display'); container.innerHTML = ""; const currentUrl = window.location.href.split('?')[0]; const deepLink = `${currentUrl}?action=scan&aid=${currentAlbergueId}&pid=${personaEnGestion.id}`; new QRCode(container, { text: deepLink, width: 250, height: 250 }); const nombreCompleto = `${personaEnGestion.nombre} ${personaEnGestion.ap1 || ""} ${personaEnGestion.ap2 || ""}`; window.el('carnet-nombre').innerText = nombreCompleto; window.el('carnet-id').innerText = personaEnGestion.docNum || "ID: " + personaEnGestion.id.substring(0,8).toUpperCase(); };

// --- INIT (MODO PÚBLICO SEGURO) ---
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
        } catch(e) {
            console.error("Error init público:", e);
            alert("Error de conexión con el albergue.");
        }
    } else {
        const passInput = document.getElementById('login-pass');
        if(passInput) passInput.addEventListener('keypress', e=>{ if(e.key==='Enter') window.iniciarSesion(); });
    }
    
    // Check for Deep Link on Load
    const params = new URLSearchParams(window.location.search);
    if(params.get('action') === 'scan') {
        window.sysLog("Deep Link detectado. Esperando Auth...", "info");
    }
};

onAuthStateChanged(auth, async (u) => {
    if(isPublicMode) return; // En modo público gestionamos el auth manualmente en onload
    if(u){
        const s = await getDoc(doc(db,"usuarios",u.uid));
        if(s.exists()){
            const d = s.data();
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
            
            const params = new URLSearchParams(window.location.search);
            if(params.get('action') === 'scan' && params.get('aid') && params.get('pid')) {
                 window.iniciarModoFocalizado(params.get('aid'), params.get('pid'));
            } else {
                 window.navegar('home');
            }
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
