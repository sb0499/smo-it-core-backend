import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';
import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const empresasRouter = Router();

const sucursalSelectQuery = `
  SELECT s.*, 
         p.nombre as persona_nombre, p.cedula as persona_cedula,
         u.nombre_completo as usuario_nombre, u.email as usuario_email
  FROM sucursal s 
  LEFT JOIN persona p ON s.persona_id = p.id 
  LEFT JOIN usuario u ON s.usuario_id = u.id
`;

/**
 * GET /api/v1/empresas/
 * Listar todas las empresas con sus sucursales integradas
 */
empresasRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let query = 'SELECT * FROM empresa';
    const params: any[] = [];

    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO' && req.currentUser.nivel_soporte === 'N1') {
      query += ` WHERE id IN (SELECT empresa_id FROM usuario_empresa WHERE usuario_id = ?)`;
      params.push(req.currentUser.id);
    }

    query += ' ORDER BY nombre ASC';
    const [empresas] = await pool.query<RowDataPacket[]>(query, params);

    if (empresas.length === 0) {
      res.json([]);
      return;
    }

    const empresaIds = empresas.map((e) => e.id);
    const [sucursales] = await pool.query<RowDataPacket[]>(
      `${sucursalSelectQuery} WHERE s.empresa_id IN (?) ORDER BY s.nombre ASC`,
      [empresaIds]
    );

    const result = empresas.map((emp) => {
      const empSucursales = sucursales.filter((s) => s.empresa_id === emp.id);
      return {
        ...emp,
        sucursales: empSucursales
      };
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al cargar empresas', error: error.message });
  }
});

/**
 * GET /api/v1/empresas/:id
 * Obtener una empresa por ID con sus sucursales
 */
empresasRouter.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [empresas] = await pool.query<RowDataPacket[]>('SELECT * FROM empresa WHERE id = ?', [id]);
    if (empresas.length === 0) {
      res.status(404).json({ detail: 'Empresa no encontrada' });
      return;
    }

    const empresa = empresas[0];
    const [sucursales] = await pool.query<RowDataPacket[]>(
      `${sucursalSelectQuery} WHERE s.empresa_id = ? ORDER BY s.nombre ASC`,
      [id]
    );

    res.json({
      ...empresa,
      sucursales
    });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener empresa', error: error.message });
  }
});

/**
 * GET /api/v1/empresas/:id/sucursales
 * Obtener las sucursales de una empresa específica
 */
empresasRouter.get('/:id/sucursales', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [sucursales] = await pool.query<RowDataPacket[]>(
      `${sucursalSelectQuery} WHERE s.empresa_id = ? ORDER BY s.nombre ASC`,
      [id]
    );
    res.json(sucursales);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al cargar sucursales', error: error.message });
  }
});

/**
 * POST /api/v1/empresas
 * Crear una empresa con opción de agregar sucursales y asignar persona/técnico por sucursal
 */
empresasRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { nombre, sucursales } = req.body;
    if (!nombre || !nombre.trim()) {
      res.status(400).json({ detail: 'El nombre de la empresa es obligatorio' });
      return;
    }

    const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM empresa WHERE LOWER(nombre) = LOWER(?)', [nombre.trim()]);
    if (existing.length > 0) {
      res.status(400).json({ detail: 'Ya existe una empresa registrada con ese nombre' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>('INSERT INTO empresa (nombre) VALUES (?)', [nombre.trim()]);
    const empresaId = result.insertId;

    if (Array.isArray(sucursales) && sucursales.length > 0) {
      for (const suc of sucursales) {
        if (suc.nombre && suc.nombre.trim()) {
          await pool.query(
            'INSERT INTO sucursal (empresa_id, nombre, persona_id, usuario_id) VALUES (?, ?, ?, ?)',
            [
              empresaId, 
              suc.nombre.trim(), 
              suc.persona_id ? Number(suc.persona_id) : null,
              suc.usuario_id ? Number(suc.usuario_id) : null
            ]
          );
        }
      }
    }

    const [createdSucursales] = await pool.query<RowDataPacket[]>(
      `${sucursalSelectQuery} WHERE s.empresa_id = ? ORDER BY s.nombre ASC`,
      [empresaId]
    );

    res.status(201).json({
      id: empresaId,
      nombre: nombre.trim(),
      sucursales: createdSucursales
    });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al crear empresa', error: error.message });
  }
});

/**
 * PUT /api/v1/empresas/:id
 * Actualizar una empresa y sus sucursales
 */
empresasRouter.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { nombre, sucursales } = req.body;

    const [existing] = await pool.query<RowDataPacket[]>('SELECT * FROM empresa WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404).json({ detail: 'Empresa no encontrada' });
      return;
    }

    if (nombre && nombre.trim()) {
      const [duplicate] = await pool.query<RowDataPacket[]>('SELECT id FROM empresa WHERE LOWER(nombre) = LOWER(?) AND id != ?', [nombre.trim(), id]);
      if (duplicate.length > 0) {
        res.status(400).json({ detail: 'Ya existe otra empresa registrada con ese nombre' });
        return;
      }
      await pool.query('UPDATE empresa SET nombre = ? WHERE id = ?', [nombre.trim(), id]);
    }

    if (Array.isArray(sucursales)) {
      const [currentSucursales] = await pool.query<RowDataPacket[]>('SELECT id FROM sucursal WHERE empresa_id = ?', [id]);
      const currentIds = currentSucursales.map(s => s.id);
      
      const updatedIds: number[] = [];

      for (const suc of sucursales) {
        if (suc.nombre && suc.nombre.trim()) {
          const personaId = suc.persona_id ? Number(suc.persona_id) : null;
          const usuarioId = suc.usuario_id ? Number(suc.usuario_id) : null;

          if (suc.id && currentIds.includes(Number(suc.id))) {
            const sucId = Number(suc.id);
            await pool.query(
              'UPDATE sucursal SET nombre = ?, persona_id = ?, usuario_id = ? WHERE id = ?',
              [suc.nombre.trim(), personaId, usuarioId, sucId]
            );
            updatedIds.push(sucId);
          } else {
            const [inserted] = await pool.query<ResultSetHeader>(
              'INSERT INTO sucursal (empresa_id, nombre, persona_id, usuario_id) VALUES (?, ?, ?, ?)',
              [id, suc.nombre.trim(), personaId, usuarioId]
            );
            updatedIds.push(inserted.insertId);
          }
        }
      }

      const idsToDelete = currentIds.filter(sucId => !updatedIds.includes(sucId));
      if (idsToDelete.length > 0) {
        await pool.query('DELETE FROM sucursal WHERE id IN (?)', [idsToDelete]);
      }
    }

    const [updatedSucursales] = await pool.query<RowDataPacket[]>(
      `${sucursalSelectQuery} WHERE s.empresa_id = ? ORDER BY s.nombre ASC`,
      [id]
    );

    const [updatedEmpresa] = await pool.query<RowDataPacket[]>('SELECT * FROM empresa WHERE id = ?', [id]);

    res.json({
      ...updatedEmpresa[0],
      sucursales: updatedSucursales
    });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al actualizar empresa', error: error.message });
  }
});

/**
 * DELETE /api/v1/empresas/:id
 * Eliminar una empresa
 */
empresasRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await pool.query<RowDataPacket[]>('SELECT * FROM empresa WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404).json({ detail: 'Empresa no encontrada' });
      return;
    }

    await pool.query('DELETE FROM empresa WHERE id = ?', [id]);
    res.json({ message: 'Empresa eliminada correctamente' });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al eliminar empresa', error: error.message });
  }
});
