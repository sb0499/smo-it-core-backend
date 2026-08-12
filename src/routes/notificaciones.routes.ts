import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/notificacion.controller';

export const notificacionesRouter = Router();

/**
 * @openapi
 * /api/v1/notificaciones:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Listar notificaciones del usuario autenticado (últimas 50)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de notificaciones
 */
notificacionesRouter.get('/', requireAuth, ctrl.getNotificaciones);

/**
 * @openapi
 * /api/v1/notificaciones/{id}/leer:
 *   put:
 *     tags: [Notificaciones]
 *     summary: Marcar una notificación como leída
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Notificación marcada como leída
 *       404:
 *         description: Notificación no encontrada o no autorizada
 */
notificacionesRouter.put('/:id/leer', requireAuth, ctrl.marcarLeida);

/**
 * @openapi
 * /api/v1/notificaciones/leer-todas:
 *   put:
 *     tags: [Notificaciones]
 *     summary: Marcar todas las notificaciones como leídas
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Todas las notificaciones marcadas como leídas
 */
notificacionesRouter.put('/leer-todas', requireAuth, ctrl.marcarTodasLeidas);
