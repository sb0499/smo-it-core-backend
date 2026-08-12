import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';
import { pool } from '../db/connection';
import { RowDataPacket } from 'mysql2';

export const empresasRouter = Router();

/**
 * @openapi
 * /api/v1/empresas/:
 *   get:
 *     tags: [Empresas]
 *     summary: Listar todas las empresas
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de empresas
 */
empresasRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let query = 'SELECT * FROM empresa';
    const params: any[] = [];
    
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO' && req.currentUser.nivel_soporte === 'N1') {
      query += ` WHERE id IN (SELECT empresa_id FROM usuario_empresa WHERE usuario_id = ?)`;
      params.push(req.currentUser.id);
    }
    
    query += ' ORDER BY nombre ASC';
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al cargar empresas', error: error.message });
  }
});
