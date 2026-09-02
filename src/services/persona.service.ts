import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getPersonas = async (skip = 0, limit = 1000, search = '') => {
  let query = `SELECT p.*, e.nombre as empresa_nombre FROM persona p LEFT JOIN empresa e ON p.empresa_id = e.id`;
  const params: any[] = [];
  if (search) {
    query += ` WHERE p.nombre LIKE ? OR p.cedula LIKE ? OR p.departamento LIKE ? OR p.cargo LIKE ? OR e.nombre LIKE ?`;
    const searchWildcard = `%${search}%`;
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }
  query += ` ORDER BY p.nombre ASC LIMIT ? OFFSET ?`;
  params.push(limit, skip);

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows;
};

export const getPersonasPaginated = async (page = 1, limit = 10, search = '') => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (search) {
    const searchWildcard = `%${search}%`;
    whereClauses.push(`(p.nombre LIKE ? OR p.cedula LIKE ? OR p.departamento LIKE ? OR p.cargo LIKE ? OR e.nombre LIKE ?)`);
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*) as count 
    FROM persona p 
    LEFT JOIN empresa e ON p.empresa_id = e.id
    ${whereStr}
  `;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  const dataQuery = `
    SELECT p.*, e.nombre as empresa_nombre 
    FROM persona p 
    LEFT JOIN empresa e ON p.empresa_id = e.id
    ${whereStr}
    ORDER BY p.nombre ASC
    LIMIT ? OFFSET ?
  `;
  const [dataRows] = await pool.query<RowDataPacket[]>(dataQuery, [...params, limit, skip]);

  return {
    total,
    page,
    limit,
    data: dataRows
  };
};

export const getPersonaByCedula = async (cedula: string) => {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM persona WHERE cedula = ?`, [cedula]);
  return rows[0] || null;
};

export const createPersona = async (data: {
  cedula: string; nombre: string; telefono?: string;
  departamento?: string; cargo?: string; empresa_id: number;
}) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO persona (cedula, nombre, telefono, departamento, cargo, empresa_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.cedula, data.nombre, data.telefono || null, data.departamento || null, data.cargo || null, data.empresa_id]
  );
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM persona WHERE id = ?`, [result.insertId]);
  return rows[0];
};

export const updatePersona = async (personaId: number, data: Partial<{
  cedula: string; nombre: string; telefono: string;
  departamento: string; cargo: string; empresa_id: number;
}>) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM persona WHERE id = ?`, [personaId]);
  if (existing.length === 0) return null;
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length > 0) {
    vals.push(personaId);
    await pool.query(`UPDATE persona SET ${sets.join(', ')} WHERE id = ?`, vals);
  }
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM persona WHERE id = ?`, [personaId]);
  return rows[0];
};
