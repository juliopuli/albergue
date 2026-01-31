import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
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

// --- NAVEGACIÓN ---
window.navegar=(p)=>{
    ['screen-home', 'screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa','screen-observatorio'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    
    if(p==='home'){
        document.getElementById('screen-home').classList.remove('hidden');
        document.getElementById('nav-home').classList.add('active');
    } else if(p==='usuarios'){
        document.getElementById('screen-usuarios').classList.remove('hidden'); window.cargarUsuarios();
    } else if(p==='gestion-albergues'){
        window.cargarAlberguesActivos();
        document.getElementById('screen-gestion-albergues').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
    } else if(p==='mantenimiento'){
        window.cargarAlberguesMantenimiento();
        document.getElementById('screen-mantenimiento').classList.remove('hidden');
        document.getElementById('nav-mto').classList.add('active');
    } else if(p==='operativa'){
        document.getElementById('screen-operativa').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
        window.cambiarPestana('filiacion'); 
    } else if(p==='observatorio'){
        document.getElementById('screen-observatorio').classList.remove('hidden');
        document.getElementById('nav-obs').classList.add('active');
        window.cargarObservatorio(); 
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
    if(['super_admin','admin','avanzado'].includes(r))m.classList.remove('disabled');else m.classList.add('disabled');
    if(r==='super_admin') document.getElementById('container-ver-ocultos').classList.remove('hidden');
}

// --- OBSERVATORIO (V3.8.1 UPDATED) ---
window.cargarObservatorio = async () => {
    const listContainer = document.getElementById('obs-list-container');
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
                        <strong>${sFree} / ${cap}</strong> </div>
                    <div class="obs-data-point" style="flex:1; min-width:150px; margin-right:0;">
                        <span>Ocupación ${sPct}%</span>
                        <div class="prog-track"><div class="prog-fill ${color}" style="width:${sPct}%"></div></div>
                    </div>
                </div>
            </div>`;
        }

        document.getElementById('kpi-espera').innerText = gWait;
        document.getElementById('kpi-alojados').innerText = gHosted;
        
        // CAMBIO V3.8.1 GLOBAL
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

        let html = `<table class="fam-table">
            <thead><tr><th>Nombre</th><th>Apellidos</th><th>DNI</th><th>Teléfono</th></tr></thead>
            <tbody>`;
        
        snap.forEach(doc => {
            const d = doc.data();
            html += `<tr>
                <td>${d.nombre}</td>
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
    if (t === 'prefiliacion') {
        document.getElementById('tab-prefiliacion').classList.remove('hidden');
        document.getElementById('tab-filiacion').classList.add('hidden');
        document.getElementById('btn-tab-pref').className = 'tab-btn active';
        document.getElementById('btn-tab-fil').className = 'tab-btn';
        
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

// --- UTILS & FORM (SAFE) ---
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

window.abrirModalUsuario=async(id=null)=>{
    userEditingId=id; document.getElementById('modal-crear-usuario').classList.remove('hidden');
    const sel=document.getElementById('new-user-role'); sel.innerHTML="";
    const roles = currentUserData.rol==='super_admin'?['super_admin','admin','avanzado','medio']:['avanzado','medio'];
    roles.forEach(r=>sel.add(new Option(r,r)));
    if(id){
        const s=await getDoc(doc(db,"usuarios",String(id)));
        if(s.exists()){
            const d=s.data(); setVal('new-user-name',d.nombre); setVal('new-user-email',d.email); sel.value=d.rol;
        }
    }else{ setVal('new-user-name',""); setVal('new-user-email',""); }
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
window.cargarUsuarios=(filtro="")=>{
    const c=document.getElementById('lista-usuarios-container');
    const f=safeVal('search-user').toLowerCase();
    onSnapshot(query(collection(db,"usuarios"),orderBy("nombre")),s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const u=d.data();
            if(currentUserData.rol==='admin' && (u.rol==='admin'||u.rol==='super_admin')) return;
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
        if(currentUserData.rol==='super_admin') btnDel.classList.remove('hidden');
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

window.cargarAlberguesActivos=()=>{
    const c=document.getElementById('lista-albergues-activos');
    onSnapshot(query(collection(db,"albergues"),where("activo","==",true)),s=>{
        c.innerHTML="";
        s.forEach(async d=>{
            const a=d.data();
            const snap = await getDocs(query(collection(db,"albergues",d.id,"personas"),where("estado","==","ingresado")));
            c.innerHTML+=`<div class="mto-card" onclick="window.entrarAlbergue('${d.id}')"><h3>${a.nombre}</h3><div class="mto-info">Ocupación: <strong>${snap.size}</strong> / ${a.capacidad}</div></div>`;
        });
    });
};

window.entrarAlbergue=(id)=>{
    currentAlbergueId=id; window.navegar('operativa');
    window.cambiarPestana('filiacion'); 
    
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
        try {
             listaPersonasCache.sort((a,b)=>(b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0));
        } catch(e) { console.log("Sort error suppressed"); }
        
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

window.buscarEnPrefiliacion=()=>{
    const txt=safeVal('buscador-pref').toLowerCase();
    const res=document.getElementById('resultados-pref');
    if(txt.length<2){res.classList.add('hidden');return;}
    
    const hits=listaPersonasCache.filter(p=>p.estado==='espera' && (p.nombre||"").toLowerCase().includes(txt));
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
    
    const existingList = document.getElementById('existing-family-list-ui');
    existingList.innerHTML = "";
    
    if(p.familiaId) {
        const familyMembers = listaPersonasCache.filter(x => x.familiaId === p.familiaId && x.id !== p.id);
        if(familyMembers.length > 0) {
            existingList.innerHTML = "<h5>Familiares registrados:</h5>";
            familyMembers.forEach(f => {
                existingList.innerHTML += `
                <div class="fam-item existing">
                    <div><strong>${f.nombre} ${f.ap1||''}</strong></div>
                    <small>Ya registrado</small>
                </div>`;
            });
        }
    }

    document.getElementById('btn-save-pref').innerText = "Actualizar Registro";
    document.getElementById('btn-cancelar-edicion-pref').classList.remove('hidden');
};

window.cancelarEdicionPref=()=>{
    prefiliacionEdicionId=null;
    limpiarFormulario('man');
    document.getElementById('existing-family-list-ui').innerHTML = ""; // Limpiar lista
    document.getElementById('btn-save-pref').innerText = "Guardar Nuevo";
    document.getElementById('btn-cancelar-edicion-pref').classList.add('hidden');
};

window.buscarPersonaEnAlbergue=()=>{const txt=safeVal('buscador-persona').toLowerCase();const res=document.getElementById('resultados-busqueda');if(txt.length<2){res.classList.add('hidden');return;}const hits=listaPersonasCache.filter(p=>(p.nombre||"").toLowerCase().includes(txt)||(p.docNum||"").toLowerCase().includes(txt));res.innerHTML="";if(hits.length===0){res.innerHTML=`<div class="search-item" style="color:#666">No encontrado</div>`;}else{hits.forEach(p=>{const dotClass=p.cama?'dot-green':'dot-orange';res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}')"><div style="display:flex;justify-content:space-between;width:100%;"><div><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong> <br><small>${p.docNum||''}</small></div><div class="status-dot ${dotClass}"></div></div></div>`;});}res.classList.remove('hidden');};
window.seleccionarPersona=(pid)=>{if(typeof pid!=='string')pid=pid.id;const p=listaPersonasCache.find(x=>x.id===pid);if(!p)return;window.personaEnGestion=p;document.getElementById('resultados-busqueda').classList.add('hidden');document.getElementById('panel-gestion-persona').classList.remove('hidden');document.getElementById('gestion-nombre-titulo').innerText=p.nombre;document.getElementById('gestion-estado').innerText=p.estado.toUpperCase();document.getElementById('gestion-cama-info').innerText=p.cama?`Cama: ${p.cama}`:"";setVal('edit-nombre',p.nombre);setVal('edit-ap1',p.ap1);setVal('edit-ap2',p.ap2);setVal('edit-tipo-doc',p.tipoDoc);setVal('edit-doc-num',p.docNum);setVal('edit-fecha',p.fechaNac);setVal('edit-tel',p.telefono);const fam=listaPersonasCache.filter(x=>x.familiaId&&x.familiaId===p.familiaId);document.getElementById('info-familia-resumen').innerText=fam.length>1?`Familia (${fam.length})`:"Individual";const flist=document.getElementById('info-familia-lista');flist.innerHTML="";fam.forEach(f=>{if(f.id!==p.id){const isIngresado=f.estado==='ingresado';const colorStyle=isIngresado?'color:var(--success);':'color:var(--warning);';const iconClass=isIngresado?'fa-solid fa-bed':'fa-solid fa-clock';flist.innerHTML+=`<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.seleccionarPersona('${f.id}')"><div><div style="font-weight:bold;font-size:0.95rem;">${f.nombre} ${f.ap1||''} ${f.ap2||''}</div><div style="font-size:0.85rem;color:#666;"><i class="fa-regular fa-id-card"></i> ${f.docNum||'-'} &nbsp;|&nbsp; <i class="fa-solid fa-phone"></i> ${f.telefono||'-'}</div></div><div style="font-size:1.2rem;${colorStyle}"><i class="${iconClass}"></i></div></div>`;}});};
window.guardarCambiosPersona=async()=>{if(!window.personaEnGestion)return;const p=getDatosFormulario('edit');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),p);alert("Datos actualizados");};
window.adminPrefiliarManual=async()=>{if(prefiliacionEdicionId){const p=getDatosFormulario('man');await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),p);if(adminFamiliaresTemp.length>0){const titular=listaPersonasCache.find(x=>x.id===prefiliacionEdicionId);const fid=titular.familiaId||new Date().getTime().toString();if(!titular.familiaId){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),{familiaId:fid,rolFamilia:'TITULAR'});}for(const f of adminFamiliaresTemp){await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});}}alert("Actualizado");window.cancelarEdicionPref();return;}const n=safeVal('man-nombre');if(!n)return alert("Nombre obligatorio");const fid=new Date().getTime().toString();const titular=getDatosFormulario('man');titular.estado='espera';titular.familiaId=fid;titular.rolFamilia='TITULAR';titular.fechaRegistro=new Date();await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),titular);for(const f of adminFamiliaresTemp){await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',familiaId:fid,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});}alert("Guardado");limpiarFormulario('man');adminFamiliaresTemp=[];document.getElementById('admin-lista-familiares-ui').innerHTML="Ninguno.";document.getElementById('existing-family-list-ui').innerHTML="";};
window.cerrarMapaCamas=()=>{highlightedFamilyId=null;document.getElementById('modal-cama').classList.add('hidden');};
window.highlightFamily=(pid)=>{const occupant=listaPersonasCache.find(p=>p.id===pid);if(!occupant||!occupant.familiaId)return;if(highlightedFamilyId===occupant.familiaId){highlightedFamilyId=null;}else{highlightedFamilyId=occupant.familiaId;}mostrarGridCamas();};
window.abrirSeleccionCama=()=>{window.modoMapaGeneral=false;mostrarGridCamas();};
window.abrirMapaGeneral=()=>{window.modoMapaGeneral=true;mostrarGridCamas();};

function mostrarGridCamas(){
    const g=document.getElementById('grid-camas');g.innerHTML="";
    const cols=(currentAlbergueData && currentAlbergueData.columnas) ? currentAlbergueData.columnas : 8;
    g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
    let shadowMap={}; let famGroups={};
    listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});
    Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});
    let myFamId,famMembers=[],assignedMembers=[],neededForMe=1;
    if(!window.modoMapaGeneral&&window.personaEnGestion){myFamId=window.personaEnGestion.familiaId;if(myFamId)famMembers=listaPersonasCache.filter(m=>m.familiaId===myFamId);else famMembers=[window.personaEnGestion];assignedMembers=famMembers.filter(m=>m.cama&&m.id!==window.personaEnGestion.id);neededForMe=famMembers.length-assignedMembers.length;}
    for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occupantName=camasOcupadas[n];const occupant=listaPersonasCache.find(p=>p.cama===n);const d=document.createElement('div');let classes="bed-box";let label=n;if(occupant&&highlightedFamilyId&&occupant.familiaId===highlightedFamilyId){classes+=" bed-family-highlight";}if(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n){classes+=" bed-current";label+=" (Tú)";}else if(occupantName){classes+=" bed-busy";if(occupant){const full=`${occupant.nombre} ${occupant.ap1||''} ${occupant.ap2||''}`;label+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;line-height:1.1;">${full}<br><i class="fa-solid fa-phone"></i> ${occupant.telefono||'-'}</div>`;}}else{classes+=" bed-free";if(shadowMap[n]){classes+=" bed-shadow";}}if(!window.modoMapaGeneral&&!occupantName&&!(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n)){if(assignedMembers.length>0){if(shadowMap[n]===myFamId)classes+=" bed-suggest-target";}else{let fit=true;for(let k=0;k<neededForMe;k++){if(camasOcupadas[(i+k).toString()])fit=false;}if(fit&&neededForMe>1)classes+=" bed-suggest-block";}}d.className=classes;d.innerHTML=label;d.onclick=()=>{if(occupant){if(highlightedFamilyId===occupant.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occupant.familiaId;mostrarGridCamas();}else if(!window.modoMapaGeneral){guardarCama(n);}};d.ondblclick=()=>{if(occupant)window.abrirModalInfoCama(occupant);};g.appendChild(d);}document.getElementById('modal-cama').classList.remove('hidden');
}

window.abrirModalInfoCama=(p)=>{document.getElementById('info-cama-num').innerText=p.cama;document.getElementById('info-nombre-completo').innerText=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`;document.getElementById('info-telefono').innerText=p.telefono||"No consta";const container=document.getElementById('info-familia-detalle');const fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);let html=`<table class="fam-table"><thead><tr><th>Nombre</th><th>Apellidos</th><th>Teléfono</th><th>Cama</th></tr></thead><tbody>`;fam.forEach(f=>{const isCurrent=f.id===p.id?'fam-row-current':'';html+=`<tr class="${isCurrent}"><td>${f.nombre}</td><td>${f.ap1||''} ${f.ap2||''}</td><td>${f.telefono||'-'}</td><td><strong>${f.cama||'-'}</strong></td></tr>`;});html+=`</tbody></table>`;container.innerHTML=html;document.getElementById('modal-bed-info').classList.remove('hidden');};
async function guardarCama(c){if(window.personaEnGestion.cama){alert(`Error: ${window.personaEnGestion.nombre} ya tiene asignada la cama ${window.personaEnGestion.cama}. Debes liberarla primero.`);return;}await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});window.cerrarMapaCamas();}
window.liberarCamaMantener=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{cama:null});
window.regresarPrefiliacion=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'espera',cama:null});
function generarQR(){const u=window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`;document.getElementById("qrcode").innerHTML="";new QRCode(document.getElementById("qrcode"),{text:u,width:100,height:100});}
