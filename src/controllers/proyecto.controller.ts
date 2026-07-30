import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as proyectoService from '../services/proyecto.service';
import path from 'path';
import fs from 'fs';

// --- CONTROLLERS DE PROYECTO ---
export const getProyectos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.query.page || req.query.limit) {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = (req.query.search as string) || '';
      const result = await proyectoService.getProyectos(req.currentUser, page, limit, search);
      res.json(result);
    } else {
      const proyectos = await proyectoService.getProyectos(req.currentUser);
      res.json(proyectos);
    }
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const getProyectoById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.proyecto_id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de proyecto inválido.' });
      return;
    }
    const proyecto = await proyectoService.getProyectoById(id, req.currentUser);
    if (!proyecto) {
      res.status(404).json({ detail: 'Proyecto no encontrado.' });
      return;
    }
    res.json(proyecto);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const createProyecto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre, descripcion, fecha_fin_estimada, tipo_proyecto, ticket_origen_id, miembros } = req.body;
    if (!nombre || !fecha_fin_estimada) {
      res.status(400).json({ detail: 'El nombre y la fecha estimada de fin son obligatorios.' });
      return;
    }
    const proyecto = await proyectoService.createProyecto(
      { nombre, descripcion, fecha_fin_estimada, tipo_proyecto, ticket_origen_id, miembros },
      req.currentUser
    );
    res.status(201).json(proyecto);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const updateProyecto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.proyecto_id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de proyecto inválido.' });
      return;
    }
    const proyecto = await proyectoService.updateProyecto(id, req.body, req.currentUser);
    if (!proyecto) {
      res.status(404).json({ detail: 'Proyecto no encontrado.' });
      return;
    }
    res.json(proyecto);
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

export const deleteProyecto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.proyecto_id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de proyecto inválido.' });
      return;
    }
    const success = await proyectoService.deleteProyecto(id, req.currentUser);
    if (!success) {
      res.status(404).json({ detail: 'Proyecto no encontrado.' });
      return;
    }
    res.json({ message: 'Proyecto eliminado con éxito.' });
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

// --- CONTROLLERS DE TAREA ---
export const createTarea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { proyecto_id, titulo, descripcion, fecha_fin, responsable_id } = req.body;
    if (!proyecto_id || !titulo || !fecha_fin || !responsable_id) {
      res.status(400).json({ detail: 'Todos los campos (proyecto_id, titulo, fecha_fin, responsable_id) son obligatorios.' });
      return;
    }
    const tarea = await proyectoService.createTarea(
      { proyecto_id: parseInt(proyecto_id), titulo, descripcion, fecha_fin, responsable_id: parseInt(responsable_id) },
      req.currentUser
    );
    if (!tarea) {
      res.status(404).json({ detail: 'Proyecto padre no encontrado.' });
      return;
    }
    res.status(201).json(tarea);
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    if (error.message.startsWith('400:')) {
      res.status(400).json({ detail: error.message.replace('400:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

export const updateTarea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.tarea_id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de tarea inválido.' });
      return;
    }
    const tarea = await proyectoService.updateTarea(id, req.body, req.currentUser);
    if (!tarea) {
      res.status(404).json({ detail: 'Tarea no encontrada.' });
      return;
    }
    res.json(tarea);
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    if (error.message.startsWith('400:')) {
      res.status(400).json({ detail: error.message.replace('400:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

export const deleteTarea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.tarea_id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de tarea inválido.' });
      return;
    }
    const success = await proyectoService.deleteTarea(id, req.currentUser);
    if (!success) {
      res.status(404).json({ detail: 'Tarea no encontrada.' });
      return;
    }
    res.json({ message: 'Tarea eliminada con éxito.' });
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

// --- CONTROLLERS DE SUBTAREA ---
export const createSubtarea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tarea_id, titulo, descripcion, fecha_fin, responsable_id } = req.body;
    if (!tarea_id || !titulo || !fecha_fin || !responsable_id) {
      res.status(400).json({ detail: 'Todos los campos (tarea_id, titulo, fecha_fin, responsable_id) son obligatorios.' });
      return;
    }
    const sub = await proyectoService.createSubtarea(
      { tarea_id: parseInt(tarea_id), titulo, descripcion, fecha_fin, responsable_id: parseInt(responsable_id) },
      req.currentUser
    );
    if (!sub) {
      res.status(404).json({ detail: 'Tarea padre no encontrada.' });
      return;
    }
    res.status(201).json(sub);
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    if (error.message.startsWith('400:')) {
      res.status(400).json({ detail: error.message.replace('400:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

export const updateSubtarea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.subtarea_id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de subtarea inválido.' });
      return;
    }
    const sub = await proyectoService.updateSubtarea(id, req.body, req.currentUser);
    if (!sub) {
      res.status(404).json({ detail: 'Subtarea no encontrada.' });
      return;
    }
    res.json(sub);
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    if (error.message.startsWith('400:')) {
      res.status(400).json({ detail: error.message.replace('400:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

export const deleteSubtarea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.subtarea_id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de subtarea inválido.' });
      return;
    }
    const success = await proyectoService.deleteSubtarea(id, req.currentUser);
    if (!success) {
      res.status(404).json({ detail: 'Subtarea no encontrada.' });
      return;
    }
    res.json({ message: 'Subtarea eliminada con éxito.' });
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

// --- BUZON / INBOX ---
export const getInbox = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const inbox = await proyectoService.getInbox(req.currentUser.id);
    res.json(inbox);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

// --- COMENTARIOS ---
export const addComentario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { proyecto_id, tarea_id, subtarea_id, contenido } = req.body;
    if (!contenido) {
      res.status(400).json({ detail: 'El contenido del comentario es obligatorio.' });
      return;
    }
    const comentario = await proyectoService.addComentario({
      autor_id: req.currentUser.id,
      proyecto_id: proyecto_id ? parseInt(proyecto_id) : undefined,
      tarea_id: tarea_id ? parseInt(tarea_id) : undefined,
      subtarea_id: subtarea_id ? parseInt(subtarea_id) : undefined,
      contenido
    });
    res.status(201).json(comentario);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

// --- ARCHIVOS ---
export const addArchivo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ detail: 'No se ha subido ningún archivo.' });
      return;
    }
    const { proyecto_id, tarea_id, subtarea_id } = req.body;
    const archivo = await proyectoService.addArchivo({
      nombre_original: req.file.originalname,
      nombre_guardado: req.file.filename,
      mimetype: req.file.mimetype,
      tamano_bytes: req.file.size,
      autor_id: req.currentUser.id,
      proyecto_id: proyecto_id ? parseInt(proyecto_id) : undefined,
      tarea_id: tarea_id ? parseInt(tarea_id) : undefined,
      subtarea_id: subtarea_id ? parseInt(subtarea_id) : undefined
    });
    res.status(201).json(archivo);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

// --- ESCALAR TICKET A PROYECTO ---
export const escalarTicketAProyecto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticketId = parseInt(req.params.ticket_id);
    const { nombre, descripcion, fecha_fin_estimada, tipo_proyecto } = req.body;
    if (isNaN(ticketId) || !nombre || !fecha_fin_estimada) {
      res.status(400).json({ detail: 'Los campos ticket_id, nombre y fecha_fin_estimada son obligatorios.' });
      return;
    }
    const proyecto = await proyectoService.escalarTicketAProyecto(
      ticketId,
      { nombre, descripcion, fecha_fin_estimada, tipo_proyecto },
      req.currentUser
    );
    if (!proyecto) {
      res.status(404).json({ detail: 'Ticket de origen no encontrado.' });
      return;
    }
    res.status(201).json(proyecto);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

// --- ENVIAR REPORTES SEMANALES DE CORREO ---
export const enviarReporteSemanalTecnicos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await proyectoService.enviarReporteSemanalTecnicos();
    res.json({ message: 'Reportes semanales de correo enviados a todos los técnicos activos.' });
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const enviarReporteSemanalAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await proyectoService.enviarReporteSemanalAdmin();
    res.json({ message: 'Reportes semanales de correo enviados a todos los administradores activos.' });
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const descargarArchivo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.archivo_id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de archivo inválido.' });
      return;
    }
    const archivo = await proyectoService.getArchivoById(id);
    if (!archivo) {
      res.status(404).json({ detail: 'Archivo no encontrado.' });
      return;
    }

    const filepath = path.join(process.cwd(), 'uploads', archivo.nombre_guardado);
    if (!fs.existsSync(filepath)) {
      res.status(404).json({ detail: 'El archivo físico no se encuentra en el servidor.' });
      return;
    }

    res.download(filepath, archivo.nombre_original);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};
