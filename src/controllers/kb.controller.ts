import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as service from '../services/kb.service';

export const getArticulosKB = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const categoria = (req.query.categoria as string) || '';

    const result = await service.getArticulosKB(search, categoria, page, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ detail: 'Error al obtener la base de conocimientos', error: err.message });
  }
};

export const getArticuloKBById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const item = await service.getArticuloKBById(id);
    if (!item) {
      res.status(404).json({ detail: 'Artículo de base de conocimientos no encontrado' });
      return;
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ detail: 'Error al obtener el artículo', error: err.message });
  }
};

export const createArticuloKB = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await service.createArticuloKB(req.body, req.currentUser);
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ detail: 'Error al publicar artículo en la base de conocimientos', error: err.message });
  }
};

export const updateArticuloKB = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const item = await service.updateArticuloKB(id, req.body);
    if (!item) {
      res.status(404).json({ detail: 'Artículo no encontrado' });
      return;
    }
    res.json(item);
  } catch (err: any) {
    res.status(400).json({ detail: 'Error al actualizar artículo', error: err.message });
  }
};

export const deleteArticuloKB = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const item = await service.deleteArticuloKB(id);
    if (!item) {
      res.status(404).json({ detail: 'Artículo no encontrado' });
      return;
    }
    res.json({ message: 'Artículo de base de conocimientos eliminado correctamente' });
  } catch (err: any) {
    res.status(500).json({ detail: 'Error al eliminar artículo', error: err.message });
  }
};
