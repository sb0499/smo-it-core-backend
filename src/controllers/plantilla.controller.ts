import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as plantillaService from '../services/plantilla.service';

export const getPlantillas = async (_req: AuthRequest, res: Response): Promise<void> => {
  const plantillas = await plantillaService.getPlantillas();
  res.json(plantillas);
};

export const getPlantillasActivas = async (_req: AuthRequest, res: Response): Promise<void> => {
  const plantillas = await plantillaService.getPlantillasActivas();
  res.json(plantillas);
};

export const createPlantilla = async (req: AuthRequest, res: Response): Promise<void> => {
  const plantilla = await plantillaService.createPlantilla(req.body);
  res.status(201).json(plantilla);
};

export const updatePlantilla = async (req: AuthRequest, res: Response): Promise<void> => {
  const plantillaId = parseInt(req.params.plantilla_id);
  const plantilla = await plantillaService.updatePlantilla(plantillaId, req.body);
  if (!plantilla) {
    res.status(404).json({ detail: 'Plantilla no encontrada' });
    return;
  }
  res.json(plantilla);
};

export const deletePlantilla = async (req: AuthRequest, res: Response): Promise<void> => {
  const plantillaId = parseInt(req.params.plantilla_id);
  const plantilla = await plantillaService.deletePlantilla(plantillaId);
  if (!plantilla) {
    res.status(404).json({ detail: 'Plantilla no encontrada' });
    return;
  }
  res.json({ message: 'Plantilla eliminada correctamente' });
};
