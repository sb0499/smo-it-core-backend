import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/sla.controller';

export const slaRouter = Router();

/**
 * @openapi
 * /api/v1/sla-config:
 *   get:
 *     tags: [SLA]
 *     summary: Obtener todas las configuraciones de tiempos de SLA por Tipo ITIL y Prioridad
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de configuraciones de SLA
 */
slaRouter.get('/', requireAuth, ctrl.getSlaConfigs);
slaRouter.put('/:id', requireAuth, ctrl.updateSlaConfig);
slaRouter.post('/bulk-update', requireAuth, ctrl.bulkUpdateSlaConfigs);
