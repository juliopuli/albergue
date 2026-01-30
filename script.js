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
            // COUNT MANUAL
            const snap = await getDocs(query(collection(db,"albergues",d.id,"personas"),where("estado","==","ingresado")));
            c.innerHTML+=`<div class="mto-card" onclick="window.entrarAlbergue('${d.id}')"><h3>${a.nombre}</h3><div class="mto-info">Ocupación: <strong>${snap.size}</strong> / ${a.capacidad}</div></div>`;
        });
    });
};

window.entrarAlbergue=(id)=>{
    currentAlbergueId=id; window.navegar('operativa');
    // Load config
    onSnapshot(doc(db,"albergues",id),d=>{
        currentAlbergueData=d.data();
        document.getElementById('app-title').innerText=currentAlbergueData.nombre;
        totalCapacidad=parseInt(currentAlbergueData.capacidad||0);
        actualizarContadores();
    });
    // Load people (NO ORDER BY to prevent Index Error and 0/0)
    onSnapshot(collection(db,"albergues",id,"personas"),s=>{
        listaPersonasCache=[]; camasOcupadas={}; let c=0;
        s.forEach(d=>{
            const p=d.data(); p.id=d.id;
            listaPersonasCache.push(p);
            if(p.estado==='ingresado'){
                c++; if(p.cama) camasOcupadas[p.cama]=p.nombre;
            }
        });
        // Local sort
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

// --- BUSCADORES Y FILIACIÓN ---
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
    
    setVal('edit-nombre', p.nombre); setVal('edit-doc-num', p.docNum);
    
    // Familia
    const fam = listaPersonasCache.filter(x=>x.familiaId && x.familiaId === p.familiaId);
    document.getElementById('info-familia-resumen').innerText = fam.length>1 ? `Familia (${fam.length})` : "Individual";
    const flist = document.getElementById('info-familia-lista'); flist.innerHTML="";
    fam.forEach(f=>{
        if(f.id!==p.id) flist.innerHTML+=`<div style="padding:5px; border-bottom:1px solid #eee; cursor:pointer;" onclick="window.seleccionarPersona('${f.id}')">${f.nombre}</div>`;
    });
};

// --- QR PÚBLICO (FIXED) ---
window.abrirModalFamiliar=()=>{
    setVal('fam-nombre',""); setVal('fam-doc-num',"");
    document.getElementById('modal-add-familiar').classList.remove('hidden');
};
window.guardarFamiliarQR=()=>{
    const n = safeVal('fam-nombre');
    const d = safeVal('fam-doc-num');
    if(!n) return alert("Nombre obligatorio");
    listaFamiliaresTemp.push({nombre:n, docNum:d});
    
    const div = document.getElementById('lista-familiares-ui');
    div.innerHTML="";
    listaFamiliaresTemp.forEach(f=>{ div.innerHTML+=`<div>- ${f.nombre}</div>`; });
    
    window.cerrarModalFamiliar();
};

window.publicoGuardarTodo=async()=>{
    const n=safeVal('pub-nombre');
    if(!n) return alert("Nombre requerido");
    try{
        const fid = new Date().getTime().toString();
        await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
            nombre:n, docNum:safeVal('pub-doc-num'), estado:'espera', origen:'qr', familiaId:fid, rolFamilia:'TITULAR', fechaRegistro:new Date()
        });
        for(const f of listaFamiliaresTemp){
            await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
                nombre:f.nombre, docNum:f.docNum, estado:'espera', origen:'qr', familiaId:fid, rolFamilia:'MIEMBRO', fechaRegistro:new Date()
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
window.abrirModalFamiliarAdmin=()=>{document.getElementById('modal-admin-add-familiar').classList.remove('hidden');};
window.guardarFamiliarAdmin=()=>{
    const n = safeVal('adm-fam-nombre');
    if(!n) return;
    adminFamiliaresTemp.push({nombre:n});
    const d=document.getElementById('admin-lista-familiares-ui'); d.innerHTML="";
    adminFamiliaresTemp.forEach(f=>{ d.innerHTML+=`<div>- ${f.nombre}</div>`; });
    document.getElementById('modal-admin-add-familiar').classList.add('hidden');
};
window.adminPrefiliarManual=async()=>{
    const n=safeVal('man-nombre');
    if(!n) return alert("Nombre obligatorio");
    const fid=new Date().getTime().toString();
    await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{nombre:n, docNum:safeVal('man-doc-num'), estado:'espera', familiaId:fid, rolFamilia:'TITULAR', fechaRegistro:new Date()});
    for(const f of adminFamiliaresTemp){
        await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{nombre:f.nombre, estado:'espera', familiaId:fid, rolFamilia:'MIEMBRO', fechaRegistro:new Date()});
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
            c.innerHTML+=`<div class="mto-card"><h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p><button onclick="window.abrirModalAlbergue('${d.id}')">Editar</button></div>`;
        });
    });
};
window.abrirModalAlbergue=async(id=null)=>{
    albergueEdicionId=id; document.getElementById('modal-albergue').classList.remove('hidden');
    if(id){
        const s=await getDoc(doc(db,"albergues",id)); const d=s.data();
        setVal('mto-nombre',d.nombre); setVal('mto-capacidad',d.capacidad); setVal('mto-columnas',d.columnas);
    }else{ setVal('mto-nombre',""); setVal('mto-capacidad',""); }
};
window.guardarAlbergue=async()=>{
    const n=safeVal('mto-nombre'), c=safeVal('mto-capacidad'), col=safeVal('mto-columnas');
    if(!n||!c)return alert("Faltan datos");
    if(albergueEdicionId) await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});
    else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});
    document.getElementById('modal-albergue').classList.add('hidden');
};

// --- MAPA CAMAS ---
window.abrirSeleccionCama=()=>{document.getElementById('modal-cama').classList.remove('hidden'); window.mostrarGridCamas();};
window.abrirMapaGeneral=()=>{window.personaEnGestion=null; document.getElementById('modal-cama').classList.remove('hidden'); window.mostrarGridCamas();};
window.mostrarGridCamas=()=>{
    const g=document.getElementById('grid-camas'); g.innerHTML="";
    const cols = currentAlbergueData.columnas || 8;
    g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
    for(let i=1; i<=totalCapacidad; i++){
        const d=document.createElement('div');
        d.className = camasOcupadas[i] ? "bed-box bed-busy" : "bed-box bed-free";
        d.innerText = i + (camasOcupadas[i] ? `\n${camasOcupadas[i]}` : "");
        d.onclick=()=>{
            if(!window.personaEnGestion) return;
            if(!camasOcupadas[i]){
                updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:i.toString()});
                document.getElementById('modal-cama').classList.add('hidden');
            }
        };
        g.appendChild(d);
    }
};

window.liberarCamaMantener=async()=>{await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{cama:null});};
window.guardarCambiosPersona=async()=>{
    if(!window.personaEnGestion)return;
    const n=safeVal('edit-nombre'), d=safeVal('edit-doc-num');
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{nombre:n, docNum:d});
    alert("Guardado");
};

// --- FUSION ---
window.abrirModalVincularFamilia=()=>{document.getElementById('modal-vincular-familia').classList.remove('hidden');};
window.buscarParaVincular=()=>{
    const txt=safeVal('search-vincular').toLowerCase();
    const res=document.getElementById('resultados-vincular');
    if(txt.length<2){res.classList.add('hidden'); return;}
    const hits=listaPersonasCache.filter(p=>p.id!==window.personaEnGestion.id && p.nombre.toLowerCase().includes(txt));
    res.innerHTML="";
    hits.forEach(p=>{
        res.innerHTML+=`<div class="search-item" onclick="window.vincularAFamilia('${p.id}')">${p.nombre}</div>`;
    });
    res.classList.remove('hidden');
};
window.vincularAFamilia=async(tid)=>{
    const target=listaPersonasCache.find(x=>x.id===tid);
    if(!confirm("¿Unir a "+target.nombre+"?"))return;
    let fid = target.familiaId;
    const batch = writeBatch(db);
    if(!fid){
        fid=new Date().getTime().toString()+"-F";
        batch.update(doc(db,"albergues",currentAlbergueId,"personas",target.id),{familiaId:fid});
    }
    // Mover a todos los de mi familia a la nueva
    const myFid = window.personaEnGestion.familiaId;
    let toMove = [window.personaEnGestion];
    if(myFid){ toMove = listaPersonasCache.filter(x=>x.familiaId===myFid); }
    toMove.forEach(m=>{
        batch.update(doc(db,"albergues",currentAlbergueId,"personas",m.id),{familiaId:fid});
    });
    await batch.commit();
    alert("Vinculado");
    document.getElementById('modal-vincular-familia').classList.add('hidden');
};
