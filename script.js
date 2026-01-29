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

let isPublicMode = false;
let userEditingId = null;

// --- AUTH & INICIO ---
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

window.recuperarContrasena = async () => {
    const email = prompt("Introduce tu correo electrónico para restablecer la contraseña:");
    if (email) {
        try {
            await sendPasswordResetEmail(auth, email);
            alert("Se ha enviado un correo de recuperación. Revisa tu bandeja de entrada.");
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
};

onAuthStateChanged(auth,async(u)=>{
    if(isPublicMode) return;
    if(u){
        const s=await getDoc(doc(db,"usuarios",u.uid));
        if(s.exists()){
            currentUserData={...s.data(),uid:u.uid};
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

// --- NAVEGACIÓN Y TABS ---
window.navegar=(p)=>{
    ['screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    if(unsubscribeUsers)unsubscribeUsers();if(unsubscribeAlberguesActivos)unsubscribeAlberguesActivos();if(unsubscribeAlberguesMto)unsubscribeAlberguesMto();if(unsubscribePersonas)unsubscribePersonas();
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    if(p==='usuarios'){
        const c = document.getElementById('lista-usuarios-container'); if(c) c.innerHTML = "";
        document.getElementById('search-user').value = "";
        document.getElementById('screen-usuarios').classList.remove('hidden');
        document.getElementById('nav-users').classList.add('active');
    }
    else if(p==='gestion-albergues'){cargarAlberguesActivos();document.getElementById('screen-gestion-albergues').classList.remove('hidden');document.getElementById('nav-albergues').classList.add('active');}
    else if(p==='mantenimiento'){window.cargarAlberguesMantenimiento();document.getElementById('screen-mantenimiento').classList.remove('hidden');document.getElementById('nav-mto').classList.add('active');}
    else if(p==='operativa'){document.getElementById('screen-operativa').classList.remove('hidden');document.getElementById('nav-albergues').classList.add('active');}
};

function configurarDashboard(){
    document.getElementById('user-name-display').innerText=currentUserData.nombre;const r=currentUserData.rol;
    document.getElementById('user-role-badge').innerText=r.toUpperCase();document.getElementById('user-role-badge').className=`role-badge role-${r}`;
    const u=document.getElementById('nav-users'),m=document.getElementById('nav-mto');
    if(['super_admin','admin'].includes(r))u.classList.remove('disabled');else u.classList.add('disabled');
    if(['super_admin','admin','avanzado'].includes(r))m.classList.remove('disabled');else m.classList.add('disabled');
    if(r==='super_admin') document.getElementById('container-ver-ocultos').classList.remove('hidden');
}

// LOGICA DE PESTAÑAS (FIXED)
window.cambiarPestana = (t) => {
    // 1. Limpiar todos los botones
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    // 2. Ocultar explicitamente todos los contenidos
    document.getElementById('tab-prefiliacion').style.display = 'none';
    document.getElementById('tab-prefiliacion').classList.remove('active');
    document.getElementById('tab-filiacion').style.display = 'none';
    document.getElementById('tab-filiacion').classList.remove('active');

    // 3. Activar el seleccionado
    if (t === 'prefiliacion') {
        document.getElementById('btn-tab-pref').classList.add('active');
        const p = document.getElementById('tab-prefiliacion');
        p.style.display = 'block';
        setTimeout(() => p.classList.add('active'), 10); // Hack para renderizado
        
        // Limpiezas
        limpiarFormulario('man'); 
        adminFamiliaresTemp = []; 
        actualizarListaFamiliaresAdminUI();
        document.getElementById('panel-gestion-persona').classList.add('hidden');

    } else if (t === 'filiacion') {
        document.getElementById('btn-tab-fil').classList.add('active');
        const f = document.getElementById('tab-filiacion');
        f.style.display = 'block';
        setTimeout(() => f.classList.add('active'), 10);

        // Limpiezas
        document.getElementById('buscador-persona').value = "";
        document.getElementById('resultados-busqueda').style.display = 'none';
    }
};

// --- UTILS ---
window.formatearFecha=(i)=>{let v=i.value.replace(/\D/g,'').slice(0,8);if(v.length>=5)i.value=`${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;else if(v.length>=3)i.value=`${v.slice(0,2)}/${v.slice(2)}`;else i.value=v;};
window.verificarMenor=(p)=>{const t=document.getElementById(`${p}-tipo-doc`).value;const i=document.getElementById(`${p}-doc-num`);if(t==='MENOR'){i.value="MENOR-SIN-DNI";i.disabled=true;i.classList.remove('input-error');if(document.getElementById(`${p}-doc-error`))document.getElementById(`${p}-doc-error`).style.display='none';}else{i.disabled=false;if(i.value==="MENOR-SIN-DNI")i.value="";}};
window.validarEdad=(p)=>{const f=document.getElementById(`${p}-fecha`).value;const e=document.getElementById(`${p}-fecha-error`);const t=document.getElementById(`${p}-tipo-doc`).value;if(f.length!==10){if(e)e.style.display='none';return true;}const [d,m,a]=f.split('/').map(Number);const nac=new Date(a,m-1,d);const hoy=new Date();let ed=hoy.getFullYear()-nac.getFullYear();if(hoy<new Date(hoy.getFullYear(),m-1,d))ed--;if(t==='MENOR'&&ed>=16){if(e){e.innerText=">16 requiere DNI";e.style.display='block';}return false;}if(e)e.style.display='none';return true;};
window.validarDocumento=(p)=>{const t=document.getElementById(`${p}-tipo-doc`).value;const i=document.getElementById(`${p}-doc-num`);const e=document.getElementById(`${p}-doc-error`);if(t==='MENOR'||!i.value)return true;let v=i.value.toUpperCase();i.value=v;let ok=true;if(t==='PASAPORTE')ok=v.length>3;else{const l="TRWAGMYFPDXBNJZSQVHLCKE";let n=v;let letIn=v.slice(-1);if(t==='NIE'){if(v.startsWith('X'))n='0'+v.slice(1);else if(v.startsWith('Y'))n='1'+v.slice(1);else if(v.startsWith('Z'))n='2'+v.slice(1);else ok=false;}if(ok){const num=parseInt(n.slice(0,-1));if(isNaN(num))ok=false;else{if(l[num%23]!==letIn)ok=false;}}}if(!ok){i.classList.add('input-error');if(e)e.style.display='block';return false;}else{i.classList.remove('input-error');if(e)e.style.display='none';return true;}};
function limpiarFormulario(p){['nombre','ap1','ap2','doc-num','fecha','tel'].forEach(f=>document.getElementById(`${p}-${f}`).value="");document.getElementById(`${p}-doc-num`).classList.remove('input-error');document.getElementById(`${p}-doc-num`).disabled=false;document.getElementById(`${p}-tipo-doc`).value="DNI";}
function getDatosFormulario(p){return{nombre:document.getElementById(`${p}-nombre`).value,ap1:document.getElementById(`${p}-ap1`).value,ap2:document.getElementById(`${p}-ap2`).value,tipoDoc:document.getElementById(`${p}-tipo-doc`).value,docNum:document.getElementById(`${p}-doc-num`).value,fechaNac:document.getElementById(`${p}-fecha`).value,telefono:document.getElementById(`${p}-tel`).value};}

// --- FAMILIA & VINCULAR ---
window.abrirModalVincularFamilia=()=>{document.getElementById('modal-vincular-familia').classList.remove('hidden');document.getElementById('search-vincular').value="";document.getElementById('resultados-vincular').innerHTML="";};
window.buscarParaVincular=()=>{
    const txt=document.getElementById('search-vincular').value.toLowerCase();const res=document.getElementById('resultados-vincular');res.innerHTML="";
    if(txt.length<2){res.style.display='none';return;}
    const hits=listaPersonasCache.filter(p=>p.id!==window.personaEnGestion.id && (p.nombre.toLowerCase().includes(txt)||(p.docNum&&p.docNum.toLowerCase().includes(txt))));
    if(hits.length===0){res.innerHTML="<div class='search-item' style='color:#999;'>No hay coincidencias.</div>"; res.style.display='block';}
    else{
        res.style.display='block';
        hits.forEach(p=>{
            const d=document.createElement('div');d.className='search-item';
            const isOut=p.estado==='espera'; const badge=isOut?`<span class="badge badge-archived" style="font-size:0.75em;">ESPERA</span>`:`<span class="badge badge-active" style="font-size:0.75em;">DENTRO</span>`;
            d.innerHTML=`<div style="display:flex; justify-content:space-between; align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong><div style="font-size:0.8em; color:#666;">📄 ${p.docNum||'-'}</div></div>${badge}</div>`;
            d.onclick=()=>vincularAFamilia(p);res.appendChild(d);
        });
    }
};
window.vincularAFamilia=async(target)=>{
    if(!confirm(`¿Unir a ${window.personaEnGestion.nombre} con ${target.nombre}?`))return;
    let tid=target.familiaId;
    if(!tid){
        tid=new Date().getTime().toString()+"-LEGACY";
        await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",target.id),{familiaId:tid, rolFamilia: 'TITULAR'});
    }
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{familiaId:tid,rolFamilia:'MIEMBRO'});
    document.getElementById('modal-vincular-familia').classList.add('hidden');
    alert("Vinculado.");
};

// --- GESTIÓN FAMILIARES (QR PÚBLICO) ---
window.abrirModalFamiliar = () => {
    limpiarFormulario('fam');
    document.getElementById('modal-add-familiar').classList.remove('hidden');
    document.getElementById('fam-tipo-doc').value = "MENOR";
    window.verificarMenor('fam');
};
window.cerrarModalFamiliar = () => document.getElementById('modal-add-familiar').classList.add('hidden');

window.guardarFamiliarEnLista = () => {
    if(document.getElementById('fam-tipo-doc').value !== 'MENOR') {
        if(!window.validarDocumento('fam')) return alert("Documento inválido.");
    }
    const d = getDatosFormulario('fam');
    if (!d.nombre) return alert("Nombre obligatorio");
    
    listaFamiliaresTemp.push(d);
    actualizarListaFamiliaresUI();
    cerrarModalFamiliar();
};

function actualizarListaFamiliaresUI() {
    const d = document.getElementById('lista-familiares-ui');
    d.innerHTML = "";
    if (listaFamiliaresTemp.length === 0) {
        d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido.</p>';
        return;
    }
    listaFamiliaresTemp.forEach((f, i) => {
        d.innerHTML += `
            <div class="fam-item">
                <div><strong>${f.nombre}</strong></div>
                <button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="borrarFamiliarTemp(${i})">X</button>
            </div>`;
    });
}
window.borrarFamiliarTemp = (i) => { listaFamiliaresTemp.splice(i, 1); actualizarListaFamiliaresUI(); };

// --- GESTIÓN FAMILIARES (ADMIN) ---
window.abrirModalFamiliarAdmin=()=>{limpiarFormulario('adm-fam');document.getElementById('modal-admin-add-familiar').classList.remove('hidden');document.getElementById('adm-fam-tipo-doc').value="MENOR";window.verificarMenor('adm-fam');};
window.cerrarModalFamiliarAdmin=()=>document.getElementById('modal-admin-add-familiar').classList.add('hidden');
window.guardarFamiliarAdmin=()=>{
    if(document.getElementById('adm-fam-tipo-doc').value !== 'MENOR') {
        if(!window.validarDocumento('adm-fam')) return alert("Documento inválido.");
    }
    const d=getDatosFormulario('adm-fam');
    if(!d.nombre) return alert("Nombre obligatorio");
    adminFamiliaresTemp.push(d);
    actualizarListaFamiliaresAdminUI();
    cerrarModalFamiliarAdmin();
};
function actualizarListaFamiliaresAdminUI(){
    const d=document.getElementById('admin-lista-familiares-ui'); d.innerHTML="";
    if(adminFamiliaresTemp.length===0){d.innerHTML='<p style="color:#999;font-style:italic;">Ninguno.</p>';return;}
    adminFamiliaresTemp.forEach((f,i)=>{
        d.innerHTML+=`<div class="fam-item"><div><strong>${f.nombre}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="borrarFamiliarAdminTemp(${i})">X</button></div>`;
    });
}
window.borrarFamiliarAdminTemp=(i)=>{adminFamiliaresTemp.splice(i,1);actualizarListaFamiliaresAdminUI();};

// --- GUARDAR DB ---
window.adminPrefiliarManual = async () => {
    if (!window.validarDocumento('man')) return alert("Documento inválido.");
    const titular = getDatosFormulario('man');
    if (!titular.nombre) return alert("Falta el nombre del titular");
    try {
        const famId = new Date().getTime().toString();
        await addDoc(collection(db, "albergues", currentAlbergueId, "personas"), {...titular, estado: 'espera', fechaRegistro: new Date(), origen: 'manual', familiaId: famId, rolFamilia: 'TITULAR'});
        if(Array.isArray(adminFamiliaresTemp) && adminFamiliaresTemp.length > 0) {
            for (const fam of adminFamiliaresTemp) {
                await addDoc(collection(db, "albergues", currentAlbergueId, "personas"), {...fam, estado: 'espera', fechaRegistro: new Date(), origen: 'manual', familiaId: famId, rolFamilia: 'MIEMBRO'});
            }
        }
        alert("✅ Registrado correctamente.");
        limpiarFormulario('man'); adminFamiliaresTemp = []; actualizarListaFamiliaresAdminUI();
    } catch (e) { alert("Error: " + e.message); }
};

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

// --- QR MODAL (Admin) ---
window.abrirModalQR = () => {
    document.getElementById('modal-qr').classList.remove('hidden');
    const qrDiv = document.getElementById("qrcode-display");
    if(qrDiv.innerHTML === "") {
        const u = window.location.href.split('?')[0] + `?public_id=${currentAlbergueId}`;
        new QRCode(qrDiv, { text: u, width: 250, height: 250 });
    }
};

// --- USUARIOS & ROLES (FIXED) ---
window.abrirCrearUsuario=async(id=null)=>{
    userEditingId=id;
    document.getElementById('modal-crear-usuario').classList.remove('hidden');
    const sel=document.getElementById('new-user-role'); sel.innerHTML="";
    const r=currentUserData.rol;
    if(r==='super_admin'){['super_admin','admin','avanzado','medio'].forEach(o=>sel.add(new Option(o.toUpperCase(),o)));}
    else if(r==='admin'){['avanzado','medio'].forEach(o=>sel.add(new Option(o.toUpperCase(),o)));}

    const nameIn=document.getElementById('new-user-name');
    const mailIn=document.getElementById('new-user-email');
    const passIn=document.getElementById('new-user-pass');
    const warn=document.getElementById('edit-pass-warning');

    if(id){
        document.getElementById('user-modal-title').innerText="Editar Usuario";
        const snap=await getDoc(doc(db,"usuarios",id));
        if(snap.exists()){
            const d=snap.data();
            nameIn.value=d.nombre;
            mailIn.value=d.email;
            mailIn.disabled=true;
            sel.value=d.rol;
            passIn.value="";
            passIn.placeholder="(Sin cambios)";
            warn.style.display="block";
        }
    }else{
        document.getElementById('user-modal-title').innerText="Nuevo Usuario";
        nameIn.value=""; mailIn.value=""; mailIn.disabled=false;
        passIn.value=""; passIn.placeholder="Mínimo 6 caracteres";
        warn.style.display="none";
    }
};

window.crearUsuario=async()=>{
    // Wrapper para el botón antiguo si existiera, redirige al nuevo
    window.guardarUsuario();
};

window.guardarUsuario=async()=>{
    const e=document.getElementById('new-user-email').value;
    const p=document.getElementById('new-user-pass').value;
    const n=document.getElementById('new-user-name').value;
    const r=document.getElementById('new-user-role').value;

    if(!n || !r) return alert("Faltan datos obligatorios.");

    if(userEditingId){
        if(p.length > 0) alert("NOTA: Solo se actualizará el perfil (Nombre/Rol). Para la contraseña, use el reseteo por email.");
        await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});
        alert("Perfil actualizado.");
    }else{
        if(!e || !p) return alert("Email y contraseña obligatorios.");
        try{
            const tApp=initializeApp(firebaseConfig,"Temp");
            const tAuth=getAuth(tApp);
            const uc=await createUserWithEmailAndPassword(tAuth,e,p);
            await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r,fecha:new Date()});
            await signOut(tAuth);
            alert("Usuario creado.");
        }catch(err){alert("Error: "+err.message);}
    }
    document.getElementById('modal-crear-usuario').classList.add('hidden');
    window.cargarUsuarios();
};

window.cargarUsuarios=(filtro="")=>{
    const c=document.getElementById('lista-usuarios-container');
    if(filtro.trim()===""){c.innerHTML="";return;}
    unsubscribeUsers=onSnapshot(query(collection(db,"usuarios"),orderBy("nombre")),s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const u=d.data();
            const myRol = currentUserData.rol;
            if(myRol === 'admin' && (u.rol === 'admin' || u.rol === 'super_admin')) return;
            if(filtro && !u.nombre.toLowerCase().includes(filtro) && !u.email.toLowerCase().includes(filtro)) return;
            
            const div=document.createElement('div');
            div.className="user-card-item";
            div.innerHTML=`<div class="user-card-left"><div class="user-avatar-circle">${u.nombre.charAt(0).toUpperCase()}</div><div class="user-details"><h4>${u.nombre}</h4><p><i class="fa-solid fa-envelope"></i> ${u.email}</p><span class="user-role-tag tag-${u.rol}">${u.rol.toUpperCase()}</span></div></div><button class="secondary" onclick="abrirModalUsuario('${d.id}')"><i class="fa-solid fa-pen"></i></button>`;
            c.appendChild(div);
        });
    });
};
window.filtrarUsuarios=()=>{const txt=document.getElementById('search-user').value.toLowerCase();window.cargarUsuarios(txt);};

// --- RESTO SISTEMA ---
window.cargarAlberguesMantenimiento = () => {const c=document.getElementById('mto-container');const showHidden=document.getElementById('check-ver-ocultos')?document.getElementById('check-ver-ocultos').checked:false;const isSuper=currentUserData.rol==='super_admin';unsubscribeAlberguesMto=onSnapshot(query(collection(db,"albergues"),orderBy("nombre")),s=>{c.innerHTML="";const addDiv=document.createElement('div');addDiv.className="mto-card add-new";addDiv.onclick=()=>abrirModalAlbergue();addDiv.innerHTML=`<div style="text-align:center;"><i class="fa-solid fa-circle-plus"></i><h3>Nuevo Albergue</h3></div>`;c.appendChild(addDiv);s.forEach(d=>{const a=d.data();if(a.oculto&&(!isSuper||!showHidden))return;const l=a.columnas?`${a.columnas} cols`:"Auto";const arch=!a.activo;const div=document.createElement('div');div.className=`mto-card ${arch?'archived':''} ${a.oculto?'hidden-item':''}`;let btns=`<button class="secondary" onclick="abrirModalAlbergue('${d.id}')">✏️</button><button class="${arch?'success':'warning'}" onclick="cambiarEstadoAlbergue('${d.id}',${!a.activo})">${arch?'Activar':'Archivar'}</button>`;if(isSuper){btns+=`<button class="danger" onclick="eliminarAlbergue('${d.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>`;if(arch){const icon=a.oculto?'fa-eye':'fa-eye-slash';btns+=`<button class="dark" onclick="toggleOcultarAlbergue('${d.id}', ${!a.oculto})"><i class="fa-solid ${icon}"></i></button>`;}}div.innerHTML=`<div><h3>${a.nombre}</h3><div class="mto-info">🛏️ Cap: <strong>${a.capacidad}</strong><br>📐 <strong>${l}</strong><br>${arch?'<span class="badge badge-archived">Archivado</span>':'<span class="badge badge-active">Activo</span>'}${a.oculto?'<span class="badge badge-hidden">Oculto</span>':''}</div></div><div class="btn-group-horizontal">${btns}</div>`;c.appendChild(div);});});};
window.eliminarAlbergue=async(id)=>{if(!confirm("⚠️ PELIGRO: Se borrará el albergue y TODAS las personas dentro.\n\n¿Estás seguro?"))return;try{const qP=query(collection(db,"albergues",id,"personas"));const snapP=await getDocs(qP);const promises=snapP.docs.map(doc=>deleteDoc(doc.ref));await Promise.all(promises);await deleteDoc(doc(db,"albergues",id));alert("Eliminado.");}catch(e){alert("Error: "+e.message);}};
window.toggleOcultarAlbergue=async(id,est)=>{await updateDoc(doc(db,"albergues",id),{oculto:est});};
window.abrirModalAlbergue=async(id=null)=>{albergueEdicionId=id;document.getElementById('modal-albergue').classList.remove('hidden');if(id){document.getElementById('mto-modal-title').innerText="Editar";const s=await getDoc(doc(db,"albergues",id));const d=s.data();document.getElementById('mto-nombre').value=d.nombre;document.getElementById('mto-capacidad').value=d.capacidad;document.getElementById('mto-columnas').value=d.columnas||8;}else{document.getElementById('mto-modal-title').innerText="Nuevo";document.getElementById('mto-nombre').value="";document.getElementById('mto-capacidad').value="";document.getElementById('mto-columnas').value="8";}};
window.guardarAlbergue=async()=>{const n=document.getElementById('mto-nombre').value;const c=parseInt(document.getElementById('mto-capacidad').value);const cols=parseInt(document.getElementById('mto-columnas').value)||8;if(!n||!c)return alert("Faltan datos");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:c,columnas:cols});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:c,columnas:cols,activo:true,fecha:new Date()});document.getElementById('modal-albergue').classList.add('hidden');};
window.cambiarEstadoAlbergue=async(i,s)=>await updateDoc(doc(db,"albergues",i),{activo:s});
window.cargarAlberguesActivos=()=>{const c=document.getElementById('lista-albergues-activos');unsubscribeAlberguesActivos=onSnapshot(query(collection(db,"albergues"),where("activo","==",true)),s=>{c.innerHTML="";s.forEach(d=>{const a=d.data();if(a.oculto && currentUserData.rol !== 'super_admin') return;c.innerHTML+=`<div class="mto-card" style="cursor:pointer;" onclick="entrarAlbergue('${d.id}')"><h3>${a.nombre}</h3><div class="mto-info">🛏️ Cap: <strong>${a.capacidad}</strong></div></div>`;});});}

// --- OPERATIVA ---
window.entrarAlbergue = (id) => { currentAlbergueId = id; navegar('operativa'); onSnapshot(doc(db, "albergues", id), d => { currentAlbergueData = d.data(); document.getElementById('app-title').innerText = currentAlbergueData.nombre; totalCapacidad = currentAlbergueData.capacidad || 0; actualizarContadores(); }); unsubscribePersonas = onSnapshot(query(collection(db, "albergues", id, "personas"), orderBy("fechaRegistro", "desc")), s => { listaPersonasCache = []; let c = 0; camasOcupadas = {}; s.forEach(ds => { const p = ds.data(); p.id = ds.id; listaPersonasCache.push(p); if (p.estado !== 'espera') { c++; if (p.cama) camasOcupadas[p.cama] = p.nombre; } }); ocupacionActual = c; actualizarContadores(); if (window.personaEnGestion) { const upd = listaPersonasCache.find(u => u.id === window.personaEnGestion.id); if (upd) seleccionarPersona(upd); } }); };

// --- QR ---
window.abrirModalQR = () => { document.getElementById('modal-qr').classList.remove('hidden'); const qrDiv = document.getElementById("qrcode-display"); if (qrDiv.innerHTML === "") { const u = window.location.href.split('?')[0] + `?public_id=${currentAlbergueId}`; new QRCode(qrDiv, { text: u, width: 250, height: 250 }); } };

window.abrirSeleccionCama=()=>{window.modoMapaGeneral=false;mostrarGridCamas();};window.abrirMapaGeneral=()=>{window.modoMapaGeneral=true;mostrarGridCamas();};
function mostrarGridCamas(){const g=document.getElementById('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};let famGroups={};listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});let myFamId,famMembers=[],assignedMembers=[],neededForMe=1;if(!window.modoMapaGeneral&&window.personaEnGestion){myFamId=window.personaEnGestion.familiaId;if(myFamId)famMembers=listaPersonasCache.filter(m=>m.familiaId===myFamId);else famMembers=[window.personaEnGestion];assignedMembers=famMembers.filter(m=>m.cama&&m.id!==window.personaEnGestion.id);neededForMe=famMembers.length-assignedMembers.length;}for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occupant=listaPersonasCache.find(p=>p.cama===n);const ocup=occupant?occupant.nombre:null;const d=document.createElement('div');let esMiCama=(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n);let classes="bed-box";let title="";if(esMiCama){classes+=" bed-current";title="Tu cama actual";}else if(ocup){classes+=" bed-busy";}else{classes+=" bed-free";title="Libre";if(shadowMap[n]){classes+=" bed-shadow";title="RESERVADA";}}if(!window.modoMapaGeneral&&!ocup&&!esMiCama){if(assignedMembers.length>0){if(shadowMap[n]===myFamId)classes+=" bed-suggest-target";}else{let fit=true;for(let k=0;k<neededForMe;k++){if(camasOcupadas[(i+k).toString()])fit=false;}if(fit&&neededForMe>1)classes+=" bed-suggest-block";}}d.className=classes;d.innerText=n;d.title=title;d.onclick=()=>{if(ocup)abrirModalInfoCama(occupant);else if(!window.modoMapaGeneral)guardarCama(n);};g.appendChild(d);}document.getElementById('modal-cama').classList.remove('hidden');}
window.abrirModalInfoCama=(p)=>{document.getElementById('info-cama-num').innerText=p.cama;document.getElementById('info-nombre-completo').innerText=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`;document.getElementById('info-telefono').innerText=p.telefono||"No consta";const famMembers=listaPersonasCache.filter(m=>m.familiaId===p.familiaId);const famTag=document.getElementById('info-familia-tag');if(famMembers.length>1){famTag.style.display='inline-block';famTag.innerText=`Familia de ${famMembers.length} Miembros`;}else{famTag.style.display='none';}document.getElementById('modal-bed-info').classList.remove('hidden');};
async function guardarCama(c){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:c,fechaIngreso:new Date()});document.getElementById('modal-cama').classList.add('hidden');}
window.liberarCamaMantener=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{cama:null});
window.regresarPrefiliacion=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'espera',cama:null});
