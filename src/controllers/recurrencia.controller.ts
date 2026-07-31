import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as service from '../services/recurrencia.service';

export const getSoportesRecurrentes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';

    const result = await service.getSoportesRecurrentes(req.currentUser, page, limit, search);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ detail: 'Error al obtener soportes recurrentes', error: err.message });
  }
};

export const createSoporteRecurrente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await service.createSoporteRecurrente(req.body);
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ detail: 'Error al registrar soporte recurrente', error: err.message });
  }
};

export const updateSoporteRecurrente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.recurrencia_id);
    const item = await service.updateSoporteRecurrente(id, req.body);
    if (!item) {
      res.status(404).json({ detail: 'Soporte recurrente no encontrado' });
      return;
    }
    res.json(item);
  } catch (err: any) {
    res.status(400).json({ detail: 'Error al actualizar soporte recurrente', error: err.message });
  }
};

export const deleteSoporteRecurrente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.recurrencia_id);
    const item = await service.deleteSoporteRecurrente(id);
    if (!item) {
      res.status(404).json({ detail: 'Soporte recurrente no encontrado' });
      return;
    }
    res.json({ message: 'Soporte recurrente eliminado correctamente' });
  } catch (err: any) {
    res.status(500).json({ detail: 'Error al eliminar soporte recurrente', error: err.message });
  }
};
