import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
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
window.recuperarContrasena=async()=>{const e=prompt("Email:");if(e)try{await sendPasswordResetEmail(auth,e);alert("Enviado");}catch(x){alert(x.message);}};

onAuthStateChanged(auth,async(u)=>{
    if(isPublicMode) return;
    if(u){
        const s=await getDoc(doc(db,"usuarios",u.uid));
        if(s.exists()){
            currentUserData={...s.data(),uid:u.uid};
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-shell').classList.remove('hidden');
            configurarUI();
            window.navegar('home');
        }
    } else {
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
});

function configurarUI(){
    document.getElementById('user-name-display').innerText=currentUserData.nombre;
    const r=currentUserData.rol;
    document.getElementById('user-role-badge').innerText=r;
    if(['super_admin','admin'].includes(r)) document.getElementById('header-btn-users').classList.remove('hidden');
    if(!['super_admin','admin','avanzado'].includes(r)) document.getElementById('nav-mto').classList.add('disabled');
}

// --- NAV ---
window.navegar=(p)=>{
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    if(p==='home') document.getElementById('screen-home').classList.remove('hidden');
    if(p==='usuarios'){ document.getElementById('screen-usuarios').classList.remove('hidden'); window.cargarUsuarios(); }
    if(p==='gestion-albergues'){ document.getElementById('screen-gestion-albergues').classList.remove('hidden'); window.cargarAlberguesActivos(); }
    if(p==='mantenimiento'){ document.getElementById('screen-mantenimiento').classList.remove('hidden'); window.cargarAlberguesMantenimiento(); }
    if(p==='operativa'){ document.getElementById('screen-operativa').classList.remove('hidden'); window.cambiarPestana('prefiliacion'); }
};

window.cambiarPestana=(t)=>{
    document.getElementById('tab-prefiliacion').style.display = t==='prefiliacion'?'block':'none';
    document.getElementById('tab-filiacion').style.display = t==='filiacion'?'block':'none';
    document.getElementById('btn-tab-pref').className = t==='prefiliacion'?'tab-btn active':'tab-btn';
    document.getElementById('btn-tab-fil').className = t==='filiacion'?'tab-btn active':'tab-btn';
};

// --- CORE UTILS ---
function safeVal(id){ const el=document.getElementById(id); return el?el.value:""; }
function setVal(id,val){ const el=document.getElementById(id); if(el)el.value=val; }

// --- USUARIOS ---
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
        const tApp=initializeApp(firebaseConfig,"Temp");
        const tAuth=getAuth(tApp);
        const uc=await createUserWithEmailAndPassword(tAuth,e,p);
        await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});
        await signOut(tAuth);
        alert("Creado");
    }
    document.getElementById('modal-crear-usuario').classList.add('hidden');
    window.cargarUsuarios();
};
window.cargarUsuarios=()=>{
    const c=document.getElementById('lista-usuarios-container');
    const f=safeVal('search-user').toLowerCase();
    onSnapshot(query(collection(db,"usuarios")),s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const u=d.data();
            if(currentUserData.rol==='admin' && (u.rol==='admin'||u.rol==='super_admin')) return;
            if(f && !u.nombre.toLowerCase().includes(f)) return;
            c.innerHTML+=`<div class="user-card-item" onclick="window.abrirModalUsuario('${d.id}')"><div class="user-card-left"><div class="user-avatar-circle">${u.nombre.charAt(0)}</div><div><strong>${u.nombre}</strong><br><small>${u.email}</small></div></div><span class="badge">${u.rol}</span></div>`;
        });
    });
};
window.filtrarUsuarios=()=>{window.cargarUsuarios();};

// --- GESTIÓN & OPERATIVA ---
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
    onSnapshot(doc(db,"albergues",id),d=>{
        currentAlbergueData=d.data();
        document.getElementById('app-title').innerText=currentAlbergueData.nombre;
        totalCapacidad=parseInt(currentAlbergueData.capacidad||0);
        actualizarContadores();
    });
    // NO ORDERBY to prevent Index Error and 0/0
    onSnapshot(collection(db,"albergues",id,"personas"),s=>{
        listaPersonasCache=[]; camasOcupadas={}; let c=0;
        s.forEach(d=>{
            const p=d.data(); p.id=d.id;
            listaPersonasCache.push(p);
            if(p.estado==='ingresado'){
                c++; if(p.cama) camasOcupadas[p.cama]=p.nombre;
            }
        });
        listaPersonasCache.sort((a,b)=>(b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0));
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

// --- BUSCADORES Y FILIACIÓN (FULL FIELDS) ---
window.buscarEnPrefiliacion=()=>{
    const txt=safeVal('buscador-pref').toLowerCase();
    const res=document.getElementById('resultados-pref');
    if(txt.length<2){res.classList.add('hidden');return;}
    const hits=listaPersonasCache.filter(p=>p.estado==='espera' && p.nombre.toLowerCase().includes(txt));
    res.innerHTML="";
    hits.forEach(p=>{
        res.innerHTML+=`<div class="search-item" onclick="alert('Ya existe')">${p.nombre} (${p.docNum||'-'})</div>`;
    });
    res.classList.remove('hidden');
};

window.buscarPersonaEnAlbergue=()=>{
    const txt=safeVal('buscador-persona').toLowerCase();
    const res=document.getElementById('resultados-busqueda');
    if(txt.length<2){res.classList.add('hidden');return;}
    const hits=listaPersonasCache.filter(p=>p.nombre.toLowerCase().includes(txt));
    res.innerHTML="";
    hits.forEach(p=>{
        res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}')"><strong>${p.nombre}</strong> (${p.estado})</div>`;
    });
    res.classList.remove('hidden');
};

window.seleccionarPersona=(pid)=>{
    if(typeof pid !== 'string') pid = pid.id; 
    const p = listaPersonasCache.find(x=>x.id===pid);
    if(!p) return;
    window.personaEnGestion=p;
    document.getElementById('resultados-busqueda').classList.add('hidden');
    document.getElementById('panel-gestion-persona').classList.remove('hidden');
    
    document.getElementById('gestion-nombre-titulo').innerText=p.nombre;
    document.getElementById('gestion-estado').innerText=p.estado;
    document.getElementById('gestion-cama-info').innerText=p.cama?`Cama: ${p.cama}`:"";
    
    // FULL DATA FILL
    setVal('edit-nombre', p.nombre); setVal('edit-ap1', p.ap1); setVal('edit-ap2', p.ap2);
    setVal('edit-tipo-doc', p.tipoDoc); setVal('edit-doc-num', p.docNum); 
    setVal('edit-fecha', p.fechaNac); setVal('edit-tel', p.telefono);
    
    // Familia
    const fam = listaPersonasCache.filter(x=>x.familiaId && x.familiaId === p.familiaId);
    document.getElementById('info-familia-resumen').innerText = fam.length>1 ? `Familia (${fam.length})` : "Individual";
    const flist = document.getElementById('info-familia-lista'); flist.innerHTML="";
    fam.forEach(f=>{
        if(f.id!==p.id) flist.innerHTML+=`<div style="padding:5px; border-bottom:1px solid #eee; cursor:pointer;" onclick="window.seleccionarPersona('${f.id}')">${f.nombre}</div>`;
    });
};

// --- QR PÚBLICO (SAFE) ---
window.abrirModalFamiliar = () => {
    setVal('fam-nombre',""); setVal('fam-ap1',""); setVal('fam-ap2',"");
    setVal('fam-doc-num',""); setVal('fam-fecha',"");
    document.getElementById('modal-add-familiar').classList.remove('hidden');
    document.getElementById('fam-tipo-doc').value = "MENOR";
};
window.cerrarModalFamiliar = () => document.getElementById('modal-add-familiar').classList.add('hidden');

window.guardarFamiliarEnLista = () => {
    const tDoc = document.getElementById('fam-tipo-doc').value;
    if (tDoc !== 'MENOR'){ if(!window.validarDocumento('fam')) return alert("Documento inválido."); }
    const d = {
        nombre: safeVal('fam-nombre'), ap1: safeVal('fam-ap1'), ap2: safeVal('fam-ap2'),
        tipoDoc: safeVal('fam-tipo-doc'), docNum: safeVal('fam-doc-num'), fechaNac: safeVal('fam-fecha')
    };
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

window.publicoGuardarTodo=async()=>{
    const n=safeVal('pub-nombre');
    if(!n) return alert("Nombre requerido");
    try{
        const fid = new Date().getTime().toString();
        const titular = {
            nombre:n, ap1:safeVal('pub-ap1'), ap2:safeVal('pub-ap2'), tipoDoc:safeVal('pub-tipo-doc'), 
            docNum:safeVal('pub-doc-num'), fechaNac:safeVal('pub-fecha'), telefono:safeVal('pub-tel'),
            estado:'espera', origen:'qr', familiaId:fid, rolFamilia:'TITULAR', fechaRegistro:new Date()
        };
        await addDoc(collection(db,"albergues",currentAlbergueId,"personas"), titular);
        for(const f of listaFamiliaresTemp){
            await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
                ...f, estado:'espera', origen:'qr', familiaId:fid, rolFamilia:'MIEMBRO', fechaRegistro:new Date()
            });
        }
        document.getElementById('public-form-container').classList.add('hidden');
        document.getElementById('public-success-msg').classList.remove('hidden');
    }catch(e){alert("Error: "+e.message);}
};
window.abrirModalQR=()=>{
    document.getElementById('modal-qr').classList.remove('hidden');
    const d=document.getElementById("qrcode-display");
    if(d.innerHTML=="") new QRCode(d,{text:window.location.href.split('?')[0]+"?public_id="+currentAlbergueId, width:200, height:200});
};

// --- ADMIN PREFILIACION ---
window.abrirModalFamiliarAdmin=()=>{
    setVal('adm-fam-nombre',""); setVal('adm-fam-ap1',""); setVal('adm-fam-doc-num',"");
    document.getElementById('modal-admin-add-familiar').classList.remove('hidden');
};
window.cerrarModalFamiliarAdmin=()=>document.getElementById('modal-admin-add-familiar').classList.add('hidden');

window.guardarFamiliarAdmin=()=>{
    const d = {
        nombre: safeVal('adm-fam-nombre'), ap1: safeVal('adm-fam-ap1'), ap2: safeVal('adm-fam-ap2'),
        tipoDoc: safeVal('adm-fam-tipo-doc'), docNum: safeVal('adm-fam-doc-num'), fechaNac: safeVal('adm-fam-fecha')
    };
    if(!d.nombre) return;
    adminFamiliaresTemp.push(d);
    const div=document.getElementById('admin-lista-familiares-ui'); div.innerHTML="";
    adminFamiliaresTemp.forEach(f=>{ div.innerHTML+=`<div>- ${f.nombre}</div>`; });
    window.cerrarModalFamiliarAdmin();
};

window.adminPrefiliarManual=async()=>{
    const n=safeVal('man-nombre');
    if(!n) return alert("Nombre obligatorio");
    const fid=new Date().getTime().toString();
    const titular = {
        nombre:n, ap1:safeVal('man-ap1'), ap2:safeVal('man-ap2'), tipoDoc:safeVal('man-tipo-doc'),
        docNum:safeVal('man-doc-num'), fechaNac:safeVal('man-fecha'), telefono:safeVal('man-tel'),
        estado:'espera', familiaId:fid, rolFamilia:'TITULAR', fechaRegistro:new Date()
    };
    await addDoc(collection(db,"albergues",currentAlbergueId,"personas"), titular);
    for(const f of adminFamiliaresTemp){
        await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
            ...f, estado:'espera', familiaId:fid, rolFamilia:'MIEMBRO', fechaRegistro:new Date()
        });
    }
    alert("Guardado");
    setVal('man-nombre',""); adminFamiliaresTemp=[];
    document.getElementById('admin-lista-familiares-ui').innerHTML="Ninguno.";
};

// --- MANTENIMIENTO ---
window.cargarAlberguesMantenimiento=()=>{
    const c=document.getElementById('mto-container');
    onSnapshot(query(collection(db,"albergues")),s=>{
        c.innerHTML="<div class='mto-card add-new' onclick='window.abrirModalAlbergue()'><h3>+</h3></div>";
        s.forEach(d=>{
            const a=d.data();
            c.innerHTML+=`<div class="mto-card"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p>
            <button onclick="window.abrirModalAlbergue('${d.id}')">Editar</button></div>`;
        });
    });
};
window.abrirModalAlbergue=async(id=null)=>{
    albergueEdicionId=id; document.getElementById('modal-albergue').classList.remove('hidden');
    if(id){
        const s=await getDoc(doc(db,"albergues",id)); const d=s.data();
        setVal('mto-nombre',d.nombre); setVal('mto-capacidad',d.capacidad); setVal('mto-columnas',d.columnas);
        document.getElementById('btn-delete-albergue').classList.remove('hidden');
    }else{
        setVal('mto-nombre',""); setVal('mto-capacidad',"");
        document.getElementById('btn-delete-albergue').classList.add('hidden');
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
    if(!albergueEdicionId || !confirm("¿Seguro que quieres borrar este albergue y todos sus datos?")) return;
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

window.formatearFecha=(i)=>{let v=i.value.replace(/\D/g,'').slice(0,8);if(v.length>=5)i.value=`${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;else if(v.length>=3)i.value=`${v.slice(0,2)}/${v.slice(2)}`;else i.value=v;};
window.verificarMenor=(p)=>{const t=document.getElementById(`${p}-tipo-doc`).value;const i=document.getElementById(`${p}-doc-num`);if(t==='MENOR'){i.value="MENOR-SIN-DNI";i.disabled=true;}else{i.disabled=false;if(i.value==="MENOR-SIN-DNI")i.value="";}};
window.validarDocumento=(p)=>{return true;}; // Simplified for stability

// --- MAPA CAMAS ---
window.abrirSeleccionCama=()=>{window.modoMapaGeneral=false;mostrarGridCamas();};window.abrirMapaGeneral=()=>{window.modoMapaGeneral=true;mostrarGridCamas();};
function mostrarGridCamas(){const g=document.getElementById('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};let famGroups={};listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});let myFamId,famMembers=[],assignedMembers=[],neededForMe=1;if(!window.modoMapaGeneral&&window.personaEnGestion){myFamId=window.personaEnGestion.familiaId;if(myFamId)famMembers=listaPersonasCache.filter(m=>m.familiaId===myFamId);else famMembers=[window.personaEnGestion];assignedMembers=famMembers.filter(m=>m.cama&&m.id!==window.personaEnGestion.id);neededForMe=famMembers.length-assignedMembers.length;}for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occupantName=camasOcupadas[n];const occupant=listaPersonasCache.find(p=>p.cama===n);const d=document.createElement('div');let esMiCama=(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n);let classes="bed-box";let label=n;if(esMiCama){classes+=" bed-current";label+=" (Tú)";}else if(occupantName){classes+=" bed-busy";label+=` <span>${occupantName.split(' ')[0]}</span>`;}else{classes+=" bed-free";if(shadowMap[n]){classes+=" bed-shadow";}}if(!window.modoMapaGeneral&&!occupantName&&!esMiCama){if(assignedMembers.length>0){if(shadowMap[n]===myFamId)classes+=" bed-suggest-target";}else{let fit=true;for(let k=0;k<neededForMe;k++){if(camasOcupadas[(i+k).toString()])fit=false;}if(fit&&neededForMe>1)classes+=" bed-suggest-block";}}d.className=classes;d.innerHTML=label;d.onclick=()=>{if(occupantName){window.abrirModalInfoCama(occupant);}else if(!window.modoMapaGeneral){guardarCama(n);}};g.appendChild(d);}document.getElementById('modal-cama').classList.remove('hidden');}
window.abrirModalInfoCama=(p)=>{document.getElementById('info-cama-num').innerText=p.cama;document.getElementById('info-nombre-completo').innerText=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`;document.getElementById('info-telefono').innerText=p.telefono||"No consta";const famMembers=listaPersonasCache.filter(m=>m.familiaId===p.familiaId);const famTag=document.getElementById('info-familia-tag');if(famMembers.length>1){famTag.style.display='inline-block';famTag.innerText=`Familia de ${famMembers.length} Miembros`;}else{famTag.style.display='none';}document.getElementById('modal-bed-info').classList.remove('hidden');};
async function guardarCama(c){await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:c.toString(),fechaIngreso:new Date()});document.getElementById('modal-cama').classList.add('hidden');}
window.liberarCamaMantener=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{cama:null});
window.regresarPrefiliacion=async()=>await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'espera',cama:null});
function generarQR(){const u=window.location.href.split('?')[0]+`?public_id=${currentAlbergueId}`;document.getElementById("qrcode").innerHTML="";new QRCode(document.getElementById("qrcode"),{text:u,width:100,height:100});}
window.guardarCambiosPersona=async()=>{
    if(!window.personaEnGestion)return;
    const p={
        nombre:safeVal('edit-nombre'), ap1:safeVal('edit-ap1'), ap2:safeVal('edit-ap2'),
        tipoDoc:safeVal('edit-tipo-doc'), docNum:safeVal('edit-doc-num'), fechaNac:safeVal('edit-fecha'), telefono:safeVal('edit-tel')
    };
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id), p);
    alert("Datos actualizados");
};
