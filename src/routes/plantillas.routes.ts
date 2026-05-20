import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/plantilla.controller';

export const plantillasRouter = Router();

/**
 * @openapi
 * /api/v1/plantillas/:
 *   get:
 *     tags: [Plantillas]
 *     summary: Listar todas las plantillas recurrentes (ADMIN - TECNICO)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de plantillas recurrentes
 */
plantillasRouter.get('/', requireAuth, requireAdminOrTecnico, ctrl.getPlantillas);

/**
 * @openapi
 * /api/v1/plantillas/activas:
 *   get:
 *     tags: [Plantillas]
 *     summary: Listar plantillas activas
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de plantillas activas
 */
plantillasRouter.get('/activas', requireAuth, ctrl.getPlantillasActivas);

/**
 * @openapi
 * /api/v1/plantillas/:
 *   post:
 *     tags: [Plantillas]
 *     summary: Crear plantilla recurrente (ADMIN - TECNICO)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [titulo, descripcion, categoria]
 *             properties:
 *               titulo: { type: string }
 *               descripcion: { type: string }
 *               categoria: { type: string }
 *               empresa: { type: string, nullable: true }
 *               area_solicitante: { type: string, nullable: true }
 *               is_active: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Plantilla creada
 */
plantillasRouter.post('/', requireAuth, requireAdminOrTecnico, ctrl.createPlantilla);

/**
 * @openapi
 * /api/v1/plantillas/{plantilla_id}:
 *   put:
 *     tags: [Plantillas]
 *     summary: Actualizar plantilla (ADMIN - TECNICO)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: plantilla_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo: { type: string }
 *               descripcion: { type: string }
 *               categoria: { type: string }
 *               empresa: { type: string }
 *               area_solicitante: { type: string }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Plantilla actualizada
 *       404:
 *         description: Plantilla no encontrada
 */
plantillasRouter.put('/:plantilla_id', requireAuth, requireAdminOrTecnico, ctrl.updatePlantilla);

/**
 * @openapi
 * /api/v1/plantillas/{plantilla_id}:
 *   delete:
 *     tags: [Plantillas]
 *     summary: Eliminar plantilla (ADMIN - TECNICO)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: plantilla_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Plantilla eliminada
 *       404:
 *         description: Plantilla no encontrada
 */
plantillasRouter.delete('/:plantilla_id', requireAuth, requireAdminOrTecnico, ctrl.deletePlantilla);
