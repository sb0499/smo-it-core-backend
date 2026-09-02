import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as service from '../services/tipo-equipo.service';

export const getTipoEquipos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = req.query;
    if (page && limit) {
      const pageNum = parseInt(String(page), 10) || 1;
      const limitNum = parseInt(String(limit), 10) || 10;
      const searchStr = search ? String(search) : '';
      const result = await service.getTipoEquipos(pageNum, limitNum, searchStr);
      res.json(result);
    } else {
      const list = await service.getTipoEquipos();
      res.json(list);
    }
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener tipos de equipo', error: error.message });
  }
};

export const createTipoEquipo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre } = req.body;
    if (!nombre) {
      res.status(400).json({ detail: 'El nombre es requerido.' });
      return;
    }
    const item = await service.createTipoEquipo({ nombre });
    res.status(201).json(item);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al crear tipo de equipo', error: error.message });
  }
};

export const updateTipoEquipo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.tipo_equipo_id);
    const { nombre } = req.body;
    if (!nombre) {
      res.status(400).json({ detail: 'El nombre es requerido.' });
      return;
    }
    const item = await service.updateTipoEquipo(id, { nombre });
    if (!item) {
      res.status(404).json({ detail: 'Tipo de equipo no encontrado.' });
      return;
    }
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al actualizar tipo de equipo', error: error.message });
  }
};

export const deleteTipoEquipo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.tipo_equipo_id);
    const item = await service.deleteTipoEquipo(id);
    if (!item) {
      res.status(404).json({ detail: 'Tipo de equipo no encontrado.' });
      return;
    }
    res.json({ message: 'Tipo de equipo eliminado con éxito', item });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al eliminar tipo de equipo', error: error.message });
  }
};
