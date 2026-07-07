import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as usuarioService from '../services/usuario.service';

export const getUsuarios = async (req: AuthRequest, res: Response): Promise<void> => {
  const skip = parseInt(req.query.skip as string) || 0;
  const limit = parseInt(req.query.limit as string) || 100;
  const usuarios = await usuarioService.getUsuarios(skip, limit);
  res.json(usuarios);
};

export const createUsuario = async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, password, nombre_completo, is_active, rol_id, empresa_ids, nivel_soporte, grupo_n2 } = req.body;
  const existing = await usuarioService.getUsuarioByEmail(email);
  if (existing) {
    res.status(400).json({ detail: 'Este email ya está registrado.' });
    return;
  }
  const usuario = await usuarioService.createUsuario({ email, password, nombre_completo, is_active: is_active ?? true, rol_id, empresa_ids, nivel_soporte, grupo_n2 });
  res.status(201).json(usuario);
};

export const updateUsuario = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = parseInt(req.params.user_id);
  const usuario = await usuarioService.updateUsuario(userId, req.body);
  if (!usuario) {
    res.status(404).json({ detail: 'Usuario no encontrado' });
    return;
  }
  res.json(usuario);
};
