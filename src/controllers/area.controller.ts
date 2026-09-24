import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as areaService from '../services/area.service';

export const getAreas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, page, limit, onlyActive } = req.query;
    const result = await areaService.getAreas({
      search: search ? String(search) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      onlyActive: onlyActive === 'true' || onlyActive === '1'
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error al listar áreas:', error);
    res.status(500).json({ detail: error.message || 'Error al listar áreas' });
  }
};

export const getAreaById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const area = await areaService.getAreaById(id);
    if (!area) {
      res.status(404).json({ detail: 'Área no encontrada' });
      return;
    }
    res.json(area);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || 'Error al obtener área' });
  }
};

export const createArea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.currentUser.rol_nombre)) {
      res.status(403).json({ detail: 'Solo los Administradores y Supervisores pueden crear áreas.' });
      return;
    }
    const { nombre, descripcion, is_active } = req.body;
    const area = await areaService.createArea({ nombre, descripcion, is_active });
    res.status(201).json(area);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || 'Error al crear área' });
  }
};

export const updateArea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.currentUser.rol_nombre)) {
      res.status(403).json({ detail: 'Solo los Administradores y Supervisores pueden modificar áreas.' });
      return;
    }
    const id = Number(req.params.id);
    const { nombre, descripcion, is_active } = req.body;
    const area = await areaService.updateArea(id, { nombre, descripcion, is_active });
    res.json(area);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || 'Error al actualizar área' });
  }
};

export const deleteArea = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.currentUser.rol_nombre)) {
      res.status(403).json({ detail: 'Solo los Administradores y Supervisores pueden eliminar áreas.' });
      return;
    }
    const id = Number(req.params.id);
    const deleted = await areaService.deleteArea(id);
    if (!deleted) {
      res.status(404).json({ detail: 'Área no encontrada o ya eliminada' });
      return;
    }
    res.json({ message: 'Área eliminada exitosamente' });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || 'Error al eliminar área' });
  }
};
