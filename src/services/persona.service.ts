import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getPersonas = async (skip = 0, limit = 100) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.*, e.nombre as empresa_nombre FROM persona p JOIN empresa e ON p.empresa_id = e.id LIMIT ? OFFSET ?`,
    [limit, skip]
  );
  return rows;
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
