import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as chatService from '../services/chat.service';

export const createCanal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre, is_private } = req.body;
    if (!nombre) {
      res.status(400).json({ detail: 'El nombre del canal es obligatorio.' });
      return;
    }
    const canal = await chatService.createCanal(nombre, !!is_private, req.currentUser.id);
    res.status(201).json(canal);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const getCanales = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const canales = await chatService.getCanales(req.currentUser.id, req.currentUser.rol_nombre);
    res.json(canales);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const unirMiembro = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const canalId = parseInt(req.params.canal_id);
    const usuarioId = parseInt(req.params.usuario_id);
    if (isNaN(canalId) || isNaN(usuarioId)) {
      res.status(400).json({ detail: 'Parámetros inválidos.' });
      return;
    }
    await chatService.unirMiembro(canalId, usuarioId);
    res.json({ message: 'Miembro añadido con éxito.' });
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const removerMiembro = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const canalId = parseInt(req.params.canal_id);
    const usuarioId = parseInt(req.params.usuario_id);
    if (isNaN(canalId) || isNaN(usuarioId)) {
      res.status(400).json({ detail: 'Parámetros inválidos.' });
      return;
    }
    await chatService.removerMiembro(canalId, usuarioId);
    res.json({ message: 'Miembro removido con éxito.' });
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const getCanalMiembros = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const canalId = parseInt(req.params.canal_id);
    if (isNaN(canalId)) {
      res.status(400).json({ detail: 'Canal ID inválido.' });
      return;
    }
    const miembros = await chatService.getCanalMiembros(canalId);
    res.json(miembros);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const getCanalMensajes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const canalId = parseInt(req.params.canal_id);
    if (isNaN(canalId)) {
      res.status(400).json({ detail: 'Canal ID inválido.' });
      return;
    }
    const mensajes = await chatService.getCanalMensajes(canalId, req.currentUser.id, req.currentUser.rol_nombre);
    if (!mensajes) {
      res.status(404).json({ detail: 'Canal no encontrado.' });
      return;
    }
    res.json(mensajes);
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};

export const addMensaje = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const canalId = parseInt(req.params.canal_id);
    const { mensaje } = req.body;
    if (isNaN(canalId) || !mensaje) {
      res.status(400).json({ detail: 'Parámetros inválidos o mensaje vacío.' });
      return;
    }
    const msg = await chatService.addMensaje(canalId, req.currentUser.id, req.currentUser.rol_nombre, mensaje);
    if (!msg) {
      res.status(404).json({ detail: 'Canal no encontrado.' });
      return;
    }
    res.status(201).json(msg);
  } catch (error: any) {
    if (error.message.startsWith('403:')) {
      res.status(403).json({ detail: error.message.replace('403:', '').trim() });
      return;
    }
    res.status(500).json({ detail: error.message });
  }
};
