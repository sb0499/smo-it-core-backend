import { pool } from '../db/connection';
import { verifyPassword } from '../utils/password';
import { RowDataPacket } from 'mysql2';

export const authenticate = async (email: string, password: string) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.*, r.nombre as rol_nombre FROM usuario u
     JOIN rol r ON u.rol_id = r.id
     WHERE u.email = ?`,
    [email]
  );
  if (rows.length === 0) return null;
  const user = rows[0];
  const valid = await verifyPassword(password, user.hashed_password);
  if (!valid) return null;
  return user;
};
