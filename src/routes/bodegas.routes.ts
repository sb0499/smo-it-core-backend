import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/bodega.controller';

export const bodegasRouter = Router();

bodegasRouter.use(requireAuth, requireAdminOrTecnico);

/**
 * @openapi
 * /api/v1/bodegas/:
 *   get:
 *     tags: [Bodegas]
 *     summary: Listar todas las bodegas
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de bodegas
 */
bodegasRouter.get('/', requireAuth, ctrl.getBodegas);

/**
 * @openapi
 * /api/v1/bodegas/{id}:
 *   get:
 *     tags: [Bodegas]
 *     summary: Obtener detalle de una bodega
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalle de la bodega
 *       404:
 *         description: Bodega no encontrada
 */
bodegasRouter.get('/:id', requireAuth, ctrl.getBodegaById);

/**
 * @openapi
 * /api/v1/bodegas/:
 *   post:
 *     tags: [Bodegas]
 *     summary: Crear una nueva bodega
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, empresa_id]
 *             properties:
 *               nombre: { type: string, example: "Bodega Principal Condado" }
 *               empresa_id: { type: integer, example: 1 }
 *               descripcion: { type: string, example: "Suministros y equipos de repuesto" }
 *     responses:
 *       201:
 *         description: Bodega creada
 */
bodegasRouter.post('/', requireAuth, requireAdminOrTecnico, ctrl.createBodega);

/**
 * @openapi
 * /api/v1/bodegas/{id}:
 *   put:
 *     tags: [Bodegas]
 *     summary: Actualizar una bodega
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               empresa_id: { type: integer }
 *               descripcion: { type: string }
 *     responses:
 *       200:
 *         description: Bodega actualizada
 */
bodegasRouter.put('/:id', requireAuth, requireAdminOrTecnico, ctrl.updateBodega);

/**
 * @openapi
 * /api/v1/bodegas/{id}:
 *   delete:
 *     tags: [Bodegas]
 *     summary: Eliminar una bodega
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Bodega eliminada
 */
bodegasRouter.delete('/:id', requireAuth, requireAdminOrTecnico, ctrl.deleteBodega);
