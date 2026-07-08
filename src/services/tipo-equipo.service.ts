import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getTipoEquipos = async () => {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM tipo_equipo ORDER BY nombre ASC');
  return rows;
};

export const createTipoEquipo = async (data: { nombre: string }) => {
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO tipo_equipo (nombre) VALUES (?)',
    [data.nombre]
  );
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM tipo_equipo WHERE id = ?', [result.insertId]);
  return rows[0];
};

export const updateTipoEquipo = async (id: number, data: { nombre: string }) => {
  await pool.query('UPDATE tipo_equipo SET nombre = ? WHERE id = ?', [data.nombre, id]);
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM tipo_equipo WHERE id = ?', [id]);
  return rows[0] || null;
};

export const deleteTipoEquipo = async (id: number) => {
  const [existing] = await pool.query<RowDataPacket[]>('SELECT * FROM tipo_equipo WHERE id = ?', [id]);
  if (existing.length === 0) return null;
  await pool.query('DELETE FROM tipo_equipo WHERE id = ?', [id]);
  return existing[0];
};
