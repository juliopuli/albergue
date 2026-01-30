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

// --- AUTH & HOME ---
window.onload=()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get('public_id')){
        isPublicMode = true; currentAlbergueId=p.get('public_id');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('public-register-screen').classList.remove('hidden');
    }
};

window.iniciarSesion=async()=>{try{await signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value);}catch(e){alert(e.message);}};
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
    ['screen-home', 'screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    if(unsubscribeUsers)unsubscribeUsers();if(unsubscribeAlberguesActivos)unsubscribeAlberguesActivos();if(unsubscribeAlberguesMto)unsubscribeAlberguesMto();if(unsubscribePersonas)unsubscribePersonas();
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    
    if(p==='home'){
        document.getElementById('screen-home').classList.remove('hidden');
        document.getElementById('nav-home').classList.add('active');
    } else if(p==='usuarios'){
        const c = document.getElementById('lista-usuarios-container'); if(c) c.innerHTML = "";
        document.getElementById('search-user').value = "";
        document.getElementById('screen-usuarios').classList.remove('hidden');
        // Nav item removed, but screen exists
        window.cargarUsuarios();
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
        window.cambiarPestana('prefiliacion');
    }
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

window.cambiarPestana = (t) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); c.style.display='none'; });
    
    if (t === 'prefiliacion') {
        document.getElementById('btn-tab-pref').classList.add('active');
        const p = document.getElementById('tab-prefiliacion'); p.classList.remove('hidden'); p.style.display='block'; setTimeout(()=>p.classList.add('active'),10);
        limpiarFormulario('man'); adminFamiliaresTemp = []; actualizarListaFamiliaresAdminUI();
        document.getElementById('panel-gestion-persona').classList.add('hidden');
        window.cancelarEdicionPref();
    } else if (t === 'filiacion') {
        document.getElementById('btn-tab-fil').classList.add('active');
        const f = document.getElementById('tab-filiacion'); f.classList.remove('hidden'); f.style.display='block'; setTimeout(()=>f.classList.add('active'),10);
        document.getElementById('buscador-persona').value = ""; document.getElementById('resultados-busqueda').style.display = 'none';
        document.getElementById('panel-gestion-persona').classList.add('hidden');
    }
};

// --- UTILS & FORM (FIXED SAFE CLEAR) ---
window.formatearFecha=(i)=>{let v=i.value.replace(/\D/g,'').slice(0,8);if(v.length>=5)i.value=`${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;else if(v.length>=3)i.value=`${v.slice(0,2)}/${v.slice(2)}`;else i.value=v;};
window.verificarMenor=(p)=>{const t=document.getElementById(`${p}-tipo-doc`).value;const i=document.getElementById(`${p}-doc-num`);if(t==='MENOR'){i.value="MENOR-SIN-DNI";i.disabled=true;i.classList.remove('input-error');if(document.getElementById(`${p}-doc-error`))document.getElementById(`${p}-doc-error`).style.display='none';}else{i.disabled=false;if(i.value==="MENOR-SIN-DNI")i.value="";}};
window.validarEdad=(p)=>{const f=document.getElementById(`${p}-fecha`).value;const e=document.getElementById(`${p}-fecha-error`);const t=document.getElementById(`${p}-tipo-doc`).value;if(f.length!==10){if(e)e.style.display='none';return true;}const [d,m,a]=f.split('/').map(Number);const nac=new Date(a,m-1,d);const hoy=new Date();let ed=hoy.getFullYear()-nac.getFullYear();if(hoy<new Date(hoy.getFullYear(),m-1,d))ed--;if(t==='MENOR'&&ed>=16){if(e){e.innerText=">16 requiere DNI";e.style.display='block';}return false;}if(e)e.style.display='none';return true;};
window.validarDocumento=(p)=>{const t=document.getElementById(`${p}-tipo-doc`).value;const i=document.getElementById(`${p}-doc-num`);const e=document.getElementById(`${p}-doc-error`);if(t==='MENOR'||!i.value)return true;let v=i.value.toUpperCase();i.value=v;let ok=true;if(t==='PASAPORTE')ok=v.length>3;else{const l="TRWAGMYFPDXBNJZSQVHLCKE";let n=v;let letIn=v.slice(-1);if(t==='NIE'){if(v.startsWith('X'))n='0'+v.slice(1);else if(v.startsWith('Y'))n='1'+v.slice(1);else if(v.startsWith('Z'))n='2'+v.slice(1);else ok=false;}if(ok){const num=parseInt(n.slice(0,-1));if(isNaN(num))ok=false;else{if(l[num%23]!==letIn)ok=false;}}}if(!ok){i.classList.add('input-error');if(e)e.style.display='block';return false;}else{i.classList.remove('input-error');if(e)e.style.display='none';return true;}};

// SAFE CLEAN FUNCTION (FIX V13)
function limpiarFormulario(p){
    ['nombre','ap1','ap2','doc-num','fecha','tel'].forEach(f=>{
        const el = document.getElementById(`${p}-${f}`);
        if(el) el.value = "";
    });
    const i=document.getElementById(`${p}-doc-num`);
    if(i){i.classList.remove('input-error');i.disabled=false;}
}

function safeVal(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function safeSet(id, val) { const el = document.getElementById(id); if(el) el.value = val; }

function getDatosFormulario(p) {
    return {
        nombre: safeVal(`${p}-nombre`),
        ap1: safeVal(`${p}-ap1`),
        ap2: safeVal(`${p}-ap2`),
        tipoDoc: safeVal(`${p}-tipo-doc`),
        docNum: safeVal(`${p}-doc-num`),
        fechaNac: safeVal(`${p}-fecha`),
        telefono: safeVal(`${p}-tel`)
    };
}

// --- FAMILIA Y FUSION ---
window.abrirModalVincularFamilia=()=>{document.getElementById('modal-vincular-familia').classList.remove('hidden');document.getElementById('search-vincular').value="";document.getElementById('resultados-vincular').innerHTML="";};
window.buscarParaVincular=()=>{const txt=document.getElementById('search-vincular').value.toLowerCase();const res=document.getElementById('resultados-vincular');res.innerHTML="";if(txt.length<2){res.style.display='none';return;}const hits=listaPersonasCache.filter(p=>p.id!==window.personaEnGestion.id && (p.nombre.toLowerCase().includes(txt)||(p.docNum&&p.docNum.toLowerCase().includes(txt))));if(hits.length===0){res.innerHTML="<div class='search-item' style='color:#999;'>No hay coincidencias.</div>"; res.style.display='block';}else{res.style.display='block';hits.forEach(p=>{const d=document.createElement('div');d.className='search-item';d.innerHTML=`<strong>${p.nombre}</strong> (${p.docNum||'-'})`;d.onclick=()=>window.vincularAFamilia(p);res.appendChild(d);});}};
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

// --- GESTIÓN FAMILIARES (QR PÚBLICO - FIX V13) ---
window.abrirModalFamiliar = () => {
    limpiarFormulario('fam');
    document.getElementById('modal-add-familiar').classList.remove('hidden');
    document.getElementById('fam-tipo-doc').value = "MENOR";
    window.verificarMenor('fam');
};
window.cerrarModalFamiliar = () => document.getElementById('modal-add-familiar').classList.add('hidden');

window.guardarFamiliarEnLista = () => {
    const tDoc = document.getElementById('fam-tipo-doc').value;
    if (tDoc !== 'MENOR'){ if(!window.validarDocumento('fam')) return alert("Documento inválido."); }
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
        d.innerHTML += `<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`;
    });
}
window.borrarFamiliarTemp = (i) => { listaFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresUI(); };

// --- GESTIÓN FAMILIARES (ADMIN) ---
window.abrirModalFamiliarAdmin=()=>{limpiarFormulario('adm-fam');document.getElementById('modal-admin-add-familiar').classList.remove('hidden');document.getElementById('adm-fam-tipo-doc').value="MENOR";window.verificarMenor('adm-fam');};window.cerrarModalFamiliarAdmin=()=>document.getElementById('modal-admin-add-familiar').classList.add('hidden');
window.guardarFamiliarAdmin=()=>{
    const tDoc = document.getElementById('adm-fam-tipo-doc').value;
    if(tDoc !== 'MENOR'){ if(!window.validarDocumento('adm-fam')) return alert("Datos inválidos"); }
    const d=getDatosFormulario('adm-fam');
    if(!d.nombre) return alert("Nombre obligatorio");
    adminFamiliaresTemp.push(d);
    actualizarListaFamiliaresAdminUI();
    window.cerrarModalFamiliarAdmin();
};
function actualizarListaFamiliaresAdminUI(){const d=document.getElementById('admin-lista-familiares-ui');d.innerHTML="";if(adminFamiliaresTemp.length===0){d.innerHTML='<p style="color:#999;font-style:italic;">Ninguno.</p>';return;}adminFamiliaresTemp.forEach((f,i)=>{d.innerHTML+=`<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="borrarFamiliarAdminTemp(${i})">X</button></div>`;});}window.borrarFamiliarAdminTemp=(i)=>{adminFamiliaresTemp.splice(i,1);actualizarListaFamiliaresAdminUI();};

// --- RESTO FUNCIONES ---
window.publicoGuardarTodo=async()=>{if(!window.validarDocumento('pub'))return alert("Revise titular");const p=getDatosFormulario('pub');if(!p.nombre||!p.docNum)return alert("Datos inc.");const famId=new Date().getTime().toString();await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...p,estado:'espera',fechaRegistro:new Date(),origen:'qr',familiaId:famId,rolFamilia:'TITULAR'});for(const f of listaFamiliaresTemp)await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',fechaRegistro:new Date(),origen:'qr',familiaId:famId,rolFamilia:'MIEMBRO'});document.getElementById('public-form-container').classList.add('hidden');document.getElementById('public-success-msg').classList.remove('hidden');};
window.abrirModalQR=()=>{document.getElementById('modal-qr').classList.remove('hidden');const qrDiv=document.getElementById("qrcode-display");if(qrDiv.innerHTML===""){const u=window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`;new QRCode(qrDiv,{text:u,width:250,height:250});}};

// --- USUARIOS FIX (V13.0) ---
window.abrirModalUsuario=async(id=null)=>{
    userEditingId=id;
    document.getElementById('modal-crear-usuario').classList.remove('hidden');
    const sel=document.getElementById('new-user-role');sel.innerHTML="";
    const r=currentUserData.rol;
    if(r==='super_admin'){['super_admin','admin','avanzado','medio'].forEach(o=>sel.add(new Option(o.toUpperCase(),o)));}
    else if(r==='admin'){['avanzado','medio'].forEach(o=>sel.add(new Option(o.toUpperCase(),o)));}
    
    const nameIn=document.getElementById('new-user-name');
    const mailIn=document.getElementById('new-user-email');
    const passIn=document.getElementById('new-user-pass');
    
    if(id){
        document.getElementById('user-modal-title').innerText="Editar Usuario";
        const snap=await getDoc(doc(db,"usuarios", String(id)));
        if(snap.exists()){
            const d=snap.data();
            nameIn.value=d.nombre;
            mailIn.value=d.email;
            mailIn.disabled=true;
            sel.value=d.rol;
            passIn.value="";
            passIn.placeholder="(Sin cambios)";
        }
    }else{
        document.getElementById('user-modal-title').innerText="Nuevo Usuario";
        nameIn.value=""; mailIn.value=""; mailIn.disabled=false;
        passIn.value=""; passIn.placeholder="Mínimo 6 caracteres";
    }
};

window.guardarUsuario=async()=>{
    const e=document.getElementById('new-user-email').value;
    const p=document.getElementById('new-user-pass').value;
    const n=document.getElementById('new-user-name').value;
    const r=document.getElementById('new-user-role').value;
    
    if(!n||!r)return alert("Faltan datos obligatorios.");
    
    if(userEditingId){
        if(p.length>0) alert("NOTA: La contraseña no se cambia aquí. Use reseteo por email.");
        await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});
        alert("Perfil actualizado.");
    }else{
        if(!e||!p)return alert("Email y contraseña obligatorios.");
        try{
            const tApp=initializeApp(firebaseConfig,"Temp");
            const tAuth=getAuth(tApp);
            const uc=await createUserWithEmailAndPassword(tAuth,e,p);
            await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});
            await signOut(tAuth);
            alert("Usuario creado.");
        }catch(err){alert("Error: "+err.message);}
    }
    document.getElementById('modal-crear-usuario').classList.add('hidden');
    window.cargarUsuarios();
};

window.cargarUsuarios=(filtro="")=>{
    const c=document.getElementById('lista-usuarios-container');
    if(!c) return;
    if(filtro.trim()===""){c.innerHTML="";return;}
    unsubscribeUsers=onSnapshot(query(collection(db,"usuarios"),orderBy("nombre")),s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const u=d.data();
            const myRol=currentUserData.rol;
            if(myRol==='admin'&&(u.rol==='admin'||u.rol==='super_admin'))return;
            if(filtro&&!u.nombre.toLowerCase().includes(filtro)&&!u.email.toLowerCase().includes(filtro))return;
            
            const div=document.createElement('div');
            div.className="user-card-item";
            div.innerHTML=`<div class="user-card-left"><div class="user-avatar-circle">${u.nombre.charAt(0).toUpperCase()}</div><div class="user-details"><h4>${u.nombre}</h4><p><i class="fa-solid fa-envelope"></i> ${u.email}</p><span class="user-role-tag tag-${u.rol}">${u.rol.toUpperCase()}</span></div></div><button class="secondary" onclick="window.abrirModalUsuario('${d.id}')"><i class="fa-solid fa-pen"></i></button>`;
            c.appendChild(div);
        });
    });
};
window.filtrarUsuarios=()=>{window.cargarUsuarios(document.getElementById('search-user').value.toLowerCase());};

// --- RESTO SISTEMA ---
window.cargarAlberguesMantenimiento = () => {const c=document.getElementById('mto-container');const showHidden=document.getElementById('check-ver-ocultos')?document.getElementById('check-ver-ocultos').checked:false;const isSuper=currentUserData.rol==='super_admin';unsubscribeAlberguesMto=onSnapshot(query(collection(db,"albergues"),orderBy("nombre")),s=>{c.innerHTML="";const addDiv=document.createElement('div');addDiv.className="mto-card add-new";addDiv.onclick=()=>abrirModalAlbergue();addDiv.innerHTML=`<div style="text-align:center;"><i class="fa-solid fa-circle-plus"></i><h3>Nuevo Albergue</h3></div>`;c.appendChild(addDiv);s.forEach(d=>{const a=d.data();if(a.oculto&&(!isSuper||!showHidden))return;const l=a.columnas?`${a.columnas} cols`:"Auto";const arch=!a.activo;const div=document.createElement('div');div.className=`mto-card ${arch?'archived':''} ${a.oculto?'hidden-item':''}`;let btns=`<button class="secondary" onclick="abrirModalAlbergue('${d.id}')">✏️</button><button class="${arch?'success':'warning'}" onclick="cambiarEstadoAlbergue('${d.id}',${!a.activo})">${arch?'Activar':'Archivar'}</button>`;if(isSuper){btns+=`<button class="danger" onclick="eliminarAlbergue('${d.id}')"><i class="fa-solid fa-trash"></i></button>`;if(arch){const icon=a.oculto?'fa-eye':'fa-eye-slash';btns+=`<button class="dark" onclick="toggleOcultarAlbergue('${d.id}', ${!a.oculto})"><i class="fa-solid ${icon}"></i></button>`;}}div.innerHTML=`<div><h3>${a.nombre}</h3><div class="mto-info">🛏️ Cap: <strong>${a.capacidad}</strong><br>📐 <strong>${l}</strong><br>${arch?'<span class="badge badge-archived">Archivado</span>':'<span class="badge badge-active">Activo</span>'}${a.oculto?'<span class="badge badge-hidden">Oculto</span>':''}</div></div><div class="btn-group-horizontal">${btns}</div>`;c.appendChild(div);});});};
window.eliminarAlbergue=async(id)=>{if(!confirm("¿Seguro?"))return;try{const qP=query(collection(db,"albergues",id,"personas"));const snapP=await getDocs(qP);const promises=snapP.docs.map(doc=>deleteDoc(doc.ref));await Promise.all(promises);await deleteDoc(doc(db,"albergues",id));alert("Eliminado.");}catch(e){alert("Error: "+e.message);}};
window.toggleOcultarAlbergue=async(id,est)=>{await updateDoc(doc(db,"albergues",id),{oculto:est});};
window.abrirModalAlbergue=async(id=null)=>{albergueEdicionId=id;document.getElementById('modal-albergue').classList.remove('hidden');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();document.getElementById('mto-nombre').value=d.nombre;document.getElementById('mto-capacidad').value=d.capacidad;document.getElementById('mto-columnas').value=d.columnas||8;}else{document.getElementById('mto-nombre').value="";document.getElementById('mto-capacidad').value="";}};
window.guardarAlbergue=async()=>{const n=document.getElementById('mto-nombre').value;const c=parseInt(document.getElementById('mto-capacidad').value);const cols=parseInt(document.getElementById('mto-columnas').value)||8;if(!n||!c)return alert("Faltan datos");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:c,columnas:cols});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:c,columnas:cols,activo:true,fecha:new Date()});document.getElementById('modal-albergue').classList.add('hidden');};
window.cambiarEstadoAlbergue=async(i,s)=>await updateDoc(doc(db,"albergues",i),{activo:s});

// --- RESTORED: INFOGRAFIA & OCCUPANCY ---
window.cargarAlberguesActivos=()=>{
    const c=document.getElementById('lista-albergues-activos');
    unsubscribeAlberguesActivos=onSnapshot(query(collection(db,"albergues"),where("activo","==",true)),s=>{
        c.innerHTML="";
        s.forEach(async d=>{
            const a=d.data();
            if(a.oculto&&currentUserData.rol!=='super_admin')return;
            // FIX V15: REMOVED "orderBy" HERE TO PREVENT INDEX ERRORS
            const qOccupied=query(collection(db,"albergues",d.id,"personas"),where("estado","==","ingresado"));
            const snapOccupied=await getDocs(qOccupied);
            const count=snapOccupied.size;
            const div=document.createElement('div');
            div.className="mto-card";
            div.style.cursor="pointer";
            div.innerHTML=`<h3>${a.nombre}</h3><div class="mto-info"><strong>${count}</strong> / ${a.capacidad} Ocupadas<div style="height:6px; background:#e2e8f0; border-radius:3px; margin-top:5px; overflow:hidden;"><div style="width:${(count/a.capacidad)*100}%; background:var(--primary); height:100%;"></div></div></div>`;
            div.onclick=()=>window.entrarAlbergue(d.id);
            c.appendChild(div);
        });
    });
};

window.entrarAlbergue=(id)=>{currentAlbergueId=id;window.navegar('operativa');onSnapshot(doc(db,"albergues",id),d=>{currentAlbergueData=d.data();document.getElementById('app-title').innerText=currentAlbergueData.nombre;totalCapacidad=currentAlbergueData.capacidad||0;actualizarContadores();});
// FIX V15: REMOVED "orderBy" TO PREVENT INDEX ERRORS - SORTING LOCALLY
unsubscribePersonas=onSnapshot(query(collection(db,"albergues",id,"personas")),s=>{
    listaPersonasCache=[];
    let c=0;
    camasOcupadas={};
    s.forEach(ds=>{
        const p=ds.data();p.id=ds.id;
        listaPersonasCache.push(p);
        if(p.estado!=='espera'){c++;if(p.cama)camasOcupadas[p.cama]=p.nombre;}
    });
    // SORT LOCALLY
    listaPersonasCache.sort((a,b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0));
    
    ocupacionActual=c;
    actualizarContadores();
    if(window.personaEnGestion){const upd=listaPersonasCache.find(u=>u.id===window.personaEnGestion.id);if(upd)seleccionarPersona(upd);}
});};
function actualizarContadores(){
    const elOcc = document.getElementById('ocupacion-count');
    const elCap = document.getElementById('capacidad-total');
    if(elOcc) elOcc.innerText=ocupacionActual;
    if(elCap) elCap.innerText=totalCapacidad;
}

window.abrirSeleccionCama=()=>{window.modoMapaGeneral=false;mostrarGridCamas();};
window.abrirMapaGeneral=()=>{window.modoMapaGeneral=true;mostrarGridCamas();};

function mostrarGridCamas(){
    const g=document.getElementById('grid-camas');
    g.innerHTML="";
    const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;
    g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
    
    // Logic for Shadows (Family Reservations)
    let shadowMap={};
    let famGroups={};
    listaPersonasCache.forEach(p=>{
        if(p.familiaId){
            if(!famGroups[p.familiaId]) famGroups[p.familiaId]={members:[], beds:[]};
            famGroups[p.familiaId].members.push(p);
            if(p.cama) famGroups[p.familiaId].beds.push(parseInt(p.cama));
        }
    });
    
    Object.values(famGroups).forEach(fam=>{
        let assigned = fam.beds.length;
        let total = fam.members.length;
        let needed = total - assigned;
        
        if(assigned > 0 && needed > 0){
            let startBed = Math.max(...fam.beds);
            let placed = 0;
            let check = startBed + 1;
            while(placed < needed && check <= totalCapacidad){
                if(!camasOcupadas[check.toString()]){
                    shadowMap[check.toString()] = fam.members[0].familiaId;
                    placed++;
                }
                check++;
            }
        }
    });

    let myFamId, famMembers=[], assignedMembers=[], neededForMe=1;
    if(!window.modoMapaGeneral && window.personaEnGestion){
        myFamId = window.personaEnGestion.familiaId;
        if(myFamId) famMembers = listaPersonasCache.filter(m => m.familiaId === myFamId);
        else famMembers = [window.personaEnGestion];
        assignedMembers = famMembers.filter(m => m.cama && m.id !== window.personaEnGestion.id);
        neededForMe = famMembers.length - assignedMembers.length;
    }

    for(let i=1; i<=totalCapacidad; i++){
        const n=i.toString();
        const occupantName = camasOcupadas[n];
        const occupant = listaPersonasCache.find(p => p.cama === n);
        const d=document.createElement('div');
        let esMiCama = (!window.modoMapaGeneral && window.personaEnGestion && window.personaEnGestion.cama === n);
        
        let classes="bed-box";
        let label = n;
        
        if(esMiCama){
            classes += " bed-current";
            label += " (Tú)";
        } else if(occupantName){
            classes += " bed-busy";
            label += ` <span>${occupantName.split(' ')[0]}</span>`; 
        } else {
            classes += " bed-free";
            if(shadowMap[n]){
                classes += " bed-shadow";
            }
        }
        
        if(!window.modoMapaGeneral && !occupantName && !esMiCama){
            if(assignedMembers.length > 0){
                if(shadowMap[n] === myFamId) classes += " bed-suggest-target";
            } else {
                let fit=true;
                for(let k=0; k<neededForMe; k++){
                    if(camasOcupadas[(i+k).toString()]) fit=false;
                }
                if(fit && neededForMe > 1) classes += " bed-suggest-block";
            }
        }

        d.className = classes;
        d.innerHTML = label;
        
        d.onclick=()=>{
            if(occupantName){
                window.abrirModalInfoCama(occupant); 
            } else if(!window.modoMapaGeneral){
                guardarCama(n); 
            }
        };
        g.appendChild(d);
    }
    document.getElementById('modal-cama').classList.remove('hidden');
}

window.abrirModalInfoCama=(p)=>{document.getElementById('info-cama-num').innerText=p.cama;document.getElementById('info-nombre-completo').innerText=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`;document.getElementById('info-telefono').innerText=p.telefono||"No consta";const famMembers=listaPersonasCache.filter(m=>m.familiaId===p.familiaId);const famTag=document.getElementById('info-familia-tag');if(famMembers.length>1){famTag.style.display='inline-block';famTag.innerText=`Familia de ${famMembers.length} Miembros`;}else{famTag.style.display='none';}document.getElementById('modal-bed-info').classList.remove('hidden');};
async function guardarCama(c){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});document.getElementById('modal-cama').classList.add('hidden');}
window.liberarCamaMantener=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{cama:null});
window.regresarPrefiliacion=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'espera',cama:null});
function generarQR(){const u=window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`;document.getElementById("qrcode").innerHTML="";new QRCode(document.getElementById("qrcode"),{text:u,width:100,height:100});}
