import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/hosting-dominio.controller';

export const hostingsDominiosRouter = Router();

hostingsDominiosRouter.use(requireAuth, requireAdminOrTecnico);

/**
 * @openapi
 * /api/v1/hostings-dominios:
 *   get:
 *     tags: [Hostings y Dominios]
 *     summary: Listar hostings y dominios registrados
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [HOSTING, DOMINIO] }
 *       - in: query
 *         name: empresa_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de hostings y dominios
 */
hostingsDominiosRouter.get('/', ctrl.getHostingDominiosController);

/**
 * @openapi
 * /api/v1/hostings-dominios/{id}:
 *   get:
 *     tags: [Hostings y Dominios]
 *     summary: Obtener detalle de un hosting o dominio por ID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalle del registro
 *       404:
 *         description: Registro no encontrado
 */
hostingsDominiosRouter.get('/:id', ctrl.getHostingDominioByIdController);

/**
 * @openapi
 * /api/v1/hostings-dominios:
 *   post:
 *     tags: [Hostings y Dominios]
 *     summary: Crear un nuevo registro de Hosting o Dominio
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Registro creado exitosamente
 */
hostingsDominiosRouter.post('/', ctrl.createHostingDominioController);

/**
 * @openapi
 * /api/v1/hostings-dominios/{id}:
 *   put:
 *     tags: [Hostings y Dominios]
 *     summary: Actualizar datos de un Hosting o Dominio
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Registro actualizado
 */
hostingsDominiosRouter.put('/:id', ctrl.updateHostingDominioController);

/**
 * @openapi
 * /api/v1/hostings-dominios/{id}/renovar:
 *   patch:
 *     tags: [Hostings y Dominios]
 *     summary: Renovación rápida de fecha "Pagado Hasta"
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pagado_hasta]
 *             properties:
 *               pagado_hasta: { type: string, example: "2027-09-02" }
 *     responses:
 *       200:
 *         description: Fecha actualizada exitosamente
 */
hostingsDominiosRouter.patch('/:id/renovar', ctrl.renovarPagadoHastaController);

/**
 * @openapi
 * /api/v1/hostings-dominios/{id}:
 *   delete:
 *     tags: [Hostings y Dominios]
 *     summary: Desactivar/Eliminar un hosting o dominio
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Registro eliminado
 */
hostingsDominiosRouter.delete('/:id', ctrl.deleteHostingDominioController);
