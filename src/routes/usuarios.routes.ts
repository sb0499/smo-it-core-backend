import { Router } from 'express';
import { requireAuth, requireAdmin, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/usuario.controller';

export const usuariosRouter = Router();

/**
 * @openapi
 * /api/v1/usuarios/:
 *   get:
 *     tags: [Usuarios]
 *     summary: Listar todos los usuarios (ADMIN y TECNICO)
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
 *         description: Lista de usuarios
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permisos
 */
usuariosRouter.get('/', requireAuth, requireAdminOrTecnico, ctrl.getUsuarios);

/**
 * @openapi
 * /api/v1/usuarios/:
 *   post:
 *     tags: [Usuarios]
 *     summary: Crear usuario (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, nombre_completo, rol_id]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *               nombre_completo: { type: string }
 *               is_active: { type: boolean, default: true }
 *               rol_id: { type: integer }
 *               empresa_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       201:
 *         description: Usuario creado
 *       400:
 *         description: Email ya registrado
 */
usuariosRouter.post('/', requireAuth, requireAdmin, ctrl.createUsuario);

/**
 * @openapi
 * /api/v1/usuarios/{user_id}:
 *   put:
 *     tags: [Usuarios]
 *     summary: Actualizar usuario (solo ADMIN)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *               nombre_completo: { type: string }
 *               is_active: { type: boolean }
 *               rol_id: { type: integer }
 *               empresa_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Usuario actualizado
 *       404:
 *         description: Usuario no encontrado
 */
usuariosRouter.put('/:user_id', requireAuth, requireAdmin, ctrl.updateUsuario);
usuariosRouter.put('/:user_id/keys', requireAuth, ctrl.updateUsuarioKeys);
usuariosRouter.get('/:user_id/keys', requireAuth, ctrl.getUsuarioKeys);
