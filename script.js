// --- Estamos quitando el QR que salía mal de gestión y enrutando al QR bueno de mantenimiento ---
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc, writeBatch, increment } 
from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN ---
const firebaseConfig = { 
    apiKey: "AIzaSyAzfEMwMd6M1VgvV0tJn7RS63RJghLE5UI", 
    authDomain: "albergues-temporales.firebaseapp.com", 
    projectId: "albergues-temporales", 
    storageBucket: "albergues-temporales.firebasestorage.app", 
    messagingSenderId: "489999184108", 
    appId: "1:489999184108:web:32b9b580727f83158075c9" 
};
const app = initializeApp(firebaseConfig); 
const auth = getAuth(app); 
const db = getFirestore(app);

// ⭐ EXPORTAR para informes.js
window.db = db;
window.firebaseModules = {
    collection: collection,
    getDocs: getDocs,
    doc: doc,
    getDoc: getDoc
};

// --- QR CODE CONFIG ---
const QR_CONFIG = {
    width: 250,
    height: 250,
    colorDark: "#4f46e5",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
};

// --- TIPOS DE INTERVENCIÓN ---
const TIPOS_INTERVENCION = {
    san: {
        titulo: "Sanitaria",
        opciones: [
            "Atención Urgente / Primeros Auxilios",
            "Toma de Constantes",
            "Administración de Medicación",
            "Cura de Heridas",
            "Consulta Médica",
            "Derivación Hospitalaria",
            "Otros"
        ]
    },
    psi: {
        titulo: "Psicosocial",
        opciones: [
            "Valoración Inicial",
            "Acompañamiento / Contención Emocional",
            "Comunicación de Malas Noticias",
            "Gestión de Trámites",
            "Resolución de Conflictos",
            "Atención a Menores",
            "Otros"
        ]
    },
    ent: {
        titulo: "Entregas",
        opciones: [
            "Entrega de Kit de Higiene",
            "Entrega de Ropa / Calzado",
            "Entrega de Manta / Abrigo",
            "Entrega de Alimentos (Biberones, específicos...)",
            "Entrega de Juguetes / Material Infantil",
            "Otros"
        ]
    }
};
// --- CONFIGURACIÓN DE SUBFORMULARIOS DINÁMICOS ---
const SUBFORMULARIOS_CONFIG = {
    san: {
        "Atención Urgente / Primeros Auxilios": {
            campos: [
                { tipo: "select", id: "tipo_urgencia", label: "Tipo de urgencia", opciones: ["Trauma", "Caída", "Dolor torácico", "Dificultad respiratoria", "Pérdida de conciencia", "Convulsiones", "Reacción alérgica", "Hemorragia", "Otro"], requerido: true },
                { tipo: "select", id: "gravedad", label: "Nivel de gravedad", opciones: ["Leve", "Moderado", "Grave", "Crítico"], requerido: true },
                { tipo: "checkbox", id: "requiere_ambulancia", label: "¿Requiere ambulancia?" },
                { tipo: "textarea", id: "actuacion", label: "Actuación realizada", requerido: true }
            ]
        },
        "Toma de Constantes": {
            campos: [
                { tipo: "text", id: "tension_arterial", label: "Tensión Arterial (ej: 120/80)", placeholder: "120/80 mmHg" },
                { tipo: "number", id: "frecuencia_cardiaca", label: "Frecuencia Cardíaca (ppm)", placeholder: "75" },
                { tipo: "number", id: "temperatura", label: "Temperatura (°C)", placeholder: "36.5", step: "0.1" },
                { tipo: "number", id: "saturacion_oxigeno", label: "Saturación de Oxígeno (%)", placeholder: "98" },
                { tipo: "number", id: "glucemia", label: "Glucemia (mg/dL)", placeholder: "100" },
                { tipo: "textarea", id: "observaciones_constantes", label: "Observaciones" }
            ]
        },
        "Administración de Medicación": {
            campos: [
                { tipo: "text", id: "medicamento", label: "Nombre del medicamento", requerido: true },
                { tipo: "text", id: "dosis", label: "Dosis administrada", placeholder: "500mg, 2 comprimidos", requerido: true },
                { tipo: "select", id: "via_administracion", label: "Vía de administración", opciones: ["Oral", "Intramuscular", "Intravenosa", "Subcutánea", "Tópica", "Inhalada"], requerido: true },
                { tipo: "time", id: "hora_administracion", label: "Hora de administración" },
                { tipo: "text", id: "prescrito_por", label: "Prescrito por" },
                { tipo: "datetime-local", id: "proxima_dosis", label: "Próxima dosis prevista (opcional)" }
            ]
        },
        "Cura de Heridas": {
            campos: [
                { tipo: "text", id: "localizacion_herida", label: "Localización", placeholder: "Brazo izquierdo, rodilla derecha", requerido: true },
                { tipo: "select", id: "tipo_herida", label: "Tipo de herida", opciones: ["Contusión", "Erosión", "Laceración", "Quemadura", "Úlcera", "Ampolla"], requerido: true },
                { tipo: "text", id: "tamano_herida", label: "Tamaño aproximado", placeholder: "3x2 cm" },
                { tipo: "select", id: "estado_herida", label: "Estado", opciones: ["Limpia", "Infectada", "Cicatrizando"] },
                { tipo: "text", id: "material_utilizado", label: "Material utilizado", placeholder: "Betadine, gasa estéril, apósito" },
                { tipo: "checkbox", id: "requiere_seguimiento_herida", label: "Requiere seguimiento" },
                { tipo: "date", id: "fecha_proxima_cura", label: "Fecha próxima cura", condicional: "requiere_seguimiento_herida" }
            ]
        },
        "Consulta Médica": {
            campos: [
                { tipo: "textarea", id: "motivo_consulta", label: "Motivo de consulta", requerido: true },
                { tipo: "text", id: "sintomas_principales", label: "Síntomas principales", placeholder: "Fiebre, dolor abdominal" },
                { tipo: "textarea", id: "diagnostico", label: "Diagnóstico/Impresión" },
                { tipo: "textarea", id: "tratamiento_recomendado", label: "Tratamiento recomendado" },
                { tipo: "checkbox", id: "requiere_seguimiento_consulta", label: "Requiere seguimiento" },
                { tipo: "date", id: "fecha_revision", label: "Fecha de revisión", condicional: "requiere_seguimiento_consulta" }
            ]
        },
        "Derivación Hospitalaria": {
            campos: [
                { tipo: "textarea", id: "motivo_derivacion_hosp", label: "Motivo de derivación", requerido: true },
                { tipo: "select", id: "servicio_derivado", label: "Servicio derivado", opciones: ["Urgencias", "Medicina Interna", "Traumatología", "Pediatría", "Ginecología", "Psiquiatría", "Otro"], requerido: true },
                { tipo: "text", id: "hospital_destino", label: "Hospital destino" },
                { tipo: "select", id: "medio_traslado", label: "Medio de traslado", opciones: ["Ambulancia medicalizada", "Ambulancia convencional", "Vehículo particular", "Taxi"] },
                { tipo: "time", id: "hora_salida", label: "Hora de salida" },
                { tipo: "text", id: "acompanante", label: "Acompañante (opcional)" }
            ]
        },
        "Otros": {
            campos: [
                { tipo: "textarea", id: "descripcion_otros_san", label: "Descripción", requerido: true }
            ]
        }
    },
    psi: {
        "Valoración Inicial": {
            campos: [
                { tipo: "select", id: "estado_emocional", label: "Estado emocional observado", opciones: ["Tranquilo", "Ansioso", "Deprimido", "Agitado", "Confuso", "Colaborador"], requerido: true },
                { tipo: "textarea", id: "motivo_llegada", label: "Motivo de llegada", requerido: true },
                { tipo: "text", id: "situacion_familiar", label: "Situación familiar" },
                { tipo: "textarea", id: "necesidades_detectadas", label: "Necesidades detectadas" },
                { tipo: "select", id: "riesgo_identificado", label: "Riesgo identificado", opciones: ["Sin riesgo", "Riesgo bajo", "Riesgo medio", "Riesgo alto"] }
            ]
        },
        "Acompañamiento / Contención Emocional": {
            campos: [
                { tipo: "select", id: "duracion", label: "Duración aproximada", opciones: ["<15 min", "15-30 min", "30-60 min", ">60 min"] },
                { tipo: "textarea", id: "motivo_acomp", label: "Motivo", requerido: true },
                { tipo: "select", id: "estado_inicial", label: "Estado inicial", opciones: ["Crisis", "Llanto", "Angustia", "Miedo", "Ira", "Confusión"] },
                { tipo: "select", id: "estado_final", label: "Estado final", opciones: ["Calmado", "Mejoría", "Sin cambios", "Requiere más apoyo"] },
                { tipo: "text", id: "tecnicas_aplicadas", label: "Técnicas aplicadas", placeholder: "Escucha activa, respiración..." }
            ]
        },
        "Comunicación de Malas Noticias": {
            campos: [
                { tipo: "select", id: "tipo_noticia", label: "Tipo de noticia", opciones: ["Fallecimiento", "Enfermedad grave", "Pérdida material", "Separación familiar", "Otra"], requerido: true },
                { tipo: "textarea", id: "reaccion_inicial", label: "Reacción inicial" },
                { tipo: "textarea", id: "apoyo_prestado", label: "Apoyo prestado" },
                { tipo: "text", id: "red_apoyo", label: "Red de apoyo activada", placeholder: "Familia, amigos, servicios sociales" },
                { tipo: "checkbox", id: "seguimiento_psicologico", label: "Requiere seguimiento psicológico" }
            ]
        },
        "Gestión de Trámites": {
            campos: [
                { tipo: "select", id: "tipo_tramite", label: "Tipo de trámite", opciones: ["Documentación", "Ayudas sociales", "Padrón", "Salud", "Escolarización", "Jurídico", "Laboral", "Otro"], requerido: true },
                { tipo: "text", id: "entidad_organismo", label: "Entidad/organismo" },
                { tipo: "select", id: "estado_tramite", label: "Estado", opciones: ["Iniciado", "En proceso", "Completado", "Pendiente documentación"] },
                { tipo: "textarea", id: "proxima_accion", label: "Próxima acción" },
                { tipo: "date", id: "fecha_seguimiento_tramite", label: "Fecha de seguimiento" }
            ]
        },
        "Resolución de Conflictos": {
            campos: [
                { tipo: "select", id: "tipo_conflicto", label: "Tipo de conflicto", opciones: ["Convivencia", "Familiar", "Comunicación", "Recursos", "Normativa", "Otro"], requerido: true },
                { tipo: "text", id: "personas_implicadas", label: "Personas implicadas", placeholder: "Número o iniciales" },
                { tipo: "textarea", id: "mediacion_realizada", label: "Mediación realizada" },
                { tipo: "textarea", id: "acuerdos_alcanzados", label: "Acuerdos alcanzados" },
                { tipo: "select", id: "resultado_conflicto", label: "Resultado", opciones: ["Resuelto", "Parcialmente resuelto", "Sin resolver", "Requiere intervención externa"] }
            ]
        },
        "Atención a Menores": {
            campos: [
                { tipo: "number", id: "edad_menor", label: "Edad del menor", requerido: true },
                { tipo: "text", id: "acompanado_por", label: "Acompañado por", placeholder: "Madre, padre, tutor..." },
                { tipo: "textarea", id: "motivo_atencion_menor", label: "Motivo de atención" },
                { tipo: "text", id: "actividad_realizada", label: "Actividad realizada", placeholder: "Juego, apoyo escolar, conversación" },
                { tipo: "select", id: "estado_menor", label: "Estado del menor", opciones: ["Tranquilo", "Activo", "Retraído", "Angustiado", "Colaborador"] },
                { tipo: "checkbox", id: "seguimiento_menor", label: "Requiere seguimiento específico" }
            ]
        },
        "Otros": {
            campos: [
                { tipo: "textarea", id: "descripcion_otros_psi", label: "Descripción", requerido: true }
            ]
        }
    },
    ent: {
        "Entrega de Kit de Higiene": {
            campos: [
                { tipo: "checkbox-group", id: "contenido_kit", label: "Contenido", opciones: ["Jabón", "Champú", "Pasta + Cepillo dientes", "Pañales", "Toallas sanitarias", "Papel higiénico", "Toalla", "Otro"] },
                { tipo: "text", id: "talla_panales", label: "Talla de pañales (si aplica)" },
                { tipo: "text", id: "otro_contenido", label: "Otro (especificar)" },
                { tipo: "number", id: "cantidad_kit", label: "Cantidad de unidades", value: "1" }
            ]
        },
        "Entrega de Ropa / Calzado": {
            campos: [
                { tipo: "checkbox-group", id: "tipo_ropa", label: "Tipo", opciones: ["Ropa interior", "Pantalón", "Camisa/Camiseta", "Abrigo", "Zapatos", "Calcetines", "Otro"] },
                { tipo: "text", id: "tallas_ropa", label: "Tallas", placeholder: "Indicar talla de cada prenda" },
                { tipo: "text", id: "para_quien_ropa", label: "Para quién", placeholder: "Adulto/Niño - Nombre" },
                { tipo: "select", id: "estado_ropa", label: "Estado", opciones: ["Nuevo", "Como nuevo", "Buen estado", "Usado"] }
            ]
        },
        "Entrega de Manta / Abrigo": {
            campos: [
                { tipo: "select", id: "tipo_manta", label: "Tipo", opciones: ["Manta", "Edredón", "Saco de dormir", "Abrigo", "Chaqueta", "Otro"], requerido: true },
                { tipo: "text", id: "talla_abrigo", label: "Talla (si aplica)" },
                { tipo: "number", id: "cantidad_manta", label: "Cantidad", value: "1" }
            ]
        },
        "Entrega de Alimentos (Biberones, específicos...)": {
            campos: [
                { tipo: "checkbox-group", id: "tipo_alimento", label: "Tipo", opciones: ["Leche de fórmula", "Biberones", "Papillas", "Alimentos sin gluten", "Alimentos sin lactosa", "Otro"] },
                { tipo: "text", id: "especificar_tipo_leche", label: "Especificar tipo de leche (si aplica)" },
                { tipo: "text", id: "cantidad_alimentos", label: "Cantidad" },
                { tipo: "date", id: "caducidad_alimentos", label: "Caducidad (si relevante)" },
                { tipo: "text", id: "observaciones_alimentos", label: "Observaciones", placeholder: "Por intolerancia/alergia" }
            ]
        },
        "Entrega de Juguetes / Material Infantil": {
            campos: [
                { tipo: "text", id: "tipo_juguete", label: "Tipo", placeholder: "Peluche, libro, juego de mesa..." },
                { tipo: "text", id: "edad_recomendada", label: "Edad recomendada" },
                { tipo: "text", id: "para_quien_juguete", label: "Para quién", placeholder: "Nombre del menor" },
                { tipo: "number", id: "cantidad_juguetes", label: "Cantidad", value: "1" }
            ]
        },
        "Otros": {
            campos: [
                { tipo: "textarea", id: "descripcion_otros_ent", label: "Descripción del artículo", requerido: true },
                { tipo: "number", id: "cantidad_otros_ent", label: "Cantidad", value: "1" }
            ]
        }
    }
};
// --- FUNCIONES PARA SUBFORMULARIOS DINÁMICOS ---

window.mostrarSubformulario = function(tipo) {
    const select = document.getElementById(`sel-int-${tipo}`);
    const container = document.getElementById(`subform-${tipo}`);
    const subtipo = select.value;
    
    // Limpiar contenedor
    container.innerHTML = '';
    
    if (!subtipo || subtipo === "" || !SUBFORMULARIOS_CONFIG[tipo] || !SUBFORMULARIOS_CONFIG[tipo][subtipo]) {
        return;
    }
    
    const config = SUBFORMULARIOS_CONFIG[tipo][subtipo];
    
    // Crear campos dinámicamente
    config.campos.forEach(campo => {
        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '15px';
        
        // Si el campo es condicional, ocultarlo inicialmente
        if (campo.condicional) {
            wrapper.id = `wrapper-${campo.id}`;
            wrapper.classList.add('hidden');
        }
        
        if (campo.tipo === 'checkbox-group') {
            // Grupo de checkboxes
            const label = document.createElement('label');
            label.innerHTML = `${campo.label}${campo.requerido ? ' (*)' : ''}`;
            wrapper.appendChild(label);
            
            campo.opciones.forEach(opcion => {
                const checkDiv = document.createElement('div');
                checkDiv.style.marginTop = '5px';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `${campo.id}_${opcion.replace(/\s+/g, '_')}`;
                checkbox.value = opcion;
                checkbox.style.width = 'auto';
                checkbox.style.marginRight = '8px';
                
                const labelCheck = document.createElement('label');
                labelCheck.htmlFor = checkbox.id;
                labelCheck.innerHTML = opcion;
                labelCheck.style.fontWeight = 'normal';
                labelCheck.style.display = 'inline';
                
                checkDiv.appendChild(checkbox);
                checkDiv.appendChild(labelCheck);
                wrapper.appendChild(checkDiv);
            });
        } else if (campo.tipo === 'checkbox') {
            // Checkbox simple
            const checkDiv = document.createElement('div');
            checkDiv.style.display = 'flex';
            checkDiv.style.alignItems = 'center';
            checkDiv.style.gap = '8px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = campo.id;
            checkbox.style.width = 'auto';
            checkbox.style.marginBottom = '0';
            
            // Si es un checkbox que controla campos condicionales
            if (config.campos.some(c => c.condicional === campo.id)) {
                checkbox.addEventListener('change', function() {
                    config.campos.forEach(c => {
                        if (c.condicional === campo.id) {
                            const conditionalWrapper = document.getElementById(`wrapper-${c.id}`);
                            if (conditionalWrapper) {
                                if (this.checked) {
                                    conditionalWrapper.classList.remove('hidden');
                                } else {
                                    conditionalWrapper.classList.add('hidden');
                                    // Limpiar el campo
                                    const field = document.getElementById(c.id);
                                    if (field) field.value = '';
                                }
                            }
                        }
                    });
                });
            }
            
            const label = document.createElement('label');
            label.htmlFor = campo.id;
            label.innerHTML = campo.label;
            label.style.fontWeight = 'normal';
            label.style.marginBottom = '0';
            label.style.cursor = 'pointer';
            
            checkDiv.appendChild(checkbox);
            checkDiv.appendChild(label);
            wrapper.appendChild(checkDiv);
        } else {
            // Otros tipos de campos
            const label = document.createElement('label');
            label.htmlFor = campo.id;
            label.innerHTML = `${campo.label}${campo.requerido ? ' (*)' : ''}`;
            wrapper.appendChild(label);
            
            let input;
            if (campo.tipo === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 3;
            } else if (campo.tipo === 'select') {
                input = document.createElement('select');
                const optionDefault = document.createElement('option');
                optionDefault.value = '';
                optionDefault.textContent = '-- Selecciona --';
                input.appendChild(optionDefault);
                
                campo.opciones.forEach(opcion => {
                    const option = document.createElement('option');
                    option.value = opcion;
                    option.textContent = opcion;
                    input.appendChild(option);
                });
            } else {
                input = document.createElement('input');
                input.type = campo.tipo;
                if (campo.step) input.step = campo.step;
            }
            
            input.id = campo.id;
            if (campo.placeholder) input.placeholder = campo.placeholder;
            if (campo.value) input.value = campo.value;
            if (campo.requerido) input.required = true;
            
            wrapper.appendChild(input);
        }
        
        container.appendChild(wrapper);
    });
};

// Función para recopilar datos del subformulario
window.recopilarDatosSubformulario = function(tipo) {
    const select = document.getElementById(`sel-int-${tipo}`);
    const subtipo = select.value;
    
    if (!subtipo || !SUBFORMULARIOS_CONFIG[tipo] || !SUBFORMULARIOS_CONFIG[tipo][subtipo]) {
        return {};
    }
    
    const config = SUBFORMULARIOS_CONFIG[tipo][subtipo];
    const datos = {};
    
    config.campos.forEach(campo => {
        if (campo.tipo === 'checkbox-group') {
            // Recopilar checkboxes marcados
            const seleccionados = [];
            campo.opciones.forEach(opcion => {
                const checkbox = document.getElementById(`${campo.id}_${opcion.replace(/\s+/g, '_')}`);
                if (checkbox && checkbox.checked) {
                    seleccionados.push(opcion);
                }
            });
            if (seleccionados.length > 0) {
                datos[campo.id] = seleccionados.join(', ');
            }
        } else if (campo.tipo === 'checkbox') {
            const checkbox = document.getElementById(campo.id);
            if (checkbox) {
                datos[campo.id] = checkbox.checked;
            }
        } else {
            const input = document.getElementById(campo.id);
            if (input && input.value) {
                datos[campo.id] = input.value;
            }
        }
    });
    
    return datos;
};
// --- FORMATEAR DATOS PARA HISTORIAL ---
window.formatearDatosHistorial = function(tipo, subtipo, datosSubform) {
    let resultado = '';
    
    // Mapeo de iconos por tipo
    const iconosTipo = {
        'san': '🩺',
        'psi': '💚',
        'ent': '📦'
    };
    
    // Mapeo de iconos específicos por subtipo sanitario
    const iconosSanitarios = {
        "Atención Urgente / Primeros Auxilios": "🚨",
        "Toma de Constantes": "📊",
        "Administración de Medicación": "💊",
        "Cura de Heridas": "🩹",
        "Consulta Médica": "👨‍⚕️",
        "Derivación Hospitalaria": "🏥"
    };
    
    const iconosPsicosociales = {
        "Valoración Inicial": "📋",
        "Acompañamiento / Contención Emocional": "💚",
        "Comunicación de Malas Noticias": "💔",
        "Gestión de Trámites": "📄",
        "Resolución de Conflictos": "⚖️",
        "Atención a Menores": "👶"
    };
    
    const iconosEntregas = {
        "Entrega de Kit de Higiene": "🧴",
        "Entrega de Ropa / Calzado": "👕",
        "Entrega de Manta / Abrigo": "🧥",
        "Entrega de Alimentos (Biberones, específicos...)": "🍼",
        "Entrega de Juguetes / Material Infantil": "🎨"
    };
    
    let icono = iconosTipo[tipo] || '📋';
    if (tipo === 'san' && iconosSanitarios[subtipo]) icono = iconosSanitarios[subtipo];
    if (tipo === 'psi' && iconosPsicosociales[subtipo]) icono = iconosPsicosociales[subtipo];
    if (tipo === 'ent' && iconosEntregas[subtipo]) icono = iconosEntregas[subtipo];
    
    resultado = `${icono} ${subtipo.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Formatear según el subtipo específico
    if (!datosSubform || Object.keys(datosSubform).length === 0) {
        return resultado;
    }
    
    // SANITARIAS
    if (tipo === 'san') {
        if (subtipo === "Toma de Constantes") {
            if (datosSubform.tension_arterial) resultado += `🩺 Tensión Arterial: ${datosSubform.tension_arterial} mmHg\n`;
            if (datosSubform.frecuencia_cardiaca) resultado += `💓 Frecuencia Cardíaca: ${datosSubform.frecuencia_cardiaca} ppm\n`;
            if (datosSubform.temperatura) resultado += `🌡️ Temperatura: ${datosSubform.temperatura}°C\n`;
            if (datosSubform.saturacion_oxigeno) resultado += `🫁 Saturación O₂: ${datosSubform.saturacion_oxigeno}%\n`;
            if (datosSubform.glucemia) resultado += `🩸 Glucemia: ${datosSubform.glucemia} mg/dL\n`;
            if (datosSubform.observaciones_constantes) {
                resultado += `━━━━━━━━━━━━━━━━━━━━━━\n📝 Observaciones:\n${datosSubform.observaciones_constantes}\n`;
            }
        } else if (subtipo === "Atención Urgente / Primeros Auxilios") {
            if (datosSubform.tipo_urgencia) resultado += `🔹 Tipo: ${datosSubform.tipo_urgencia}\n`;
            if (datosSubform.gravedad) resultado += `🔹 Gravedad: ${datosSubform.gravedad}\n`;
            if (datosSubform.requiere_ambulancia) resultado += `🚑 Requiere ambulancia: ${datosSubform.requiere_ambulancia ? 'Sí' : 'No'}\n`;
            if (datosSubform.actuacion) {
                resultado += `━━━━━━━━━━━━━━━━━━━━━━\n📋 Actuación:\n${datosSubform.actuacion}\n`;
            }
        } else if (subtipo === "Administración de Medicación") {
            if (datosSubform.medicamento) resultado += `💊 Medicamento: ${datosSubform.medicamento}\n`;
            if (datosSubform.dosis) resultado += `📏 Dosis: ${datosSubform.dosis}\n`;
            if (datosSubform.via_administracion) resultado += `💉 Vía: ${datosSubform.via_administracion}\n`;
            if (datosSubform.hora_administracion) resultado += `🕐 Hora: ${datosSubform.hora_administracion}h\n`;
            if (datosSubform.prescrito_por) resultado += `👨‍⚕️ Prescrito por: ${datosSubform.prescrito_por}\n`;
            if (datosSubform.proxima_dosis) {
                const fecha = new Date(datosSubform.proxima_dosis);
                resultado += `⏰ Próxima dosis: ${fecha.toLocaleDateString()} - ${fecha.toLocaleTimeString()}\n`;
            }
        } else if (subtipo === "Cura de Heridas") {
            if (datosSubform.localizacion_herida) resultado += `📍 Localización: ${datosSubform.localizacion_herida}\n`;
            if (datosSubform.tipo_herida) resultado += `🔸 Tipo: ${datosSubform.tipo_herida}\n`;
            if (datosSubform.tamano_herida) resultado += `📐 Tamaño: ${datosSubform.tamano_herida}\n`;
            if (datosSubform.estado_herida) resultado += `✨ Estado: ${datosSubform.estado_herida}\n`;
            if (datosSubform.material_utilizado) resultado += `🧴 Material usado: ${datosSubform.material_utilizado}\n`;
            if (datosSubform.requiere_seguimiento_herida) resultado += `🔁 Seguimiento: Sí\n`;
            if (datosSubform.fecha_proxima_cura) resultado += `📅 Próxima cura: ${datosSubform.fecha_proxima_cura}\n`;
        } else if (subtipo === "Consulta Médica") {
            if (datosSubform.motivo_consulta) resultado += `🔹 Motivo: ${datosSubform.motivo_consulta}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.sintomas_principales) resultado += `🩺 Síntomas: ${datosSubform.sintomas_principales}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.diagnostico) resultado += `📋 Diagnóstico:\n${datosSubform.diagnostico}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.tratamiento_recomendado) resultado += `💊 Tratamiento:\n${datosSubform.tratamiento_recomendado}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.requiere_seguimiento_consulta && datosSubform.fecha_revision) {
                resultado += `🔁 Seguimiento: Sí - Revisión: ${datosSubform.fecha_revision}\n`;
            }
        } else if (subtipo === "Derivación Hospitalaria") {
            if (datosSubform.motivo_derivacion_hosp) resultado += `📋 Motivo: ${datosSubform.motivo_derivacion_hosp}\n`;
            if (datosSubform.servicio_derivado) resultado += `🏥 Servicio: ${datosSubform.servicio_derivado}\n`;
            if (datosSubform.hospital_destino) resultado += `🏢 Hospital: ${datosSubform.hospital_destino}\n`;
            if (datosSubform.medio_traslado) resultado += `🚑 Traslado: ${datosSubform.medio_traslado}\n`;
            if (datosSubform.hora_salida) resultado += `🕐 Salida: ${datosSubform.hora_salida}h\n`;
            if (datosSubform.acompanante) resultado += `👤 Acompañante: ${datosSubform.acompanante}\n`;
        }
    }
    
    // PSICOSOCIALES
    if (tipo === 'psi') {
        if (subtipo === "Valoración Inicial") {
            if (datosSubform.estado_emocional) resultado += `😊 Estado emocional: ${datosSubform.estado_emocional}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.motivo_llegada) resultado += `🔹 Motivo de llegada:\n${datosSubform.motivo_llegada}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.situacion_familiar) resultado += `👨‍👩‍👧 Situación familiar: ${datosSubform.situacion_familiar}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.necesidades_detectadas) resultado += `⚠️ Necesidades detectadas:\n${datosSubform.necesidades_detectadas}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.riesgo_identificado) resultado += `⚠️ Nivel de riesgo: ${datosSubform.riesgo_identificado}\n`;
        } else if (subtipo === "Acompañamiento / Contención Emocional") {
            if (datosSubform.duracion) resultado += `⏱️ Duración: ${datosSubform.duracion}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.motivo_acomp) resultado += `🔹 Motivo:\n${datosSubform.motivo_acomp}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.estado_inicial) resultado += `😔 Estado inicial: ${datosSubform.estado_inicial}\n`;
            if (datosSubform.estado_final) resultado += `😌 Estado final: ${datosSubform.estado_final}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.tecnicas_aplicadas) resultado += `🛠️ Técnicas: ${datosSubform.tecnicas_aplicadas}\n`;
        } else if (subtipo === "Comunicación de Malas Noticias") {
            if (datosSubform.tipo_noticia) resultado += `📋 Tipo: ${datosSubform.tipo_noticia}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.reaccion_inicial) resultado += `😢 Reacción inicial:\n${datosSubform.reaccion_inicial}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.apoyo_prestado) resultado += `💚 Apoyo prestado:\n${datosSubform.apoyo_prestado}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.red_apoyo) resultado += `🤝 Red activada: ${datosSubform.red_apoyo}\n`;
            if (datosSubform.seguimiento_psicologico) resultado += `🔁 Seguimiento psicológico: Sí\n`;
        } else if (subtipo === "Gestión de Trámites") {
            if (datosSubform.tipo_tramite) resultado += `📋 Tipo: ${datosSubform.tipo_tramite}\n`;
            if (datosSubform.entidad_organismo) resultado += `🏢 Organismo: ${datosSubform.entidad_organismo}\n`;
            if (datosSubform.estado_tramite) resultado += `📊 Estado: ${datosSubform.estado_tramite}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.proxima_accion) resultado += `📝 Próxima acción:\n${datosSubform.proxima_accion}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.fecha_seguimiento_tramite) resultado += `📅 Seguimiento: ${datosSubform.fecha_seguimiento_tramite}\n`;
        } else if (subtipo === "Resolución de Conflictos") {
            if (datosSubform.tipo_conflicto) resultado += `🔹 Tipo: ${datosSubform.tipo_conflicto}\n`;
            if (datosSubform.personas_implicadas) resultado += `👥 Personas implicadas: ${datosSubform.personas_implicadas}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.mediacion_realizada) resultado += `💬 Mediación:\n${datosSubform.mediacion_realizada}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.acuerdos_alcanzados) resultado += `✅ Acuerdos:\n${datosSubform.acuerdos_alcanzados}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.resultado_conflicto) resultado += `📊 Resultado: ${datosSubform.resultado_conflicto}\n`;
        } else if (subtipo === "Atención a Menores") {
            if (datosSubform.edad_menor) resultado += `👦 Edad: ${datosSubform.edad_menor} años\n`;
            if (datosSubform.acompanado_por) resultado += `👨‍👩‍👧 Acompañado por: ${datosSubform.acompanado_por}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.motivo_atencion_menor) resultado += `🔹 Motivo: ${datosSubform.motivo_atencion_menor}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.actividad_realizada) resultado += `🎨 Actividad realizada: ${datosSubform.actividad_realizada}\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.estado_menor) resultado += `😊 Estado: ${datosSubform.estado_menor}\n`;
            if (datosSubform.seguimiento_menor) resultado += `🔁 Seguimiento específico: Sí\n`;
        }
    }
    
    // ENTREGAS
    if (tipo === 'ent') {
        if (subtipo === "Entrega de Kit de Higiene") {
            resultado += `📦 Contenido:\n`;
            if (datosSubform.contenido_kit) {
                const items = datosSubform.contenido_kit.split(', ');
                items.forEach(item => resultado += `  ✓ ${item}\n`);
            }
            if (datosSubform.talla_panales) resultado += `  • Talla pañales: ${datosSubform.talla_panales}\n`;
            if (datosSubform.otro_contenido) resultado += `  • Otro: ${datosSubform.otro_contenido}\n`;
            resultado += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.cantidad_kit) resultado += `📊 Cantidad: ${datosSubform.cantidad_kit} kit(s)\n`;
        } else if (subtipo === "Entrega de Ropa / Calzado") {
            resultado += `📦 Artículos entregados:\n`;
            if (datosSubform.tipo_ropa) {
                const items = datosSubform.tipo_ropa.split(', ');
                items.forEach(item => resultado += `  • ${item}\n`);
            }
            resultado += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.tallas_ropa) resultado += `📏 Tallas: ${datosSubform.tallas_ropa}\n`;
            if (datosSubform.para_quien_ropa) resultado += `👤 Para: ${datosSubform.para_quien_ropa}\n`;
            if (datosSubform.estado_ropa) resultado += `✨ Estado: ${datosSubform.estado_ropa}\n`;
        } else if (subtipo === "Entrega de Manta / Abrigo") {
            if (datosSubform.tipo_manta) resultado += `🔹 Tipo: ${datosSubform.tipo_manta}\n`;
            if (datosSubform.talla_abrigo) resultado += `📏 Talla: ${datosSubform.talla_abrigo}\n`;
            if (datosSubform.cantidad_manta) resultado += `📊 Cantidad: ${datosSubform.cantidad_manta} unidad(es)\n`;
        } else if (subtipo === "Entrega de Alimentos (Biberones, específicos...)") {
            resultado += `📦 Artículos:\n`;
            if (datosSubform.tipo_alimento) {
                const items = datosSubform.tipo_alimento.split(', ');
                items.forEach(item => resultado += `  ✓ ${item}\n`);
            }
            if (datosSubform.especificar_tipo_leche) resultado += `  • Tipo de leche: ${datosSubform.especificar_tipo_leche}\n`;
            resultado += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (datosSubform.cantidad_alimentos) resultado += `📊 Cantidad: ${datosSubform.cantidad_alimentos}\n`;
            if (datosSubform.caducidad_alimentos) resultado += `📅 Caducidad: ${datosSubform.caducidad_alimentos}\n`;
            if (datosSubform.observaciones_alimentos) resultado += `📝 Observaciones: ${datosSubform.observaciones_alimentos}\n`;
        } else if (subtipo === "Entrega de Juguetes / Material Infantil") {
            if (datosSubform.tipo_juguete) resultado += `🎁 Artículos: ${datosSubform.tipo_juguete}\n`;
            if (datosSubform.edad_recomendada) resultado += `👶 Edad recomendada: ${datosSubform.edad_recomendada}\n`;
            if (datosSubform.para_quien_juguete) resultado += `👤 Para: ${datosSubform.para_quien_juguete}\n`;
            if (datosSubform.cantidad_juguetes) resultado += `📊 Cantidad: ${datosSubform.cantidad_juguetes}\n`;
        } else if (subtipo === "Otros") {
            if (datosSubform.descripcion_otros_ent) resultado += `📦 Descripción: ${datosSubform.descripcion_otros_ent}\n`;
            if (datosSubform.cantidad_otros_ent) resultado += `📊 Cantidad: ${datosSubform.cantidad_otros_ent}\n`;
        }
    }
    
    return resultado;
};
// --- UTILIDADES Y LOGS ---
window.sysLog = function(msg, type = 'info') {
    const c = document.getElementById('black-box-content');
    if (!c) { console.log(msg); return; }
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    let typeClass = 'log-type-info';
    if (type === 'error') typeClass = 'log-type-error';
    if (type === 'warn') typeClass = 'log-type-warn';
    if (type === 'nav') typeClass = 'log-type-nav';
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span class="log-time">[${time}]</span> <span class="${typeClass}">[${type.toUpperCase()}]</span> ${msg}`;
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
    if(type === 'error') console.error(msg); else console.log(`[SYS] ${msg}`);
};

window.onerror = function(message, source, lineno, colno, error) {
    window.sysLog(`CRITICAL ERROR: ${message} at line ${lineno}`, "error");
    if(currentUserData && currentUserData.rol === 'super_admin') {
        const bb = document.getElementById('black-box-overlay');
        if(bb && bb.classList.contains('hidden')) bb.classList.remove('hidden');
    }
};

window.toggleCajaNegra = function() {
    const bb = document.getElementById('black-box-overlay');
    if (bb) { if (bb.classList.contains('hidden')) { bb.classList.remove('hidden'); window.sysLog("Debug activado", "info"); } else { bb.classList.add('hidden'); } }
};
window.limpiarCajaNegra = function() { const c = document.getElementById('black-box-content'); if (c) c.innerHTML = ""; };

window.sysLog("Sistema Iniciado. Versión 3.1.4 (Nomenclatura Pre-Filiación)", "info");

// ============================================
// VARIABLES GLOBALES
// ============================================

// Detección de modo público
const urlParams = new URLSearchParams(window.location.search);
const isPublicMode = urlParams.get('public_id') || false;
let currentAlbergueId = isPublicMode || localStorage.getItem('currentAlbergueId') || null;

// Variables de estado principal
let currentUserData = null;
let currentAlbergueData = null;
let totalCapacidad = 0;
let ocupacionActual = 0;
let camasOcupadas = {};

// Listas y cache
let listaPersonasCache = []; 
let listaGlobalPrefiliacion = []; 
let listaFamiliaresTemp = [];
let adminFamiliaresTemp = [];

// Gestión de personas
let personaSeleccionadaId = null;
let personaEnGestion = null;
let personaEnGestionEsGlobal = false;
let personaIntervencionActiva = null;

// Modos y estados
let modoCambioCama = false;
let modoMapaGeneral = false;
let prefiliacionEdicionId = null;
let isGlobalEdit = false;
let highlightedFamilyId = null;
let savingLock = false;

// Edición
let userEditingId = null;
let albergueEdicionId = null;
let tipoDerivacionActual = null;

// Firebase unsubscribers
let unsubscribeUsers, unsubscribeAlberguesActivos, unsubscribeAlberguesMto, unsubscribePersonas, unsubscribeAlbergueDoc, unsubscribePool;

// QR Scanner
let html5QrCode = null;

// --- DOM HELPERS ---
window.el = function(id) { return document.getElementById(id); };
window.safeHide = function(id) {
    const e = window.el(id);
    if (e) {
        e.classList.add('hidden');
        // Además de la clase, fuerza estilos
        e.style.display = 'none';
        e.style.visibility = 'hidden';
        e.style.opacity = '0';
    }
};

window.safeShow = function(id) {
    const e = window.el(id);
    if (e) {
        e.classList.remove('hidden');
        // Quita el estilo inline de display para usar el CSS (flex para modales)
        e.style.display = '';
        e.style.visibility = 'visible';
        e.style.opacity = '1';
    }
};
window.safeRemoveActive = function(id) { const e = window.el(id); if(e) e.classList.remove('active'); };
window.mostrarInformes = function () {
    // Oculta TODAS las secciones de la app
    document.querySelectorAll('.main-content > div').forEach(div => div.classList.add('hidden'));

    // Muestra la sección de informes
    const seccion = document.getElementById('screen-informes');
    seccion.classList.remove('hidden');

    // Inserta el iframe SOLO SI NO EXISTE YA (evita recrearlo y posibles conflictos)
    if (!seccion.querySelector('iframe')) {
        const iframe = document.createElement('iframe');
        iframe.src = 'informes.html';
        iframe.style.width = '100%';
        iframe.style.height = '90vh';
        iframe.style.border = 'none';
        seccion.appendChild(iframe);
    }
};

window.safeAddActive = function(id) { const e = window.el(id); if(e) e.classList.add('active'); };
window.safeVal = function(id) { const e = window.el(id); return e ? e.value : ""; };
window.setVal = function(id, val) { const e = window.el(id); if (e) e.value = val; };
window.actualizarContadores = function() { const elOcc = window.el('ocupacion-count'); const elCap = window.el('capacidad-total'); if (elOcc) elOcc.innerText = ocupacionActual; if (elCap) elCap.innerText = totalCapacidad; };
window.showToast = function(msg) { const t = window.el('toast'); if(t) { t.style.visibility = 'visible'; t.innerText = msg; t.classList.add('show'); setTimeout(() => { t.classList.remove('show'); setTimeout(()=>{t.style.visibility='hidden'},300); }, 2000); } };
// ============================================
// VALIDACIONES DE DOCUMENTOS Y EDAD
// ============================================

// Validar formato y letra de DNI/NIE
function validarDocumento(tipo, numero) {
    if (!numero || numero.trim() === '') return true; // Permitir vacío
    
    numero = numero.toUpperCase().trim();
    
    if (tipo === 'DNI') {
        // Formato: 8 números + 1 letra
        const dniRegex = /^[0-9]{8}[A-Z]$/;
        if (!dniRegex.test(numero)) {
            alert('Formato DNI incorrecto. Debe ser 8 números seguidos de 1 letra (ejemplo: 12345678A)');
            return false;
        }
        // Validar letra correcta
        const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
        const num = parseInt(numero.substr(0, 8));
        const letraCorrecta = letras[num % 23];
        if (numero.charAt(8) !== letraCorrecta) {
            alert('La letra del DNI no es correcta');
            return false;
        }
    }
    
    if (tipo === 'NIE') {
        // Formato: X/Y/Z + 7 números + 1 letra
        const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;
        if (!nieRegex.test(numero)) {
            alert('Formato NIE incorrecto. Debe empezar por X, Y o Z, seguido de 7 números y 1 letra (ejemplo: X1234567A)');
            return false;
        }
        // Validar letra (convertir primera letra a número)
        const nieNum = numero.replace('X', '0').replace('Y', '1').replace('Z', '2');
        const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
        const num = parseInt(nieNum.substr(0, 8));
        const letraCorrecta = letras[num % 23];
        if (numero.charAt(8) !== letraCorrecta) {
            alert('La letra del NIE no es correcta');
            return false;
        }
    }
    
    return true;
}

// --- FUNCIÓN AUXILIAR PARA CALCULAR EDAD ---
function calcularEdad(fechaNacStr) {
    if (!fechaNacStr || fechaNacStr.trim() === '') return null;
    
    // Parsear fecha DD/MM/AAAA
    const partes = fechaNacStr.split('/');
    if (partes.length !== 3) return null;
    
    const dia = parseInt(partes[0]);
    const mes = parseInt(partes[1]) - 1; // Meses en JS son 0-11
    const anio = parseInt(partes[2]);
    
    if (isNaN(dia) || isNaN(mes) || isNaN(anio)) return null;
    
    const fechaNacimiento = new Date(anio, mes, dia);
    const hoy = new Date();
    
    let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
    const m = hoy.getMonth() - fechaNacimiento.getMonth();
    
    if (m < 0 || (m === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
        edad--;
    }
    
    return edad;
}

// Validar edad para NODNI (ya no se usa pero se mantiene por compatibilidad)
function validarEdadNODNI(tipoDoc, fechaNac) {
    if (tipoDoc !== 'NODNI') return true;
    if (!fechaNac || fechaNac.trim() === '') return true;
    
    const edad = calcularEdad(fechaNac); // ⭐ Usar función auxiliar
    
    if (edad === null) return true;
    
    if (edad >= 14) {
        alert('Error: Las personas mayores de 14 años deben tener DNI. Por favor, seleccione tipo de documento DNI o NIE.');
        return false;
    }
    
    return true;
}

// Setup para mostrar/ocultar campo de intolerancia
function setupIntoleranciaToggle(selectId, containerId) {
    const select = document.getElementById(selectId);
    const container = document.getElementById(containerId);
    if (select && container) {
        select.addEventListener('change', function() {
            if (this.value === 'si') {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        });
    }
}

window.formatearFecha = function(i) { let v = i.value.replace(/\D/g, '').slice(0, 8); if (v.length >= 5) i.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`; else if (v.length >= 3) i.value = `${v.slice(0, 2)}/${v.slice(2)}`; else i.value = v; };
window.verificarMenor = function(p) { const t = window.el(`${p}-tipo-doc`).value; const i = window.el(`${p}-doc-num`); if (i && t === 'MENOR') { i.value = "MENOR-SIN-DNI"; i.disabled = true; } else if (i) { i.disabled = false; if (i.value === "MENOR-SIN-DNI") i.value = ""; } };
window.limpiarFormulario = function(p) { ['nombre', 'ap1', 'ap2', 'doc-num', 'fecha', 'tel'].forEach(f => { const e = window.el(`${p}-${f}`); if (e) e.value = ""; }); const i = window.el(`${p}-doc-num`); if (i) i.disabled = false; };
window.getDatosFormulario = function(p) { 
    const tipoDoc = window.safeVal(`${p}-tipo-doc`);
    const docNum = window.safeVal(`${p}-doc-num`);
    const fechaNac = window.safeVal(`${p}-fecha`);
    const tieneIntoleranciaEl = document.getElementById(`${p}-tiene-intolerancia`);
    const tieneIntolerancia = tieneIntoleranciaEl ? tieneIntoleranciaEl.value === 'si' : false;
    const intoleranciaDetalle = tieneIntolerancia ? window.safeVal(`${p}-intolerancia-detalle`) : '';
    const noLocalizacionEl = document.getElementById(`${p}-no-localizacion`);
    const noLocalizacion = noLocalizacionEl ? noLocalizacionEl.checked : false;
    
    return { 
        nombre: window.safeVal(`${p}-nombre`), 
        ap1: window.safeVal(`${p}-ap1`), 
        ap2: window.safeVal(`${p}-ap2`), 
        tipoDoc: tipoDoc, 
        docNum: docNum, 
        fechaNac: fechaNac, 
        telefono: window.safeVal(`${p}-tel`),
        tieneIntolerancia: tieneIntolerancia,
        intoleranciaDetalle: intoleranciaDetalle,
        noLocalizacion: noLocalizacion
    }; 
};

// --- AUTH & USER MANAGEMENT ---
window.iniciarSesion = async function() { try { window.sysLog("Click Login", "info"); await signInWithEmailAndPassword(auth, window.el('login-email').value, window.el('login-pass').value); window.sysLog("Auth Firebase OK", "success"); } catch(err) { window.sysLog("Error Auth: " + err.message, "error"); alert(err.message); } };
window.cerrarSesion = function() { window.sysLog("Cerrando sesión", "warn"); signOut(auth); location.reload(); };
// Mostrar modal de recuperación
window.mostrarModalResetPass = function() {
    window.safeShow('modal-reset-pass'); // Usa tu helper global de modales
    window.el('reset-pass-email').value = "";
    window.el('reset-pass-feedback').innerText = "";
    window.el('btn-reset-pass').disabled = false;
};

// Enviar email  de recuperación
window.enviarResetPasswordEmail = async function() {
    const email = window.safeVal('reset-pass-email').trim();
    const feedback = window.el('reset-pass-feedback');
    const btn = window.el('btn-reset-pass');
    feedback.innerText = "";
    btn.disabled = true;

    if (!email.match(/^[^@]+@[^@]+\.[^@]{2,}$/)) {
        feedback.style.color = "red";
        feedback.innerText = "Introduce un correo válido";
        btn.disabled = false;
        return;
    }

    try {
        // auth está definido arriba como: const auth = getAuth(app);
        await sendPasswordResetEmail(auth, email);
        feedback.style.color = "green";
        feedback.innerText = "✅ Enviado: Revisa tu correo para recuperar la contraseña.";
    } catch (e) {
        feedback.style.color = "red";
        if (e.code && e.code.includes("user-not-found")) {
            feedback.innerText = "No existe ningún usuario con ese email.";
        } else {
            feedback.innerText = "Error: " + (e.message || e.code || e);
        }
    }
    btn.disabled = false;
};
window.cambiarEstadoUsuarioDirecto = async function(uid, nuevoEstado) {
    if (currentUserData.rol !== 'super_admin' && currentUserData.rol !== 'admin') { alert("Sin permisos"); window.cargarUsuarios(); return; }
    const targetDoc = await getDoc(doc(db, "usuarios", uid));
    if (targetDoc.exists()) {
        const u = targetDoc.data();
        if (u.rol === 'super_admin') { alert("Seguridad: No se puede desactivar a un Super Admin."); window.cargarUsuarios(); return; }
        if (currentUserData.rol === 'admin' && u.rol === 'admin') { alert("Seguridad: No puedes desactivar a otro Administrador."); window.cargarUsuarios(); return; }
    }
    await updateDoc(doc(db, "usuarios", uid), { activo: nuevoEstado });
    window.sysLog(`Usuario ${uid} estado: ${nuevoEstado}`, "info");
};

window.filtrarUsuarios = function() { window.cargarUsuarios(); };
window.abrirModalUsuario = async function(id = null) { userEditingId = id; window.safeShow('modal-crear-usuario'); const sel = window.el('new-user-role'); sel.innerHTML = ""; let roles = ['albergue', 'sanitario', 'psicosocial', 'observador']; if (currentUserData.rol === 'super_admin') { roles = ['super_admin', 'admin', ...roles]; } else if (currentUserData.rol === 'admin') { roles = ['albergue', 'sanitario', 'psicosocial', 'observador']; } roles.forEach(r => sel.add(new Option(r, r))); window.el('new-user-active').checked = true; window.el('new-user-active').disabled = false; if (id) { const s = await getDoc(doc(db, "usuarios", String(id))); if (s.exists()) { const d = s.data(); window.setVal('new-user-name', d.nombre); window.setVal('new-user-email', d.email); if (!roles.includes(d.rol)) { const opt = new Option(d.rol, d.rol); opt.disabled = true; sel.add(opt); } sel.value = d.rol; window.el('new-user-active').checked = (d.activo !== false); if (d.rol === 'super_admin') window.el('new-user-active').disabled = true; if (currentUserData.rol === 'super_admin') window.safeShow('btn-delete-user'); else window.safeHide('btn-delete-user'); } } else { window.setVal('new-user-name', ""); window.setVal('new-user-email', ""); window.safeHide('btn-delete-user'); } };
window.guardarUsuario = async function() { const e = window.safeVal('new-user-email'), p = window.safeVal('new-user-pass'), n = window.safeVal('new-user-name'), r = window.safeVal('new-user-role'); let isActive = window.el('new-user-active').checked; if (!e || !n) return alert("Faltan datos (Email/Nombre)"); if (r === 'super_admin' && !isActive) { alert("Seguridad: Super Admin siempre activo."); isActive = true; } try { if (userEditingId) { await updateDoc(doc(db, "usuarios", userEditingId), { nombre: n, rol: r, activo: isActive }); } else { if (!p) return alert("Contraseña obligatoria para nuevo usuario"); const tApp = initializeApp(firebaseConfig, "Temp"); const tAuth = getAuth(tApp); const uc = await createUserWithEmailAndPassword(tAuth, e, p); await setDoc(doc(db, "usuarios", uc.user.uid), { email: e, nombre: n, rol: r, activo: isActive }); await signOut(tAuth); deleteApp(tApp); } window.safeHide('modal-crear-usuario'); window.sysLog("Usuario guardado.", "success"); } catch (err) { console.error(err); if (err.code === 'auth/email-already-in-use') alert("ERROR: Correo ya registrado."); else alert("Error: " + err.message); } };
window.eliminarUsuario = async function() { if (userEditingId && confirm("Borrar?")) { await deleteDoc(doc(db, "usuarios", userEditingId)); window.safeHide('modal-crear-usuario'); window.sysLog("Usuario eliminado.", "warn"); } };
window.desactivarUsuariosMasivo = async function() { if (currentUserData.rol !== 'super_admin' && currentUserData.rol !== 'admin') return alert("No tienes permisos."); if (!confirm("⚠️ ATENCIÓN ⚠️\n\nEsta acción desactivará a TODOS los usuarios operativos.")) return; window.safeShow('loading-overlay'); try { const q = query(collection(db, "usuarios")); const querySnapshot = await getDocs(q); const batch = writeBatch(db); let count = 0; querySnapshot.forEach((doc) => { const u = doc.data(); if (u.rol !== 'super_admin' && u.rol !== 'admin') { if (u.activo !== false) { batch.update(doc.ref, { activo: false }); count++; } } }); if (count > 0) { await batch.commit(); window.sysLog(`Desactivados: ${count}`, "warn"); alert(`Se han desactivado ${count} usuarios.`); } else { alert("No había usuarios para desactivar."); } } catch (e) { console.error(e); alert("Error: " + e.message); } finally { window.safeHide('loading-overlay'); } };

// --- PUBLIC & QR ---
window.abrirModalQR = function(albergueId) {      const id = albergueId || currentAlbergueId;     const url = window.location.origin + window.location.pathname + '?public_id=' + id;     const isFiliacion = !!albergueId;     setTimeout(() => {          window.safeShow('modal-qr');          const d = window.el("qrcode-display");          d.innerHTML = "";          new QRCode(d, { text: url, width: 250, height: 250 });          window.el('qr-modal-title').innerText = isFiliacion ? "QR de Filiación Pública" : "Escanea para acceder";         window.el('qr-modal-url').innerText = isFiliacion ? url : "Auto-registro móvil.";     }, 100);  };
window.toggleStartButton = function() { window.el('btn-start-public').disabled = !window.el('check-consent').checked; };
window.iniciarRegistro = function() { window.safeHide('public-welcome-screen'); window.safeShow('public-form-container'); };
window.mostrarFormularioPublico = function() {
    // Primero OCULTA BIENVENIDA y MUESTRA el formulario correctamente
    window.safeHide('public-welcome-screen');
    window.safeShow('public-form-container');

    // Si quieres mostrar el nombre del albergue, actualiza solo el header fijo (si lo deseas)
    // Ejemplo: 
    // const nombreAlbergue = document.getElementById('public-albergue-name-welcome').innerText;
    // const headerLabel = document.getElementById('public-form-nombre-albergue');
    // if(headerLabel) headerLabel.innerText = nombreAlbergue;

    // LIMPIA campos si quieres asegurar que el usuario ve todo vacío al entrar:
    const formContainer = document.getElementById('public-form-container');
    if (formContainer) {
        const inputs = formContainer.querySelectorAll('input, select, textarea');
        inputs.forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
            else el.value = '';
        });
    }
};
window.publicoGuardarTodo = async function() {
    const d = window.getDatosFormulario('pub');
    
    // ⭐ VALIDACIONES OBLIGATORIAS
    if (!d.nombre || !d.nombre.trim()) {
        return alert("El nombre es obligatorio");
    }
    
    if (!d.ap1 || !d.ap1.trim()) {
        return alert("El primer apellido es obligatorio");
    }
    
    // Validar que tenga al menos un documento (DNI, NIE o Pasaporte)
    if (!d.tipoDoc || d.tipoDoc === "") {
        return alert("Debe seleccionar un tipo de documento");
    }
    
    if (d.tipoDoc !== 'MENOR' && (!d.docNum || !d.docNum.trim())) {
        return alert("El número de documento es obligatorio");
    }
    
    // Validar formato del documento
    if (d.docNum && d.docNum.trim()) {
        if (!validarDocumento(d.tipoDoc, d.docNum)) {
            return;
        }
    }
    
    if (!auth.currentUser) { 
        try { 
            await signInAnonymously(auth); 
        } catch (e) {} 
    }
    
    let nombreAlb = "Albergue (QR)";
    const hAlb = window.el('public-albergue-name');
    if(hAlb) nombreAlb = hAlb.innerText;
    
    const b = writeBatch(db);
    const fid = new Date().getTime().toString();
    const tRef = doc(collection(db, "pool_prefiliacion"));
    
    b.set(tRef, { 
        ...d, 
        familiaId: fid, 
        rolFamilia: 'TITULAR', 
        estado: 'espera', 
        origenAlbergueId: currentAlbergueId, 
        fechaRegistro: new Date() 
    });
    
    const lRef = collection(db, "pool_prefiliacion", tRef.id, "historial");
    b.set(doc(lRef), { 
        fecha: new Date(), 
        usuario: "Auto-QR", 
        accion: "Alta en Pre-Filiación", 
        detalle: `Desde QR ${nombreAlb}` 
    });
    
    listaFamiliaresTemp.forEach(async f => { 
        const fRef = doc(collection(db, "pool_prefiliacion")); 
        b.set(fRef, { 
            ...f, 
            familiaId: fid, 
            rolFamilia: 'MIEMBRO', 
            estado: 'espera', 
            origenAlbergueId: currentAlbergueId, 
            fechaRegistro: new Date() 
        }); 
    });
    
    await b.commit();
    
    const nombrePersona = d.nombre + (d.ap1 ? ' ' + d.ap1 : '');
    const successNameEl = document.getElementById('public-success-name');
    if (successNameEl) {
        successNameEl.innerText = nombrePersona;
    }

    window.safeHide('public-form-container');
    window.safeShow('public-success-container');
    
    // Limpiar formulario y lista de familiares
    listaFamiliaresTemp = [];
    
    // Resetear checkbox de consentimiento
    const consentCheck = document.getElementById('public-consent-check');
    if(consentCheck) consentCheck.checked = false;
    
    const btnContinuar = document.getElementById('btn-continuar-public');
    if(btnContinuar) btnContinuar.disabled = true;
};

// --- LOADERS & NAV ---
window.cargarAlberguesActivos = function() {
    const c = window.el('lista-albergues-activos');
    if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos();
    unsubscribeAlberguesActivos = onSnapshot(query(collection(db,"albergues"),where("activo","==",true)), s=>{
        c.innerHTML="";
        s.forEach(async d=>{
            const alb = d.data();
            // NUEVO: Filtrar archivados
            if (alb.archivado === true) {
                return; // Saltar este albergue
            }
            const div = document.createElement('div');
            div.className="mto-card";
            div.innerHTML=`<h3>${alb.nombre}</h3><p id="counter-${d.id}" style="font-weight:bold;color:var(--primary);margin:10px 0;">Cargando...</p><div class="mto-info">Entrar</div>`;
            div.onclick=()=>window.cargarDatosYEntrar(d.id);
            c.appendChild(div);
            const qCount = query(collection(db, "albergues", d.id, "personas"), where("estado", "==", "ingresado"));
            const snap = await getDocs(qCount);
            const count = snap.size;
            const cap = alb.capacidad || 0;
            const elCounter = document.getElementById(`counter-${d.id}`);
            if(elCounter) elCounter.innerText = `Ocupación: ${count} / ${cap}`;
        });
    });
};
window.cargarAlberguesMantenimiento = async function() {
    window.sysLog("Cargando albergues para mantenimiento", "info");
    
    try {
        var alberguesSnapshot = await getDocs(collection(db, "albergues"));
        
        var activos = [];
        var archivados = [];
        
        alberguesSnapshot.forEach(function(doc) {
            var data = doc.data();
            data.id = doc.id;
            
            if (data.archivado === true) {
                archivados.push(data);
            } else {
                activos.push(data);
            }
        });
        
        window.renderizarAlberguesMantenimiento(activos, archivados);
        
    } catch(e) {
        console.error(e);
        window.sysLog("Error cargando albergues: " + e.message, "error");
    }
};

window.renderizarAlberguesMantenimiento = function(activos, archivados) {
    var containerActivos = window.el('mto-lista-activos');
    var containerArchivados = window.el('mto-lista-archivados');
    
    if (!containerActivos || !containerArchivados) {
        window.sysLog("ERROR: No se encontraron contenedores de mantenimiento", "error");
        return;
    }
    
    // Renderizar activos
    if (activos.length === 0) {
        containerActivos.innerHTML = '<p style="text-align:center; color:#999;">No hay albergues activos.</p>';
    } else {
        var htmlActivos = '';
        activos.forEach(function(alb) {
            htmlActivos += window.generarTarjetaAlbergue(alb, false);
        });
        containerActivos.innerHTML = htmlActivos;
    }
    
    // Renderizar archivados
    if (archivados.length === 0) {
        containerArchivados.innerHTML = '<p style="text-align:center; color:#999;">No hay albergues archivados.</p>';
    } else {
        var htmlArchivados = '';
        archivados.forEach(function(alb) {
            htmlArchivados += window.generarTarjetaAlbergue(alb, true);
        });
        containerArchivados.innerHTML = htmlArchivados;
    }
};

window.generarTarjetaAlbergue = function(albergue, esArchivado) {
    var nombre = albergue.nombre || 'Sin nombre';
    var direccion = albergue.direccion || 'Sin dirección';
    var capacidad = albergue.capacidad || 0;
    
    // Verificar rol del usuario actual
    var rolUsuario = currentUserData ? currentUserData.rol : '';
    var esSuperAdmin = (rolUsuario === 'super_admin');
    
    var claseEstado = esArchivado ? 'albergue-card-archivado' : 'albergue-card-activo';
    var badge = esArchivado 
        ? '<span class="badge" style="background:#94a3b8; color:white;">Archivado</span>'
        : '<span class="badge badge-active">Activo</span>';
    
    var html = '<div class="albergue-card ' + claseEstado + '">';
    html += '<div class="albergue-card-header">';
    html += '<h3><i class="fa-solid fa-hotel"></i> ' + nombre + '</h3>';
    html += badge;
    html += '</div>';
    
    html += '<div class="albergue-card-info">';
    html += '<p><i class="fa-solid fa-location-dot"></i> ' + direccion + '</p>';
    html += '<p><i class="fa-solid fa-bed"></i> Capacidad: ' + capacidad + ' camas</p>';
    html += '</div>';
    
    html += '<div class="albergue-card-actions">';
    
    // Botón Editar (todos los admins)
    html += '<button class="btn-icon" onclick="window.editarAlbergueMantenimiento(\'' + albergue.id + '\')" title="Editar">';
    html += '<i class="fa-solid fa-pen"></i>';
    html += '</button>';
    
    if (esArchivado) {
        // Botón Reactivar (admin y super_admin)
        html += '<button class="btn-icon" style="background:#10b981; color:white;" onclick="window.reactivarAlbergue(\'' + albergue.id + '\')" title="Reactivar">';
        html += '<i class="fa-solid fa-rotate-left"></i>';
        html += '</button>';
    } else {
        // Botón Archivar (admin y super_admin)
        html += '<button class="btn-icon" style="background:#f59e0b; color:white;" onclick="window.archivarAlbergue(\'' + albergue.id + '\')" title="Archivar">';
        html += '<i class="fa-solid fa-box-archive"></i>';
        html += '</button>';
    }
    
    // Botón QR (todos los admins)
    html += '<button class="btn-icon" style="background:#06b6d4; color:white;" onclick="window.abrirModalQR(\'' + albergue.id + '\')" title="Ver QR Filiación">';
    html += '<i class="fa-solid fa-qrcode"></i>';
    html += '</button>';
    
    // Botón Borrar - SOLO SUPER_ADMIN
    if (esSuperAdmin) {
        var nombreEscapado = nombre.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        html += '<button class="btn-icon" style="background:#ef4444; color:white;" onclick="window.confirmarBorrarAlbergue(\'' + albergue.id + '\', \'' + nombreEscapado + '\')" title="Borrar permanentemente">';
        html += '<i class="fa-solid fa-trash"></i>';
        html += '</button>';
    }
    
    html += '</div>';
    html += '</div>';
    
    return html;
};

window.editarAlbergueMantenimiento = function(albergueId) {
    // Reutilizar la función existente de edición
    window.abrirModalAlbergue(albergueId);
};

window.archivarAlbergue = async function(albergueId) {
    if (!confirm('¿Archivar este albergue? Dejará de aparecer en Gestión pero podrás reactivarlo después.')) {
        return;
    }
    
    try {
        await updateDoc(doc(db, "albergues", albergueId), {
            archivado: true,
            fechaArchivado: new Date()
        });
        
        window.showToast("Albergue archivado correctamente");
        window.sysLog("Albergue archivado: " + albergueId, "info");
        window.cargarAlberguesMantenimiento(); // Recargar lista
        
    } catch(e) {
        console.error(e);
        alert("Error al archivar: " + e.message);
    }
};

window.reactivarAlbergue = async function(albergueId) {
    if (!confirm('¿Reactivar este albergue? Volverá a aparecer en Gestión.')) {
        return;
    }
    
    try {
        await updateDoc(doc(db, "albergues", albergueId), {
            archivado: false,
            fechaReactivacion: new Date()
        });
        
        window.showToast("Albergue reactivado correctamente");
        window.sysLog("Albergue reactivado: " + albergueId, "info");
        window.cargarAlberguesMantenimiento(); // Recargar lista
        
    } catch(e) {
        console.error(e);
        alert("Error al reactivar: " + e.message);
    }
};

window.confirmarBorrarAlbergue = function(albergueId, nombreAlbergue) {
    // Verificación de permisos
    if (!currentUserData || currentUserData.rol !== 'super_admin') {
        alert("⛔ Acceso denegado\n\nSolo los Super Administradores pueden borrar albergues permanentemente.");
        window.sysLog("INTENTO NO AUTORIZADO de borrar albergue por: " + (currentUserData ? currentUserData.nombre : "desconocido"), "warn");
        return;
    }
    
    if (!confirm('⚠️ ATENCIÓN: ¿Borrar permanentemente el albergue "' + nombreAlbergue + '"?\n\nEsta acción NO se puede deshacer y eliminará:\n- El albergue\n- Todas sus personas\n- Todo su historial\n\n¿Estás ABSOLUTAMENTE seguro?')) {
        return;
    }
    
    if (!confirm('ÚLTIMA CONFIRMACIÓN:\n\n¿ELIMINAR PERMANENTEMENTE "' + nombreAlbergue + '"?\n\nEsta acción es irreversible y será registrada bajo tu usuario: ' + currentUserData.nombre)) {
        return;
    }
    
    window.borrarAlberguePermanente(albergueId, nombreAlbergue);
};

window.borrarAlberguePermanente = async function(albergueId, nombreAlbergue) {
    try {
        window.safeShow('loading-overlay');
        
        // Eliminar el documento del albergue (subcollections se deben eliminar manualmente en producción)
        await deleteDoc(doc(db, "albergues", albergueId));
        
        window.safeHide('loading-overlay');
        window.showToast("Albergue eliminado permanentemente");
        window.sysLog("Albergue BORRADO: " + nombreAlbergue, "warn");
        
        window.cargarAlberguesMantenimiento(); // Recargar lista
        
    } catch(e) {
        console.error(e);
        window.safeHide('loading-overlay');
        alert("Error al borrar: " + e.message);
    }
};
window.cargarObservatorio = async function() { const list = window.el('obs-list-container'); if(!list) return; list.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>'; window.el('kpi-espera').innerText = "-"; window.el('kpi-alojados').innerText = "-"; window.el('kpi-libres').innerText = "-"; window.el('kpi-percent').innerText = "-%"; try { let totalEspera = 0, totalAlojados = 0, totalCapacidadGlobal = 0, htmlList = ""; const alberguesSnap = await getDocs(query(collection(db, "albergues"), where("activo", "==", true))); const promesas = alberguesSnap.docs.map(async (docAlb) => { const dataAlb = docAlb.data(); const cap = parseInt(dataAlb.capacidad || 0); const esperaSnap = await getDocs(query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", docAlb.id), where("estado", "==", "espera"))); const w = esperaSnap.size; const alojadosSnap = await getDocs(query(collection(db, "albergues", docAlb.id, "personas"), where("estado", "==", "ingresado"))); const h = alojadosSnap.size; return { id: docAlb.id, nombre: dataAlb.nombre, capacidad: cap, espera: w, alojados: h }; }); const resultados = await Promise.all(promesas); resultados.forEach(res => { totalEspera += res.espera; totalAlojados += res.alojados; totalCapacidadGlobal += res.capacidad; const libres = Math.max(0, res.capacidad - res.alojados); const porcentaje = res.capacidad > 0 ? Math.round((res.alojados / res.capacidad) * 100) : 0; let barClass = "low"; if(porcentaje > 50) barClass = "med"; if(porcentaje > 85) barClass = "high"; htmlList += `<div class="obs-row"><div class="obs-row-title">${res.nombre}</div><div class="obs-stats-group"><div class="obs-mini-stat"><span>Espera</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${res.id}', 'espera')">${res.espera}</strong></div><div class="obs-mini-stat"><span>Alojados</span><strong class="obs-clickable" onclick="window.verListaObservatorio('${res.id}', 'alojados')">${res.alojados}</strong></div><div class="obs-mini-stat"><span>Ocupación</span><strong>${res.alojados} / ${res.capacidad}</strong></div><div class="obs-mini-stat"><span>Libres</span><strong>${libres}</strong></div></div><div class="prog-container"><div class="prog-track"><div class="prog-fill ${barClass}" style="width: ${porcentaje}%"></div></div></div></div>`; }); const globalLibres = Math.max(0, totalCapacidadGlobal - totalAlojados); const globalPercent = totalCapacidadGlobal > 0 ? Math.round((totalAlojados / totalCapacidadGlobal) * 100) : 0; window.el('kpi-espera').innerText = totalEspera; window.el('kpi-alojados').innerText = totalAlojados; window.el('kpi-libres').innerText = globalLibres; window.el('kpi-percent').innerText = `${globalPercent}%`; list.innerHTML = htmlList; } catch(e) { window.sysLog("Error obs: " + e.message, "error"); list.innerHTML = "<p>Error cargando datos.</p>"; } };
window.verListaObservatorio = async function(albId, tipo) { const c = window.el('obs-modal-content'); const t = window.el('obs-modal-title'); c.innerHTML = '<div style="text-align:center;"><div class="spinner"></div></div>'; t.innerText = tipo === 'espera' ? 'Personas en Espera' : 'Personas Alojadas'; window.safeShow('modal-obs-detalle'); try { let q; let isGlobal = false; if (tipo === 'espera') { q = query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", albId), where("estado", "==", "espera")); isGlobal = true; } else { q = query(collection(db, "albergues", albId, "personas"), where("estado", "==", "ingresado")); } const snap = await getDocs(q); if (snap.empty) { c.innerHTML = '<p>Sin registros.</p>'; return; } let data = []; snap.forEach(d => data.push({ id: d.id, ...d.data() })); if (tipo === 'espera') { data.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0)); } else { data.sort((a, b) => { if (!a.cama && !b.cama) return 0; if (!a.cama) return -1; if (!b.cama) return 1; return parseInt(a.cama) - parseInt(b.cama); }); } let h = `<table class="fam-table"><thead><tr><th style="width:40px;"></th>`; if(tipo === 'alojados') h += `<th>Cama</th>`; h += `<th>Nombre</th><th>DNI</th><th>Tel</th></tr></thead><tbody>`; data.forEach(d => { const histBtn = `<button class="btn-icon-small" onclick="window.verHistorialObservatorio('${d.id}', ${isGlobal}, '${albId}')"><i class="fa-solid fa-clock-rotate-left"></i></button>`; h += `<tr><td style="text-align:center;">${histBtn}</td>`; if(tipo === 'alojados') h += `<td><strong>${d.cama || '-'}</strong></td>`; h += `<td>${d.nombre} ${d.ap1||''}</td><td>${d.docNum||'-'}</td><td>${d.telefono||'-'}</td></tr>`; }); h += '</tbody></table>'; c.innerHTML = h; } catch (e) { window.sysLog("Error list: " + e.message, "error"); c.innerHTML = "<p>Error al cargar lista.</p>"; } };
window.verHistorialObservatorio = function(pId, isGlobal, albId){ window.verHistorial(pId, isGlobal, albId); };
window.cargarUsuarios = function() { 
    const c = window.el('lista-usuarios-container'); 
    const filterText = window.safeVal('search-user').toLowerCase().trim(); 
    
    // LIMPIAR LISTENER ANTERIOR
    if(unsubscribeUsers) unsubscribeUsers();
    
    unsubscribeUsers = onSnapshot(query(collection(db,"usuarios")), s => { 
        c.innerHTML = ""; 
        if(s.empty) { 
            c.innerHTML="<p>No hay usuarios.</p>"; 
            return; 
        } 
        s.forEach(d => { 
            const u = d.data(); 
            if(filterText && !u.nombre.toLowerCase().includes(filterText) && !u.email.toLowerCase().includes(filterText)) return; 
            if(currentUserData.rol === 'admin' && u.rol === 'super_admin') return; 
            const isSuper = (u.rol === 'super_admin'); 
            const inactiveClass = (u.activo === false) ? 'inactive' : 'active'; 
            const disabledAttr = isSuper ? 'disabled title="Super Admin no se puede desactivar"' : ''; 
            c.innerHTML += ` 
                <div class="user-card-item ${inactiveClass}" onclick="window.abrirModalUsuario('${d.id}')"> 
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;"> 
                        <div><strong>${u.nombre}</strong><br><small class="role-badge role-${u.rol}">${u.rol}</small></div> 
                        <div onclick="event.stopPropagation()"> 
                            <label class="toggle-switch small"> 
                                <input type="checkbox" class="toggle-input" onchange="window.cambiarEstadoUsuarioDirecto('${d.id}', this.checked)" ${u.activo!==false?'checked':''} ${disabledAttr}> 
                                <span class="toggle-slider"></span> 
                            </label> 
                        </div> 
                    </div> 
                </div>`; 
        }); 
    }); 
};

window.navegar = function(p) { window.sysLog(`Navegando: ${p}`, "nav"); if(unsubscribeUsers) unsubscribeUsers(); if(unsubscribeAlberguesActivos) unsubscribeAlberguesActivos(); ['screen-home','screen-usuarios','screen-gestion-albergues','view-mantenimiento','screen-operativa','screen-observatorio', 'screen-intervencion','intervencion-search-screen','screen-informes'].forEach(id=>window.safeHide(id)); if(!currentUserData) return; if(p !== 'intervencion') { window.resetIntervencion(); window.detenerEscaner(); } if(['home', 'mantenimiento', 'observatorio', 'usuarios', 'gestion-albergues'].includes(p)) { currentAlbergueId = null; currentAlbergueData = null; } if(p==='home') window.safeShow('screen-home'); else if(p==='intervencion') { window.sysLog("Navegando a: Intervenciones", "nav"); var isFocusedMode = document.body.classList.contains('focused-mode'); if (isFocusedMode) { window.safeShow('screen-intervencion'); } else { window.safeShow('intervencion-search-screen'); window.cargarPersonasParaIntervencion(); } } else if(p==='gestion-albergues') { window.cargarAlberguesActivos(); window.safeShow('screen-gestion-albergues'); } else if(p==='mantenimiento') { window.sysLog("Navegando a: Mantenimiento", "nav"); window.safeShow('view-mantenimiento'); window.cargarAlberguesMantenimiento(); } else if(p==='operativa') { window.safeShow('screen-operativa'); const t = window.configurarTabsPorRol(); window.cambiarPestana(t); } else if(p==='observatorio') { window.cargarObservatorio(); window.safeShow('screen-observatorio'); } else if(p==='usuarios') { window.cargarUsuarios(); window.safeShow('screen-usuarios'); } else if(p==='informes') { window.safeShow('screen-informes'); const target = document.getElementById('screen-informes'); if (!target.querySelector('iframe')) { const iframe = document.createElement('iframe'); iframe.src = 'informes.html'; iframe.style.width = '100%'; iframe.style.height = '90vh'; iframe.style.border = 'none'; target.appendChild(iframe); } } document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); if(p.includes('albergue')) window.safeAddActive('nav-albergues'); else if(p.includes('obs')) window.safeAddActive('nav-obs'); else if(p.includes('mantenimiento')) window.safeAddActive('nav-mto'); else if(p === 'intervencion') window.safeAddActive('nav-intervencion'); else if(p === 'informes') window.safeAddActive('nav-informes'); else window.safeAddActive('nav-home'); };
window.configurarTabsPorRol = function() { const r = (currentUserData.rol || "").toLowerCase().trim(); ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeHide(id)); if(['super_admin', 'admin'].includes(r)) { ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeShow(id)); return 'filiacion'; } if(r === 'albergue') { window.safeShow('btn-tab-pref'); window.safeShow('btn-tab-fil'); window.safeShow('btn-tab-ent'); return 'filiacion'; } if(['sanitario', 'psicosocial'].includes(r)) { window.safeShow('btn-tab-san'); window.safeShow('btn-tab-psi'); return 'sanitaria'; } return 'filiacion'; };
window.cambiarPestana = function(t) { window.sysLog(`Pestaña: ${t}`, "nav"); ['tab-prefiliacion', 'tab-filiacion', 'tab-sanitaria', 'tab-psicosocial', 'tab-entregas'].forEach(id => window.safeHide(id)); ['btn-tab-pref', 'btn-tab-fil', 'btn-tab-san', 'btn-tab-psi', 'btn-tab-ent'].forEach(id => window.safeRemoveActive(id)); window.safeAddActive(`btn-tab-${t.substring(0,3)}`); window.safeShow(`tab-${t}`); 
    if (t === 'prefiliacion') { window.limpiarFormulario('man'); adminFamiliaresTemp = []; if(window.actualizarListaFamiliaresAdminUI) window.actualizarListaFamiliaresAdminUI(); if(window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML = ""; window.cancelarEdicionPref(); } 
    else if (t === 'filiacion') { if(window.el('buscador-persona')) window.el('buscador-persona').value = ""; window.safeHide('resultados-busqueda'); window.safeHide('panel-gestion-persona'); window.personaEnGestion = null; }
    else if (['sanitaria','psicosocial','entregas'].includes(t)) {
        // Resetear buscadores de las nuevas pestañas
        const prefix = t === 'sanitaria' ? 'san' : (t === 'psicosocial' ? 'psi' : 'ent');
        if(window.el(`search-${prefix}`)) window.el(`search-${prefix}`).value = "";
        window.safeHide(`res-${prefix}`);
        window.cerrarFormularioIntervencion(prefix);
    }
};
window.configurarDashboard = function() { 
    const r=(currentUserData.rol||"").toLowerCase(); 
    if(window.el('user-name-display')) window.el('user-name-display').innerText=currentUserData.nombre; 
    if(window.el('user-role-badge')) window.el('user-role-badge').innerText=r.toUpperCase(); 
    window.safeHide('header-btn-users'); 
    window.safeHide('container-ver-ocultos'); 
    if(r === 'super_admin') window.safeShow('header-btn-debug'); 
    else window.safeHide('header-btn-debug'); 
    const navItems = document.querySelectorAll('.nav-item'); 
    navItems.forEach(n => n.classList.remove('active', 'disabled', 'hidden')); 
    if(['super_admin', 'admin'].includes(r)) { 
        window.safeShow('header-btn-users'); 
    } 
    if(!['super_admin', 'admin'].includes(r)) { 
        window.el('nav-mto').classList.add('disabled'); 
    } 
    if(['albergue', 'sanitario', 'psicosocial'].includes(r)) { 
        window.el('nav-obs').classList.add('disabled'); 
    } 
    if(r === 'observador') { 
        window.el('nav-albergues').classList.add('disabled'); 
    } 
    if(r === 'super_admin') { 
        window.safeShow('container-ver-ocultos'); 
    } 
    window.safeAddActive('nav-home');
    
    // Setup derivaciones notification system
    window.setupDerivacionesListener();
};

// --- SIGUE EN PARTE 2 ---
// --- PARTE 2 (Intervenciones & Lógica Compleja) ---

window.iniciarEscanerReal = function() {
    window.sysLog("=== INICIANDO ESCÁNER QR ===", "info");
    
    // Detener cualquier escáner previo
    window.detenerEscaner();
    
    // Ocultar placeholder y botón de inicio
    window.safeHide('scan-placeholder');
    window.safeHide('btn-start-camera');
    
    // CRÍTICO: Mostrar el elemento reader con AMBOS métodos
    var readerEl = window.el('reader');
    if (!readerEl) {
        window.sysLog("ERROR CRÍTICO: Elemento 'reader' no encontrado en el DOM", "error");
        alert("Error: No se encuentra el contenedor del escáner. Recarga la página.");
        return;
    }
    
    // Forzar visibilidad del reader con múltiples métodos
    readerEl.classList.remove('hidden');
    readerEl.style.display = 'block';
    readerEl.style.visibility = 'visible';
    readerEl.style.opacity = '1';
    
    window.sysLog("Elemento 'reader' forzado a visible", "info");
    window.sysLog("   - display: " + readerEl.style.display, "info");
    window.sysLog("   - visibility: " + readerEl.style.visibility, "info");
    
    // Mostrar botón de detener
    window.safeShow('btn-stop-camera');
    
    // Iniciar escáner con delay para que el DOM se actualice
    setTimeout(function() {
        try {
            if (!html5QrCode) {
                window.sysLog("Creando nueva instancia de Html5Qrcode", "info");
                html5QrCode = new Html5Qrcode("reader");
            }
            
            var config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };
            
            window.sysLog("Solicitando acceso a cámara trasera...", "info");
            
            html5QrCode.start(
                { facingMode: "environment" },
                config,
                window.onScanSuccess,
                function(errorMessage) {
                    // Ignorar errores de escaneo continuo (son normales)
                }
            ).then(function() {
                window.sysLog("Cámara iniciada correctamente!", "success");
                window.sysLog("   El cuadro de la cámara debería ser visible ahora", "success");
            }).catch(function(err) {
                console.error(err);
                window.sysLog("Error al iniciar cámara: " + err, "error");
                
                var mensajeError = [
                    "Error al iniciar la cámara.\n",
                    "\nVerifica:",
                    "\n- Permisos de cámara concedidos",
                    "\n- Conexión HTTPS (necesaria para cámara)",
                    "\n- Navegador compatible (Chrome, Safari)",
                    "\n- Otra app no esté usando la cámara",
                    "\n\nError técnico: " + err
                ].join('');
                
                alert(mensajeError);
                window.detenerEscaner();
            });
            
        } catch(e) {
            console.error(e);
            window.sysLog("Excepción crítica: " + e.message, "error");
            alert("Error crítico al iniciar cámara:\n\n" + e.message + "\n\nRecarga la página e intenta de nuevo.");
            window.detenerEscaner();
        }
    }, 300);
};
window.detenerEscaner = function() { if (html5QrCode && html5QrCode.isScanning) { html5QrCode.stop().then(() => { window.sysLog("Cámara detenida.", "info"); html5QrCode.clear(); }).catch(err => console.error(err)).finally(() => { resetScannerUI(); }); } else { resetScannerUI(); } };
function resetScannerUI() {
    window.sysLog("Reseteando UI del escáner", "info");
    
    // Ocultar elementos de escaneo activo
    window.safeHide('reader');
    window.safeHide('btn-stop-camera');
    
    // Mostrar elementos de estado inicial
    window.safeShow('scan-placeholder');
    window.safeShow('btn-start-camera');
    
    window.sysLog("Botón 'Activar Cámara' visible y listo", "success");
}
window.onScanSuccess = function(decodedText, decodedResult) { if(html5QrCode) html5QrCode.stop().then(() => { window.sysLog(`QR Leído: ${decodedText}`, "success"); html5QrCode.clear(); resetScannerUI(); try { const url = new URL(decodedText); const aid = url.searchParams.get("aid"); const pid = url.searchParams.get("pid"); if(!aid || !pid) throw new Error("QR inválido"); if(currentAlbergueId && aid !== currentAlbergueId) { if(confirm(`Este QR es de otro albergue. ¿Quieres cambiar a ese albergue?`)) { window.cambiarAlberguePorQR(aid, pid); return; } else { return; } } if(!currentAlbergueId) { window.cambiarAlberguePorQR(aid, pid); return; } window.procesarLecturaPersona(pid); } catch (e) { alert("QR no válido o formato incorrecto."); } }); };
window.cambiarAlberguePorQR = async function(aid, pid) { window.sysLog(`Cambiando albergue por QR a: ${aid}`, "warn"); currentAlbergueId = aid; window.safeShow('loading-overlay'); try { const dS = await getDoc(doc(db,"albergues",aid)); if(dS.exists()) { currentAlbergueData = dS.data(); totalCapacidad = parseInt(currentAlbergueData.capacidad||0); } else { alert("Albergue no existe"); window.safeHide('loading-overlay'); return; } if(unsubscribePersonas) unsubscribePersonas(); unsubscribePersonas = onSnapshot(collection(db,"albergues",aid,"personas"), s=>{ listaPersonasCache=[]; camasOcupadas={}; s.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ if(p.cama) camasOcupadas[p.cama]=p.nombre; } }); const target = listaPersonasCache.find(p => p.id === pid); if(target) { window.safeHide('loading-overlay'); window.navegar('intervencion'); window.cargarInterfazIntervencion(target); } }); window.conectarListenersBackground(aid); } catch(e) { console.error(e); window.safeHide('loading-overlay'); } };
window.procesarLecturaPersona = function(pid) { const targetPerson = listaPersonasCache.find(p => p.id === pid); if(targetPerson) { window.cargarInterfazIntervencion(targetPerson); } else { getDoc(doc(db, "albergues", currentAlbergueId, "personas", pid)).then(docSnap => { if(docSnap.exists()) { const pData = { id: docSnap.id, ...docSnap.data() }; window.cargarInterfazIntervencion(pData); } else { alert("Persona no encontrada en este albergue."); } }); } };
window.cargarInterfazIntervencion = function(persona) { if(!persona) return; personaEnGestion = persona; window.safeHide('view-scan-ready'); window.safeHide('reader'); window.safeHide('btn-stop-camera'); window.safeShow('view-scan-result'); window.safeShow('btn-exit-focused'); window.el('interv-nombre').innerText = `${persona.nombre} ${persona.ap1 || ""}`; window.el('interv-doc').innerText = persona.docNum || "Sin Documento"; window.el('interv-estado').innerText = (persona.estado || "Desconocido").toUpperCase(); const presencia = persona.presencia || 'dentro'; const badgePresencia = window.el('interv-presencia'); badgePresencia.innerText = presencia.toUpperCase(); if(presencia === 'dentro') { badgePresencia.style.backgroundColor = '#dcfce7'; badgePresencia.style.color = '#166534'; } else { badgePresencia.style.backgroundColor = '#fee2e2'; badgePresencia.style.color = '#991b1b'; } if(currentAlbergueData) { const hName = window.el('interv-albergue-name'); if(hName) hName.innerText = currentAlbergueData.nombre || "ALBERGUE"; } };
window.resetIntervencion = function() {
    window.sysLog("Reseteando interfaz de intervención", "info");
    
    // Limpiar persona en gestión
    personaEnGestion = null;
    personaEnGestionEsGlobal = false;
    
    // Ocultar vista de resultado (datos de la persona)
    window.safeHide('view-scan-result');
    window.safeHide('btn-exit-focused');
    
    // Mostrar vista inicial de escaneo (SOLO dentro de screen-intervencion que ya está visible)
    window.safeShow('view-scan-ready');
    
    // Resetear UI del escáner
    resetScannerUI();
    
    window.sysLog("Interfaz de intervención reseteada - Botón visible", "success");
};
window.salirModoFocalizado = function() { document.body.classList.remove('focused-mode'); window.navegar('home'); window.history.pushState({}, document.title, window.location.pathname); };
window.iniciarModoFocalizado = async function(aid, pid) { window.sysLog(`Iniciando MODO FOCALIZADO. Alb: ${aid}, Pers: ${pid}`, "warn"); document.body.classList.add('focused-mode'); window.cambiarAlberguePorQR(aid, pid); };
window.registrarMovimiento = async function(tipo) { 
    if(!personaEnGestion || !currentAlbergueId) return; 
    
    try { 
        const estadoPresencia = (tipo === 'entrada') ? 'dentro' : 'fuera'; 
        
        // Actualizar campo de presencia en Firestore
        const pRef = doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id); 
        await updateDoc(pRef, { presencia: estadoPresencia }); 
        
        // CORREGIDO: Pasar personaEnGestionEsGlobal como 4to parámetro
        await window.registrarLog(
            personaEnGestion.id, 
            "Movimiento", 
            tipo.toUpperCase(), 
            personaEnGestionEsGlobal // ← AGREGADO: indica si es del pool global
        ); 
        
        window.sysLog(`Movimiento: ${tipo} para ${personaEnGestion.nombre}`, "info"); 
        window.showToast(`✅ ${tipo.toUpperCase()} Registrada`); 
        
        window.volverABusquedaIntervenciones();
        
    } catch(e) { 
        console.error(e); 
        window.sysLog("Error al registrar movimiento: " + e.message, "error");
        alert("Error al registrar movimiento: " + e.message); 
    } 
};
window.abrirModalDerivacion = function(tipo) { tipoDerivacionActual = tipo; window.el('derivacion-titulo').innerText = `Derivar a ${tipo}`; window.el('derivacion-motivo').value = ""; window.safeShow('modal-derivacion'); };
window.confirmarDerivacion = async function() { 
    const motivo = window.el('derivacion-motivo').value; 
    if(!motivo) return alert("Escribe un motivo."); 
    
    if(personaEnGestion) { 
        const logData = {
            fecha: new Date(),
            usuario: currentUserData.nombre,
            accion: `Derivación ${tipoDerivacionActual}`,
            detalle: motivo,
            estado: "pendiente"
        };
        
        const path = personaEnGestionEsGlobal 
            ? collection(db, "pool_prefiliacion", personaEnGestion.id, "historial")
            : collection(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id, "historial");
        
        await addDoc(path, logData);

        // ⭐ NUEVO: Crear también en colección plana para notificaciones eficientes
        if(!personaEnGestionEsGlobal && currentAlbergueId) {
            await addDoc(collection(db, "derivaciones"), {
                albergueId: currentAlbergueId,
                personaId: personaEnGestion.id,
                personaNombre: personaEnGestion.nombre,
                tipo: `Derivación ${tipoDerivacionActual}`,
                estado: "pendiente",
                motivo: motivo,
                usuario: currentUserData.nombre,
                fecha: new Date()
            });
            
            // Incrementar contador en el albergue
            const campoContador = tipoDerivacionActual === 'Sanitaria' ? 'derivacionesPendientes.sanitaria' :
                                  tipoDerivacionActual === 'Psicosocial' ? 'derivacionesPendientes.psicosocial' :
                                  'derivacionesPendientes.entregas';
            
            await updateDoc(doc(db, "albergues", currentAlbergueId), {
                [campoContador]: increment(1)
            });
        }
    } 
    
    window.sysLog(`Derivación a ${tipoDerivacionActual}: ${motivo}`, "warn"); 
    window.safeHide('modal-derivacion'); 
    window.showToast("✅ Derivación enviada"); 
    window.volverABusquedaIntervenciones();
};
window.verCarnetQR = function() { if(!personaEnGestion) return; window.safeShow('modal-carnet-qr'); const container = window.el('carnet-qrcode-display'); container.innerHTML = ""; const currentUrl = window.location.href.split('?')[0]; const deepLink = `${currentUrl}?action=scan&aid=${currentAlbergueId}&pid=${personaEnGestion.id}`; new QRCode(container, { text: deepLink, width: 250, height: 250 }); const nombreCompleto = `${personaEnGestion.nombre} ${personaEnGestion.ap1 || ""} ${personaEnGestion.ap2 || ""}`; window.el('carnet-nombre').innerText = nombreCompleto; window.el('carnet-id').innerText = personaEnGestion.docNum || "ID: " + personaEnGestion.id.substring(0,8).toUpperCase(); };

// --- BÚSQUEDA DE PERSONAS PARA INTERVENCIÓN (Desktop) ---
window.cargarPersonasParaIntervencion = async function() {
    var container = window.el('resultados-intervencion');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center; color:#999;">Cargando personas de todos los albergues...</p>';
    
    try {
        // Cargar TODAS las personas de TODOS los albergues
        var todasLasPersonas = [];
        
        // Obtener todos los albergues
        var alberguesSnapshot = await getDocs(collection(db, "albergues"));
        
        // Para cada albergue, cargar sus personas
        for (const albergueDoc of alberguesSnapshot.docs) {
            var albergueId = albergueDoc.id;
            var albergueNombre = albergueDoc.data().nombre || albergueId;
            
            // Cargar personas de este albergue
            var personasSnapshot = await getDocs(
                collection(db, "albergues", albergueId, "personas")
            );
            
            personasSnapshot.forEach(function(doc) {
                var p = doc.data();
                p.id = doc.id;
                p.albergueId = albergueId;
                p.albergueNombre = albergueNombre;
                todasLasPersonas.push(p);
            });
        }
        
        // Guardar en cache global para búsqueda
        window.personasGlobalesIntervencion = todasLasPersonas;
        
        // NO mostrar ninguna persona inicialmente, solo guardar en cache
        // El usuario debe escribir algo para ver resultados
        var container = window.el('resultados-intervencion');
        if (container) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:40px; font-size:1.1rem;"><i class="fa-solid fa-magnifying-glass" style="font-size:3rem; display:block; margin-bottom:15px; opacity:0.3;"></i>🔍 Escribe un nombre o DNI para buscar...</p>';
        }
        
        window.sysLog('Cargadas ' + todasLasPersonas.length + ' personas de todos los albergues', 'info');
        
    } catch(e) {
        console.error(e);
        window.sysLog('Error cargando personas: ' + e.message, 'error');
        container.innerHTML = '<p style="text-align:center; color:red;">Error al cargar personas.</p>';
    }
};

window.filtrarPersonasIntervencion = function() {
    var searchInput = window.el('search-intervencion-persona');
    if (!searchInput) return;
    
    var term = searchInput.value.toLowerCase().trim();
    
    // Si no hay búsqueda, mostrar mensaje vacío (NO todas las personas)
    if (term === '') {
        var container = window.el('resultados-intervencion');
        if (container) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:40px; font-size:1.1rem;"><i class="fa-solid fa-magnifying-glass" style="font-size:3rem; display:block; margin-bottom:15px; opacity:0.3;"></i>🔍 Escribe un nombre o DNI para buscar...</p>';
        }
        return;
    }
    
    var todasPersonas = window.personasGlobalesIntervencion || [];
    
    var filtradas = todasPersonas.filter(function(p) {
        // Concatenar nombre completo en un solo string
        var nombreCompleto = (p.nombre || '') + ' ' + 
                            (p.ap1 || '') + ' ' + 
                            (p.ap2 || '');
        nombreCompleto = nombreCompleto.toLowerCase();
        
        var docNum = (p.docNum || '').toLowerCase();
        
        // Buscar el término en el nombre completo O en el DNI
        return nombreCompleto.includes(term) || docNum.includes(term);
    });
    
    window.mostrarResultadosIntervencion(filtradas);
};

window.mostrarResultadosIntervencion = function(personas) {
    var container = window.el('resultados-intervencion');
    if (!container) return;
    
    if (personas.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">No se encontraron resultados.</p>';
        return;
    }
    
    var html = '<div class="user-list-grid">';
    
    personas.forEach(function(p) {
        var nombreCompleto = p.nombre + ' ' + (p.ap1 || '') + ' ' + (p.ap2 || '');
        var estadoBadge = p.estado === 'activo' 
            ? '<span class="badge badge-active">Activo</span>' 
            : '<span class="badge badge-inactive">Inactivo</span>';
        
        html += '<div class="user-card-item" onclick="window.seleccionarPersonaIntervencion(\'' + p.id + '\', \'' + p.albergueId + '\')" style="cursor:pointer;">';
        html += '<div><strong style="font-size:1.1rem;">' + nombreCompleto + '</strong></div>';
        
        // NUEVO: Mostrar albergue
        html += '<div style="color:#9333ea; font-size:0.85rem; margin-top:3px;">';
        html += '<i class="fa-solid fa-building"></i> ' + (p.albergueNombre || 'Albergue');
        html += '</div>';
        
        html += '<div style="color:#666; font-size:0.9rem; margin-top:5px;">';
        html += '<i class="fa-solid fa-id-card"></i> ' + (p.docNum || 'Sin documento');
        html += '</div>';
        html += '<div style="margin-top:8px;">' + estadoBadge + '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    container.innerHTML = html;
};

window.seleccionarPersonaIntervencion = function(personaId, albergueId) {
    var todasPersonas = window.personasGlobalesIntervencion || [];
    var persona = todasPersonas.find(function(p) { 
        return p.id === personaId && p.albergueId === albergueId; 
    });
    
    if (!persona) {
        alert('Persona no encontrada');
        return;
    }
    
    // Guardar la persona seleccionada como activa
    personaIntervencionActiva = persona;
    
    // Cambiar temporalmente el albergue actual para que las intervenciones se guarden correctamente
    var albergueAnterior = currentAlbergueId;
    currentAlbergueId = albergueId;
    
    // Guardar albergue anterior para restaurarlo después
    window.albergueAnteriorIntervenciones = albergueAnterior;
    
    // Ocultar pantalla de búsqueda
    window.safeHide('intervencion-search-screen');
    
    // Mostrar la pantalla de intervención y cargar interfaz
    window.safeShow('screen-intervencion');
    window.cargarInterfazIntervencion(persona);
    
    window.sysLog('Persona seleccionada para intervención: ' + persona.nombre + ' (Albergue: ' + persona.albergueNombre + ')', 'info');
};

window.volverABusquedaIntervenciones = function() {
    // Limpiar persona activa
    personaIntervencionActiva = null;
    
    // Restaurar albergue anterior si existía
    if (window.albergueAnteriorIntervenciones !== undefined) {
        currentAlbergueId = window.albergueAnteriorIntervenciones;
        window.albergueAnteriorIntervenciones = undefined;
    }
    
    // Detectar si estamos en modo QR (focused-mode) ANTES de ocultar nada
    var isQRMode = document.body.classList.contains('focused-mode');
    
    if (isQRMode) {
        // MODO QR (MÓVIL) - Volver a pantalla de escaneo
        window.sysLog('Modo QR: Volviendo a pantalla de escaneo', 'info');
        
        // NO ocultar screen-intervencion en modo QR
        // Solo resetear la interfaz dentro de ella
        window.resetIntervencion();
        
        // CRÍTICO: Asegurar que screen-intervencion esté visible en modo QR
        window.safeShow('screen-intervencion');
        
    } else {
        // MODO DESKTOP - Volver a búsqueda
        window.sysLog('Modo Desktop: Volviendo a búsqueda de intervenciones', 'info');
        
        // Ocultar pantalla de intervención (SOLO en modo desktop)
        window.safeHide('screen-intervencion');
        
        // Limpiar campo de búsqueda
        var searchInput = window.el('search-intervencion-persona');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Mostrar pantalla de búsqueda vacía
        window.safeShow('intervencion-search-screen');
        
        // Limpiar resultados
        var container = window.el('resultados-intervencion');
        if (container) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:40px; font-size:1.1rem;"><i class="fa-solid fa-magnifying-glass" style="font-size:3rem; display:block; margin-bottom:15px; opacity:0.3;"></i>🔍 Escribe un nombre o DNI para buscar...</p>';
        }
    }
};

window.actualizarInfoPersonaIntervencion = function() {
    if (!personaIntervencionActiva) return;
    
    // Actualizar información visible en cada módulo de intervención
    ['san', 'psi', 'ent'].forEach(function(tipo) {
        var nombreEl = window.el('nombre-persona-' + tipo);
        if (nombreEl) {
            nombreEl.textContent = personaIntervencionActiva.nombre + ' ' + 
                                   (personaIntervencionActiva.ap1 || '') + ' ' + 
                                   (personaIntervencionActiva.ap2 || '');
        }
    });
};

// --- LOGICA DE NEGOCIO ---
window.cargarDatosYEntrar = async function(id) {
    currentAlbergueId = id; window.sysLog(`Entrando en Albergue: ${id}`, "info"); window.safeShow('loading-overlay');
    try {
 const dS = await getDoc(doc(db,"albergues",id));
if(dS.exists()) { 
    currentAlbergueData = dS.data(); 
    totalCapacidad = parseInt(currentAlbergueData.capacidad||0); 
    
    // Inicializar contadores de derivaciones si no existen
    if(!currentAlbergueData.derivacionesPendientes) {
        await updateDoc(doc(db, "albergues", id), {
            derivacionesPendientes: {
                sanitaria: 0,
                psicosocial: 0,
                entregas: 0
            }
        });
        window.sysLog("✅ Contadores de derivaciones inicializados", "info");
    }
}
        if(unsubscribePersonas) unsubscribePersonas();
        unsubscribePersonas = onSnapshot(collection(db,"albergues",id,"personas"), s=>{
            listaPersonasCache=[]; camasOcupadas={}; let c=0;
            s.forEach(d=>{ const p=d.data(); p.id=d.id; listaPersonasCache.push(p); if(p.estado==='ingresado'){ c++; if(p.cama) camasOcupadas[p.cama]=p.nombre; } });
            ocupacionActual=c; window.actualizarContadores();
            if(personaEnGestion && !personaEnGestionEsGlobal && document.getElementById('view-scan-result').classList.contains('hidden') === false) { 
                 const u=listaPersonasCache.find(x=>x.id===personaEnGestion.id); 
                 if(u) window.cargarInterfazIntervencion(u);
            }
            if(personaEnGestion && !personaEnGestionEsGlobal && document.getElementById('panel-gestion-persona').classList.contains('hidden') === false) {
                 const u=listaPersonasCache.find(x=>x.id===personaEnGestion.id);
                 if(u && u.id === personaEnGestion.id) { personaEnGestion = u; }
            }
        });
if(unsubscribePool) unsubscribePool();
unsubscribePool = onSnapshot(
    query(collection(db, "pool_prefiliacion"), where("origenAlbergueId", "==", currentAlbergueId)), 
    s => { 
        listaGlobalPrefiliacion = []; 
        s.forEach(d => { 
            const p = d.data(); 
            p.id = d.id; 
            listaGlobalPrefiliacion.push(p); 
        }); 
        window.sysLog(`Pre-Filiación: ${listaGlobalPrefiliacion.length} registros`, "info"); 
    }
);
window.navegar('operativa');
if(window.el('app-title')) window.el('app-title').innerText = currentAlbergueData.nombre;
        window.configurarDashboard(); window.actualizarContadores(); window.safeHide('loading-overlay'); window.conectarListenersBackground(id); window.setupAutoSave();
    } catch(e) { window.sysLog(`Error Cargando: ${e.message}`, "error"); alert(e.message); window.safeHide('loading-overlay'); }
};
window.conectarListenersBackground = function(id) { if(unsubscribeAlbergueDoc) unsubscribeAlbergueDoc(); unsubscribeAlbergueDoc = onSnapshot(doc(db,"albergues",id), d=>{ if(d.exists()){ currentAlbergueData=d.data(); totalCapacidad=parseInt(currentAlbergueData.capacidad||0); window.actualizarContadores(); } }); };

window.setupAutoSave = function() {
    const inputsFil = ['edit-nombre','edit-ap1','edit-ap2','edit-doc-num','edit-tel','edit-fecha'];
    inputsFil.forEach(id => { const el = window.el(id); if(el && !el.dataset.hasAutosave) { el.addEventListener('blur', () => window.guardarCambiosPersona(true)); el.dataset.hasAutosave = "true"; if(id === 'edit-fecha') el.oninput = function() { window.formatearFecha(this); }; } });
    const inputsPref = ['man-nombre','man-ap1','man-ap2','man-doc-num','man-tel','man-fecha'];
    inputsPref.forEach(id => { const el = window.el(id); if(el && !el.dataset.hasAutosave) { el.addEventListener('blur', () => { if(prefiliacionEdicionId) window.adminPrefiliarManual(true); }); el.dataset.hasAutosave = "true"; if(id === 'man-fecha') el.oninput = function() { window.formatearFecha(this); }; } });
};
window.adminPrefiliarManual = async function(silent = false) {
    if (silent && !prefiliacionEdicionId) return;
    
    if (prefiliacionEdicionId && isGlobalEdit) {
        const p = window.getDatosFormulario('man');
        
        // Validar documento al editar
        if (!validarDocumento(p.tipoDoc, p.docNum)) {
            return;
        }
        
        // Validar edad si es NODNI
        if (!validarEdadNODNI(p.tipoDoc, p.fechaNac)) {
            return;
        }
        
        await updateDoc(doc(db, "pool_prefiliacion", prefiliacionEdicionId), p);
        window.registrarLog(prefiliacionEdicionId, "Edición Pre-Filiación", "Manual", true);
        if (!silent) {
            window.showToast("Pool Actualizado");
            window.cancelarEdicionPref();
        }
        return;
    }
    
    const n = window.safeVal('man-nombre');
    if (!n) return alert("Falta nombre");
    
    const fid = new Date().getTime().toString();
    const t = window.getDatosFormulario('man');
    
    // Validar documento del titular
    if (!validarDocumento(t.tipoDoc, t.docNum)) {
        return;
    }
    
    // Validar edad si es NODNI
    if (!validarEdadNODNI(t.tipoDoc, t.fechaNac)) {
        return;
    }
    
    t.estado = 'espera';
    t.familiaId = fid;
    t.rolFamilia = 'TITULAR';
    t.fechaRegistro = new Date();
    t.origenAlbergueId = currentAlbergueId;
    
    const ref = await addDoc(collection(db, "pool_prefiliacion"), t);
    window.registrarLog(ref.id, "Alta Staff", "Titular", true);
    
    for (const f of adminFamiliaresTemp) {
        const refF = await addDoc(collection(db, "pool_prefiliacion"), {
            ...f,
            estado: 'espera',
            familiaId: fid,
            rolFamilia: 'MIEMBRO',
            fechaRegistro: new Date(),
            origenAlbergueId: currentAlbergueId
        });
        window.registrarLog(refF.id, "Alta Staff", "Familiar", true);
    }
    
    if (!silent) {
        alert("Guardado en Pool Global");
        window.limpiarFormulario('man');
        
        // Limpiar campos adicionales
        const intolEl = document.getElementById('man-tiene-intolerancia');
        if (intolEl) intolEl.value = 'no';
        const detContainer = document.getElementById('man-intolerancia-detalle-container');
        if (detContainer) detContainer.classList.add('hidden');
        const detInput = document.getElementById('man-intolerancia-detalle');
        if (detInput) detInput.value = '';
        const noLocEl = document.getElementById('man-no-localizacion');
        if (noLocEl) noLocEl.checked = false;
        
        adminFamiliaresTemp = [];
        if (window.el('admin-lista-familiares-ui')) window.el('admin-lista-familiares-ui').innerHTML = "Ninguno.";
    }
};

window.cancelarEdicionPref = function() {
    prefiliacionEdicionId = null;
    window.limpiarFormulario('man');
    
    // Limpiar campos adicionales
    const intolEl = document.getElementById('man-tiene-intolerancia');
    if (intolEl) intolEl.value = 'no';
    const detContainer = document.getElementById('man-intolerancia-detalle-container');
    if (detContainer) detContainer.classList.add('hidden');
    const detInput = document.getElementById('man-intolerancia-detalle');
    if (detInput) detInput.value = '';
    const noLocEl = document.getElementById('man-no-localizacion');
    if (noLocEl) noLocEl.checked = false;
    
    if (window.el('existing-family-list-ui')) window.el('existing-family-list-ui').innerHTML = "";
    window.safeHide('btn-cancelar-edicion-pref');
    window.safeHide('btn-ingresar-pref');
};
window.buscarEnPrefiliacion=function(){const t=window.safeVal('buscador-pref').toLowerCase().trim();const r=window.el('resultados-pref');if(t.length<2){window.safeHide('resultados-pref');return;}const hits=listaGlobalPrefiliacion.filter(p=>{const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();return full.includes(t)||(p.docNum||"").toLowerCase().includes(t)||(p.telefono||"").includes(t);});r.innerHTML="";if(hits.length===0)r.innerHTML="<div class='search-item'>Sin resultados en Pre-Filiación Global</div>";hits.forEach(p=>{r.innerHTML+=`<div class="search-item" onclick="window.cargarParaEdicionPref('${p.id}')"><strong>${p.nombre} ${p.ap1||''} ${p.ap2||''}</strong><br><small>📋 PRE-FILIACIÓN | ${p.docNum||'-'} | ${p.telefono||'-'}</small></div>`;});window.safeShow('resultados-pref');};
window.cargarParaEdicionPref = function(pid) {
    const p = listaGlobalPrefiliacion.find(x => x.id === pid);
    if (!p) return;
    
    prefiliacionEdicionId = p.id;
    isGlobalEdit = true;
    
    window.safeHide('resultados-pref');
    window.el('buscador-pref').value = "";
    
    // Campos básicos
    window.setVal('man-nombre', p.nombre);
    window.setVal('man-ap1', p.ap1);
    window.setVal('man-ap2', p.ap2);
    window.setVal('man-tipo-doc', p.tipoDoc);
    window.setVal('man-doc-num', p.docNum);
    window.setVal('man-fecha', p.fechaNac);
    window.setVal('man-tel', p.telefono);
    
    // NUEVOS CAMPOS
    const intolSelect = document.getElementById('man-tiene-intolerancia');
    if (intolSelect) {
        intolSelect.value = p.tieneIntolerancia ? 'si' : 'no';
        // Trigger change para mostrar/ocultar el textarea
        intolSelect.dispatchEvent(new Event('change'));
    }
    
    const intolDetalle = document.getElementById('man-intolerancia-detalle');
    if (intolDetalle && p.tieneIntolerancia) {
        intolDetalle.value = p.intoleranciaDetalle || '';
    }
    
    const noLocCheckbox = document.getElementById('man-no-localizacion');
    if (noLocCheckbox) {
        noLocCheckbox.checked = p.noLocalizacion || false;
    }
    
    // Lista de familiares
    const l = window.el('existing-family-list-ui');
    l.innerHTML = "";
    
    if (p.familiaId) {
        const fs = listaGlobalPrefiliacion.filter(x => x.familiaId === p.familiaId && x.id !== p.id);
        if (fs.length > 0) {
            l.innerHTML = "<h5>Familiares en Pre-Filiación:</h5>";
            fs.forEach(f => {
                l.innerHTML += `<div class="fam-item"><strong>${f.nombre} ${f.ap1 || ''}</strong> - ${f.tipoDoc}: ${f.docNum}</div>`;
            });
        }
    }
    
    window.safeShow('btn-cancelar-edicion-pref');
    window.safeShow('btn-ingresar-pref');
};
window.darSalidaPersona=async function(){if(!personaEnGestion||personaEnGestionEsGlobal)return;if(!confirm(`¿Dar salida a ${personaEnGestion.nombre}? Saldrá individualmente a Pre-Filiación Global.`))return;try{const batch=writeBatch(db);const poolRef=doc(collection(db,"pool_prefiliacion"));const memberData={...personaEnGestion};delete memberData.id;memberData.cama=null;memberData.estado='espera';memberData.fechaSalidaAlbergue=new Date();memberData.ultimoAlbergueId=currentAlbergueId;batch.set(poolRef,memberData);batch.delete(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id));const logRef=collection(db,"pool_prefiliacion",poolRef.id,"historial");batch.set(doc(logRef),{fecha:new Date(),usuario:currentUserData.nombre,accion:"Salida Albergue",detalle:`Salida Individual de ${currentAlbergueData.nombre}`});await batch.commit();window.sysLog(`Salida individual realizada.`,"nav");window.showToast("Salida completada.");window.safeHide('panel-gestion-persona');window.safeHide('resultados-busqueda');window.el('buscador-persona').value="";}catch(e){window.sysLog("Error salida: "+e.message,"error");alert("Error: "+e.message);}};
window.buscarPersonaEnAlbergue=function(){const txt=window.safeVal('buscador-persona').toLowerCase().trim();const res=window.el('resultados-busqueda');if(txt.length<2){window.safeHide('resultados-busqueda');return;}const localHits=listaPersonasCache.filter(p=>{const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();return full.includes(txt)||(p.docNum||"").toLowerCase().includes(txt);});const globalHits=listaGlobalPrefiliacion.filter(p=>{const full=`${p.nombre} ${p.ap1||''} ${p.ap2||''}`.toLowerCase();return full.includes(txt)||(p.docNum||"").toLowerCase().includes(txt);});res.innerHTML="";if(localHits.length===0&&globalHits.length===0){res.innerHTML=`<div class="search-item" style="color:#666">No encontrado</div>`;}else{localHits.forEach(p=>{const dc=p.estado==='ingresado'?'dot-green':'dot-red';res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}', false)"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong> (Local)<div style="font-size:0.8rem;color:#666;">📄 ${p.docNum||'-'}</div></div><div class="status-dot ${dc}" title="${p.estado.toUpperCase()}"></div></div></div>`;});globalHits.forEach(p=>{res.innerHTML+=`<div class="search-item" onclick="window.seleccionarPersona('${p.id}', true)"><div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div><strong>${p.nombre} ${p.ap1||''}</strong> (Pre-Filiación)<div style="font-size:0.8rem;color:#666;">📋 ${p.docNum||'-'}</div></div><div class="status-dot dot-cloud" title="EN PRE-FILIACIÓN"></div></div></div>`;});}window.safeShow('resultados-busqueda');};
window.seleccionarPersona=function(pid,isGlobal){if(typeof pid!=='string')pid=pid.id;let p;if(isGlobal){p=listaGlobalPrefiliacion.find(x=>x.id===pid);personaEnGestionEsGlobal=true;window.safeShow('banner-prefiliacion');window.safeHide('btns-local-actions');window.safeShow('btns-cloud-actions');}else{p=listaPersonasCache.find(x=>x.id===pid);personaEnGestionEsGlobal=false;window.safeHide('banner-prefiliacion');window.safeShow('btns-local-actions');window.safeHide('btns-cloud-actions');}if(!p)return;personaEnGestion=p;prefiliacionEdicionId=p.id;isGlobalEdit=isGlobal;window.safeHide('resultados-busqueda');window.safeShow('panel-gestion-persona');if(window.el('gestion-nombre-titulo'))window.el('gestion-nombre-titulo').innerText=p.nombre;if(window.el('gestion-estado'))window.el('gestion-estado').innerText=isGlobal?"EN PRE-FILIACIÓN":p.estado.toUpperCase();if(window.el('gestion-cama-info'))window.el('gestion-cama-info').innerText=(p.cama&&!isGlobal)?`Cama: ${p.cama}`:"";window.setVal('edit-nombre',p.nombre);window.setVal('edit-ap1',p.ap1);window.setVal('edit-ap2',p.ap2);window.setVal('edit-tipo-doc',p.tipoDoc);window.setVal('edit-doc-num',p.docNum);window.setVal('edit-fecha',p.fechaNac);window.setVal('edit-tel',p.telefono);const intolSelectEdit=document.getElementById('edit-tiene-intolerancia');if(intolSelectEdit){intolSelectEdit.value=p.tieneIntolerancia?'si':'no';intolSelectEdit.dispatchEvent(new Event('change'));}const intolDetalleEdit=document.getElementById('edit-intolerancia-detalle');if(intolDetalleEdit&&p.tieneIntolerancia){intolDetalleEdit.value=p.intoleranciaDetalle||'';}const noLocCheckboxEdit=document.getElementById('edit-no-localizacion');if(noLocCheckboxEdit){noLocCheckboxEdit.checked=p.noLocalizacion||false;}const flist=window.el('info-familia-lista');flist.innerHTML="";let fam=[];if(isGlobal){fam=listaGlobalPrefiliacion.filter(x=>x.familiaId===p.familiaId);}else{fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);}if(window.el('info-familia-resumen'))window.el('info-familia-resumen').innerText=fam.length>1?`Familia (${fam.length})`:"Individual";fam.forEach(f=>{if(f.id!==p.id){const hasBed=f.estado==='ingresado'&&f.cama;const st=hasBed?'color:var(--success);':'color:var(--warning);';const ic=hasBed?'fa-solid fa-bed':'fa-solid fa-clock';flist.innerHTML+=`<div style="padding:10px;border-border:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.seleccionarPersona('${f.id}', ${isGlobal})"><div><div style="font-weight:bold;font-size:0.95rem;">${f.nombre} ${f.ap1||''}</div><div style="font-size:0.85rem;color:#666;"><i class="fa-regular fa-id-card"></i> ${f.docNum||'-'}</div></div><div style="font-size:1.2rem;${st}"><i class="${ic}"></i></div></div>`;}});if(!isGlobal)window.setupAutoSave();};
window.guardarCambiosPersona = async function(silent = false) {
    if (!personaEnGestion) return;
    
    const p = window.getDatosFormulario('edit');
    
    // Solo validar si NO es guardado automático
    if (!silent) {
        // Validar documento
        if (!validarDocumento(p.tipoDoc, p.docNum)) {
            return;
        }
        
        // Validar edad si es NODNI
        if (!validarEdadNODNI(p.tipoDoc, p.fechaNac)) {
            return;
        }
    }
    
    await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id), p);
    window.registrarLog(personaEnGestion.id, "Edición Datos", "Manual");
    
    if (!silent) alert("Guardado");
    else window.showToast("Guardado automático");
    
    window.sysLog(`Actualizada persona local: ${personaEnGestion.nombre}`, "info");
};
window.abrirMapaGeneral=function(){modoMapaGeneral=true;window.mostrarGridCamas();};
window.abrirSeleccionCama=function(){modoMapaGeneral=false;window.mostrarGridCamas();};
window.cerrarMapaCamas=function(){highlightedFamilyId=null;window.safeHide('modal-cama');};
window.mostrarGridCamas=function(){const g=window.el('grid-camas');g.innerHTML="";const cols=(currentAlbergueData&&currentAlbergueData.columnas)?currentAlbergueData.columnas:8;g.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;let shadowMap={};let famGroups={};listaPersonasCache.forEach(p=>{if(p.familiaId){if(!famGroups[p.familiaId])famGroups[p.familiaId]={members:[],beds:[]};famGroups[p.familiaId].members.push(p);if(p.cama)famGroups[p.familiaId].beds.push(parseInt(p.cama));}});Object.values(famGroups).forEach(fam=>{let assigned=fam.beds.length;let total=fam.members.length;let needed=total-assigned;if(assigned>0&&needed>0){let startBed=Math.max(...fam.beds);let placed=0;let check=startBed+1;while(placed<needed&&check<=totalCapacidad){if(!camasOcupadas[check.toString()]){shadowMap[check.toString()]=fam.members[0].familiaId;placed++;}check++;}}});for(let i=1;i<=totalCapacidad;i++){const n=i.toString();const occName=camasOcupadas[n];const occ=listaPersonasCache.find(p=>p.cama===n);let cls="bed-box";let lbl=n;if(occ&&highlightedFamilyId&&occ.familiaId===highlightedFamilyId){cls+=" bed-family-highlight";}if(!window.modoMapaGeneral&&window.personaEnGestion&&window.personaEnGestion.cama===n){cls+=" bed-current";lbl+=" (Tú)";}else if(occName){cls+=" bed-busy";if(occ){const f=`${occ.nombre} ${occ.ap1||''}`;lbl+=`<div style="font-size:0.6rem;font-weight:normal;margin-top:2px;">${f}<br><i class="fa-solid fa-phone"></i> ${occ.telefono||'-'}</div>`;const presencia = occ.presencia || 'dentro';if(presencia === 'dentro') cls += " bed-status-in";else cls += " bed-status-out";}}else{cls+=" bed-free";if(shadowMap[n]){cls+=" bed-shadow";}}const d=document.createElement('div');d.className=cls;d.innerHTML=lbl;d.onclick=()=>{if(occ){if(highlightedFamilyId===occ.familiaId)highlightedFamilyId=null;else highlightedFamilyId=occ.familiaId;window.mostrarGridCamas();}else if(!window.modoMapaGeneral){window.guardarCama(n);}};d.ondblclick=()=>{if(occ)window.abrirModalInfoCama(occ);};g.appendChild(d);}window.safeShow('modal-cama');};
window.abrirModalInfoCama=function(p){window.el('info-cama-num').innerText=p.cama;window.el('info-nombre-completo').innerText=p.nombre;window.el('info-telefono').innerText=p.telefono||"No consta";const bh=window.el('btn-historial-cama');if(['admin','super_admin'].includes(currentUserData.rol)){window.safeShow('btn-historial-cama');bh.onclick=()=>window.verHistorial(p.id);}else{window.safeHide('btn-historial-cama');}const c=window.el('info-familia-detalle');const fam=listaPersonasCache.filter(x=>x.familiaId===p.familiaId);let h=`<table class="fam-table"><thead><tr><th>Nombre</th><th>DNI/Tel</th><th>Cama</th></tr></thead><tbody>`;fam.forEach(f=>{const isCurrent=f.id===p.id?'fam-row-current':'';h+=`<tr class="${isCurrent}"><td>${f.nombre} ${f.ap1||''}</td><td><small>${f.docNum||'-'}<br>${f.telefono||'-'}</small></td><td><strong>${f.cama||'-'}</strong></td></tr>`;});h+=`</tbody></table>`;c.innerHTML=h;window.safeShow('modal-bed-info');};
window.liberarCamaMantener=async function(){if(!personaEnGestion)return;if(!confirm(`¿Liberar cama de ${personaEnGestion.nombre}?`))return;try{await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{cama:null});window.registrarLog(personaEnGestion.id,"Liberar Cama","Se mantiene en albergue");window.sysLog("Cama liberada.","success");if(!modoMapaGeneral)window.cerrarMapaCamas();}catch(e){window.sysLog("Error liberando cama: "+e.message,"error");}};
window.abrirModalFamiliar=function(){window.limpiarFormulario('fam');window.safeShow('modal-add-familiar');if(window.el('fam-tipo-doc'))window.el('fam-tipo-doc').value="MENOR";window.verificarMenor('fam');};
window.cerrarModalFamiliar=function(){window.safeHide('modal-add-familiar');};
window.guardarFamiliarEnLista = function() {
    const d = window.getDatosFormulario('fam');
    
    // Validar documento
    if (!validarDocumento(d.tipoDoc, d.docNum)) {
        return;
    }
    
    // Validar edad si es NODNI
    if (!validarEdadNODNI(d.tipoDoc, d.fechaNac)) {
        return;
    }
    
    if (!d.nombre) return alert("Nombre obligatorio");
    
    listaFamiliaresTemp.push(d);
    window.actualizarListaFamiliaresPublicaUI();
    window.cerrarModalFamiliar();
    
    // Limpiar campos adicionales
    const intolEl = document.getElementById('fam-tiene-intolerancia');
    if (intolEl) intolEl.value = 'no';
    const detContainer = document.getElementById('fam-intolerancia-detalle-container');
    if (detContainer) detContainer.classList.add('hidden');
    const detInput = document.getElementById('fam-intolerancia-detalle');
    if (detInput) detInput.value = '';
    const noLocEl = document.getElementById('fam-no-localizacion');
    if (noLocEl) noLocEl.checked = false;
};
window.actualizarListaFamiliaresUI=function(){const d=window.el('lista-familiares-ui');if(!d)return;d.innerHTML="";if(listaFamiliaresTemp.length===0){d.innerHTML='<p style="color:#999;font-style:italic;">Ninguno añadido.</p>';return;}listaFamiliaresTemp.forEach((f,i)=>{d.innerHTML+=`<div class="fam-item"><div><strong>${f.nombre}</strong></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarTemp(${i})">X</button></div>`;});};
window.actualizarListaFamiliaresPublicaUI = function() {
    const d = window.el('public-lista-familiares');
    if (!d) return;
    
    d.innerHTML = "";
    
    if (listaFamiliaresTemp.length === 0) {
        d.innerHTML = '<p style="color:#999;font-style:italic;">Ninguno añadido aún.</p>';
        return;
    }
    
    listaFamiliaresTemp.forEach((f, i) => {
        const nombreCompleto = `${f.nombre} ${f.ap1 || ''} ${f.ap2 || ''}`.trim();
        d.innerHTML += `
            <div class="fam-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8f9fa; margin-bottom:8px; border-radius:8px;">
                <div>
                    <strong style="color:#111;">${nombreCompleto}</strong><br>
                    <small style="color:#666;">${f.tipoDoc}: ${f.docNum || 'Sin documento'}</small>
                </div>
                <button class="danger" style="margin:0; padding:6px 12px; width:auto;" onclick="window.borrarFamiliarPublico(${i})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    });
};

window.borrarFamiliarPublico = function(i) {
    listaFamiliaresTemp.splice(i, 1);
    window.actualizarListaFamiliaresPublicaUI();
};
window.borrarFamiliarTemp=function(i){listaFamiliaresTemp.splice(i,1);window.actualizarListaFamiliaresUI();};
window.abrirModalFamiliarAdmin=function(){window.limpiarFormulario('adm-fam');window.safeShow('modal-admin-add-familiar');if(window.el('adm-fam-tipo-doc'))window.el('adm-fam-tipo-doc').value="MENOR";window.verificarMenor('adm-fam');};
window.cerrarModalFamiliarAdmin=function(){window.safeHide('modal-admin-add-familiar');};
window.guardarFamiliarAdmin = function() {
    const d = window.getDatosFormulario('adm-fam');
    
    // Validar documento
    if (!validarDocumento(d.tipoDoc, d.docNum)) {
        return;
    }
    
    // Validar edad si es NODNI
    if (!validarEdadNODNI(d.tipoDoc, d.fechaNac)) {
        return;
    }
    
    if (!d.nombre) return alert("Nombre obligatorio");
    
    adminFamiliaresTemp.push(d);
    window.actualizarListaFamiliaresAdminUI();
    window.cerrarModalFamiliarAdmin();
    
    // Limpiar campos adicionales
    const intolEl = document.getElementById('adm-fam-tiene-intolerancia');
    if (intolEl) intolEl.value = 'no';
    const detContainer = document.getElementById('adm-fam-intolerancia-detalle-container');
    if (detContainer) detContainer.classList.add('hidden');
    const detInput = document.getElementById('adm-fam-intolerancia-detalle');
    if (detInput) detInput.value = '';
    const noLocEl = document.getElementById('adm-fam-no-localizacion');
    if (noLocEl) noLocEl.checked = false;
};
window.actualizarListaFamiliaresAdminUI=function(){const d=window.el('admin-lista-familiares-ui');if(!d)return;d.innerHTML="";if(adminFamiliaresTemp.length===0){d.innerHTML='<p style="color:#999;font-style:italic;">Ninguno.</p>';return;}adminFamiliaresTemp.forEach((f,i)=>{d.innerHTML+=`<div class="fam-item"><div><strong>${f.nombre} ${f.ap1}</strong> <small>(${f.docNum})</small></div><button class="danger" style="margin:0;padding:2px 8px;width:auto;" onclick="window.borrarFamiliarAdminTemp(${i})">X</button></div>`;});};
window.borrarFamiliarAdminTemp=function(i){adminFamiliaresTemp.splice(i,1);window.actualizarListaFamiliaresAdminUI();};
window.abrirModalVincularFamilia=function(){if(!personaEnGestion)return;if(window.el('search-vincular'))window.el('search-vincular').value="";if(window.el('resultados-vincular'))window.el('resultados-vincular').innerHTML="";window.safeShow('modal-vincular-familia');};
window.buscarParaVincular=function(){const t=window.safeVal('search-vincular').toLowerCase().trim();const r=window.el('resultados-vincular');r.innerHTML="";if(t.length<2){window.safeAddActive('hidden');return;}const hits=listaPersonasCache.filter(p=>{if(p.id===personaEnGestion.id)return false;return(p.nombre+" "+(p.ap1||"")).toLowerCase().includes(t);});if(hits.length===0){r.innerHTML="<div class='search-item'>Sin resultados</div>";}else{hits.forEach(p=>{const d=document.createElement('div');d.className='search-item';d.innerHTML=`<strong>${p.nombre}</strong>`;d.onclick=()=>window.vincularAFamilia(p);r.appendChild(d);});}r.classList.remove('hidden');};
window.vincularAFamilia=async function(target){if(!confirm(`¿Unir a ${personaEnGestion.nombre}?`))return;try{let tid=target.familiaId;if(!tid){tid=new Date().getTime().toString()+"-F";await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",target.id),{familiaId:tid,rolFamilia:'TITULAR'});}await updateDoc(doc(db,"albergues",currentAlbergueId,"personas",personaEnGestion.id),{familiaId:tid,rolFamilia:'MIEMBRO'});window.sysLog(`Vinculación familiar exitosa`, "success");alert("Vinculado");window.safeHide('modal-vincular-familia');window.seleccionarPersona(personaEnGestion, false);}catch(e){window.sysLog("Error vinculando: "+e.message, "error");}};
window.abrirModalAlbergue=async function(id=null){albergueEdicionId=id;window.safeShow('modal-albergue');const b=window.el('btn-delete-albergue');if(id){const s=await getDoc(doc(db,"albergues",id));const d=s.data();window.setVal('mto-nombre',d.nombre);window.setVal('mto-capacidad',d.capacidad);window.setVal('mto-columnas',d.columnas);const r=(currentUserData.rol||"").toLowerCase().trim();if(r==='super_admin')window.safeShow('btn-delete-albergue');else window.safeHide('btn-delete-albergue');}else{window.setVal('mto-nombre',"");window.setVal('mto-capacidad',"");window.safeHide('btn-delete-albergue');}};
window.guardarAlbergue=async function(){const n=window.safeVal('mto-nombre'),c=window.safeVal('mto-capacidad'),col=window.safeVal('mto-columnas');if(!n||!c)return alert("Datos inc.");if(albergueEdicionId)await updateDoc(doc(db,"albergues",albergueEdicionId),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col)});else await addDoc(collection(db,"albergues"),{nombre:n,capacidad:parseInt(c),columnas:parseInt(col),activo:true});window.safeHide('modal-albergue');window.sysLog("Albergue guardado.", "success");};
window.eliminarAlbergueActual=async function(){if(albergueEdicionId&&confirm("¿Borrar todo?")){const ps=await getDocs(collection(db,"albergues",albergueEdicionId,"personas"));const b=writeBatch(db);ps.forEach(d=>b.delete(d.ref));await b.commit();await deleteDoc(doc(db,"albergues",albergueEdicionId));alert("Borrado");window.safeHide('modal-albergue');window.sysLog("Albergue eliminado.", "warn");}};
window.cambiarEstadoAlbergue=async function(id,st){await updateDoc(doc(db,"albergues",id),{activo:st});window.sysLog(`Estado Albergue ${id}: ${st}`, "info");};
window.abrirModalCambioPass=function(){window.setVal('chg-old-pass','');window.setVal('chg-new-pass','');window.setVal('chg-confirm-pass','');window.safeShow('modal-change-pass');};
window.ejecutarCambioPass=async function(){const o=window.safeVal('chg-old-pass'),n=window.safeVal('chg-new-pass');try{await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,o));await updatePassword(auth.currentUser,n);alert("OK");window.safeHide('modal-change-pass');window.sysLog("Contraseña cambiada.", "success");}catch(e){alert("Error");window.sysLog("Error cambio pass: "+e.message, "error");}};
window.registrarLog = async function(pid, act, det, isPool=false) {
    try {
        const usuarioLog = currentUserData ? currentUserData.nombre : "Auto-QR";
        
        let path;
        if (isPool) {
            path = collection(db, "pool_prefiliacion", pid, "historial");
            window.sysLog(`Guardando log en PRE-FILIACIÓN GLOBAL: ${act} - ${det}`, "info");
        } else {
            if (!currentAlbergueId) {
                window.sysLog("ERROR: No hay albergue seleccionado para guardar log", "error");
                throw new Error("No hay albergue seleccionado");
            }
            path = collection(db, "albergues", currentAlbergueId, "personas", pid, "historial");
            window.sysLog(`Guardando log en ALBERGUE (${currentAlbergueId}): ${act} - ${det}`, "info");
        }
        
        await addDoc(path, {
            fecha: new Date(),
            usuario: usuarioLog,
            accion: act,
            detalle: det
        });
        
        window.sysLog(`✅ Log guardado correctamente: ${act}`, "success");
        
    } catch(e) {
        console.error("Error en registrarLog:", e);
        window.sysLog(`❌ ERROR guardando log: ${e.message}`, "error");
        throw e; // Re-lanzar para que la función llamadora sepa que falló
    }
};
window.verHistorial=async function(pId=null, forceIsGlobal=null, forceAlbId=null){let targetId=pId;let isPool=(forceIsGlobal!==null)?forceIsGlobal:personaEnGestionEsGlobal;const activeAlbId=forceAlbId||currentAlbergueId;if(!targetId&&personaEnGestion)targetId=personaEnGestion.id;if(pId&&forceIsGlobal===null&&listaPersonasCache.find(x=>x.id===pId))isPool=false;if(!targetId)return;let nombrePersona="Usuario";if(personaEnGestion&&personaEnGestion.id===targetId)nombrePersona=`${personaEnGestion.nombre} ${personaEnGestion.ap1||''}`;else if(listaPersonasCache.length>0){const found=listaPersonasCache.find(x=>x.id===targetId);if(found)nombrePersona=`${found.nombre} ${found.ap1||''}`;}else if(listaGlobalPrefiliacion.length>0){const found=listaGlobalPrefiliacion.find(x=>x.id===targetId);if(found)nombrePersona=`${found.nombre} ${found.ap1||''}`;}const headerEl=window.el('hist-modal-header');if(headerEl)headerEl.innerText=`Historial de: ${nombrePersona}`;window.safeShow('modal-historial');const content=window.el('historial-content');content.innerHTML='<div style="text-align:center"><div class="spinner"></div></div>';try{let items=[];let pathHist=isPool?collection(db,"pool_prefiliacion",targetId,"historial"):collection(db,"albergues",activeAlbId,"personas",targetId,"historial");const snapHist=await getDocs(pathHist);snapHist.forEach(d=>{const data=d.data();items.push({...data,type:'movimiento',id:d.id,sortDate:data.fecha.toDate()});});items.sort((a,b)=>b.sortDate-a.sortDate);if(items.length===0){content.innerHTML="<p>No hay registros.</p>";return;}let html=`<div class="hist-timeline">`;items.forEach(d=>{const f=d.sortDate;const fmt=`${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()} ${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;let extraClass='';let icon='<i class="fa-solid fa-shoe-prints"></i>';if(d.accion&&d.accion.includes('Intervención')){if(d.accion.includes('Sanitaria')){extraClass='hist-type-san';icon='<i class="fa-solid fa-hand-holding-medical"></i>';}else if(d.accion.includes('Psicosocial')){extraClass='hist-type-psi';icon='<i class="fa-solid fa-hand-holding-medical"></i>';}else if(d.accion.includes('Entrega')){extraClass='hist-type-ent';icon='<i class="fa-solid fa-hand-holding-medical"></i>';}else{icon='<i class="fa-solid fa-hand-holding-medical"></i>';}}html+=`<div class="hist-item ${extraClass}"><div class="hist-header"><span class="hist-date"><i class="fa-regular fa-clock"></i> ${fmt}</span><span class="hist-user"><i class="fa-solid fa-user-tag"></i> ${d.usuario}</span></div><span class="hist-action">${icon} ${d.accion}</span>${d.detalle?`<span class="hist-detail" style="white-space: pre-wrap;">${d.detalle}</span>`:''}</div>`;});html+=`</div>`;content.innerHTML=html;}catch(e){content.innerHTML="Error cargando datos.";window.sysLog("Error historial mixto: "+e.message,"error");}};
window.verHistorialObservatorio = function(pId, isGlobal, albId){window.verHistorial(pId, isGlobal, albId);};

// ==========================================
// NUEVA LÓGICA DE INTERVENCIONES (v2.0.1)
// ==========================================

window.buscarParaIntervencion = function(tipo) {
    const txt = window.safeVal(`search-${tipo}`).toLowerCase().trim();
    const res = window.el(`res-${tipo}`);
    if (txt.length < 2) { window.safeHide(res); return; }
    const localHits = listaPersonasCache.filter(p => {
        const full = `${p.nombre} ${p.ap1 || ''} ${p.ap2 || ''}`.toLowerCase();
        return full.includes(txt) || (p.docNum || "").toLowerCase().includes(txt);
    });
    const globalHits = listaGlobalPrefiliacion.filter(p => {
        const full = `${p.nombre} ${p.ap1 || ''} ${p.ap2 || ''}`.toLowerCase();
        return full.includes(txt) || (p.docNum || "").toLowerCase().includes(txt);
    });
    const hits = localHits.concat(globalHits);
    if (hits.length === 0) { 
        res.innerHTML = "<div class='search-item'>Sin resultados.</div>"; 
    } else { 
        let html = '';
        hits.forEach(p => { 
            const isPrefil = !p.estado || p.estado !== 'ingresado';
            const hasBed = p.cama ? `Cama ${p.cama}` : (isPrefil ? "Pre-Filiada" : "Sin Cama");
            const onclickAttr = isPrefil ? '' : `onclick="window.abrirFormularioIntervencion('${p.id}', '${tipo}')"`; 
            const buttonHtml = isPrefil ? '<button class="btn-icon-small" style="background:#ccc;color:#666;">No Disponible</button>' : '<button class="btn-icon-small" style="background:var(--primary);color:white;">Seleccionar</button>';
            html += `<div class="search-item" ${onclickAttr}><div><strong>${p.nombre} ${p.ap1 || ''}</strong><div style="font-size:0.8rem;color:#666;">${p.docNum || '-'} | ${hasBed}</div></div>${buttonHtml}</div>`;
        });
        res.innerHTML = html;
    }
    res.classList.remove('hidden');
    window.safeShow(res);
    // Forzar visibilidad manualmente
    res.style.display = 'block';
    res.style.visibility = 'visible';
    res.style.opacity = '1';
};
window.abrirFormularioIntervencion = async function(pid, tipo) {
    const p = listaPersonasCache.find(function(x) { return x.id === pid; });
    if(!p) return;
    personaIntervencionActiva = p;
    window.safeHide('res-' + tipo);
    window.safeShow('form-int-' + tipo);
    window.el('search-' + tipo).value = ""; 
    window.el('name-int-' + tipo).innerText = p.nombre + ' ' + (p.ap1 || '');
    
    const sel = window.el('sel-int-' + tipo);
    sel.innerHTML = '<option value="">-- Selecciona tipo de intervención --</option>'; // ⭐ CAMBIO: Sin preselección
    TIPOS_INTERVENCION[tipo].opciones.forEach(function(op) { 
        sel.add(new Option(op, op)); 
    });
    
    // Limpiar subformulario
    const subformContainer = document.getElementById(`subform-${tipo}`);
    if (subformContainer) subformContainer.innerHTML = '';
    
    // Precargar motivo si existe derivación pendiente
    const motivo = await obtenerMotivoDerivacion(pid, tipo);
    window.el('motivo-int-' + tipo).value = motivo;
    window.el('det-int-' + tipo).value = "";
};

// NUEVA FUNCIÓN: Obtener motivo de derivación pendiente
async function obtenerMotivoDerivacion(personaId, tipoIntervencion) {
    const accionBuscada = {
        'san': 'Derivación Sanitaria',
        'psi': 'Derivación Psicosocial',
        'ent': 'Derivación Entrega'
    }[tipoIntervencion];
    
    if(!accionBuscada || !currentAlbergueId) return "";
    
    try {
        const historialSnap = await getDocs(
            collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial")
        );
        
        let motivoDerivacion = "";
        
        historialSnap.forEach(function(doc) {
            const log = doc.data();
            if (log.accion === accionBuscada && log.estado === 'pendiente') {
                motivoDerivacion = log.detalle || "";
            }
        });
        
        return motivoDerivacion;
    } catch (e) {
        window.sysLog("Error obteniendo motivo derivación: " + e.message, "error");
        return "";
    }
}

window.cerrarFormularioIntervencion = function(tipo) {
    window.safeHide(`form-int-${tipo}`);
    personaIntervencionActiva = null;
};

window.registrarIntervencion = async function(tipo) {
    if(!personaIntervencionActiva) return;
    
    // Mapeo de tipos de intervención con iconos
    var tipoMap = {
        'san': { nombre: 'Sanitaria', icono: '🩺', accion: 'Intervención Sanitaria' },
        'psi': { nombre: 'Psicosocial', icono: '💚', accion: 'Intervención Psicosocial' },
        'ent': { nombre: 'Entregas', icono: '📦', accion: 'Intervención Entrega' }
    };
    
    var info = tipoMap[tipo];
    var subtipo = window.safeVal('sel-int-' + tipo);
    var motivo = window.safeVal('motivo-int-' + tipo).trim();
    var resolucion = window.safeVal('det-int-' + tipo).trim();
    
    // ⭐ NUEVO: Recopilar datos del subformulario
    var datosSubform = window.recopilarDatosSubformulario(tipo);
    
    // CORRECCIÓN V2.0.1: Guardar nombre antes de limpiar la variable global
    var nombrePersona = personaIntervencionActiva.nombre; 
    var personaId = personaIntervencionActiva.id;
    
    // Validación
    if(!subtipo) return alert("Selecciona un tipo.");
    if(!motivo || !resolucion) {
        return alert("Por favor, completa el motivo y la resolución");
    }
    
    try {
        // Guardar en intervenciones (con datos del subformulario)
        var data = {
            fecha: new Date(),
            usuario: currentUserData.nombre,
            tipo: info.nombre,
            subtipo: subtipo,
            motivo: motivo,
            detalle: resolucion,
            datosEstructurados: datosSubform // ⭐ NUEVO: Guardar datos estructurados
        };
        await addDoc(collection(db, "albergues", currentAlbergueId, "personas", personaId, "intervenciones"), data);
        
        // ⭐ NUEVO: Formatear detalle para historial usando subformulario
        var detalleSubform = window.formatearDatosHistorial(tipo, subtipo, datosSubform);
        var detalleFormateado = detalleSubform + 
                                "━━━━━━━━━━━━━━━━━━━━━━\n" +
                                "📌 Motivo:\n" + motivo + "\n\n" +
                                "✅ Resolución:\n" + resolucion;
        
        await addDoc(
            collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial"),
            {
                fecha: new Date(),
                usuario: currentUserData.nombre,
                accion: info.accion,
                detalle: detalleFormateado || ""
            }
        );
        
        // Auto-mark related derivations as attended
        await window.marcarDerivacionAtendida(personaId, info.nombre);
        
        window.showToast("✅ " + info.accion + " registrada");
        window.sysLog(info.accion + " registrada para " + nombrePersona, "success");
        
        // Limpiar y cerrar
        window.cerrarFormularioIntervencion(tipo);
        
        // NO llamar a volverABusquedaIntervenciones() aquí porque estamos en modo Operativa (desktop)
        // El formulario ya se cerró con cerrarFormularioIntervencion()
        
    } catch(e) {
        console.error(e);
        window.sysLog("Error registrando intervención: " + e.message, "error");
        alert("Error al guardar: " + e.message);
    }
};
window.verHistorialIntervencion = function(tipo) {
    if(personaIntervencionActiva) {
        window.verHistorial(personaIntervencionActiva.id);
    }
};

window.rescatarDeGlobalDirecto = async function() {
    if (!personaEnGestion || !personaEnGestionEsGlobal) return;
    if (!confirm(`¿Ingresar a ${personaEnGestion.nombre} (y familia) en este albergue?`)) return;
    try {
        const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId);
        const batch = writeBatch(db);
        for (const member of familia) {
            const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
            const memberData = { ...member };
            delete memberData.id;
            memberData.fechaIngresoAlbergue = new Date();
            memberData.origenPoolId = member.id;
            memberData.estado = 'espera';
            batch.set(localRef, memberData);
            batch.delete(doc(db, "pool_prefiliacion", member.id));
            const logRef = collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial");
            batch.set(doc(logRef), { fecha: new Date(), usuario: currentUserData.nombre, accion: "Ingreso desde Pre-Filiación", detalle: "Importado desde Pre-Filiación" });
            const oldHistSnap = await getDocs(collection(db, "pool_prefiliacion", member.id, "historial"));
            oldHistSnap.forEach(h => { const newHistRef = doc(logRef); batch.set(newHistRef, h.data()); });
        }
        await batch.commit();
        window.sysLog(`Familia importada desde Pre-Filiación con historial.`, "success");
        window.showToast("Ingreso realizado.");
        window.personaEnGestion = null;
        window.safeHide('panel-gestion-persona');
        window.el('buscador-persona').value = "";
    } catch (e) { window.sysLog("Error ingreso: " + e.message, "error"); }
};

window.guardarCama = async function(c) {
    if (savingLock) return;
    savingLock = true;
    
    // ⭐ VALIDACIONES ANTES DE ASIGNAR CAMA
    const personaValidar = personaEnGestion;
    
    if (!personaValidar) {
        savingLock = false;
        return alert("No hay persona seleccionada");
    }
    
    // Validar campos obligatorios
    if (!personaValidar.nombre || !personaValidar.nombre.trim()) {
        savingLock = false;
        return alert("❌ No se puede asignar cama:\nLa persona debe tener nombre registrado");
    }
    
    if (!personaValidar.ap1 || !personaValidar.ap1.trim()) {
        savingLock = false;
        return alert("❌ No se puede asignar cama:\nLa persona debe tener primer apellido registrado");
    }
    
    if (!personaValidar.fechaNac || personaValidar.fechaNac.trim() === "") {
        savingLock = false;
        return alert("❌ No se puede asignar cama:\nLa persona debe tener fecha de nacimiento registrada");
    }
    
    // Calcular edad para verificar si es menor de 14
    const edad = calcularEdad(personaValidar.fechaNac);
    const esMenorDe14 = edad !== null && edad < 14;
    
    // Solo exigir documento si NO es menor de 14 años O si tiene tipo de documento diferente a MENOR
    if (!esMenorDe14 || (personaValidar.tipoDoc && personaValidar.tipoDoc !== 'MENOR')) {
        if (!personaValidar.docNum || personaValidar.docNum.trim() === "") {
            savingLock = false;
            return alert("❌ No se puede asignar cama:\nLa persona debe tener documento registrado (DNI, NIE o Pasaporte).\n\nExcepción: Menores de 14 años con tipo documento 'MENOR'");
        }
    }
    
    // ✅ VALIDACIONES PASADAS - CONTINUAR CON LÓGICA ORIGINAL
    
    if (personaEnGestionEsGlobal) {
        if (!confirm(`¿Ingresar y asignar cama ${c}?`)) { 
            savingLock = false; 
            return; 
        }
        
        try {
            const familia = listaGlobalPrefiliacion.filter(x => x.familiaId === personaEnGestion.familiaId);
            const batch = writeBatch(db);
            let newPersonLocalId = null;
            
            for (const member of familia) {
                const localRef = doc(collection(db, "albergues", currentAlbergueId, "personas"));
                const memberData = { ...member };
                delete memberData.id;
                memberData.fechaIngresoAlbergue = new Date();
                memberData.origenPoolId = member.id;
                
                if (member.id === personaEnGestion.id) {
                    memberData.estado = 'ingresado';
                    memberData.cama = c.toString();
                    memberData.fechaIngreso = new Date();
                    newPersonLocalId = localRef.id;
                } else { 
                    memberData.estado = 'espera'; 
                }
                
                batch.set(localRef, memberData);
                batch.delete(doc(db, "pool_prefiliacion", member.id));
                
                const logRef = collection(db, "albergues", currentAlbergueId, "personas", localRef.id, "historial");
                batch.set(doc(logRef), { 
                    fecha: new Date(), 
                    usuario: currentUserData.nombre, 
                    accion: "Ingreso desde Pre-Filiación + Cama", 
                    detalle: `Cama ${c} - Importado` 
                });
                
                const oldHistSnap = await getDocs(collection(db, "pool_prefiliacion", member.id, "historial"));
                oldHistSnap.forEach(h => { 
                    const newHistRef = doc(logRef); 
                    batch.set(newHistRef, h.data()); 
                });
            }
            
            await batch.commit();
            window.sysLog(`Ingreso + Cama ${c} OK`, "success");
            window.cerrarMapaCamas();
            window.showToast("Ingresado. Cargando...");
            
            setTimeout(() => {
                const newPerson = listaPersonasCache.find(p => p.id === newPersonLocalId);
                if (newPerson) window.seleccionarPersona(newPerson, false);
                else { 
                    window.safeHide('panel-gestion-persona'); 
                    window.el('buscador-persona').value = ""; 
                }
                savingLock = false;
            }, 1000);
            
        } catch (e) { 
            window.sysLog("Error: " + e.message, "error"); 
            savingLock = false; 
        }
        return;
    }
    
    // Caso: persona ya está en el albergue
    if (personaEnGestion.cama) { 
        alert(`Error: Ya tiene cama.`); 
        savingLock = false; 
        return; 
    }
    
    personaEnGestion.cama = c.toString();
    personaEnGestion.estado = 'ingresado';
    
    try {
        await updateDoc(doc(db, "albergues", currentAlbergueId, "personas", personaEnGestion.id), { 
            estado: 'ingresado', 
            cama: c.toString(), 
            fechaIngreso: new Date() 
        });
        
        window.registrarLog(personaEnGestion.id, "Asignación Cama", `Cama ${c}`);
        window.cerrarMapaCamas();
        window.sysLog(`Cama ${c} asignada`, "success");
        
    } catch (e) { 
        window.sysLog("Error saving bed: " + e.message, "error"); 
        alert("Error al guardar cama"); 
    }
    
    savingLock = false;
};
// --- DERIVACIONES NOTIFICATION SYSTEM ---
let unsubscribeDerivaciones = null;
let derivacionesGlobales = [];

// Get derivations allowed for current user role
window.getDerivacionesPermitidas = function() {
    const rol = (currentUserData?.rol || "").toLowerCase();
    switch(rol) {
        case 'super_admin':
        case 'admin':
            return ['Derivación Sanitaria', 'Derivación Psicosocial', 'Derivación Entrega'];
        case 'albergue':
            return ['Derivación Entrega'];
        case 'sanitario':
            return ['Derivación Sanitaria'];
        case 'psicosocial':
            return ['Derivación Psicosocial'];
        case 'observador':
        default:
            return [];
    }
};

// Count pending derivations
window.contarDerivacionesPendientes = async function() {
    if(!currentUserData) return 0;
    
    const permitidas = window.getDerivacionesPermitidas();
    if(permitidas.length === 0) return 0;
    
    let totalPendientes = 0;
    
    try {
        // Get all albergues
        const alberguesSnap = await getDocs(collection(db, "albergues"));
        
        for(const albDoc of alberguesSnap.docs) {
            const personasSnap = await getDocs(collection(db, "albergues", albDoc.id, "personas"));
            
            for(const persDoc of personasSnap.docs) {
                const historialSnap = await getDocs(collection(db, "albergues", albDoc.id, "personas", persDoc.id, "historial"));
                
                historialSnap.forEach(histDoc => {
                    const log = histDoc.data();
                    if(log.estado === 'pendiente' && permitidas.includes(log.accion)) {
                        totalPendientes++;
                    }
                });
            }
        }
    } catch(e) {
        window.sysLog("Error contando derivaciones: " + e.message, "error");
    }
    
    return totalPendientes;
};

// Update notification badge
window.actualizarBadgeDerivaciones = async function() {
    const count = await window.contarDerivacionesPendientes();
    const badge = document.getElementById('derivaciones-notif-badge');
    const badgeCount = document.getElementById('badge-count');
    
    if(badge && badgeCount) {
        badgeCount.innerText = count;
        
        if(count > 0) {
            badge.classList.remove('hidden');
            badge.classList.add('has-notifications');
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('has-notifications');
        }
    }
};

// Open derivations modal (decides which one based on context)
window.abrirDerivaciones = async function() {
    if(currentAlbergueId) {
        // In shelter management mode - show people with derivations
        await window.cargarDerivacionesAlbergue();
    } else {
        // In main page - show shelters summary
        await window.cargarResumenAlbergues();
    }
};

// Load shelter summary modal
window.cargarResumenAlbergues = async function() {
    const modal = document.getElementById('modal-resumen-albergues');
    const content = document.getElementById('resumen-albergues-content');
    
    if(!modal || !content) return;
    
    content.innerHTML = '<div style="text-align:center"><div class="spinner"></div><p>Cargando...</p></div>';
    modal.classList.remove('hidden');
    
    const permitidas = window.getDerivacionesPermitidas();
    if(permitidas.length === 0) {
        content.innerHTML = '<p style="text-align:center;color:#999;">No tienes permisos para ver derivaciones.</p>';
        return;
    }
    
    try {
        const alberguesSnap = await getDocs(collection(db, "albergues"));
        const alberguesConDerivaciones = [];
        
        for(const albDoc of alberguesSnap.docs) {
            const albData = albDoc.data();
            const derivaciones = {
                san: 0,
                psi: 0,
                ent: 0
            };
            
            const personasSnap = await getDocs(collection(db, "albergues", albDoc.id, "personas"));
            
            for(const persDoc of personasSnap.docs) {
                const historialSnap = await getDocs(collection(db, "albergues", albDoc.id, "personas", persDoc.id, "historial"));
                
                historialSnap.forEach(histDoc => {
                    const log = histDoc.data();
                    if(log.estado === 'pendiente' && permitidas.includes(log.accion)) {
                        if(log.accion === 'Derivación Sanitaria') derivaciones.san++;
                        if(log.accion === 'Derivación Psicosocial') derivaciones.psi++;
                        if(log.accion === 'Derivación Entrega') derivaciones.ent++;
                    }
                });
            }
            
            const total = derivaciones.san + derivaciones.psi + derivaciones.ent;
            if(total > 0) {
                alberguesConDerivaciones.push({
                    id: albDoc.id,
                    nombre: albData.nombre,
                    derivaciones: derivaciones,
                    total: total
                });
            }
        }
        
        if(alberguesConDerivaciones.length === 0) {
            content.innerHTML = '<p style="text-align:center;color:#999;">No hay derivaciones pendientes en ningún albergue.</p>';
            return;
        }
        
        let html = '';
        alberguesConDerivaciones.forEach(alb => {
            html += `
                <div class="albergue-resumen-item" onclick="window.navegarAAlbergueConDerivaciones('${alb.id}')">
                    <div class="albergue-resumen-nombre">${alb.nombre}</div>
                    <div class="badges-container">`;
            
            if(alb.derivaciones.san > 0) {
                html += `<div class="count-badge badge-san">
                    <i class="fa-solid fa-briefcase-medical"></i>
                    <span>Sanitaria: ${alb.derivaciones.san}</span>
                </div>`;
            }
            if(alb.derivaciones.psi > 0) {
                html += `<div class="count-badge badge-psi">
                    <i class="fa-solid fa-heart"></i>
                    <span>Psicosocial: ${alb.derivaciones.psi}</span>
                </div>`;
            }
            if(alb.derivaciones.ent > 0) {
                html += `<div class="count-badge badge-ent">
                    <i class="fa-solid fa-box"></i>
                    <span>Entregas: ${alb.derivaciones.ent}</span>
                </div>`;
            }
            
            html += `
                    </div>
                </div>`;
        });
        
        content.innerHTML = html;
        
    } catch(e) {
        window.sysLog("Error cargando resumen albergues: " + e.message, "error");
        content.innerHTML = '<p style="text-align:center;color:red;">Error al cargar datos.</p>';
    }
};

// Navigate to shelter and open derivations
window.navegarAAlbergueConDerivaciones = async function(albergueId) {
    document.getElementById('modal-resumen-albergues').classList.add('hidden');
    await window.cargarDatosYEntrar(albergueId);
    window.navegar('gestion-albergues');
    // Wait for data to be loaded into cache before opening modal
    const maxWait = 5000; // 5 seconds max
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
        if(listaPersonasCache.length > 0 || Date.now() - startTime > maxWait) {
            clearInterval(checkInterval);
            try {
                window.cargarDerivacionesAlbergue();
            } catch(e) {
                window.sysLog("Error cargando derivaciones: " + e.message, "error");
            }
        }
    }, 200);
};

// Load derivations for active shelter
window.cargarDerivacionesAlbergue = async function() {
    if(!currentAlbergueId) return;
    
    const modal = document.getElementById('modal-derivaciones-albergue');
    const content = document.getElementById('derivaciones-albergue-content');
    const nombreEl = document.getElementById('derivaciones-albergue-nombre');
    
    if(!modal || !content) return;
    
    if(nombreEl && currentAlbergueData) {
        nombreEl.innerText = currentAlbergueData.nombre;
    }
    
    content.innerHTML = '<div style="text-align:center"><div class="spinner"></div><p>Cargando...</p></div>';
    modal.classList.remove('hidden');
    
    const permitidas = window.getDerivacionesPermitidas();
    if(permitidas.length === 0) {
        content.innerHTML = '<p style="text-align:center;color:#999;">No tienes permisos para ver derivaciones.</p>';
        return;
    }
    
    try {
        const personasSnap = await getDocs(collection(db, "albergues", currentAlbergueId, "personas"));
        const personasConDerivaciones = [];
        
        for(const persDoc of personasSnap.docs) {
            const persData = persDoc.data();
            const derivacionesPendientes = [];
            
            const historialSnap = await getDocs(collection(db, "albergues", currentAlbergueId, "personas", persDoc.id, "historial"));
            
            historialSnap.forEach(histDoc => {
                const log = histDoc.data();
                if(log.estado === 'pendiente' && permitidas.includes(log.accion)) {
                    derivacionesPendientes.push({
                        ...log,
                        id: histDoc.id
                    });
                }
            });
            
            if(derivacionesPendientes.length > 0) {
                personasConDerivaciones.push({
                    id: persDoc.id,
                    nombre: persData.nombre,
                    ap1: persData.ap1 || '',
                    docNum: persData.docNum || '',
                    derivaciones: derivacionesPendientes
                });
            }
        }
        
        if(personasConDerivaciones.length === 0) {
            content.innerHTML = '<p style="text-align:center;color:#999;">No hay derivaciones pendientes en este albergue.</p>';
            return;
        }
        
        let html = '';
        personasConDerivaciones.forEach(persona => {
            persona.derivaciones.forEach(deriv => {
                // Handle both Firestore Timestamp and JavaScript Date objects
                let fecha;
                try {
                    if(deriv.fecha && deriv.fecha.toDate) {
                        fecha = deriv.fecha.toDate();
                    } else if(deriv.fecha) {
                        fecha = new Date(deriv.fecha);
                    } else {
                        fecha = new Date(); // Fallback to current date if missing
                    }
                } catch(e) {
                    window.sysLog("Error parsing fecha in derivation: " + e.message, "warn");
                    fecha = new Date();
                }
                const fechaStr = `${fecha.getDate().toString().padStart(2,'0')}/${(fecha.getMonth()+1).toString().padStart(2,'0')}/${fecha.getFullYear()} ${fecha.getHours().toString().padStart(2,'0')}:${fecha.getMinutes().toString().padStart(2,'0')}`;
                
                let tipoClass = '';
                let tipoBadge = '';
                let tipoLabel = '';
                
                if(deriv.accion === 'Derivación Sanitaria') {
                    tipoClass = 'derivacion-item-san';
                    tipoBadge = 'badge-san';
                    tipoLabel = 'Sanitaria';
                } else if(deriv.accion === 'Derivación Psicosocial') {
                    tipoClass = 'derivacion-item-psi';
                    tipoBadge = 'badge-psi';
                    tipoLabel = 'Psicosocial';
                } else if(deriv.accion === 'Derivación Entrega') {
                    tipoClass = 'derivacion-item-ent';
                    tipoBadge = 'badge-ent';
                    tipoLabel = 'Entregas';
                }
                
                html += `
                    <div class="derivacion-item ${tipoClass}" onclick="window.navegarADerivacion('${persona.id}', '${tipoLabel}')">
                        <div class="derivacion-header">
                            <div class="derivacion-nombre">${persona.nombre} ${persona.ap1}</div>
                            <div class="derivacion-tipo-badge ${tipoBadge}">${tipoLabel}</div>
                        </div>
                        <div class="derivacion-info">
                            <i class="fa-regular fa-calendar"></i> ${fechaStr} | 
                            <i class="fa-solid fa-user"></i> ${deriv.usuario}
                        </div>
                        ${deriv.detalle ? `<div class="derivacion-motivo">${deriv.detalle}</div>` : ''}
                    </div>`;
            });
        });
        
        content.innerHTML = html;
        
    } catch(e) {
        window.sysLog("Error cargando derivaciones albergue: " + e.message, "error");
        content.innerHTML = '<p style="text-align:center;color:red;">Error al cargar datos.</p>';
    }
};

// Helper function to open intervention form for a derivation
window.abrirFormularioDerivacion = function(personaId, tipoDerivacion, tabName) {
    window.cambiarPestana(tabName);
    
    setTimeout(() => {
        const persona = listaPersonasCache.find(p => p.id === personaId);
        if(persona) {
            // Map derivation type to intervention type code
            let tipo;
            if(tipoDerivacion === 'Sanitaria') {
                tipo = 'san';
            } else if(tipoDerivacion === 'Psicosocial') {
                tipo = 'psi';
            } else {
                tipo = 'ent';
            }
            window.abrirFormularioIntervencion(personaId, tipo);
        }
    }, 300);
};

// Navigate to correct tab and search for person
window.navegarADerivacion = async function(personaId, tipoDerivacion) {
    try {
        // Close modal
        document.getElementById('modal-derivaciones-albergue').classList.add('hidden');
        
        // Map derivation type to tab name and tipo code
        let tabName = '';
        let tipo = '';
        if(tipoDerivacion === 'Sanitaria') {
            tabName = 'sanitaria';
            tipo = 'san';
        } else if(tipoDerivacion === 'Psicosocial') {
            tabName = 'psicosocial';
            tipo = 'psi';
        } else if(tipoDerivacion === 'Entregas') {
            tabName = 'entregas';
            tipo = 'ent';
        }
        
        if(!tabName) return;
        
        // Get person data from Firestore to ensure we have the latest info
        const personaRef = doc(db, "albergues", currentAlbergueId, "personas", personaId);
        const personaSnap = await getDoc(personaRef);
        
        if (!personaSnap.exists()) {
            alert("Persona no encontrada");
            window.sysLog("Error: Persona no encontrada en derivación", "error");
            return;
        }
        
        const personaData = { id: personaSnap.id, ...personaSnap.data() };
        const nombreCompleto = `${personaData.nombre} ${personaData.ap1 || ''} ${personaData.ap2 || ''}`.trim();
        
        // Make sure we're in operativa view (where intervention tabs are)
        const inOperativa = !document.getElementById('screen-operativa').classList.contains('hidden');
        
        if(!inOperativa) {
            // Navigate to operativa screen (maintains shelter context)
            window.navegar('operativa');
        }
        
        // Wait for navigation to complete before switching tab
        // These delays are necessary for DOM rendering after navigation
        setTimeout(() => {
            // Switch to the correct tab
            window.cambiarPestana(tabName);
            
            // Wait for tab to render before manipulating its elements
            setTimeout(() => {
                // Fill the search input with the person's name
                const searchInput = document.getElementById(`search-${tipo}`);
                if (searchInput) {
                    searchInput.value = nombreCompleto;
                    // Trigger the search to populate results
                    window.buscarParaIntervencion(tipo);
                } else {
                    window.sysLog(`Advertencia: No se encontró el input de búsqueda para ${tipo}`, "warn");
                }
                
                // Wait for search results to populate before opening form
                setTimeout(() => {
                    // Ensure person is in cache before opening form
                    if (!listaPersonasCache.find(x => x.id === personaId)) {
                        listaPersonasCache.push(personaData);
                    }
                    
                    // Open the intervention form
                    window.abrirFormularioIntervencion(personaId, tipo);
                    window.sysLog(`Navegando a derivación: ${tipoDerivacion} - ${nombreCompleto}`, "info");
                }, 100);
            }, 200);
        }, inOperativa ? 100 : 500);
        
    } catch (e) {
        window.sysLog("Error navegando a derivación: " + e.message, "error");
        alert("Error al abrir la ficha: " + e.message);
    }
};

// Mark derivation as attended
// Mark derivation as attended
window.marcarDerivacionAtendida = async function(personaId, tipoDerivacion) {
    if(!currentAlbergueId || !personaId) return;
    
    try {
        let accionBuscada = '';
        if(tipoDerivacion === 'Sanitaria') {
            accionBuscada = 'Derivación Sanitaria';
        } else if(tipoDerivacion === 'Psicosocial') {
            accionBuscada = 'Derivación Psicosocial';
        } else if(tipoDerivacion === 'Entregas') {
            accionBuscada = 'Derivación Entrega';
        }
        
        if(!accionBuscada) return;
        
        const historialSnap = await getDocs(collection(db, "albergues", currentAlbergueId, "personas", personaId, "historial"));
        
        const batch = writeBatch(db);
        let marcadas = 0;
        
        historialSnap.forEach(histDoc => {
            const log = histDoc.data();
            if(log.estado === 'pendiente' && log.accion === accionBuscada) {
                const docRef = doc(db, "albergues", currentAlbergueId, "personas", personaId, "historial", histDoc.id);
                batch.update(docRef, { estado: 'atendida' });
                marcadas++;
            }
        });
        
        if(marcadas > 0) {
            await batch.commit();
            
            // Decrementar contador en el albergue
            const campoContador = accionBuscada === 'Derivación Sanitaria' ? 'derivacionesPendientes.sanitaria' :
                                  accionBuscada === 'Derivación Psicosocial' ? 'derivacionesPendientes.psicosocial' :
                                  'derivacionesPendientes.entregas';
            
            await updateDoc(doc(db, "albergues", currentAlbergueId), {
                [campoContador]: increment(-marcadas)
            });
            
            // ⭐ NUEVO: Marcar como resuelta en colección plana
            const qDeriv = query(
                collection(db, "derivaciones"),
                where("personaId", "==", personaId),
                where("tipo", "==", accionBuscada),
                where("estado", "==", "pendiente")
            );
            
            const derivSnap = await getDocs(qDeriv);
            derivSnap.forEach(async (docDeriv) => {
                await updateDoc(doc(db, "derivaciones", docDeriv.id), {
                    estado: "resuelta",
                    fechaResolucion: new Date(),
                    usuarioResolucion: currentUserData.nombre
                });
            });
            
            window.sysLog(`${marcadas} derivaciones de ${accionBuscada} marcadas como atendidas`, "success");
        }
        
    } catch(e) {
        window.sysLog("Error marcando derivación atendida: " + e.message, "error");
    }
};

// Setup real-time listener for derivations
let derivacionesUpdateInterval = null;

window.setupDerivacionesListener = function() {
    const permitidas = window.getDerivacionesPermitidas();
    
    if(permitidas.length === 0) {
        const badge = document.getElementById('derivaciones-notif-badge');
        if(badge) badge.classList.add('hidden');
        return;
    }
    
    // Limpiar listener anterior si existe
    if(unsubscribeDerivaciones) {
        unsubscribeDerivaciones();
        unsubscribeDerivaciones = null;
    }
    
    // ⭐ TIEMPO REAL: Escuchar solo derivaciones pendientes del usuario
    const q = query(
        collection(db, "derivaciones"),
        where("estado", "==", "pendiente"),
        where("tipo", "in", permitidas)
    );
    
    unsubscribeDerivaciones = onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        const badge = document.getElementById('derivaciones-notif-badge');
        const badgeCount = document.getElementById('badge-count');
        
        if(badge && badgeCount) {
            badgeCount.innerText = count;
            
            if(count > 0) {
                badge.classList.remove('hidden');
                badge.classList.add('has-notifications');
            } else {
                badge.classList.add('hidden');
                badge.classList.remove('has-notifications');
            }
        }
        
        window.sysLog(`📬 Derivaciones actualizadas: ${count} pendientes`, "info");
    }, (error) => {
        window.sysLog("Error en listener derivaciones: " + error.message, "error");
    });
};
window.onload = async () => {
    if(isPublicMode){
        console.log('🔍 Modo público detectado, inicializando...');
        
        // Ocultar login y app
        window.safeHide('login-screen');
        window.safeHide('app-shell');
        
        // Mostrar pantalla pública (NOMBRE CORREGIDO)
        window.safeShow('public-screen');
        
        console.log('🔍 Configurando toggles...');
        // Configurar toggles ANTES de conectar a Firebase
        setupIntoleranciaToggle('pub-tiene-intolerancia', 'pub-intolerancia-detalle-container');
        setupIntoleranciaToggle('fam-tiene-intolerancia', 'fam-intolerancia-detalle-container');
        
        try {
            console.log('🔍 Conectando con Firebase...');
            await signInAnonymously(auth);
            
            console.log('🔍 Obteniendo datos del albergue:', currentAlbergueId);
            const docRef = doc(db, "albergues", currentAlbergueId);
            const docSnap = await getDoc(docRef);
            
       if(docSnap.exists()){
    const d = docSnap.data();
    console.log('🔍 Albergue encontrado:', d.nombre);
    if(window.el('public-albergue-name')) {
        window.el('public-albergue-name').innerText = d.nombre;
    }
    if(window.el('public-albergue-name-welcome')) {
        window.el('public-albergue-name-welcome').innerText = d.nombre;
    }
} else {
    console.error('❌ Albergue no encontrado');
    alert('Error: Albergue no encontrado');
}
            
            console.log('✅ Modo público listo');
        } catch(e) { 
            console.error("❌ Error init público:", e); 
            alert("Error de conexión con el albergue: " + e.message); 
        }
        
        // FORZAR VISIBILIDAD (por si acaso hay CSS que lo oculta)
        setTimeout(() => {
    const screen = document.getElementById('public-screen');
    const container = document.getElementById('public-form-container');
    if (screen) {
        screen.classList.remove('hidden');
        screen.style.display = 'block';
        screen.style.visibility = 'visible';
        screen.style.opacity = '1';
    }
    if (container) {
        container.classList.add('hidden');
        container.style.display = 'none';
        container.style.visibility = 'hidden';
        container.style.opacity = '0';
    }
}, 500);
        
    } else {
        const passInput = document.getElementById('login-pass');
        if(passInput) passInput.addEventListener('keypress', e=>{ if(e.key==='Enter') window.iniciarSesion(); });
    }
    const params = new URLSearchParams(window.location.search);
    if(params.get('action') === 'scan') { window.sysLog("Deep Link detectado. Esperando Auth...", "info"); }
};
onAuthStateChanged(auth, async (u) => {
    if(isPublicMode) return;
    
    if(u){
        // ============================================
        // LIMPIAR TODOS LOS LISTENERS ANTES
        // ============================================
        if (unsubscribePersonas) { unsubscribePersonas(); unsubscribePersonas = null; }
        if (unsubscribePool) { unsubscribePool(); unsubscribePool = null; }
        if (unsubscribeAlbergueDoc) { unsubscribeAlbergueDoc(); unsubscribeAlbergueDoc = null; }
        if (unsubscribeUsers) { unsubscribeUsers(); unsubscribeUsers = null; }
        if (unsubscribeAlberguesActivos) { unsubscribeAlberguesActivos(); unsubscribeAlberguesActivos = null; }
        if (unsubscribeAlberguesMto) { unsubscribeAlberguesMto(); unsubscribeAlberguesMto = null; }
        
        const s = await getDoc(doc(db,"usuarios",u.uid));
        if(s.exists()){
            const d = s.data();
            if (d.activo === false) { 
                window.sysLog("Acceso denegado: Usuario inactivo", "warn"); 
                alert("Este usuario ha sido desactivado por administración."); 
                signOut(auth); 
                return; 
            }
            currentUserData = {...d, uid: u.uid};
            window.sysLog(`Usuario autenticado: ${currentUserData.nombre} (${currentUserData.rol})`, "success");
            window.safeHide('login-screen');
            window.safeShow('app-shell');
            window.configurarDashboard();
                        
            // Configurar toggles de intolerancia en todos los formularios
            setupIntoleranciaToggle('pub-tiene-intolerancia', 'pub-intolerancia-detalle-container');
            setupIntoleranciaToggle('man-tiene-intolerancia', 'man-intolerancia-detalle-container');
            setupIntoleranciaToggle('edit-tiene-intolerancia', 'edit-intolerancia-detalle-container');
            setupIntoleranciaToggle('fam-tiene-intolerancia', 'fam-intolerancia-detalle-container');
            setupIntoleranciaToggle('adm-fam-tiene-intolerancia', 'adm-fam-intolerancia-detalle-container');
            
            const params = new URLSearchParams(window.location.search);
            if(params.get('action') === 'scan' && params.get('aid') && params.get('pid')) { 
                window.iniciarModoFocalizado(params.get('aid'), params.get('pid')); 
            } else { 
                window.navegar('home'); 
            }
        } else {
            window.sysLog("Usuario fantasma detectado. Restaurando INACTIVO...", "warn");
            await setDoc(doc(db,"usuarios",u.uid), { 
                email: u.email, 
                nombre: u.email.split('@')[0], 
                rol: "observador", 
                activo: false 
            });
            alert("Tu usuario ha sido restaurado pero está INACTIVO por seguridad.\n\nContacta con un administrador para que te active.");
            signOut(auth);
        }
    } else {
        // Solo mostrar login si NO está en modo público
        if (!isPublicMode) {
            window.sysLog("Esperando inicio de sesión...", "info");
            window.safeHide('app-shell');
            window.safeShow('login-screen');
        }
    }
});
