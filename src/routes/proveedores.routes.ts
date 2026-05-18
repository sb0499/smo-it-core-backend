import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/proveedor.controller';

export const proveedoresRouter = Router();

/**
 * @openapi
 * /api/v1/proveedores/:
 *   get:
 *     tags: [Proveedores]
 *     summary: Listar todos los proveedores
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de proveedores
 */
proveedoresRouter.get('/', requireAuth, ctrl.getProveedores);

/**
 * @openapi
 * /api/v1/proveedores/{id}:
 *   get:
 *     tags: [Proveedores]
 *     summary: Obtener detalle de un proveedor
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalle del proveedor
 *       404:
 *         description: Proveedor no encontrado
 */
proveedoresRouter.get('/:id', requireAuth, ctrl.getProveedorById);

/**
 * @openapi
 * /api/v1/proveedores/:
 *   post:
 *     tags: [Proveedores]
 *     summary: Crear un nuevo proveedor (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string, example: "Dell Tech Solutions" }
 *               contacto: { type: string, example: "Lorena Flores" }
 *               telefono: { type: string, example: "0991234567" }
 *               email: { type: string, example: "lorena.flores@dell.com" }
 *     responses:
 *       201:
 *         description: Proveedor creado
 *       400:
 *         description: Entrada duplicada o datos inválidos
 */
proveedoresRouter.post('/', requireAuth, requireAdmin, ctrl.createProveedor);

/**
 * @openapi
 * /api/v1/proveedores/{id}:
 *   put:
 *     tags: [Proveedores]
 *     summary: Actualizar un proveedor (solo ADMIN)
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
 *               contacto: { type: string }
 *               telefono: { type: string }
 *               email: { type: string }
 *     responses:
 *       200:
 *         description: Proveedor actualizado
 *       404:
 *         description: Proveedor no encontrado
 */
proveedoresRouter.put('/:id', requireAuth, requireAdmin, ctrl.updateProveedor);

/**
 * @openapi
 * /api/v1/proveedores/{id}:
 *   delete:
 *     tags: [Proveedores]
 *     summary: Eliminar un proveedor (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Proveedor eliminado
 *       404:
 *         description: Proveedor no encontrado
 */
proveedoresRouter.delete('/:id', requireAuth, requireAdmin, ctrl.deleteProveedor);
