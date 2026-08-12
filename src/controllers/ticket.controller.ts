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
  const ticket = await ticketService.updateTicket(ticketId, req.body, req.currentUser);
  if (!ticket) {
    res.status(404).json({ detail: 'Ticket no encontrado' });
    return;
  }
  res.json(ticket);
};

export const escalarTicketAN2 = async (req: AuthRequest, res: Response): Promise<void> => {
  const ticketId = parseInt(req.params.ticket_id);
  const { grupo_n2, tecnico_id } = req.body;
  
  if (!grupo_n2 || !['Infraestructura', 'Desarrollo'].includes(grupo_n2)) {
    res.status(400).json({ detail: 'Grupo N2 inválido o no especificado. Debe ser "Infraestructura" o "Desarrollo".' });
    return;
  }

  try {
    const ticket = await ticketService.escalarTicketAN2(ticketId, { grupo_n2, tecnico_id }, req.currentUser);
    if (!ticket) {
      res.status(404).json({ detail: 'Ticket no encontrado o no se pudo escalar' });
      return;
    }
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ detail: err.message || 'Error al escalar el ticket' });
  }
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

export const getCategorias = async (_req: AuthRequest, res: Response): Promise<void> => {
  const categories = await ticketService.getCategorias();
  res.json(categories);
};

export const getTicketsPaginated = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const excludeStatus = req.query.excludeStatus as string;
    const estado = req.query.estado as string;
    const search = req.query.search as string;

    const result = await ticketService.getTicketsPaginated(req.currentUser, page, limit, excludeStatus, estado, search);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener tickets paginados', error: error.message });
  }
};
