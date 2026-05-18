import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/consumible.controller';

export const consumiblesRouter = Router();

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

/**
 * @openapi
 * /api/v1/consumibles/:
 *   post:
 *     tags: [Consumibles]
 *     summary: Crear consumible
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, unidad_medida, stock_actual]
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               unidad_medida: { type: string }
 *               stock_actual: { type: integer }
 *               stock_minimo: { type: integer, default: 0 }
 *     responses:
 *       201:
 *         description: Consumible creado
 */
consumiblesRouter.post('/', ctrl.createConsumible);

/**
 * @openapi
 * /api/v1/consumibles/{consumible_id}/stock:
 *   patch:
 *     tags: [Consumibles]
 *     summary: Ajustar stock (positivo = entrada, negativo = salida)
 *     parameters:
 *       - in: path
 *         name: consumible_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: cantidad
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stock actualizado
 *       404:
 *         description: Consumible no encontrado
 */
consumiblesRouter.patch('/:consumible_id/stock', ctrl.updateStock);
