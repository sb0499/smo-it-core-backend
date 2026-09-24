import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/ticket.controller';
import * as reporteDiarioCtrl from '../controllers/reporte-diario.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'tickets');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'ticket-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

export const ticketsRouter = Router();

/**
 * @openapi
 * /api/v1/tickets/upload:
 *   post:
 *     tags: [Tickets]
 *     summary: Subir archivos/evidencias de tickets temporalmente o antes de crear
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Archivos subidos exitosamente
 */
ticketsRouter.post('/upload', requireAuth, upload.array('archivos', 10), ctrl.uploadTicketFiles);

/**
 * @openapi
 * /api/v1/tickets/{ticket_id}/adjuntos:
 *   post:
 *     tags: [Tickets]
 *     summary: Adjuntar nuevos archivos/evidencias directamente a un ticket existente
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ticket_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Archivos adjuntados al ticket
 */
ticketsRouter.post('/:ticket_id/adjuntos', requireAuth, upload.array('archivos', 10), ctrl.addTicketAdjuntos);

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
ticketsRouter.get('/paginated', requireAuth, ctrl.getTicketsPaginated);

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

/**
 * @openapi
 * /api/v1/tickets/{ticket_id}/escalar-n2:
 *   post:
 *     tags: [Tickets]
 *     summary: Escalar un ticket a Nivel 2 (Asignación automática a N2)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ticket_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ticket escalado a Nivel 2 exitosamente
 *       404:
 *         description: Ticket no encontrado o no se pudo escalar
 */
ticketsRouter.post('/:ticket_id/escalar-n2', requireAuth, ctrl.escalarTicketAN2);
ticketsRouter.post('/:ticket_id/escalar-admin', requireAuth, ctrl.escalarTicketAAdmin);
ticketsRouter.post('/:ticket_id/escalar-proveedor', requireAuth, ctrl.escalarTicketAProveedor);
ticketsRouter.post('/:ticket_id/escalar-proyecto', requireAuth, ctrl.escalarTicketAProyecto);


/**
 * @openapi
 * /api/v1/tickets/reporte/semanal:
 *   get:
 *     tags: [Tickets]
 *     summary: Descargar reporte semanal de bitácoras de soportes en Excel
 *     description: Retorna un archivo Excel estilizado premium. Si es ADMIN ve todo; si es TECNICO ve solo lo suyo.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Archivo Excel con las bitácoras (.xlsx)
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
ticketsRouter.get('/reporte/semanal', requireAuth, ctrl.descargarReporteSemanal);

/**
 * @openapi
 * /api/v1/tickets/alertas/cierre-diario:
 *   post:
 *     tags: [Tickets]
 *     summary: Enviar recordatorios por correo a técnicos con tickets pendientes (Cierre Diario)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Recordatorios enviados exitosamente
 */
ticketsRouter.post('/alertas/cierre-diario', requireAuth, ctrl.ejecutarRecordatorioCierre);

/**
 * @openapi
 * /api/v1/tickets/reporte-diario/preview:
 *   get:
 *     tags: [Tickets]
 *     summary: Obtener resumen consolidado diario por técnico
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Resumen ejecutivo del día
 */
ticketsRouter.get('/reporte-diario/preview', requireAuth, reporteDiarioCtrl.getPreviewReporteDiario);

/**
 * @openapi
 * /api/v1/tickets/reporte-diario/excel:
 *   get:
 *     tags: [Tickets]
 *     summary: Descargar reporte diario en Excel con hojas por técnico
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Archivo Excel (.xlsx)
 */
ticketsRouter.get('/reporte-diario/excel', requireAuth, reporteDiarioCtrl.descargarReporteDiarioExcel);

/**
 * @openapi
 * /api/v1/tickets/reporte-diario/enviar-correo:
 *   post:
 *     tags: [Tickets]
 *     summary: Enviar reporte diario por correo a Administradores y Supervisores
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Confirmación de envío
 */
ticketsRouter.post('/reporte-diario/enviar-correo', requireAuth, reporteDiarioCtrl.enviarReporteDiarioEmail);

/**
 * @openapi
 * /api/v1/tickets/categorias:
 *   get:
 *     tags: [Tickets]
 *     summary: Obtener todas las categorías de soporte activas de la BD
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de categorías
 */
ticketsRouter.get('/categorias', requireAuth, ctrl.getCategorias);

