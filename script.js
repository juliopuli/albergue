import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

let currentUserData=null, currentAlbergueId=null, currentAlbergueData=null, totalCapacidad=0, ocupacionActual=0, camasOcupadas={}, listaPersonasCache=[];
let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribeDetalleAlbergue, unsubscribePersonas;
window.personaSeleccionadaId=null; window.personaEnGestion=null; window.modoCambioCama=false; window.modoMapaGeneral=false;
let listaFamiliaresTemp=[], adminFamiliaresTemp=[], albergueEdicionId=null;
let prefiliacionEdicionId = null;

let isPublicMode = false;
let userEditingId = null;

// --- AUTH ---
window.onload = () => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('public_id')) {
        isPublicMode = true;
        currentAlbergueId = p.get('public_id');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('public-register-screen').classList.remove('hidden');
    }
};

window.iniciarSesion = async () => {
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value);
    } catch (e) { alert(e.message); }
};

window.cerrarSesion = () => {
    signOut(auth);
    location.reload();
};

window.recuperarContrasena = async () => {
    const email = prompt("Email:");
    if (email) {
        try {
            await sendPasswordResetEmail(auth, email);
            alert("Correo enviado.");
        } catch (e) { alert(e.message); }
    }
};

onAuthStateChanged(auth, async (u) => {
    if (isPublicMode) return;
    if (u) {
        const s = await getDoc(doc(db, "usuarios", u.uid));
        if (s.exists()) {
            currentUserData = { ...s.data(), uid: u.uid };
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-shell').classList.remove('hidden');
            configurarDashboard();
            window.navegar('gestion-albergues');
        }
    } else {
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
});

// --- NAVEGACIÓN ---
window.navegar = (p) => {
    ['screen-usuarios', 'screen-gestion-albergues', 'screen-mantenimiento', 'screen-operativa'].forEach(id => document.getElementById(id).classList.add('hidden'));
    
    if (unsubscribeUsers) unsubscribeUsers();
    if (unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    if (unsubscribeAlberguesMto) unsubscribeAlberguesMto();
    if (unsubscribePersonas) unsubscribePersonas();
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    if (p === 'usuarios') {
        const c = document.getElementById('lista-usuarios-container'); if (c) c.innerHTML = "";
        document.getElementById('search-user').value = "";
        document.getElementById('screen-usuarios').classList.remove('hidden');
        document.getElementById('nav-users').classList.add('active');
    } else if (p === 'gestion-albergues') {
        window.cargarAlberguesActivos();
        document.getElementById('screen-gestion-albergues').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
    } else if (p === 'mantenimiento') {
        window.cargarAlberguesMantenimiento();
        document.getElementById('screen-mantenimiento').classList.remove('hidden');
        document.getElementById('nav-mto').classList.add('active');
    } else if (p === 'operativa') {
        document.getElementById('screen-operativa').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
        // FIX: Force Prefiliación Tab Render
        window.cambiarPestana('prefiliacion');
    }
};

function configurarDashboard() {
    document.getElementById('user-name-display').innerText = currentUserData.nombre;
    const r = currentUserData.rol;
    document.getElementById('user-role-badge').innerText = r.toUpperCase();
    document.getElementById('user-role-badge').className = `role-badge role-${r}`;
    
    const u = document.getElementById('nav-users'), m = document.getElementById('nav-mto');
    if (['super_admin', 'admin'].includes(r)) u.classList.remove('disabled'); else u.classList.add('disabled');
    if (['super_admin', 'admin', 'avanzado'].includes(r)) m.classList.remove('disabled'); else m.classList.add('disabled');
    if (r === 'super_admin') document.getElementById('container-ver-ocultos').classList.remove('hidden');
}

// --- LOGICA PESTAÑAS ---
window.cambiarPestana = (t) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active'); 
        c.classList.add('hidden'); // Asegurar hidden
        c.style.display = 'none';
    });
    
    if (t === 'prefiliacion') {
        document.getElementById('btn-tab-pref').classList.add('active');
        const p = document.getElementById('tab-prefiliacion'); 
        p.classList.remove('hidden'); 
        p.style.display = 'block'; 
        setTimeout(() => p.classList.add('active'), 10);
        
        limpiarFormulario('man'); 
        adminFamiliaresTemp = []; 
        actualizarListaFamiliaresAdminUI();
        document.getElementById('panel-gestion-persona').classList.add('hidden');
        window.cancelarEdicionPref();
        
    } else if (t === 'filiacion') {
        document.getElementById('btn-tab-fil').classList.add('active');
        const f = document.getElementById('tab-filiacion'); 
        f.classList.remove('hidden'); 
        f.style.display = 'block'; 
        setTimeout(() => f.classList.add('active'), 10);

        document.getElementById('buscador-persona').value = ""; 
        document.getElementById('resultados-busqueda').style.display = 'none';
        document.getElementById('panel-gestion-persona').classList.add('hidden');
    }
};

// --- PREFILIACION & BUSCADOR ---
window.buscarEnPrefiliacion = () => {
    const txt = document.getElementById('buscador-pref').value.toLowerCase();
    const res = document.getElementById('resultados-pref'); 
    res.innerHTML = "";
    
    if (txt.length < 2) { res.style.display = 'none'; return; }
    
    const hits = listaPersonasCache.filter(p => 
        p.estado === 'espera' && 
        (p.nombre + " " + (p.ap1||"") + " " + (p.ap2||"") + " " + (p.docNum||"") + " " + (p.telefono||"")).toLowerCase().includes(txt)
    );
    
    if (hits.length === 0) {
        res.innerHTML = "<div class='search-item' style='color:#999;'>Sin resultados en espera</div>";
        res.style.display = 'block';
    } else {
        res.style.display = 'block';
        hits.forEach(p => {
            const d = document.createElement('div'); d.className = 'search-item';
            d.innerHTML = `<strong>${p.nombre} ${p.ap1||''}</strong> (${p.docNum||'-'})`;
            d.onclick = () => window.cargarParaEdicionPref(p);
            res.appendChild(d);
        });
    }
};

window.cargarParaEdicionPref = (p) => {
    prefiliacionEdicionId = p.id;
    document.getElementById('resultados-pref').style.display = 'none';
    document.getElementById('buscador-pref').value = "";
    
    document.getElementById('man-nombre').value = p.nombre;
    document.getElementById('man-ap1').value = p.ap1 || "";
    document.getElementById('man-ap2').value = p.ap2 || "";
    document.getElementById('man-tipo-doc').value = p.tipoDoc || "DNI";
    document.getElementById('man-doc-num').value = p.docNum || "";
    document.getElementById('man-fecha').value = p.fechaNac || "";
    document.getElementById('man-tel').value = p.telefono || "";
    window.verificarMenor('man');

    document.getElementById('btn-save-pref').innerText = "🔄 Actualizar Datos";
    document.getElementById('btn-save-pref').className = "warning";
    document.getElementById('btn-cancelar-edicion-pref').classList.remove('hidden');
    document.querySelector('.fam-list').style.opacity = "0.5";
    document.querySelector('.fam-list button').disabled = true;
};

window.cancelarEdicionPref = () => {
    prefiliacionEdicionId = null;
    limpiarFormulario('man');
    document.getElementById('btn-save-pref').innerText = "💾 Guardar Nuevo";
    document.getElementById('btn-save-pref').className = "success";
    document.getElementById('btn-cancelar-edicion-pref').classList.add('hidden');
    document.querySelector('.fam-list').style.opacity = "1";
    document.querySelector('.fam-list button').disabled = false;
};

window.adminPrefiliarManual = async () => {
    if (!validarDocumento('man')) return alert("Documento inválido.");
    const t = getDatosFormulario('man');
    if (!t.nombre) return alert("Falta nombre.");
    
    try {
        if (prefiliacionEdicionId) {
            await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", prefiliacionEdicionId), t);
            alert("Datos actualizados.");
            window.cancelarEdicionPref();
        } else {
            const famId = new Date().getTime().toString();
            await addDoc(collection(db, "albergues", currentAlbergueId, "personas"), {...t, estado: 'espera', fechaRegistro: new Date(), origen: 'manual', familiaId: famId, rolFamilia: 'TITULAR'});
            if (Array.isArray(adminFamiliaresTemp) && adminFamiliaresTemp.length > 0) {
                for (const f of adminFamiliaresTemp) {
                    await addDoc(collection(db, "albergues", currentAlbergueId, "personas"), {...f, estado: 'espera', fechaRegistro: new Date(), origen: 'manual', familiaId: famId, rolFamilia: 'MIEMBRO'});
                }
            }
            alert("Registrado.");
            limpiarFormulario('man'); adminFamiliaresTemp = []; actualizarListaFamiliaresAdminUI();
        }
    } catch (e) { alert("Error: " + e.message); }
};

// --- FILIACION ---
window.buscarPersonaEnAlbergue = () => {
    const i = document.getElementById('buscador-persona').value.toLowerCase();
    const r = document.getElementById('resultados-busqueda');
    if (i.length < 2) { r.style.display = 'none'; return; }
    
    const h = listaPersonasCache.filter(p => (p.nombre + " " + (p.ap1||"") + " " + (p.docNum||"")).toLowerCase().includes(i));
    r.innerHTML = "";
    
    if (h.length > 0) {
        r.style.display = 'block';
        h.forEach(p => {
            const d = document.createElement('div'); d.className = 'search-item';
            const isOut = p.estado === 'espera';
            const badge = isOut ? `<span class="badge badge-archived" style="float:right;">ESPERA</span>` : `<span class="badge badge-active" style="float:right;">DENTRO</span>`;
            d.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><div><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><div class="search-details">📄 ${p.docNum||'-'}</div></div>${badge}</div>`;
            d.onclick = () => { seleccionarPersona(p); r.style.display = 'none'; document.getElementById('buscador-persona').value = ""; };
            r.appendChild(d);
        });
    } else r.style.display = 'none';
};

function seleccionarPersona(p) {
    window.personaEnGestion = p;
    window.personaSeleccionadaId = p.id;
    const panel = document.getElementById('panel-gestion-persona');
    panel.classList.remove('hidden');
    panel.style.display = "block";
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    
    document.getElementById('gestion-nombre-titulo').innerText = p.nombre;
    document.getElementById('edit-nombre').value = p.nombre;
    document.getElementById('edit-ap1').value = p.ap1 || "";
    document.getElementById('edit-ap2').value = p.ap2 || "";
    document.getElementById('edit-tipo-doc').value = p.tipoDoc || "DNI";
    document.getElementById('edit-doc-num').value = p.docNum || "";
    document.getElementById('edit-fecha').value = p.fechaNac || "";
    document.getElementById('edit-tel').value = p.telefono || "";
    window.verificarMenor('edit');
    
    let fid = p.familiaId;
    let famMembers = fid ? listaPersonasCache.filter(x => x.familiaId === fid) : [p];
    document.getElementById('info-familia-resumen').innerText = famMembers.length > 1 ? `Familia de ${famMembers.length} miembros` : "Individual";
    
    const containerLista = document.getElementById('info-familia-lista');
    containerLista.innerHTML = "";
    if (famMembers.length > 1) {
        famMembers.forEach(m => {
            const isCurrent = m.id === p.id;
            const item = document.createElement('div');
            item.style.padding = "8px"; item.style.borderBottom = "1px solid #eee"; item.style.display = "flex"; item.style.justifyContent = "space-between"; item.style.cursor = isCurrent ? "default" : "pointer"; item.style.backgroundColor = isCurrent ? "#f1f5f9" : "white";
            const st = m.estado === 'espera' ? '🟠' : '🟢';
            item.innerHTML = `<div style="${isCurrent?'font-weight:bold;color:var(--primary);':'color:#555;'}"><i class="fa-solid fa-user" style="font-size:0.8em;"></i> ${m.nombre} ${m.ap1||''} <small>(${st})</small></div>`;
            if (!isCurrent) item.onclick = () => seleccionarPersona(m);
            containerLista.appendChild(item);
        });
    } else {
        containerLista.innerHTML = "<span style='font-size:0.8em;color:#999;font-style:italic;'>Sin otros miembros.</span>";
    }

    const badge = document.getElementById('gestion-estado');
    const infoCama = document.getElementById('gestion-cama-info');
    const btnAs = document.getElementById('btn-asignar-cama');
    const btnLi = document.getElementById('btn-liberar-cama');
    const btnRe = document.getElementById('btn-regresar-pref');
    
    btnAs.classList.add('hidden'); btnLi.classList.add('hidden'); btnRe.classList.add('hidden');
    
    if (p.estado === 'espera') {
        badge.className = 'badge badge-archived'; badge.innerText = "ESPERA"; infoCama.innerText = "";
        btnAs.innerText = "🛏️ Ingresar"; btnAs.classList.remove('hidden');
    } else {
        badge.className = 'badge badge-active'; badge.innerText = "DENTRO";
        if (p.cama) {
            infoCama.innerText = ` - Cama: ${p.cama}`;
            btnAs.innerText = "🔄 Cambiar"; btnLi.classList.remove('hidden');
        } else {
            infoCama.innerHTML = " - <span style='color:red'>Sin Cama</span>";
            btnAs.innerText = "🛏️ Asignar";
        }
        btnAs.classList.remove('hidden');
        btnRe.classList.remove('hidden');
    }
}

// --- UTILS ---
window.formatearFecha = (i) => {
    let v = i.value.replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`;
    else i.value = v;
};

window.verificarMenor = (p) => {
    const t = document.getElementById(`${p}-tipo-doc`).value;
    const i = document.getElementById(`${p}-doc-num`);
    if (t === 'MENOR') {
        i.value = "MENOR-SIN-DNI"; i.disabled = true; i.classList.remove('input-error');
    } else {
        i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = "";
    }
};

window.validarEdad = (p) => {
    const f = document.getElementById(`${p}-fecha`).value;
    if (f.length !== 10) return true;
    return true;
};

window.validarDocumento = (p) => {
    const t = document.getElementById(`${p}-tipo-doc`).value;
    const i = document.getElementById(`${p}-doc-num`);
    if (t === 'MENOR') return true;
    if (!i.value) return false;
    let v = i.value.toUpperCase();
    i.value = v;
    let ok = true;
    if (t === 'PASAPORTE') ok = v.length > 3;
    else ok = v.length >= 5;
    
    if (!ok) i.classList.add('input-error');
    else i.classList.remove('input-error');
    return ok;
};

function limpiarFormulario(p) {
    ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => {
        const el = document.getElementById(`${p}-${f}`);
        if (el) el.value = "";
    });
    const i = document.getElementById(`${p}-doc-num`);
    if (i) { i.classList.remove('input-error'); i.disabled = false; }
    const t = document.getElementById(`${p}-tipo-doc`);
    if (t) t.value = "DNI";
}

function getDatosFormulario(p) {
    return {
        nombre: document.getElementById(`${p}-nombre`).value,
        ap1: document.getElementById(`${p}-ap1`).value,
        ap2: document.getElementById(`${p}-ap2`).value,
        tipoDoc: document.getElementById(`${p}-tipo-doc`).value,
        docNum: document.getElementById(`${p}-doc-num`).value,
        fechaNac: document.getElementById(`${p}-fecha`).value,
        telefono: document.getElementById(`${p}-tel`) ? document.getElementById(`${p}-tel`).value : ""
    };
}

// --- FAMILIA PÚBLICO (QR) ---
window.abrirModalFamiliar = () => {
    limpiarFormulario('fam');
    document.getElementById('modal-add-familiar').classList.remove('hidden');
    document.getElementById('fam-tipo-doc').value = "MENOR";
    window.verificarMenor('fam');
};
window.cerrarModalFamiliar = () => document.getElementById('modal-add-familiar').classList.add('hidden');

window.guardarFamiliarEnLista = () => {
    if (document.getElementById('fam-tipo-doc').value !== 'MENOR') {
        if (!window.validarDocumento('fam')) return alert("Documento inválido.");
    }
    const d = getDatosFormulario('fam');
    if (!d.nombre) return alert("Nombre obligatorio");
    
    listaFamiliaresTemp.push(d);
    actualizarListaFamiliaresUI();
    window.cerrarModalFamiliar();
};

function actualizarListaFamiliaresUI() {
    const d = document.getElementById('lista-familiares-ui');
    d.innerHTML = "";
    if (listaFamiliaresTemp.length === 0) {
        d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>';
        return;
    }
    listaFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="borrarFamiliarTemp(${i})">X</button></div>`;
    });
}
window.borrarFamiliarTemp = (i) => { listaFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresUI(); };

// --- FAMILIA ADMIN ---
window.abrirModalFamiliarAdmin = () => {
    limpiarFormulario('adm-fam');
    document.getElementById('modal-admin-add-familiar').classList.remove('hidden');
    document.getElementById('adm-fam-tipo-doc').value = "MENOR";
    window.verificarMenor('adm-fam');
};
window.cerrarModalFamiliarAdmin = () => document.getElementById('modal-admin-add-familiar').classList.add('hidden');

window.guardarFamiliarAdmin = () => {
    if (document.getElementById('adm-fam-tipo-doc').value !== 'MENOR') {
        if (!window.validarDocumento('adm-fam')) return alert("Documento inválido.");
    }
    const d = getDatosFormulario('adm-fam');
    if (!d.nombre) return alert("Nombre obligatorio");
    
    adminFamiliaresTemp.push(d);
    actualizarListaFamiliaresAdminUI();
    window.cerrarModalFamiliarAdmin();
};

function actualizarListaFamiliaresAdminUI() {
    const d = document.getElementById('admin-lista-familiares-ui');
    d.innerHTML = "";
    if (adminFamiliaresTemp.length === 0) {
        d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno.</p>';
        return;
    }
    adminFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="borrarFamiliarAdminTemp(${i})">X</button></div>`;
    });
}
window.borrarFamiliarAdminTemp = (i) => { adminFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresAdminUI(); };

// --- PÚBLICO GUARDAR ---
window.publicoGuardarTodo = async () => {
    if (!window.validarDocumento('pub')) return alert("Revise titular");
    const titular = getDatosFormulario('pub');
    if (!titular.nombre) return alert("Falta nombre titular");

    try {
        const famId = new Date().getTime().toString();
        await addDoc(collection(db, "albergues", currentAlbergueId, "personas"), {
            ...titular, estado: 'espera', fechaRegistro: new Date(), origen: 'qr', familiaId: famId, rolFamilia: 'TITULAR'
        });
        if (listaFamiliaresTemp.length > 0) {
            for (const f of listaFamiliaresTemp) {
                await addDoc(collection(db, "albergues", currentAlbergueId, "personas"), {
                    ...f, estado: 'espera', fechaRegistro: new Date(), origen: 'qr', familiaId: famId, rolFamilia: 'MIEMBRO'
                });
            }
        }
        document.getElementById('public-form-container').classList.add('hidden');
        document.getElementById('public-success-msg').classList.remove('hidden');
        listaFamiliaresTemp = [];
        actualizarListaFamiliaresUI();
    } catch (e) { alert("Error: " + e.message); }
};

// --- QR MODAL ---
window.abrirModalQR = () => {
    document.getElementById('modal-qr').classList.remove('hidden');
    const qrDiv = document.getElementById("qrcode-display");
    if (qrDiv.innerHTML === "") {
        const u = window.location.href.split('?')[0] + `?public_id=${currentAlbergueId}`;
        new QRCode(qrDiv, { text: u, width: 250, height: 250 });
    }
};

// --- OTROS ---
window.abrirModalUsuario = async (id = null) => {
    userEditingId = id;
    document.getElementById('modal-crear-usuario').classList.remove('hidden');
    const sel = document.getElementById('new-user-role');
    sel.innerHTML = "";
    const r = currentUserData.rol;
    if (r === 'super_admin') { ['super_admin', 'admin', 'avanzado', 'medio'].forEach(o => sel.add(new Option(o.toUpperCase(), o))); }
    else if (r === 'admin') { ['avanzado', 'medio'].forEach(o => sel.add(new Option(o.toUpperCase(), o))); }
    
    const nameIn = document.getElementById('new-user-name');
    const mailIn = document.getElementById('new-user-email');
    const passIn = document.getElementById('new-user-pass');
    
    if (id) {
        const s = await getDoc(doc(db, "usuarios", id));
        if (s.exists()) {
            const d = s.data();
            nameIn.value = d.nombre;
            mailIn.value = d.email;
            mailIn.disabled = true;
            sel.value = d.rol;
        }
    } else {
        nameIn.value = ""; mailIn.value = ""; mailIn.disabled = false; passIn.value = "";
    }
};

window.guardarUsuario = async () => {
    const e = document.getElementById('new-user-email').value;
    const p = document.getElementById('new-user-pass').value;
    const n = document.getElementById('new-user-name').value;
    const r = document.getElementById('new-user-role').value;
    
    if (!n || !r) return alert("Datos incompletos");
    
    if (userEditingId) {
        await updateDoc(doc(db, "usuarios", userEditingId), { nombre: n, rol: r });
        alert("Usuario actualizado");
    } else {
        try {
            const tApp = initializeApp(firebaseConfig, "Temp");
            const tAuth = getAuth(tApp);
            const uc = await createUserWithEmailAndPassword(tAuth, e, p);
            await setDoc(doc(db, "usuarios", uc.user.uid), { email: e, nombre: n, rol: r, fecha: new Date() });
            await signOut(tAuth);
            alert("Usuario creado");
        } catch (error) { alert("Error: " + error.message); }
    }
    document.getElementById('modal-crear-usuario').classList.add('hidden');
    window.cargarUsuarios();
};

window.cargarUsuarios = (filtro = "") => {
    const c = document.getElementById('lista-usuarios-container');
    if (filtro.trim() === "") { c.innerHTML = ""; return; }
    unsubscribeUsers = onSnapshot(query(collection(db, "usuarios"), orderBy("nombre")), s => {
        c.innerHTML = "";
        s.forEach(d => {
            const u = d.data();
            const div = document.createElement('div');
            div.className = "user-card-item";
            div.innerHTML = `<div><strong>${u.nombre}</strong><br><small>${u.email}</small></div><button class="secondary" onclick="abrirModalUsuario('${d.id}')">✏️</button>`;
            c.appendChild(div);
        });
    });
};
window.filtrarUsuarios = () => window.cargarUsuarios(document.getElementById('search-user').value.toLowerCase());

window.cargarAlberguesMantenimiento = () => {
    const c = document.getElementById('mto-container');
    const isSuper = currentUserData.rol === 'super_admin';
    unsubscribeAlberguesMto = onSnapshot(query(collection(db, "albergues"), orderBy("nombre")), s => {
        c.innerHTML = "";
        const addDiv = document.createElement('div'); addDiv.className = "mto-card add-new"; addDiv.onclick = () => window.abrirModalAlbergue();
        addDiv.innerHTML = "<h3>+ Nuevo</h3>";
        c.appendChild(addDiv);
        s.forEach(d => {
            const a = d.data();
            const div = document.createElement('div');
            div.className = "mto-card";
            div.innerHTML = `<h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p>`;
            div.onclick = () => window.abrirModalAlbergue(d.id);
            c.appendChild(div);
        });
    });
};

window.abrirModalAlbergue = async (id = null) => {
    albergueEdicionId = id;
    document.getElementById('modal-albergue').classList.remove('hidden');
    if (id) {
        const s = await getDoc(doc(db, "albergues", id));
        const d = s.data();
        document.getElementById('mto-nombre').value = d.nombre;
        document.getElementById('mto-capacidad').value = d.capacidad;
    } else {
        document.getElementById('mto-nombre').value = "";
        document.getElementById('mto-capacidad').value = "";
    }
};

window.guardarAlbergue = async () => {
    const n = document.getElementById('mto-nombre').value;
    const c = parseInt(document.getElementById('mto-capacidad').value);
    if (!n || !c) return alert("Datos incompletos");
    if (albergueEdicionId) await updateDoc(doc(db, "albergues", albergueEdicionId), { nombre: n, capacidad: c });
    else await addDoc(collection(db, "albergues"), { nombre: n, capacidad: c, activo: true });
    document.getElementById('modal-albergue').classList.add('hidden');
};

window.cargarAlberguesActivos = () => {
    const c = document.getElementById('lista-albergues-activos');
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db, "albergues"), where("activo", "==", true)), s => {
        c.innerHTML = "";
        s.forEach(d => {
            const a = d.data();
            const div = document.createElement('div');
            div.className = "mto-card";
            div.style.cursor = "pointer";
            div.innerHTML = `<h3>${a.nombre}</h3>`;
            div.onclick = () => window.entrarAlbergue(d.id);
            c.appendChild(div);
        });
    });
};

window.entrarAlbergue = (id) => {
    currentAlbergueId = id;
    window.navegar('operativa');
    // FIX: Force render
    window.cambiarPestana('prefiliacion');
    
    onSnapshot(doc(db, "albergues", id), d => {
        currentAlbergueData = d.data();
        document.getElementById('app-title').innerText = currentAlbergueData.nombre;
        totalCapacidad = currentAlbergueData.capacidad || 0;
        actualizarContadores();
    });
    
    unsubscribePersonas = onSnapshot(query(collection(db, "albergues", id, "personas"), orderBy("fechaRegistro", "desc")), s => {
        listaPersonasCache = [];
        let c = 0;
        camasOcupadas = {};
        s.forEach(ds => {
            const p = ds.data(); p.id = ds.id;
            listaPersonasCache.push(p);
            if (p.estado !== 'espera') {
                c++;
                if (p.cama) camasOcupadas[p.cama] = p.nombre;
            }
        });
        ocupacionActual = c;
        actualizarContadores();
    });
};

function actualizarContadores() {
    document.getElementById('ocupacion-count').innerText = ocupacionActual;
    document.getElementById('capacidad-total').innerText = totalCapacidad;
}

// REST OF CAMA LOGIC (STANDARD)
window.abrirSeleccionCama = () => {
    document.getElementById('modal-cama').classList.remove('hidden');
    const g = document.getElementById('grid-camas');
    g.innerHTML = "";
    // Simple rendering for brevity
    for(let i=1; i<=totalCapacidad; i++) {
        const d = document.createElement('div');
        d.className = camasOcupadas[i] ? "bed-box bed-busy" : "bed-box bed-free";
        d.innerText = i;
        d.onclick = () => {
            if(!camasOcupadas[i]) {
                updateDoc(doc(db, "albergues", currentAlbergueId, "personas", window.personaEnGestion.id), { estado: 'ingresado', cama: i.toString() });
                document.getElementById('modal-cama').classList.add('hidden');
            }
        };
        g.appendChild(d);
    }
};

window.abrirMapaGeneral = () => window.abrirSeleccionCama(); // Reuse for now
window.liberarCamaMantener = async () => await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", window.personaEnGestion.id), { cama: null });
window.regresarPrefiliacion = async () => await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", window.personaEnGestion.id), { estado: 'espera', cama: null });
