import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { createAccessToken } from '../utils/jwt';
import { config } from '../core/config';

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ detail: 'Email y contraseña son requeridos' });
    return;
  }
  const user = await authService.authenticate(username, password);
  if (!user) {
    res.status(400).json({ detail: 'Email o contraseña incorrectos' });
    return;
  }
  if (!user.is_active) {
    res.status(400).json({ detail: 'Usuario inactivo' });
    return;
  }
  const token = createAccessToken({
    sub: String(user.id),
    id: user.id,
    rol: user.rol_nombre,
    email: user.email,
    nombre_completo: user.nombre_completo
  } as any);
  res.json({
    access_token: token,
    token_type: 'bearer',
    user_id: user.id,
    rol: user.rol_nombre,
    nombre: user.nombre_completo
  });
};
