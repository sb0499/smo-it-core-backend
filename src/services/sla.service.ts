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
 * Resuelve las horas de SLA de un ticket basándose prioritariamente en la configuración de la BD (configuracion_sla)
 */
export const resolverSlaHorasTicket = (
  t: { sla_horas?: number | null; nivel_soporte?: string | null; grupo_n2?: string | null; prioridad?: string | null },
  slaMap?: Map<string, number>
): number => {
  const esIncidencia = (t.nivel_soporte && t.nivel_soporte !== 'N1') || Boolean(t.grupo_n2);
  const tipoItil = esIncidencia ? 'INCIDENCIA' : 'SOLICITUD';
  const pNorm = (t.prioridad === 'Crítica' || t.prioridad === 'Critica' ? 'CRITICA' : (t.prioridad || 'MEDIA')).toUpperCase();

  // 1. Prioridad: Tomar de la tabla configuracion_sla de BD
  if (slaMap && slaMap.has(`${tipoItil}_${pNorm}`)) {
    const val = slaMap.get(`${tipoItil}_${pNorm}`);
    if (val && Number(val) > 0) {
      return Number(val);
    }
  }

  // 2. Si no estuviera en el mapa, usar t.sla_horas si existe
  if (t.sla_horas && Number(t.sla_horas) > 0) {
    return Number(t.sla_horas);
  }

  // 3. Fallbacks de empresa (48 horas estándar)
  return 48;
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
  const raw = ticket.bitacora_dinamica || ticket.bitacora_raw || ticket.bitacora;
  
  if (raw) {
    const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const rawLower = rawStr.toLowerCase();
    
    // Si la cadena contiene menciones de proveedor / N3 / pausa
    if (
      rawLower.includes('proveedor') || 
      rawLower.includes('n3') || 
      rawLower.includes('administración') || 
      rawLower.includes('administracion') || 
      rawLower.includes('sla pausado')
    ) {
      pasoPorN3 = true;
    }

    try {
      let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (Array.isArray(parsed)) bitacoraArr = parsed;
    } catch (_) {}
  }

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
 * Obtiene la fecha y hora exacta en que el ticket fue resuelto/finalizado,
 * extrayéndola de la bitácora dinámica para evitar que actualizaciones posteriores
 * en el campo updated_at de la base de datos aumenten falsamente el tiempo de cierre.
 */
export const obtenerFechaResolucionTicket = (ticket: any): number => {
  let bitacoraArr: any[] = [];
  const raw = ticket.bitacora_dinamica || ticket.bitacora_raw || ticket.bitacora;
  if (raw) {
    try {
      let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (Array.isArray(parsed)) bitacoraArr = parsed;
    } catch (_) {}
  }

  if (Array.isArray(bitacoraArr) && bitacoraArr.length > 0) {
    // 1. Encontrar el índice de la última reapertura (si existió)
    let lastReaperturaIdx = 0;
    for (let i = bitacoraArr.length - 1; i >= 0; i--) {
      const act = ((bitacoraArr[i].accion || bitacoraArr[i].detalle || '') + ' ' + (bitacoraArr[i].notas || '')).toLowerCase();
      if (act.includes('reabiert') || act.includes('reapertura')) {
        lastReaperturaIdx = i;
        break;
      }
    }

    // 2. Buscar primero si hubo un evento explícito de "Resuelto" / solución técnica después de la reapertura
    for (let i = lastReaperturaIdx; i < bitacoraArr.length; i++) {
      const b = bitacoraArr[i];
      const act = ((b.accion || b.detalle || '') + ' ' + (b.notas || '')).toLowerCase();
      if (act.includes('resuelto') || act.includes('solucionado')) {
        if (b.fecha) {
          const t = new Date(b.fecha).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
      }
    }

    // 3. Si no hubo estado "Resuelto" explícito previo, buscar evento de "Cerrado" / "Finalizada"
    for (let i = lastReaperturaIdx; i < bitacoraArr.length; i++) {
      const b = bitacoraArr[i];
      const act = ((b.accion || b.detalle || '') + ' ' + (b.notas || '')).toLowerCase();
      if (act.includes('cerrado') || act.includes('finalizada')) {
        if (b.fecha) {
          const t = new Date(b.fecha).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
      }
    }

    // 4. Fallback: último registro con fecha en la bitácora
    for (let i = bitacoraArr.length - 1; i >= 0; i--) {
      const b = bitacoraArr[i];
      if (b.fecha) {
        const t = new Date(b.fecha).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
    }
  }

  if (ticket.updated_at) {
    const t = new Date(ticket.updated_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  return Date.now();
};

/**
 * Calcula de manera integral el SLA de un ticket, garantizando que los tiempos
 * vengan de la tabla configuracion_sla y que los tickets con paso por N3/Proveedor
 * queden debidamente cumplidos o exentos sin castigar a los técnicos.
 */
export const calcularSlaTicket = (
  t: any,
  slaMap?: Map<string, number>
): SlaCalculadoResultado => {
  const { pausaHoras, pasoPorN3 } = calcularPausaTotalTicketHoras(t);

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
      pausaHoras,
      pasoPorN3: true
    };
  }

  const slaHoras = resolverSlaHorasTicket(t, slaMap);
  const createdDate = new Date(t.created_at).getTime();
  const esFinalizado = t.estado === 'Cerrado' || t.estado === 'Resuelto' || t.estado === 'Finalizada';
  const endDate = esFinalizado ? obtenerFechaResolucionTicket(t) : Date.now();

  const diffHours = Math.max(0, (endDate - createdDate) / (1000 * 60 * 60) - pausaHoras);

  let slaEstadoStr = 'En Tiempo';
  let esCumplido = true;

  if (esFinalizado) {
    // Si el ticket pasó por N3 (Proveedor) o si las horas netas están dentro del SLA de BD
    if (pasoPorN3 || diffHours <= slaHoras) {
      slaEstadoStr = 'Cumplido';
      esCumplido = true;
    } else {
      slaEstadoStr = 'Vencido en Cierre';
      esCumplido = false;
    }
  } else {
    // Ticket abierto
    if (pasoPorN3) {
      slaEstadoStr = 'En Tiempo';
      esCumplido = true;
    } else if (diffHours > slaHoras) {
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

