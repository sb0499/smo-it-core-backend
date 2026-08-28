import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as proveedorService from '../services/proveedor.service';

export const getProveedores = async (req: AuthRequest, res: Response): Promise<void> => {
  const search = (req.query.search as string) || '';
  if (req.query.page === undefined) {
    const proveedores = await proveedorService.getProveedores(search);
    res.json(proveedores);
    return;
  }
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await proveedorService.getProveedoresPaginated(page, limit, search);
  res.json(result);
};

export const getProveedorById = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  const proveedor = await proveedorService.getProveedorById(id);
  if (!proveedor) {
    res.status(404).json({ detail: 'Proveedor no encontrado' });
    return;
  }
  res.json(proveedor);
};

export const createProveedor = async (req: AuthRequest, res: Response): Promise<void> => {
  const { nombre } = req.body;
  if (!nombre) {
    res.status(400).json({ detail: 'El nombre del proveedor es obligatorio' });
    return;
  }
  try {
    const proveedor = await proveedorService.createProveedor(req.body);
    res.status(201).json(proveedor);
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ detail: 'Ya existe un proveedor registrado con ese nombre' });
      return;
    }
    throw error;
  }
};

export const updateProveedor = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  const proveedor = await proveedorService.updateProveedor(id, req.body);
  if (!proveedor) {
    res.status(404).json({ detail: 'Proveedor no encontrado' });
    return;
  }
  res.json(proveedor);
};

export const deleteProveedor = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  const proveedor = await proveedorService.deleteProveedor(id);
  if (!proveedor) {
    res.status(404).json({ detail: 'Proveedor no encontrado' });
    return;
  }
  res.json({ message: 'Proveedor eliminado correctamente' });
};
