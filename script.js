import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// GLOBALS
let currentUserData=null, currentAlbergueId=null, currentAlbergueData=null, totalCapacidad=0, ocupacionActual=0, camasOcupadas={}, listaPersonasCache=[];
let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribePersonas;
window.personaSeleccionadaId=null; window.personaEnGestion=null; window.modoCambioCama=false; window.modoMapaGeneral=false;
let listaFamiliaresTemp=[], adminFamiliaresTemp=[], userEditingId=null, albergueEdicionId=null;
let prefiliacionEdicionId = null;
let isPublicMode = false;
let highlightedFamilyId = null;

// --- LOGIN ---
window.iniciarSesion=async()=>{try{await signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value);}catch(e){alert("Error: "+e.message);}};

// --- AUTH & HOME ---
window.onload=()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get('public_id')){
        isPublicMode = true; currentAlbergueId=p.get('public_id');
        initPublicMode();
    }
};

async function initPublicMode() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('public-register-screen').classList.remove('hidden');
    document.getElementById('public-welcome-screen').classList.remove('hidden');
    document.getElementById('public-form-container').classList.add('hidden');

    try {
        const docRef = doc(db, "albergues", currentAlbergueId);
        const snap = await getDoc(docRef);
        if(snap.exists()){
            const nombre = snap.data().nombre || "";
            const displayName = nombre.toLowerCase().startsWith('albergue') ? nombre : "Albergue " + nombre;
            document.getElementById('public-albergue-name').innerText = displayName;
        } else {
            document.getElementById('public-albergue-name').innerText = "este Albergue";
        }
    } catch(e) { 
        document.getElementById('public-albergue-name').innerText = "este Albergue"; 
    }
}

window.toggleStartButton = () => {
    const chk = document.getElementById('check-consent');
    const btn = document.getElementById('btn-start-public');
    btn.disabled = !chk.checked;
};

window.iniciarRegistro = () => {
    document.getElementById('public-welcome-screen').classList.add('hidden');
    document.getElementById('public-form-container').classList.remove('hidden');
};

window.cerrarSesion=()=>{signOut(auth);location.reload();};
window.recuperarContrasena = async () => { const email = prompt("Email:"); if(email) try{ await sendPasswordResetEmail(auth,email); alert("Correo enviado."); } catch(e){ alert(e.message); } };

onAuthStateChanged(auth,async(u)=>{
    if(isPublicMode) return;
    if(u){
        const s=await getDoc(doc(db,"usuarios",u.uid));
        if(s.exists()){
            currentUserData={...s.data(),uid:u.uid};
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-shell').classList.remove('hidden');
            configurarDashboard();
            window.navegar('home');
        }
    } else {
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
});

// --- SISTEMA DE LOGS ---
window.registrarLog = async (personaId, accion, detalle = "") => {
    try {
        const usuarioLog = currentUserData ? currentUserData.nombre : "Auto-Registro QR";
        await addDoc(collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial"), {
            fecha: new Date(),
            usuario: usuarioLog,
            accion: accion,
            detalle: detalle
        });
    } catch (e) {
        console.error("Error registrando log:", e);
    }
};

window.verHistorial = async (pId = null, altAlbId = null) => {
    const targetId = pId || (window.personaEnGestion ? window.personaEnGestion.id : null);
    const targetAlbId = altAlbId || currentAlbergueId;

    if(!targetId || !targetAlbId) return;
    
    const modal = document.getElementById('modal-historial');
    const content = document.getElementById('historial-content');
    content.innerHTML = "Cargando...";
    modal.classList.remove('hidden');

    try {
        const q = query(collection(db, "albergues", targetAlbId, "personas", targetId, "historial"), orderBy("fecha", "desc"));
        const snap = await getDocs(q);
        
        if(snap.empty){
            content.innerHTML = "<p>No hay movimientos registrados.</p>";
            return;
        }
        
        let html = "";
        snap.forEach(doc => {
            const d = doc.data();
            const f = d.fecha.toDate();
            const fmt = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;
            
            html += `<div class="log-item">
                <strong>${d.accion}</strong>
                <span>${fmt} - Por: ${d.usuario}</span>
                ${d.detalle ? `<br><i>${d.detalle}</i>` : ''}
            </div>`;
        });
        content.innerHTML = html;

    } catch (e) {
        content.innerHTML = "Error cargando historial (o sin permisos).";
    }
};

window.verHistorialObservatorio = (albId, pId) => {
    window.verHistorial(pId, albId);
};

// --- NAVEGACIÓN ---
window.navegar=(p)=>{
    ['screen-home', 'screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    
    const r = currentUserData.rol;

    if(p==='home'){
        document.getElementById('screen-home').classList.remove('hidden');
        document.getElementById('nav-home').classList.add('active');
        
    } else if(p==='usuarios'){
        if(['super_admin','admin'].includes(r)) {
            document.getElementById('screen-usuarios').classList.remove('hidden'); window.cargarUsuarios();
        }
    } else if(p==='gestion-albergues'){
        if(['super_admin','admin','intervencion','filiacion'].includes(r)) {
            window.cargarAlberguesActivos();
            document.getElementById('screen-gestion-albergues').classList.remove('hidden');
            document.getElementById('nav-albergues').classList.add('active');
        }
    } else if(p==='mantenimiento'){
        if(['super_admin','admin'].includes(r)) {
            window.cargarAlberguesMantenimiento();
            document.getElementById('screen-mantenimiento').classList.remove('hidden');
            document.getElementById('nav-mto').classList.add('active');
        }
    } else if(p==='operativa'){
        document.getElementById('screen-operativa').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
        window.cambiarPestana('filiacion'); 
    } else if(p==='observatorio'){
        if(['super_admin','admin','observador'].includes(r)) {
            document.getElementById('screen-observatorio').classList.remove('hidden');
            document.getElementById('nav-obs').classList.add('active');
            window.cargarObservatorio(); 
        }
    }
    
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    if(p==='home') document.getElementById('nav-home').classList.add('active');
    else if(p==='gestion-albergues' || p==='operativa') document.getElementById('nav-albergues').classList.add('active');
    else if(p==='mantenimiento') document.getElementById('nav-mto').classList.add('active');
    else if(p==='observatorio') document.getElementById('nav-obs').classList.add('active');
};

function configurarDashboard(){
    document.getElementById('user-name-display').innerText=currentUserData.nombre;const r=currentUserData.rol;
    document.getElementById('user-role-badge').innerText=r.toUpperCase();document.getElementById('user-role-badge').className=`role-badge role-${r}`;
    
    const btnUsers = document.getElementById('header-btn-users');
    if(['super_admin', 'admin'].includes(r)) btnUsers.classList.remove('hidden');
    else btnUsers.classList.add('hidden');

    const m=document.getElementById('nav-mto');
    if(['super_admin','admin'].includes(r))m.classList.remove('disabled');else m.classList.add('disabled');
    
    const obs = document.getElementById('nav-obs');
    if(['super_admin','admin','observador'].includes(r)) obs.classList.remove('hidden');
    else obs.classList.add('hidden');

    const gest = document.getElementById('nav-albergues');
    if(r !== 'observador') gest.classList.remove('hidden');
    else gest.classList.add('hidden');

    if(r==='super_admin') document.getElementById('container-ver-ocultos').classList.remove('hidden');
}

function configurarTabsPorRol() {
    const r = currentUserData.rol;
    ['btn-tab-pref','btn-tab-fil','btn-tab-san','btn-tab-psi'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('hidden');
    });

    if (r === 'intervencion') {
        document.getElementById('btn-tab-pref').classList.add('hidden');
        document.getElementById('btn-tab-fil').classList.add('hidden');
        return 'sanitaria';
    } else if (r === 'filiacion') {
        document.getElementById('btn-tab-san').classList.add('hidden');
        document.getElementById('btn-tab-psi').classList.add('hidden');
        return 'prefiliacion';
    }
    return 'prefiliacion';
}

// --- OBSERVATORIO ---
window.cargarObservatorio = async () => {
    const listContainer = document.getElementById('obs-list-container');
    if(!listContainer) return;
    listContainer.innerHTML = '<p style="color:#666; text-align:center;">Analizando datos de todos los albergues...</p>';
    
    let gWait = 0, gHosted = 0, gCap = 0;

    try {
        const q = query(collection(db, "albergues"), where("activo", "==", true));
        const sSnap = await getDocs(q);
        
        let htmlList = "";

        for (const docS of sSnap.docs) {
            const data = docS.data();
            const cap = parseInt(data.capacidad || 0);
            gCap += cap;

            const pSnap = await getDocs(collection(db, "albergues", docS.id, "personas"));
            
            let sWait = 0, sHosted = 0;
            pSnap.forEach(p => {
                const pd = p.data();
                if(pd.estado === 'espera') sWait++;
                if(pd.estado === 'ingresado') sHosted++;
            });

            gWait += sWait;
            gHosted += sHosted;

            const sFree = Math.max(0, cap - sHosted);
            const sPct = cap > 0 ? Math.round((sHosted / cap) * 100) : 0;
            
            let color = "low";
            if(sPct > 70) color = "med";
            if(sPct > 90) color = "high";

            htmlList += `
            <div class="obs-row">
                <div class="obs-row-title">${data.nombre}</div>
                <div style="display:flex; width:100%; justify-content:space-between; flex-wrap:wrap;">
                    <div class="obs-data-point">
                        <span>Espera</span>
                        <strong class="obs-clickable" onclick="window.verListaObservatorio('${docS.id}', 'espera')">${sWait}</strong>
                    </div>
                    <div class="obs-data-point">
                        <span>Alojados</span>
                        <strong class="obs-clickable" onclick="window.verListaObservatorio('${docS.id}', 'ingresado')">${sHosted}</strong>
                    </div>
                    <div class="obs-data-point">
                        <span>Libres</span>
                        <strong>${sFree} / ${cap}</strong>
                    </div>
                    <div class="obs-data-point" style="flex:1; min-width:150px; margin-right:0;">
                        <span>Ocupación ${sPct}%</span>
                        <div class="prog-track"><div class="prog-fill ${color}" style="width:${sPct}%"></div></div>
                    </div>
                </div>
            </div>`;
        }

        document.getElementById('kpi-espera').innerText = gWait;
        document.getElementById('kpi-alojados').innerText = gHosted;
        const gFree = Math.max(0, gCap - gHosted);
        document.getElementById('kpi-libres').innerText = `${gFree} / ${gCap}`;
        
        const gPct = gCap > 0 ? Math.round((gHosted / gCap) * 100) : 0;
        document.getElementById('kpi-percent').innerText = gPct + "%";
        
        const bar = document.getElementById('kpi-bar');
        bar.style.width = gPct + "%";
        if(gPct > 90) bar.className = "prog-fill high";
        else if(gPct > 70) bar.className = "prog-fill med";
        else bar.className = "prog-fill low";

        listContainer.innerHTML = htmlList;

    } catch(e) {
        console.error(e);
        listContainer.innerHTML = `<p style="color:red;">Error cargando datos: ${e.message}</p>`;
    }
};

// --- FUNCIÓN ACTUALIZADA V4.2.0 (ORDENACIÓN) ---
window.verListaObservatorio = async (albergueId, estado) => {
    const modal = document.getElementById('modal-obs-detalle');
    const content = document.getElementById('obs-modal-content');
    const title = document.getElementById('obs-modal-title');
    
    content.innerHTML = '<p>Cargando lista...</p>';
    title.innerText = estado === 'espera' ? 'Personas en Espera' : 'Personas Alojadas';
    modal.classList.remove('hidden');

    try {
        const q = query(collection(db, "albergues", albergueId, "personas"), where("estado", "==", estado));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            content.innerHTML = '<p>No hay personas en este estado.</p>';
            return;
        }

        // PREPARAR DATOS EN ARRAY PARA ORDENAR
        let dataArray = [];
        snap.forEach(doc => {
            dataArray.push({ id: doc.id, ...doc.data() });
        });

        // LÓGICA DE ORDENACIÓN (V4.2.0)
        if (estado === 'ingresado') {
            // Ordenar por número de cama (numérico)
            dataArray.sort((a, b) => {
                const bedA = parseInt(a.cama) || 0;
                const bedB = parseInt(b.cama) || 0;
                return bedA - bedB;
            });
        } else {
            // Ordenar por fecha registro descendente (LIFO)
            dataArray.sort((a, b) => {
                const dateA = a.fechaRegistro?.seconds || 0;
                const dateB = b.fechaRegistro?.seconds || 0;
                return dateB - dateA;
            });
        }

        // CONSTRUIR TABLA
        let html = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`;
        if(estado === 'ingresado') html += `<th>Cama</th>`; // NUEVA COLUMNA V4.2.0
        html += `<th>Nombre</th><th>Apellidos</th><th>DNI</th><th>Teléfono</th></tr></thead><tbody>`;
        
        dataArray.forEach(d => {
            html += `<tr>
                <td style="text-align:center;">
                    <button class="btn-icon-small" onclick="window.verHistorialObservatorio('${albergueId}', '${d.id}')" title="Ver Historial">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                </td>`;
            
            if(estado === 'ingresado') {
                html += `<td><strong>${d.cama || '-'}</strong></td>`;
            }

            html += `<td>${d.nombre}</td>
                <td>${d.ap1||''} ${d.ap2||''}</td>
                <td>${d.docNum||'-'}</td>
                <td>${d.telefono||'-'}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        content.innerHTML = html;

    } catch(e) {
        content.innerHTML = `<p style="color:red;">Error: ${e.message}</p>`;
    }
};

window.cambiarPestana = (t) => {
    const allTabs = ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'];
    allTabs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    const allBtns = ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'];
    allBtns.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('active');
    });

    if (t === 'prefiliacion') {
        const el = document.getElementById('tab-prefiliacion'); if(el) el.classList.remove('hidden');
        const btn = document.getElementById('btn-tab-pref'); if(btn) btn.classList.add('active');
        limpiarFormulario('man'); adminFamiliaresTemp = []; actualizarListaFamiliaresAdminUI();
        const existingUi = document.getElementById('existing-family-list-ui'); if(existingUi) existingUi.innerHTML = ""; 
        const panel = document.getElementById('panel-gestion-persona'); if(panel) panel.classList.add('hidden');
        window.cancelarEdicionPref();
        
    } else if (t === 'filiacion') {
        const el = document.getElementById('tab-filiacion'); if(el) el.classList.remove('hidden');
        const btn = document.getElementById('btn-tab-fil'); if(btn) btn.classList.add('active');
        const search = document.getElementById('buscador-persona'); if(search) search.value = ""; 
        const res = document.getElementById('resultados-busqueda'); if(res) res.classList.add('hidden'); 
        const panel = document.getElementById('panel-gestion-persona'); if(panel) panel.classList.add('hidden');
        
    } else if (t === 'sanitaria') {
        const el = document.getElementById('tab-sanitaria'); if(el) el.classList.remove('hidden');
        const btn = document.getElementById('btn-tab-san'); if(btn) btn.classList.add('active');
        
    } else if (t === 'psicosocial') {
        const el = document.getElementById('tab-psicosocial'); if(el) el.classList.remove('hidden');
        const btn = document.getElementById('btn-tab-psi'); if(btn) btn.classList.add('active');
    }
};

// --- UTILS & FORM ---
function safeVal(id){ const el=document.getElementById(id); return el?el.value:""; }
function setVal(id,val){ const el=document.getElementById(id); if(el)el.value=val; }
window.formatearFecha=(i)=>{let v=i.value.replace(/\D/g,'').slice(0,8);if(v.length>=5)i.value=`${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;else if(v.length>=3)i.value=`${v.slice(0,2)}/${v.slice(2)}`;else i.value=v;};
window.verificarMenor=(p)=>{const t=document.getElementById(`${p}-tipo-doc`).value;const i=document.getElementById(`${p}-doc-num`);if(t==='MENOR'){i.value="MENOR-SIN-DNI";i.disabled=true;}else{i.disabled=false;if(i.value==="MENOR-SIN-DNI")i.value="";}};
window.validarDocumento=(p)=>{return true;}
function limpiarFormulario(p){
    ['nombre','ap1','ap2','doc-num','fecha','tel'].forEach(f=>{ const el=document.getElementById(`${p}-${f}`); if(el)el.value=""; });
    const i=document.getElementById(`${p}-doc-num`); if(i)i.disabled=false;
}
function getDatosFormulario(p) {
    return {
        nombre: safeVal(`${p}-nombre`), ap1: safeVal(`${p}-ap1`), ap2: safeVal(`${p}-ap2`),
        tipoDoc: safeVal(`${p}-tipo-doc`), docNum: safeVal(`${p}-doc-num`), fechaNac: safeVal(`${p}-fecha`), telefono: safeVal(`${p}-tel`)
    };
}

// --- FAMILIA Y FUSION ---
window.abrirModalVincularFamilia=()=>{document.getElementById('modal-vincular-familia').classList.remove('hidden');document.getElementById('search-vincular').value="";document.getElementById('resultados-vincular').innerHTML="";};
window.buscarParaVincular=()=>{const txt=document.getElementById('search-vincular').value.toLowerCase();const res=document.getElementById('resultados-vincular');res.innerHTML="";if(txt.length<2){res.classList.add('hidden');return;}const hits=listaPersonasCache.filter(p=>p.id!==window.personaEnGestion.id && (p.nombre.toLowerCase().includes(txt)||(p.docNum&&p.docNum.toLowerCase().includes(txt))));if(hits.length===0){res.innerHTML="<div class='search-item' style='color:#999;'>No hay coincidencias.</div>"; res.classList.remove('hidden');}else{res.classList.remove('hidden');hits.forEach(p=>{const d=document.createElement('div');d.className='search-item';d.innerHTML=`<strong>${p.nombre}</strong> (${p.docNum||'-'})`;d.onclick=()=>window.vincularAFamilia(p);res.appendChild(d);});}};
window.vincularAFamilia = async (target) => {
    if (!confirm(`¿Unir a ${window.personaEnGestion.nombre} con ${target.nombre}?`)) return;
    let myFamId = window.personaEnGestion.familiaId;
    let targetFamId = target.familiaId;
    let finalFamId = myFamId;
    const batch = writeBatch(db);
    if (!finalFamId) {
        finalFamId = new Date().getTime().toString() + "-FAM";
        const myRef = doc(db, "albergues", currentAlbergueId, "personas", window.personaEnGestion.id);
        batch.update(myRef, { familiaId: finalFamId, rolFamilia: 'TITULAR' });
        window.registrarLog(window.personaEnGestion.id, "Creación Familia", "Familia creada al vincular");
    }
    let personasAmover = [target];
    if (targetFamId) {
        const otrosMiembros = listaPersonasCache.filter(p => p.familiaId === targetFamId);
        personasAmover = [...otrosMiembros];
    }
    personasAmover = [...new Map(personasAmover.map(item => [item.id, item])).values()];
    personasAmover.forEach(p => {
        if(p.id !== window.personaEnGestion.id){
            const ref = doc(db, "albergues", currentAlbergueId, "personas", p.id);
            batch.update(ref, { familiaId: finalFamId, rolFamilia: 'MIEMBRO' });
            window.registrarLog(p.id, "Vinculación Familiar", `Unido a familia ${finalFamId}`);
        }
    });
    try {
        await batch.commit();
        alert("Familias fusionadas.");
        document.getElementById('modal-vincular-familia').classList.add('hidden');
        if(window.personaEnGestion) seleccionarPersona(window.personaEnGestion);
    } catch (e) { alert("Error: " + e.message); }
};

// --- GESTIÓN FAMILIARES ---
window.abrirModalFamiliar = () => {
    limpiarFormulario('fam');
    document.getElementById('modal-add-familiar').classList.remove('hidden');
    document.getElementById('fam-tipo-doc').value = "MENOR";
};
window.cerrarModalFamiliar = () => document.getElementById('modal-add-familiar').classList.add('hidden');
window.guardarFamiliarEnLista = () => {
    const d = getDatosFormulario('fam');
    if (!d.nombre) return alert("Nombre obligatorio");
    listaFamiliaresTemp.push(d);
    actualizarListaFamiliaresUI();
    window.cerrarModalFamiliar();
};
function actualizarListaFamiliaresUI() {
    const d = document.getElementById('lista-familiares-ui');
    d.innerHTML = "";
    if (listaFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>'; return; }
    listaFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`;
    });
}
window.borrarFamiliarTemp = (i) => { listaFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresUI(); };

window.abrirModalFamiliarAdmin=()=>{limpiarFormulario('adm-fam');document.getElementById('modal-admin-add-familiar').classList.remove('hidden');document.getElementById('adm-fam-tipo-doc').value="MENOR";window.verificarMenor('adm-fam');};window.cerrarModalFamiliarAdmin=()=>document.getElementById('modal-admin-add-familiar').classList.add('hidden');
window.guardarFamiliarAdmin=()=>{
    const d=getDatosFormulario('adm-fam');
    if(!d.nombre) return alert("Nombre obligatorio");
    adminFamiliaresTemp.push(d);
    actualizarListaFamiliaresAdminUI();
    window.cerrarModalFamiliarAdmin();
};
function actualizarListaFamiliaresAdminUI(){const d=document.getElementById('admin-lista-familiares-ui');d.innerHTML="";if(adminFamiliaresTemp.length===0){d.innerHTML='<p style="color:#999;font-style:italic;">Ninguno.</p>';return;}adminFamiliaresTemp.forEach((f,i)=>{d.innerHTML+=`<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`;});}window.borrarFamiliarAdminTemp=(i)=>{adminFamiliaresTemp.splice(i,1);actualizarListaFamiliaresAdminUI();};

window.publicoGuardarTodo=async()=>{
    const n=safeVal('pub-nombre');
    if(!n) return alert("Revise titular");
    try{
        const famId=new Date().getTime().toString();
        const titular = {
            nombre:n, ap1:safeVal('pub-ap1'), ap2:safeVal('pub-ap2'), tipoDoc:safeVal('pub-tipo-doc'), 
            docNum:safeVal('pub-doc-num'), fechaNac:safeVal('pub-fecha'), telefono:safeVal('pub-tel'),
            estado:'espera', origen:'qr', familiaId:famId, rolFamilia:'TITULAR', fechaRegistro:new Date()
        };
        await addDoc(collection(db,"albergues",currentAlbergueId,"personas"), titular);
        for(const f of listaFamiliaresTemp){
            await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
                ...f, estado:'espera', origen:'qr', familiaId:famId, rolFamilia:'MIEMBRO', fechaRegistro:new Date()
            });
        }
        document.getElementById('public-form-container').classList.add('hidden');
        document.getElementById('public-success-msg').classList.remove('hidden');
    }catch(e){alert("Error: "+e.message);}
};
window.abrirModalQR=()=>{document.getElementById('modal-qr').classList.remove('hidden');const qrDiv=document.getElementById("qrcode-display");if(qrDiv.innerHTML===""){const u=window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`;new QRCode(qrDiv,{text:u,width:250,height:250});}};

// --- USUARIOS FIX (V3.9.0) ---
window.abrirModalUsuario=async(id=null)=>{
    userEditingId=id; document.getElementById('modal-crear-usuario').classList.remove('hidden');
    const sel=document.getElementById('new-user-role'); sel.innerHTML="";
    const btnDel = document.getElementById('btn-delete-user');
    
    // DEFINICIÓN DE ROLES PERMITIDOS
    let roles = [];
    if(currentUserData.rol === 'super_admin') roles = ['super_admin','admin','intervencion','filiacion','observador'];
    else if(currentUserData.rol === 'admin') roles = ['intervencion','filiacion','observador']; 
    
    roles.forEach(r=>sel.add(new Option(r,r)));
    
    if(id){
        const s=await getDoc(doc(db,"usuarios",String(id)));
        if(s.exists()){
            const d=s.data(); setVal('new-user-name',d.nombre); setVal('new-user-email',d.email); sel.value=d.rol;
            if(currentUserData.rol === 'super_admin' || currentUserData.rol === 'admin') btnDel.classList.remove('hidden');
            else btnDel.classList.add('hidden');
        }
    }else{ 
        setVal('new-user-name',""); setVal('new-user-email',""); 
        btnDel.classList.add('hidden');
    }
};

window.guardarUsuario=async()=>{
    const e=safeVal('new-user-email'), p=safeVal('new-user-pass'), n=safeVal('new-user-name'), r=safeVal('new-user-role');
    if(!n||!r)return alert("Datos incompletos");
    if(userEditingId){
        await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});
        alert("Actualizado");
    }else{
        if(!e||!p)return alert("Email y Pass requeridos");
        let tApp;
        try{
            tApp=initializeApp(firebaseConfig,"Temp");
            const tAuth=getAuth(tApp);
            const uc=await createUserWithEmailAndPassword(tAuth,e,p);
            await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});
            await signOut(tAuth);
            alert("Creado");
        }catch(err){alert("Error: "+err.message);}
        finally{if(tApp) deleteApp(tApp);}
    }
    document.getElementById('modal-crear-usuario').classList.add('hidden');
    window.cargarUsuarios();
};

window.eliminarUsuario = async () => {
    if(!userEditingId || !confirm("¿Seguro que quieres eliminar este usuario permanentemente?")) return;
    try {
        await deleteDoc(doc(db, "usuarios", userEditingId));
        alert("Usuario eliminado de la base de datos (Nota: El acceso auth permanece hasta limpieza manual)");
        document.getElementById('modal-crear-usuario').classList.add('hidden');
        window.cargarUsuarios();
    } catch(e) { alert("Error: " + e.message); }
};

window.cargarUsuarios=(filtro="")=>{
    const c=document.getElementById('lista-usuarios-container');
    const f=safeVal('search-user').toLowerCase();
    onSnapshot(query(collection(db,"usuarios"),orderBy("nombre")),s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const u=d.data();
            // ADMIN NO VE A SUPER_ADMIN
            if(currentUserData.rol==='admin' && u.rol==='super_admin') return;
            if(f && !u.nombre.toLowerCase().includes(f)) return;
            c.innerHTML+=`<div class="user-card-item" onclick="window.abrirModalUsuario('${d.id}')"><div class="user-card-left"><div class="user-avatar-circle">${u.nombre.charAt(0)}</div><div><strong>${u.nombre}</strong><br><small>${u.email}</small></div></div><span class="badge role-${u.rol}">${u.rol}</span></div>`;
        });
    });
};
window.filtrarUsuarios=()=>{window.cargarUsuarios();};

window.cargarAlberguesMantenimiento=()=>{
    const c=document.getElementById('mto-container');
    const isSuper = currentUserData.rol==='super_admin';
    onSnapshot(query(collection(db,"albergues")),s=>{
        c.innerHTML="<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";
        s.forEach(d=>{
            const a=d.data();
            let extraBtn = "";
            if(isSuper){
                const archLabel = a.activo === false ? 'Activar' : 'Archivar';
                extraBtn = `
                <button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}', ${!a.activo})">${archLabel}</button>
                `;
            }
            c.innerHTML+=`<div class="mto-card ${!a.activo?'archived':''}">
                <h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p>
                <div class="btn-group-horizontal">
                    <button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>
                    ${extraBtn}
                </div>
            </div>`;
        });
    });
};

window.abrirModalAlbergue=async(id=null)=>{
    albergueEdicionId=id; document.getElementById('modal-albergue').classList.remove('hidden');
    const btnDel = document.getElementById('btn-delete-albergue');
    if(id){
        const s=await getDoc(doc(db,"albergues",id)); const d=s.data();
        setVal('mto-nombre',d.nombre); setVal('mto-capacidad',d.capacidad); setVal('mto-columnas',d.columnas);
        // SOLO SUPER ADMIN BORRA ALBERGUES
        if(currentUserData.rol==='super_admin') btnDel.classList.remove('hidden');
        else btnDel.classList.add('hidden');
    }else{
        setVal('mto-nombre',""); setVal('mto-capacidad',"");
        btnDel.classList.add('hidden');
    }
};
window.guardarAlbergue=async()=>{
    const n=safeVal('mto-nombre'), c=safeVal('mto-capacidad'), col=safeVal('mto-columnas');
    if(!n||!c)return alert("Faltan datos");
    if(albergueEdicionId) await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});
    else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});
    document.getElementById('modal-albergue').classList.add('hidden');
};
window.eliminarAlbergueActual=async()=>{
    if(!albergueEdicionId || !confirm("¿Eliminar albergue y datos?")) return;
    try {
        const personas = await getDocs(collection(db, "albergues", albergueEdicionId, "personas"));
        const batch = writeBatch(db);
        personas.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        await deleteDoc(doc(db, "albergues", albergueEdicionId));
        alert("Eliminado");
        document.getElementById('modal-albergue').classList.add('hidden');
    } catch(e) { alert("Error: " + e.message); }
};
window.cambiarEstadoAlbergue=async(id, estado)=>{
    await updateDoc(doc(db,"albergues",id), {activo: estado});
};

// --- NUEVAS FUNCIONES DE CAMBIO DE CONTRASEÑA (V3.9.0) ---
window.abrirModalCambioPass = () => {
    setVal('chg-old-pass', '');
    setVal('chg-new-pass', '');
    setVal('chg-confirm-pass', '');
    document.getElementById('modal-change-pass').classList.remove('hidden');
};

window.ejecutarCambioPass = async () => {
    const oldPass = safeVal('chg-old-pass');
    const newPass = safeVal('chg-new-pass');
    const confirmPass = safeVal('chg-confirm-pass');
    
    if(!oldPass || !newPass || !confirmPass) return alert("Rellena todos los campos");
    if(newPass !== confirmPass) return alert("Las contraseñas nuevas no coinciden");
    if(newPass.length < 6) return alert("La contraseña debe tener al menos 6 caracteres");
    
    try {
        const user = auth.currentUser;
        if(!user) return alert("Sesión inválida");
        
        // RE-AUTH
        const credential = EmailAuthProvider.credential(user.email, oldPass);
        await reauthenticateWithCredential(user, credential);
        
        // UPDATE
        await updatePassword(user, newPass);
        
        alert("Contraseña actualizada correctamente. Por favor, inicia sesión de nuevo.");
        document.getElementById('modal-change-pass').classList.add('hidden');
        window.cerrarSesion();
        
    } catch(e) {
        if(e.code === 'auth/wrong-password'){
            alert("La contraseña actual no es correcta.");
        } else {
            alert("Error: " + e.message);
        }
    }
};
