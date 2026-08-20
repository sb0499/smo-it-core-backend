import { pool } from '../db/connection';
import { getPasswordHash } from '../utils/password';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { generateKeysForUser } from '../db/e2ee';

export const getUsuarios = async (skip = 0, limit = 100) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.email, u.nombre_completo, u.is_active, u.created_at, u.updated_at,
            u.rol_id, r.nombre as rol_nombre, u.must_change_password, u.nivel_soporte, u.grupo_n2,
            GROUP_CONCAT(DISTINCT ue.empresa_id) as empresa_ids,
            GROUP_CONCAT(DISTINCT e_sop.nombre SEPARATOR ',') as empresa_nombres,
            GROUP_CONCAT(DISTINCT uei.empresa_id) as empresa_inventario_ids,
            GROUP_CONCAT(DISTINCT e_inv.nombre SEPARATOR ',') as empresa_inventario_nombres
     FROM usuario u
     JOIN rol r ON u.rol_id = r.id
     LEFT JOIN usuario_empresa ue ON u.id = ue.usuario_id
     LEFT JOIN empresa e_sop ON ue.empresa_id = e_sop.id
     LEFT JOIN usuario_empresa_inventario uei ON u.id = uei.usuario_id
     LEFT JOIN empresa e_inv ON uei.empresa_id = e_inv.id
     GROUP BY u.id
     LIMIT ? OFFSET ?`,
    [limit, skip]
  );
  return rows.map(u => ({
    ...u,
    rol: u.rol_nombre,
    empresa_ids: u.empresa_ids ? u.empresa_ids.split(',').map(Number) : [],
    empresa_nombres: u.empresa_nombres ? u.empresa_nombres.split(',') : [],
    empresa_inventario_ids: u.empresa_inventario_ids ? u.empresa_inventario_ids.split(',').map(Number) : [],
    empresa_inventario_nombres: u.empresa_inventario_nombres ? u.empresa_inventario_nombres.split(',') : []
  }));
};

export const getUsuarioByEmail = async (email: string) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.*, r.nombre as rol_nombre FROM usuario u JOIN rol r ON u.rol_id = r.id WHERE u.email = ?`,
    [email]
  );
  return rows[0] || null;
};

export const getUsuarioById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.*, r.nombre as rol_nombre FROM usuario u JOIN rol r ON u.rol_id = r.id WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
};

export const createUsuario = async (data: {
  email: string;
  password: string;
  nombre_completo: string;
  is_active: boolean;
  rol_id: number;
  must_change_password?: boolean;
  nivel_soporte?: 'N1' | 'N2';
  grupo_n2?: 'Infraestructura' | 'Desarrollo' | null;
  empresa_ids?: number[];
  empresa_inventario_ids?: number[];
}) => {
  const hashed = await getPasswordHash(data.password);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO usuario (email, hashed_password, nombre_completo, is_active, rol_id, must_change_password, nivel_soporte, grupo_n2) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.email, hashed, data.nombre_completo, data.is_active ?? true, data.rol_id, data.must_change_password ?? true, data.nivel_soporte || 'N1', data.grupo_n2 || null]
    );
    const userId = result.insertId;
    if (data.empresa_ids && data.empresa_ids.length > 0) {
      for (const empId of data.empresa_ids) {
        await conn.query(`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (?, ?)`, [userId, empId]);
      }
    }
    if (data.empresa_inventario_ids && data.empresa_inventario_ids.length > 0) {
      for (const empId of data.empresa_inventario_ids) {
        await conn.query(`INSERT INTO usuario_empresa_inventario (usuario_id, empresa_id) VALUES (?, ?)`, [userId, empId]);
      }
    }
    await conn.commit();
    try {
      await generateKeysForUser(userId, data.email);
    } catch (keyErr) {
      console.error(`Failed to generate E2EE keys for new user ${data.email}:`, keyErr);
    }
    return getUsuarioById(userId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

export const updateUsuario = async (userId: number, data: {
  email?: string;
  password?: string;
  nombre_completo?: string;
  is_active?: boolean;
  rol_id?: number;
  must_change_password?: boolean;
  nivel_soporte?: 'N1' | 'N2';
  grupo_n2?: 'Infraestructura' | 'Desarrollo' | null;
  empresa_ids?: number[];
  empresa_inventario_ids?: number[];
}) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sets: string[] = [];
    const vals: any[] = [];
    if (data.email !== undefined)          { sets.push('email = ?');           vals.push(data.email); }
    if (data.nombre_completo !== undefined) { sets.push('nombre_completo = ?'); vals.push(data.nombre_completo); }
    if (data.is_active !== undefined)       { sets.push('is_active = ?');       vals.push(data.is_active); }
    if (data.rol_id !== undefined)          { sets.push('rol_id = ?');          vals.push(data.rol_id); }
    if (data.must_change_password !== undefined) { sets.push('must_change_password = ?'); vals.push(data.must_change_password); }
    if (data.nivel_soporte !== undefined)   { sets.push('nivel_soporte = ?');   vals.push(data.nivel_soporte); }
    if (data.grupo_n2 !== undefined)        { sets.push('grupo_n2 = ?');        vals.push(data.grupo_n2); }
    if (data.password) {
      sets.push('hashed_password = ?');
      vals.push(await getPasswordHash(data.password));
    }
    if (sets.length > 0) {
      vals.push(userId);
      await conn.query(`UPDATE usuario SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    if (data.empresa_ids !== undefined) {
      await conn.query(`DELETE FROM usuario_empresa WHERE usuario_id = ?`, [userId]);
      for (const empId of data.empresa_ids) {
        await conn.query(`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (?, ?)`, [userId, empId]);
      }
    }
    if (data.empresa_inventario_ids !== undefined) {
      await conn.query(`DELETE FROM usuario_empresa_inventario WHERE usuario_id = ?`, [userId]);
      for (const empId of data.empresa_inventario_ids) {
        await conn.query(`INSERT INTO usuario_empresa_inventario (usuario_id, empresa_id) VALUES (?, ?)`, [userId, empId]);
      }
    }
    await conn.commit();
    return getUsuarioById(userId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

export const updateUsuarioKeys = async (userId: number, publicKey: string, encryptedPrivateKey: string) => {
  await pool.query(
    `UPDATE usuario SET public_key = ?, encrypted_private_key = ? WHERE id = ?`,
    [publicKey, encryptedPrivateKey, userId]
  );
  return getUsuarioById(userId);
};

export const getUsuarioKeys = async (userId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, public_key, encrypted_private_key FROM usuario WHERE id = ?`,
    [userId]
  );
  return rows[0] || null;
};

export const deleteUsuario = async (userId: number) => {
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM usuario WHERE id = ?`,
    [userId]
  );
  if (existing.length === 0) return null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // programmatically nullify referencing columns
    await conn.query('UPDATE ticket SET creador_id = NULL WHERE creador_id = ?', [userId]);
    await conn.query('UPDATE ticket SET tecnico_id = NULL WHERE tecnico_id = ?', [userId]);
    await conn.query('UPDATE proyecto SET creador_id = NULL WHERE creador_id = ?', [userId]);
    await conn.query('UPDATE tarea_proyecto SET responsable_id = NULL WHERE responsable_id = ?', [userId]);
    await conn.query('UPDATE subtarea_proyecto SET responsable_id = NULL WHERE responsable_id = ?', [userId]);
    await conn.query('UPDATE proyecto_comentario SET autor_id = NULL WHERE autor_id = ?', [userId]);
    await conn.query('UPDATE proyecto_archivo SET autor_id = NULL WHERE autor_id = ?', [userId]);
    await conn.query('UPDATE proyecto_historial SET usuario_id = NULL WHERE usuario_id = ?', [userId]);
    await conn.query('UPDATE chat_canal SET creador_id = NULL WHERE creador_id = ?', [userId]);
    await conn.query('UPDATE movimiento_inventario SET usuario_id = NULL WHERE usuario_id = ?', [userId]);
    await conn.query('UPDATE historial_cambios_activo SET usuario_id = NULL WHERE usuario_id = ?', [userId]);
    await conn.query('UPDATE entrega_credencial SET entregado_por_id = NULL WHERE entregado_por_id = ?', [userId]);
    await conn.query('UPDATE guardia_feriado SET tecnico_id = NULL WHERE tecnico_id = ?', [userId]);

    // Now delete the user
    await conn.query('DELETE FROM usuario WHERE id = ?', [userId]);

    await conn.commit();
    return existing[0];
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

