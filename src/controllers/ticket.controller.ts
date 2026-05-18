import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as ticketService from '../services/ticket.service';

export const getTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  const skip = parseInt(req.query.skip as string) || 0;
  const limit = parseInt(req.query.limit as string) || 100;
  const tickets = await ticketService.getTickets(skip, limit);
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
