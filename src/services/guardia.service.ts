import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getGuardias = async (skip = 0, limit = 100) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT g.*, u.nombre_completo as tecnico_nombre, e.nombre as empresa_nombre FROM guardia_feriado g
     JOIN usuario u ON g.tecnico_id = u.id
     LEFT JOIN empresa e ON g.empresa_id = e.id
     LIMIT ? OFFSET ?`,
    [limit, skip]
  );
  return rows;
};

export const createGuardia = async (data: { fecha: string; tecnico_id: number; observaciones?: string; empresa_id?: number }) => {
  const empId = data.empresa_id && data.empresa_id > 0 ? data.empresa_id : null;
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM guardia_feriado WHERE fecha = ? AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))`, 
    [data.fecha, empId, empId]
  );
  if (existing.length > 0) {
    await pool.query(
      `UPDATE guardia_feriado SET tecnico_id = ?, observaciones = ? WHERE fecha = ? AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))`,
      [data.tecnico_id, data.observaciones || null, data.fecha, empId, empId]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM guardia_feriado WHERE fecha = ? AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))`, 
      [data.fecha, empId, empId]
    );
    return rows[0];
  }
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO guardia_feriado (fecha, tecnico_id, observaciones, empresa_id) VALUES (?, ?, ?, ?)`,
    [data.fecha, data.tecnico_id, data.observaciones || null, empId]
  );
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM guardia_feriado WHERE id = ?`, [result.insertId]);
  return rows[0];
};

export const deleteGuardia = async (guardiaId: number) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM guardia_feriado WHERE id = ?`, [guardiaId]);
  if (existing.length === 0) return null;
  await pool.query(`DELETE FROM guardia_feriado WHERE id = ?`, [guardiaId]);
  return existing[0];
};
