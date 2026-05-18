import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as consumibleService from '../services/consumible.service';

export const getConsumibles = async (_req: AuthRequest, res: Response): Promise<void> => {
  const consumibles = await consumibleService.getConsumibles();
  res.json(consumibles);
};

export const createConsumible = async (req: AuthRequest, res: Response): Promise<void> => {
  const consumible = await consumibleService.createConsumible(req.body);
  res.status(201).json(consumible);
};

export const updateStock = async (req: AuthRequest, res: Response): Promise<void> => {
  const consumibleId = parseInt(req.params.consumible_id);
  const cantidad = parseInt(req.query.cantidad as string);
  const consumible = await consumibleService.ajustarStock(consumibleId, cantidad);
  if (!consumible) {
    res.status(404).json({ detail: 'Consumible no encontrado' });
    return;
  }
  res.json(consumible);
};
