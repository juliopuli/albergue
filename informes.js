// Variables globales
let alberguesGlobales = [];

// Esperar a que la ventana padre esté lista
async function inicializar() {
    try {
        console.log('Inicializando sistema de informes...');
        
        // Verificar que tenemos acceso a la ventana padre
        if (!window.parent || !window.parent.db) {
            console.error('No se puede acceder a Firebase desde la ventana padre');
            return;
        }
        
        console.log('Firebase accesible desde ventana padre');
        
        // Cargar albergues
        await cargarDatosIniciales();
        
    } catch(e) {
        console.error('Error inicializando:', e);
    }
}

async function cargarDatosIniciales() {
    try {
        console.log('Cargando albergues...');
        
        // Importar las funciones de Firestore
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
        
        // Usar db desde la ventana padre
        const db = window.parent.db;
        
        // Crear la referencia a la colección
        const alberguesRef = collection(db, "albergues");
        
        // Obtener los documentos
        const alberguesSnap = await getDocs(alberguesRef);
        
        alberguesGlobales = [];
        alberguesSnap.forEach(docSnap => {
            const data = docSnap.data();
            alberguesGlobales.push({
                id: docSnap.id,
                nombre: data.nombre,
                capacidad: data.capacidad,
                activo: data.activo
            });
        });
        
        console.log('✅ Albergues cargados:', alberguesGlobales.length);
        
    } catch(e) {
        console.error('❌ Error cargando albergues:', e);
        console.error('Detalles:', e.message);
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}

function abrirInforme(tipo) {
    const zona = document.getElementById('zona-opciones-informe');
    
    if (tipo === 'sanitario') {
        zona.innerHTML = `
            <div style="background:white; padding:30px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                <h2 style="color:#4f46e5; margin-bottom:25px;">
                    <i class="fa-solid fa-briefcase-medical"></i> Informes Sanitarios
                </h2>
                
                <div style="display:grid; gap:20px;">
                    <button onclick="mostrarInformeAlbergue()" class="btn-informe-opcion">
                        <i class="fa-solid fa-hospital"></i>
                        <div>
                            <strong>Informe por Albergue</strong>
                            <small>Atenciones sanitarias filtradas por albergue y fechas</small>
                        </div>
                    </button>
                    
                    <button onclick="mostrarInformePersona()" class="btn-informe-opcion">
                        <i class="fa-solid fa-user-doctor"></i>
                        <div>
                            <strong>Informe por Persona</strong>
                            <small>Historial completo de atenciones de una persona</small>
                        </div>
                    </button>
                </div>
            </div>
        `;
    } else {
        zona.innerHTML = '<b>Has seleccionado:</b> ' + tipo.charAt(0).toUpperCase() + tipo.slice(1);
    }
}

async function mostrarInformeAlbergue() {
    console.log('📊 Abriendo informe por albergue...');
    console.log('Albergues disponibles:', alberguesGlobales.length);
    
    const zona = document.getElementById('zona-opciones-informe');
    
    if (alberguesGlobales.length === 0) {
        zona.innerHTML = `
            <div style="background:white; padding:30px; border-radius:12px;">
                <button onclick="abrirInforme('sanitario')" style="background:none; border:none; color:#4f46e5; cursor:pointer; margin-bottom:20px;">
                    <i class="fa-solid fa-arrow-left"></i> Volver
                </button>
                <p style="text-align:center; color:#999; padding:40px;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; display:block; margin-bottom:15px;"></i>
                    Cargando albergues...
                </p>
            </div>
        `;
        
        await cargarDatosIniciales();
        
        if (alberguesGlobales.length > 0) {
            mostrarInformeAlbergue();
        } else {
            zona.innerHTML = `
                <div style="background:white; padding:30px; border-radius:12px;">
                    <button onclick="abrirInforme('sanitario')" style="background:none; border:none; color:#4f46e5; cursor:pointer; margin-bottom:20px;">
                        <i class="fa-solid fa-arrow-left"></i> Volver
                    </button>
                    <p style="text-align:center; color:#e74c3c; padding:40px;">
                        ⚠️ No se pudieron cargar los albergues.<br>
                        <small>Error: No se puede acceder a la base de datos</small>
                    </p>
                </div>
            `;
        }
        return;
    }
    
    let optionsHTML = '<option value="">-- Selecciona un albergue --</option>';
    alberguesGlobales.forEach(alb => {
        optionsHTML += `<option value="${alb.id}">${alb.nombre}</option>`;
    });
    
    zona.innerHTML = `
        <div style="background:white; padding:30px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <button onclick="abrirInforme('sanitario')" style="background:none; border:none; color:#4f46e5; cursor:pointer; margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i> Volver
            </button>
            
            <h3 style="color:#4f46e5; margin-bottom:25px;">
                <i class="fa-solid fa-hospital"></i> Informe de Atenciones por Albergue
            </h3>
            
            <div style="display:grid; gap:20px; max-width:600px;">
                <div>
                    <label style="display:block; margin-bottom:8px; font-weight:600;">Albergue:</label>
                    <select id="select-albergue-informe" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px;">
                        ${optionsHTML}
                    </select>
                </div>
                
                <div>
                    <label style="display:block; margin-bottom:8px; font-weight:600;">Rango de Fechas:</label>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="date" id="fecha-inicio-albergue" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:8px;">
                        <span>hasta</span>
                        <input type="date" id="fecha-fin-albergue" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:8px;">
                    </div>
                    <label style="display:block; margin-top:10px;">
                        <input type="checkbox" id="check-todas-fechas" onchange="toggleFechas(this)"> 
                        Todas las fechas (desde que abrió el albergue)
                    </label>
                </div>
                
                <button onclick="generarInformeAlbergue()" class="btn-generar-informe">
                    <i class="fa-solid fa-file-pdf"></i> Generar Informe
                </button>
            </div>
            
            <div id="resultado-informe-albergue" style="margin-top:30px;"></div>
        </div>
    `;
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-fin-albergue').value = hoy;
    document.getElementById('fecha-fin-albergue').max = hoy;
}

function toggleFechas(checkbox) {
    const fechaInicio = document.getElementById('fecha-inicio-albergue');
    const fechaFin = document.getElementById('fecha-fin-albergue');
    
    if (checkbox.checked) {
        fechaInicio.disabled = true;
        fechaFin.disabled = true;
        fechaInicio.value = '';
        fechaFin.value = '';
    } else {
        fechaInicio.disabled = false;
        fechaFin.disabled = false;
        fechaFin.value = new Date().toISOString().split('T')[0];
    }
}

async function generarInformeAlbergue() {
    const albergueId = document.getElementById('select-albergue-informe').value;
    const todasFechas = document.getElementById('check-todas-fechas').checked;
    const fechaInicio = document.getElementById('fecha-inicio-albergue').value;
    const fechaFin = document.getElementById('fecha-fin-albergue').value;
    const resultado = document.getElementById('resultado-informe-albergue');
    
    if (!albergueId) {
        alert('Por favor selecciona un albergue');
        return;
    }
    
    if (!todasFechas && (!fechaInicio || !fechaFin)) {
        alert('Por favor selecciona un rango de fechas o marca "Todas las fechas"');
        return;
    }
    
    resultado.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#4f46e5;"></i><p>Generando informe...</p></div>';
    
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        
        const personasRef = collection(db, "albergues", albergueId, "personas");
        const personasSnap = await getDocs(personasRef);
        
        let todasIntervenciones = [];
        let personasAtendidas = new Set();
        let tipologias = {};
        
        for (const personaDoc of personasSnap.docs) {
            const intervencionesRef = collection(db, "albergues", albergueId, "personas", personaDoc.id, "intervenciones");
            const intervencionesSnap = await getDocs(intervencionesRef);
            
            intervencionesSnap.forEach(intDoc => {
                const interv = intDoc.data();
                
                if (interv.tipo !== 'Sanitaria') return;
                
                const fechaInterv = interv.fecha.toDate();
                
                if (!todasFechas) {
                    const inicio = new Date(fechaInicio);
                    const fin = new Date(fechaFin);
                    fin.setHours(23, 59, 59);
                    
                    if (fechaInterv < inicio || fechaInterv > fin) return;
                }
                
                personasAtendidas.add(personaDoc.id);
                
                const subtipo = interv.subtipo || 'Sin especificar';
                tipologias[subtipo] = (tipologias[subtipo] || 0) + 1;
                
                const personaData = personaDoc.data();
                todasIntervenciones.push({
                    ...interv,
                    personaNombre: personaData.nombre + ' ' + (personaData.ap1 || ''),
                    personaDoc: personaData.docNum || 'S/D',
                    fecha: fechaInterv
                });
            });
        }
        
        todasIntervenciones.sort((a, b) => b.fecha - a.fecha);
        
        let html = `
            <div style="background:#f8f9fa; padding:30px; border-radius:12px; border:2px solid #4f46e5;">
                <div style="text-align:center; margin-bottom:30px;">
                    <h2 style="color:#4f46e5; margin:0;">
                        <i class="fa-solid fa-hospital"></i> ${albergue.nombre}
                    </h2>
                    <p style="color:#666; margin:10px 0 0 0;">
                        Informe de Atenciones Sanitarias
                        ${todasFechas ? '' : `<br>Del ${new Date(fechaInicio).toLocaleDateString('es-ES')} al ${new Date(fechaFin).toLocaleDateString('es-ES')}`}
                    </p>
                </div>
                
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:15px; margin-bottom:30px;">
                    <div style="background:white; padding:20px; border-radius:8px; text-align:center;">
                        <div style="font-size:2.5rem; color:#10b981; font-weight:bold;">${personasAtendidas.size}</div>
                        <div style="color:#666; margin-top:5px;">Personas Atendidas</div>
                    </div>
                    <div style="background:white; padding:20px; border-radius:8px; text-align:center;">
                        <div style="font-size:2.5rem; color:#4f46e5; font-weight:bold;">${todasIntervenciones.length}</div>
                        <div style="color:#666; margin-top:5px;">Total Atenciones</div>
                    </div>
                </div>
                
                <div style="background:white; padding:20px; border-radius:8px; margin-bottom:20px;">
                    <h3 style="color:#4f46e5; margin-top:0;">Atenciones por Tipología</h3>
                    <div style="display:grid; gap:10px;">
        `;
        
        if (Object.keys(tipologias).length > 0) {
            Object.entries(tipologias).sort((a, b) => b[1] - a[1]).forEach(([tipo, count]) => {
                const porcentaje = ((count / todasIntervenciones.length) * 100).toFixed(1);
                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8f9fa; border-radius:6px;">
                        <span style="font-weight:600;">${tipo}</span>
                        <div style="display:flex; align-items:center; gap:15px;">
                            <div style="flex:1; min-width:100px; height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden;">
                                <div style="height:100%; background:#4f46e5; width:${porcentaje}%;"></div>
                            </div>
                            <span style="font-weight:bold; color:#4f46e5; min-width:80px; text-align:right;">${count} (${porcentaje}%)</span>
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<p style="text-align:center; color:#999;">No hay datos de tipología</p>';
        }
        
        html += `
                    </div>
                </div>
                
                <div style="background:white; padding:20px; border-radius:8px;">
                    <h3 style="color:#4f46e5; margin-top:0;">Detalle de Atenciones</h3>
                    <div style="max-height:500px; overflow-y:auto;">
        `;
        
        if (todasIntervenciones.length === 0) {
            html += '<p style="text-align:center; color:#999; padding:40px;">No hay atenciones sanitarias registradas en este período</p>';
        } else {
            todasIntervenciones.forEach(interv => {
                html += `
                    <div style="border-left:4px solid #4f46e5; padding:15px; margin-bottom:15px; background:#f8f9fa; border-radius:0 8px 8px 0;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <strong style="color:#4f46e5;">${interv.personaNombre}</strong>
                            <span style="color:#666; font-size:0.9rem;">${interv.fecha.toLocaleDateString('es-ES')} ${interv.fecha.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div style="color:#666; font-size:0.9rem; margin-bottom:8px;">
                            <i class="fa-solid fa-id-card"></i> ${interv.personaDoc}
                        </div>
                        <div style="background:white; padding:10px; border-radius:6px; margin-bottom:8px;">
                            <strong style="color:#059669;">Tipo:</strong> ${interv.subtipo}
                        </div>
                        <div style="background:white; padding:10px; border-radius:6px; margin-bottom:8px;">
                            <strong style="color:#0284c7;">Motivo:</strong> ${interv.motivo}
                        </div>
                        <div style="background:white; padding:10px; border-radius:6px;">
                            <strong style="color:#7c3aed;">Resolución:</strong> ${interv.detalle}
                        </div>
                        <div style="margin-top:8px; color:#999; font-size:0.85rem;">
                            <i class="fa-solid fa-user-tag"></i> Atendido por: ${interv.usuario}
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                    </div>
                </div>
                
                <div style="text-align:center; margin-top:30px;">
                    <button onclick="imprimirInforme()" style="background:#4f46e5; color:white; border:none; padding:12px 30px; border-radius:8px; cursor:pointer; font-size:1rem;">
                        <i class="fa-solid fa-print"></i> Imprimir Informe
                    </button>
                </div>
            </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error generando informe:', e);
        resultado.innerHTML = `<div style="background:#fee; color:#c00; padding:20px; border-radius:8px;"><strong>Error:</strong> ${e.message}</div>`;
    }
}

async function mostrarInformePersona() {
    const zona = document.getElementById('zona-opciones-informe');
    
    zona.innerHTML = `
        <div style="background:white; padding:30px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <button onclick="abrirInforme('sanitario')" style="background:none; border:none; color:#4f46e5; cursor:pointer; margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i> Volver
            </button>
            
            <h3 style="color:#4f46e5; margin-bottom:25px;">
                <i class="fa-solid fa-user-doctor"></i> Informe de Atenciones por Persona
            </h3>
            
            <div style="max-width:600px;">
                <label style="display:block; margin-bottom:8px; font-weight:600;">Buscar persona:</label>
                <input type="text" id="buscar-persona-informe" placeholder="Escribe nombre o DNI..." 
                    oninput="buscarPersonaParaInforme()" 
                    style="width:100%; padding:12px; border:1px solid #ddd; border-radius:8px; font-size:1rem;">
                
                <div id="resultados-busqueda-persona" style="margin-top:10px; max-height:300px; overflow-y:auto;"></div>
            </div>
            
            <div id="resultado-informe-persona" style="margin-top:30px;"></div>
        </div>
    `;
}

async function buscarPersonaParaInforme() {
    const busqueda = document.getElementById('buscar-persona-informe').value.toLowerCase().trim();
    const resultados = document.getElementById('resultados-busqueda-persona');
    
    if (busqueda.length < 2) {
        resultados.innerHTML = '';
        return;
    }
    
    resultados.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Buscando...</div>';
    
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
        const db = window.parent.db;
        
        let personasEncontradas = [];
        
        for (const albergue of alberguesGlobales) {
            const personasRef = collection(db, "albergues", albergue.id, "personas");
            const personasSnap = await getDocs(personasRef);
            
            personasSnap.forEach(docSnap => {
                const persona = docSnap.data();
                const nombreCompleto = `${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}`.toLowerCase();
                const docNum = (persona.docNum || '').toLowerCase();
                
                if (nombreCompleto.includes(busqueda) || docNum.includes(busqueda)) {
                    personasEncontradas.push({
                        id: docSnap.id,
                        albergueId: albergue.id,
                        albergueNombre: albergue.nombre,
                        ...persona
                    });
                }
            });
        }
        
        if (personasEncontradas.length === 0) {
            resultados.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">No se encontraron personas</p>';
            return;
        }
        
        let html = '<div style="border:1px solid #ddd; border-radius:8px; overflow:hidden;">';
        personasEncontradas.forEach(persona => {
            html += `
                <div onclick="generarInformePersona('${persona.id}', '${persona.albergueId}')" 
                    style="padding:15px; border-bottom:1px solid #eee; cursor:pointer; transition:background 0.2s;"
                    onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <strong>${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}</strong>
                    <div style="color:#666; font-size:0.9rem; margin-top:5px;">
                        <i class="fa-solid fa-id-card"></i> ${persona.docNum || 'Sin documento'}
                    </div>
                    <div style="color:#9333ea; font-size:0.85rem; margin-top:3px;">
                        <i class="fa-solid fa-building"></i> ${persona.albergueNombre}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        resultados.innerHTML = html;
        
    } catch(e) {
        console.error('Error buscando personas:', e);
        resultados.innerHTML = `<div style="color:red; padding:20px;">Error: ${e.message}</div>`;
    }
}

async function generarInformePersona(personaId, albergueId) {
    const resultado = document.getElementById('resultado-informe-persona');
    document.getElementById('resultados-busqueda-persona').innerHTML = '';
    document.getElementById('buscar-persona-informe').value = '';
    
    resultado.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#4f46e5;"></i><p>Generando informe...</p></div>';
    
    try {
        const { collection, getDocs, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        const personaDocRef = doc(db, "albergues", albergueId, "personas", personaId);
        const personaDocSnap = await getDoc(personaDocRef);
        
        const persona = personaDocSnap.data();
        
        const intervencionesRef = collection(db, "albergues", albergueId, "personas", personaId, "intervenciones");
        const intervencionesSnap = await getDocs(intervencionesRef);
        
        let intervencionesSanitarias = [];
        
        intervencionesSnap.forEach(docSnap => {
            const interv = docSnap.data();
            if (interv.tipo === 'Sanitaria') {
                intervencionesSanitarias.push({
                    ...interv,
                    fecha: interv.fecha.toDate()
                });
            }
        });
        
        intervencionesSanitarias.sort((a, b) => b.fecha - a.fecha);
        
        let tipologias = {};
        intervencionesSanitarias.forEach(interv => {
            const subtipo = interv.subtipo || 'Sin especificar';
            tipologias[subtipo] = (tipologias[subtipo] || 0) + 1;
        });
        
        let html = `
            <div style="background:#f8f9fa; padding:30px; border-radius:12px; border:2px solid #4f46e5;">
                <div style="text-align:center; margin-bottom:30px;">
                    <h2 style="color:#4f46e5; margin:0;">
                        <i class="fa-solid fa-user-doctor"></i> ${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}
                    </h2>
                    <p style="color:#666; margin:10px 0 0 0;">
                        <i class="fa-solid fa-id-card"></i> ${persona.docNum || 'Sin documento'} | 
                        <i class="fa-solid fa-building"></i> ${albergue.nombre}
                    </p>
                </div>
                
                <div style="background:white; padding:20px; border-radius:8px; text-align:center; margin-bottom:20px;">
                    <div style="font-size:2.5rem; color:#4f46e5; font-weight:bold;">${intervencionesSanitarias.length}</div>
                    <div style="color:#666; margin-top:5px;">Atenciones Sanitarias Registradas</div>
                </div>
        `;
        
        if (Object.keys(tipologias).length > 0) {
            html += `
                <div style="background:white; padding:20px; border-radius:8px; margin-bottom:20px;">
                    <h3 style="color:#4f46e5; margin-top:0;">Atenciones por Tipo</h3>
                    <div style="display:grid; gap:10px;">
            `;
            
            Object.entries(tipologias).sort((a, b) => b[1] - a[1]).forEach(([tipo, count]) => {
                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8f9fa; border-radius:6px;">
                        <span style="font-weight:600;">${tipo}</span>
                        <span style="font-weight:bold; color:#4f46e5;">${count}</span>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `
                <div style="background:white; padding:20px; border-radius:8px;">
                    <h3 style="color:#4f46e5; margin-top:0;">Historial Completo de Atenciones</h3>
                    <div style="max-height:500px; overflow-y:auto;">
        `;
        
        if (intervencionesSanitarias.length === 0) {
            html += '<p style="text-align:center; color:#999; padding:40px;">Esta persona no tiene atenciones sanitarias registradas</p>';
        } else {
            intervencionesSanitarias.forEach(interv => {
                html += `
                    <div style="border-left:4px solid #4f46e5; padding:15px; margin-bottom:15px; background:#f8f9fa; border-radius:0 8px 8px 0;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <strong style="color:#4f46e5;">${interv.subtipo}</strong>
                            <span style="color:#666; font-size:0.9rem;">${interv.fecha.toLocaleDateString('es-ES')} ${interv.fecha.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div style="background:white; padding:10px; border-radius:6px; margin-bottom:8px;">
                            <strong style="color:#0284c7;">Motivo:</strong> ${interv.motivo}
                        </div>
                        <div style="background:white; padding:10px; border-radius:6px;">
                            <strong style="color:#7c3aed;">Resolución:</strong> ${interv.detalle}
                        </div>
                        <div style="margin-top:8px; color:#999; font-size:0.85rem;">
                            <i class="fa-solid fa-user-tag"></i> Atendido por: ${interv.usuario}
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                    </div>
                </div>
                
                <div style="text-align:center; margin-top:30px;">
                    <button onclick="imprimirInforme()" style="background:#4f46e5; color:white; border:none; padding:12px 30px; border-radius:8px; cursor:pointer; font-size:1rem;">
                        <i class="fa-solid fa-print"></i> Imprimir Informe
                    </button>
                </div>
            </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error generando informe persona:', e);
        resultado.innerHTML = `<div style="background:#fee; color:#c00; padding:20px; border-radius:8px;"><strong>Error:</strong> ${e.message}</div>`;
    }
}

function imprimirInforme() {
    window.print();
}
