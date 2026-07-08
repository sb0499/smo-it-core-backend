import { Router } from 'express';
import { requireAuth, requireAdminOrTecnico } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/tipo-equipo.controller';

export const tipoEquiposRouter = Router();

// Only technicians and admins can manage equipment types
tipoEquiposRouter.use(requireAuth, requireAdminOrTecnico);

tipoEquiposRouter.get('/', ctrl.getTipoEquipos);
tipoEquiposRouter.post('/', ctrl.createTipoEquipo);
tipoEquiposRouter.put('/:tipo_equipo_id', ctrl.updateTipoEquipo);
tipoEquiposRouter.delete('/:tipo_equipo_id', ctrl.deleteTipoEquipo);
