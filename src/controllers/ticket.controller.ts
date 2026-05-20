import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as ticketService from '../services/ticket.service';

export const getTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  const skip = parseInt(req.query.skip as string) || 0;
  const limit = parseInt(req.query.limit as string) || 100;
  const tickets = await ticketService.getTickets(req.currentUser, skip, limit);
  res.json(tickets);
};

export const createTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  const ticket = await ticketService.createTicket(req.body, req.currentUser);
  res.status(201).json(ticket);
};

export const updateTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  const ticketId = parseInt(req.params.ticket_id);
  const ticket = await ticketService.updateTicket(ticketId, req.body);
  if (!ticket) {
    res.status(404).json({ detail: 'Ticket no encontrado' });
    return;
  }
  res.json(ticket);
};

export const crearDesdePlantilla = async (req: AuthRequest, res: Response): Promise<void> => {
  const plantillaId = parseInt(req.params.plantilla_id);
  const ticket = await ticketService.crearDesdePlantilla(plantillaId, req.currentUser);
  if (!ticket) {
    res.status(404).json({ detail: 'Plantilla recurrente no encontrada' });
    return;
  }
  res.status(201).json(ticket);
};

export const descargarReporteSemanal = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: 'No autorizado' });
    return;
  }
  const buffer = await ticketService.generarReporteSemanalExcel(req.user.rol, req.user.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Reporte_Soportes_IT.xlsx"');
  res.send(buffer);
};

export const ejecutarRecordatorioCierre = async (_req: AuthRequest, res: Response): Promise<void> => {
  const summary = await ticketService.enviarRecordatoriosCierreDiario();
  res.json({ message: 'Recordatorios diarios enviados con éxito', ...summary });
};
