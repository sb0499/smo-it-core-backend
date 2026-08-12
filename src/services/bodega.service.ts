import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getBodegas = async (empresaIds?: number[], page?: number, limit?: number, search = '') => {
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (empresaIds && empresaIds.length > 0) {
    whereClauses.push(`b.empresa_id IN (${empresaIds.map(() => '?').join(',')})`);
    params.push(...empresaIds);
  } else if (empresaIds) {
    whereClauses.push('1=0');
  }

  if (search) {
    const wildcard = `%${search}%`;
    whereClauses.push(`(b.nombre LIKE ? OR b.descripcion LIKE ? OR e.nombre LIKE ?)`);
    params.push(wildcard, wildcard, wildcard);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  if (page !== undefined && limit !== undefined) {
    const skip = (page - 1) * limit;

    // Count query
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count 
       FROM bodega b 
       JOIN empresa e ON b.empresa_id = e.id
       ${whereStr}`,
      params
    );
    const total = countRows[0]?.count || 0;

    // Data query
    const dataQuery = `
      SELECT b.*, e.nombre as empresa_nombre 
      FROM bodega b 
      JOIN empresa e ON b.empresa_id = e.id
      ${whereStr}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query<RowDataPacket[]>(dataQuery, [...params, limit, skip]);

    return {
      total,
      page,
      limit,
      data: rows
    };
  } else {
    // Non-paginated query (for dropdown lists etc.)
    const query = `
      SELECT b.*, e.nombre as empresa_nombre 
      FROM bodega b 
      JOIN empresa e ON b.empresa_id = e.id
      ${whereStr}
      ORDER BY b.nombre ASC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }
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
