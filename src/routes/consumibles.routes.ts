import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/consumible.controller';

export const consumiblesRouter = Router();

consumiblesRouter.use(requireAuth, requireAdminOrTecnico);

/**
 * @openapi
 * /api/v1/consumibles/:
 *   get:
 *     tags: [Consumibles]
 *     summary: Listar consumibles
 *     responses:
 *       200:
 *         description: Lista de consumibles
 */
consumiblesRouter.get('/', ctrl.getConsumibles);
consumiblesRouter.post('/', ctrl.createConsumible);
consumiblesRouter.get('/:id', ctrl.getConsumibleById);
consumiblesRouter.put('/:id', ctrl.updateConsumible);
consumiblesRouter.post('/:id/usar', ctrl.usarConsumible);
consumiblesRouter.post('/:id/restock', ctrl.restockConsumible);
consumiblesRouter.get('/:id/historial', ctrl.getHistorialConsumible);
consumiblesRouter.patch('/:consumible_id/stock', ctrl.updateStock);
consumiblesRouter.delete('/:id', ctrl.deleteConsumible);
