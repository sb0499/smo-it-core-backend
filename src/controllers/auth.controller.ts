import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as usuarioService from '../services/usuario.service';
import { createAccessToken } from '../utils/jwt';
import { verifyPassword } from '../utils/password';
import { AuthRequest } from '../middlewares/auth.middleware';
import { pool } from '../db/connection';
import { generateKeysForUser, decryptWithServerSecret } from '../db/e2ee';
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

  // Generate E2EE keys on login if they are missing or undecryptable
  const serverSecret = config.JWT_SECRET || 'default-secret-key-smo-it-core';
  let needsKeys = !user.public_key || !user.encrypted_private_key;
  if (!needsKeys) {
    try {
      decryptWithServerSecret(user.encrypted_private_key, serverSecret);
    } catch (err) {
      console.warn(`Stored E2EE keys for ${user.email} could not be decrypted. Regenerating...`);
      needsKeys = true;
    }
  }

  if (needsKeys) {
    try {
      await generateKeysForUser(user.id, user.email);
    } catch (keyErr) {
      console.error(`Failed to dynamically generate E2EE keys on login for ${user.email}:`, keyErr);
    }
  }

  let hasInventoryAccess = false;
  if (user.rol_nombre === 'ADMIN' || user.rol_nombre === 'SUPERVISOR') {
    hasInventoryAccess = true;
  } else if (user.rol_nombre === 'TECNICO') {
    const [invRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM usuario_empresa_inventario WHERE usuario_id = ?',
      [user.id]
    );
    hasInventoryAccess = invRows[0]?.count > 0;
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
    nombre: user.nombre_completo,
    must_change_password: !!user.must_change_password,
    has_inventory_access: hasInventoryAccess
  });
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword) {
    res.status(400).json({ detail: 'La nueva contraseña es requerida' });
    return;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ detail: 'No autorizado' });
    return;
  }

  const user = await usuarioService.getUsuarioById(userId);
  if (!user) {
    res.status(404).json({ detail: 'Usuario no encontrado' });
    return;
  }

  if (currentPassword) {
    const valid = await verifyPassword(currentPassword, user.hashed_password);
    if (!valid) {
      res.status(400).json({ detail: 'La contraseña actual es incorrecta' });
      return;
    }
  }

  await usuarioService.updateUsuario(userId, {
    password: newPassword,
    must_change_password: false
  });

  res.json({ detail: 'Contraseña actualizada exitosamente' });
};
