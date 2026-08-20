import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { syncMemberChannelKey } from '../db/e2ee';
import crypto from 'crypto';

export const getCanalById = async (canalId: number, usuarioId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.*, u.nombre_completo as creador_nombre,
            (SELECT COUNT(*) FROM chat_canal_miembro m WHERE m.canal_id = c.id) as miembros_count,
            (SELECT u2.nombre_completo 
             FROM chat_canal_miembro m2 
             JOIN usuario u2 ON m2.usuario_id = u2.id 
             WHERE m2.canal_id = c.id AND m2.usuario_id != ? LIMIT 1) as dm_destinatario_nombre,
            m_self.encrypted_channel_key
     FROM chat_canal c
     JOIN usuario u ON c.creador_id = u.id
     LEFT JOIN chat_canal_miembro m_self ON c.id = m_self.canal_id AND m_self.usuario_id = ?
     WHERE c.id = ?`,
    [usuarioId, usuarioId, canalId]
  );
  return rows[0];
};

export const createCanal = async (nombre: string, isPrivate: boolean, creadorId: number, keys?: { [userId: number]: string }) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO chat_canal (nombre, is_private, creador_id) VALUES (?, ?, ?)`,
    [nombre.toLowerCase().replace(/\s+/g, '-'), isPrivate, creadorId]
  );
  
  const canalId = result.insertId;
  
  if (keys) {
    for (const [uId, encKey] of Object.entries(keys)) {
      await pool.query(
        `INSERT INTO chat_canal_miembro (canal_id, usuario_id, encrypted_channel_key) VALUES (?, ?, ?)`,
        [canalId, parseInt(uId), encKey]
      );
    }
  } else {
    // Generate key on backend if no keys payload is sent (e.g. public channel)
    let encryptedKey: string | null = null;
    try {
      const [userRows] = await pool.query<RowDataPacket[]>(
        'SELECT public_key FROM usuario WHERE id = ?',
        [creadorId]
      );
      if (userRows.length > 0 && userRows[0].public_key) {
        const pubKeyStr = userRows[0].public_key;
        const channelKeyBytes = crypto.randomBytes(32);
        
        const pubKeyObj = crypto.createPublicKey({
          key: JSON.parse(pubKeyStr),
          format: 'jwk'
        });
        const encryptedKeyBytes = crypto.publicEncrypt(
          {
            key: pubKeyObj,
            oaepHash: 'sha256'
          },
          channelKeyBytes
        );
        encryptedKey = encryptedKeyBytes.toString('base64');
      }
    } catch (err: any) {
      console.error(`Failed to generate backend channel key for creator ${creadorId}:`, err.message);
    }

    await pool.query(
      `INSERT INTO chat_canal_miembro (canal_id, usuario_id, encrypted_channel_key) VALUES (?, ?, ?)`,
      [canalId, creadorId, encryptedKey]
    );
  }

  return await getCanalById(canalId, creadorId);
};

export const getCanales = async (usuarioId: number, userRol: string) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT c.*, u.nombre_completo as creador_nombre,
            (SELECT COUNT(*) FROM chat_canal_miembro m WHERE m.canal_id = c.id) as miembros_count,
            (SELECT u2.nombre_completo 
             FROM chat_canal_miembro m2 
             JOIN usuario u2 ON m2.usuario_id = u2.id 
             WHERE m2.canal_id = c.id AND m2.usuario_id != ? LIMIT 1) as dm_destinatario_nombre,
            m_self.encrypted_channel_key
     FROM chat_canal c
     JOIN usuario u ON c.creador_id = u.id
     LEFT JOIN chat_canal_miembro m ON c.id = m.canal_id
     LEFT JOIN chat_canal_miembro m_self ON c.id = m_self.canal_id AND m_self.usuario_id = ?
     WHERE c.is_private = FALSE OR m.usuario_id = ?
     ORDER BY c.nombre ASC`,
    [usuarioId, usuarioId, usuarioId]
  );
  return rows;
};

export const getOrCreateDMChannel = async (usuarioId1: number, usuarioId2: number, keys?: { [userId: number]: string }) => {
  const name = usuarioId1 < usuarioId2 
    ? `dm-${usuarioId1}-${usuarioId2}` 
    : `dm-${usuarioId2}-${usuarioId1}`;

  // Verificar si ya existe
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM chat_canal WHERE nombre = ? AND is_dm = TRUE`,
    [name]
  );

  if (existing.length > 0) {
    return await getCanalById(existing[0].id, usuarioId1);
  }

  // Crear canal privado marcado como DM
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO chat_canal (nombre, is_private, is_dm, creador_id) VALUES (?, TRUE, TRUE, ?)`,
    [name, usuarioId1]
  );

  const canalId = result.insertId;

  // Registrar a ambos usuarios
  if (keys) {
    for (const [uId, encKey] of Object.entries(keys)) {
      await pool.query(
        `INSERT INTO chat_canal_miembro (canal_id, usuario_id, encrypted_channel_key) VALUES (?, ?, ?)`,
        [canalId, parseInt(uId), encKey]
      );
    }
  } else {
    // Generate key on backend if no keys payload is sent (e.g. fallback)
    let encryptedKey1: string | null = null;
    let encryptedKey2: string | null = null;
    try {
      const [users] = await pool.query<RowDataPacket[]>(
        'SELECT id, public_key FROM usuario WHERE id IN (?, ?)',
        [usuarioId1, usuarioId2]
      );
      const userMap = new Map(users.map(u => [u.id, u.public_key]));
      
      const pubKey1 = userMap.get(usuarioId1);
      const pubKey2 = userMap.get(usuarioId2);
      
      if (pubKey1 || pubKey2) {
        const channelKeyBytes = crypto.randomBytes(32);
        
        if (pubKey1) {
          const pubKeyObj1 = crypto.createPublicKey({
            key: JSON.parse(pubKey1),
            format: 'jwk'
          });
          const enc1 = crypto.publicEncrypt(
            { key: pubKeyObj1, oaepHash: 'sha256' },
            channelKeyBytes
          );
          encryptedKey1 = enc1.toString('base64');
        }
        if (pubKey2 && usuarioId1 !== usuarioId2) {
          const pubKeyObj2 = crypto.createPublicKey({
            key: JSON.parse(pubKey2),
            format: 'jwk'
          });
          const enc2 = crypto.publicEncrypt(
            { key: pubKeyObj2, oaepHash: 'sha256' },
            channelKeyBytes
          );
          encryptedKey2 = enc2.toString('base64');
        }
      }
    } catch (err: any) {
      console.error(`Failed to generate backend DM channel keys for users ${usuarioId1} & ${usuarioId2}:`, err.message);
    }

    await pool.query(
      `INSERT INTO chat_canal_miembro (canal_id, usuario_id, encrypted_channel_key) VALUES (?, ?, ?)`,
      [canalId, usuarioId1, encryptedKey1]
    );
    if (usuarioId1 !== usuarioId2) {
      await pool.query(
        `INSERT INTO chat_canal_miembro (canal_id, usuario_id, encrypted_channel_key) VALUES (?, ?, ?)`,
        [canalId, usuarioId2, encryptedKey2]
      );
    }
  }

  return await getCanalById(canalId, usuarioId1);
};

export const unirMiembro = async (canalId: number, usuarioId: number, encryptedChannelKey?: string) => {
  // Verificar si ya es miembro
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM chat_canal_miembro WHERE canal_id = ? AND usuario_id = ?`,
    [canalId, usuarioId]
  );
  if (existing.length > 0) {
    if (encryptedChannelKey) {
      await pool.query(
        `UPDATE chat_canal_miembro SET encrypted_channel_key = ? WHERE canal_id = ? AND usuario_id = ?`,
        [encryptedChannelKey, canalId, usuarioId]
      );
    } else {
      await syncMemberChannelKey(canalId, usuarioId);
    }
    return true;
  }

  await pool.query(
    `INSERT INTO chat_canal_miembro (canal_id, usuario_id, encrypted_channel_key) VALUES (?, ?, ?)`,
    [canalId, usuarioId, encryptedChannelKey || null]
  );
  if (!encryptedChannelKey) {
    await syncMemberChannelKey(canalId, usuarioId);
  }
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
