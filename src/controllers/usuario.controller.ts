import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as usuarioService from '../services/usuario.service';
import { decryptWithServerSecret, generateKeysForUser } from '../db/e2ee';
import { config } from '../core/config';

export const getUsuarios = async (req: AuthRequest, res: Response): Promise<void> => {
  const search = (req.query.search as string) || '';
  if (req.query.page === undefined) {
    const skip = parseInt(req.query.skip as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10000;
    const usuarios = await usuarioService.getUsuarios(skip, limit, search);
    res.json(usuarios);
    return;
  }
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await usuarioService.getUsuariosPaginated(page, limit, search);
  res.json(result);
};

export const createUsuario = async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, password, nombre_completo, is_active, rol_id, empresa_ids, empresa_inventario_ids, nivel_soporte, grupo_n2 } = req.body;
  const existing = await usuarioService.getUsuarioByEmail(email);
  if (existing) {
    res.status(400).json({ detail: 'Este email ya está registrado.' });
    return;
  }
  const usuario = await usuarioService.createUsuario({ email, password, nombre_completo, is_active: is_active ?? true, rol_id, empresa_ids, empresa_inventario_ids, nivel_soporte, grupo_n2 });
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

export const updateUsuarioKeys = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.user_id);
    if (req.currentUser && req.currentUser.rol_nombre !== 'ADMIN' && req.currentUser.rol_nombre !== 'SUPERVISOR' && req.currentUser.id !== userId) {
      res.status(403).json({ detail: 'No tienes permiso para actualizar las llaves de este usuario.' });
      return;
    }
    const { public_key, encrypted_private_key } = req.body;
    if (!public_key || !encrypted_private_key) {
      res.status(400).json({ detail: 'Faltan parámetros: public_key o encrypted_private_key.' });
      return;
    }
    const usuario = await usuarioService.updateUsuarioKeys(userId, public_key, encrypted_private_key);
    res.json(usuario);
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const getUsuarioKeys = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.user_id);
    const keys = await usuarioService.getUsuarioKeys(userId);
    if (!keys) {
      res.status(404).json({ detail: 'Llaves de usuario no encontradas' });
      return;
    }
    
    if (req.currentUser && req.currentUser.id === userId && keys.encrypted_private_key) {
      const serverSecret = config.JWT_SECRET || 'default-secret-key-smo-it-core';
      try {
        const decryptedPrivKey = decryptWithServerSecret(keys.encrypted_private_key, serverSecret);
        res.json({
          public_key: keys.public_key,
          private_key: JSON.parse(decryptedPrivKey)
        });
      } catch (decErr) {
        console.warn(`Decryption of E2EE keys failed for user ${userId}. Regenerating keys...`);
        try {
          await generateKeysForUser(userId, req.currentUser.email);
          const freshKeys = await usuarioService.getUsuarioKeys(userId);
          if (freshKeys && freshKeys.encrypted_private_key) {
            const freshDecrypted = decryptWithServerSecret(freshKeys.encrypted_private_key, serverSecret);
            res.json({
              public_key: freshKeys.public_key,
              private_key: JSON.parse(freshDecrypted)
            });
            return;
          }
        } catch (genErr: any) {
          console.error(`Failed to regenerate keys on the fly for user ${userId}:`, genErr);
        }
        // Fallback if regeneration fails
        res.json(keys);
      }
    } else {
      res.json({
        public_key: keys.public_key
      });
    }
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const deleteUsuario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.user_id);
    const usuario = await usuarioService.deleteUsuario(userId);
    if (!usuario) {
      res.status(404).json({ detail: 'Usuario no encontrado' });
      return;
    }
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error: any) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      res.status(400).json({
        detail: 'No se puede eliminar este usuario porque tiene registros asociados en el sistema (como tickets, proyectos o movimientos de inventario). Se sugiere desactivar la cuenta en su lugar.'
      });
      return;
    }
    res.status(500).json({ detail: error.message || 'Error al eliminar el usuario' });
  }
};

