import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/proyecto.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Asegurar que el directorio de descargas exista
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configuración de almacenamiento Multer para carga de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'file-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

export const proyectosRouter = Router();

proyectosRouter.use(requireAuth, requireAdminOrTecnico);

/**
 * @openapi
 * tags:
 *   name: Proyectos
 *   description: Módulo avanzado de gestión de Proyectos, Tareas, Subtareas, Historial e Inbox
 */

/**
 * @openapi
 * /api/v1/proyectos/:
 *   get:
 *     tags: [Proyectos]
 *     summary: Listar todos los proyectos
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Listado de proyectos
 */
proyectosRouter.get('/', requireAuth, ctrl.getProyectos);

/**
 * @openapi
 * /api/v1/proyectos/inbox:
 *   get:
 *     tags: [Proyectos]
 *     summary: Obtener el Inbox de tareas y subtareas del usuario actual
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Inbox del usuario segmentado por pestañas/estados
 */
proyectosRouter.get('/inbox', requireAuth, ctrl.getInbox);

/**
 * @openapi
 * /api/v1/proyectos/{proyecto_id}:
 *   get:
 *     tags: [Proyectos]
 *     summary: Obtener el detalle completo de un proyecto (incluye Tareas, Subtareas, Comentarios, Archivos e Historial)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: proyecto_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalle del proyecto
 *       404:
 *         description: Proyecto no encontrado
 */
proyectosRouter.get('/:proyecto_id', requireAuth, ctrl.getProyectoById);

/**
 * @openapi
 * /api/v1/proyectos/:
 *   post:
 *     tags: [Proyectos]
 *     summary: Crear un nuevo proyecto (Cualquier usuario puede crearlo)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, fecha_fin_estimada]
 *             properties:
 *               nombre: { type: string, example: "Renovación Servidor Central SMO" }
 *               descripcion: { type: string, example: "Migración del servidor principal físico de la sede a un clúster virtualizado." }
 *               fecha_fin_estimada: { type: string, format: date-time, example: "2026-06-30T18:00:00Z" }
 *               tipo_proyecto: { type: string, example: "Infraestructura" }
 *     responses:
 *       201:
 *         description: Proyecto creado exitosamente
 */
proyectosRouter.post('/', requireAuth, ctrl.createProyecto);

/**
 * @openapi
 * /api/v1/proyectos/{proyecto_id}:
 *   put:
 *     tags: [Proyectos]
 *     summary: Modificar información de un proyecto (Solo creador o admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: proyecto_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               fecha_fin_estimada: { type: string, format: date-time }
 *               estado: { type: string, enum: ['Stand By', 'Sin Iniciar', 'En Proceso', 'Pruebas', 'Finalizado'] }
 *               tipo_proyecto: { type: string }
 *     responses:
 *       200:
 *         description: Proyecto actualizado exitosamente
 *       403:
 *         description: No tienes permisos para modificar este proyecto
 */
proyectosRouter.put('/:proyecto_id', requireAuth, ctrl.updateProyecto);

/**
 * @openapi
 * /api/v1/proyectos/{proyecto_id}:
 *   delete:
 *     tags: [Proyectos]
 *     summary: Eliminar un proyecto (Solo creador o admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: proyecto_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Proyecto eliminado exitosamente
 *       403:
 *         description: No tienes permisos para eliminar este proyecto
 */
proyectosRouter.delete('/:proyecto_id', requireAuth, ctrl.deleteProyecto);

/**
 * @openapi
 * /api/v1/proyectos/tareas:
 *   post:
 *     tags: [Proyectos]
 *     summary: Agregar una nueva Tarea a un proyecto (Solo creador o admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proyecto_id, titulo, fecha_fin, responsable_id]
 *             properties:
 *               proyecto_id: { type: integer }
 *               titulo: { type: string, example: "Configurar Servidores DNS" }
 *               descripcion: { type: string }
 *               fecha_fin: { type: string, format: date-time, example: "2026-06-15T18:00:00Z" }
 *               responsable_id: { type: integer }
 *     responses:
 *       201:
 *         description: Tarea creada exitosamente
 *       400:
 *         description: Fecha de fin de tarea excede la del proyecto padre
 */
proyectosRouter.post('/tareas', requireAuth, ctrl.createTarea);

/**
 * @openapi
 * /api/v1/proyectos/tareas/{tarea_id}:
 *   put:
 *     tags: [Proyectos]
 *     summary: Modificar una tarea (Creador/Admin edita todo; responsable técnico SOLO edita estado y avance)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: tarea_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo: { type: string }
 *               descripcion: { type: string }
 *               fecha_fin: { type: string, format: date-time }
 *               estado: { type: string, enum: ['Stand By', 'Sin Iniciar', 'En Proceso', 'Pruebas', 'Finalizado'] }
 *               avance_porcentaje: { type: integer }
 *               responsable_id: { type: integer }
 *     responses:
 *       200:
 *         description: Tarea actualizada exitosamente
 */
proyectosRouter.put('/tareas/:tarea_id', requireAuth, ctrl.updateTarea);

/**
 * @openapi
 * /api/v1/proyectos/tareas/{tarea_id}:
 *   delete:
 *     tags: [Proyectos]
 *     summary: Eliminar una tarea (Solo creador o admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: tarea_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Tarea eliminada exitosamente
 */
proyectosRouter.delete('/tareas/:tarea_id', requireAuth, ctrl.deleteTarea);

/**
 * @openapi
 * /api/v1/proyectos/subtareas:
 *   post:
 *     tags: [Proyectos]
 *     summary: Agregar una nueva Subtarea a una tarea (Solo creador o admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tarea_id, titulo, fecha_fin, responsable_id]
 *             properties:
 *               tarea_id: { type: integer }
 *               titulo: { type: string, example: "Revisar Zonas DNS Actuales" }
 *               descripcion: { type: string }
 *               fecha_fin: { type: string, format: date-time, example: "2026-06-10T18:00:00Z" }
 *               responsable_id: { type: integer }
 *     responses:
 *       201:
 *         description: Subtarea creada exitosamente
 */
proyectosRouter.post('/subtareas', requireAuth, ctrl.createSubtarea);

/**
 * @openapi
 * /api/v1/proyectos/subtareas/{subtarea_id}:
 *   put:
 *     tags: [Proyectos]
 *     summary: Modificar una subtarea (Creador/Admin edita todo; responsable técnico SOLO edita estado y avance)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subtarea_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo: { type: string }
 *               descripcion: { type: string }
 *               fecha_fin: { type: string, format: date-time }
 *               estado: { type: string, enum: ['Stand By', 'Sin Iniciar', 'En Proceso', 'Pruebas', 'Finalizado'] }
 *               avance_porcentaje: { type: integer }
 *               responsable_id: { type: integer }
 *     responses:
 *       200:
 *         description: Subtarea actualizada exitosamente
 */
proyectosRouter.put('/subtareas/:subtarea_id', requireAuth, ctrl.updateSubtarea);

/**
 * @openapi
 * /api/v1/proyectos/subtareas/{subtarea_id}:
 *   delete:
 *     tags: [Proyectos]
 *     summary: Eliminar una subtarea (Solo creador o admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subtarea_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Subtarea eliminada exitosamente
 */
proyectosRouter.delete('/subtareas/:subtarea_id', requireAuth, ctrl.deleteSubtarea);

/**
 * @openapi
 * /api/v1/proyectos/comentarios:
 *   post:
 *     tags: [Proyectos]
 *     summary: Agregar un comentario a un Proyecto, Tarea o Subtarea (Soporta menciones @email para notificar)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contenido]
 *             properties:
 *               proyecto_id: { type: integer }
 *               tarea_id: { type: integer }
 *               subtarea_id: { type: integer }
 *               contenido: { type: string, example: "Revisar esto urgente @santi@smo.com" }
 *     responses:
 *       201:
 *         description: Comentario creado y notificaciones enviadas si aplica
 */
proyectosRouter.post('/comentarios', requireAuth, ctrl.addComentario);

/**
 * @openapi
 * /api/v1/proyectos/archivos:
 *   post:
 *     tags: [Proyectos]
 *     summary: Cargar un archivo a un Proyecto, Tarea o Subtarea
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [archivo]
 *             properties:
 *               proyecto_id: { type: integer }
 *               tarea_id: { type: integer }
 *               subtarea_id: { type: integer }
 *               archivo: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Archivo cargado y guardado exitosamente
 */
proyectosRouter.post('/archivos', requireAuth, upload.single('archivo'), ctrl.addArchivo);

/**
 * @openapi
 * /api/v1/proyectos/escalar-ticket/{ticket_id}:
 *   post:
 *     tags: [Proyectos]
 *     summary: Escalar un ticket grave y convertirlo en un Proyecto enlazado (Ticket pasa a "Escalado a Proyecto")
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ticket_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, fecha_fin_estimada]
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               fecha_fin_estimada: { type: string, format: date-time }
 *               tipo_proyecto: { type: string }
 *     responses:
 *       201:
 *         description: Proyecto creado y ticket escalado exitosamente
 */
proyectosRouter.post('/escalar-ticket/:ticket_id', requireAuth, ctrl.escalarTicketAProyecto);

/**
 * @openapi
 * /api/v1/proyectos/reportes/semanal-tecnicos:
 *   post:
 *     tags: [Proyectos]
 *     summary: Disparar manualmente el envío de reportes semanales de correo a los técnicos asignados
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Reportes de técnicos enviados
 */
proyectosRouter.post('/reportes/semanal-tecnicos', requireAuth, ctrl.enviarReporteSemanalTecnicos);

/**
 * @openapi
 * /api/v1/proyectos/reportes/semanal-admin:
 *   post:
 *     tags: [Proyectos]
 *     summary: Disparar manualmente el envío de reportes semanales generales a los administradores
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Reportes de administradores enviados
 */
proyectosRouter.post('/reportes/semanal-admin', requireAuth, ctrl.enviarReporteSemanalAdmin);
