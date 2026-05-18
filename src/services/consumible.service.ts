import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getConsumibles = async () => {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM consumible`);
  return rows;
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
