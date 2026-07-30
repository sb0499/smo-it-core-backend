import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getConsumibles = async (page = 1, limit = 10, search = '', empresaIds?: number[], criticalOnly = false) => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (search) {
    whereClauses.push('(nombre LIKE ? OR descripcion LIKE ?)');
    const searchWildcard = `%${search}%`;
    params.push(searchWildcard, searchWildcard);
  }

  if (criticalOnly) {
    whereClauses.push('stock_actual <= stock_minimo');
  }

  // Enforce Sede filters for N1 technicians
  if (empresaIds && empresaIds.length > 0) {
    const [empRows] = await pool.query<RowDataPacket[]>(
      `SELECT nombre FROM empresa WHERE id IN (${empresaIds.map(() => '?').join(',')})`,
      empresaIds
    );
    const assignedNames = empRows.map(r => r.nombre.trim());
    if (assignedNames.length > 0) {
      const SedeClauses = assignedNames.map(() => 'descripcion LIKE ?');
      whereClauses.push(`(${SedeClauses.join(' OR ')})`);
      for (const name of assignedNames) {
        params.push(`%Sede: ${name}%`);
      }
    } else {
      whereClauses.push('1=0');
    }
  } else if (empresaIds) {
    whereClauses.push('1=0');
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total count
  const countQuery = `SELECT COUNT(*) as count FROM consumible ${whereStr}`;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  // Get paginated data
  const selectQuery = `SELECT * FROM consumible ${whereStr} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const selectParams = [...params, limit, skip];
  const [dataRows] = await pool.query<RowDataPacket[]>(selectQuery, selectParams);

  return {
    total,
    page,
    limit,
    data: dataRows
  };
};

export const createConsumible = async (data: { nombre: string; descripcion?: string; unidad_medida: string; stock_actual: number; stock_minimo?: number }) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO consumible (nombre, descripcion, unidad_medida, stock_actual, stock_minimo) VALUES (?, ?, ?, ?, ?)`,
    [data.nombre, data.descripcion || null, data.unidad_medida, data.stock_actual, data.stock_minimo ?? 0]
  );
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM consumible WHERE id = ?`, [result.insertId]);
  return rows[0];
};

export const ajustarStock = async (consumibleId: number, cantidad: number) => {
  await pool.query(`UPDATE consumible SET stock_actual = stock_actual + ? WHERE id = ?`, [cantidad, consumibleId]);
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM consumible WHERE id = ?`, [consumibleId]);
  return rows[0] || null;
};
