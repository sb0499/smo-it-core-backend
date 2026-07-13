import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as consumibleService from '../services/consumible.service';

import { pool } from '../db/connection';

export const getConsumibles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';

    let empresaIds: number[] | undefined = undefined;
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO' && req.currentUser.nivel_soporte === 'N1') {
      const [rows] = await pool.query<any[]>(
        'SELECT empresa_id FROM usuario_empresa WHERE usuario_id = ?',
        [req.currentUser.id]
      );
      empresaIds = rows.map(r => r.empresa_id);
    }

    const result = await consumibleService.getConsumibles(page, limit, search, empresaIds);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener consumibles', error: error.message });
  }
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
