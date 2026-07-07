import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createTicket } from './ticket.service';

export interface SoporteRecurrente {
  id: number;
  titulo: string;
  descripcion: string;
  categoria: string;
  empresa_id: number | null;
  area_solicitante: string | null;
  persona_solicitante: string | null;
  prioridad: 'Baja' | 'Media' | 'Alta' | 'Critica';
  frecuencia: 'Diario' | 'Semanal' | 'Mensual' | 'Trimestral' | 'Semestral' | 'Anual';
  fecha_inicio: string;
  siguiente_ejecucion: string;
  ultima_ejecucion: string | null;
  is_active: boolean;
  created_at?: string;
}

export const getSoportesRecurrentes = async () => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT sr.*, e.nombre as empresa_nombre 
     FROM soporte_recurrente sr 
     LEFT JOIN empresa e ON sr.empresa_id = e.id 
     ORDER BY sr.id DESC`
  );
  return rows;
};

export const getSoporteRecurrenteById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT sr.*, e.nombre as empresa_nombre 
     FROM soporte_recurrente sr 
     LEFT JOIN empresa e ON sr.empresa_id = e.id 
     WHERE sr.id = ?`,
    [id]
  );
  return rows[0] || null;
};

export const createSoporteRecurrente = async (data: Omit<SoporteRecurrente, 'id'>) => {
  // Inicialmente siguiente_ejecucion es igual a fecha_inicio, o si fecha_inicio es en el pasado,
  // se calcula la siguiente ocurrencia futura desde hoy.
  const fechaInicio = new Date(data.fecha_inicio);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let siguienteEjecucion = new Date(fechaInicio);
  if (siguienteEjecucion < hoy) {
    while (siguienteEjecucion < hoy) {
      siguienteEjecucion = calcNextExecution(siguienteEjecucion, data.frecuencia);
    }
  }

  const fmtInicio = data.fecha_inicio.split('T')[0];
  const fmtSiguiente = siguienteEjecucion.toISOString().split('T')[0];

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO soporte_recurrente 
      (titulo, descripcion, categoria, empresa_id, area_solicitante, persona_solicitante, 
       prioridad, frecuencia, fecha_inicio, siguiente_ejecucion, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.titulo, data.descripcion, data.categoria, data.empresa_id || null,
      data.area_solicitante || null, data.persona_solicitante || null,
      data.prioridad || 'Media', data.frecuencia, fmtInicio, fmtSiguiente,
      data.is_active !== undefined ? data.is_active : true
    ]
  );

  return getSoporteRecurrenteById(result.insertId);
};

export const updateSoporteRecurrente = async (id: number, data: Partial<SoporteRecurrente>) => {
  const existing = await getSoporteRecurrenteById(id);
  if (!existing) return null;

  const sets: string[] = [];
  const vals: any[] = [];

  const allowedFields: (keyof SoporteRecurrente)[] = [
    'titulo', 'descripcion', 'categoria', 'empresa_id', 
    'area_solicitante', 'persona_solicitante', 'prioridad', 
    'frecuencia', 'fecha_inicio', 'is_active'
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = ?`);
      vals.push(data[field]);
    }
  }

  // Si cambia la frecuencia o la fecha de inicio, recalculamos la siguiente ejecución
  if (data.frecuencia !== undefined || data.fecha_inicio !== undefined) {
    const freq = data.frecuencia || existing.frecuencia;
    const startStr = data.fecha_inicio || existing.fecha_inicio;
    const fechaInicio = new Date(startStr);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let siguienteEjecucion = new Date(fechaInicio);
    if (siguienteEjecucion < hoy) {
      while (siguienteEjecucion < hoy) {
        siguienteEjecucion = calcNextExecution(siguienteEjecucion, freq);
      }
    }
    sets.push(`siguiente_ejecucion = ?`);
    vals.push(siguienteEjecucion.toISOString().split('T')[0]);
  }

  if (sets.length > 0) {
    vals.push(id);
    await pool.query(`UPDATE soporte_recurrente SET ${sets.join(', ')} WHERE id = ?`, vals);
  }

  return getSoporteRecurrenteById(id);
};

export const deleteSoporteRecurrente = async (id: number) => {
  const existing = await getSoporteRecurrenteById(id);
  if (!existing) return null;
  await pool.query(`DELETE FROM soporte_recurrente WHERE id = ?`, [id]);
  return existing;
};

// Auxiliar para calcular fecha futura de ejecución
const calcNextExecution = (fecha: Date, frecuencia: string): Date => {
  const next = new Date(fecha);
  if (frecuencia === 'Diario') {
    next.setDate(next.getDate() + 1);
  } else if (frecuencia === 'Semanal') {
    next.setDate(next.getDate() + 7);
  } else if (frecuencia === 'Mensual') {
    next.setMonth(next.getMonth() + 1);
  } else if (frecuencia === 'Trimestral') {
    next.setMonth(next.getMonth() + 3);
  } else if (frecuencia === 'Semestral') {
    next.setMonth(next.getMonth() + 6);
  } else if (frecuencia === 'Anual') {
    next.setFullYear(next.getFullYear() + 1);
  }
  return next;
};

// Evaluar reglas de recurrencia y generar tickets correspondientes
export const processRecurrentSupports = async () => {
  const hoyStr = new Date().toISOString().split('T')[0];
  
  // Buscar todas las reglas activas cuya siguiente ejecución es hoy o en el pasado
  const [recurrents] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM soporte_recurrente 
     WHERE is_active = 1 AND siguiente_ejecucion <= ?`,
    [hoyStr]
  );

  if (recurrents.length === 0) return;

  const systemUser = {
    id: 1,
    nombre_completo: 'Sistema Automático',
    rol_nombre: 'ADMIN',
    email: 'admin@smo.com'
  };

  for (const item of recurrents) {
    console.log(`[Cron] Procesando soporte recurrente #${item.id}: "${item.titulo}"`);
    
    // Crear el ticket real en el nivel N1
    const ticketData = {
      titulo: `[RECURRENTE] ${item.titulo}`,
      descripcion: `Soporte Programado Recurrente: ${item.descripcion}`,
      categoria: item.categoria,
      empresa_id: item.empresa_id,
      area_solicitante: item.area_solicitante,
      persona_solicitante: item.persona_solicitante || 'Sistema de Mantenimiento',
      medio_solicitud: 'Automático (Recurrente)',
      prioridad: item.prioridad,
      estado: 'Nuevo',
      nivel_soporte: 'N1'
    };

    try {
      await createTicket(ticketData, systemUser);
      
      // Calcular la siguiente ejecución
      const actualSiguiente = new Date(item.siguiente_ejecucion);
      let nuevaSiguiente = calcNextExecution(actualSiguiente, item.frecuencia);
      
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      // Evitar bucles infinitos si la fecha es muy vieja: avanzar hasta superar el día de hoy
      while (nuevaSiguiente <= hoy) {
        nuevaSiguiente = calcNextExecution(nuevaSiguiente, item.frecuencia);
      }

      const fmtNuevaSiguiente = nuevaSiguiente.toISOString().split('T')[0];
      
      await pool.query(
        `UPDATE soporte_recurrente 
         SET siguiente_ejecucion = ?, 
             ultima_ejecucion = ? 
         WHERE id = ?`,
        [fmtNuevaSiguiente, hoyStr, item.id]
      );
      
      console.log(`[Cron] Ticket creado exitosamente. Próxima ejecución programada para: ${fmtNuevaSiguiente}`);
    } catch (err) {
      console.error(`[Cron] Error al crear ticket para soporte recurrente #${item.id}:`, err);
    }
  }
};

// Iniciar programador Cron en memoria (evalúa cada 1 hora)
export const startRecurrentSupportCron = () => {
  const ONE_HOUR = 60 * 60 * 1000;
  console.log('[Cron] Inicializando programador de Soportes Recurrentes (Frecuencia: 1 hora)...');
  
  // Ejecución inicial tras el arranque
  setTimeout(async () => {
    try {
      console.log('[Cron] Ejecutando verificación inicial de Soportes Recurrentes...');
      await processRecurrentSupports();
    } catch (e) {
      console.error('[Cron] Error en la verificación inicial de recurrentes:', e);
    }
  }, 5000); // Esperar 5 segundos tras arrancar para que la BD esté disponible

  setInterval(async () => {
    try {
      console.log('[Cron] Evaluando Soportes Recurrentes programados...');
      await processRecurrentSupports();
    } catch (e) {
      console.error('[Cron] Error al procesar soportes recurrentes:', e);
    }
  }, ONE_HOUR);
};
