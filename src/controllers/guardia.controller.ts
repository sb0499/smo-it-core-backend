import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as guardiaService from '../services/guardia.service';

export const getGuardias = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.query.page || req.query.limit) {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await guardiaService.getGuardias(page, limit);
      res.json(result);
    } else {
      const guardias = await guardiaService.getGuardias();
      res.json(guardias);
    }
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const createGuardia = async (req: AuthRequest, res: Response): Promise<void> => {
  const guardia = await guardiaService.createGuardia(req.body);
  res.status(201).json(guardia);
};

export const deleteGuardia = async (req: AuthRequest, res: Response): Promise<void> => {
  const guardiaId = parseInt(req.params.guardia_id);
  const guardia = await guardiaService.deleteGuardia(guardiaId);
  if (!guardia) {
    res.status(404).json({ detail: 'Guardia no encontrada' });
    return;
  }
  res.json({ message: 'Guardia eliminada correctamente' });
};
