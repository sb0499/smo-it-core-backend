import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as slaService from '../services/sla.service';

export const getSlaConfigs = async (req: Request, res: Response): Promise<void> => {
  try {
    const configs = await slaService.getSlaConfigs();
    res.json(configs);
  } catch (error: any) {
    console.error('Error al obtener configuraciones de SLA:', error);
    res.status(500).json({ detail: error.message || 'Error al obtener configuraciones de SLA' });
  }
};

export const updateSlaConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.currentUser.rol_nombre)) {
      res.status(403).json({ detail: 'Solo los Administradores y Supervisores pueden modificar los tiempos de SLA.' });
      return;
    }
    const id = Number(req.params.id);
    const { tiempo_horas, descripcion } = req.body;
    const updated = await slaService.updateSlaConfig(id, { tiempo_horas, descripcion });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || 'Error al actualizar SLA' });
  }
};

export const bulkUpdateSlaConfigs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.currentUser.rol_nombre)) {
      res.status(403).json({ detail: 'Solo los Administradores y Supervisores pueden modificar los tiempos de SLA.' });
      return;
    }
    const { configs } = req.body;
    if (!Array.isArray(configs)) {
      res.status(400).json({ detail: 'Se espera un arreglo de configuraciones' });
      return;
    }
    const updated = await slaService.bulkUpdateSlaConfigs(configs);
    res.json({ message: 'Tiempos de SLA actualizados exitosamente', configs: updated });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || 'Error al actualizar tiempos de SLA' });
  }
};
