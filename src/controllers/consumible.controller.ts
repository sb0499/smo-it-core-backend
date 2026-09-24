import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as consumibleService from '../services/consumible.service';

import { pool } from '../db/connection';

export const getConsumibles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const criticalOnly = req.query.criticalOnly === 'true';

    let empresaIds: number[] | undefined = undefined;
    if (req.currentUser && req.currentUser.rol_nombre !== 'ADMIN') {
      const [rows] = await pool.query<any[]>(
        'SELECT empresa_id FROM usuario_empresa WHERE usuario_id = ?',
        [req.currentUser.id]
      );
      if (rows.length > 0) {
        empresaIds = rows.map(r => r.empresa_id);
      }
    }

    const result = await consumibleService.getConsumibles(page, limit, search, empresaIds, criticalOnly);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener suministros', error: error.message });
  }
};

export const getConsumibleById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id || req.params.consumible_id);
    const item = await consumibleService.getConsumibleById(id);
    if (!item) {
      res.status(404).json({ detail: 'Suministro no encontrado' });
      return;
    }
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener el suministro', error: error.message });
  }
};

export const createConsumible = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuarioId = req.currentUser?.id;
    const consumible = await consumibleService.createConsumible(req.body, usuarioId);
    res.status(201).json(consumible);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al crear suministro', error: error.message });
  }
};

export const updateConsumible = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id || req.params.consumible_id);
    const updated = await consumibleService.updateConsumible(id, req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al actualizar suministro', error: error.message });
  }
};

export const usarConsumible = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id || req.params.consumible_id);
    const { cantidad, motivo } = req.body;
    const usuarioId = req.currentUser?.id;
    const item = await consumibleService.usarConsumible(id, cantidad, motivo, usuarioId);
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al registrar uso de suministro', error: error.message });
  }
};

export const restockConsumible = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id || req.params.consumible_id);
    const { cantidad, precio_unitario, motivo } = req.body;
    const usuarioId = req.currentUser?.id;
    const item = await consumibleService.restockConsumible(id, cantidad, precio_unitario, motivo, usuarioId);
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al registrar restock de suministro', error: error.message });
  }
};

export const getHistorialConsumible = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id || req.params.consumible_id);
    const historial = await consumibleService.getHistorialConsumible(id);
    res.json(historial);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener la bitácora del suministro', error: error.message });
  }
};

export const updateStock = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const consumibleId = parseInt(req.params.consumible_id || req.params.id);
    const cantidad = parseInt(req.query.cantidad as string);
    const usuarioId = req.currentUser?.id;
    const consumible = await consumibleService.ajustarStock(consumibleId, cantidad, usuarioId);
    if (!consumible) {
      res.status(404).json({ detail: 'Suministro no encontrado' });
      return;
    }
    res.json(consumible);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al ajustar stock', error: error.message });
  }
};

export const deleteConsumible = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id || req.params.consumible_id);
    await consumibleService.deleteConsumible(id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al eliminar suministro', error: error.message });
  }
};
