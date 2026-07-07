import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/recurrencia.controller';

export const recurrenciaRouter = Router();

/**
 * @openapi
 * /api/v1/soportes-recurrentes/:
 *   get:
 *     tags: [Soportes Recurrentes]
 *     summary: Listar todas las programaciones de soporte recurrente (ADMIN - TECNICO)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de soportes recurrentes
 */
recurrenciaRouter.get('/', requireAuth, requireAdminOrTecnico, ctrl.getSoportesRecurrentes);

/**
 * @openapi
 * /api/v1/soportes-recurrentes/:
 *   post:
 *     tags: [Soportes Recurrentes]
 *     summary: Crear una programación de soporte recurrente (ADMIN - TECNICO)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [titulo, descripcion, categoria, frecuencia, fecha_inicio]
 *             properties:
 *               titulo: { type: string }
 *               descripcion: { type: string }
 *               categoria: { type: string }
 *               empresa_id: { type: integer, nullable: true }
 *               area_solicitante: { type: string, nullable: true }
 *               persona_solicitante: { type: string, nullable: true }
 *               prioridad: { type: string, enum: [Baja, Media, Alta, Critica], default: Media }
 *               frecuencia: { type: string, enum: [Diario, Semanal, Mensual, Trimestral, Semestral, Anual] }
 *               fecha_inicio: { type: string, format: date }
 *               is_active: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Soporte recurrente programado
 */
recurrenciaRouter.post('/', requireAuth, requireAdminOrTecnico, ctrl.createSoporteRecurrente);

/**
 * @openapi
 * /api/v1/soportes-recurrentes/{recurrencia_id}:
 *   put:
 *     tags: [Soportes Recurrentes]
 *     summary: Actualizar una programación de soporte recurrente (ADMIN - TECNICO)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: recurrencia_id
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
 *               empresa_id: { type: integer }
 *               area_solicitante: { type: string }
 *               persona_solicitante: { type: string }
 *               prioridad: { type: string }
 *               frecuencia: { type: string }
 *               fecha_inicio: { type: string }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Soporte recurrente actualizado
 *       404:
 *         description: No encontrado
 */
recurrenciaRouter.put('/:recurrencia_id', requireAuth, requireAdminOrTecnico, ctrl.updateSoporteRecurrente);

/**
 * @openapi
 * /api/v1/soportes-recurrentes/{recurrencia_id}:
 *   delete:
 *     tags: [Soportes Recurrentes]
 *     summary: Eliminar una programación de soporte recurrente (ADMIN - TECNICO)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: recurrencia_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Programación eliminada
 *       404:
 *         description: No encontrado
 */
recurrenciaRouter.delete('/:recurrencia_id', requireAuth, requireAdminOrTecnico, ctrl.deleteSoporteRecurrente);
