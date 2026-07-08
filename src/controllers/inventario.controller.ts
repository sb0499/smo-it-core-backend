import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as inventarioService from '../services/inventario.service';
import { generarActaMovimiento } from '../utils/pdf.generator';

export const getActivos = async (req: AuthRequest, res: Response): Promise<void> => {
  const skip = parseInt(req.query.skip as string) || 0;
  const limit = parseInt(req.query.limit as string) || 100;
  const activos = await inventarioService.getActivos(skip, limit);
  res.json(activos);
};

export const autogenerarCodigo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const empresaId = parseInt(req.query.empresa_id as string);
    const tipoEquipoId = parseInt(req.query.tipo_equipo_id as string);
    if (isNaN(empresaId) || isNaN(tipoEquipoId)) {
      res.status(400).json({ detail: 'empresa_id y tipo_equipo_id son requeridos.' });
      return;
    }
    const codigo = await inventarioService.generateUniqueCode(empresaId, tipoEquipoId);
    res.json({ codigo });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al autogenerar código', error: error.message });
  }
};

export const createActivo = async (req: AuthRequest, res: Response): Promise<void> => {
  const activo = await inventarioService.createActivo(req.body);
  res.status(201).json(activo);
};

export const asignarActivo = async (req: AuthRequest, res: Response): Promise<void> => {
  const activoId = parseInt(req.params.activo_id);
  const personaId = parseInt(req.params.persona_id);
  const { observaciones } = req.body;
  const activo = await inventarioService.asignarActivo(activoId, personaId, req.currentUser.id, observaciones);
  if (!activo) {
    res.status(404).json({ detail: 'Activo no encontrado' });
    return;
  }
  res.json(activo);
};

export const getHistorial = async (req: AuthRequest, res: Response): Promise<void> => {
  const activoId = parseInt(req.params.activo_id);
  const historial = await inventarioService.getHistorialActivo(activoId);
  res.json(historial);
};

export const descargarActa = async (req: AuthRequest, res: Response): Promise<void> => {
  const movimientoId = parseInt(req.params.movimiento_id);
  const movimiento = await inventarioService.getMovimiento(movimientoId);
  if (!movimiento) {
    res.status(404).json({ detail: 'Movimiento no encontrado' });
    return;
  }
  const pdfBuffer = await generarActaMovimiento(movimiento);
  const nombreArchivo = `Acta_${movimiento.activo_codigo}_${movimiento.persona_recibe_cedula}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(pdfBuffer);
};

export const devolverActivo = async (req: AuthRequest, res: Response): Promise<void> => {
  const activoId = parseInt(req.params.activo_id);
  const observaciones = (req.query.observaciones as string) || 'Devolución estándar a bodega';
  const activo = await inventarioService.devolverActivo(activoId, req.currentUser.id, observaciones);
  if (!activo) {
    res.status(400).json({ detail: 'Activo no encontrado o ya se encuentra en bodega' });
    return;
  }
  res.json(activo);
};

export const cambiarEstado = async (req: AuthRequest, res: Response): Promise<void> => {
  const activoId = parseInt(req.params.activo_id);
  const { nuevo_estado } = req.body;
  const activo = await inventarioService.cambiarEstadoActivo(activoId, nuevo_estado, req.currentUser.id);
  if (!activo) {
    res.status(404).json({ detail: 'Activo no encontrado' });
    return;
  }
  res.json(activo);
};

export const getMovimientosGlobal = async (req: AuthRequest, res: Response): Promise<void> => {
  const skip = parseInt(req.query.skip as string) || 0;
  const limit = parseInt(req.query.limit as string) || 100;
  const movimientos = await inventarioService.getMovimientosGlobal(skip, limit);
  res.json(movimientos);
};
