// ============================================
// SISTEMA DE INFORMES v3.0
// PARTE 1 de 4: Inicialización y Dashboard
// ============================================

let alberguesGlobales = [];
let datosCache = {
    sanitario: null,
    entregas: null,
    psicosocial: null,
    lastUpdate: null
};

// ============================================
// INICIALIZACIÓN
// ============================================

async function inicializar() {
    try {
        console.log('🚀 Inicializando sistema de informes v3.0...');
        
        if (!window.parent || !window.parent.db || !window.parent.firebaseModules) {
            console.error('❌ No se puede acceder a Firebase desde la ventana padre');
            return;
        }
        
        console.log('✅ Firebase accesible');
        await cargarDatosIniciales();
        mostrarDashboard();
        
    } catch(e) {
        console.error('Error inicializando:', e);
    }
}

async function cargarDatosIniciales() {
    try {
        const { collection, getDocs } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        const alberguesSnap = await getDocs(collection(db, "albergues"));
        
        alberguesGlobales = [];
        alberguesSnap.forEach(docSnap => {
            const data = docSnap.data();
            alberguesGlobales.push({
                id: docSnap.id,
                nombre: data.nombre || 'Sin nombre',
                capacidad: data.capacidad || 0,
                activo: data.activo !== false
            });
        });
        
        console.log('✅ Albergues cargados:', alberguesGlobales.length);
        
    } catch(e) {
        console.error('❌ Error cargando albergues:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}

// ============================================
// DASHBOARD PRINCIPAL
// ============================================

function mostrarDashboard() {
    const zona = document.getElementById('zona-opciones-informe');
    
    let alberguesOptions = '<option value="">📊 Todos los albergues</option>';
    alberguesGlobales.forEach(alb => {
        alberguesOptions += `<option value="${alb.id}">${alb.nombre}</option>`;
    });
    
    zona.innerHTML = `
        <div class="dashboard-container">
            <div class="dashboard-header">
                <h1><i class="fa-solid fa-chart-line"></i> Panel de Informes y Estadísticas</h1>
            </div>
            
            <div class="dashboard-filters">
                <div class="filter-group">
                    <label><i class="fa-solid fa-building"></i> Albergue:</label>
                    <select id="filter-albergue" onchange="actualizarDashboard()">
                        ${alberguesOptions}
                    </select>
                </div>
                <div class="filter-group">
                    <label><i class="fa-solid fa-calendar"></i> Período:</label>
                    <select id="filter-periodo" onchange="actualizarDashboard()">
                        <option value="7">Última semana</option>
                        <option value="30" selected>Último mes</option>
                        <option value="90">Últimos 3 meses</option>
                        <option value="365">Último año</option>
                        <option value="all">Todo el histórico</option>
                    </select>
                </div>
                <button onclick="actualizarDashboard()" class="btn-refresh">
                    <i class="fa-solid fa-rotate"></i> Actualizar
                </button>
            </div>
            
            <div id="dashboard-kpis" class="dashboard-kpis">
                <div class="kpi-card kpi-loading">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <p>Cargando datos...</p>
                </div>
            </div>
            
            <div id="dashboard-charts" class="dashboard-charts"></div>
            
            <div class="informes-menu">
                <h2><i class="fa-solid fa-folder-open"></i> Informes Detallados</h2>
             <div class="informe-category">
                    <div class="category-header" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
                        <i class="fa-solid fa-building"></i>
                        <span>GESTIÓN DE ALBERGUE</span>
                    </div>
                    <div class="category-options">
                        <button onclick="abrirInformeGestionAlbergue()" class="btn-informe-option">
                            <i class="fa-solid fa-chart-line"></i>
                            <div>
                                <strong>Informe de Gestión</strong>
                                <small>Ocupación, demografía y listado completo</small>
                            </div>
                        </button>
                    </div>
                </div>   
                <div class="informe-category">
                    <div class="category-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                        <i class="fa-solid fa-briefcase-medical"></i>
                        <span>SANITARIO</span>
                    </div>
                    <div class="category-options">
                        <button onclick="abrirInformeSanitarioAlbergue()" class="btn-informe-option">
                            <i class="fa-solid fa-hospital"></i>
                            <div>
                                <strong>Por Albergue</strong>
                                <small>Estadísticas y listados de atenciones</small>
                            </div>
                        </button>
                        <button onclick="abrirInformeSanitarioPersona()" class="btn-informe-option">
                            <i class="fa-solid fa-user-doctor"></i>
                            <div>
                                <strong>Por Persona</strong>
                                <small>Historial médico individual</small>
                            </div>
                        </button>
                    </div>
                </div>
                
                <div class="informe-category">
                    <div class="category-header" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                        <i class="fa-solid fa-box"></i>
                        <span>ENTREGAS</span>
                    </div>
                    <div class="category-options">
                        <button onclick="abrirInformeEntregasAlbergue()" class="btn-informe-option">
                            <i class="fa-solid fa-warehouse"></i>
                            <div>
                                <strong>Por Albergue</strong>
                                <small>Inventario y distribución</small>
                            </div>
                        </button>
                        <button onclick="abrirInformeEntregasPersona()" class="btn-informe-option">
                            <i class="fa-solid fa-user-tag"></i>
                            <div>
                                <strong>Por Persona</strong>
                                <small>Historial de entregas recibidas</small>
                            </div>
                        </button>
                    </div>
                </div>
                
                <div class="informe-category">
                    <div class="category-header" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                        <i class="fa-solid fa-heart"></i>
                        <span>PSICOSOCIAL</span>
                    </div>
                    <div class="category-options">
                        <button onclick="abrirInformePsicosocialAlbergue()" class="btn-informe-option">
                            <i class="fa-solid fa-users"></i>
                            <div>
                                <strong>Por Albergue</strong>
                                <small>Intervenciones y seguimientos</small>
                            </div>
                        </button>
                        <button onclick="abrirInformePsicosocialPersona()" class="btn-informe-option">
                            <i class="fa-solid fa-user-check"></i>
                            <div>
                                <strong>Por Persona</strong>
                                <small>Historial de atención psicosocial</small>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setTimeout(() => actualizarDashboard(), 500);
}

// ============================================
// ACTUALIZACIÓN DEL DASHBOARD
// ============================================

async function actualizarDashboard() {
    const albergueId = document.getElementById('filter-albergue')?.value || '';
    const periodo = parseInt(document.getElementById('filter-periodo')?.value || '30');
    
    mostrarLoadingKPIs();
    
    try {
        const datos = await cargarDatosGenerales(albergueId, periodo);
        mostrarKPIs(datos);
        mostrarGraficos(datos);
    } catch(e) {
        console.error('Error actualizando dashboard:', e);
        mostrarErrorKPIs();
    }
}

function mostrarLoadingKPIs() {
    const kpisContainer = document.getElementById('dashboard-kpis');
    kpisContainer.innerHTML = `
        <div class="kpi-card kpi-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Cargando datos...</p>
        </div>
    `;
}

function mostrarErrorKPIs() {
    const kpisContainer = document.getElementById('dashboard-kpis');
    kpisContainer.innerHTML = `
        <div class="kpi-card kpi-error">
            <i class="fa-solid fa-circle-exclamation"></i>
            <p>Error al cargar datos</p>
        </div>
    `;
}

async function cargarDatosGenerales(albergueId, periodo) {
    const { collection, getDocs } = window.parent.firebaseModules;
    const db = window.parent.db;
    
    let alberguesACargar = albergueId ? [albergueId] : alberguesGlobales.map(a => a.id);
    
    let fechaLimite = null;
    if (periodo !== 'all') {
        fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - periodo);
    }
    
    let personasAtendidas = new Set();
    let totalPersonasHistorico = new Set(); // NUEVO
    let totalSanitarias = 0;
    let totalPsicosociales = 0;
    let totalEntregas = 0;
    let totalArticulos = 0;
    
    let tiposSanitarios = {};
    let tiposPsicosociales = {};
    let tiposEntregas = {};
    let materialesEntregados = {};
    
    for (const albId of alberguesACargar) {
        const personasSnap = await getDocs(collection(db, "albergues", albId, "personas"));
        
        for (const personaDoc of personasSnap.docs) {
            totalPersonasHistorico.add(personaDoc.id); // NUEVO - Contar todas las personas
            
            const intervencionesSnap = await getDocs(
                collection(db, "albergues", albId, "personas", personaDoc.id, "intervenciones")
            );
            
            intervencionesSnap.forEach(intDoc => {
                const interv = intDoc.data();
                const fechaInterv = interv.fecha.toDate();
                
                if (fechaLimite && fechaInterv < fechaLimite) return;
                
                personasAtendidas.add(personaDoc.id);
                
                if (interv.tipo === 'Sanitaria') {
                    totalSanitarias++;
                    const subtipo = interv.subtipo || 'Sin especificar';
                    tiposSanitarios[subtipo] = (tiposSanitarios[subtipo] || 0) + 1;
                }
                
                if (interv.tipo === 'Psicosocial') {
                    totalPsicosociales++;
                    const subtipo = interv.subtipo || 'Sin especificar';
                    tiposPsicosociales[subtipo] = (tiposPsicosociales[subtipo] || 0) + 1;
                }
                
                if (interv.tipo === 'Entregas') {
                    totalEntregas++;
                    const subtipo = interv.subtipo || 'Sin especificar';
                    tiposEntregas[subtipo] = (tiposEntregas[subtipo] || 0) + 1;
                    
                    if (interv.datosEstructurados) {
                        const datos = interv.datosEstructurados;
                        
                        if (datos.contenido_kit) {
                            const items = datos.contenido_kit.split(',').map(item => item.trim());
                            items.forEach(item => {
                                materialesEntregados[item] = (materialesEntregados[item] || 0) + 1;
                                totalArticulos++;
                            });
                        }
                        
                        if (datos.tipo_ropa) {
                            const items = datos.tipo_ropa.split(',').map(item => item.trim());
                            items.forEach(item => {
                                materialesEntregados[item] = (materialesEntregados[item] || 0) + 1;
                                totalArticulos++;
                            });
                        }
                        
                        if (datos.tipo_manta) {
                            const cantidad = parseInt(datos.cantidad_manta) || 1;
                            materialesEntregados[datos.tipo_manta] = (materialesEntregados[datos.tipo_manta] || 0) + cantidad;
                            totalArticulos += cantidad;
                        }
                    }
                }
            });
        }
    }
    
    return {
        personasAtendidas: personasAtendidas.size,
        totalPersonasHistorico: totalPersonasHistorico.size, // NUEVO
        totalSanitarias,
        totalPsicosociales,
        totalEntregas,
        totalArticulos,
        tiposSanitarios,
        tiposPsicosociales,
        tiposEntregas,
        materialesEntregados
    };
}

function mostrarKPIs(datos) {
    const kpisContainer = document.getElementById('dashboard-kpis');
    
    kpisContainer.innerHTML = `
        <div class="kpi-card kpi-historico">
            <div class="kpi-icon">
                <i class="fa-solid fa-users"></i>
            </div>
            <div class="kpi-data">
                <div class="kpi-value">${datos.totalPersonasHistorico}</div>
                <div class="kpi-label">Total Personas (Histórico)</div>
            </div>
        </div>
        
        <div class="kpi-card kpi-primary">
            <div class="kpi-icon">
                <i class="fa-solid fa-user-check"></i>
            </div>
            <div class="kpi-data">
                <div class="kpi-value">${datos.personasAtendidas}</div>
                <div class="kpi-label">Personas Atendidas</div>
            </div>
        </div>
        
        <div class="kpi-card kpi-sanitario">
            <div class="kpi-icon">
                <i class="fa-solid fa-briefcase-medical"></i>
            </div>
            <div class="kpi-data">
                <div class="kpi-value">${datos.totalSanitarias}</div>
                <div class="kpi-label">Atenciones Sanitarias</div>
            </div>
        </div>
        
        <div class="kpi-card kpi-psicosocial">
            <div class="kpi-icon">
                <i class="fa-solid fa-heart"></i>
            </div>
            <div class="kpi-data">
                <div class="kpi-value">${datos.totalPsicosociales}</div>
                <div class="kpi-label">Atenciones Psicosociales</div>
            </div>
        </div>
        
        <div class="kpi-card kpi-entregas">
            <div class="kpi-icon">
                <i class="fa-solid fa-box"></i>
            </div>
            <div class="kpi-data">
                <div class="kpi-value">${datos.totalEntregas}</div>
                <div class="kpi-label">Entregas Realizadas</div>
            </div>
        </div>
        
        <div class="kpi-card kpi-articulos">
            <div class="kpi-icon">
                <i class="fa-solid fa-cubes"></i>
            </div>
            <div class="kpi-data">
                <div class="kpi-value">${datos.totalArticulos}</div>
                <div class="kpi-label">Artículos Distribuidos</div>
            </div>
        </div>
    `;
}
function mostrarGraficos(datos) {
    const chartsContainer = document.getElementById('dashboard-charts');
    
    const topSanitarias = Object.entries(datos.tiposSanitarios)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    const topEntregas = Object.entries(datos.tiposEntregas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    const topMateriales = Object.entries(datos.materialesEntregados)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    let htmlCharts = '<div class="charts-grid">';
    
    if (topSanitarias.length > 0) {
        htmlCharts += `
            <div class="chart-card">
                <h3><i class="fa-solid fa-chart-bar"></i> Top 5 Atenciones Sanitarias</h3>
                <div class="chart-bars">
        `;
        
        const maxSan = topSanitarias[0][1];
        topSanitarias.forEach(([tipo, count]) => {
            const porcentaje = (count / maxSan * 100).toFixed(0);
            htmlCharts += `
                <div class="chart-bar-item">
                    <div class="chart-bar-label">${tipo}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${porcentaje}%; background: #667eea;"></div>
                        <div class="chart-bar-value">${count}</div>
                    </div>
                </div>
            `;
        });
        
        htmlCharts += `</div></div>`;
    }
    
    if (topEntregas.length > 0) {
        htmlCharts += `
            <div class="chart-card">
                <h3><i class="fa-solid fa-chart-bar"></i> Top 5 Categorías de Entregas</h3>
                <div class="chart-bars">
        `;
        
        const maxEnt = topEntregas[0][1];
        topEntregas.forEach(([tipo, count]) => {
            const porcentaje = (count / maxEnt * 100).toFixed(0);
            htmlCharts += `
                <div class="chart-bar-item">
                    <div class="chart-bar-label">${tipo}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${porcentaje}%; background: #f5576c;"></div>
                        <div class="chart-bar-value">${count}</div>
                    </div>
                </div>
            `;
        });
        
        htmlCharts += `</div></div>`;
    }
    
    if (topMateriales.length > 0) {
        htmlCharts += `
            <div class="chart-card chart-wide">
                <h3><i class="fa-solid fa-box-open"></i> Top 10 Materiales Distribuidos</h3>
                <div class="chart-bars">
        `;
        
        const maxMat = topMateriales[0][1];
        topMateriales.forEach(([material, count]) => {
            const porcentaje = (count / maxMat * 100).toFixed(0);
            htmlCharts += `
                <div class="chart-bar-item">
                    <div class="chart-bar-label">${material}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${porcentaje}%; background: #f093fb;"></div>
                        <div class="chart-bar-value">${count}</div>
                    </div>
                </div>
            `;
        });
        
        htmlCharts += `</div></div>`;
    }
    
    htmlCharts += '</div>';
    chartsContainer.innerHTML = htmlCharts;
}

// ============================================
// FIN DE LA PARTE 1 de 4
// Continúa en la PARTE 2...
// ============================================
// ============================================
// PARTE 2 de 4: INFORMES SANITARIOS
// ============================================

function abrirInformeSanitarioAlbergue() {
    const zona = document.getElementById('zona-opciones-informe');
    
    let alberguesOptions = '<option value="">-- Selecciona un albergue --</option>';
    alberguesGlobales.forEach(alb => {
        alberguesOptions += `<option value="${alb.id}">${alb.nombre}</option>`;
    });
    
    zona.innerHTML = `
        <div class="informe-detallado">
            <button onclick="mostrarDashboard()" class="btn-back">
                <i class="fa-solid fa-arrow-left"></i> Volver al Dashboard
            </button>
            
            <h2><i class="fa-solid fa-hospital"></i> Informe Sanitario por Albergue</h2>
            
            <div class="informe-filters">
                <div class="filter-group">
                    <label>Albergue:</label>
                    <select id="san-alb-select">${alberguesOptions}</select>
                </div>
                <div class="filter-group">
                    <label>Fecha Inicio:</label>
                    <input type="date" id="san-alb-fecha-inicio">
                </div>
                <div class="filter-group">
                    <label>Fecha Fin:</label>
                    <input type="date" id="san-alb-fecha-fin">
                </div>
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="san-alb-todas-fechas" onchange="toggleFechasSanAlb(this)">
                    Todas las fechas
                </label>
            </div>
            
            <button onclick="generarInformeSanitarioAlbergue()" class="btn-generar">
                <i class="fa-solid fa-file-pdf"></i> Generar Informe
            </button>
            
            <div id="resultado-san-alb"></div>
        </div>
    `;
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('san-alb-fecha-fin').value = hoy;
    document.getElementById('san-alb-fecha-fin').max = hoy;
}

function toggleFechasSanAlb(checkbox) {
    const inicio = document.getElementById('san-alb-fecha-inicio');
    const fin = document.getElementById('san-alb-fecha-fin');
    
    inicio.disabled = checkbox.checked;
    fin.disabled = checkbox.checked;
    
    if (!checkbox.checked) {
        fin.value = new Date().toISOString().split('T')[0];
    }
}

async function generarInformeSanitarioAlbergue() {
    const albergueId = document.getElementById('san-alb-select').value;
    const todasFechas = document.getElementById('san-alb-todas-fechas').checked;
    const fechaInicio = document.getElementById('san-alb-fecha-inicio').value;
    const fechaFin = document.getElementById('san-alb-fecha-fin').value;
    const resultado = document.getElementById('resultado-san-alb');
    
    if (!albergueId) {
        alert('Selecciona un albergue');
        return;
    }
    
    if (!todasFechas && (!fechaInicio || !fechaFin)) {
        alert('Selecciona un rango de fechas');
        return;
    }
    
    resultado.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Generando informe...</div>';
    
    try {
        const { collection, getDocs } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        const personasSnap = await getDocs(collection(db, "albergues", albergueId, "personas"));
        
        let intervenciones = [];
        let personasAtendidas = new Set();
        let tipologias = {};
        let urgencias = 0;
        let derivaciones = 0;
        
        for (const personaDoc of personasSnap.docs) {
            const personaData = personaDoc.data();
            const intervencionesSnap = await getDocs(
                collection(db, "albergues", albergueId, "personas", personaDoc.id, "intervenciones")
            );
            
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
                
                if (subtipo.includes('Urgente') || subtipo.includes('Primeros Auxilios')) {
                    urgencias++;
                }
                
                if (subtipo.includes('Derivación')) {
                    derivaciones++;
                }
                
                intervenciones.push({
                    personaNombre: personaData.nombre + ' ' + (personaData.ap1 || ''),
                    personaDni: personaData.docNum || 'S/D',
                    personaTel: personaData.telefono || 'S/T',
                    subtipo: subtipo,
                    fecha: fechaInterv,
                    count: 1
                });
            });
        }
        
        let personasConAtenciones = {};
        intervenciones.forEach(interv => {
            const key = interv.personaDni;
            if (!personasConAtenciones[key]) {
                personasConAtenciones[key] = {
                    nombre: interv.personaNombre,
                    dni: interv.personaDni,
                    telefono: interv.personaTel,
                    count: 0
                };
            }
            personasConAtenciones[key].count++;
        });
        
        const personasArray = Object.values(personasConAtenciones).sort((a, b) => b.count - a.count);
        const promedio = personasAtendidas.size > 0 ? (intervenciones.length / personasAtendidas.size).toFixed(2) : 0;
        
        let html = `
            <div class="informe-resultado">
                <div class="informe-header">
                    <h2><i class="fa-solid fa-hospital"></i> ${albergue.nombre}</h2>
                    <p class="informe-periodo">
                        ${todasFechas ? 'Todo el histórico' : 
                        `${new Date(fechaInicio).toLocaleDateString('es-ES')} - ${new Date(fechaFin).toLocaleDateString('es-ES')}`}
                    </p>
                </div>
                
                <div class="informe-kpis">
                    <div class="informe-kpi">
                        <div class="kpi-value">${personasAtendidas.size}</div>
                        <div class="kpi-label">Personas Atendidas</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${intervenciones.length}</div>
                        <div class="kpi-label">Atenciones Totales</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${promedio}</div>
                        <div class="kpi-label">Promedio por Persona</div>
                    </div>
                </div>
                
                <div class="informe-section">
                    <h3><i class="fa-solid fa-chart-pie"></i> Distribución por Tipo</h3>
                    <div class="chart-bars">
        `;
        
        const tiposOrdenados = Object.entries(tipologias).sort((a, b) => b[1] - a[1]);
        tiposOrdenados.forEach(([tipo, count]) => {
            const porcentaje = ((count / intervenciones.length) * 100).toFixed(1);
            const width = porcentaje;
            html += `
                <div class="chart-bar-item">
                    <div class="chart-bar-label">${tipo}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${width}%; background: #667eea;"></div>
                        <div class="chart-bar-value">${count} (${porcentaje}%)</div>
                    </div>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
                
                <div class="informe-section">
                    <h3><i class="fa-solid fa-ranking-star"></i> Top 10 Personas Más Atendidas</h3>
                    <table class="informe-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>DNI</th>
                                <th>Teléfono</th>
                                <th>Atenciones</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        personasArray.slice(0, 10).forEach((persona) => {
            html += `
                <tr>
                    <td><strong>${persona.nombre}</strong></td>
                    <td>${persona.dni}</td>
                    <td>${persona.telefono}</td>
                    <td><span class="badge-count">${persona.count}</span></td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                
                <div class="informe-section">
                    <h3><i class="fa-solid fa-chart-line"></i> Indicadores de Salud</h3>
                    <div class="indicadores-grid">
                        <div class="indicador-item">
                            <i class="fa-solid fa-exclamation-triangle"></i>
                            <div>
                                <strong>${urgencias}</strong>
                                <span>Urgencias Atendidas</span>
                            </div>
                        </div>
                        <div class="indicador-item">
                            <i class="fa-solid fa-hospital"></i>
                            <div>
                                <strong>${derivaciones}</strong>
                                <span>Derivaciones Hospitalarias</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="informe-actions">
                    <button onclick="window.print()" class="btn-action">
                        <i class="fa-solid fa-print"></i> Imprimir
                    </button>
                </div>
            </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultado.innerHTML = `<div class="error-message"><i class="fa-solid fa-circle-exclamation"></i> Error: ${e.message}</div>`;
    }
}

function abrirInformeSanitarioPersona() {
    const zona = document.getElementById('zona-opciones-informe');
    
    zona.innerHTML = `
        <div class="informe-detallado">
            <button onclick="mostrarDashboard()" class="btn-back">
                <i class="fa-solid fa-arrow-left"></i> Volver al Dashboard
            </button>
            
            <h2><i class="fa-solid fa-user-doctor"></i> Informe Sanitario por Persona</h2>
            
            <div class="search-container">
                <label>Buscar persona:</label>
                <input type="text" id="search-san-persona" placeholder="Nombre o DNI..." oninput="buscarPersonaSanitario()">
                <div id="results-san-persona"></div>
            </div>
            
            <div id="resultado-san-persona"></div>
        </div>
    `;
}

async function buscarPersonaSanitario() {
    const busqueda = document.getElementById('search-san-persona').value.toLowerCase().trim();
    const resultados = document.getElementById('results-san-persona');
    
    if (busqueda.length < 2) {
        resultados.innerHTML = '';
        resultados.style.display = 'none';
        return;
    }
    
    resultados.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    resultados.style.display = 'block';
    
    try {
        const { collection, getDocs } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        let personasEncontradas = [];
        
        for (const albergue of alberguesGlobales) {
            const personasSnap = await getDocs(collection(db, "albergues", albergue.id, "personas"));
            
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
            resultados.innerHTML = '<div class="search-no-results">No se encontraron personas</div>';
            return;
        }
        
        let html = '<div class="search-results">';
        personasEncontradas.forEach(persona => {
            html += `
                <div class="search-result-item" onclick="generarInformeSanitarioPersona('${persona.id}', '${persona.albergueId}')">
                    <div>
                        <strong>${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}</strong>
                        <div class="search-result-meta">
                            <span><i class="fa-solid fa-id-card"></i> ${persona.docNum || 'Sin documento'}</span>
                            <span><i class="fa-solid fa-building"></i> ${persona.albergueNombre}</span>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
            `;
        });
        html += '</div>';
        
        resultados.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultados.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
    }
}

async function generarInformeSanitarioPersona(personaId, albergueId) {
    const resultado = document.getElementById('resultado-san-persona');
    document.getElementById('results-san-persona').innerHTML = '';
    document.getElementById('results-san-persona').style.display = 'none';
    
    resultado.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Cargando historial...</div>';
    
    try {
        const { collection, getDocs, doc, getDoc } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        const personaSnap = await getDoc(doc(db, "albergues", albergueId, "personas", personaId));
        const persona = personaSnap.data();
        
        const intervencionesSnap = await getDocs(
            collection(db, "albergues", albergueId, "personas", personaId, "intervenciones")
        );
        
        let intervenciones = [];
        let tipologias = {};
        
        intervencionesSnap.forEach(docSnap => {
            const interv = docSnap.data();
            if (interv.tipo === 'Sanitaria') {
                intervenciones.push({
                    ...interv,
                    fecha: interv.fecha.toDate()
                });
                
                const subtipo = interv.subtipo || 'Sin especificar';
                tipologias[subtipo] = (tipologias[subtipo] || 0) + 1;
            }
        });
        
        intervenciones.sort((a, b) => b.fecha - a.fecha);
        
        let html = `
            <div class="informe-resultado">
                <div class="informe-header">
                    <h2><i class="fa-solid fa-user-doctor"></i> ${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}</h2>
                    <p class="informe-meta">
                        <span><i class="fa-solid fa-id-card"></i> ${persona.docNum || 'Sin documento'}</span>
                        <span><i class="fa-solid fa-building"></i> ${albergue.nombre}</span>
                    </p>
                </div>
                
                <div class="informe-kpis" style="justify-content: center;">
                    <div class="informe-kpi">
                        <div class="kpi-value">${intervenciones.length}</div>
                        <div class="kpi-label">Atenciones Registradas</div>
                    </div>
                </div>
        `;
        
        if (Object.keys(tipologias).length > 0) {
            html += `
                <div class="informe-section">
                    <h3><i class="fa-solid fa-chart-pie"></i> Atenciones por Tipo</h3>
                    <div class="chart-bars">
            `;
            
            const tiposOrdenados = Object.entries(tipologias).sort((a, b) => b[1] - a[1]);
            tiposOrdenados.forEach(([tipo, count]) => {
                html += `
                    <div class="chart-bar-item">
                        <div class="chart-bar-label">${tipo}</div>
                        <div class="chart-bar-container">
                            <div class="chart-bar-fill" style="width: 100%; background: #667eea;"></div>
                            <div class="chart-bar-value">${count}</div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `
                <div class="informe-section">
                    <h3><i class="fa-solid fa-clock-rotate-left"></i> Historial Completo</h3>
                    <div class="historial-timeline">
        `;
        
        if (intervenciones.length === 0) {
            html += '<p class="no-data">No hay atenciones sanitarias registradas</p>';
        } else {
            intervenciones.forEach(interv => {
                html += `
                    <div class="historial-item">
                        <div class="historial-header">
                            <strong>${interv.subtipo}</strong>
                            <span>${interv.fecha.toLocaleDateString('es-ES')} ${interv.fecha.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div class="historial-content">
                            <p><strong>Motivo:</strong> ${interv.motivo}</p>
                            <p><strong>Resolución:</strong> ${interv.detalle}</p>
                            <p class="historial-meta"><i class="fa-solid fa-user-tag"></i> ${interv.usuario}</p>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                    </div>
                </div>
                
                <div class="informe-actions">
                    <button onclick="window.print()" class="btn-action">
                        <i class="fa-solid fa-print"></i> Imprimir
                    </button>
                </div>
            </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultado.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
    }
}

// ============================================
// FIN DE LA PARTE 2 de 4
// Continúa en la PARTE 3...
// ============================================
// ============================================
// PARTE 3 de 4: INFORMES DE ENTREGAS
// ============================================

function abrirInformeEntregasAlbergue() {
    const zona = document.getElementById('zona-opciones-informe');
    
    let alberguesOptions = '<option value="">-- Selecciona un albergue --</option>';
    alberguesGlobales.forEach(alb => {
        alberguesOptions += `<option value="${alb.id}">${alb.nombre}</option>`;
    });
    
    zona.innerHTML = `
        <div class="informe-detallado">
            <button onclick="mostrarDashboard()" class="btn-back">
                <i class="fa-solid fa-arrow-left"></i> Volver al Dashboard
            </button>
            
            <h2><i class="fa-solid fa-box"></i> Informe de Entregas por Albergue</h2>
            
            <div class="informe-filters">
                <div class="filter-group">
                    <label>Albergue:</label>
                    <select id="ent-alb-select">${alberguesOptions}</select>
                </div>
                <div class="filter-group">
                    <label>Fecha Inicio:</label>
                    <input type="date" id="ent-alb-fecha-inicio">
                </div>
                <div class="filter-group">
                    <label>Fecha Fin:</label>
                    <input type="date" id="ent-alb-fecha-fin">
                </div>
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="ent-alb-todas-fechas" onchange="toggleFechasEntAlb(this)">
                    Todas las fechas
                </label>
            </div>
            
            <button onclick="generarInformeEntregasAlbergue()" class="btn-generar">
                <i class="fa-solid fa-file-pdf"></i> Generar Informe
            </button>
            
            <div id="resultado-ent-alb"></div>
        </div>
    `;
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('ent-alb-fecha-fin').value = hoy;
    document.getElementById('ent-alb-fecha-fin').max = hoy;
}

function toggleFechasEntAlb(checkbox) {
    const inicio = document.getElementById('ent-alb-fecha-inicio');
    const fin = document.getElementById('ent-alb-fecha-fin');
    
    inicio.disabled = checkbox.checked;
    fin.disabled = checkbox.checked;
    
    if (!checkbox.checked) {
        fin.value = new Date().toISOString().split('T')[0];
    }
}

async function generarInformeEntregasAlbergue() {
    const albergueId = document.getElementById('ent-alb-select').value;
    const todasFechas = document.getElementById('ent-alb-todas-fechas').checked;
    const fechaInicio = document.getElementById('ent-alb-fecha-inicio').value;
    const fechaFin = document.getElementById('ent-alb-fecha-fin').value;
    const resultado = document.getElementById('resultado-ent-alb');
    
    if (!albergueId) {
        alert('Selecciona un albergue');
        return;
    }
    
    if (!todasFechas && (!fechaInicio || !fechaFin)) {
        alert('Selecciona un rango de fechas');
        return;
    }
    
    resultado.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Generando informe...</div>';
    
    try {
        const { collection, getDocs } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        const personasSnap = await getDocs(collection(db, "albergues", albergueId, "personas"));
        
        let entregas = [];
        let personasBeneficiadas = new Set();
        let categorias = {};
        let materialesEntregados = {};
        let totalArticulos = 0;
        
        for (const personaDoc of personasSnap.docs) {
            const personaData = personaDoc.data();
            const intervencionesSnap = await getDocs(
                collection(db, "albergues", albergueId, "personas", personaDoc.id, "intervenciones")
            );
            
            intervencionesSnap.forEach(intDoc => {
                const interv = intDoc.data();
                
                if (interv.tipo !== 'Entregas') return;
                
                const fechaInterv = interv.fecha.toDate();
                
                if (!todasFechas) {
                    const inicio = new Date(fechaInicio);
                    const fin = new Date(fechaFin);
                    fin.setHours(23, 59, 59);
                    
                    if (fechaInterv < inicio || fechaInterv > fin) return;
                }
                
                personasBeneficiadas.add(personaDoc.id);
                
                const subtipo = interv.subtipo || 'Sin especificar';
                categorias[subtipo] = (categorias[subtipo] || 0) + 1;
                
                if (interv.datosEstructurados) {
                    const datos = interv.datosEstructurados;
                    
                    if (datos.contenido_kit) {
                        const items = datos.contenido_kit.split(',').map(item => item.trim());
                        items.forEach(item => {
                            materialesEntregados[item] = (materialesEntregados[item] || 0) + 1;
                            totalArticulos++;
                        });
                    }
                    
                    if (datos.tipo_ropa) {
                        const items = datos.tipo_ropa.split(',').map(item => item.trim());
                        items.forEach(item => {
                            materialesEntregados[item] = (materialesEntregados[item] || 0) + 1;
                            totalArticulos++;
                        });
                    }
                    
                    if (datos.tipo_manta) {
                        const cantidad = parseInt(datos.cantidad_manta) || 1;
                        materialesEntregados[datos.tipo_manta] = (materialesEntregados[datos.tipo_manta] || 0) + cantidad;
                        totalArticulos += cantidad;
                    }
                }
                
                entregas.push({
                    personaNombre: personaData.nombre + ' ' + (personaData.ap1 || ''),
                    personaDni: personaData.docNum || 'S/D',
                    personaTel: personaData.telefono || 'S/T',
                    subtipo: subtipo,
                    fecha: fechaInterv
                });
            });
        }
        
        let personasConEntregas = {};
        entregas.forEach(entrega => {
            const key = entrega.personaDni;
            if (!personasConEntregas[key]) {
                personasConEntregas[key] = {
                    nombre: entrega.personaNombre,
                    dni: entrega.personaDni,
                    telefono: entrega.personaTel,
                    count: 0
                };
            }
            personasConEntregas[key].count++;
        });
        
        const personasArray = Object.values(personasConEntregas).sort((a, b) => b.count - a.count);
        
        let html = `
            <div class="informe-resultado">
                <div class="informe-header">
                    <h2><i class="fa-solid fa-box"></i> ${albergue.nombre}</h2>
                    <p class="informe-periodo">
                        ${todasFechas ? 'Todo el histórico' : 
                        `${new Date(fechaInicio).toLocaleDateString('es-ES')} - ${new Date(fechaFin).toLocaleDateString('es-ES')}`}
                    </p>
                </div>
                
                <div class="informe-kpis">
                    <div class="informe-kpi">
                        <div class="kpi-value">${personasBeneficiadas.size}</div>
                        <div class="kpi-label">Personas Beneficiadas</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${entregas.length}</div>
                        <div class="kpi-label">Entregas Realizadas</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${totalArticulos}</div>
                        <div class="kpi-label">Artículos Distribuidos</div>
                    </div>
                </div>
                
                <div class="informe-section">
                    <h3><i class="fa-solid fa-chart-pie"></i> Entregas por Categoría</h3>
                    <div class="chart-bars">
        `;
        
        const categoriasOrdenadas = Object.entries(categorias).sort((a, b) => b[1] - a[1]);
        categoriasOrdenadas.forEach(([cat, count]) => {
            const porcentaje = ((count / entregas.length) * 100).toFixed(1);
            html += `
                <div class="chart-bar-item">
                    <div class="chart-bar-label">${cat}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${porcentaje}%; background: #f5576c;"></div>
                        <div class="chart-bar-value">${count} (${porcentaje}%)</div>
                    </div>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
                
                <div class="informe-section">
                    <h3><i class="fa-solid fa-box-open"></i> Inventario de Materiales</h3>
                    <div class="materiales-grid">
        `;
        
        const materialesOrdenados = Object.entries(materialesEntregados).sort((a, b) => b[1] - a[1]);
        materialesOrdenados.forEach(([material, cantidad]) => {
            html += `
                <div class="material-item">
                    <i class="fa-solid fa-check-circle"></i>
                    <div>
                        <strong>${material}</strong>
                        <span class="badge-count">${cantidad}</span>
                    </div>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
                
                <div class="informe-section">
                    <h3><i class="fa-solid fa-ranking-star"></i> Top 10 Beneficiarios</h3>
                    <table class="informe-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>DNI</th>
                                <th>Teléfono</th>
                                <th>Entregas</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        personasArray.slice(0, 10).forEach(persona => {
            html += `
                <tr>
                    <td><strong>${persona.nombre}</strong></td>
                    <td>${persona.dni}</td>
                    <td>${persona.telefono}</td>
                    <td><span class="badge-count">${persona.count}</span></td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                
                <div class="informe-actions">
                    <button onclick="window.print()" class="btn-action">
                        <i class="fa-solid fa-print"></i> Imprimir
                    </button>
                </div>
            </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultado.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
    }
}

function abrirInformeEntregasPersona() {
    const zona = document.getElementById('zona-opciones-informe');
    
    zona.innerHTML = `
        <div class="informe-detallado">
            <button onclick="mostrarDashboard()" class="btn-back">
                <i class="fa-solid fa-arrow-left"></i> Volver al Dashboard
            </button>
            
            <h2><i class="fa-solid fa-user-tag"></i> Informe de Entregas por Persona</h2>
            
            <div class="search-container">
                <label>Buscar persona:</label>
                <input type="text" id="search-ent-persona" placeholder="Nombre o DNI..." oninput="buscarPersonaEntregas()">
                <div id="results-ent-persona"></div>
            </div>
            
            <div id="resultado-ent-persona"></div>
        </div>
    `;
}

async function buscarPersonaEntregas() {
    const busqueda = document.getElementById('search-ent-persona').value.toLowerCase().trim();
    const resultados = document.getElementById('results-ent-persona');
    
    if (busqueda.length < 2) {
        resultados.innerHTML = '';
        resultados.style.display = 'none';
        return;
    }
    
    resultados.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    resultados.style.display = 'block';
    
    try {
        const { collection, getDocs } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        let personasEncontradas = [];
        
        for (const albergue of alberguesGlobales) {
            const personasSnap = await getDocs(collection(db, "albergues", albergue.id, "personas"));
            
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
            resultados.innerHTML = '<div class="search-no-results">No se encontraron personas</div>';
            return;
        }
        
        let html = '<div class="search-results">';
        personasEncontradas.forEach(persona => {
            html += `
                <div class="search-result-item" onclick="generarInformeEntregasPersona('${persona.id}', '${persona.albergueId}')">
                    <div>
                        <strong>${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}</strong>
                        <div class="search-result-meta">
                            <span><i class="fa-solid fa-id-card"></i> ${persona.docNum || 'Sin documento'}</span>
                            <span><i class="fa-solid fa-building"></i> ${persona.albergueNombre}</span>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
            `;
        });
        html += '</div>';
        
        resultados.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultados.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
    }
}

async function generarInformeEntregasPersona(personaId, albergueId) {
    const resultado = document.getElementById('resultado-ent-persona');
    document.getElementById('results-ent-persona').innerHTML = '';
    document.getElementById('results-ent-persona').style.display = 'none';
    
    resultado.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Cargando historial...</div>';
    
    try {
        const { collection, getDocs, doc, getDoc } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        const personaSnap = await getDoc(doc(db, "albergues", albergueId, "personas", personaId));
        const persona = personaSnap.data();
        
        const intervencionesSnap = await getDocs(
            collection(db, "albergues", albergueId, "personas", personaId, "intervenciones")
        );
        
        let entregas = [];
        let categorias = {};
        
        intervencionesSnap.forEach(docSnap => {
            const interv = docSnap.data();
            if (interv.tipo === 'Entregas') {
                entregas.push({
                    ...interv,
                    fecha: interv.fecha.toDate()
                });
                
                const subtipo = interv.subtipo || 'Sin especificar';
                categorias[subtipo] = (categorias[subtipo] || 0) + 1;
            }
        });
        
        entregas.sort((a, b) => b.fecha - a.fecha);
        
        let html = `
            <div class="informe-resultado">
                <div class="informe-header">
                    <h2><i class="fa-solid fa-user-tag"></i> ${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}</h2>
                    <p class="informe-meta">
                        <span><i class="fa-solid fa-id-card"></i> ${persona.docNum || 'Sin documento'}</span>
                        <span><i class="fa-solid fa-building"></i> ${albergue.nombre}</span>
                    </p>
                </div>
                
                <div class="informe-kpis" style="justify-content: center;">
                    <div class="informe-kpi">
                        <div class="kpi-value">${entregas.length}</div>
                        <div class="kpi-label">Entregas Recibidas</div>
                    </div>
                </div>
        `;
        
        if (Object.keys(categorias).length > 0) {
            html += `
                <div class="informe-section">
                    <h3><i class="fa-solid fa-chart-pie"></i> Entregas por Tipo</h3>
                    <div class="chart-bars">
            `;
            
            const tiposOrdenados = Object.entries(categorias).sort((a, b) => b[1] - a[1]);
            tiposOrdenados.forEach(([tipo, count]) => {
                html += `
                    <div class="chart-bar-item">
                        <div class="chart-bar-label">${tipo}</div>
                        <div class="chart-bar-container">
                            <div class="chart-bar-fill" style="width: 100%; background: #f5576c;"></div>
                            <div class="chart-bar-value">${count}</div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `
                <div class="informe-section">
                    <h3><i class="fa-solid fa-clock-rotate-left"></i> Historial Completo</h3>
                    <div class="historial-timeline">
        `;
        
        if (entregas.length === 0) {
            html += '<p class="no-data">No hay entregas registradas</p>';
        } else {
            entregas.forEach(entrega => {
                html += `
                    <div class="historial-item">
                        <div class="historial-header">
                            <strong>${entrega.subtipo}</strong>
                            <span>${entrega.fecha.toLocaleDateString('es-ES')} ${entrega.fecha.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div class="historial-content">
                            <p><strong>Motivo:</strong> ${entrega.motivo}</p>
                            <p><strong>Detalles:</strong> ${entrega.detalle}</p>
                            <p class="historial-meta"><i class="fa-solid fa-user-tag"></i> ${entrega.usuario}</p>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                    </div>
                </div>
                
                <div class="informe-actions">
                    <button onclick="window.print()" class="btn-action">
                        <i class="fa-solid fa-print"></i> Imprimir
                    </button>
                </div>
            </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultado.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
    }
}

// ============================================
// FIN DE LA PARTE 3 de 4
// Continúa en la PARTE 4 (última)...
// ============================================
// ============================================
// PARTE 4 de 4: INFORMES PSICOSOCIALES (FINAL)
// ============================================

function abrirInformePsicosocialAlbergue() {
    const zona = document.getElementById('zona-opciones-informe');
    
    let alberguesOptions = '<option value="">-- Selecciona un albergue --</option>';
    alberguesGlobales.forEach(alb => {
        alberguesOptions += `<option value="${alb.id}">${alb.nombre}</option>`;
    });
    
    zona.innerHTML = `
        <div class="informe-detallado">
            <button onclick="mostrarDashboard()" class="btn-back">
                <i class="fa-solid fa-arrow-left"></i> Volver al Dashboard
            </button>
            
            <h2><i class="fa-solid fa-heart"></i> Informe Psicosocial por Albergue</h2>
            
            <div class="informe-filters">
                <div class="filter-group">
                    <label>Albergue:</label>
                    <select id="psi-alb-select">${alberguesOptions}</select>
                </div>
                <div class="filter-group">
                    <label>Fecha Inicio:</label>
                    <input type="date" id="psi-alb-fecha-inicio">
                </div>
                <div class="filter-group">
                    <label>Fecha Fin:</label>
                    <input type="date" id="psi-alb-fecha-fin">
                </div>
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="psi-alb-todas-fechas" onchange="toggleFechasPsiAlb(this)">
                    Todas las fechas
                </label>
            </div>
            
            <button onclick="generarInformePsicosocialAlbergue()" class="btn-generar">
                <i class="fa-solid fa-file-pdf"></i> Generar Informe
            </button>
            
            <div id="resultado-psi-alb"></div>
        </div>
    `;
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('psi-alb-fecha-fin').value = hoy;
    document.getElementById('psi-alb-fecha-fin').max = hoy;
}

function toggleFechasPsiAlb(checkbox) {
    const inicio = document.getElementById('psi-alb-fecha-inicio');
    const fin = document.getElementById('psi-alb-fecha-fin');
    
    inicio.disabled = checkbox.checked;
    fin.disabled = checkbox.checked;
    
    if (!checkbox.checked) {
        fin.value = new Date().toISOString().split('T')[0];
    }
}

async function generarInformePsicosocialAlbergue() {
    const albergueId = document.getElementById('psi-alb-select').value;
    const todasFechas = document.getElementById('psi-alb-todas-fechas').checked;
    const fechaInicio = document.getElementById('psi-alb-fecha-inicio').value;
    const fechaFin = document.getElementById('psi-alb-fecha-fin').value;
    const resultado = document.getElementById('resultado-psi-alb');
    
    if (!albergueId) {
        alert('Selecciona un albergue');
        return;
    }
    
    if (!todasFechas && (!fechaInicio || !fechaFin)) {
        alert('Selecciona un rango de fechas');
        return;
    }
    
    resultado.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Generando informe...</div>';
    
    try {
        const { collection, getDocs } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        const personasSnap = await getDocs(collection(db, "albergues", albergueId, "personas"));
        
        let intervenciones = [];
        let personasAtendidas = new Set();
        let tipologias = {};
        
        for (const personaDoc of personasSnap.docs) {
            const personaData = personaDoc.data();
            const intervencionesSnap = await getDocs(
                collection(db, "albergues", albergueId, "personas", personaDoc.id, "intervenciones")
            );
            
            intervencionesSnap.forEach(intDoc => {
                const interv = intDoc.data();
                
                if (interv.tipo !== 'Psicosocial') return;
                
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
                
                intervenciones.push({
                    personaNombre: personaData.nombre + ' ' + (personaData.ap1 || ''),
                    personaDni: personaData.docNum || 'S/D',
                    personaTel: personaData.telefono || 'S/T',
                    subtipo: subtipo,
                    fecha: fechaInterv
                });
            });
        }
        
        let personasConAtenciones = {};
        intervenciones.forEach(interv => {
            const key = interv.personaDni;
            if (!personasConAtenciones[key]) {
                personasConAtenciones[key] = {
                    nombre: interv.personaNombre,
                    dni: interv.personaDni,
                    telefono: interv.personaTel,
                    count: 0
                };
            }
            personasConAtenciones[key].count++;
        });
        
        const personasArray = Object.values(personasConAtenciones).sort((a, b) => b.count - a.count);
        const promedio = personasAtendidas.size > 0 ? (intervenciones.length / personasAtendidas.size).toFixed(2) : 0;
        
        let html = `
            <div class="informe-resultado">
                <div class="informe-header">
                    <h2><i class="fa-solid fa-heart"></i> ${albergue.nombre}</h2>
                    <p class="informe-periodo">
                        ${todasFechas ? 'Todo el histórico' : 
                        `${new Date(fechaInicio).toLocaleDateString('es-ES')} - ${new Date(fechaFin).toLocaleDateString('es-ES')}`}
                    </p>
                </div>
                
                <div class="informe-kpis">
                    <div class="informe-kpi">
                        <div class="kpi-value">${personasAtendidas.size}</div>
                        <div class="kpi-label">Personas Atendidas</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${intervenciones.length}</div>
                        <div class="kpi-label">Atenciones Totales</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${promedio}</div>
                        <div class="kpi-label">Promedio por Persona</div>
                    </div>
                </div>
                
                <div class="informe-section">
                    <h3><i class="fa-solid fa-chart-pie"></i> Distribución por Tipo</h3>
                    <div class="chart-bars">
        `;
        
        const tiposOrdenados = Object.entries(tipologias).sort((a, b) => b[1] - a[1]);
        tiposOrdenados.forEach(([tipo, count]) => {
            const porcentaje = ((count / intervenciones.length) * 100).toFixed(1);
            html += `
                <div class="chart-bar-item">
                    <div class="chart-bar-label">${tipo}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${porcentaje}%; background: #4facfe;"></div>
                        <div class="chart-bar-value">${count} (${porcentaje}%)</div>
                    </div>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
                
                <div class="informe-section">
                    <h3><i class="fa-solid fa-ranking-star"></i> Top 10 Personas Más Atendidas</h3>
                    <table class="informe-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>DNI</th>
                                <th>Teléfono</th>
                                <th>Atenciones</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        personasArray.slice(0, 10).forEach(persona => {
            html += `
                <tr>
                    <td><strong>${persona.nombre}</strong></td>
                    <td>${persona.dni}</td>
                    <td>${persona.telefono}</td>
                    <td><span class="badge-count">${persona.count}</span></td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                
                <div class="informe-actions">
                    <button onclick="window.print()" class="btn-action">
                        <i class="fa-solid fa-print"></i> Imprimir
                    </button>
                </div>
            </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultado.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
    }
}

function abrirInformePsicosocialPersona() {
    const zona = document.getElementById('zona-opciones-informe');
    
    zona.innerHTML = `
        <div class="informe-detallado">
            <button onclick="mostrarDashboard()" class="btn-back">
                <i class="fa-solid fa-arrow-left"></i> Volver al Dashboard
            </button>
            
            <h2><i class="fa-solid fa-user-check"></i> Informe Psicosocial por Persona</h2>
            
            <div class="search-container">
                <label>Buscar persona:</label>
                <input type="text" id="search-psi-persona" placeholder="Nombre o DNI..." oninput="buscarPersonaPsicosocial()">
                <div id="results-psi-persona"></div>
            </div>
            
            <div id="resultado-psi-persona"></div>
        </div>
    `;
}

async function buscarPersonaPsicosocial() {
    const busqueda = document.getElementById('search-psi-persona').value.toLowerCase().trim();
    const resultados = document.getElementById('results-psi-persona');
    
    if (busqueda.length < 2) {
        resultados.innerHTML = '';
        resultados.style.display = 'none';
        return;
    }
    
    resultados.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    resultados.style.display = 'block';
    
    try {
        const { collection, getDocs } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        let personasEncontradas = [];
        
        for (const albergue of alberguesGlobales) {
            const personasSnap = await getDocs(collection(db, "albergues", albergue.id, "personas"));
            
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
            resultados.innerHTML = '<div class="search-no-results">No se encontraron personas</div>';
            return;
        }
        
        let html = '<div class="search-results">';
        personasEncontradas.forEach(persona => {
            html += `
                <div class="search-result-item" onclick="generarInformePsicosocialPersona('${persona.id}', '${persona.albergueId}')">
                    <div>
                        <strong>${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}</strong>
                        <div class="search-result-meta">
                            <span><i class="fa-solid fa-id-card"></i> ${persona.docNum || 'Sin documento'}</span>
                            <span><i class="fa-solid fa-building"></i> ${persona.albergueNombre}</span>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
            `;
        });
        html += '</div>';
        
        resultados.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultados.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
    }
}

async function generarInformePsicosocialPersona(personaId, albergueId) {
    const resultado = document.getElementById('resultado-psi-persona');
    document.getElementById('results-psi-persona').innerHTML = '';
    document.getElementById('results-psi-persona').style.display = 'none';
    
    resultado.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Cargando historial...</div>';
    
    try {
        const { collection, getDocs, doc, getDoc } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        const personaSnap = await getDoc(doc(db, "albergues", albergueId, "personas", personaId));
        const persona = personaSnap.data();
        
        const intervencionesSnap = await getDocs(
            collection(db, "albergues", albergueId, "personas", personaId, "intervenciones")
        );
        
        let intervenciones = [];
        let tipologias = {};
        
        intervencionesSnap.forEach(docSnap => {
            const interv = docSnap.data();
            if (interv.tipo === 'Psicosocial') {
                intervenciones.push({
                    ...interv,
                    fecha: interv.fecha.toDate()
                });
                
                const subtipo = interv.subtipo || 'Sin especificar';
                tipologias[subtipo] = (tipologias[subtipo] || 0) + 1;
            }
        });
        
        intervenciones.sort((a, b) => b.fecha - a.fecha);
        
        let html = `
            <div class="informe-resultado">
                <div class="informe-header">
                    <h2><i class="fa-solid fa-user-check"></i> ${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}</h2>
                    <p class="informe-meta">
                        <span><i class="fa-solid fa-id-card"></i> ${persona.docNum || 'Sin documento'}</span>
                        <span><i class="fa-solid fa-building"></i> ${albergue.nombre}</span>
                    </p>
                </div>
                
                <div class="informe-kpis" style="justify-content: center;">
                    <div class="informe-kpi">
                        <div class="kpi-value">${intervenciones.length}</div>
                        <div class="kpi-label">Atenciones Registradas</div>
                    </div>
                </div>
        `;
        
        if (Object.keys(tipologias).length > 0) {
            html += `
                <div class="informe-section">
                    <h3><i class="fa-solid fa-chart-pie"></i> Atenciones por Tipo</h3>
                    <div class="chart-bars">
            `;
            
            const tiposOrdenados = Object.entries(tipologias).sort((a, b) => b[1] - a[1]);
            tiposOrdenados.forEach(([tipo, count]) => {
                html += `
                    <div class="chart-bar-item">
                        <div class="chart-bar-label">${tipo}</div>
                        <div class="chart-bar-container">
                            <div class="chart-bar-fill" style="width: 100%; background: #4facfe;"></div>
                            <div class="chart-bar-value">${count}</div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `
                <div class="informe-section">
                    <h3><i class="fa-solid fa-clock-rotate-left"></i> Historial Completo</h3>
                    <div class="historial-timeline">
        `;
        
        if (intervenciones.length === 0) {
            html += '<p class="no-data">No hay atenciones psicosociales registradas</p>';
        } else {
            intervenciones.forEach(interv => {
                html += `
                    <div class="historial-item">
                        <div class="historial-header">
                            <strong>${interv.subtipo}</strong>
                            <span>${interv.fecha.toLocaleDateString('es-ES')} ${interv.fecha.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div class="historial-content">
                            <p><strong>Motivo:</strong> ${interv.motivo}</p>
                            <p><strong>Resolución:</strong> ${interv.detalle}</p>
                            <p class="historial-meta"><i class="fa-solid fa-user-tag"></i> ${interv.usuario}</p>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                    </div>
                </div>
                
                <div class="informe-actions">
                    <button onclick="window.print()" class="btn-action">
                        <i class="fa-solid fa-print"></i> Imprimir
                    </button>
                </div>
            </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultado.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
    }
}

// ============================================
// FIN DEL SISTEMA DE INFORMES v3.0
// ============================================
// ============================================
// INFORME DE GESTIÓN DE ALBERGUE
// ============================================

function abrirInformeGestionAlbergue() {
    const zona = document.getElementById('zona-opciones-informe');
    
    let alberguesOptions = '<option value="">-- Selecciona un albergue --</option>';
    alberguesGlobales.forEach(alb => {
        alberguesOptions += `<option value="${alb.id}">${alb.nombre}</option>`;
    });
    
    zona.innerHTML = `
        <div class="informe-detallado">
            <button onclick="mostrarDashboard()" class="btn-back">
                <i class="fa-solid fa-arrow-left"></i> Volver al Dashboard
            </button>
            
            <h2><i class="fa-solid fa-building"></i> Informe de Gestión y Ocupación</h2>
            
            <div class="informe-filters">
                <div class="filter-group">
                    <label>Albergue:</label>
                    <select id="gest-alb-select">${alberguesOptions}</select>
                </div>
                <div class="filter-group">
                    <label>Fecha Inicio:</label>
                    <input type="date" id="gest-alb-fecha-inicio">
                </div>
                <div class="filter-group">
                    <label>Fecha Fin:</label>
                    <input type="date" id="gest-alb-fecha-fin">
                </div>
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="gest-alb-todas-fechas" onchange="toggleFechasGestAlb(this)">
                    Todas las fechas
                </label>
            </div>
            
            <button onclick="generarInformeGestionAlbergue()" class="btn-generar">
                <i class="fa-solid fa-file-pdf"></i> Generar Informe
            </button>
            
            <div id="resultado-gest-alb"></div>
        </div>
    `;
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('gest-alb-fecha-fin').value = hoy;
    document.getElementById('gest-alb-fecha-fin').max = hoy;
}

function toggleFechasGestAlb(checkbox) {
    const inicio = document.getElementById('gest-alb-fecha-inicio');
    const fin = document.getElementById('gest-alb-fecha-fin');
    
    inicio.disabled = checkbox.checked;
    fin.disabled = checkbox.checked;
    
    if (!checkbox.checked) {
        fin.value = new Date().toISOString().split('T')[0];
    }
}

async function generarInformeGestionAlbergue() {
    const albergueId = document.getElementById('gest-alb-select').value;
    const todasFechas = document.getElementById('gest-alb-todas-fechas').checked;
    const fechaInicio = document.getElementById('gest-alb-fecha-inicio').value;
    const fechaFin = document.getElementById('gest-alb-fecha-fin').value;
    const resultado = document.getElementById('resultado-gest-alb');
    
    if (!albergueId) {
        alert('Selecciona un albergue');
        return;
    }
    
    if (!todasFechas && (!fechaInicio || !fechaFin)) {
        alert('Selecciona un rango de fechas');
        return;
    }
    
    resultado.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Generando informe...</div>';
    
    try {
        const { collection, getDocs } = window.parent.firebaseModules;
        const db = window.parent.db;
        
        const albergue = alberguesGlobales.find(a => a.id === albergueId);
        const personasSnap = await getDocs(collection(db, "albergues", albergueId, "personas"));
        
        let personasActivas = [];
        let personasInactivas = [];
        let totalPersonas = 0;
        
        // Estadísticas demográficas
        let edades = {
            bebes: 0,      // 0-2
            ninos: 0,      // 3-12
            adolescentes: 0, // 13-17
            adultos: 0,    // 18-64
            mayores: 0     // 65+
        };
        
        let sumaEstancia = 0;
        let contadorEstancia = 0;
        let entradas = 0;
        let salidas = 0;
        
        const hoy = new Date();
        const inicioRango = todasFechas ? null : new Date(fechaInicio);
        const finRango = todasFechas ? null : new Date(fechaFin);
        if (finRango) finRango.setHours(23, 59, 59);
        
        personasSnap.forEach(docSnap => {
            const persona = docSnap.data();
            totalPersonas++;
            
            const fechaIngreso = persona.fechaIngreso?.toDate();
            const fechaSalida = persona.fechaSalida?.toDate();
            const estado = persona.estado || 'ingresado';
            
            // Calcular edad
            let edad = null;
            if (persona.fechaNac) {
                const fechaNac = persona.fechaNac.toDate();
                edad = Math.floor((hoy - fechaNac) / (365.25 * 24 * 60 * 60 * 1000));
                
                if (edad <= 2) edades.bebes++;
                else if (edad <= 12) edades.ninos++;
                else if (edad <= 17) edades.adolescentes++;
                else if (edad <= 64) edades.adultos++;
                else edades.mayores++;
            }
            
            // Calcular estancia
            let diasEstancia = 0;
            if (fechaIngreso) {
                const fechaFin = fechaSalida || hoy;
                diasEstancia = Math.floor((fechaFin - fechaIngreso) / (24 * 60 * 60 * 1000));
                sumaEstancia += diasEstancia;
                contadorEstancia++;
            }
            
            // Contar entradas y salidas en el período
            if (!todasFechas) {
                if (fechaIngreso && fechaIngreso >= inicioRango && fechaIngreso <= finRango) {
                    entradas++;
                }
                if (fechaSalida && fechaSalida >= inicioRango && fechaSalida <= finRango) {
                    salidas++;
                }
            }
            
            const personaData = {
                nombre: `${persona.nombre} ${persona.ap1 || ''} ${persona.ap2 || ''}`.trim(),
                dni: persona.docNum || 'S/D',
                edad: edad !== null ? edad : 'N/D',
                fechaIngreso: fechaIngreso,
                fechaSalida: fechaSalida,
                diasEstancia: diasEstancia,
                cama: persona.cama || 'Sin asignar',
                familia: persona.familia || 'Individual',
                estado: estado
            };
            
            if (estado === 'ingresado') {
                personasActivas.push(personaData);
            } else {
                personasInactivas.push(personaData);
            }
        });
        
        // Ordenar por fecha de ingreso (más reciente primero)
        personasActivas.sort((a, b) => b.fechaIngreso - a.fechaIngreso);
        personasInactivas.sort((a, b) => (b.fechaSalida || 0) - (a.fechaSalida || 0));
        
        const estanciaMedia = contadorEstancia > 0 ? (sumaEstancia / contadorEstancia).toFixed(1) : 0;
        const tasaOcupacion = albergue.capacidad > 0 ? ((personasActivas.length / albergue.capacidad) * 100).toFixed(1) : 0;
        
        // Generar HTML
        let html = `
            <div class="informe-resultado">
                <div class="informe-header">
                    <h2><i class="fa-solid fa-building"></i> ${albergue.nombre}</h2>
                    <p class="informe-periodo">
                        ${todasFechas ? 'Todo el histórico' : 
                        `${inicioRango.toLocaleDateString('es-ES')} - ${finRango.toLocaleDateString('es-ES')}`}
                    </p>
                </div>
                
                <div class="informe-kpis">
                    <div class="informe-kpi">
                        <div class="kpi-value">${totalPersonas}</div>
                        <div class="kpi-label">Total Personas</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${personasActivas.length}</div>
                        <div class="kpi-label">Actualmente Alojadas</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${personasInactivas.length}</div>
                        <div class="kpi-label">Han salido</div>
                    </div>
                </div>
                
                <div class="informe-kpis">
                    <div class="informe-kpi">
                        <div class="kpi-value">${estanciaMedia} días</div>
                        <div class="kpi-label">Estancia Media</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${personasActivas.length}/${albergue.capacidad || '?'}</div>
                        <div class="kpi-label">Ocupación Actual</div>
                    </div>
                    <div class="informe-kpi">
                        <div class="kpi-value">${tasaOcupacion}%</div>
                        <div class="kpi-label">Tasa de Ocupación</div>
                    </div>
                </div>
        `;
        
        // Demografía por edad
        const totalConEdad = edades.bebes + edades.ninos + edades.adolescentes + edades.adultos + edades.mayores;
        
        if (totalConEdad > 0) {
            html += `
                <div class="informe-section">
                    <h3><i class="fa-solid fa-users"></i> Demografía por Edad</h3>
                    <div class="chart-bars">
            `;
            
            const categorias = [
                { label: 'Bebés (0-2 años)', count: edades.bebes },
                { label: 'Niños (3-12 años)', count: edades.ninos },
                { label: 'Adolescentes (13-17)', count: edades.adolescentes },
                { label: 'Adultos (18-64)', count: edades.adultos },
                { label: 'Mayores (65+)', count: edades.mayores }
            ];
            
            categorias.forEach(cat => {
                const porcentaje = ((cat.count / totalConEdad) * 100).toFixed(1);
                html += `
                    <div class="chart-bar-item">
                        <div class="chart-bar-label">${cat.label}</div>
                        <div class="chart-bar-container">
                            <div class="chart-bar-fill" style="width: ${porcentaje}%; background: #43e97b;"></div>
                            <div class="chart-bar-value">${cat.count} (${porcentaje}%)</div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Movimientos en el período
        if (!todasFechas) {
            const balance = entradas - salidas;
            const balanceClass = balance > 0 ? 'positivo' : balance < 0 ? 'negativo' : 'neutro';
            
            html += `
                <div class="informe-section">
                    <h3><i class="fa-solid fa-right-left"></i> Movimientos en el Período</h3>
                    <div class="movimientos-grid">
                        <div class="movimiento-item">
                            <i class="fa-solid fa-arrow-right-to-bracket" style="color: #10b981;"></i>
                            <div>
                                <strong>${entradas}</strong>
                                <span>Entradas</span>
                            </div>
                        </div>
                        <div class="movimiento-item">
                            <i class="fa-solid fa-arrow-right-from-bracket" style="color: #ef4444;"></i>
                            <div>
                                <strong>${salidas}</strong>
                                <span>Salidas</span>
                            </div>
                        </div>
                        <div class="movimiento-item">
                            <i class="fa-solid fa-scale-balanced" style="color: #6366f1;"></i>
                            <div>
                                <strong class="${balanceClass}">${balance > 0 ? '+' : ''}${balance}</strong>
                                <span>Balance Neto</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Listado de personas activas
        html += `
            <div class="informe-section">
                <h3><i class="fa-solid fa-circle" style="color: #10b981;"></i> Actualmente Alojadas (${personasActivas.length})</h3>
                <table class="informe-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>DNI</th>
                            <th>Edad</th>
                            <th>Fecha Entrada</th>
                            <th>Estancia</th>
                            <th>Cama</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        if (personasActivas.length === 0) {
            html += `
                <tr>
                    <td colspan="6" style="text-align: center; color: #9ca3af;">No hay personas alojadas actualmente</td>
                </tr>
            `;
        } else {
            personasActivas.forEach(persona => {
                html += `
                    <tr>
                        <td><strong>${persona.nombre}</strong></td>
                        <td>${persona.dni}</td>
                        <td>${persona.edad}</td>
                        <td>${persona.fechaIngreso ? persona.fechaIngreso.toLocaleDateString('es-ES') : 'N/D'}</td>
                        <td>${persona.diasEstancia} días</td>
                        <td>${persona.cama}</td>
                    </tr>
                `;
            });
        }
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        // Listado de personas que han salido
        html += `
            <div class="informe-section">
                <h3><i class="fa-solid fa-circle" style="color: #ef4444;"></i> Han Salido (${personasInactivas.length})</h3>
                <table class="informe-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>DNI</th>
                            <th>Edad</th>
                            <th>Fecha Entrada</th>
                            <th>Fecha Salida</th>
                            <th>Estancia</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        if (personasInactivas.length === 0) {
            html += `
                <tr>
                    <td colspan="6" style="text-align: center; color: #9ca3af;">No hay registros de personas que hayan salido</td>
                </tr>
            `;
        } else {
            personasInactivas.forEach(persona => {
                html += `
                    <tr>
                        <td><strong>${persona.nombre}</strong></td>
                        <td>${persona.dni}</td>
                        <td>${persona.edad}</td>
                        <td>${persona.fechaIngreso ? persona.fechaIngreso.toLocaleDateString('es-ES') : 'N/D'}</td>
                        <td>${persona.fechaSalida ? persona.fechaSalida.toLocaleDateString('es-ES') : 'N/D'}</td>
                        <td>${persona.diasEstancia} días</td>
                    </tr>
                `;
            });
        }
        
        html += `
                    </tbody>
                </table>
            </div>
            
            <div class="informe-actions">
                <button onclick="window.print()" class="btn-action">
                    <i class="fa-solid fa-print"></i> Imprimir
                </button>
            </div>
        </div>
        `;
        
        resultado.innerHTML = html;
        
    } catch(e) {
        console.error('Error:', e);
        resultado.innerHTML = `<div class="error-message"><i class="fa-solid fa-circle-exclamation"></i> Error: ${e.message}</div>`;
    }
}
console.log('✅ Sistema de Informes v3.0 cargado correctamente');
