import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/proyecto.controller';

export const proyectosRouter = Router();

/**
 * @openapi
 * /api/v1/proyectos/:
 *   post:
 *     tags: [Proyectos]
 *     summary: Crear proyecto (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               fecha_fin_estimada: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Proyecto creado
 */
proyectosRouter.post('/', requireAuth, requireAdmin, ctrl.createProyecto);

/**
 * @openapi
 * /api/v1/proyectos/escalar-ticket/{ticket_id}:
 *   post:
 *     tags: [Proyectos]
 *     summary: Escalar ticket a tarea interna de proyecto
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ticket_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: proyecto_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: responsable_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201:
 *         description: Tarea creada y ticket escalado
 *       404:
 *         description: Ticket no encontrado
 */
proyectosRouter.post('/escalar-ticket/:ticket_id', requireAuth, ctrl.escalarTicket);
