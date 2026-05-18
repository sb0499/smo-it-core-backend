import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getProveedores = async () => {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM proveedor ORDER BY nombre ASC`);
  return rows;
};

export const getProveedorById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM proveedor WHERE id = ?`, [id]);
  return rows[0] || null;
};

export const createProveedor = async (data: { nombre: string; contacto?: string; telefono?: string; email?: string }) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO proveedor (nombre, contacto, telefono, email) VALUES (?, ?, ?, ?)`,
    [data.nombre, data.contacto || null, data.telefono || null, data.email || null]
  );
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM proveedor WHERE id = ?`, [result.insertId]);
  return rows[0];
};

export const updateProveedor = async (id: number, data: Partial<{ nombre: string; contacto: string; telefono: string; email: string }>) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM proveedor WHERE id = ?`, [id]);
  if (existing.length === 0) return null;

  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length > 0) {
    vals.push(id);
    await pool.query(`UPDATE proveedor SET ${sets.join(', ')} WHERE id = ?`, vals);
  }
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM proveedor WHERE id = ?`, [id]);
  return rows[0];
};

export const deleteProveedor = async (id: number) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM proveedor WHERE id = ?`, [id]);
  if (existing.length === 0) return null;
  await pool.query(`DELETE FROM proveedor WHERE id = ?`, [id]);
  return existing[0];
};
