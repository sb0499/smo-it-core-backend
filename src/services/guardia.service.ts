import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { crearNotificacion, enviarCorreo } from './notificacion.service';

export const notificarTurnoConsolidado = async (
  tecnicoId: number,
  fechas: string[],
  observaciones?: string,
  empresaIds?: (number | null)[]
) => {
  try {
    const [uRows] = await pool.query<RowDataPacket[]>(
      `SELECT email, nombre_completo FROM usuario WHERE id = ?`,
      [tecnicoId]
    );
    if (uRows.length === 0) return;
    const u = uRows[0];

    // Formatear Sedes
    let sedesTexto = 'Todas las Sedes (Global)';
    const idsValidos = (empresaIds || []).filter((id): id is number => id !== null && id !== undefined && id > 0);
    if (idsValidos.length > 0) {
      const [eRows] = await pool.query<RowDataPacket[]>(
        `SELECT nombre FROM empresa WHERE id IN (?)`,
        [idsValidos]
      );
      if (eRows.length > 0) {
        sedesTexto = eRows.map((e: any) => e.nombre).join(', ');
      }
    }

    // Formatear Fechas sin desfase de zona horaria
    const fechasFormateadas = fechas.map(f => {
      const cleanDate = f.split('T')[0];
      const parts = cleanDate.split('-').map(Number);
      if (parts.length === 3) {
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        return d.toLocaleDateString('es-EC', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        });
      }
      return f;
    });

    let fechasTexto = '';
    if (fechasFormateadas.length === 1) {
      fechasTexto = fechasFormateadas[0];
    } else if (fechasFormateadas.length === 2) {
      fechasTexto = `${fechasFormateadas[0]} y ${fechasFormateadas[1]}`;
    } else {
      fechasTexto = fechasFormateadas.join(', ');
    }

    const esFinDeSemana = fechas.length > 1;
    const titulo = `Turno de Guardia Asignado (${esFinDeSemana ? 'Fin de Semana' : 'Feriado'})`;
    const mensaje = `Te han asignado un turno de guardia para: ${fechasTexto}.\n\nSede(s) asignada(s): ${sedesTexto}.\nObservaciones: ${observaciones || 'Sin observaciones'}.`;

    await crearNotificacion(tecnicoId, titulo, mensaje).catch(console.error);
    if (u.email) {
      await enviarCorreo(
        u.email,
        titulo,
        `Hola ${u.nombre_completo},\n\n${mensaje}\n\nPor favor mantente atento a las solicitudes y requerimientos durante tu turno de guardia.\n\nSaludos,\nSistema TISMO`
      ).catch(console.error);
    }
  } catch (err) {
    console.error('Error enviando notificación consolidada de guardia:', err);
  }
};

export const getGuardias = async (page?: number, limit?: number) => {
  if (page !== undefined && limit !== undefined) {
    const skip = (page - 1) * limit;

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM guardia_feriado`
    );
    const total = countRows[0]?.count || 0;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT g.*, u.nombre_completo as tecnico_nombre, e.nombre as empresa_nombre FROM guardia_feriado g
       JOIN usuario u ON g.tecnico_id = u.id
       LEFT JOIN empresa e ON g.empresa_id = e.id
       ORDER BY g.fecha DESC
       LIMIT ? OFFSET ?`,
      [limit, skip]
    );

    return {
      total,
      page,
      limit,
      data: rows
    };
  } else {
    // Non-paginated query
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT g.*, u.nombre_completo as tecnico_nombre, e.nombre as empresa_nombre FROM guardia_feriado g
       JOIN usuario u ON g.tecnico_id = u.id
       LEFT JOIN empresa e ON g.empresa_id = e.id
       ORDER BY g.fecha DESC`
    );
    return rows;
  }
};

export const programarTurnoGuardia = async (data: {
  fechas: string[];
  tecnico_id: number;
  observaciones?: string;
  empresa_ids?: (number | null)[];
}) => {
  const targetEmpresas = (data.empresa_ids && data.empresa_ids.length > 0)
    ? data.empresa_ids.map(id => (id && id > 0 ? id : null))
    : [null];

  const uniqueEmpresas = Array.from(new Set(targetEmpresas));

  for (const fecha of data.fechas) {
    for (const empId of uniqueEmpresas) {
      const [existing] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM guardia_feriado WHERE fecha = ? AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))`, 
        [fecha, empId, empId]
      );
      if (existing.length > 0) {
        await pool.query(
          `UPDATE guardia_feriado SET tecnico_id = ?, observaciones = ? WHERE fecha = ? AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))`,
          [data.tecnico_id, data.observaciones || null, fecha, empId, empId]
        );
      } else {
        await pool.query(
          `INSERT INTO guardia_feriado (fecha, tecnico_id, observaciones, empresa_id) VALUES (?, ?, ?, ?)`,
          [fecha, data.tecnico_id, data.observaciones || null, empId]
        );
      }
    }
  }

  // Disparar 1 sola notificación consolidada por todo el turno
  await notificarTurnoConsolidado(data.tecnico_id, data.fechas, data.observaciones, uniqueEmpresas);

  return { message: 'Turno de guardia programado correctamente' };
};

export const createGuardia = async (data: { fecha: string; tecnico_id: number; observaciones?: string; empresa_id?: number }) => {
  return programarTurnoGuardia({
    fechas: [data.fecha],
    tecnico_id: data.tecnico_id,
    observaciones: data.observaciones,
    empresa_ids: [data.empresa_id || null]
  });
};

export const deleteGuardia = async (guardiaId: number) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM guardia_feriado WHERE id = ?`, [guardiaId]);
  if (existing.length === 0) return null;
  await pool.query(`DELETE FROM guardia_feriado WHERE id = ?`, [guardiaId]);
  return existing[0];
};
