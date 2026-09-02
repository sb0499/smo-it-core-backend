import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as inventarioService from '../services/inventario.service';
import { excelService } from '../services/excel.service';
import { pool } from '../db/connection';
import { generarActaMovimiento, generarActaIngreso, generarActaEgreso, generarActaEntregaEgreso } from '../utils/pdf.generator';
import fs from 'fs';

const getAssignedEmpresas = async (usuarioId: number): Promise<number[]> => {
  const [rows] = await pool.query<any[]>(
    'SELECT empresa_id FROM usuario_empresa_inventario WHERE usuario_id = ?',
    [usuarioId]
  );
  return rows.map(r => r.empresa_id);
};

export const getActivos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const estado = (req.query.estado as string) || '';
    
    let empresaIds: number[] | undefined = undefined;
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      empresaIds = await getAssignedEmpresas(req.currentUser.id);
    }

    const activosResult = await inventarioService.getActivos(page, limit, search, estado, empresaIds);
    res.json(activosResult);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener activos', error: error.message });
  }
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
  const activo = await inventarioService.createActivo(req.body, req.currentUser?.id);
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

export const getHistorialCambios = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const activoId = parseInt(req.params.activo_id);
    if (isNaN(activoId)) {
      res.status(400).json({ detail: 'ID de activo no válido' });
      return;
    }
    const historial = await inventarioService.getHistorialCambiosActivo(activoId);
    res.json(historial);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener historial de cambios', error: error.message });
  }
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
  try {
    const skip = parseInt(req.query.skip as string) || 0;
    const limit = parseInt(req.query.limit as string) || 100;

    let empresaIds: number[] | undefined = undefined;
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      empresaIds = await getAssignedEmpresas(req.currentUser.id);
    }

    const movimientos = await inventarioService.getMovimientosGlobal(skip, limit, empresaIds);
    res.json(movimientos);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener movimientos', error: error.message });
  }
};

export const importarInventario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ detail: 'No se ha subido ningún archivo.' });
      return;
    }

    const tipoInventarioId = parseInt(req.body.tipo_inventario_id as string);
    const bodegaNombre = req.body.bodega_nombre as string;

    if (isNaN(tipoInventarioId)) {
      res.status(400).json({ detail: 'tipo_inventario_id es requerido y debe ser un número.' });
      return;
    }

    let empresaIds: number[] = [];
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      empresaIds = await getAssignedEmpresas(req.currentUser.id);
    }

    const result = await excelService.importarExcel(
      req.file.path,
      tipoInventarioId,
      req.currentUser,
      empresaIds,
      bodegaNombre
    );

    // Clean up temporary file
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }

    if (!result.success) {
      res.status(400).json({ 
        detail: 'Error al importar registros del Excel. Ningún registro fue insertado.', 
        errors: result.errors 
      });
      return;
    }

    res.json({
      message: 'Importación completada exitosamente.',
      totalProcessed: result.totalProcessed,
      totalInserted: result.totalInserted,
      errors: result.errors
    });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error en la importación de Excel', error: error.message });
  }
};

export const exportarInventario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let empresaIds: number[] = [];
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      empresaIds = await getAssignedEmpresas(req.currentUser.id);
    }

    const workbook = await excelService.exportarExcel(req.currentUser, empresaIds);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=Inventario_Sistemas.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al exportar inventario', error: error.message });
  }
};

export const getTipoInventarios = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query('SELECT id, nombre, descripcion FROM tipo_inventario ORDER BY id ASC');
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener tipos de inventario', error: error.message });
  }
};

export const updateActivo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const activoId = parseInt(req.params.activo_id);
    if (isNaN(activoId)) {
      res.status(400).json({ detail: 'ID de activo no válido' });
      return;
    }

    if (!req.currentUser) {
      res.status(401).json({ detail: 'No autorizado' });
      return;
    }

    if (req.currentUser.rol_nombre === 'TECNICO') {
      const assigned = await getAssignedEmpresas(req.currentUser.id);
      const [existing] = await pool.query<any[]>('SELECT empresa_id FROM activo WHERE id = ?', [activoId]);
      if (existing.length === 0) {
        res.status(404).json({ detail: 'Activo no encontrado' });
        return;
      }
      const oldEmpresaId = existing[0].empresa_id;
      if (oldEmpresaId && !assigned.includes(oldEmpresaId)) {
        res.status(403).json({ detail: 'No tienes autorización para editar activos en esta sede.' });
        return;
      }
      if (req.body.empresa_id && !assigned.includes(Number(req.body.empresa_id))) {
        res.status(403).json({ detail: 'No puedes mover el activo a una sede no autorizada.' });
        return;
      }
    }

    const activo = await inventarioService.updateActivo(activoId, req.body, req.currentUser.id);
    if (!activo) {
      res.status(404).json({ detail: 'Activo no encontrado' });
      return;
    }

    res.json(activo);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al editar activo', error: error.message });
  }
};

export const createIngresoBodega = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.currentUser) {
      res.status(401).json({ detail: 'Usuario no autenticado' });
      return;
    }

    if (req.currentUser.rol_nombre === 'TECNICO') {
      const assigned = await getAssignedEmpresas(req.currentUser.id);
      if (!assigned.includes(Number(req.body.empresa_id))) {
        res.status(403).json({ detail: 'No tienes autorización para registrar ingresos en esta sede.' });
        return;
      }
    }

    const ingreso = await inventarioService.createIngresoBodega(req.body, req.currentUser.id);
    res.status(201).json(ingreso);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al registrar ingreso de bodega', error: error.message });
  }
};

export const getIngresosBodega = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';

    let empresaIds: number[] | undefined = undefined;
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      empresaIds = await getAssignedEmpresas(req.currentUser.id);
    }

    const result = await inventarioService.getIngresosBodega(page, limit, search, empresaIds);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al consultar ingresos de bodega', error: error.message });
  }
};

export const getIngresoBodegaById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de ingreso inválido' });
      return;
    }

    const ingreso = await inventarioService.getIngresoBodegaById(id);
    if (!ingreso) {
      res.status(404).json({ detail: 'Ingreso de bodega no encontrado' });
      return;
    }

    res.json(ingreso);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener ingreso de bodega', error: error.message });
  }
};

export const descargarActaIngreso = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de ingreso inválido' });
      return;
    }

    const ingreso = await inventarioService.getIngresoBodegaById(id);
    if (!ingreso) {
      res.status(404).json({ detail: 'Ingreso de bodega no encontrado' });
      return;
    }

    const pdfBuffer = await generarActaIngreso(ingreso);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Acta_Ingreso_${ingreso.codigo_ingreso}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al generar acta PDF de ingreso', error: error.message });
  }
};

export const createEgresoBodega = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.currentUser) {
      res.status(401).json({ detail: 'Usuario no autenticado' });
      return;
    }

    if (req.currentUser.rol_nombre === 'TECNICO') {
      const assigned = await getAssignedEmpresas(req.currentUser.id);
      if (!assigned.includes(Number(req.body.empresa_id))) {
        res.status(403).json({ detail: 'No tienes autorización para registrar egresos en esta sede.' });
        return;
      }
    }

    const egreso = await inventarioService.createEgresoBodega(req.body, req.currentUser.id);
    res.status(201).json(egreso);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al registrar egreso de bodega', error: error.message });
  }
};

export const getEgresosBodega = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';

    let empresaIds: number[] | undefined = undefined;
    if (req.currentUser && req.currentUser.rol_nombre === 'TECNICO') {
      empresaIds = await getAssignedEmpresas(req.currentUser.id);
    }

    const result = await inventarioService.getEgresosBodega(page, limit, search, empresaIds);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al consultar egresos de bodega', error: error.message });
  }
};

export const getEgresoBodegaById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de egreso inválido' });
      return;
    }

    const egreso = await inventarioService.getEgresoBodegaById(id);
    if (!egreso) {
      res.status(404).json({ detail: 'Egreso de bodega no encontrado' });
      return;
    }

    res.json(egreso);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener egreso de bodega', error: error.message });
  }
};

export const descargarActaEgreso = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de egreso inválido' });
      return;
    }

    const egreso = await inventarioService.getEgresoBodegaById(id);
    if (!egreso) {
      res.status(404).json({ detail: 'Egreso de bodega no encontrado' });
      return;
    }

    const pdfBuffer = await generarActaEgreso(egreso);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Acta_Egreso_${egreso.codigo_egreso}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al generar acta PDF de egreso', error: error.message });
  }
};

export const descargarActaEntregaEgreso = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ detail: 'ID de egreso inválido' });
      return;
    }

    const egreso = await inventarioService.getEgresoBodegaById(id);
    if (!egreso) {
      res.status(404).json({ detail: 'Egreso de bodega no encontrado' });
      return;
    }

    const pdfBuffer = await generarActaEntregaEgreso(egreso);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Acta_Entrega_${egreso.codigo_egreso}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al generar acta PDF de entrega', error: error.message });
  }
};

