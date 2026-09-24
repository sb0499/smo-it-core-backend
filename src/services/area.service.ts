import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface Area {
  id: number;
  nombre: string;
  descripcion?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export const getAreas = async (params?: {
  search?: string;
  page?: number;
  limit?: number;
  onlyActive?: boolean;
}): Promise<{ data: Area[]; total: number; page: number; totalPages: number }> => {
  const page = Math.max(1, Number(params?.page) || 1);
  const limit = Math.max(1, Number(params?.limit) || 10);
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM area WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as total FROM area WHERE 1=1';
  const queryParams: any[] = [];
  const countParams: any[] = [];

  if (params?.onlyActive) {
    query += ' AND is_active = 1';
    countQuery += ' AND is_active = 1';
  }

  if (params?.search && params.search.trim() !== '') {
    const term = `%${params.search.trim()}%`;
    query += ' AND (nombre LIKE ? OR descripcion LIKE ?)';
    countQuery += ' AND (nombre LIKE ? OR descripcion LIKE ?)';
    queryParams.push(term, term);
    countParams.push(term, term);
  }

  // Si no se pide paginación explícita (ej. limit >= 1000) o para combos
  if (params?.limit && params.limit >= 1000) {
    query += ' ORDER BY nombre ASC';
    const [rows] = await pool.query<RowDataPacket[]>(query, queryParams);
    return {
      data: rows as Area[],
      total: rows.length,
      page: 1,
      totalPages: 1
    };
  }

  query += ' ORDER BY nombre ASC LIMIT ? OFFSET ?';
  queryParams.push(limit, offset);

  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, countParams);
  const total = countRows[0]?.total || 0;

  const [rows] = await pool.query<RowDataPacket[]>(query, queryParams);

  return {
    data: rows as Area[],
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1
  };
};

export const getAreaById = async (id: number): Promise<Area | null> => {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM area WHERE id = ?', [id]);
  return (rows[0] as Area) || null;
};

export const createArea = async (data: {
  nombre: string;
  descripcion?: string;
  is_active?: boolean;
}): Promise<Area> => {
  const cleanNombre = data.nombre.trim();
  if (!cleanNombre) {
    throw new Error('El nombre del área es requerido');
  }

  const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM area WHERE LOWER(nombre) = LOWER(?)', [cleanNombre]);
  if (existing.length > 0) {
    throw new Error(`El área "${cleanNombre}" ya existe en el sistema`);
  }

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO area (nombre, descripcion, is_active) VALUES (?, ?, ?)',
    [cleanNombre, data.descripcion?.trim() || null, data.is_active ?? true]
  );

  const created = await getAreaById(result.insertId);
  return created!;
};

export const updateArea = async (
  id: number,
  data: {
    nombre?: string;
    descripcion?: string;
    is_active?: boolean;
  }
): Promise<Area> => {
  const sets: string[] = [];
  const vals: any[] = [];

  if (data.nombre !== undefined) {
    const cleanNombre = data.nombre.trim();
    if (!cleanNombre) throw new Error('El nombre no puede estar vacío');
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM area WHERE LOWER(nombre) = LOWER(?) AND id != ?',
      [cleanNombre, id]
    );
    if (existing.length > 0) {
      throw new Error(`Ya existe otra área registrada con el nombre "${cleanNombre}"`);
    }
    sets.push('nombre = ?');
    vals.push(cleanNombre);
  }

  if (data.descripcion !== undefined) {
    sets.push('descripcion = ?');
    vals.push(data.descripcion?.trim() || null);
  }

  if (data.is_active !== undefined) {
    sets.push('is_active = ?');
    vals.push(data.is_active ? 1 : 0);
  }

  if (sets.length > 0) {
    vals.push(id);
    await pool.query(`UPDATE area SET ${sets.join(', ')} WHERE id = ?`, vals);
  }

  const updated = await getAreaById(id);
  if (!updated) throw new Error('Área no encontrada');
  return updated;
};

export const deleteArea = async (id: number): Promise<boolean> => {
  const [result] = await pool.query<ResultSetHeader>('DELETE FROM area WHERE id = ?', [id]);
  return result.affectedRows > 0;
};
