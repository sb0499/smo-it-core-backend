import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as proyectoService from '../services/proyecto.service';

export const createProyecto = async (req: AuthRequest, res: Response): Promise<void> => {
  const proyecto = await proyectoService.createProyecto(req.body);
  res.status(201).json(proyecto);
};

export const escalarTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  const ticketId = parseInt(req.params.ticket_id);
  const proyectoId = parseInt(req.query.proyecto_id as string);
  const responsableId = parseInt(req.query.responsable_id as string);
  const tarea = await proyectoService.escalarTicketATarea(ticketId, proyectoId, responsableId);
  if (!tarea) {
    res.status(404).json({ detail: 'No se pudo escalar el ticket' });
    return;
  }
  res.status(201).json(tarea);
};
