import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/chat.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const chatsRouter = Router();

chatsRouter.use(requireAuth, requireAdminOrTecnico);

/**
 * @openapi
 * tags:
 *   name: Chats
 *   description: Sistema de comunicación interno estilo Slack/Discord con canales y mensajería
 */

/**
 * @openapi
 * /api/v1/chats/canales:
 *   post:
 *     tags: [Chats]
 *     summary: Crear un nuevo canal de chat (Público o Privado)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string, example: "soporte-tecnico" }
 *               is_private: { type: boolean, example: false }
 *     responses:
 *       201:
 *         description: Canal creado exitosamente
 *       400:
 *         description: Nombre de canal faltante
 */
chatsRouter.post('/canales', requireAuth, ctrl.createCanal);

/**
 * @openapi
 * /api/v1/chats/canales:
 *   get:
 *     tags: [Chats]
 *     summary: Obtener canales visibles para el usuario actual (Públicos + Privados donde es miembro)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Listado de canales
 */
chatsRouter.get('/canales', requireAuth, ctrl.getCanales);

/**
 * @openapi
 * /api/v1/chats/canales/{canal_id}/miembros/{usuario_id}:
 *   post:
 *     tags: [Chats]
 *     summary: Añadir a un usuario a un canal de chat
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: canal_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: usuario_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Miembro añadido exitosamente
 */
chatsRouter.post('/canales/:canal_id/miembros/:usuario_id', requireAuth, ctrl.unirMiembro);

/**
 * @openapi
 * /api/v1/chats/canales/{canal_id}/miembros/{usuario_id}:
 *   delete:
 *     tags: [Chats]
 *     summary: Remover/Salir de un canal de chat
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: canal_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: usuario_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Miembro removido exitosamente
 */
chatsRouter.delete('/canales/:canal_id/miembros/:usuario_id', requireAuth, ctrl.removerMiembro);

/**
 * @openapi
 * /api/v1/chats/canales/{canal_id}/miembros:
 *   get:
 *     tags: [Chats]
 *     summary: Obtener la lista de miembros de un canal de chat
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: canal_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de miembros del canal
 */
chatsRouter.get('/canales/:canal_id/miembros', requireAuth, ctrl.getCanalMiembros);

/**
 * @openapi
 * /api/v1/chats/canales/{canal_id}/mensajes:
 *   get:
 *     tags: [Chats]
 *     summary: Obtener el historial de mensajes de un canal
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: canal_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de mensajes del canal
 *       403:
 *         description: No tienes acceso a este canal privado
 */
chatsRouter.get('/canales/:canal_id/mensajes', requireAuth, ctrl.getCanalMensajes);

/**
 * @openapi
 * /api/v1/chats/canales/{canal_id}/mensajes:
 *   post:
 *     tags: [Chats]
 *     summary: Enviar un mensaje a un canal
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: canal_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mensaje]
 *             properties:
 *               mensaje: { type: string, example: "Hola a todos, ¿cómo va el avance del sprint?" }
 *     responses:
 *       201:
 *         description: Mensaje enviado y guardado exitosamente
 *       403:
 *         description: No tienes acceso a este canal privado
 */
chatsRouter.post('/canales/:canal_id/mensajes', requireAuth, upload.single('archivo'), ctrl.addMensaje);

/**
 * @openapi
 * /api/v1/chats/dm:
 *   post:
 *     tags: [Chats]
 *     summary: Iniciar o recuperar un canal de chat directo (DM) uno a uno con otro usuario
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usuario_id]
 *             properties:
 *               usuario_id: { type: integer, example: 10 }
 *     responses:
 *       200:
 *         description: Canal de chat directo devuelto exitosamente
 */
chatsRouter.post('/dm', requireAuth, ctrl.getOrCreateDMChannel);

export default chatsRouter;
