import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/persona.controller';

export const personasRouter = Router();

/**
 * @openapi
 * /api/v1/personas/:
 *   get:
 *     tags: [Personas]
 *     summary: Listar personas/empleados
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
 *         description: Lista de personas
 */
personasRouter.get('/', requireAuth, ctrl.getPersonas);

/**
 * @openapi
 * /api/v1/personas/:
 *   post:
 *     tags: [Personas]
 *     summary: Crear persona/empleado
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cedula, nombre, empresa_id]
 *             properties:
 *               cedula: { type: string }
 *               nombre: { type: string }
 *               telefono: { type: string }
 *               departamento: { type: string }
 *               cargo: { type: string }
 *               empresa_id: { type: integer }
 *     responses:
 *       201:
 *         description: Persona creada
 *       400:
 *         description: Cédula ya registrada
 */
personasRouter.post('/', requireAuth, ctrl.createPersona);

/**
 * @openapi
 * /api/v1/personas/{persona_id}:
 *   put:
 *     tags: [Personas]
 *     summary: Actualizar persona
 *     security: [{ bearerAuth: [] }]
 *     parameters:
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
 *               cedula: { type: string }
 *               nombre: { type: string }
 *               telefono: { type: string }
 *               departamento: { type: string }
 *               cargo: { type: string }
 *               empresa_id: { type: integer }
 *     responses:
 *       200:
 *         description: Persona actualizada
 *       404:
 *         description: Persona no encontrada
 */
personasRouter.put('/:persona_id', requireAuth, ctrl.updatePersona);
