import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getPlantillas = async () => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM plantilla_recurrente ORDER BY id DESC`
  );
  return rows;
};

export const getPlantillasActivas = async () => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM plantilla_recurrente WHERE is_active = 1 ORDER BY id DESC`
  );
  return rows;
};

export const createPlantilla = async (data: {
  titulo: string;
  descripcion: string;
  categoria: string;
  empresa?: string;
  area_solicitante?: string;
  is_active?: boolean;
}) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO plantilla_recurrente (titulo, descripcion, categoria, empresa, area_solicitante, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.titulo, data.descripcion, data.categoria, data.empresa || null,
     data.area_solicitante || null, data.is_active !== undefined ? data.is_active : true]
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM plantilla_recurrente WHERE id = ?`, [result.insertId]
  );
  return rows[0];
};

export const updatePlantilla = async (plantillaId: number, data: Partial<{
  titulo: string; descripcion: string; categoria: string;
  empresa: string; area_solicitante: string; is_active: boolean;
}>) => {
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM plantilla_recurrente WHERE id = ?`, [plantillaId]
  );
  if (existing.length === 0) return null;

  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length > 0) {
    vals.push(plantillaId);
    await pool.query(`UPDATE plantilla_recurrente SET ${sets.join(', ')} WHERE id = ?`, vals);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM plantilla_recurrente WHERE id = ?`, [plantillaId]
  );
  return rows[0];
};

export const deletePlantilla = async (plantillaId: number) => {
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM plantilla_recurrente WHERE id = ?`, [plantillaId]
  );
  if (existing.length === 0) return null;
  await pool.query(`DELETE FROM plantilla_recurrente WHERE id = ?`, [plantillaId]);
  return existing[0];
};
