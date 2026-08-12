import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/reporte.controller';

const reportesRouter = Router();

reportesRouter.use(requireAuth);

/**
 * @openapi
 * /api/v1/reportes/tickets:
 *   get:
 *     tags: [Reportes]
 *     summary: Exportar reporte de tickets en CSV
 *     security: [{ bearerAuth: [] }]
 */
reportesRouter.get('/tickets', ctrl.exportTickets);

/**
 * @openapi
 * /api/v1/reportes/proyectos:
 *   get:
 *     tags: [Reportes]
 *     summary: Exportar reporte de proyectos en CSV
 *     security: [{ bearerAuth: [] }]
 */
reportesRouter.get('/proyectos', ctrl.exportProyectos);

export default reportesRouter;
