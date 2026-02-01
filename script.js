import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// GLOBALS
let currentUserData=null, currentAlbergueId=null, currentAlbergueData=null, totalCapacidad=0, ocupacionActual=0, camasOcupadas={}, listaPersonasCache=[];
let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribePersonas, unsubscribeAlbergueDoc;
window.personaSeleccionadaId=null; window.personaEnGestion=null; window.modoCambioCama=false; window.modoMapaGeneral=false;
let listaFamiliaresTemp=[], adminFamiliaresTemp=[], userEditingId=null, albergueEdicionId=null;
let prefiliacionEdicionId = null;
let isPublicMode = false;
let highlightedFamilyId = null;

// --- UTILS & FORM (MOVED TO TOP FOR SAFETY) ---
function safeVal(id){ const el=document.getElementById(id); return el?el.value:""; }
function setVal(id,val){ const el=document.getElementById(id); if(el)el.value=val; }

// Exposed globally to ensure access
window.formatearFecha = (i) => {
    let v=i.value.replace(/\D/g,'').slice(0,8);
    if(v.length>=5)i.value=`${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;
    else if(v.length>=3)i.value=`${v.slice(0,2)}/${v.slice(2)}`;
    else i.value=v;
};

window.verificarMenor = (p) => {
    const t=document.getElementById(`${p}-tipo-doc`).value;
    const i=document.getElementById(`${p}-doc-num`);
    if(t==='MENOR'){i.value="MENOR-SIN-DNI";i.disabled=true;}
    else{i.disabled=false;if(i.value==="MENOR-SIN-DNI")i.value="";}
};

// CRITICAL FIX: Defined here before being called
function limpiarFormulario(p){
    ['nombre','ap1','ap2','doc-num','fecha','tel'].forEach(f=>{ 
        const el=document.getElementById(`${p}-${f}`); if(el)el.value=""; 
    });
    const i=document.getElementById(`${p}-doc-num`); if(i)i.disabled=false;
}

function getDatosFormulario(p) {
    return {
        nombre: safeVal(`${p}-nombre`), ap1: safeVal(`${p}-ap1`), ap2: safeVal(`${p}-ap2`),
        tipoDoc: safeVal(`${p}-tipo-doc`), docNum: safeVal(`${p}-doc-num`), 
        fechaNac: safeVal(`${p}-fecha`), telefono: safeVal(`${p}-tel`)
    };
}

function actualizarContadores(){
    document.getElementById('ocupacion-count').innerText = ocupacionActual;
    document.getElementById('capacidad-total').innerText = totalCapacidad;
}

function actualizarListaFamiliaresUI() {
    const d = document.getElementById('lista-familiares-ui');
    d.innerHTML = "";
    if (listaFamiliaresTemp.length === 0) { d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>'; return; }
    listaFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`;
    });
}

function actualizarListaFamiliaresAdminUI(){
    const d=document.getElementById('admin-lista-familiares-ui'); d.innerHTML="";
    if(adminFamiliaresTemp.length===0){d.innerHTML='<p style="color:#999;font-style:italic;">Ninguno.</p>';return;}
    adminFamiliaresTemp.forEach((f,i)=>{
        d.innerHTML+=`<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`;
    });
}

window.borrarFamiliarTemp = (i) => { listaFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresUI(); };
window.borrarFamiliarAdminTemp = (i) => { adminFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresAdminUI(); };

window.cancelarEdicionPref=()=>{
    prefiliacionEdicionId=null; limpiarFormulario('man');
    document.getElementById('existing-family-list-ui').innerHTML="";
    document.getElementById('btn-historial-pref').classList.add('hidden');
    document.getElementById('btn-save-pref').innerText="Guardar Nuevo";
    document.getElementById('btn-cancelar-edicion-pref').classList.add('hidden');
};

function configurarTabsPorRol() {
    const r = (currentUserData.rol || "").toLowerCase().trim();
    ['btn-tab-pref','btn-tab-fil','btn-tab-san','btn-tab-psi'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.remove('hidden'); });
    if (r === 'intervencion') {
        document.getElementById('btn-tab-pref').classList.add('hidden'); document.getElementById('btn-tab-fil').classList.add('hidden'); return 'sanitaria';
    } else if (r === 'filiacion') {
        document.getElementById('btn-tab-san').classList.add('hidden'); document.getElementById('btn-tab-psi').classList.add('hidden'); return 'prefiliacion';
    }
    return 'prefiliacion';
}

window.cambiarPestana = (t) => {
    const allTabs = ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'];
    allTabs.forEach(id => { const el=document.getElementById(id); if(el) el.classList.add('hidden'); });
    const allBtns = ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'];
    allBtns.forEach(id => { const el=document.getElementById(id); if(el) el.classList.remove('active'); });

    if (t === 'prefiliacion') {
        document.getElementById('tab-prefiliacion').classList.remove('hidden');
        document.getElementById('btn-tab-pref').classList.add('active');
        limpiarFormulario('man'); adminFamiliaresTemp = []; actualizarListaFamiliaresAdminUI();
        document.getElementById('existing-family-list-ui').innerHTML = ""; 
        document.getElementById('panel-gestion-persona').classList.add('hidden');
        window.cancelarEdicionPref();
    } else if (t === 'filiacion') {
        document.getElementById('tab-filiacion').classList.remove('hidden');
        document.getElementById('btn-tab-fil').classList.add('active');
        document.getElementById('buscador-persona').value = ""; 
        document.getElementById('resultados-busqueda').classList.add('hidden'); 
        document.getElementById('panel-gestion-persona').classList.add('hidden');
    } else if (t === 'sanitaria') {
        document.getElementById('tab-sanitaria').classList.remove('hidden');
        document.getElementById('btn-tab-san').classList.add('active');
    } else if (t === 'psicosocial') {
        document.getElementById('tab-psicosocial').classList.remove('hidden');
        document.getElementById('btn-tab-psi').classList.add('active');
    }
};

function limpiarListeners() {
    if(unsubscribeUsers) unsubscribeUsers();
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    if(unsubscribeAlberguesMto) unsubscribeAlberguesMto();
    if(unsubscribePersonas) unsubscribePersonas();
    if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();
}

function configurarDashboard(){
    const r = (currentUserData.rol || "").toLowerCase().trim();
    document.getElementById('user-name-display').innerText = currentUserData.nombre;
    document.getElementById('user-role-badge').innerText = r.toUpperCase();
    
    const btnUsers = document.getElementById('header-btn-users');
    const navMto = document.getElementById('nav-mto');
    const navObs = document.getElementById('nav-obs');
    const navGest = document.getElementById('nav-albergues');

    btnUsers.classList.add('hidden');
    navMto.classList.add('disabled');
    navObs.classList.add('hidden');
    navGest.classList.add('hidden');

    if(['super_admin', 'admin'].includes(r)) btnUsers.classList.remove('hidden');
    if(['super_admin','admin'].includes(r)) navMto.classList.remove('disabled');
    if(['super_admin','admin','observador'].includes(r)) navObs.classList.remove('hidden');
    if(r !== 'observador') navGest.classList.remove('hidden');

    if(r==='super_admin') document.getElementById('container-ver-ocultos').classList.remove('hidden');
}

// --- CORE FUNCTIONS ---
window.iniciarSesion = async () => {
    try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value); }
    catch(e) { alert("Error: " + e.message); }
};

window.navegar = (p) => {
    limpiarListeners();
    ['screen-home', 'screen-usuarios', 'screen-gestion-albergues', 'screen-mantenimiento', 'screen-operativa', 'screen-observatorio']
        .forEach(id => document.getElementById(id).classList.add('hidden'));
    
    if(!currentUserData) return;
    const r = (currentUserData.rol || "").toLowerCase().trim();

    if(p === 'home'){
        document.getElementById('screen-home').classList.remove('hidden');
        document.getElementById('nav-home').classList.add('active');
    } else if(p === 'usuarios'){
        if(['super_admin','admin'].includes(r)) { document.getElementById('screen-usuarios').classList.remove('hidden'); window.cargarUsuarios(); }
    } else if(p === 'gestion-albergues'){
        if(['super_admin','admin','intervencion','filiacion'].includes(r)) {
            window.cargarAlberguesActivos();
            document.getElementById('screen-gestion-albergues').classList.remove('hidden');
            document.getElementById('nav-albergues').classList.add('active');
        }
    } else if(p === 'mantenimiento'){
        if(['super_admin','admin'].includes(r)) {
            window.cargarAlberguesMantenimiento();
            document.getElementById('screen-mantenimiento').classList.remove('hidden');
            document.getElementById('nav-mto').classList.add('active');
        }
    } else if(p === 'operativa'){
        document.getElementById('screen-operativa').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
        const t = configurarTabsPorRol();
        window.cambiarPestana(t);
    } else if(p === 'observatorio'){
        if(['super_admin','admin','observador'].includes(r)) {
            document.getElementById('screen-observatorio').classList.remove('hidden');
            document.getElementById('nav-obs').classList.add('active');
            window.cargarObservatorio(); 
        }
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(p==='home') document.getElementById('nav-home').classList.add('active');
    else if(p==='gestion-albergues' || p==='operativa') document.getElementById('nav-albergues').classList.add('active');
    else if(p==='mantenimiento') document.getElementById('nav-mto').classList.add('active');
    else if(p==='observatorio') document.getElementById('nav-obs').classList.add('active');
};

// --- AUTH & HOME ---
window.onload = () => {
    const p = new URLSearchParams(window.location.search);
    if(p.get('public_id')){
        isPublicMode = true; currentAlbergueId = p.get('public_id');
        initPublicMode();
    }
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
        const snap = await getDoc(doc(db,"albergues",currentAlbergueId));
        if(snap.exists()) document.getElementById('public-albergue-name').innerText = snap.data().nombre;
    } catch(e) {}
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

// --- DATA & LOGIC ---
window.cargarDatosYEntrar = async (id) => {
    currentAlbergueId = id;
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const [docSnap, querySnap] = await Promise.all([
            getDoc(doc(db, "albergues", id)),
            getDocs(collection(db, "albergues", id, "personas"))
        ]);

        if (docSnap.exists()) {
            currentAlbergueData = docSnap.data();
            totalCapacidad = parseInt(currentAlbergueData.capacidad || 0);
        }

        listaPersonasCache = []; 
        camasOcupadas = {}; 
        let c = 0;

        querySnap.forEach(d => {
            const p = d.data(); p.id = d.id;
            listaPersonasCache.push(p);
            if (p.estado === 'ingresado') {
                c++; if (p.cama) camasOcupadas[p.cama] = p.nombre;
            }
        });
        
        try { listaPersonasCache.sort((a,b)=>(b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0)); } catch(e){}
        ocupacionActual = c;

        window.navegar('operativa');
        document.getElementById('app-title').innerText = currentAlbergueData.nombre;
        actualizarContadores();
        
        const initialTab = configurarTabsPorRol();
        window.cambiarPestana(initialTab);
        document.getElementById('loading-overlay').classList.add('hidden');
        conectarListenersBackground(id);

    } catch(e) {
        alert("Error: " + e.message);
        document.getElementById('loading-overlay').classList.add('hidden');
    }
};

function conectarListenersBackground(id) {
    if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();
    unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d => {
        if(d.exists()){
            currentAlbergueData = d.data();
            totalCapacidad = parseInt(currentAlbergueData.capacidad || 0);
            actualizarContadores();
        }
    });

    if(unsubscribePersonas) unsubscribePersonas();
    unsubscribePersonas = onSnapshot(collection(db,"albergues",id,"personas"), s => {
        listaPersonasCache = []; camasOcupadas = {}; let c = 0;
        s.forEach(d => {
            const p = d.data(); p.id = d.id;
            listaPersonasCache.push(p);
            if (p.estado === 'ingresado') {
                c++; if (p.cama) camasOcupadas[p.cama] = p.nombre;
            }
        });
        try { listaPersonasCache.sort((a,b)=>(b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0)); } catch(e){}
        ocupacionActual = c;
        actualizarContadores();
        
        if(window.personaEnGestion){
            const upd = listaPersonasCache.find(x => x.id === window.personaEnGestion.id);
            if(upd) window.seleccionarPersona(upd);
        }
    });
}

// --- STANDARD FUNCTIONS ---
window.cargarAlberguesActivos = () => {
    const c = document.getElementById('lista-albergues-activos');
    if(!c) return;
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s => {
        c.innerHTML = "";
        s.forEach(async d => {
            const a = d.data();
            const div = document.createElement('div');
            div.className = "mto-card";
            div.onclick = () => window.cargarDatosYEntrar(d.id);
            div.innerHTML = `<h3>${a.nombre}</h3><div class="mto-info" id="info-${d.id}">Calculando...</div>`;
            c.appendChild(div);
            getDocs(query(collection(db,"albergues",d.id,"personas"),where("estado","==","ingresado")))
                .then(snap => {
                    const el = document.getElementById(`info-${d.id}`);
                    if(el) el.innerHTML = `Ocupación: <strong>${snap.size}</strong> / ${a.capacidad}`;
                });
        });
    });
};

window.buscarEnPrefiliacion=()=>{
    const t=safeVal('buscador-pref').toLowerCase().trim();
    const r=document.getElementById('resultados-pref');
    if(t.length<2){r.classList.add('hidden');return;}
    const hits=listaPersonasCache.filter(p=>{
        if(p.estado!=='espera') return false;
        const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
        return full.includes(t)||(p.docNum||"").toLowerCase().includes(t)||(p.telefono||"").includes(t);
    });
    r.innerHTML="";
    hits.forEach(p=>{
        r.innerHTML += `<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')">
            <strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><br>
            <small>📄 ${p.docNum||'-'} | 📞 ${p.telefono||'-'}</small>
        </div>`;
    });
    r.classList.remove('hidden');
};

window.cargarParaEdicionPref=(pid)=>{
    const p=listaPersonasCache.find(x=>x.id===pid); if(!p)return;
    prefiliacionEdicionId=p.id;
    document.getElementById('resultados-pref').classList.add('hidden');
    document.getElementById('buscador-pref').value="";
    setVal('man-nombre',p.nombre);setVal('man-ap1',p.ap1);setVal('man-ap2',p.ap2);setVal('man-tipo-doc',p.tipoDoc);setVal('man-doc-num',p.docNum);setVal('man-fecha',p.fechaNac);setVal('man-tel',p.telefono);
    const l=document.getElementById('existing-family-list-ui'); l.innerHTML="";
    if(p.familiaId){
        const fs=listaPersonasCache.filter(x=>x.familiaId===p.familiaId&&x.id!==p.id);
        if(fs.length>0){
            l.innerHTML="<h5>Familiares:</h5>";
            fs.forEach(f=>{
                l.innerHTML+=`<div class="fam-item existing"><div><strong>${f.nombre} ${f.ap1||''}</strong><br><small style="color:#666;">${f.docNum||'-'} | ${f.telefono||'-'}</small></div></div>`;
            });
        }
    }
    const btnH=document.getElementById('btn-historial-pref');
    if(['admin','super_admin'].includes(currentUserData.rol)) { btnH.classList.remove('hidden'); btnH.onclick=()=>window.verHistorial(p.id); } 
    else btnH.classList.add('hidden');
    document.getElementById('btn-save-pref').innerText="Actualizar Registro";document.getElementById('btn-cancelar-edicion-pref').classList.remove('hidden');
};

window.cancelarEdicionPref=()=>{
    prefiliacionEdicionId=null; limpiarFormulario('man');
    document.getElementById('existing-family-list-ui').innerHTML="";
    document.getElementById('btn-historial-pref').classList.add('hidden');
    document.getElementById('btn-save-pref').innerText="Guardar Nuevo";
    document.getElementById('btn-cancelar-edicion-pref').classList.add('hidden');
};

window.buscarPersonaEnAlbergue=()=>{
    const txt=safeVal('buscador-persona').toLowerCase().trim();
    const res=document.getElementById('resultados-busqueda');
    if(txt.length<2){res.classList.add('hidden');return;}
    const hits=listaPersonasCache.filter(p=>{
        const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
        return full.includes(txt) || (p.docNum||"").toLowerCase().includes(txt);
    });
    res.innerHTML="";
    if(hits.length===0){res.innerHTML=`<div class="search-item" style="color:#666">No encontrado</div>`;}
    else{
        hits.forEach(p=>{
            const dc=p.estado==='ingresado'?'dot-green':'dot-red';
            res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}')"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><div style="font-size:0.8rem;color:#666;">📄 ${p.docNum||'-'} | 📞 ${p.telefono||'-'}</div></div><div class="status-dot ${dc}"></div></div></div>`;
        });
    }
    res.classList.remove('hidden');
};

window.seleccionarPersona=(pid)=>{
    if(typeof pid!=='string')pid=pid.id;const p=listaPersonasCache.find(x=>x.id===pid);if(!p)return;window.personaEnGestion=p;document.getElementById('resultados-busqueda').classList.add('hidden');document.getElementById('panel-gestion-persona').classList.remove('hidden');document.getElementById('gestion-nombre-titulo').innerText=p.nombre;document.getElementById('gestion-estado').innerText=p.estado.toUpperCase();document.getElementById('gestion-cama-info').innerText=p.cama?`Cama: ${p.cama}`:"";setVal('edit-nombre',p.nombre);setVal('edit-ap1',p.ap1);setVal('edit-ap2',p.ap2);setVal('edit-tipo-doc',p.tipoDoc);setVal('edit-doc-num',p.docNum);setVal('edit-fecha',p.fechaNac);setVal('edit-tel',p.telefono);
    const r=(currentUserData.rol||"").toLowerCase().trim();
    const btnH=document.getElementById('btn-historial-ficha');
    if(['admin','super_admin'].includes(r)) btnH.classList.remove('hidden'); else btnH.classList.add('hidden');

    const flist=document.getElementById('info-familia-lista'); flist.innerHTML="";
    const fam=listaPersonasCache.filter(x=>x.familiaId&&x.familiaId===p.familiaId);
    document.getElementById('info-familia-resumen').innerText=fam.length>1?`Familia (${fam.length})`:"Individual";
    fam.forEach(f=>{
        if(f.id!==p.id){
            const st=f.estado==='ingresado'?'color:var(--success);':'color:var(--warning);';
            const ic=f.estado==='ingresado'?'fa-solid fa-bed':'fa-solid fa-clock';
            flist.innerHTML+=`<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.seleccionarPersona('${f.id}')"><div><div style="font-weight:bold;font-size:0.95rem;">${f.nombre} ${f.ap1||''}</div><div style="font-size:0.85rem;color:#666;"><i class="fa-regular fa-id-card"></i> ${f.docNum||'-'} &nbsp;|&nbsp; <i class="fa-solid fa-phone"></i> ${f.telefono||'-'}</div></div><div style="font-size:1.2rem;${st}"><i class="${ic}"></i></div></div>`;
        }
    });
};
window.guardarCambiosPersona=async()=>{if(!window.personaEnGestion)return;const p=getDatosFormulario('edit');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),p);window.registrarLog(window.personaEnGestion.id,"Edición Datos","Manual");alert("Guardado");};
window.adminPrefiliarManual=async()=>{if(prefiliacionEdicionId){const p=getDatosFormulario('man');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),p);window.registrarLog(prefiliacionEdicionId,"Edición Pre-filiación","Manual");if(adminFamiliaresTemp.length>0){const tit=listaPersonasCache.find(x=>x.id===prefiliacionEdicionId);const fid=tit.familiaId||new Date().getTime().toString();if(!tit.familiaId){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),{familiaId:fid,rolFamilia:'TITULAR'});}for(const f of adminFamiliaresTemp){const ref=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});window.registrarLog(ref.id,"Registro Familiar","Manual");}}alert("Actualizado");window.cancelarEdicionPref();return;}const n=safeVal('man-nombre');if(!n)return alert("Falta nombre");const fid=new Date().getTime().toString();const t=getDatosFormulario('man');t.estado='espera';t.familiaId=fid;t.rolFamilia='TITULAR';t.fechaRegistro=new Date();const ref=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),t);window.registrarLog(ref.id,"Registro Manual","Titular");for(const f of adminFamiliaresTemp){const refF=await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});window.registrarLog(refF.id,"Registro Manual","Familiar");}alert("Guardado");limpiarFormulario('man');adminFamiliaresTemp=[];document.getElementById('admin-lista-familiares-ui').innerHTML="Ninguno.";};
window.cerrarMapaCamas=()=>{highlightedFamilyId=null;document.getElementById('modal-cama').classList.add('hidden');};
window.highlightFamily=(pid)=>{const o=listaPersonasCache.find(p=>p.id===pid);if(!o||!o.familiaId)return;highlightedFamilyId=(highlightedFamilyId===o.familiaId)?null:o.familiaId;mostrarGridCamas();};
window.abrirSeleccionCama=()=>{window.modoMapaGeneral=false;mostrarGridCamas();};
window.abrirMapaGeneral=()=>{window.modoMapaGeneral=true;mostrarGridCamas();};

// --- GLOBAL FUNCTIONS (EXPOSED) ---
window.guardarCama = async function(c){if(window.personaEnGestion.cama){alert(`Error: ${window.personaEnGestion.nombre} ya tiene asignada la cama ${window.personaEnGestion.cama}. Debes liberarla primero.`);return;}await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()}); window.registrarLog(window.personaEnGestion.id, "Asignación Cama", `Cama ${c}`); window.cerrarMapaCamas();}
window.mostrarGridCamas = mostrarGridCamas;
window.abrirModalInfoCama = abrirModalInfoCama;

function mostrarGridCamas(){
    const g=document.getElementById('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};let famGroups={};listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});let myFamId,famMembers=[],assignedMembers=[],neededForMe=1;if(!window.modoMapaGeneral&&window.personaEnGestion){myFamId=window.personaEnGestion.familiaId;if(myFamId)famMembers=listaPersonasCache.filter(m=>m.familiaId===myFamId);else famMembers=[window.personaEnGestion];assignedMembers=famMembers.filter(m=>m.cama&&m.id!==window.personaEnGestion.id);neededForMe=famMembers.length-assignedMembers.length;}for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occName=camasOcupadas[n];const occ=listaPersonasCache.find(p=>p.cama===n);const d=document.createElement('div');let classes="bed-box";let label=n;if(occ&&highlightedFamilyId&&occ.familiaId===highlightedFamilyId){classes+=" bed-family-highlight";}if(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n){classes+=" bed-current";label+=" (Tú)";}else if(occName){classes+=" bed-busy";if(occ){const f=`${occ.nombre} ${occ.ap1||''}`;lbl+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono||'-'}</div>`;}}else{classes+=" bed-free";if(shadowMap[n]){classes+=" bed-shadow";}}if(!window.modoMapaGeneral&&!occName&&!(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n)){if(assignedMembers.length>0){if(shadowMap[n]===myFamId)classes+=" bed-suggest-target";}else{let fit=true;for(let k=0;k<neededForMe;k++){if(camasOcupadas[(i+k).toString()])fit=false;}if(fit&&neededForMe>1)cls+=" bed-suggest-block";}}d.className=cls;d.innerHTML=lbl;d.onclick=()=>{if(occ){if(highlightedFamilyId===occ.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occ.familiaId;mostrarGridCamas();}else if(!window.modoMapaGeneral){window.guardarCama(n);}};d.ondblclick=()=>{if(occ)window.abrirModalInfoCama(occ);};g.appendChild(d);}document.getElementById('modal-cama').classList.remove('hidden');}

function abrirModalInfoCama(p){
    document.getElementById('info-cama-num').innerText=p.cama;document.getElementById('info-nombre-completo').innerText=`${p.nombre} ${p.ap1||''}`;document.getElementById('info-telefono').innerText=p.telefono||"No consta";
    const bh=document.getElementById('btn-historial-cama');if(['admin','super_admin'].includes(currentUserData.rol)){bh.classList.remove('hidden');bh.onclick=()=>window.verHistorial(p.id);}else{bh.classList.add('hidden');}
    const c=document.getElementById('info-familia-detalle');const fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);let h=`<table class="fam-table"><thead><tr><th>Nombre</th><th>DNI/Tel</th><th>Cama</th></tr></thead><tbody>`;fam.forEach(f=>{const isCurrent=f.id===p.id?'fam-row-current':'';h+=`<tr class="${isCurrent}"><td>${f.nombre} ${f.ap1||''}</td><td><small>${f.docNum||'-'}<br>${f.telefono||'-'}</small></td><td><strong>${f.cama||'-'}</strong></td></tr>`;});h+=`</tbody></table>`;c.innerHTML=h;document.getElementById('modal-bed-info').classList.remove('hidden');
};
window.abrirModalAlbergue=async(id=null)=>{albergueEdicionId=id;document.getElementById('modal-albergue').classList.remove('hidden');const b=document.getElementById('btn-delete-albergue');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();setVal('mto-nombre',d.nombre);setVal('mto-capacidad',d.capacidad);setVal('mto-columnas',d.columnas);const r=(currentUserData.rol||"").toLowerCase().trim();if(r==='super_admin')b.classList.remove('hidden');else b.classList.add('hidden');}else{setVal('mto-nombre',"");setVal('mto-capacidad',"");b.classList.add('hidden');}};
window.guardarAlbergue=async()=>{const n=safeVal('mto-nombre'),c=safeVal('mto-capacidad'),col=safeVal('mto-columnas');if(!n||!c)return alert("Datos inc.");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});document.getElementById('modal-albergue').classList.add('hidden');};
window.eliminarAlbergueActual=async()=>{if(albergueEdicionId&&confirm("¿Borrar todo?")){const ps=await getDocs(collection(db,"albergues",albergueEdicionId,"personas"));const b=writeBatch(db);ps.forEach(d=>b.delete(d.ref));await b.commit();await deleteDoc(doc(db,"albergues",albergueEdicionId));alert("Borrado");document.getElementById('modal-albergue').classList.add('hidden');}};
window.cambiarEstadoAlbergue=async(id,st)=>{await updateDoc(doc(db,"albergues",id),{activo:st});};
window.abrirModalCambioPass=()=>{setVal('chg-old-pass','');setVal('chg-new-pass','');setVal('chg-confirm-pass','');document.getElementById('modal-change-pass').classList.remove('hidden');};
window.ejecutarCambioPass=async()=>{const o=safeVal('chg-old-pass'),n=safeVal('chg-new-pass'),c=safeVal('chg-confirm-pass');if(!o||!n||!c)return alert("Rellena todo");if(n!==c)return alert("No coinciden");if(n.length<6)return alert("Min 6 chars");try{const u=auth.currentUser;await reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,o));await updatePassword(u,n);alert("OK. Relogin");document.getElementById('modal-change-pass').classList.add('hidden');window.cerrarSesion();}catch(e){alert("Error: "+e.message);}};

// --- EXPORT TO WINDOW (CRITICAL FIX) ---
window.safeVal = safeVal;
window.setVal = setVal;
window.limpiarFormulario = limpiarFormulario;
window.getDatosFormulario = getDatosFormulario;
window.actualizarContadores = actualizarContadores;
window.actualizarListaFamiliaresUI = actualizarListaFamiliaresUI;
window.actualizarListaFamiliaresAdminUI = actualizarListaFamiliaresAdminUI;
window.configurarTabsPorRol = configurarTabsPorRol;
window.configurarDashboard = configurarDashboard;
window.limpiarListeners = limpiarListeners;

window.registrarLog = async (personaId, accion, detalle = "") => {try {const usuarioLog = currentUserData ? currentUserData.nombre : "Auto-Registro QR";await addDoc(collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial"), {fecha: new Date(), usuario: usuarioLog, accion: accion, detalle: detalle});} catch (e) { console.error(e); }};
window.verHistorial = async (pId = null, altAlbId = null) => {const targetId = pId || (personaEnGestion ? personaEnGestion.id : null);const targetAlbId = altAlbId || currentAlbergueId;if(!targetId || !targetAlbId) return;const modal = document.getElementById('modal-historial');const content = document.getElementById('historial-content');content.innerHTML = "Cargando...";modal.classList.remove('hidden');try {const q = query(collection(db, "albergues", targetAlbId, "personas", targetId, "historial"), orderBy("fecha", "desc"));const snap = await getDocs(q);if(snap.empty){ content.innerHTML = "<p>No hay movimientos.</p>"; return; }let html = "";snap.forEach(doc => {const d = doc.data();const f = d.fecha.toDate();const fmt = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;html += `<div class="log-item"><strong>${d.accion}</strong><span>${fmt} - Por: ${d.usuario}</span>${d.detalle ? `<br><i>${d.detalle}</i>` : ''}</div>`;});content.innerHTML = html;} catch (e) { content.innerHTML = "Error cargando historial."; }};
window.verHistorialObservatorio = (albId, pId) => { window.verHistorial(pId, albId); };

window.cargarAlberguesMantenimiento = () => {
    const c = document.getElementById('mto-container');
    const r = (currentUserData.rol || "").toLowerCase().trim();
    const isSuper = (r === 'super_admin');
    unsubscribeAlberguesMto = onSnapshot(query(collection(db,"albergues")), s => {
        c.innerHTML = "<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";
        s.forEach(d => {
            const a = d.data();
            let extraBtn = isSuper ? `<button class="warning" onclick="window.cambiarEstadoAlbergue('${d.id}', ${!a.activo})">${a.activo === false ? 'Activar' : 'Archivar'}</button>` : "";
            c.innerHTML += `<div class="mto-card ${!a.activo ? 'archived' : ''}"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><div class="btn-group-horizontal"><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>${extraBtn}</div></div>`;
        });
    });
};

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

window.cargarUsuarios = () => {
    const c = document.getElementById('lista-usuarios-container');
    const filterText = safeVal('search-user').toLowerCase().trim();
    // Using simple query without orderBy to avoid index issues
    unsubscribeUsers = onSnapshot(query(collection(db,"usuarios")), s => {
        c.innerHTML = "";
        if(s.empty) { c.innerHTML = "<p>No hay usuarios.</p>"; return; }
        s.forEach(d => {
            const u = d.data();
            // Client-side Filtering
            if(filterText && !u.nombre.toLowerCase().includes(filterText) && !u.email.toLowerCase().includes(filterText)) return;
            // Admin hiding Super Admin
            if(currentUserData.rol === 'admin' && u.rol === 'super_admin') return;
            
            c.innerHTML += `<div class="user-card-item" onclick="window.abrirModalUsuario('${d.id}')">
                <div class="user-card-left"><div class="user-avatar-circle">${u.nombre.charAt(0).toUpperCase()}</div>
                <div><strong>${u.nombre}</strong><br><small>${u.email}</small></div></div>
                <span class="badge role-${u.rol}">${u.rol}</span>
            </div>`;
        });
    });
};
window.filtrarUsuarios = () => window.cargarUsuarios(); // Link search to load

window.abrirModalUsuario = async (id = null) => {
    userEditingId = id; document.getElementById('modal-crear-usuario').classList.remove('hidden');
    const sel = document.getElementById('new-user-role'); sel.innerHTML = "";
    const btnDel = document.getElementById('btn-delete-user');
    
    let roles = [];
    if(currentUserData.rol === 'super_admin') roles = ['super_admin','admin','intervencion','filiacion','observador'];
    else if(currentUserData.rol === 'admin') roles = ['intervencion','filiacion','observador']; 
    roles.forEach(r => sel.add(new Option(r,r)));
    
    if(id){
        const s = await getDoc(doc(db,"usuarios",String(id)));
        if(s.exists()){
            const d = s.data(); setVal('new-user-name',d.nombre); setVal('new-user-email',d.email); sel.value=d.rol;
            if(['super_admin','admin'].includes(currentUserData.rol)) btnDel.classList.remove('hidden'); else btnDel.classList.add('hidden');
        }
    } else {
        setVal('new-user-name',""); setVal('new-user-email',""); btnDel.classList.add('hidden');
    }
};

window.guardarUsuario = async () => {
    const e=safeVal('new-user-email'), p=safeVal('new-user-pass'), n=safeVal('new-user-name'), r=safeVal('new-user-role');
    if(!n||!r) return alert("Datos incompletos");
    if(userEditingId){
        await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r}); alert("Actualizado");
    } else {
        if(!e||!p) return alert("Email y Pass requeridos");
        let tApp;
        try {
            tApp = initializeApp(firebaseConfig, "Temp");
            const tAuth = getAuth(tApp);
            const uc = await createUserWithEmailAndPassword(tAuth,e,p);
            await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});
            await signOut(tAuth); alert("Creado");
        } catch(err) { alert("Error: "+err.message); }
        finally { if(tApp) deleteApp(tApp); }
    }
    document.getElementById('modal-crear-usuario').classList.add('hidden');
};

window.eliminarUsuario = async () => {
    if(!userEditingId || !confirm("¿Eliminar usuario?")) return;
    try { await deleteDoc(doc(db,"usuarios",userEditingId)); alert("Eliminado"); document.getElementById('modal-crear-usuario').classList.add('hidden'); }
    catch(e){ alert(e.message); }
};

window.abrirModalQR = () => {
    document.getElementById('modal-qr').classList.remove('hidden');
    const qrDiv = document.getElementById("qrcode-display");
    qrDiv.innerHTML = "";
    const url = window.location.href.split('?')[0] + `?public_id=${currentAlbergueId}`;
    new QRCode(qrDiv, { text: url, width: 250, height: 250 });
};
