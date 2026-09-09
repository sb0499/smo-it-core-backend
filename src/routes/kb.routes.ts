import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/kb.controller';

export const kbRouter = Router();

/**
 * @openapi
 * /api/v1/base-conocimiento/:
 *   get:
 *     tags: [Base de Conocimientos]
 *     summary: Listar todos los artículos de la base de conocimientos (Todos los usuarios)
 *     security: [{ bearerAuth: [] }]
 */
kbRouter.get('/', requireAuth, ctrl.getArticulosKB);

/**
 * @openapi
 * /api/v1/base-conocimiento/{id}:
 *   get:
 *     tags: [Base de Conocimientos]
 *     summary: Obtener detalle de un artículo (Todos los usuarios)
 *     security: [{ bearerAuth: [] }]
 */
kbRouter.get('/:id', requireAuth, ctrl.getArticuloKBById);

/**
 * @openapi
 * /api/v1/base-conocimiento/:
 *   post:
 *     tags: [Base de Conocimientos]
 *     summary: Publicar un nuevo artículo en la base de conocimientos (ADMIN - SUPERVISOR - TECNICO)
 *     security: [{ bearerAuth: [] }]
 */
kbRouter.post('/', requireAuth, requireAdminOrTecnico, ctrl.createArticuloKB);

/**
 * @openapi
 * /api/v1/base-conocimiento/{id}:
 *   put:
 *     tags: [Base de Conocimientos]
 *     summary: Actualizar un artículo (ADMIN - SUPERVISOR - TECNICO)
 *     security: [{ bearerAuth: [] }]
 */
kbRouter.put('/:id', requireAuth, requireAdminOrTecnico, ctrl.updateArticuloKB);

/**
 * @openapi
 * /api/v1/base-conocimiento/{id}:
 *   delete:
 *     tags: [Base de Conocimientos]
 *     summary: Eliminar un artículo (ADMIN - SUPERVISOR - TECNICO)
 *     security: [{ bearerAuth: [] }]
 */
kbRouter.delete('/:id', requireAuth, requireAdminOrTecnico, ctrl.deleteArticuloKB);
