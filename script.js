import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// STATE
let currentUserData=null, currentAlbergueId=null, currentAlbergueData=null, totalCapacidad=0, ocupacionActual=0, camasOcupadas={}, listaPersonasCache=[];
let unsubscribeUsers=null, unsubscribeAlberguesActivos=null, unsubscribeAlberguesMto=null, unsubscribePersonas=null, unsubscribeAlbergueDoc=null;
window.personaEnGestion=null; window.modoMapaGeneral=false;
let listaFamiliaresTemp=[], adminFamiliaresTemp=[], userEditingId=null, albergueEdicionId=null;
let isPublicMode = false;

// --- INIT ---
window.onload=()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get('public_id')){
        isPublicMode=true; currentAlbergueId=p.get('public_id');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('public-register-screen').classList.remove('hidden');
    }
};

window.iniciarSesion=async()=>{try{await signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value);}catch(e){alert(e.message);}};
window.cerrarSesion=()=>{signOut(auth);location.reload();};
window.recuperarContrasena=async()=>{const m=prompt("Email:");if(m)try{await sendPasswordResetEmail(auth,m);alert("Enviado");}catch(e){alert(e.message);}};

onAuthStateChanged(auth,async(u)=>{
    if(isPublicMode) return;
    if(u){
        const s=await getDoc(doc(db,"usuarios",u.uid));
        if(s.exists()){
            currentUserData={...s.data(),uid:u.uid};
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-shell').classList.remove('hidden');
            configDashboard();
            window.navegar('home');
        }
    } else {
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
});

function configDashboard(){
    document.getElementById('user-name-display').innerText=currentUserData.nombre;
    const r=currentUserData.rol;
    document.getElementById('user-role-badge').innerText=r;
    if(['super_admin','admin'].includes(r)) document.getElementById('header-btn-users').classList.remove('hidden');
    if(!['super_admin','admin','avanzado'].includes(r)) document.getElementById('nav-mto').classList.add('disabled');
    if(r==='super_admin') document.getElementById('container-ver-ocultos').classList.remove('hidden');
}

// --- NAV ---
window.navegar=(p)=>{
    ['screen-home','screen-usuarios','screen-gestion-albergues','screen-mantenimiento','screen-operativa'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    
    // CLEANUP LISTENERS WHEN LEAVING SCREENS
    if(p!=='usuarios' && unsubscribeUsers) { unsubscribeUsers(); unsubscribeUsers=null; }
    if(p!=='gestion-albergues' && unsubscribeAlberguesActivos) { unsubscribeAlberguesActivos(); unsubscribeAlberguesActivos=null; }
    if(p!=='mantenimiento' && unsubscribeAlberguesMto) { unsubscribeAlberguesMto(); unsubscribeAlberguesMto=null; }
    // NOTE: We keep 'operativa' listeners alive longer to prevent 0/0 flashing, cleared in entrarAlbergue

    if(p==='home') document.getElementById('screen-home').classList.remove('hidden');
    if(p==='usuarios'){ document.getElementById('screen-usuarios').classList.remove('hidden'); window.cargarUsuarios(); }
    if(p==='gestion-albergues'){ document.getElementById('screen-gestion-albergues').classList.remove('hidden'); window.cargarAlberguesActivos(); }
    if(p==='mantenimiento'){ document.getElementById('screen-mantenimiento').classList.remove('hidden'); window.cargarAlberguesMantenimiento(); }
    if(p==='operativa'){ document.getElementById('screen-operativa').classList.remove('hidden'); window.cambiarPestana('prefiliacion'); }
};

window.cambiarPestana=(t)=>{
    document.getElementById('tab-prefiliacion').style.display=t==='prefiliacion'?'block':'none';
    document.getElementById('tab-filiacion').style.display=t==='filiacion'?'block':'none';
    document.getElementById('btn-tab-pref').className=t==='prefiliacion'?'tab-btn active':'tab-btn';
    document.getElementById('btn-tab-fil').className=t==='filiacion'?'tab-btn active':'tab-btn';
    if(t==='prefiliacion'){
        document.getElementById('man-nombre').value=""; 
        adminFamiliaresTemp=[]; actualizarAdminFamUI();
    }
};

// --- CORE UTILS ---
function safeVal(id){const el=document.getElementById(id);return el?el.value:"";}
function setVal(id,val){const el=document.getElementById(id);if(el)el.value=val;}

// --- USUARIOS (FIX DELETE APP) ---
window.abrirModalUsuario=async(id=null)=>{
    userEditingId=id; document.getElementById('modal-crear-usuario').classList.remove('hidden');
    const sel=document.getElementById('new-user-role'); sel.innerHTML="";
    const r=currentUserData.rol;
    const roles = r==='super_admin' ? ['super_admin','admin','avanzado','medio'] : ['avanzado','medio'];
    roles.forEach(o=>sel.add(new Option(o,o)));
    
    if(id){
        document.getElementById('user-modal-title').innerText="Editar";
        const s=await getDoc(doc(db,"usuarios",String(id)));
        if(s.exists()){
            const d=s.data(); setVal('new-user-name',d.nombre); setVal('new-user-email',d.email); sel.value=d.rol;
        }
    }else{
        document.getElementById('user-modal-title').innerText="Nuevo";
        setVal('new-user-name',""); setVal('new-user-email',"");
    }
};
window.guardarUsuario=async()=>{
    const e=safeVal('new-user-email'), p=safeVal('new-user-pass'), n=safeVal('new-user-name'), r=safeVal('new-user-role');
    if(!n||!r)return alert("Datos incompletos");
    
    if(userEditingId){
        await updateDoc(doc(db,"usuarios",userEditingId),{nombre:n,rol:r});
    }else{
        if(!e||!p)return alert("Email y Pass requeridos");
        let tApp;
        try{
            tApp = initializeApp(firebaseConfig, "Temp");
            const tAuth = getAuth(tApp);
            const uc = await createUserWithEmailAndPassword(tAuth,e,p);
            await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});
            await signOut(tAuth);
            alert("Creado");
        }catch(err){alert(err.message);}
        finally{ if(tApp) deleteApp(tApp); } // FIX: DESTROY TEMP APP
    }
    document.getElementById('modal-crear-usuario').classList.add('hidden');
    window.cargarUsuarios(); // Refresh to show changes immediately if no filter
};
window.cargarUsuarios=()=>{
    const c=document.getElementById('lista-usuarios-container');
    const f=document.getElementById('search-user').value.toLowerCase();
    unsubscribeUsers=onSnapshot(query(collection(db,"usuarios"),orderBy("nombre")),s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const u=d.data();
            if(currentUserData.rol==='admin' && (u.rol==='admin'||u.rol==='super_admin')) return;
            if(f && !u.nombre.toLowerCase().includes(f) && !u.email.toLowerCase().includes(f)) return;
            c.innerHTML+=`<div class="list-item" onclick="window.abrirModalUsuario('${d.id}')">
                <div class="item-header"><div class="avatar">${u.nombre.charAt(0)}</div><div><strong>${u.nombre}</strong><br><small>${u.email}</small></div></div>
                <span class="badge" style="background:#eee">${u.rol}</span>
            </div>`;
        });
    });
};
window.filtrarUsuarios=()=>{window.cargarUsuarios();};

// --- ALBERGUES MTO ---
window.cargarAlberguesMantenimiento=()=>{
    const c=document.getElementById('mto-container');
    unsubscribeAlberguesMto=onSnapshot(query(collection(db,"albergues"),orderBy("nombre")),s=>{
        c.innerHTML=`<div class="mto-card add-new" onclick="window.abrirModalAlbergue()"><h3>+ Crear</h3></div>`;
        s.forEach(d=>{
            const a=d.data();
            c.innerHTML+=`<div class="mto-card">
                <h3>${a.nombre}</h3><p>Cap: ${a.capacidad}</p>
                <button class="secondary" onclick="window.abrirModalAlbergue('${d.id}')">Editar</button>
            </div>`;
        });
    });
};
window.abrirModalAlbergue=async(id=null)=>{
    albergueEdicionId=id; document.getElementById('modal-albergue').classList.remove('hidden');
    if(id){
        const s=await getDoc(doc(db,"albergues",id)); const d=s.data();
        setVal('mto-nombre',d.nombre); setVal('mto-capacidad',d.capacidad); setVal('mto-columnas',d.columnas||8);
    }else{
        setVal('mto-nombre',""); setVal('mto-capacidad',"");
    }
};
window.guardarAlbergue=async()=>{
    const n=safeVal('mto-nombre'), c=safeVal('mto-capacidad'), col=safeVal('mto-columnas');
    if(!n||!c)return alert("Faltan datos");
    if(albergueEdicionId) await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});
    else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});
    document.getElementById('modal-albergue').classList.add('hidden');
};

// --- GESTIÓN & OPERATIVA (FIX 0/0) ---
window.cargarAlberguesActivos=()=>{
    const c=document.getElementById('lista-albergues-activos');
    unsubscribeAlberguesActivos=onSnapshot(query(collection(db,"albergues"),where("activo","==",true)),s=>{
        c.innerHTML="";
        s.forEach(async d=>{
            const a=d.data();
            // Count manually locally or subquery
            const snap = await getDocs(query(collection(db,"albergues",d.id,"personas"),where("estado","==","ingresado")));
            const cnt = snap.size;
            c.innerHTML+=`<div class="mto-card" onclick="window.entrarAlbergue('${d.id}')">
                <h3>${a.nombre}</h3>
                <div class="mto-info">Ocupación: <strong>${cnt}</strong> / ${a.capacidad}</div>
            </div>`;
        });
    });
};

window.entrarAlbergue=(id)=>{
    currentAlbergueId=id;
    // Kill previous operative listeners
    if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc();
    if(unsubscribePersonas) unsubscribePersonas();

    window.navegar('operativa');
    
    // 1. Listen Config
    unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id),d=>{
        currentAlbergueData = d.data();
        document.getElementById('app-title').innerText = currentAlbergueData.nombre;
        totalCapacidad = parseInt(currentAlbergueData.capacidad || 0);
        actualizarContadores();
    });

    // 2. Listen People (NO ORDERBY to fix index issue)
    unsubscribePersonas = onSnapshot(collection(db,"albergues",id,"personas"),s=>{
        listaPersonasCache=[]; camasOcupadas={}; let c=0;
        s.forEach(doc=>{
            const p=doc.data(); p.id=doc.id;
            listaPersonasCache.push(p);
            if(p.estado==='ingresado'){
                c++; if(p.cama) camasOcupadas[p.cama]=p.nombre;
            }
        });
        ocupacionActual=c;
        actualizarContadores();
        
        // Refresh detail view if open
        if(window.personaEnGestion){
            const upd = listaPersonasCache.find(x=>x.id===window.personaEnGestion.id);
            if(upd) window.seleccionarPersona(upd);
        }
    });
};

function actualizarContadores(){
    document.getElementById('ocupacion-count').innerText = ocupacionActual;
    document.getElementById('capacidad-total').innerText = totalCapacidad;
}

// --- BUSCADORES ---
window.buscarEnPrefiliacion=()=>{
    const txt=safeVal('buscador-pref').toLowerCase();
    const res=document.getElementById('resultados-pref');
    if(txt.length<2) { res.classList.add('hidden'); return; }
    
    const hits=listaPersonasCache.filter(p=>p.estado==='espera' && p.nombre.toLowerCase().includes(txt));
    res.innerHTML="";
    hits.forEach(p=>{
        res.innerHTML+=`<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')"><strong>${p.nombre}</strong> (${p.docNum||'-'})</div>`;
    });
    res.classList.remove('hidden');
};

window.buscarPersonaEnAlbergue=()=>{
    const txt=safeVal('buscador-persona').toLowerCase();
    const res=document.getElementById('resultados-busqueda');
    if(txt.length<2) { res.classList.add('hidden'); return; }
    
    const hits=listaPersonasCache.filter(p=>p.nombre.toLowerCase().includes(txt));
    res.innerHTML="";
    hits.forEach(p=>{
        res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}')">
            <strong>${p.nombre}</strong> <span class="badge" style="background:${p.estado==='ingresado'?'#dcfce7':'#fee2e2'}">${p.estado}</span>
        </div>`;
    });
    res.classList.remove('hidden');
};

window.seleccionarPersona=(pid)=>{
    if(typeof pid !== 'string') pid = pid.id; // Handle object pass
    const p = listaPersonasCache.find(x=>x.id===pid);
    if(!p) return;
    
    window.personaEnGestion=p;
    document.getElementById('resultados-busqueda').classList.add('hidden');
    document.getElementById('panel-gestion-persona').classList.remove('hidden');
    
    document.getElementById('gestion-nombre-titulo').innerText=p.nombre;
    document.getElementById('gestion-estado').innerText=p.estado.toUpperCase();
    document.getElementById('gestion-cama-info').innerText=p.cama ? `Cama: ${p.cama}` : "";
    
    // Fill Edit Form
    setVal('edit-nombre', p.nombre); setVal('edit-ap1', p.ap1); setVal('edit-ap2', p.ap2);
    setVal('edit-doc-num', p.docNum); setVal('edit-fecha', p.fechaNac); setVal('edit-tel', p.telefono);
    
    // Family List
    const fam = listaPersonasCache.filter(x=>x.familiaId && x.familiaId === p.familiaId);
    document.getElementById('info-familia-resumen').innerText = fam.length>1 ? `Familia (${fam.length})` : "Individual";
    const flist = document.getElementById('info-familia-lista'); flist.innerHTML="";
    fam.forEach(f=>{
        if(f.id!==p.id) flist.innerHTML+=`<div style="padding:5px; border-bottom:1px solid #eee; cursor:pointer;" onclick="window.seleccionarPersona('${f.id}')">${f.nombre}</div>`;
    });
};

// --- MAPA CAMAS ---
window.abrirMapaGeneral=()=>{
    window.personaEnGestion=null; // Modo solo ver
    window.abrirSeleccionCama();
};
window.abrirSeleccionCama=()=>{
    document.getElementById('modal-cama').classList.remove('hidden');
    const g=document.getElementById('grid-camas'); g.innerHTML="";
    
    // Check if data loaded
    if(!currentAlbergueData || !totalCapacidad) return;
    
    const cols = currentAlbergueData.columnas || 8;
    g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
    
    // Lógica sombras (Reserva familiar)
    let shadowMap={};
    if(window.personaEnGestion && window.personaEnGestion.familiaId){
        // Simplificado: Marcar camas libres si la familia tiene alguna ocupada (lógica visual básica)
    }

    for(let i=1; i<=totalCapacidad; i++){
        const n=i.toString();
        const ocupante = camasOcupadas[n];
        const div = document.createElement('div');
        let clase = "bed-box ";
        let texto = n;
        
        if(window.personaEnGestion && window.personaEnGestion.cama === n) { clase += "bed-current"; texto += "\n(Tú)"; }
        else if(ocupante) { clase += "bed-busy"; texto += `\n${ocupante.split(' ')[0]}`; }
        else { clase += "bed-free"; }
        
        div.className = clase;
        div.innerText = texto;
        div.onclick = () => {
            if(ocupante) {
                // Info ocupante
                const p = listaPersonasCache.find(x=>x.cama===n);
                if(p) window.abrirModalInfoCama(p);
            } else if(window.personaEnGestion) {
                // Asignar
                window.asignarCama(n);
            }
        };
        g.appendChild(div);
    }
};

window.abrirModalInfoCama=(p)=>{
    document.getElementById('info-nombre-completo').innerText=p.nombre;
    document.getElementById('info-cama-num').innerText=p.cama;
    document.getElementById('info-telefono').innerText=p.telefono || "No consta";
    document.getElementById('modal-bed-info').classList.remove('hidden');
};

window.asignarCama=async(cama)=>{
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{
        estado:'ingresado', cama:cama, fechaIngreso:new Date()
    });
    document.getElementById('modal-cama').classList.add('hidden');
};
window.liberarCamaMantener=async()=>{
    await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{cama:null});
};

// --- QR & FAMILIA ---
window.abrirModalQR=()=>{
    document.getElementById('modal-qr').classList.remove('hidden');
    const d=document.getElementById('qrcode-display');
    if(d.innerHTML=="") new QRCode(d, {text: window.location.href.split('?')[0]+"?public_id="+currentAlbergueId, width:200, height:200});
};

window.abrirModalFamiliar=()=>{
    setVal('fam-nombre',""); setVal('fam-doc-num',"");
    document.getElementById('modal-add-familiar').classList.remove('hidden');
};
window.cerrarModalFamiliar=()=>document.getElementById('modal-add-familiar').classList.add('hidden');

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
    const n = safeVal('pub-nombre');
    if(!n) return alert("Falta nombre titular");
    try{
        const famId = new Date().getTime().toString();
        // Titular
        await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
            nombre:n, docNum:safeVal('pub-doc-num'), estado:'espera', origen:'qr', familiaId:famId, rolFamilia:'TITULAR', fechaRegistro:new Date()
        });
        // Familiares
        for(const f of listaFamiliaresTemp){
            await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
                nombre:f.nombre, docNum:f.docNum, estado:'espera', origen:'qr', familiaId:famId, rolFamilia:'MIEMBRO', fechaRegistro:new Date()
            });
        }
        document.getElementById('public-form-container').classList.add('hidden');
        document.getElementById('public-success-msg').classList.remove('hidden');
    }catch(e){ alert(e.message); }
};
