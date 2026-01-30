import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// GLOBALES
let currentUserData=null, currentAlbergueId=null, currentAlbergueData=null, totalCapacidad=0, ocupacionActual=0, camasOcupadas={}, listaPersonasCache=[];
let listaFamiliaresTemp=[], adminFamiliaresTemp=[], userEditingId=null, albergueEdicionId=null;
let isPublicMode = false;

// --- AUTH ---
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
    if(t==='prefiliacion') { 
        document.getElementById('man-nombre').value=""; 
        adminFamiliaresTemp=[]; actualizarAdminFamUI(); 
    }
    if(t==='filiacion') { 
        document.getElementById('buscador-persona').value=""; 
        document.getElementById('resultados-busqueda').classList.add('hidden');
        document.getElementById('panel-gestion-persona').classList.add('hidden');
    }
};

// --- GESTIÓN ALBERGUES (MTO) ---
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
        document.getElementById('mto-nombre').value=d.nombre;
        document.getElementById('mto-capacidad').value=d.capacidad;
        document.getElementById('mto-columnas').value=d.columnas||8;
    }else{
        document.getElementById('mto-nombre').value=""; document.getElementById('mto-capacidad').value="";
    }
};
window.guardarAlbergue=async()=>{
    const n=document.getElementById('mto-nombre').value; const c=document.getElementById('mto-capacidad').value;
    const col=document.getElementById('mto-columnas').value;
    if(!n||!c)return alert("Datos");
    if(albergueEdicionId) await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});
    else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});
    document.getElementById('modal-albergue').classList.add('hidden');
};

// --- GESTIÓN ACTIVA (SELECCION & OPERATIVA) ---
window.cargarAlberguesActivos=()=>{
    const c=document.getElementById('lista-albergues-activos');
    onSnapshot(query(collection(db,"albergues"),where("activo","==",true)),s=>{
        c.innerHTML="";
        s.forEach(async d=>{
            const a=d.data();
            // COUNT OCCUPANCY MANUAL
            const snapP = await getDocs(query(collection(db,"albergues",d.id,"personas"),where("estado","==","ingresado")));
            const ocup = snapP.size;
            c.innerHTML+=`<div class="mto-card" onclick="window.entrarAlbergue('${d.id}')">
                <h3>${a.nombre}</h3>
                <div class="mto-info"><strong>${ocup}</strong> / ${a.capacidad}</div>
            </div>`;
        });
    });
};

window.entrarAlbergue=(id)=>{
    currentAlbergueId=id; window.navegar('operativa');
    onSnapshot(doc(db,"albergues",id),d=>{
        currentAlbergueData=d.data();
        document.getElementById('app-title').innerText=currentAlbergueData.nombre;
        totalCapacidad=currentAlbergueData.capacidad||0;
    });
    // CARGAR PERSONAS (SIN ORDERBY PARA EVITAR ERROR INDICE)
    onSnapshot(collection(db,"albergues",id,"personas"),s=>{
        listaPersonasCache=[]; camasOcupadas={}; let c=0;
        s.forEach(d=>{
            const p=d.data(); p.id=d.id;
            listaPersonasCache.push(p);
            if(p.estado==='ingresado'){
                c++; if(p.cama) camasOcupadas[p.cama]=p.nombre;
            }
        });
        ocupacionActual=c;
        document.getElementById('ocupacion-count').innerText=c;
        document.getElementById('capacidad-total').innerText=totalCapacidad;
        if(window.personaEnGestion) window.seleccionarPersona(listaPersonasCache.find(x=>x.id===window.personaEnGestion.id));
    });
};

// --- QR PÚBLICO (FIX AÑADIR FAMILIA) ---
window.abrirModalFamiliar=()=>{
    document.getElementById('fam-nombre').value="";
    document.getElementById('fam-doc-num').value="";
    document.getElementById('modal-add-familiar').classList.remove('hidden');
};
window.guardarFamiliarQR=()=>{
    // FUNCION AISLADA PARA QUE NO FALLE
    const n = document.getElementById('fam-nombre').value;
    const docu = document.getElementById('fam-doc-num').value;
    if(!n) return alert("Nombre obligatorio");
    
    listaFamiliaresTemp.push({nombre:n, docNum:docu});
    // Update UI
    const d=document.getElementById('lista-familiares-ui'); d.innerHTML="";
    listaFamiliaresTemp.forEach(f=>{ d.innerHTML+=`<div>- ${f.nombre}</div>`; });
    
    document.getElementById('modal-add-familiar').classList.add('hidden');
};
window.publicoGuardarTodo=async()=>{
    const n=document.getElementById('pub-nombre').value;
    if(!n)return alert("Falta nombre titular");
    try{
        const famId=new Date().getTime().toString();
        // Guardar Titular
        await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
            nombre:n, docNum:document.getElementById('pub-doc-num').value,
            estado:'espera', origen:'qr', familiaId:famId, rolFamilia:'TITULAR', fechaRegistro:new Date()
        });
        // Guardar Familiares
        for(const f of listaFamiliaresTemp){
            await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{
                nombre:f.nombre, docNum:f.docNum,
                estado:'espera', origen:'qr', familiaId:famId, rolFamilia:'MIEMBRO', fechaRegistro:new Date()
            });
        }
        document.getElementById('public-form-container').classList.add('hidden');
        document.getElementById('public-success-msg').classList.remove('hidden');
    }catch(e){alert("Error: "+e.message);}
};
window.abrirModalQR=()=>{
    document.getElementById('modal-qr').classList.remove('hidden');
    const d=document.getElementById('qrcode-display');
    if(d.innerHTML=="") new QRCode(d, {text: window.location.href.split('?')[0]+"?public_id="+currentAlbergueId, width:200, height:200});
};

// --- PREFILIACIÓN ADMIN ---
window.buscarEnPrefiliacion=()=>{
    const txt=document.getElementById('buscador-pref').value.toLowerCase();
    const res=document.getElementById('resultados-pref');
    if(txt.length<2){res.classList.add('hidden'); return;}
    
    const hits=listaPersonasCache.filter(p=>p.estado==='espera' && p.nombre.toLowerCase().includes(txt));
    res.innerHTML="";
    hits.forEach(p=>{
        res.innerHTML+=`<div class="search-item" onclick="alert('Ya existe')">${p.nombre}</div>`;
    });
    res.classList.remove('hidden');
};
window.abrirModalFamiliarAdmin=()=>{document.getElementById('modal-admin-add-familiar').classList.remove('hidden');};
window.guardarFamiliarAdmin=()=>{
    const n=document.getElementById('adm-fam-nombre').value;
    if(!n)return;
    adminFamiliaresTemp.push({nombre:n});
    const d=document.getElementById('admin-lista-familiares-ui'); d.innerHTML="";
    adminFamiliaresTemp.forEach(f=>{ d.innerHTML+=`<div>- ${f.nombre}</div>`; });
    document.getElementById('modal-admin-add-familiar').classList.add('hidden');
};
window.adminPrefiliarManual=async()=>{
    const n=document.getElementById('man-nombre').value;
    if(!n) return alert("Falta nombre");
    const famId=new Date().getTime().toString();
    await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{nombre:n,estado:'espera',familiaId:famId,rolFamilia:'TITULAR',fechaRegistro:new Date()});
    for(const f of adminFamiliaresTemp){
        await addDoc(collection(db,"albergues",currentAlbergueId,"personas"),{nombre:f.nombre,estado:'espera',familiaId:famId,rolFamilia:'MIEMBRO',fechaRegistro:new Date()});
    }
    alert("Guardado");
    document.getElementById('man-nombre').value="";
    adminFamiliaresTemp=[];
};

// --- FILIACION ---
window.buscarPersonaEnAlbergue=()=>{
    const txt=document.getElementById('buscador-persona').value.toLowerCase();
    const res=document.getElementById('resultados-busqueda');
    if(txt.length<2){res.classList.add('hidden');return;}
    const hits=listaPersonasCache.filter(p=>p.nombre.toLowerCase().includes(txt));
    res.innerHTML="";
    hits.forEach(p=>{
        res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}')">
            ${p.nombre} (${p.estado})
        </div>`;
    });
    res.classList.remove('hidden');
};
window.seleccionarPersona=(pid)=>{
    if(typeof pid === 'object') pid = pid.id; // Handle object pass
    const p = listaPersonasCache.find(x=>x.id===pid);
    window.personaEnGestion = p;
    document.getElementById('resultados-busqueda').classList.add('hidden');
    document.getElementById('panel-gestion-persona').classList.remove('hidden');
    
    document.getElementById('gestion-nombre-titulo').innerText = p.nombre;
    document.getElementById('gestion-estado').innerText = p.estado;
    document.getElementById('gestion-cama-info').innerText = p.cama ? `Cama: ${p.cama}` : "Sin cama";

    // Familia
    const fam = listaPersonasCache.filter(x=>x.familiaId === p.familiaId);
    document.getElementById('info-familia-resumen').innerText = fam.length > 1 ? `Familia (${fam.length})` : "Solo";
    const flist = document.getElementById('info-familia-lista'); flist.innerHTML="";
    fam.forEach(f=>{
        if(f.id!==p.id) flist.innerHTML+=`<div onclick="window.seleccionarPersona('${f.id}')" style="cursor:pointer; color:blue;">${f.nombre}</div>`;
    });
};

// --- CAMAS ---
window.abrirSeleccionCama=()=>{
    document.getElementById('modal-cama').classList.remove('hidden');
    window.mostrarGridCamas();
};
window.abrirMapaGeneral=()=>{
    window.personaEnGestion=null; // Modo solo ver
    document.getElementById('modal-cama').classList.remove('hidden');
    window.mostrarGridCamas();
};
window.mostrarGridCamas=()=>{
    const g=document.getElementById('grid-camas'); g.innerHTML="";
    const cols = currentAlbergueData.columnas || 8;
    g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;

    for(let i=1; i<=totalCapacidad; i++){
        const d=document.createElement('div');
        d.className = camasOcupadas[i] ? "bed-box bed-busy" : "bed-box bed-free";
        d.innerText = i + (camasOcupadas[i] ? `\n${camasOcupadas[i]}` : "");
        d.onclick=()=>{
            if(!window.personaEnGestion) return; // Solo ver
            if(!camasOcupadas[i]){
                updateDoc(doc(db,"albergues",currentAlbergueId,"personas",window.personaEnGestion.id),{estado:'ingresado',cama:i.toString()});
                document.getElementById('modal-cama').classList.add('hidden');
            }
        };
        g.appendChild(d);
    }
};

// --- USUARIOS ---
window.abrirModalUsuario=()=>{document.getElementById('modal-crear-usuario').classList.remove('hidden');};
window.guardarUsuario=async()=>{
    const e=document.getElementById('new-user-email').value;
    const p=document.getElementById('new-user-pass').value;
    const r=document.getElementById('new-user-role').value || 'medio'; // Default
    const n=document.getElementById('new-user-name').value;
    try{
        const tApp=initializeApp(firebaseConfig,"Temp");
        const tAuth=getAuth(tApp);
        const uc=await createUserWithEmailAndPassword(tAuth,e,p);
        await setDoc(doc(db,"usuarios",uc.user.uid),{email:e,nombre:n,rol:r});
        await signOut(tAuth);
        alert("Creado");
        document.getElementById('modal-crear-usuario').classList.add('hidden');
        window.cargarUsuarios();
    }catch(err){alert(err.message);}
};
window.cargarUsuarios=()=>{
    const c=document.getElementById('lista-usuarios-container');
    onSnapshot(collection(db,"usuarios"),s=>{
        c.innerHTML="";
        s.forEach(d=>{
            const u=d.data();
            c.innerHTML+=`<div class="user-card-item"><h4>${u.nombre}</h4><p>${u.email}</p><span class="badge">${u.rol}</span></div>`;
        });
    });
};
window.filtrarUsuarios=()=>{ /* Implementar si necesario */ };
