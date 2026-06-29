import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as notificacionService from '../services/notificacion.service';

export const getNotificaciones = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.currentUser) {
    res.status(401).json({ detail: 'No autorizado' });
    return;
  }
  const list = await notificacionService.getNotificaciones(req.currentUser.id);
  res.json(list);
};

export const marcarLeida = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.currentUser) {
    res.status(401).json({ detail: 'No autorizado' });
    return;
  }
  const notifId = parseInt(req.params.id);
  const success = await notificacionService.marcarLeida(notifId, req.currentUser.id);
  if (!success) {
    res.status(404).json({ detail: 'Notificación no encontrada o no pertenece al usuario' });
    return;
  }
  res.json({ success: true });
};

export const marcarTodasLeidas = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.currentUser) {
    res.status(401).json({ detail: 'No autorizado' });
    return;
  }
  await notificacionService.marcarTodasLeidas(req.currentUser.id);
  res.json({ success: true });
};
