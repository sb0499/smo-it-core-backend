import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/credencial.controller';

export const credencialesRouter = Router();

// Protect all endpoints with authentication and role verification
credencialesRouter.use(requireAuth, requireAdminOrTecnico);

/**
 * @openapi
 * /api/v1/credenciales/:
 *   get:
 *     tags: [Credenciales]
 *     summary: Listar todas las entregas de credenciales
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de entregas de credenciales
 */
credencialesRouter.get('/', ctrl.getEntregas);

/**
 * @openapi
 * /api/v1/credenciales/next-secuencial:
 *   get:
 *     tags: [Credenciales]
 *     summary: Obtener el siguiente secuencial tentativo para una empresa y fecha
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: empresa_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: fecha_entrega
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Siguiente secuencial generado
 */
credencialesRouter.get('/next-secuencial', ctrl.getNextSecuencial);

/**
 * @openapi
 * /api/v1/credenciales/{id}:
 *   get:
 *     tags: [Credenciales]
 *     summary: Obtener detalle de una entrega específica
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalle de la entrega
 *       404:
 *         description: Entrega no encontrada
 */
credencialesRouter.get('/:id', ctrl.getEntregaById);

/**
 * @openapi
 * /api/v1/credenciales/{id}/pdf:
 *   get:
 *     tags: [Credenciales]
 *     summary: Descargar acta de entrega en PDF (versión Usuario o TI)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: version
 *         schema: { type: string, enum: [usuario, ti] }
 *     responses:
 *       200:
 *         description: Archivo PDF generado
 *       404:
 *         description: Entrega no encontrada
 */
credencialesRouter.get('/:id/pdf', ctrl.descargarPDF);

/**
 * @openapi
 * /api/v1/credenciales/:
 *   post:
 *     tags: [Credenciales]
 *     summary: Registrar una nueva entrega de credenciales
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [empresa_id, fecha_entrega, sitio, usuario, clave, recibido_por_nombre, recibido_por_area]
 *             properties:
 *               empresa_id: { type: integer }
 *               fecha_entrega: { type: string, format: date }
 *               tipo: { type: string }
 *               sitio: { type: string }
 *               usuario: { type: string }
 *               clave: { type: string }
 *               recibido_por_nombre: { type: string }
 *               recibido_por_area: { type: string }
 *     responses:
 *       201:
 *         description: Entrega registrada
 */
credencialesRouter.post('/', ctrl.createEntrega);

/**
 * @openapi
 * /api/v1/credenciales/{id}:
 *   delete:
 *     tags: [Credenciales]
 *     summary: Eliminar una entrega de credenciales
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Entrega eliminada
 *       404:
 *         description: Entrega no encontrada
 */
credencialesRouter.delete('/:id', ctrl.deleteEntrega);
