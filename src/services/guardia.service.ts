import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getGuardias = async (skip = 0, limit = 100) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT g.*, u.nombre_completo as tecnico_nombre FROM guardia_feriado g
     JOIN usuario u ON g.tecnico_id = u.id
     LIMIT ? OFFSET ?`,
    [limit, skip]
  );
  return rows;
};

export const createGuardia = async (data: { fecha: string; tecnico_id: number; observaciones?: string }) => {
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM guardia_feriado WHERE fecha = ?`, [data.fecha]
  );
  if (existing.length > 0) {
    await pool.query(
      `UPDATE guardia_feriado SET tecnico_id = ?, observaciones = ? WHERE fecha = ?`,
      [data.tecnico_id, data.observaciones || null, data.fecha]
    );
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM guardia_feriado WHERE fecha = ?`, [data.fecha]);
    return rows[0];
  }
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO guardia_feriado (fecha, tecnico_id, observaciones) VALUES (?, ?, ?)`,
    [data.fecha, data.tecnico_id, data.observaciones || null]
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
