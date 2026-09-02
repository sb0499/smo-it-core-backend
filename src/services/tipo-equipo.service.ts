import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const generateUniqueAbbreviation = async (nombre: string): Promise<string> => {
  const clean = nombre
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, ""); 

  let base = clean.substring(0, 3);
  if (base.length < 3) {
    base = (base + 'ZZZ').substring(0, 3);
  }

  let attempt = base;
  let counter = 1;
  while (true) {
    const [existing] = await pool.query<any[]>(
      'SELECT id FROM tipo_equipo WHERE abreviacion = ?',
      [attempt]
    );
    if (existing.length === 0) {
      return attempt;
    }
    if (counter === 1 && clean.length >= 4) {
      attempt = clean.substring(0, 4);
    } else if (counter === 2 && clean.length >= 5) {
      attempt = clean.substring(0, 5);
    } else {
      attempt = `${base.substring(0, 2)}${counter}`;
    }
    counter++;
  }
};

export const getTipoEquipos = async (page?: number, limit?: number, search = '') => {
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (search) {
    whereClauses.push('(nombre LIKE ? OR abreviacion LIKE ?)');
    const searchWildcard = `%${search}%`;
    params.push(searchWildcard, searchWildcard);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  if (page && limit) {
    const skip = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) as count FROM tipo_equipo ${whereStr}`;
    const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
    const total = countRows[0]?.count || 0;

    const selectQuery = `SELECT * FROM tipo_equipo ${whereStr} ORDER BY nombre ASC LIMIT ? OFFSET ?`;
    const [rows] = await pool.query<RowDataPacket[]>(selectQuery, [...params, limit, skip]);

    return {
      total,
      page,
      limit,
      data: rows
    };
  } else {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM tipo_equipo ${whereStr} ORDER BY nombre ASC`, params);
    return rows;
  }
};

export const createTipoEquipo = async (data: { nombre: string }) => {
  const abrev = await generateUniqueAbbreviation(data.nombre);
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO tipo_equipo (nombre, abreviacion) VALUES (?, ?)',
    [data.nombre, abrev]
  );
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM tipo_equipo WHERE id = ?', [result.insertId]);
  return rows[0];
};

export const updateTipoEquipo = async (id: number, data: { nombre: string }) => {
  const [existing] = await pool.query<RowDataPacket[]>('SELECT * FROM tipo_equipo WHERE id = ?', [id]);
  if (existing.length === 0) return null;
  
  let abrev = existing[0].abreviacion;
  if (existing[0].nombre !== data.nombre) {
    abrev = await generateUniqueAbbreviation(data.nombre);
  }

  await pool.query('UPDATE tipo_equipo SET nombre = ?, abreviacion = ? WHERE id = ?', [data.nombre, abrev, id]);
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM tipo_equipo WHERE id = ?', [id]);
  return rows[0] || null;
};

export const deleteTipoEquipo = async (id: number) => {
  const [existing] = await pool.query<RowDataPacket[]>('SELECT * FROM tipo_equipo WHERE id = ?', [id]);
  if (existing.length === 0) return null;
  await pool.query('DELETE FROM tipo_equipo WHERE id = ?', [id]);
  return existing[0];
};
