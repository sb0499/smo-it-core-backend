import { Router } from 'express';
import { requireAuth, requireAdmin, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/inventario.controller';

export const inventariosRouter = Router();

/**
 * @openapi
 * /api/v1/inventarios/:
 *   get:
 *     tags: [Inventarios]
 *     summary: Listar activos
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
 *         description: Lista de activos
 */
inventariosRouter.get('/', requireAuth, ctrl.getActivos);

/**
 * @openapi
 * /api/v1/inventarios/movimientos/global:
 *   get:
 *     tags: [Inventarios]
 *     summary: Historial global de movimientos de inventario (ADMIN y TECNICO)
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
 *         description: Lista de todos los movimientos de inventario
 */
inventariosRouter.get('/movimientos/global', requireAuth, requireAdminOrTecnico, ctrl.getMovimientosGlobal);

/**
 * @openapi
 * /api/v1/inventarios/:
 *   post:
 *     tags: [Inventarios]
 *     summary: Crear activo (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo, serial, marca, modelo]
 *             properties:
 *               codigo: { type: string }
 *               serial: { type: string }
 *               marca: { type: string }
 *               modelo: { type: string }
 *               especificaciones: { type: string }
 *               persona_id: { type: integer, nullable: true }
 *               proveedor_id: { type: integer, nullable: true }
 *               fecha_compra: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Activo creado
 */
inventariosRouter.post('/', requireAuth, requireAdminOrTecnico, ctrl.createActivo);

/**
 * @openapi
 * /api/v1/inventarios/{activo_id}/asignar/{persona_id}:
 *   post:
 *     tags: [Inventarios]
 *     summary: Asignar activo a persona (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: activo_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: persona_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               observaciones: { type: string, example: "Equipo se entrega con cargador genérico y rasguño leve en tapa posterior" }
 *     responses:
 *       200:
 *         description: Activo asignado
 *       404:
 *         description: Activo no encontrado
 */
inventariosRouter.post('/:activo_id/asignar/:persona_id', requireAuth, requireAdminOrTecnico, ctrl.asignarActivo);

/**
 * @openapi
 * /api/v1/inventarios/{activo_id}/historial:
 *   get:
 *     tags: [Inventarios]
 *     summary: Historial de movimientos de un activo (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: activo_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historial de movimientos
 */
inventariosRouter.get('/:activo_id/historial', requireAuth, requireAdminOrTecnico, ctrl.getHistorial);

/**
 * @openapi
 * /api/v1/inventarios/movimientos/{movimiento_id}/acta:
 *   get:
 *     tags: [Inventarios]
 *     summary: Descargar acta PDF de un movimiento (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: movimiento_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: PDF del acta
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Movimiento no encontrado
 */
inventariosRouter.get('/movimientos/:movimiento_id/acta', requireAuth, requireAdminOrTecnico, ctrl.descargarActa);

/**
 * @openapi
 * /api/v1/inventarios/{activo_id}/devolver:
 *   post:
 *     tags: [Inventarios]
 *     summary: Devolver activo a bodega (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: activo_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: observaciones
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Activo devuelto
 *       400:
 *         description: Activo no encontrado o ya en bodega
 */
inventariosRouter.post('/:activo_id/devolver', requireAuth, requireAdminOrTecnico, ctrl.devolverActivo);

/**
 * @openapi
 * /api/v1/inventarios/{activo_id}/estado:
 *   patch:
 *     tags: [Inventarios]
 *     summary: Cambiar estado de un activo (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: activo_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nuevo_estado]
 *             properties:
 *               nuevo_estado:
 *                 type: string
 *                 enum: [Stock, Asignado, Mantenimiento, Baja]
 *     responses:
 *       200:
 *         description: Estado actualizado
 *       404:
 *         description: Activo no encontrado
 */
inventariosRouter.patch('/:activo_id/estado', requireAuth, requireAdminOrTecnico, ctrl.cambiarEstado);
