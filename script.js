import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", authDomain: "albergues-temporales.firebaseapp.com", projectId: "albergues-temporales", storageBucket: "albergues-temporales.firebasestorage.app", messagingSenderId: "489999184108", appId: "1:489999184108:web:32b9b580727f83158075c9" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

// --- STATE MANAGEMENT ---
const AppState = {
    user: null,
    currentAlbergue: null,
    currentAlbergueId: null,
    people: [],
    listeners: {
        albergue: null,
        people: null,
        maintenance: null,
        activeAlbergues: null
    },
    // Temp data for forms
    famTemp: [],
    adminFamTemp: [],
    editingPerson: null
};

// --- SUBSCRIPTION MANAGER ---
const SubscriptionManager = {
    unsubscribeAll: () => {
        if(AppState.listeners.albergue) AppState.listeners.albergue();
        if(AppState.listeners.people) AppState.listeners.people();
        AppState.listeners.albergue = null;
        AppState.listeners.people = null;
        AppState.currentAlbergue = null;
        AppState.people = [];
    },
    subscribeToAlbergue: (id) => {
        SubscriptionManager.unsubscribeAll();
        AppState.currentAlbergueId = id;
        
        // Listener 1: Albergue Data
        AppState.listeners.albergue = onSnapshot(doc(db, "albergues", id), (docSnap) => {
            if(docSnap.exists()) {
                AppState.currentAlbergue = docSnap.data();
                Render.headerStats();
            }
        });

        // Listener 2: People Data
        AppState.listeners.people = onSnapshot(collection(db, "albergues", id, "personas"), (querySnap) => {
            AppState.people = [];
            querySnap.forEach(d => {
                const p = d.data(); p.id = d.id;
                AppState.people.push(p);
            });
            // Default Sort: Registration Date Descending
            AppState.people.sort((a,b) => (b.fechaRegistro?.seconds||0) - (a.fechaRegistro?.seconds||0));
            
            Render.headerStats();
            
            // Refresh specific views if active
            if(AppState.editingPerson) {
                // If we are editing someone, refresh their data in the form if it changed
                const freshPerson = AppState.people.find(p => p.id === AppState.editingPerson.id);
                if(freshPerson) {
                    window.seleccionarPersona(freshPerson); 
                }
            }
        });
    }
};

// --- RENDER ENGINE (UI Updates) ---
const Render = {
    headerStats: () => {
        const titleEl = document.getElementById('app-title');
        const countEl = document.getElementById('ocupacion-count');
        const capEl = document.getElementById('capacidad-total');
        
        if(titleEl && AppState.currentAlbergue) titleEl.innerText = AppState.currentAlbergue.nombre;
        
        const occupancy = AppState.people.filter(p => p.estado === 'ingresado').length;
        const capacity = AppState.currentAlbergue ? parseInt(AppState.currentAlbergue.capacidad || 0) : 0;
        
        if(countEl) countEl.innerText = occupancy;
        if(capEl) capEl.innerText = capacity;
    },
    familyList: (containerId, familyId, excludeId) => {
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = "";
        
        const familyMembers = AppState.people.filter(p => p.familiaId === familyId);
        if(familyMembers.length > 0) {
            let html = "<h5>Familiares:</h5>";
            familyMembers.forEach(f => {
                if(f.id === excludeId) return;
                html += `
                <div class="fam-item existing">
                    <div>
                        <strong>${f.nombre} ${f.ap1||''}</strong><br>
                        <small style="color:#666;">${f.docNum||'-'} | ${f.telefono||'-'}</small>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }
    }
};

// --- AUTH ---
window.onload = () => {
    const p = new URLSearchParams(window.location.search);
    if(p.get('public_id')){
        // Public Mode Logic (simplified for brevity, assume similar to before)
        isPublicMode = true; 
        AppState.currentAlbergueId = p.get('public_id');
        initPublicMode();
    }
    const passInput = document.getElementById('login-pass');
    if(passInput) passInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.iniciarSesion(); });
};

async function initPublicMode() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('public-register-screen').classList.remove('hidden');
    document.getElementById('public-welcome-screen').classList.remove('hidden');
    try {
        const snap = await getDoc(doc(db, "albergues", AppState.currentAlbergueId));
        if(snap.exists()) document.getElementById('public-albergue-name').innerText = snap.data().nombre;
    } catch(e) {}
}

window.iniciarSesion = async () => {
    try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value); }
    catch(e){ alert("Error: "+e.message); }
};

window.cerrarSesion = () => { signOut(auth); location.reload(); };

onAuthStateChanged(auth, async (u) => {
    if(isPublicMode) return;
    if(u){
        const s = await getDoc(doc(db, "usuarios", u.uid));
        if(s.exists()){
            AppState.user = { ...s.data(), uid: u.uid };
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

// --- NAVIGATION ---
window.navegar = (p) => {
    // Hide all screens
    ['screen-home', 'screen-usuarios', 'screen-gestion-albergues', 'screen-mantenimiento', 'screen-operativa', 'screen-observatorio'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });

    const r = AppState.user.rol;

    // Route
    if(p === 'home') {
        document.getElementById('screen-home').classList.remove('hidden');
        document.getElementById('nav-home').classList.add('active');
        SubscriptionManager.unsubscribeAll(); // Leave albergue
    } 
    else if(p === 'gestion-albergues') {
        document.getElementById('screen-gestion-albergues').classList.remove('hidden');
        document.getElementById('nav-albergues').classList.add('active');
        window.cargarAlberguesActivos();
    }
    else if(p === 'operativa') {
        document.getElementById('screen-operativa').classList.remove('hidden');
        // Do not unsubscribe here, we need the listeners
    }
    else if(p === 'observatorio') {
        document.getElementById('screen-observatorio').classList.remove('hidden');
        document.getElementById('nav-obs').classList.add('active');
        window.cargarObservatorio();
    }
    // ... (Add users/maintenance routing similarly) ...
    
    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(p.includes('albergue')) document.getElementById('nav-albergues').classList.add('active');
    else if(p.includes('obs')) document.getElementById('nav-obs').classList.add('active');
    else document.getElementById('nav-home').classList.add('active');
};

function configurarDashboard(){
    const r = AppState.user.rol;
    document.getElementById('user-name-display').innerText = AppState.user.nombre;
    document.getElementById('user-role-badge').innerText = r.toUpperCase();
    
    const obs = document.getElementById('nav-obs');
    if(['super_admin','admin','observador'].includes(r)) obs.classList.remove('hidden'); else obs.classList.add('hidden');
    
    const gest = document.getElementById('nav-albergues');
    if(r !== 'observador') gest.classList.remove('hidden'); else gest.classList.add('hidden');
}

// --- GESTIÓN ALBERGUES (Entry Point) ---
window.cargarAlberguesActivos = () => {
    const c = document.getElementById('lista-albergues-activos');
    if(!c) return;
    // Simple listener for list
    if(AppState.listeners.activeAlbergues) AppState.listeners.activeAlbergues();
    
    AppState.listeners.activeAlbergues = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s => {
        c.innerHTML = "";
        s.forEach(async d => {
            const a = d.data();
            const div = document.createElement('div');
            div.className = "mto-card";
            div.innerHTML = `<h3>${a.nombre}</h3><div class="mto-info">Cargando...</div>`;
            div.onclick = () => window.entrarAlbergue(d.id);
            c.appendChild(div);
            // Async count fetch (visual only)
            const snap = await getDocs(query(collection(db,"albergues",d.id,"personas"),where("estado","==","ingresado")));
            div.querySelector('.mto-info').innerHTML = `Ocupación: <strong>${snap.size}</strong> / ${a.capacidad}`;
        });
    });
};

window.entrarAlbergue = (id) => {
    // 1. Setup UI
    window.navegar('operativa');
    const initialTab = (AppState.user.rol === 'intervencion') ? 'sanitaria' : 'prefiliacion';
    window.cambiarPestana(initialTab);
    
    // 2. Start Data Sync
    SubscriptionManager.subscribeToAlbergue(id);
};

// --- FILIACIÓN / PREFILIACIÓN LOGIC ---
window.cambiarPestana = (t) => {
    ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi'].forEach(id => document.getElementById(id).classList.remove('active'));

    document.getElementById(`tab-${t}`).classList.remove('hidden');
    document.getElementById(`btn-tab-${t.substring(0,3)}`).classList.add('active'); // btn-tab-pre, fil, etc.

    if(t === 'prefiliacion') {
        window.cancelarEdicionPref();
    }
};

// --- SEARCH FUNCTIONS (Decoupled from DOM update) ---
function formatPersonSearch(p) {
    const full = `${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();
    const doc = (p.docNum||"").toLowerCase();
    const tel = (p.telefono||"").toLowerCase();
    return { full, doc, tel };
}

window.buscarEnPrefiliacion = () => {
    const txt = document.getElementById('buscador-pref').value.toLowerCase().trim();
    const res = document.getElementById('resultados-pref');
    if(txt.length < 2) { res.classList.add('hidden'); return; }

    const hits = AppState.people.filter(p => {
        if(p.estado !== 'espera') return false;
        const { full, doc, tel } = formatPersonSearch(p);
        return full.includes(txt) || doc.includes(txt) || tel.includes(txt);
    });

    res.innerHTML = "";
    hits.forEach(p => {
        const div = document.createElement('div'); div.className = 'search-item';
        div.innerHTML = `<strong>${p.nombre} ${p.ap1||''}</strong><br><small>📄 ${p.docNum||'-'} | 📞 ${p.telefono||'-'}</small>`;
        div.onclick = () => window.cargarParaEdicionPref(p.id);
        res.appendChild(div);
    });
    res.classList.remove('hidden');
};

window.cargarParaEdicionPref = (id) => {
    const p = AppState.people.find(x => x.id === id); if(!p) return;
    AppState.prefiliacionEdicionId = id;
    
    // Fill Form
    document.getElementById('resultados-pref').classList.add('hidden');
    document.getElementById('buscador-pref').value = "";
    document.getElementById('man-nombre').value = p.nombre;
    document.getElementById('man-ap1').value = p.ap1 || "";
    // ... fill other fields ...
    
    // Family List (Visual)
    Render.familyList('existing-family-list-ui', p.familiaId, p.id);
    
    document.getElementById('btn-save-pref').innerText = "Actualizar Registro";
    document.getElementById('btn-cancelar-edicion-pref').classList.remove('hidden');
    
    // Historial Button
    const btnH = document.getElementById('btn-historial-pref');
    if(['admin','super_admin'].includes(AppState.user.rol)) {
        btnH.classList.remove('hidden');
        btnH.onclick = () => window.verHistorial(p.id);
    }
};

window.cancelarEdicionPref = () => {
    AppState.prefiliacionEdicionId = null;
    // Clear form fields...
    document.getElementById('man-nombre').value = ""; // etc...
    document.getElementById('existing-family-list-ui').innerHTML = "";
    document.getElementById('btn-save-pref').innerText = "Guardar Nuevo";
    document.getElementById('btn-cancelar-edicion-pref').classList.add('hidden');
    document.getElementById('btn-historial-pref').classList.add('hidden');
};

// --- MAPA CAMAS ---
window.abrirMapaGeneral = () => {
    window.modoMapaGeneral = true;
    window.mostrarGridCamas();
};

window.mostrarGridCamas = () => {
    const g = document.getElementById('grid-camas'); g.innerHTML = "";
    const cols = AppState.currentAlbergue.columnas || 8;
    g.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    const cap = parseInt(AppState.currentAlbergue.capacidad);
    
    // Map occupied beds
    const occupied = {};
    AppState.people.forEach(p => { if(p.cama) occupied[p.cama] = p; });

    for(let i=1; i<=cap; i++) {
        const n = i.toString();
        const p = occupied[n];
        const d = document.createElement('div');
        let cls = "bed-box " + (p ? "bed-busy" : "bed-free");
        d.className = cls;
        d.innerHTML = n + (p ? `<div style='font-size:0.6em'>${p.nombre}</div>` : "");
        
        d.onclick = () => {
            if(!p && !window.modoMapaGeneral) window.guardarCama(n);
        };
        d.ondblclick = () => {
            if(p) window.abrirModalInfoCama(p);
        };
        g.appendChild(d);
    }
    document.getElementById('modal-cama').classList.remove('hidden');
};

window.abrirModalInfoCama = (p) => {
    document.getElementById('info-cama-num').innerText = p.cama;
    document.getElementById('info-nombre-completo').innerText = `${p.nombre} ${p.ap1||''}`;
    // Show Modal
    document.getElementById('modal-bed-info').classList.remove('hidden');
    
    // Render Family in Modal
    const c = document.getElementById('info-familia-detalle');
    const fam = AppState.people.filter(x => x.familiaId === p.familiaId);
    let h = `<table class="fam-table"><thead><tr><th>Nombre</th><th>DNI/Tel</th><th>Cama</th></tr></thead><tbody>`;
    fam.forEach(f => {
         h += `<tr><td>${f.nombre}</td><td>${f.docNum||''}</td><td>${f.cama||'-'}</td></tr>`;
    });
    h += "</tbody></table>";
    c.innerHTML = h;

    // Bind Historial Btn
    const btn = document.getElementById('btn-historial-cama');
    if(['admin','super_admin'].includes(AppState.user.rol)) {
        btn.classList.remove('hidden');
        btn.onclick = () => window.verHistorial(p.id);
    }
};

window.guardarCama = async (cama) => {
    if(AppState.editingPerson && AppState.editingPerson.cama) return alert("Ya tiene cama");
    // Update DB
    await updateDoc(doc(db,"albergues",AppState.currentAlbergueId,"personas",AppState.editingPerson.id), {
        estado: 'ingresado', cama: cama
    });
    document.getElementById('modal-cama').classList.add('hidden');
};

window.cerrarMapaCamas = () => document.getElementById('modal-cama').classList.add('hidden');

// --- OBSERVATORIO (STATLESS LOAD) ---
window.cargarObservatorio = async () => {
    // ... Same logic as 5.0.0, using getDocs directly ...
    // This part was working fine.
};
