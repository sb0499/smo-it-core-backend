import nodemailer from 'nodemailer';
import { config } from '../core/config';
import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const transporter = nodemailer.createTransport({
  host: config.MAIL_HOST,
  port: config.MAIL_PORT,
  secure: config.MAIL_PORT === 465 || config.MAIL_SECURE,
  auth: {
    user: config.MAIL_USER,
    pass: config.MAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

export const enviarCorreo = async (emailTo: string, subject: string, body: string): Promise<void> => {
  if (!config.MAIL_HOST || !config.MAIL_USER || !config.MAIL_PASSWORD || config.MAIL_PASSWORD === 'password_falso_123') {
    console.log(`DEBUG: Simulación envío correo a ${emailTo}. Asunto: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: config.MAIL_USER,
      to: emailTo,
      subject,
      text: body
    });
  } catch (e) {
    console.error(`Error enviando correo: ${e}`);
  }
};

// In-app Notifications
export const crearNotificacion = async (usuarioId: number, titulo: string, mensaje: string): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO notificacion (usuario_id, titulo, mensaje) VALUES (?, ?, ?)`,
      [usuarioId, titulo, mensaje]
    );
  } catch (e) {
    console.error(`Error al crear notificación interna para usuario ID ${usuarioId}:`, e);
  }
};

export const getNotificaciones = async (usuarioId: number): Promise<any[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM notificacion 
     WHERE usuario_id = ? 
     ORDER BY created_at DESC 
     LIMIT 50`,
    [usuarioId]
  );
  return rows;
};

export const marcarLeida = async (notificacionId: number, usuarioId: number): Promise<boolean> => {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE notificacion 
     SET leido = TRUE 
     WHERE id = ? AND usuario_id = ?`,
    [notificacionId, usuarioId]
  );
  return result.affectedRows > 0;
};

export const marcarTodasLeidas = async (usuarioId: number): Promise<void> => {
  await pool.query(
    `UPDATE notificacion 
     SET leido = TRUE 
     WHERE usuario_id = ?`,
    [usuarioId]
  );
};
