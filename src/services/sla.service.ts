import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface SlaConfig {
  id: number;
  tipo_itil: 'SOLICITUD' | 'INCIDENCIA';
  prioridad: 'Baja' | 'Media' | 'Alta' | 'Critica';
  tiempo_horas: number;
  descripcion?: string | null;
  updated_at?: string;
}

export const getSlaConfigs = async (): Promise<SlaConfig[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT * FROM configuracion_sla 
    ORDER BY 
      CASE tipo_itil 
        WHEN 'SOLICITUD' THEN 1 
        WHEN 'INCIDENCIA' THEN 2 
        ELSE 3 
      END,
      CASE prioridad 
        WHEN 'Critica' THEN 1 
        WHEN 'Alta' THEN 2 
        WHEN 'Media' THEN 3 
        WHEN 'Baja' THEN 4 
        ELSE 5 
      END
  `);
  return rows as SlaConfig[];
};

export const updateSlaConfig = async (
  id: number,
  data: { tiempo_horas: number; descripcion?: string }
): Promise<SlaConfig> => {
  const horas = Math.max(1, Number(data.tiempo_horas) || 1);

  await pool.query(
    'UPDATE configuracion_sla SET tiempo_horas = ?, descripcion = ?, updated_at = NOW() WHERE id = ?',
    [horas, data.descripcion?.trim() || null, id]
  );

  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM configuracion_sla WHERE id = ?', [id]);
  if (rows.length === 0) throw new Error('Configuración de SLA no encontrada');
  return rows[0] as SlaConfig;
};

export const bulkUpdateSlaConfigs = async (
  configs: Array<{ id: number; tiempo_horas: number; descripcion?: string }>
): Promise<SlaConfig[]> => {
  for (const item of configs) {
    const horas = Math.max(1, Number(item.tiempo_horas) || 1);
    await pool.query(
      'UPDATE configuracion_sla SET tiempo_horas = ?, descripcion = ?, updated_at = NOW() WHERE id = ?',
      [horas, item.descripcion?.trim() || null, item.id]
    );
  }
  return getSlaConfigs();
};

/**
 * Obtiene el mapa completo de configuraciones de SLA directamente de la base de datos
 */
export const getSlaConfigsMap = async (): Promise<Map<string, number>> => {
  try {
    const configs = await getSlaConfigs();
    const map = new Map<string, number>();
    for (const c of configs) {
      const pNorm = (String(c.prioridad) === 'Crítica' ? 'Critica' : c.prioridad).toUpperCase();
      map.set(`${c.tipo_itil.toUpperCase()}_${pNorm}`, Number(c.tiempo_horas));
    }
    return map;
  } catch (err) {
    console.error('Error al cargar mapa de SLA de BD:', err);
    return new Map<string, number>();
  }
};

/**
 * Resuelve las horas de SLA de un ticket basándose primero en t.sla_horas o en la configuración de la BD
 */
export const resolverSlaHorasTicket = (
  t: { sla_horas?: number | null; nivel_soporte?: string | null; grupo_n2?: string | null; prioridad?: string | null },
  slaMap?: Map<string, number>
): number => {
  if (t.sla_horas && Number(t.sla_horas) > 0) {
    return Number(t.sla_horas);
  }

  const esIncidencia = (t.nivel_soporte && t.nivel_soporte !== 'N1') || Boolean(t.grupo_n2);
  const tipoItil = esIncidencia ? 'INCIDENCIA' : 'SOLICITUD';
  const pNorm = (t.prioridad === 'Crítica' || t.prioridad === 'Critica' ? 'CRITICA' : (t.prioridad || 'MEDIA')).toUpperCase();

  if (slaMap && slaMap.has(`${tipoItil}_${pNorm}`)) {
    return slaMap.get(`${tipoItil}_${pNorm}`)!;
  }

  // Fallbacks de emergencia si no existiera en el mapa de BD
  if (tipoItil === 'INCIDENCIA') {
    return pNorm === 'CRITICA' ? 2 : pNorm === 'ALTA' ? 4 : pNorm === 'MEDIA' ? 12 : 24;
  }
  return pNorm === 'CRITICA' ? 4 : pNorm === 'ALTA' ? 8 : pNorm === 'MEDIA' ? 24 : 48;
};

/**
 * Obtiene el tiempo de SLA en horas para un tipo ITIL y nivel de prioridad específico
 */
export const getSlaHoras = async (
  tipo_itil: 'SOLICITUD' | 'INCIDENCIA',
  prioridad: string
): Promise<number> => {
  const normPrioridad = prioridad === 'Crítica' ? 'Critica' : prioridad;

  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT tiempo_horas FROM configuracion_sla WHERE tipo_itil = ? AND prioridad = ? LIMIT 1',
    [tipo_itil, normPrioridad]
  );

  if (rows.length > 0 && rows[0].tiempo_horas > 0) {
    return Number(rows[0].tiempo_horas);
  }

  // Fallbacks por defecto si no estuviera en BD
  if (tipo_itil === 'INCIDENCIA') {
    return normPrioridad === 'Critica' ? 2 : normPrioridad === 'Alta' ? 4 : normPrioridad === 'Media' ? 12 : 24;
  }
  return normPrioridad === 'Critica' ? 4 : normPrioridad === 'Alta' ? 8 : normPrioridad === 'Media' ? 24 : 48;
};

export interface SlaCalculadoResultado {
  slaHoras: number;
  slaEstadoStr: string;
  esCumplido: boolean;
  esExentoN3?: boolean;
  horasNetas: number;
  pausaHoras: number;
  pasoPorN3: boolean;
}

/**
 * Calcula el tiempo total acumulado de pausa en N3/Proveedor/Administración
 * considerando tanto el campo sla_acumulado_pausa_segundos, sla_paused_at
 * y la reconstrucción histórica desde la bitácora dinámica del ticket.
 */
export const calcularPausaTotalTicketHoras = (ticket: any): { pausaHoras: number; pasoPorN3: boolean } => {
  let pausaSegundos = Number(ticket.sla_acumulado_pausa_segundos) || 0;
  let pasoPorN3 = Boolean(
    ticket.nivel_soporte === 'N3' ||
    ticket.estado === 'Elevado a Proveedor' ||
    ticket.estado === 'Escalado a Proveedor' ||
    ticket.estado === 'Elevado a Administración'
  );

  // Si tiene fecha de inicio de pausa activa (sla_paused_at)
  if (ticket.sla_paused_at) {
    pasoPorN3 = true;
    const pausaStart = new Date(ticket.sla_paused_at).getTime();
    const esFinalizado = ticket.estado === 'Cerrado' || ticket.estado === 'Resuelto' || ticket.estado === 'Finalizada';
    const pausaEnd = esFinalizado && ticket.updated_at ? new Date(ticket.updated_at).getTime() : Date.now();
    if (pausaEnd > pausaStart) {
      pausaSegundos += Math.floor((pausaEnd - pausaStart) / 1000);
    }
  }

  // Reconstrucción desde bitácora para detectar períodos históricos en Proveedor/N3
  let bitacoraArr: any[] = [];
  try {
    const raw = ticket.bitacora_dinamica || ticket.bitacora_raw;
    if (typeof raw === 'string') {
      bitacoraArr = JSON.parse(raw);
    } else if (Array.isArray(raw)) {
      bitacoraArr = raw;
    }
  } catch (_) {}

  if (Array.isArray(bitacoraArr) && bitacoraArr.length > 0) {
    let bitacoraPausaMs = 0;
    let inN3 = false;
    let n3StartTime = 0;

    for (const b of bitacoraArr) {
      const act = ((b.accion || b.detalle || '') + ' ' + (b.notas || '')).toLowerCase();
      const fechaMs = b.fecha ? new Date(b.fecha).getTime() : 0;
      if (!fechaMs) continue;

      const esSalidaN3 = act.includes('a "finalizada"') || 
                         act.includes('a "resuelto"') || 
                         act.includes('a "cerrado"') || 
                         act.includes('cambiado de "escalado a proveedor"') ||
                         act.includes('cambiado de "elevado a proveedor"') ||
                         act.includes('ticket escalado a nivel 2') ||
                         act.includes('ticket escalado a nivel 1') ||
                         act.includes('resuelto') ||
                         act.includes('cerrado');

      const esEntradaN3 = !esSalidaN3 && (
        act.includes('elevado a proveedor') || 
        act.includes('escalado a proveedor') || 
        act.includes('(n3)') || 
        act.includes('elevado a administración') || 
        act.includes('sla pausado') ||
        act.includes('a "elevado a proveedor"') ||
        act.includes('a "escalado a proveedor"')
      );

      if (!inN3 && esEntradaN3) {
        inN3 = true;
        pasoPorN3 = true;
        n3StartTime = fechaMs;
      } else if (inN3 && (esSalidaN3 || !esEntradaN3)) {
        bitacoraPausaMs += Math.max(0, fechaMs - n3StartTime);
        inN3 = false;
        n3StartTime = 0;
      }
    }

    if (inN3 && n3StartTime > 0) {
      const esFinalizado = ticket.estado === 'Cerrado' || ticket.estado === 'Resuelto' || ticket.estado === 'Finalizada';
      const endMs = esFinalizado && ticket.updated_at ? new Date(ticket.updated_at).getTime() : Date.now();
      bitacoraPausaMs += Math.max(0, endMs - n3StartTime);
    }

    const bitacoraPausaSegundos = Math.floor(bitacoraPausaMs / 1000);
    if (bitacoraPausaSegundos > pausaSegundos) {
      pausaSegundos = bitacoraPausaSegundos;
    }
  }

  return {
    pausaHoras: Math.max(0, pausaSegundos / 3600),
    pasoPorN3
  };
};

/**
 * Calcula de manera integral el SLA de un ticket, descontando el tiempo en N3/Proveedor
 */
export const calcularSlaTicket = (
  t: any,
  slaMap?: Map<string, number>
): SlaCalculadoResultado => {
  const esActualmenteN3 = t.nivel_soporte === 'N3' || 
                          t.estado === 'Elevado a Proveedor' || 
                          t.estado === 'Escalado a Proveedor' || 
                          t.estado === 'Elevado a Administración';

  if (esActualmenteN3) {
    return {
      slaHoras: 0,
      slaEstadoStr: 'Escalado N3 (Sin SLA)',
      esCumplido: true,
      esExentoN3: true,
      horasNetas: 0,
      pausaHoras: 0,
      pasoPorN3: true
    };
  }

  const slaHoras = resolverSlaHorasTicket(t, slaMap);
  const createdDate = new Date(t.created_at).getTime();
  const esFinalizado = t.estado === 'Cerrado' || t.estado === 'Resuelto' || t.estado === 'Finalizada';
  const endDate = esFinalizado && t.updated_at ? new Date(t.updated_at).getTime() : Date.now();

  const { pausaHoras, pasoPorN3 } = calcularPausaTotalTicketHoras(t);
  const diffHours = Math.max(0, (endDate - createdDate) / (1000 * 60 * 60) - pausaHoras);

  let slaEstadoStr = 'En Tiempo';
  let esCumplido = true;

  if (esFinalizado) {
    if (diffHours > slaHoras) {
      slaEstadoStr = 'Vencido en Cierre';
      esCumplido = false;
    } else {
      slaEstadoStr = 'Cumplido';
      esCumplido = true;
    }
  } else {
    if (diffHours > slaHoras) {
      slaEstadoStr = 'SLA Vencido';
      esCumplido = false;
    } else if (diffHours > slaHoras * 0.75) {
      slaEstadoStr = 'En Riesgo';
      esCumplido = true;
    } else {
      slaEstadoStr = 'En Tiempo';
      esCumplido = true;
    }
  }

  return {
    slaHoras,
    slaEstadoStr,
    esCumplido,
    horasNetas: Math.round(diffHours * 10) / 10,
    pausaHoras: Math.round(pausaHoras * 10) / 10,
    pasoPorN3
  };
};

