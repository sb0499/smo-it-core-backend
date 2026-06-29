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
  // Ver todos los canales públicos Y los canales privados donde sea miembro (aplica igual para ADMIN)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT c.*, u.nombre_completo as creador_nombre,
            (SELECT COUNT(*) FROM chat_canal_miembro m WHERE m.canal_id = c.id) as miembros_count,
            (SELECT u2.nombre_completo 
             FROM chat_canal_miembro m2 
             JOIN usuario u2 ON m2.usuario_id = u2.id 
             WHERE m2.canal_id = c.id AND m2.usuario_id != ? LIMIT 1) as dm_destinatario_nombre
     FROM chat_canal c
     JOIN usuario u ON c.creador_id = u.id
     LEFT JOIN chat_canal_miembro m ON c.id = m.canal_id
     WHERE c.is_private = FALSE OR m.usuario_id = ?
     ORDER BY c.nombre ASC`,
    [usuarioId, usuarioId]
  );
  return rows;
};

export const getOrCreateDMChannel = async (usuarioId1: number, usuarioId2: number) => {
  const name = usuarioId1 < usuarioId2 
    ? `dm-${usuarioId1}-${usuarioId2}` 
    : `dm-${usuarioId2}-${usuarioId1}`;

  // Verificar si ya existe
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM chat_canal WHERE nombre = ? AND is_dm = TRUE`,
    [name]
  );

  if (existing.length > 0) {
    return existing[0];
  }

  // Crear canal privado marcado como DM
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO chat_canal (nombre, is_private, is_dm, creador_id) VALUES (?, TRUE, TRUE, ?)`,
    [name, usuarioId1]
  );

  const canalId = result.insertId;

  // Registrar a ambos usuarios
  await pool.query(`INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (?, ?)`, [canalId, usuarioId1]);
  if (usuarioId1 !== usuarioId2) {
    await pool.query(`INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (?, ?)`, [canalId, usuarioId2]);
  }

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM chat_canal WHERE id = ?`, [canalId]);
  return rows[0];
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

  if (canal.is_private) {
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

export const addMensaje = async (
  canalId: number,
  usuarioId: number,
  userRol: string,
  mensaje: string,
  archivoNombre?: string,
  archivoRuta?: string,
  archivoMimetype?: string
) => {
  const [canalRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM chat_canal WHERE id = ?`, [canalId]);
  if (canalRow.length === 0) return null;
  const canal = canalRow[0];

  if (canal.is_private) {
    const [member] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM chat_canal_miembro WHERE canal_id = ? AND usuario_id = ?`,
      [canalId, usuarioId]
    );
    if (member.length === 0) {
      throw new Error('403: No tienes acceso a este canal privado para enviar mensajes.');
    }
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO chat_mensaje (canal_id, usuario_id, mensaje, archivo_nombre, archivo_ruta, archivo_mimetype) VALUES (?, ?, ?, ?, ?, ?)`,
    [canalId, usuarioId, mensaje || '', archivoNombre || null, archivoRuta || null, archivoMimetype || null]
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
