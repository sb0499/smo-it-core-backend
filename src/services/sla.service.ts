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
