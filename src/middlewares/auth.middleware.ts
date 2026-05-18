import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';
import { pool } from '../db/connection';
import { RowDataPacket } from 'mysql2';

export interface AuthRequest extends Request {
  user?: TokenPayload;
  currentUser?: any;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ detail: 'No autenticado' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({ detail: 'Credenciales inválidas o expiradas' });
      return;
    }

    // Verify user still exists and is active
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM usuario WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      res.status(401).json({ detail: 'El usuario ya no existe' });
      return;
    }

    const user = rows[0];
    if (!user.is_active) {
      res.status(401).json({ detail: 'Usuario inactivo' });
      return;
    }

    req.user = decoded;
    req.currentUser = user; // To have full user info if needed
    next();
  } catch (error) {
    res.status(500).json({ detail: 'Error en la autenticación' });
  }
};

export const requireRoles = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ detail: 'No autenticado' });
      return;
    }

    if (!roles.includes(req.user.rol)) {
      res.status(403).json({ detail: 'No tiene permisos suficientes' });
      return;
    }

    next();
  };
};

export const requireAdmin = requireRoles(['ADMIN']);
export const requireAdminOrTecnico = requireRoles(['ADMIN', 'TECNICO']);
