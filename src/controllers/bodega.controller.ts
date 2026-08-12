import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as bodegaService from '../services/bodega.service';
import { pool } from '../db/connection';

const getAssignedEmpresas = async (usuarioId: number): Promise<number[]> => {
  const [rows] = await pool.query<any[]>(
    'SELECT empresa_id FROM usuario_empresa_inventario WHERE usuario_id = ?',
    [usuarioId]
  );
  return rows.map(r => r.empresa_id);
};

export const getBodegas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let empresaIds: number[] | undefined = undefined;
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      const allowed = await getAssignedEmpresas(req.currentUser.id);
      if (req.query.empresa_id) {
        const sel = parseInt(req.query.empresa_id as string);
        empresaIds = allowed.includes(sel) ? [sel] : [0];
      } else {
        empresaIds = allowed;
      }
    } else if (req.query.empresa_id) {
      empresaIds = [parseInt(req.query.empresa_id as string)];
    }

    if (req.query.page || req.query.limit) {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = (req.query.search as string) || '';
      const result = await bodegaService.getBodegas(empresaIds, page, limit, search);
      res.json(result);
    } else {
      const bodegas = await bodegaService.getBodegas(empresaIds);
      res.json(bodegas);
    }
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener bodegas', error: error.message });
  }
};

export const getBodegaById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de bodega no válido' });
      return;
    }

    const bodega = await bodegaService.getBodegaById(id);
    if (!bodega) {
      res.status(404).json({ detail: 'Bodega no encontrada' });
      return;
    }

    // N1 check
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      const assigned = await getAssignedEmpresas(req.currentUser.id);
      if (!assigned.includes(bodega.empresa_id)) {
        res.status(403).json({ detail: 'No tienes autorización para acceder a esta bodega' });
        return;
      }
    }

    res.json(bodega);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener bodega', error: error.message });
  }
};

export const createBodega = async (req: AuthRequest, res: Response): Promise<void> => {
  const { nombre, empresa_id, descripcion } = req.body;
  if (!nombre || !empresa_id) {
    res.status(400).json({ detail: 'El nombre y la sede (empresa_id) son obligatorios' });
    return;
  }

  try {
    // N1 check
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      const assigned = await getAssignedEmpresas(req.currentUser.id);
      if (!assigned.includes(Number(empresa_id))) {
        res.status(403).json({ detail: 'No tienes autorización para crear bodegas en esta sede' });
        return;
      }
    }

    const bodega = await bodegaService.createBodega({ nombre, empresa_id: Number(empresa_id), descripcion });
    res.status(201).json(bodega);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al crear bodega', error: error.message });
  }
};

export const updateBodega = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ detail: 'ID de bodega no válido' });
    return;
  }

  const { empresa_id } = req.body;

  try {
    const existing = await bodegaService.getBodegaById(id);
    if (!existing) {
      res.status(404).json({ detail: 'Bodega no encontrada' });
      return;
    }

    // N1 check for original bodega
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      const assigned = await getAssignedEmpresas(req.currentUser.id);
      if (!assigned.includes(existing.empresa_id)) {
        res.status(403).json({ detail: 'No tienes autorización para editar esta bodega' });
        return;
      }
      if (empresa_id && !assigned.includes(Number(empresa_id))) {
        res.status(403).json({ detail: 'No puedes asignar la bodega a una sede no autorizada' });
        return;
      }
    }

    const bodega = await bodegaService.updateBodega(id, req.body);
    res.json(bodega);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al actualizar bodega', error: error.message });
  }
};

export const deleteBodega = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ detail: 'ID de bodega no válido' });
    return;
  }

  try {
    const existing = await bodegaService.getBodegaById(id);
    if (!existing) {
      res.status(404).json({ detail: 'Bodega no encontrada' });
      return;
    }

    // N1 check
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      const assigned = await getAssignedEmpresas(req.currentUser.id);
      if (!assigned.includes(existing.empresa_id)) {
        res.status(403).json({ detail: 'No tienes autorización para eliminar esta bodega' });
        return;
      }
    }

    await bodegaService.deleteBodega(id);
    res.json({ message: 'Bodega eliminada correctamente' });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al eliminar bodega', error: error.message });
  }
};
