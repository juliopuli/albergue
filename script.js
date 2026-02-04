/**
 * SISTEMA DE GESTIÓN DE AFILIACIÓN
 * Versión: 52.0.0
 * * Lógica principal para manejo de prefiliación, filiación
 * y persistencia de datos.
 */

// Configuración Global
const CONFIG = {
    storageKey: 'sys_gestion_v1',
    version: '52.0.0'
};

// Estado de la Aplicación
let AppState = {
    prefiliacion: [],
    filiacion: []
};

// ---------------------------------------------------------
// 1. INICIALIZACIÓN
// ---------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    console.log(`Sistema Iniciado v${CONFIG.version}`);
    
    // Cargar datos
    cargarDatos();
    
    // Configurar fecha header
    const fechaEl = document.getElementById('fecha-sistema');
    if (fechaEl) fechaEl.textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Listeners
    configurarListeners();
    
    // Render inicial
    actualizarVistas();
});

function configurarListeners() {
    const formPre = document.getElementById('form-prefiliacion');
    if (formPre) formPre.addEventListener('submit', handleNuevoPrefiliado);
}

// ---------------------------------------------------------
// 2. NAVEGACIÓN (FIX: Exposición a Window)
// ---------------------------------------------------------

/**
 * Función para cambiar entre pestañas.
 * Se expone a window para que los eventos onclick del HTML funcionen.
 */
function cambiarPestana(pestanaId) {
    // Ocultar contenidos
    document.querySelectorAll('.tab-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    // Desactivar botones
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Mostrar target
    const target = document.getElementById(pestanaId);
    if (target) {
        target.style.display = 'block';
        // Timeout pequeño para permitir transición CSS
        setTimeout(() => target.classList.add('active'), 10);
    }

    // Activar botón específico
    const btnActivo = document.querySelector(`button[onclick="cambiarPestana('${pestanaId}')"]`);
    if (btnActivo) btnActivo.classList.add('active');
}

// IMPORTANTE: Solución al error "window.cambiarPestana is not a function"
window.cambiarPestana = cambiarPestana;

// ---------------------------------------------------------
// 3. LÓGICA DE NEGOCIO
// ---------------------------------------------------------

function handleNuevoPrefiliado(e) {
    e.preventDefault();

    const nombre = document.getElementById('pre-nombre').value.trim();
    const dni = document.getElementById('pre-dni').value.trim();
    const tel = document.getElementById('pre-telefono').value.trim();
    const email = document.getElementById('pre-email').value.trim();
    const obs = document.getElementById('pre-obs').value.trim();

    if (!nombre || !dni) {
        alert("El nombre y el DNI son obligatorios.");
        return;
    }

    // Verificar duplicados en DNI
    if (existeDNI(dni)) {
        alert("Error: Ya existe un registro con este DNI.");
        return;
    }

    const nuevoRegistro = {
        id: Date.now(),
        nombre,
        dni,
        telefono: tel,
        email,
        observaciones: obs,
        fechaRegistro: new Date().toISOString(),
        estado: 'pendiente'
    };

    AppState.prefiliacion.push(nuevoRegistro);
    guardarDatos();
    
    e.target.reset();
    actualizarVistas();
    alert("Usuario añadido a prefiliación correctamente.");
}

function pasarAFiliacion(id) {
    const index = AppState.prefiliacion.findIndex(p => p.id === id);
    if (index === -1) return;

    if (!confirm("¿Confirmar el pase a FILIACIÓN de este usuario?")) return;

    const registro = AppState.prefiliacion[index];
    
    // Transformar datos para filiación
    const nuevoSocio = {
        ...registro,
        fechaFiliacion: new Date().toISOString(),
        numeroSocio: generarNumeroSocio(),
        estado: 'activo'
    };

    // Mover
    AppState.filiacion.push(nuevoSocio);
    AppState.prefiliacion.splice(index, 1);

    guardarDatos();
    actualizarVistas();
    
    // Opcional: Llevar al usuario a la pestaña de filiación
    cambiarPestana('seccion-filiacion');
}

function borrarPrefiliacion(id) {
    if (!confirm("¿Seguro que deseas eliminar este registro pendiente?")) return;
    
    AppState.prefiliacion = AppState.prefiliacion.filter(p => p.id !== id);
    guardarDatos();
    actualizarVistas();
}

// Exponer funciones necesarias para onclick
window.pasarAFiliacion = pasarAFiliacion;
window.borrarPrefiliacion = borrarPrefiliacion;

// ---------------------------------------------------------
// 4. PERSISTENCIA Y UTILIDADES
// ---------------------------------------------------------

function guardarDatos() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(AppState));
}

function cargarDatos() {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (raw) {
        try {
            AppState = JSON.parse(raw);
        } catch (error) {
            console.error("Error cargando datos", error);
        }
    }
}

function existeDNI(dni) {
    const enPre = AppState.prefiliacion.some(p => p.dni.toLowerCase() === dni.toLowerCase());
    const enFil = AppState.filiacion.some(f => f.dni.toLowerCase() === dni.toLowerCase());
    return enPre || enFil;
}

function generarNumeroSocio() {
    // Generador simple secuencial basado en longitud
    return 1000 + AppState.filiacion.length + 1;
}

function borrarTodosDatos() {
    if(confirm("ATENCIÓN: Esto borrará TODOS los registros. ¿Continuar?")) {
        AppState = { prefiliacion: [], filiacion: [] };
        guardarDatos();
        actualizarVistas();
    }
}
window.borrarTodosDatos = borrarTodosDatos;

// ---------------------------------------------------------
// 5. RENDERIZADO (UI)
// ---------------------------------------------------------

function actualizarVistas() {
    renderTablaPrefiliacion();
    renderTablaFiliacion();
    actualizarContadores();
}

function renderTablaPrefiliacion() {
    const tbody = document.getElementById('tabla-prefiliacion-body');
    const emptyMsg = document.getElementById('empty-prefiliacion');
    
    if (!tbody) return;
    tbody.innerHTML = '';

    if (AppState.prefiliacion.length === 0) {
        emptyMsg.style.display = 'block';
    } else {
        emptyMsg.style.display = 'none';
        AppState.prefiliacion.forEach(item => {
            const fecha = new Date(item.fechaRegistro).toLocaleDateString();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${fecha}</td>
                <td><strong>${item.nombre}</strong><br><small>${item.email || ''}</small></td>
                <td>${item.dni}</td>
                <td><span class="tag tag-pending">Pendiente</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="pasarAFiliacion(${item.id})">
                        <i class="fas fa-check"></i> Afiliar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="borrarPrefiliacion(${item.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function renderTablaFiliacion() {
    const tbody = document.getElementById('tabla-filiacion-body');
    const emptyMsg = document.getElementById('empty-filiacion');
    const busqueda = document.getElementById('buscar-filiacion')?.value.toLowerCase() || '';

    if (!tbody) return;
    tbody.innerHTML = '';

    const filtrados = AppState.filiacion.filter(item => 
        item.nombre.toLowerCase().includes(busqueda) || 
        item.dni.toLowerCase().includes(busqueda)
    );

    if (filtrados.length === 0) {
        emptyMsg.style.display = 'block';
    } else {
        emptyMsg.style.display = 'none';
        filtrados.forEach(item => {
            const fecha = new Date(item.fechaFiliacion).toLocaleDateString();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${item.numeroSocio}</td>
                <td>${fecha}</td>
                <td><strong>${item.nombre}</strong></td>
                <td>${item.dni}</td>
                <td>${item.telefono || 'N/A'}</td>
                <td><span class="tag tag-active">Activo</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function actualizarContadores() {
    const countFiliacion = document.getElementById('contador-filiacion');
    if (countFiliacion) countFiliacion.textContent = AppState.filiacion.length;
}

// Función expuesta para el buscador
window.filtrarFiliacion = () => {
    renderTablaFiliacion();
};
