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
