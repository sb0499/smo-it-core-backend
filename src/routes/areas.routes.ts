import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/area.controller';

export const areasRouter = Router();

/**
 * @openapi
 * /api/v1/areas:
 *   get:
 *     tags: [Areas]
 *     summary: Listar todas las áreas solicitantes con soporte de paginación
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: onlyActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Lista paginada de áreas
 */
areasRouter.get('/', requireAuth, ctrl.getAreas);
areasRouter.get('/:id', requireAuth, ctrl.getAreaById);
areasRouter.post('/', requireAuth, ctrl.createArea);
areasRouter.put('/:id', requireAuth, ctrl.updateArea);
areasRouter.delete('/:id', requireAuth, ctrl.deleteArea);
