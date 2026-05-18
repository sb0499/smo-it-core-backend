import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as guardiaService from '../services/guardia.service';

export const getGuardias = async (req: AuthRequest, res: Response): Promise<void> => {
  const skip = parseInt(req.query.skip as string) || 0;
  const limit = parseInt(req.query.limit as string) || 100;
  const guardias = await guardiaService.getGuardias(skip, limit);
  res.json(guardias);
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
