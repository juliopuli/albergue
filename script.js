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
window.iniciarSesion = async () => {
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value);
    } catch(e){ alert("Error: "+e.message); }
};

// --- AUTH & HOME ---
window.onload = () => {
    const p = new URLSearchParams(window.location.search);
    if(p.get('public_id')){
        isPublicMode = true; currentAlbergueId = p.get('public_id');
        initPublicMode();
    }
    
    // ENTER KEY LISTENER (V4.7.2)
    const passInput = document.getElementById('login-pass');
    if(passInput) {
        passInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') window.iniciarSesion();
        });
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
            document.getElementById('public-albergue-name').innerText = snap.data().nombre;
        }
    } catch(e) { console.log(e); }
}

window.toggleStartButton = () => { document.getElementById('btn-start-public').disabled = !document.getElementById('check-consent').checked; };
window.iniciarRegistro = () => { document.getElementById('public-welcome-screen').classList.add('hidden'); document.getElementById('public-form-container').classList.remove('hidden'); };
window.cerrarSesion=()=>{signOut(auth);location.reload();};
window.recuperarContrasena = async () => { const e = prompt("Email:"); if(e) try{ await sendPasswordResetEmail(auth,e); alert("Enviado."); } catch(err){ alert(err.message); } };

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
            fecha: new Date(), usuario: usuarioLog, accion: accion, detalle: detalle
        });
    } catch (e) { console.error(e); }
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
        if(snap.empty){ content.innerHTML = "<p>No hay movimientos.</p>"; return; }
        let html = "";
        snap.forEach(doc => {
            const d = doc.data();
            const f = d.fecha.toDate();
            const fmt = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;
            html += `<div class="log-item"><strong>${d.accion}</strong><span>${fmt} - Por: ${d.usuario}</span>${d.detalle ? `<br><i>${d.detalle}</i>` : ''}</div>`;
        });
        content.innerHTML = html;
    } catch (e) { content.innerHTML = "Error cargando historial."; }
};
window.verHistorialObservatorio = (albId, pId) => { window.verHistorial(pId, albId); };

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
    listContainer.innerHTML = '<p style="color:#666; text-align:center;">Analizando datos...</p>';
    let gWait=0, gHosted=0, gCap=0;
    try {
        const sSnap = await getDocs(query(collection(db, "albergues"), where("activo", "==", true)));
        let htmlList = "";
        for (const docS of sSnap.docs) {
            const data = docS.data();
            const cap = parseInt(data.capacidad || 0); gCap += cap;
            const pSnap = await getDocs(collection(db, "albergues", docS.id, "personas"));
            let sWait=0, sHosted=0;
            pSnap.forEach(p => { const pd=p.data(); if(pd.estado==='espera')sWait++; if(pd.estado==='ingresado')sHosted++; });
            gWait += sWait; gHosted += sHosted;
            const sFree = Math.max(0, cap - sHosted);
            const sPct = cap > 0 ? Math.round((sHosted / cap) * 100) : 0;
            let color = "low"; if(sPct > 70) color = "med"; if(sPct > 90) color = "high";
            htmlList += `<div class="obs-row"><div class="obs-row-title">${data.nombre}</div><div style="display:flex; width:100%; justify-content:space-between; flex-wrap:wrap;"><div class="obs-data-point"><span>Espera</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${docS.id}', 'espera')">${sWait}</strong></div><div class="obs-data-point"><span>Alojados</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${docS.id}', 'ingresado')">${sHosted}</strong></div><div class="obs-data-point"><span>Libres</span><strong>${sFree} / ${cap}</strong></div><div class="obs-data-point" style="flex:1; min-width:150px; margin-right:0;"><span>Ocupación ${sPct}%</span><div class="prog-track"><div class="prog-fill ${color}" style="width:${sPct}%"></div></div></div></div></div>`;
        }
        document.getElementById('kpi-espera').innerText = gWait; document.getElementById('kpi-alojados').innerText = gHosted;
        const gFree = Math.max(0, gCap - gHosted); document.getElementById('kpi-libres').innerText = `${gFree} / ${gCap}`;
        const gPct = gCap > 0 ? Math.round((gHosted / gCap) * 100) : 0;
        document.getElementById('kpi-percent').innerText = gPct + "%";
        const bar = document.getElementById('kpi-bar'); bar.style.width = gPct + "%";
        if(gPct > 90) bar.className = "prog-fill high"; else if(gPct > 70) bar.className = "prog-fill med"; else bar.className = "prog-fill low";
        listContainer.innerHTML = htmlList;
    } catch(e) { listContainer.innerHTML = `<p style="color:red;">Error: ${e.message}</p>`; }
};

window.verListaObservatorio = async (albId, est) => {
    const m = document.getElementById('modal-obs-detalle');
    const c = document.getElementById('obs-modal-content');
    const t = document.getElementById('obs-modal-title');
    c.innerHTML = '<p>Cargando...</p>';
    t.innerText = est === 'espera' ? 'En Espera' : 'Alojados';
    m.classList.remove('hidden');
    try {
        const s = await getDocs(query(collection(db, "albergues", albId, "personas"), where("estado", "==", est)));
        if (s.empty) { c.innerHTML = '<p>Sin registros.</p>'; return; }
        
        let dataArray = [];
        s.forEach(doc => { dataArray.push({ id: doc.id, ...doc.data() }); });

        if (est === 'ingresado') {
            dataArray.sort((a, b) => (parseInt(a.cama)||0) - (parseInt(b.cama)||0));
        } else {
            dataArray.sort((a, b) => (b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0));
        }

        let h = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`;
        if(est==='ingresado') h+=`<th>Cama</th>`;
        h+=`<th>Nombre</th><th>DNI</th><th>Tel</th></tr></thead><tbody>`;
        
        dataArray.forEach(d => { 
            h += `<tr><td style="text-align:center;"><button class="btn-icon-small" onclick="window.verHistorialObservatorio('${albId}', '${d.id}')"><i class="fa-solid fa-clock-rotate-left"></i></button></td>`;
            if(est==='ingresado') h+=`<td><strong>${d.cama||'-'}</strong></td>`;
            h+=`<td>${d.nombre} ${d.ap1||''}</td><td>${d.docNum||'-'}</td><td>${d.telefono||'-'}</td></tr>`; 
        });
        h += '</tbody></table>'; c.innerHTML = h;
    } catch(e) { c.innerHTML = "Error."; }
};

// --- CARGAR ALBERGUES (ACTIVOS) ---
window.cargarAlberguesActivos = () => {
    const c = document.getElementById('lista-albergues-activos');
    if(!c) return;
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s => {
        c.innerHTML = "";
        s.forEach(async d => {
            const a = d.data();
            const div = document.createElement('div');
            div.className = "mto-card";
            div.onclick = () => window.entrarAlbergue(d.id);
            div.innerHTML = `<h3>${a.nombre}</h3><div class="mto-info">Cargando...</div>`;
            c.appendChild(div);
            
            getDocs(query(collection(db,"albergues",d.id,"personas"),where("estado","==","ingresado")))
                .then(snap => {
                    if(div.querySelector('.mto-info')) div.querySelector('.mto-info').innerHTML = `Ocupación: <strong>${snap.size}</strong> / ${a.capacidad}`;
                });
        });
    });
};

window.entrarAlbergue=(id)=>{
    currentAlbergueId=id; window.navegar('operativa');
    const initialTab = configurarTabsPorRol();
    window.cambiarPestana(initialTab);
    
    onSnapshot(doc(db,"albergues",id),d=>{
        currentAlbergueData=d.data();
        document.getElementById('app-title').innerText=currentAlbergueData.nombre;
        totalCapacidad=parseInt(currentAlbergueData.capacidad||0);
        actualizarContadores();
    });
    onSnapshot(collection(db,"albergues",id,"personas"),s=>{
        listaPersonasCache=[]; camasOcupadas={}; let c=0;
        s.forEach(d=>{
            const p=d.data(); p.id=d.id;
            listaPersonasCache.push(p);
            if(p.estado==='ingresado'){
                c++; if(p.cama) camasOcupadas[p.cama]=p.nombre;
            }
        });
        try { listaPersonasCache.sort((a,b)=>(b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0)); } catch(e){}
        ocupacionActual=c;
        actualizarContadores();
        if(window.personaEnGestion){
            const upd = listaPersonasCache.find(x=>x.id===window.personaEnGestion.id);
            if(upd) window.seleccionarPersona(upd);
        }
    });
};
function actualizarContadores(){
    document.getElementById('ocupacion-count').innerText=ocupacionActual;
    document.getElementById('capacidad-total').innerText=totalCapacidad;
}

// --- OTROS ---
window.buscarEnPrefiliacion=()=>{
    const txt=safeVal('buscador-pref').toLowerCase().trim();
    const res=document.getElementById('resultados-pref');
    if(txt.length<2){res.classList.add('hidden');return;}
    
    const hits=listaPersonasCache.filter(p=>{
        if(p.estado!=='espera') return false;
        const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
        return full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt) || (p.telefono||"").includes(txt);
    });

    res.innerHTML="";
    hits.forEach(p=>{
        res.innerHTML += `<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')">
            <strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><br>
            <small>📄 ${p.docNum||'Sin Doc'} | 📞 ${p.telefono||'Sin Tlf'}</small>
        </div>`;
    });
    res.classList.remove('hidden');
};

window.cargarParaEdicionPref=(pid)=>{
    const p=listaPersonasCache.find(x=>x.id===pid);
    if(!p) return;
    prefiliacionEdicionId = p.id;
    document.getElementById('resultados-pref').classList.add('hidden');
    document.getElementById('buscador-pref').value = "";
    setVal('man-nombre', p.nombre); setVal('man-ap1', p.ap1); setVal('man-ap2', p.ap2);
    setVal('man-tipo-doc', p.tipoDoc); setVal('man-doc-num', p.docNum); 
    setVal('man-fecha', p.fechaNac); setVal('man-tel', p.telefono);
    const l=document.getElementById('existing-family-list-ui');l.innerHTML="";
    if(p.familiaId){
        const fs=listaPersonasCache.filter(x=>x.familiaId===p.familiaId&&x.id!==p.id);
        if(fs.length>0){l.innerHTML="<h5>Familiares:</h5>";fs.forEach(f=>{l.innerHTML+=`<div class="fam-item existing"><div><strong>${f.nombre}</strong></div><small>Registrado</small></div>`;});}
    }
    
    // V4.7.2: Botón Historial Prefiliación
    const btnH = document.getElementById('btn-historial-pref');
    if(['admin','super_admin'].includes(currentUserData.rol)) {
        btnH.classList.remove('hidden');
        btnH.onclick = () => window.verHistorial(p.id);
    } else btnH.classList.add('hidden');

    document.getElementById('btn-save-pref').innerText="Actualizar Registro";document.getElementById('btn-cancelar-edicion-pref').classList.remove('hidden');
};

window.cancelarEdicionPref=()=>{
    prefiliacionEdicionId=null;
    limpiarFormulario('man');
    document.getElementById('existing-family-list-ui').innerHTML="";
    document.getElementById('btn-historial-pref').classList.add('hidden'); // Ocultar al cancelar
    document.getElementById('btn-save-pref').innerText="Guardar Nuevo";
    document.getElementById('btn-cancelar-edicion-pref').classList.add('hidden');
};

window.buscarPersonaEnAlbergue=()=>{
    const txt=safeVal('buscador-persona').toLowerCase().trim();
    const res=document.getElementById('resultados-busqueda');
    if(txt.length<2){res.classList.add('hidden');return;}
    const hits=listaPersonasCache.filter(p=>{
        const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
        return full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt);
    });
    res.innerHTML="";
    if(hits.length===0){ res.innerHTML=`<div class="search-item" style="color:#666">No encontrado</div>`; }
    else{
        hits.forEach(p=>{
            const dc=p.estado==='ingresado'?'dot-green':'dot-red';
            res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}')"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong><div style="font-size:0.8rem;color:#666;">📄 ${p.docNum||'-'}</div></div><div class="status-dot ${dc}"></div></div></div>`;
        });
    }
    res.classList.remove('hidden');
};

window.seleccionarPersona=(pid)=>{
    if(typeof pid!=='string')pid=pid.id;const p=listaPersonasCache.find(x=>x.id===pid);if(!p)return;
    window.personaEnGestion=p;
    document.getElementById('resultados-busqueda').classList.add('hidden');
    document.getElementById('panel-gestion-persona').classList.remove('hidden');
    document.getElementById('gestion-nombre-titulo').innerText=p.nombre;
    document.getElementById('gestion-estado').innerText=p.estado.toUpperCase();
    document.getElementById('gestion-cama-info').innerText=p.cama?`Cama: ${p.cama}`:"";
    setVal('edit-nombre',p.nombre);setVal('edit-ap1',p.ap1);setVal('edit-ap2',p.ap2);setVal('edit-tipo-doc',p.tipoDoc);setVal('edit-doc-num',p.docNum);setVal('edit-fecha',p.fechaNac);setVal('edit-tel',p.telefono);
    
    // V4.7.2: Botón Historial Filiación
    const btnH=document.getElementById('btn-historial-ficha');
    if(['admin','super_admin'].includes(currentUserData.rol)) btnH.classList.remove('hidden');
    else btnH.classList.add('hidden');

    const fam=listaPersonasCache.filter(x=>x.familiaId&&x.familiaId===p.familiaId);document.getElementById('info-familia-resumen').innerText=fam.length>1?`Familia (${fam.length})`:"Individual";const fl=document.getElementById('info-familia-lista');fl.innerHTML="";fam.forEach(f=>{if(f.id!==p.id){const st=f.estado==='ingresado'?'color:var(--success);':'color:var(--warning);';const ic=f.estado==='ingresado'?'fa-solid fa-bed':'fa-solid fa-clock';fl.innerHTML+=`<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;" onclick="window.seleccionarPersona('${f.id}')"><div><div style="font-weight:bold;">${f.nombre}</div><small>${f.docNum||'-'}</small></div><div style="font-size:1.2rem;${st}"><i class="${ic}"></i></div></div>`;}});
};

window.guardarCambiosPersona=async()=>{if(!window.personaEnGestion)return;const p=getDatosFormulario('edit');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),p);window.registrarLog(window.personaEnGestion.id,"Edición Datos","Manual");alert("Guardado");};
window.adminPrefiliarManual=async()=>{if(prefiliacionEdicionId){const p=getDatosFormulario('man');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),p);window.registrarLog(prefiliacionEdicionId,"Edición Pre-filiación","Manual");if(adminFamiliaresTemp.length>0){const tit=listaPersonasCache.find(x=>x.id===prefiliacionEdicionId);const fid=tit.familiaId||new Date().getTime().toString();if(!tit.familiaId)await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),{familiaId:fid,rolFamilia:'TITULAR'});for(const f of adminFamiliaresTemp){const ref=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});window.registrarLog(ref.id,"Registro Familiar","Manual");}}alert("Actualizado");window.cancelarEdicionPref();return;}const n=safeVal('man-nombre');if(!n)return alert("Falta nombre");const fid=new Date().getTime().toString();const t=getDatosFormulario('man');t.estado='espera';t.familiaId=fid;t.rolFamilia='TITULAR';t.fechaRegistro=new Date();const ref=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),t);window.registrarLog(ref.id,"Registro Manual","Titular");for(const f of adminFamiliaresTemp){const refF=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});window.registrarLog(refF.id,"Registro Manual","Familiar");}alert("Guardado");limpiarFormulario('man');adminFamiliaresTemp=[];document.getElementById('admin-lista-familiares-ui').innerHTML="Ninguno.";};
window.cerrarMapaCamas=()=>{highlightedFamilyId=null;document.getElementById('modal-cama').classList.add('hidden');};
window.highlightFamily=(pid)=>{const o=listaPersonasCache.find(p=>p.id===pid);if(!o||!o.familiaId)return;highlightedFamilyId=(highlightedFamilyId===o.familiaId)?null:o.familiaId;mostrarGridCamas();};
window.abrirSeleccionCama=()=>{window.modoMapaGeneral=false;mostrarGridCamas();};
window.abrirMapaGeneral=()=>{window.modoMapaGeneral=true;mostrarGridCamas();};

// GLOBALIZAR CAMAS (IMPORTANTE)
window.guardarCama = async function(c){if(window.personaEnGestion.cama){alert("Error: Tiene cama");return;}await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()}); window.registrarLog(window.personaEnGestion.id, "Asignación Cama", `Cama ${c}`); window.cerrarMapaCamas();}
window.mostrarGridCamas = mostrarGridCamas;

function mostrarGridCamas(){
    const g=document.getElementById('grid-camas');g.innerHTML="";
    const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;
    g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
    let shadowMap={}; let famGroups={};
    listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});
    Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});
    let myFamId,famMembers=[],assignedMembers=[],neededForMe=1;
    if(!window.modoMapaGeneral&&window.personaEnGestion){myFamId=window.personaEnGestion.familiaId;if(myFamId)famMembers=listaPersonasCache.filter(m=>m.familiaId===myFamId);else famMembers=[window.personaEnGestion];assignedMembers=famMembers.filter(m=>m.cama&&m.id!==window.personaEnGestion.id);neededForMe=famMembers.length-assignedMembers.length;}
    for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occName=camasOcupadas[n];const occ=listaPersonasCache.find(p=>p.cama===n);const d=document.createElement('div');let cls="bed-box";let lbl=n;if(occ&&highlightedFamilyId&&occ.familiaId===highlightedFamilyId){cls+=" bed-family-highlight";}if(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n){cls+=" bed-current";lbl+=" (Tú)";}else if(occName){cls+=" bed-busy";if(occ){const f=`${occ.nombre} ${occ.ap1||''}`;lbl+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono||'-'}</div>`;}}else{cls+=" bed-free";if(shadowMap[n]){cls+=" bed-shadow";}}if(!window.modoMapaGeneral&&!occName&&!(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n)){if(assignedMembers.length>0){if(shadowMap[n]===myFamId)cls+=" bed-suggest-target";}else{let fit=true;for(let k=0;k<neededForMe;k++){if(camasOcupadas[(i+k).toString()])fit=false;}if(fit&&neededForMe>1)cls+=" bed-suggest-block";}}d.className=cls;d.innerHTML=lbl;d.onclick=()=>{if(occ){if(highlightedFamilyId===occ.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occ.familiaId;mostrarGridCamas();}else if(!window.modoMapaGeneral){window.guardarCama(n);}};d.ondblclick=()=>{if(occ)window.abrirModalInfoCama(occ);};g.appendChild(d);}
    document.getElementById('modal-cama').classList.remove('hidden');
}

window.abrirModalInfoCama=(p)=>{
    document.getElementById('info-cama-num').innerText=p.cama;document.getElementById('info-nombre-completo').innerText=`${p.nombre} ${p.ap1||''}`;document.getElementById('info-telefono').innerText=p.telefono||"No consta";
    const r = (currentUserData.rol || "").toLowerCase().trim();
    const bh=document.getElementById('btn-historial-cama');if(['admin','super_admin'].includes(r)){bh.classList.remove('hidden');bh.onclick=()=>window.verHistorial(p.id);}else{bh.classList.add('hidden');}
    const c=document.getElementById('info-familia-detalle');const fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);let h=`<table class="fam-table"><thead><tr><th>Nombre</th><th>Cama</th></tr></thead><tbody>`;fam.forEach(f=>{h+=`<tr><td>${f.nombre}</td><td><strong>${f.cama||'-'}</strong></td></tr>`;});h+=`</tbody></table>`;c.innerHTML=h;document.getElementById('modal-bed-info').classList.remove('hidden');
};

window.abrirModalAlbergue=async(id=null)=>{albergueEdicionId=id;document.getElementById('modal-albergue').classList.remove('hidden');const b=document.getElementById('btn-delete-albergue');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();setVal('mto-nombre',d.nombre);setVal('mto-capacidad',d.capacidad);setVal('mto-columnas',d.columnas);const r=(currentUserData.rol||"").toLowerCase().trim();if(r==='super_admin')b.classList.remove('hidden');else b.classList.add('hidden');}else{setVal('mto-nombre',"");setVal('mto-capacidad',"");b.classList.add('hidden');}};
window.guardarAlbergue=async()=>{const n=safeVal('mto-nombre'),c=safeVal('mto-capacidad'),col=safeVal('mto-columnas');if(!n||!c)return alert("Datos inc.");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});document.getElementById('modal-albergue').classList.add('hidden');};
window.eliminarAlbergueActual=async()=>{if(albergueEdicionId&&confirm("¿Borrar todo?")){const ps=await getDocs(collection(db,"albergues",albergueEdicionId,"personas"));const b=writeBatch(db);ps.forEach(d=>b.delete(d.ref));await b.commit();await deleteDoc(doc(db,"albergues",albergueEdicionId));alert("Borrado");document.getElementById('modal-albergue').classList.add('hidden');}};
window.cambiarEstadoAlbergue=async(id,st)=>{await updateDoc(doc(db,"albergues",id),{activo:st});};
window.abrirModalCambioPass=()=>{setVal('chg-old-pass','');setVal('chg-new-pass','');setVal('chg-confirm-pass','');document.getElementById('modal-change-pass').classList.remove('hidden');};
window.ejecutarCambioPass=async()=>{const o=safeVal('chg-old-pass'),n=safeVal('chg-new-pass'),c=safeVal('chg-confirm-pass');if(!o||!n||!c)return alert("Rellena todo");if(n!==c)return alert("No coinciden");if(n.length<6)return alert("Min 6 chars");try{const u=auth.currentUser;await reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,o));await updatePassword(u,n);alert("OK. Relogin");document.getElementById('modal-change-pass').classList.add('hidden');window.cerrarSesion();}catch(e){alert("Error: "+e.message);}};

// --- VINCULAR FAMILIA FIX V4.6.2 ---
window.buscarParaVincular=()=>{
    const txt=document.getElementById('search-vincular').value.toLowerCase().trim();
    const res=document.getElementById('resultados-vincular');
    res.innerHTML="";
    if(txt.length<2){res.classList.add('hidden');return;}
    
    // Filtro original + Nombre completo + doc + tlf
    const hits=listaPersonasCache.filter(p=> {
        if(p.id === window.personaEnGestion.id) return false;
        const fullName = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
        const doc = (p.docNum || "").toLowerCase();
        const tel = (p.telefono || "").toLowerCase();
        return fullName.includes(txt) || doc.includes(txt) || tel.includes(txt);
    });
    
    if(hits.length===0){
        res.innerHTML="<div class='search-item' style='color:#999;'>No hay coincidencias.</div>";
    } else {
        hits.forEach(p=>{
            const d=document.createElement('div');
            d.className='search-item';
            d.innerHTML=`<strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><br><small>📄 ${p.docNum||'-'} | 📞 ${p.telefono||'-'}</small>`;
            d.onclick=()=>window.vincularAFamilia(p);
            res.appendChild(d);
        });
    }
    res.classList.remove('hidden');
};
