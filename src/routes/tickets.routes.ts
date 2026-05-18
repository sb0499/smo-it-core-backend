import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/ticket.controller';

export const ticketsRouter = Router();

/**
 * @openapi
 * /api/v1/tickets/:
 *   get:
 *     tags: [Tickets]
 *     summary: Listar todos los tickets
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
 *         description: Lista de tickets
 */
ticketsRouter.get('/', requireAuth, ctrl.getTickets);

/**
 * @openapi
 * /api/v1/tickets/:
 *   post:
 *     tags: [Tickets]
 *     summary: Crear ticket (con asignación automática de técnico)
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
 *               empresa_id: { type: integer, nullable: true }
 *               area_solicitante: { type: string, nullable: true }
 *               persona_solicitante: { type: string, nullable: true }
 *               medio_solicitud:
 *                 type: string
 *                 enum: [Plataforma, WhatsApp, Llamada, Correo, Presencial, "Automático (Recurrente)"]
 *               fecha_final_tentativa: { type: string, format: date-time, nullable: true }
 *               avance_proceso: { type: integer, default: 0 }
 *               observaciones: { type: string, nullable: true }
 *               prioridad:
 *                 type: string
 *                 enum: [Baja, Media, Alta, Critica]
 *               estado:
 *                 type: string
 *                 enum: [Nuevo, Pendiente, Pruebas, Finalizada]
 *               tecnico_id: { type: integer, nullable: true }
 *     responses:
 *       201:
 *         description: Ticket creado
 */
ticketsRouter.post('/', requireAuth, ctrl.createTicket);

/**
 * @openapi
 * /api/v1/tickets/{ticket_id}:
 *   put:
 *     tags: [Tickets]
 *     summary: Actualizar ticket
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ticket_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo: { type: string }
 *               estado:
 *                 type: string
 *                 enum: [Nuevo, Pendiente, Pruebas, Finalizada]
 *               avance_proceso: { type: integer }
 *               observaciones: { type: string }
 *               tecnico_id: { type: integer }
 *               bitacora_dinamica:
 *                 type: array
 *                 items: { type: object }
 *     responses:
 *       200:
 *         description: Ticket actualizado
 *       404:
 *         description: Ticket no encontrado
 */
ticketsRouter.put('/:ticket_id', requireAuth, ctrl.updateTicket);
