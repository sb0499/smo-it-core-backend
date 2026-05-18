import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const createCanal = async (nombre: string, isPrivate: boolean, creadorId: number) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO chat_canal (nombre, is_private, creador_id) VALUES (?, ?, ?)`,
    [nombre.toLowerCase().replace(/\s+/g, '-'), isPrivate, creadorId]
  );
  
  const canalId = result.insertId;
  // Añadir creador como miembro automático
  await pool.query(`INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (?, ?)`, [canalId, creadorId]);

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM chat_canal WHERE id = ?`, [canalId]);
  return rows[0];
};

export const getCanales = async (usuarioId: number, userRol: string) => {
  const isAdmin = userRol === 'ADMIN';

  // Si es ADMIN, puede ver absolutamente todos los canales
  if (isAdmin) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, u.nombre_completo as creador_nombre,
              (SELECT COUNT(*) FROM chat_canal_miembro m WHERE m.canal_id = c.id) as miembros_count
       FROM chat_canal c
       JOIN usuario u ON c.creador_id = u.id
       ORDER BY c.nombre ASC`
    );
    return rows;
  }

  // De lo contrario, ver todos los canales públicos Y los canales privados donde sea miembro
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT c.*, u.nombre_completo as creador_nombre,
            (SELECT COUNT(*) FROM chat_canal_miembro m WHERE m.canal_id = c.id) as miembros_count
     FROM chat_canal c
     JOIN usuario u ON c.creador_id = u.id
     LEFT JOIN chat_canal_miembro m ON c.id = m.canal_id
     WHERE c.is_private = FALSE OR m.usuario_id = ?
     ORDER BY c.nombre ASC`,
    [usuarioId]
  );
  return rows;
};

export const unirMiembro = async (canalId: number, usuarioId: number) => {
  // Verificar si ya es miembro
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM chat_canal_miembro WHERE canal_id = ? AND usuario_id = ?`,
    [canalId, usuarioId]
  );
  if (existing.length > 0) return true;

  await pool.query(`INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (?, ?)`, [canalId, usuarioId]);
  return true;
};

export const removerMiembro = async (canalId: number, usuarioId: number) => {
  await pool.query(`DELETE FROM chat_canal_miembro WHERE canal_id = ? AND usuario_id = ?`, [canalId, usuarioId]);
  return true;
};

export const getCanalMiembros = async (canalId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.nombre_completo, u.email, r.nombre as rol_nombre
     FROM chat_canal_miembro m
     JOIN usuario u ON m.usuario_id = u.id
     JOIN rol r ON u.rol_id = r.id
     WHERE m.canal_id = ?`,
    [canalId]
  );
  return rows;
};

export const getCanalMensajes = async (canalId: number, usuarioId: number, userRol: string) => {
  // Verificar acceso si es privado y no es ADMIN
  const [canalRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM chat_canal WHERE id = ?`, [canalId]);
  if (canalRow.length === 0) return null;
  const canal = canalRow[0];

  if (canal.is_private && userRol !== 'ADMIN') {
    const [member] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM chat_canal_miembro WHERE canal_id = ? AND usuario_id = ?`,
      [canalId, usuarioId]
    );
    if (member.length === 0) {
      throw new Error('403: No tienes acceso a este canal privado.');
    }
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT m.*, u.nombre_completo as usuario_nombre, u.email as usuario_email
     FROM chat_mensaje m
     JOIN usuario u ON m.usuario_id = u.id
     WHERE m.canal_id = ?
     ORDER BY m.created_at ASC`,
    [canalId]
  );
  return rows;
};

export const addMensaje = async (canalId: number, usuarioId: number, userRol: string, mensaje: string) => {
  const [canalRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM chat_canal WHERE id = ?`, [canalId]);
  if (canalRow.length === 0) return null;
  const canal = canalRow[0];

  if (canal.is_private && userRol !== 'ADMIN') {
    const [member] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM chat_canal_miembro WHERE canal_id = ? AND usuario_id = ?`,
      [canalId, usuarioId]
    );
    if (member.length === 0) {
      throw new Error('403: No tienes acceso a este canal privado para enviar mensajes.');
    }
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO chat_mensaje (canal_id, usuario_id, mensaje) VALUES (?, ?, ?)`,
    [canalId, usuarioId, mensaje]
  );

  const [inserted] = await pool.query<RowDataPacket[]>(
    `SELECT m.*, u.nombre_completo as usuario_nombre, u.email as usuario_email
     FROM chat_mensaje m
     JOIN usuario u ON m.usuario_id = u.id
     WHERE m.id = ?`,
    [result.insertId]
  );
  return inserted[0];
};
