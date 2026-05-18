import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/guardia.controller';

export const guardiasRouter = Router();

/**
 * @openapi
 * /api/v1/guardias/:
 *   get:
 *     tags: [Guardias]
 *     summary: Listar guardias y feriados
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: skip
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: Lista de guardias
 */
guardiasRouter.get('/', requireAuth, ctrl.getGuardias);

/**
 * @openapi
 * /api/v1/guardias/:
 *   post:
 *     tags: [Guardias]
 *     summary: Crear o actualizar guardia (solo ADMIN)
 *     description: Si ya existe una guardia para esa fecha, la actualiza con el nuevo técnico.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fecha, tecnico_id]
 *             properties:
 *               fecha: { type: string, format: date, example: "2025-12-25" }
 *               tecnico_id: { type: integer }
 *               observaciones: { type: string }
 *     responses:
 *       201:
 *         description: Guardia creada o actualizada
 */
guardiasRouter.post('/', requireAuth, requireAdmin, ctrl.createGuardia);

/**
 * @openapi
 * /api/v1/guardias/{guardia_id}:
 *   delete:
 *     tags: [Guardias]
 *     summary: Eliminar guardia (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guardia_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Guardia eliminada
 *       404:
 *         description: Guardia no encontrada
 */
guardiasRouter.delete('/:guardia_id', requireAuth, requireAdmin, ctrl.deleteGuardia);
