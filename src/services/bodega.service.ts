import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getBodegas = async (empresaIds?: number[]) => {
  let query = `
    SELECT b.*, e.nombre as empresa_nombre 
    FROM bodega b 
    JOIN empresa e ON b.empresa_id = e.id
  `;
  const params: any[] = [];

  if (empresaIds && empresaIds.length > 0) {
    query += ` WHERE b.empresa_id IN (${empresaIds.map(() => '?').join(',')})`;
    params.push(...empresaIds);
  } else if (empresaIds) {
    query += ` WHERE 1=0`;
  }

  query += ` ORDER BY b.nombre ASC`;
  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows;
};

export const getBodegaById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT b.*, e.nombre as empresa_nombre 
     FROM bodega b 
     JOIN empresa e ON b.empresa_id = e.id 
     WHERE b.id = ?`,
    [id]
  );
  return rows[0] || null;
};

export const createBodega = async (data: { nombre: string; empresa_id: number; descripcion?: string }) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO bodega (nombre, empresa_id, descripcion) VALUES (?, ?, ?)`,
    [data.nombre, data.empresa_id, data.descripcion || null]
  );
  return getBodegaById(result.insertId);
};

export const updateBodega = async (id: number, data: Partial<{ nombre: string; empresa_id: number; descripcion: string }>) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM bodega WHERE id = ?`, [id]);
  if (existing.length === 0) return null;

  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (sets.length > 0) {
    vals.push(id);
    await pool.query(`UPDATE bodega SET ${sets.join(', ')} WHERE id = ?`, vals);
  }
  return getBodegaById(id);
};

export const deleteBodega = async (id: number) => {
  const existing = await getBodegaById(id);
  if (!existing) return null;
  await pool.query(`DELETE FROM bodega WHERE id = ?`, [id]);
  return existing;
};
