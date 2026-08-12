import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as proveedorService from '../services/proveedor.service';

export const getProveedores = async (_req: AuthRequest, res: Response): Promise<void> => {
  const proveedores = await proveedorService.getProveedores();
  res.json(proveedores);
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
