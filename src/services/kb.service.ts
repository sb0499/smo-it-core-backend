import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface ArticuloKB {
  id: number;
  titulo: string;
  pasos_solucion: string;
  categoria: string;
  ticket_origen_id?: number | null;
  creador_id?: number | null;
  creador_nombre?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const getArticulosKB = async (search = '', categoria = '', page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (search) {
    whereClauses.push('(bc.titulo LIKE ? OR bc.pasos_solucion LIKE ? OR bc.categoria LIKE ?)');
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard);
  }

  if (categoria && categoria !== 'todas') {
    whereClauses.push('bc.categoria = ?');
    params.push(categoria);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  // Count query
  const countQuery = `SELECT COUNT(*) as count FROM base_conocimiento bc ${whereStr}`;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  // Paginated query
  const selectQuery = `
    SELECT bc.*, u.nombre_completo as creador_nombre, t.titulo as ticket_origen_titulo
    FROM base_conocimiento bc
    LEFT JOIN usuario u ON bc.creador_id = u.id
    LEFT JOIN ticket t ON bc.ticket_origen_id = t.id
    ${whereStr}
    ORDER BY bc.id DESC
    LIMIT ? OFFSET ?
  `;
  const selectParams = [...params, limit, skip];
  const [dataRows] = await pool.query<RowDataPacket[]>(selectQuery, selectParams);

  return {
    total,
    page,
    limit,
    data: dataRows
  };
};

export const getArticuloKBById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT bc.*, u.nombre_completo as creador_nombre, t.titulo as ticket_origen_titulo
     FROM base_conocimiento bc
     LEFT JOIN usuario u ON bc.creador_id = u.id
     LEFT JOIN ticket t ON bc.ticket_origen_id = t.id
     WHERE bc.id = ?`,
    [id]
  );
  return rows[0] || null;
};

export const createArticuloKB = async (data: Omit<ArticuloKB, 'id'>, currentUser?: any) => {
  const creadorId = currentUser?.id || data.creador_id || null;

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO base_conocimiento 
      (titulo, pasos_solucion, categoria, ticket_origen_id, creador_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.titulo,
      data.pasos_solucion,
      data.categoria || 'Sistemas',
      data.ticket_origen_id || null,
      creadorId
    ]
  );

  return getArticuloKBById(result.insertId);
};

export const updateArticuloKB = async (id: number, data: Partial<ArticuloKB>) => {
  const existing = await getArticuloKBById(id);
  if (!existing) return null;

  const sets: string[] = [];
  const vals: any[] = [];

  if (data.titulo !== undefined) {
    sets.push('titulo = ?');
    vals.push(data.titulo);
  }
  if (data.pasos_solucion !== undefined) {
    sets.push('pasos_solucion = ?');
    vals.push(data.pasos_solucion);
  }
  if (data.categoria !== undefined) {
    sets.push('categoria = ?');
    vals.push(data.categoria);
  }
  if (data.ticket_origen_id !== undefined) {
    sets.push('ticket_origen_id = ?');
    vals.push(data.ticket_origen_id);
  }

  if (sets.length > 0) {
    vals.push(id);
    await pool.query(`UPDATE base_conocimiento SET ${sets.join(', ')} WHERE id = ?`, vals);
  }

  return getArticuloKBById(id);
};

export const deleteArticuloKB = async (id: number) => {
  const existing = await getArticuloKBById(id);
  if (!existing) return null;
  await pool.query(`DELETE FROM base_conocimiento WHERE id = ?`, [id]);
  return existing;
};
