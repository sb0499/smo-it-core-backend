import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as personaService from '../services/persona.service';

export const getPersonas = async (req: AuthRequest, res: Response): Promise<void> => {
  const search = (req.query.search as string) || '';
  if (req.query.page === undefined) {
    const skip = parseInt(req.query.skip as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10000;
    const personas = await personaService.getPersonas(skip, limit, search);
    res.json(personas);
    return;
  }
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await personaService.getPersonasPaginated(page, limit, search);
  res.json(result);
};

export const createPersona = async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await personaService.getPersonaByCedula(req.body.cedula);
  if (existing) {
    res.status(400).json({ detail: 'Esta cédula ya está registrada.' });
    return;
  }
  const persona = await personaService.createPersona(req.body);
  res.status(201).json(persona);
};

export const updatePersona = async (req: AuthRequest, res: Response): Promise<void> => {
  const personaId = parseInt(req.params.persona_id);
  const persona = await personaService.updatePersona(personaId, req.body);
  if (!persona) {
    res.status(404).json({ detail: 'Persona no encontrada' });
    return;
  }
  res.json(persona);
};
