import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
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
empresasRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM empresa ORDER BY nombre ASC');
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al cargar empresas', error: error.message });
  }
});
