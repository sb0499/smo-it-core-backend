import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';
import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const categoriasRouter = Router();

/**
 * GET /api/v1/categorias/
 * Obtener categorías de soporte
 */
categoriasRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const showAll = req.query.all === 'true';
    let query = 'SELECT * FROM categoria_ticket';
    if (!showAll) {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY nombre ASC';

    const [rows] = await pool.query<RowDataPacket[]>(query);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener categorías de soporte', error: error.message });
  }
});

/**
 * POST /api/v1/categorias/
 * Crear nueva categoría de soporte
 */
categoriasRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) {
      res.status(400).json({ detail: 'El nombre de la categoría es obligatorio' });
      return;
    }

    const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM categoria_ticket WHERE LOWER(nombre) = LOWER(?)', [nombre.trim()]);
    if (existing.length > 0) {
      res.status(400).json({ detail: 'Ya existe una categoría registrada con ese nombre' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO categoria_ticket (nombre, is_active) VALUES (?, 1)',
      [nombre.trim()]
    );

    const [created] = await pool.query<RowDataPacket[]>('SELECT * FROM categoria_ticket WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al crear la categoría', error: error.message });
  }
});

/**
 * PUT /api/v1/categorias/:id
 * Actualizar categoría (nombre / is_active)
 */
categoriasRouter.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { nombre, is_active } = req.body;

    const [existing] = await pool.query<RowDataPacket[]>('SELECT * FROM categoria_ticket WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404).json({ detail: 'Categoría no encontrada' });
      return;
    }

    const sets: string[] = [];
    const params: any[] = [];

    if (nombre && nombre.trim()) {
      const [duplicate] = await pool.query<RowDataPacket[]>('SELECT id FROM categoria_ticket WHERE LOWER(nombre) = LOWER(?) AND id != ?', [nombre.trim(), id]);
      if (duplicate.length > 0) {
        res.status(400).json({ detail: 'Ya existe otra categoría registrada con ese nombre' });
        return;
      }
      sets.push('nombre = ?');
      params.push(nombre.trim());
    }

    if (is_active !== undefined) {
      sets.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (sets.length > 0) {
      params.push(id);
      await pool.query(`UPDATE categoria_ticket SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    const [updated] = await pool.query<RowDataPacket[]>('SELECT * FROM categoria_ticket WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al actualizar la categoría', error: error.message });
  }
});

/**
 * DELETE /api/v1/categorias/:id
 * Eliminar o desactivar categoría
 */
categoriasRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await pool.query<RowDataPacket[]>('SELECT * FROM categoria_ticket WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404).json({ detail: 'Categoría no encontrada' });
      return;
    }

    // Attempt physical delete, or soft delete if used in tickets
    try {
      await pool.query('DELETE FROM categoria_ticket WHERE id = ?', [id]);
      res.json({ message: 'Categoría eliminada exitosamente' });
    } catch (err) {
      // Soft delete if referenced
      await pool.query('UPDATE categoria_ticket SET is_active = 0 WHERE id = ?', [id]);
      res.json({ message: 'Categoría desactivada exitosamente' });
    }
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al eliminar categoría', error: error.message });
  }
});
