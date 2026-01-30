import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// VARS
let currentUserData=null, currentAlbergueId=null, currentAlbergueData=null, totalCapacidad=0, ocupacionActual=0, camasOcupadas={}, listaPersonasCache=[];
let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribeDetalleAlbergue, unsubscribePersonas;
window.personaSeleccionadaId=null; window.personaEnGestion=null; window.modoCambioCama=false; window.modoMapaGeneral=false;
let listaFamiliaresTemp=[], adminFamiliaresTemp=[], albergueEdicionId=null;
let prefiliacionEdicionId = null;
let isPublicMode = false;
let userEditingId = null;

// --- AUTH ---
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
window.recuperarContrasena=async()=>{const email=prompt("Email:");if(email)try{await sendPasswordResetEmail(auth,email);alert("Correo enviado.");}catch(e){alert(e.message);}};

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
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    if(unsubscribeUsers)unsubscribeUsers();if(unsubscribeAlberguesActivos)unsubscribeAlberguesActivos();if(unsubscribeAlberguesMto)unsubscribeAlberguesMto();if(unsubscribePersonas)unsubscribePersonas();
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    
    if(p==='home'){
        document.getElementById('screen-home').classList.remove('hidden');
        document.getElementById('nav-home').classList.add('active');
    }else if(p==='usuarios'){
        const c=document.getElementById('lista-usuarios-container');if(c)c.innerHTML="";
        document.getElementById('search-user').value="";
        document.getElementById('screen-usuarios').classList.remove('hidden');
        document.getElementById('nav-users').classList.add('active');
    }else if(p==='gestion-albergues'){
        window.cargarAlberguesActivos();
        document.getElementById('screen-gestion-albergues').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
    }else if(p==='mantenimiento'){
        window.cargarAlberguesMantenimiento();
        document.getElementById('screen-mantenimiento').classList.remove('hidden');
        document.getElementById('nav-mto').classList.add('active');
    }else if(p==='operativa'){
        document.getElementById('screen-operativa').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
        window.cambiarPestana('prefiliacion');
    }
};

function configurarDashboard(){
    document.getElementById('user-name-display').innerText=currentUserData.nombre;const r=currentUserData.rol;
    document.getElementById('user-role-badge').innerText=r.toUpperCase();document.getElementById('user-role-badge').className=`role-badge role-${r}`;
    const u=document.getElementById('nav-users'),m=document.getElementById('nav-mto');
    if(['super_admin','admin'].includes(r))u.classList.remove('disabled');else u.classList.add('disabled');
    if(['super_admin','admin','avanzado'].includes(r))m.classList.remove('disabled');else m.classList.add('disabled');
    if(r==='super_admin') document.getElementById('container-ver-ocultos').classList.remove('hidden');
}

window.cambiarPestana=(t)=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c=>{c.classList.remove('active');c.classList.add('hidden');c.style.display='none';});
    if(t==='prefiliacion'){
        document.getElementById('btn-tab-pref').classList.add('active');
        const p=document.getElementById('tab-prefiliacion');p.classList.remove('hidden');p.style.display='block';setTimeout(()=>p.classList.add('active'),10);
        limpiarFormulario('man');adminFamiliaresTemp=[];actualizarListaFamiliaresAdminUI();
        document.getElementById('panel-gestion-persona').classList.add('hidden');
        window.cancelarEdicionPref();
    }else{
        document.getElementById('btn-tab-fil').classList.add('active');
        const f=document.getElementById('tab-filiacion');f.classList.remove('hidden');f.style.display='block';setTimeout(()=>f.classList.add('active'),10);
        document.getElementById('buscador-persona').value="";document.getElementById('resultados-busqueda').style.display='none';
        document.getElementById('panel-gestion-persona').classList.add('hidden');
    }
};

// --- UTILS ---
window.formatearFecha=(i)=>{let v=i.value.replace(/\D/g,'').slice(0,8);if(v.length>=5)i.value=`${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;else if(v.length>=3)i.value=`${v.slice(0,2)}/${v.slice(2)}`;else i.value=v;};
window.verificarMenor=(p)=>{const t=document.getElementById(`${p}-tipo-doc`).value;const i=document.getElementById(`${p}-doc-num`);if(t==='MENOR'){i.value="MENOR-SIN-DNI";i.disabled=true;i.classList.remove('input-error');if(document.getElementById(`${p}-doc-error`))document.getElementById(`${p}-doc-error`).style.display='none';}else{i.disabled=false;if(i.value==="MENOR-SIN-DNI")i.value="";}};
window.validarEdad=(p)=>{const f=document.getElementById(`${p}-fecha`).value;const e=document.getElementById(`${p}-fecha-error`);const t=document.getElementById(`${p}-tipo-doc`).value;if(f.length!==10){if(e)e.style.display='none';return true;}const [d,m,a]=f.split('/').map(Number);const nac=new Date(a,m-1,d);const hoy=new Date();let ed=hoy.getFullYear()-nac.getFullYear();if(hoy<new Date(hoy.getFullYear(),m-1,d))ed--;if(t==='MENOR'&&ed>=16){if(e){e.innerText=">16 requiere DNI";e.style.display='block';}return false;}if(e)e.style.display='none';return true;};
window.validarDocumento=(p)=>{const t=document.getElementById(`${p}-tipo-doc`).value;const i=document.getElementById(`${p}-doc-num`);const e=document.getElementById(`${p}-doc-error`);if(t==='MENOR'||!i.value)return true;let v=i.value.toUpperCase();i.value=v;let ok=true;if(t==='PASAPORTE')ok=v.length>3;else{const l="TRWAGMYFPDXBNJZSQVHLCKE";let n=v;let letIn=v.slice(-1);if(t==='NIE'){if(v.startsWith('X'))n='0'+v.slice(1);else if(v.startsWith('Y'))n='1'+v.slice(1);else if(v.startsWith('Z'))n='2'+v.slice(1);else ok=false;}if(ok){const num=parseInt(n.slice(0,-1));if(isNaN(num))ok=false;else{if(l[num%23]!==letIn)ok=false;}}}if(!ok){i.classList.add('input-error');if(e)e.style.display='block';return false;}else{i.classList.remove('input-error');if(e)e.style.display='none';return true;}};
function limpiarFormulario(p){['nombre','ap1','ap2','doc-num','fecha','tel'].forEach(f=>document.getElementById(`${p}-${f}`).value="");document.getElementById(`${p}-doc-num`).classList.remove('input-error');document.getElementById(`${p}-doc-num`).disabled=false;document.getElementById(`${p}-tipo-doc`).value="DNI";}

function safeVal(id){const el=document.getElementById(id);return el?el.value:"";}
function safeSet(id,val){const el=document.getElementById(id);if(el)el.value=val;}
function getDatosFormulario(p){return{nombre:safeVal(`${p}-nombre`),ap1:safeVal(`${p}-ap1`),ap2:safeVal(`${p}-ap2`),tipoDoc:safeVal(`${p}-tipo-doc`),docNum:safeVal(`${p}-doc-num`),fechaNac:safeVal(`${p}-fecha`),telefono:safeVal(`${p}-tel`)};}

// --- FAMILIA Y FUSION (FIX V10.1) ---
window.abrirModalVincularFamilia=()=>{document.getElementById('modal-vincular-familia').classList.remove('hidden');document.getElementById('search-vincular').value="";document.getElementById('resultados-vincular').innerHTML="";};
window.buscarParaVincular=()=>{
    const txt=document.getElementById('search-vincular').value.toLowerCase();const res=document.getElementById('resultados-vincular');res.innerHTML="";
    if(txt.length<2){res.style.display='none';return;}
    const hits=listaPersonasCache.filter(p=>p.id!==window.personaEnGestion.id && (p.nombre+" "+(p.ap1||"")+" "+(p.docNum||"")).toLowerCase().includes(txt));
    if(hits.length===0){res.innerHTML="<div class='search-item' style='color:#999;'>No hay coincidencias.</div>";res.style.display='block';}
    else{res.style.display='block';hits.forEach(p=>{const d=document.createElement('div');d.className='search-item';d.innerHTML=`<strong>${p.nombre}</strong> (${p.docNum||'-'})`;d.onclick=()=>window.vincularAFamilia(p);res.appendChild(d);});}
};
window.vincularAFamilia = async (target) => {
    if (!confirm(`¿Unir a ${window.personaEnGestion.nombre} con ${target.nombre}?`)) return;
    
    // Lógica: "Yo me traigo a los demás a mi familia". Si no tengo, la creo.
    let myFamId = window.personaEnGestion.familiaId;
    let targetFamId = target.familiaId;
    let finalFamId = myFamId;

    const batch = writeBatch(db);

    // Si yo no tengo familia, creo una y me la asigno
    if (!finalFamId) {
        finalFamId = new Date().getTime().toString() + "-FAM";
        const myRef = doc(db, "albergues", currentAlbergueId, "personas", window.personaEnGestion.id);
        batch.update(myRef, { familiaId: finalFamId, rolFamilia: 'TITULAR' });
    }

    // Buscamos a TODOS los que estén en la familia del objetivo (incluido él)
    // Si el objetivo no tiene familiaId, es solo él.
    let personasAmover = [target];
    if (targetFamId) {
        const otrosMiembros = listaPersonasCache.filter(p => p.familiaId === targetFamId);
        personasAmover = [...otrosMiembros];
    }
    
    // Eliminamos duplicados
    personasAmover = [...new Map(personasAmover.map(item => [item.id, item])).values()];

    // Actualizamos a todos ellos para que apunten a MI familia
    personasAmover.forEach(p => {
        if(p.id !== window.personaEnGestion.id){ // Evitar autoupdate innecesario
            const ref = doc(db, "albergues", currentAlbergueId, "personas", p.id);
            batch.update(ref, { familiaId: finalFamId, rolFamilia: 'MIEMBRO' });
        }
    });

    try {
        await batch.commit();
        alert("Familias fusionadas.");
        document.getElementById('modal-vincular-familia').classList.add('hidden');
        // Refrescar para ver los cambios
        if(window.personaEnGestion) seleccionarPersona(window.personaEnGestion);
    } catch (e) { alert("Error: " + e.message); }
};

window.abrirModalFamiliar=()=>{limpiarFormulario('fam');document.getElementById('modal-add-familiar').classList.remove('hidden');document.getElementById('fam-tipo-doc').value="MENOR";window.verificarMenor('fam');};window.cerrarModalFamiliar=()=>document.getElementById('modal-add-familiar').classList.add('hidden');
window.guardarFamiliarEnLista=()=>{
    // FIX QR
    const tDoc=document.getElementById('fam-tipo-doc').value;
    if(tDoc!=='MENOR'){if(!window.validarDocumento('fam'))return alert("Doc inválido");}
    const d=getDatosFormulario('fam');if(!d.nombre)return alert("Falta nombre");
    listaFamiliaresTemp.push(d);actualizarListaFamiliaresUI();window.cerrarModalFamiliar();
};
function actualizarListaFamiliaresUI(){const d=document.getElementById('lista-familiares-ui');d.innerHTML="";if(listaFamiliaresTemp.length===0){d.innerHTML='<p style="color:#999;">Ninguno.</p>';return;}listaFamiliaresTemp.forEach((f,i)=>{d.innerHTML+=`<div class="fam-item"><div>${f.nombre}</div><button class="danger" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`;});}window.borrarFamiliarTemp=(i)=>{listaFamiliaresTemp.splice(i,1);actualizarListaFamiliaresUI();};

window.abrirModalFamiliarAdmin=()=>{limpiarFormulario('adm-fam');document.getElementById('modal-admin-add-familiar').classList.remove('hidden');document.getElementById('adm-fam-tipo-doc').value="MENOR";window.verificarMenor('adm-fam');};window.cerrarModalFamiliarAdmin=()=>document.getElementById('modal-admin-add-familiar').classList.add('hidden');
window.guardarFamiliarAdmin=()=>{
    const tDoc=document.getElementById('adm-fam-tipo-doc').value;
    if(tDoc!=='MENOR'){if(!window.validarDocumento('adm-fam'))return alert("Doc inválido");}
    const d=getDatosFormulario('adm-fam');if(!d.nombre)return alert("Falta nombre");
    adminFamiliaresTemp.push(d);actualizarListaFamiliaresAdminUI();window.cerrarModalFamiliarAdmin();
};
function actualizarListaFamiliaresAdminUI(){const d=document.getElementById('admin-lista-familiares-ui');d.innerHTML="";if(adminFamiliaresTemp.length===0){d.innerHTML='<p style="color:#999;">Ninguno.</p>';return;}adminFamiliaresTemp.forEach((f,i)=>{d.innerHTML+=`<div class="fam-item"><div>${f.nombre}</div><button class="danger" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`;});}window.borrarFamiliarAdminTemp=(i)=>{adminFamiliaresTemp.splice(i,1);actualizarListaFamiliaresAdminUI();};

// --- PREFILIACION ---
window.buscarEnPrefiliacion=()=>{
    const txt=document.getElementById('buscador-pref').value.toLowerCase();const res=document.getElementById('resultados-pref');res.innerHTML="";if(txt.length<2){res.style.display='none';return;}
    const hits=listaPersonasCache.filter(p=>p.estado==='espera' && (p.nombre+" "+(p.ap1||"")+" "+(p.docNum||"")).toLowerCase().includes(txt));
    if(hits.length===0){res.innerHTML="<div class='search-item'>Sin resultados</div>";res.style.display='block';}
    else{res.style.display='block';hits.forEach(p=>{const d=document.createElement('div');d.className='search-item';d.innerHTML=`<strong>${p.nombre}</strong>`;d.onclick=()=>window.cargarParaEdicionPref(p);res.appendChild(d);});}
};
window.cargarParaEdicionPref=(p)=>{
    prefiliacionEdicionId=p.id;document.getElementById('resultados-pref').style.display='none';document.getElementById('buscador-pref').value="";
    safeSet('man-nombre',p.nombre);safeSet('man-ap1',p.ap1);safeSet('man-ap2',p.ap2);safeSet('man-tipo-doc',p.tipoDoc);safeSet('man-doc-num',p.docNum);safeSet('man-fecha',p.fechaNac);safeSet('man-tel',p.telefono);
    window.verificarMenor('man');
    document.getElementById('btn-save-pref').innerText="🔄 Actualizar";document.getElementById('btn-save-pref').className="warning";document.getElementById('btn-cancelar-edicion-pref').classList.remove('hidden');
};
window.cancelarEdicionPref=()=>{prefiliacionEdicionId=null;limpiarFormulario('man');document.getElementById('btn-save-pref').innerText="💾 Guardar Nuevo";document.getElementById('btn-save-pref').className="success";document.getElementById('btn-cancelar-edicion-pref').classList.add('hidden');};
window.adminPrefiliarManual=async()=>{
    if(!window.validarDocumento('man'))return alert("Revise documentos");const t=getDatosFormulario('man');if(!t.nombre)return alert("Falta nombre");
    try{
        if(prefiliacionEdicionId){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",prefiliacionEdicionId),t);alert("Actualizado");window.cancelarEdicionPref();}
        else{const famId=new Date().getTime().toString();await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...t,estado:'espera',fechaRegistro:new Date(),origen:'manual',familiaId:famId,rolFamilia:'TITULAR'});if(adminFamiliaresTemp.length>0){for(const f of adminFamiliaresTemp)await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',fechaRegistro:new Date(),origen:'manual',familiaId:famId,rolFamilia:'MIEMBRO'});}alert("Registrado");limpiarFormulario('man');adminFamiliaresTemp=[];actualizarListaFamiliaresAdminUI();}
    }catch(e){alert(e.message);}
};

// --- FILIACION ---
window.buscarPersonaEnAlbergue=()=>{
    const i=document.getElementById('buscador-persona').value.toLowerCase();const r=document.getElementById('resultados-busqueda');if(i.length<2){r.style.display='none';return;}
    const h=listaPersonasCache.filter(p=>(p.nombre+" "+(p.ap1||"")+" "+(p.docNum||"")).toLowerCase().includes(i));r.innerHTML="";
    if(h.length>0){r.style.display='block';h.forEach(p=>{const d=document.createElement('div');d.className='search-item';d.innerHTML=`<strong>${p.nombre}</strong> (${p.estado})`;d.onclick=()=>{seleccionarPersona(p);r.style.display='none';document.getElementById('buscador-persona').value="";};r.appendChild(d);});}else r.style.display='none';
};

function seleccionarPersona(p){
    window.personaEnGestion=p;window.personaSeleccionadaId=p.id;
    const panel=document.getElementById('panel-gestion-persona');panel.classList.remove('hidden');panel.style.display='block';panel.scrollIntoView({behavior:"smooth", block:"center"});
    document.getElementById('gestion-nombre-titulo').innerText=p.nombre;
    safeSet('edit-nombre',p.nombre);safeSet('edit-ap1',p.ap1);safeSet('edit-ap2',p.ap2);safeSet('edit-tipo-doc',p.tipoDoc);safeSet('edit-doc-num',p.docNum);safeSet('edit-fecha',p.fechaNac);safeSet('edit-tel',p.telefono);
    window.verificarMenor('edit');
    
    // Fam List
    let fid=p.familiaId; let members=fid?listaPersonasCache.filter(x=>x.familiaId===fid):[p];
    document.getElementById('info-familia-resumen').innerText=members.length>1?`Familia (${members.length})`:"Individual";
    const cl=document.getElementById('info-familia-lista');cl.innerHTML="";
    if(members.length>1){members.forEach(m=>{const d=document.createElement('div');d.style.padding="5px";d.style.borderBottom="1px solid #eee";d.style.cursor="pointer";d.innerHTML=`${m.nombre} <small>(${m.estado==='ingresado'?'DENTRO':'FUERA'})</small>`;if(m.id!==p.id)d.onclick=()=>seleccionarPersona(m);cl.appendChild(d);});}
    
    // Btns
    const b1=document.getElementById('btn-asignar-cama'),b2=document.getElementById('btn-liberar-cama'),b3=document.getElementById('btn-regresar-pref');
    b1.classList.add('hidden');b2.classList.add('hidden');b3.classList.add('hidden');
    if(p.estado==='espera'){b1.innerText="Ingresar";b1.classList.remove('hidden');}
    else{b1.innerText="Cambiar Cama";b1.classList.remove('hidden');b2.classList.remove('hidden');b3.classList.remove('hidden');}
    document.getElementById('gestion-cama-info').innerText=p.cama?`Cama: ${p.cama}`:"Sin cama";
}

// --- UTILS ---
window.publicoGuardarTodo=async()=>{if(!window.validarDocumento('pub'))return alert("Revise titular");const t=getDatosFormulario('pub');if(!t.nombre)return alert("Falta nombre");try{const fid=new Date().getTime().toString();await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...t,estado:'espera',fechaRegistro:new Date(),origen:'qr',familiaId:fid,rolFamilia:'TITULAR'});if(listaFamiliaresTemp.length>0){for(const f of listaFamiliaresTemp)await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{...f,estado:'espera',fechaRegistro:new Date(),origen:'qr',familiaId:fid,rolFamilia:'MIEMBRO'});}document.getElementById('public-form-container').classList.add('hidden');document.getElementById('public-success-msg').classList.remove('hidden');}catch(e){alert(e.message);}};
window.abrirModalQR=()=>{document.getElementById('modal-qr').classList.remove('hidden');const d=document.getElementById("qrcode-display");if(d.innerHTML===""){new QRCode(d,{text:window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`,width:250,height:250});}};
window.abrirCrearUsuario=async(id=null)=>{userEditingId=id;document.getElementById('modal-crear-usuario').classList.remove('hidden');const sel=document.getElementById('new-user-role');sel.innerHTML="";const r=currentUserData.rol;if(r==='super_admin'){['super_admin','admin','avanzado','medio'].forEach(o=>sel.add(new Option(o.toUpperCase(),o)));}else if(r==='admin'){['avanzado','medio'].forEach(o=>sel.add(new Option(o.toUpperCase(),o)));}if(id){const s=await getDoc(doc(db,"usuarios",id));if(s.exists()){const d=s.data();safeSet('new-user-name',d.nombre);safeSet('new-user-email',d.email);sel.value=d.rol;}}else{safeSet('new-user-name',"");safeSet('new-user-email',"");}};
window.guardarUsuario=async()=>{const n=document.getElementById('new-user-name').value;const e=document.getElementById('new-user-email').value;const p=document.getElementById('new-user-pass').value;const r=document.getElementById('new-user-role').value;if(!n||!r)return alert("Faltan datos");if(userEditingId){await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});alert("Actualizado");}else{if(!e||!p)return alert("Falta email/pass");try{const tApp=initializeApp(firebaseConfig,"Temp");const tAuth=getAuth(tApp);const uc=await createUserWithEmailAndPassword(tAuth,e,p);await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});await signOut(tAuth);alert("Creado");}catch(x){alert(x.message);}}document.getElementById('modal-crear-usuario').classList.add('hidden');window.cargarUsuarios();};
window.cargarUsuarios=(f="")=>{const c=document.getElementById('lista-usuarios-container');if(!f){c.innerHTML="";return;}unsubscribeUsers=onSnapshot(query(collection(db,"usuarios"),orderBy("nombre")),s=>{c.innerHTML="";s.forEach(d=>{const u=d.data();if(f&&!u.nombre.toLowerCase().includes(f))return;c.innerHTML+=`<div class="user-card-item"><div>${u.nombre}<br><small>${u.email}</small></div><button class="secondary" onclick="window.abrirModalUsuario('${d.id}')">✏️</button></div>`;});});};
window.filtrarUsuarios=()=>{window.cargarUsuarios(document.getElementById('search-user').value.toLowerCase());};
window.cargarAlberguesMantenimiento=()=>{const c=document.getElementById('mto-container');unsubscribeAlberguesMto=onSnapshot(query(collection(db,"albergues"),orderBy("nombre")),s=>{c.innerHTML="<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";s.forEach(d=>{const a=d.data();c.innerHTML+=`<div class="mto-card"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">✏️</button></div>`;});});};
window.abrirModalAlbergue=async(id=null)=>{albergueEdicionId=id;document.getElementById('modal-albergue').classList.remove('hidden');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();safeSet('mto-nombre',d.nombre);safeSet('mto-capacidad',d.capacidad);}else{safeSet('mto-nombre',"");safeSet('mto-capacidad',"");}};
window.guardarAlbergue=async()=>{const n=document.getElementById('mto-nombre').value;const c=document.getElementById('mto-capacidad').value;if(!n||!c)return alert("Datos");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c)});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),activo:true});document.getElementById('modal-albergue').classList.add('hidden');};
window.cargarAlberguesActivos=()=>{const c=document.getElementById('lista-albergues-activos');unsubscribeAlberguesActivos=onSnapshot(query(collection(db,"albergues"),where("activo","==",true)),s=>{c.innerHTML="";s.forEach(d=>{const a=d.data();c.innerHTML+=`<div class="mto-card" onclick="window.entrarAlbergue('${d.id}')"><h3>${a.nombre}</h3></div>`;});});};
window.entrarAlbergue=(id)=>{currentAlbergueId=id;window.navegar('operativa');onSnapshot(doc(db,"albergues",id),d=>{currentAlbergueData=d.data();document.getElementById('app-title').innerText=currentAlbergueData.nombre;totalCapacidad=currentAlbergueData.capacidad||0;actualizarContadores();});unsubscribePersonas=onSnapshot(query(collection(db,"albergues",id,"personas")),s=>{listaPersonasCache=[];let c=0;camasOcupadas={};s.forEach(ds=>{const p=ds.data();p.id=ds.id;listaPersonasCache.push(p);if(p.estado!=='espera'){c++;if(p.cama)camasOcupadas[p.cama]=p.nombre;}});ocupacionActual=c;actualizarContadores();if(window.personaEnGestion){const upd=listaPersonasCache.find(u=>u.id===window.personaEnGestion.id);if(upd)seleccionarPersona(upd);}});};
function actualizarContadores(){document.getElementById('ocupacion-count').innerText=ocupacionActual;document.getElementById('capacidad-total').innerText=totalCapacidad;}
window.abrirSeleccionCama=()=>{document.getElementById('modal-cama').classList.remove('hidden');const g=document.getElementById('grid-camas');g.innerHTML="";for(let i=1;i<=totalCapacidad;i++){const d=document.createElement('div');d.className=camasOcupadas[i]?"bed-box bed-busy":"bed-box bed-free";d.innerText=i;if(!camasOcupadas[i])d.onclick=()=>{guardarCama(i);};g.appendChild(d);}};
window.abrirMapaGeneral=()=>{window.abrirSeleccionCama();};
async function guardarCama(c){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});document.getElementById('modal-cama').classList.add('hidden');}
window.liberarCamaMantener=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{cama:null});
window.regresarPrefiliacion=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'espera',cama:null});
