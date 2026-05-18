import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const createProyecto = async (data: { nombre: string; descripcion?: string; fecha_fin_estimada?: string }) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO proyecto (nombre, descripcion, fecha_fin_estimada) VALUES (?, ?, ?)`,
    [data.nombre, data.descripcion || null, data.fecha_fin_estimada || null]
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.*, JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'titulo', t.titulo)) as tareas FROM proyecto p LEFT JOIN tarea_interna t ON t.proyecto_id = p.id WHERE p.id = ? GROUP BY p.id`,
    [result.insertId]
  );
  return rows[0];
};

export const escalarTicketATarea = async (ticketId: number, proyectoId: number, responsableId: number) => {
  const [ticketRows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [ticketId]);
  if (ticketRows.length === 0) return null;
  const ticket = ticketRows[0];

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO tarea_interna (titulo, descripcion, estado, proyecto_id, ticket_origen_id, responsable_id)
     VALUES (?, ?, 'Pendiente', ?, ?, ?)`,
    [`ESC: ${ticket.titulo}`, ticket.descripcion, proyectoId, ticketId, responsableId]
  );
  await pool.query(`UPDATE ticket SET estado = 'En Proceso', updated_at = NOW() WHERE id = ?`, [ticketId]);

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM tarea_interna WHERE id = ?`, [result.insertId]);
  return rows[0];
};
