import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createTicket } from './ticket.service';

export const getActivos = async (
  page = 1,
  limit = 10,
  search = '',
  estado = '',
  empresaIds?: number[]
) => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (empresaIds && empresaIds.length > 0) {
    whereClauses.push(`a.empresa_id IN (${empresaIds.map(() => '?').join(',')})`);
    params.push(...empresaIds);
  } else if (empresaIds) {
    whereClauses.push('1=0');
  }

  if (estado && estado !== 'todos') {
    whereClauses.push('a.estado = ?');
    params.push(estado);
  } else {
    whereClauses.push("a.estado != 'Reciclaje'");
  }

  if (search) {
    const searchWildcard = `%${search}%`;
    whereClauses.push(
      `(a.codigo LIKE ? OR a.serial LIKE ? OR a.marca LIKE ? OR a.modelo LIKE ? OR e.nombre LIKE ? OR te.nombre LIKE ?)`
    );
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as count 
    FROM activo a 
    LEFT JOIN empresa e ON a.empresa_id = e.id 
    LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
    ${whereStr}
  `;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  // Get paginated data
  let selectQuery = `
    SELECT a.*, p.nombre as persona_nombre, p.cedula as persona_cedula,
           prov.nombre as proveedor_nombre, prov.contacto as proveedor_contacto,
           te.nombre as tipo_equipo_nombre, e.nombre as empresa_nombre,
           b.nombre as bodega_nombre
    FROM activo a
    LEFT JOIN persona p ON a.persona_id = p.id
    LEFT JOIN proveedor prov ON a.proveedor_id = prov.id
    LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
    LEFT JOIN empresa e ON a.empresa_id = e.id
    LEFT JOIN bodega b ON a.bodega_id = b.id
    ${whereStr}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;
  
  const selectParams = [...params, limit, skip];
  const [dataRows] = await pool.query<RowDataPacket[]>(selectQuery, selectParams);

  return {
    total,
    page,
    limit,
    data: dataRows
  };
};

export const generateUniqueCode = async (empresaId: number, tipoEquipoId: number): Promise<string> => {
  // 1. Fetch Sede name
  const [empresaRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [empresaId]);
  if (empresaRows.length === 0) throw new Error('Sede no encontrada.');
  const sedeName = empresaRows[0].nombre;

  // 2. Fetch Tipo Equipo name and abbreviation
  const [tipoRows] = await pool.query<RowDataPacket[]>('SELECT nombre, abreviacion FROM tipo_equipo WHERE id = ?', [tipoEquipoId]);
  if (tipoRows.length === 0) throw new Error('Tipo de equipo no encontrado.');
  const tipoName = tipoRows[0].nombre;
  const tipoAbrev = tipoRows[0].abreviacion;

  // 3. Generate prefixes
  const cleanSede = sedeName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
  const cleanTipo = tipoAbrev ? tipoAbrev.toUpperCase() : tipoName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
  const prefix = `${cleanSede}-${cleanTipo}`;

  // 4. Query existing assets with the same prefix to find the next sequential number
  const [activoRows] = await pool.query<RowDataPacket[]>(
    'SELECT codigo FROM activo WHERE codigo LIKE ?',
    [`${prefix}-%`]
  );

  let maxSeq = 0;
  for (const row of activoRows) {
    const parts = row.codigo.split('-');
    const seqStr = parts[parts.length - 1];
    const seq = parseInt(seqStr, 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}-${nextSeq}`;
};

export const createActivo = async (data: {
  codigo?: string; serial: string; marca: string; modelo: string;
  especificaciones?: string; persona_id?: number; proveedor_id?: number; fecha_compra?: string;
  tipo_equipo_id?: number; empresa_id?: number; bodega_id?: number;
}) => {
  let finalCodigo = data.codigo || '';
  if (data.empresa_id && data.tipo_equipo_id && !finalCodigo) {
    finalCodigo = await generateUniqueCode(data.empresa_id, data.tipo_equipo_id);
  } else if (!finalCodigo) {
    throw new Error('El código único o la combinación de Sede y Tipo de Equipo es requerida.');
  }

  const estado = data.persona_id ? 'Asignado' : 'Stock';
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO activo (codigo, serial, marca, modelo, especificaciones, estado, persona_id, proveedor_id, fecha_compra, tipo_equipo_id, empresa_id, bodega_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [finalCodigo, data.serial, data.marca, data.modelo,
     data.especificaciones || null, estado, data.persona_id || null, data.proveedor_id || null, data.fecha_compra || null, data.tipo_equipo_id || null, data.empresa_id || null, data.bodega_id || null]
  );
  
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, p.nombre as persona_nombre, p.cedula as persona_cedula,
            prov.nombre as proveedor_nombre, prov.contacto as proveedor_contacto,
            te.nombre as tipo_equipo_nombre, e.nombre as empresa_nombre,
            b.nombre as bodega_nombre
     FROM activo a
     LEFT JOIN persona p ON a.persona_id = p.id
     LEFT JOIN proveedor prov ON a.proveedor_id = prov.id
     LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
     LEFT JOIN empresa e ON a.empresa_id = e.id
     LEFT JOIN bodega b ON a.bodega_id = b.id
     WHERE a.id = ?`,
    [result.insertId]
  );
  return rows[0];
};

export const asignarActivo = async (activoId: number, personaId: number, usuarioAutorizaId: number, observaciones?: string) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM activo WHERE id = ?`, [activoId]);
  if (existing.length === 0) return null;
  const personaAnteriorId = existing[0].persona_id;
  await pool.query(`UPDATE activo SET persona_id = ?, estado = 'Asignado' WHERE id = ?`, [personaId, activoId]);
  const tipo = personaAnteriorId === null ? 'Asignación' : 'Transferencia';
  await pool.query(
    `INSERT INTO movimiento_inventario (activo_id, desde_persona_id, hacia_persona_id, usuario_id, tipo, observaciones)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [activoId, personaAnteriorId, personaId, usuarioAutorizaId, tipo, observaciones || 'Movimiento generado por el sistema']
  );
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM activo WHERE id = ?`, [activoId]);
  return rows[0];
};

export const getHistorialActivo = async (activoId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT m.*,
            p1.nombre as persona_entrega_nombre, p1.cedula as persona_entrega_cedula,
            p2.nombre as persona_recibe_nombre, p2.cedula as persona_recibe_cedula,
            a.codigo as activo_codigo
     FROM movimiento_inventario m
     LEFT JOIN persona p1 ON m.desde_persona_id = p1.id
     LEFT JOIN persona p2 ON m.hacia_persona_id = p2.id
     JOIN activo a ON m.activo_id = a.id
     WHERE m.activo_id = ?
     ORDER BY m.fecha DESC`,
    [activoId]
  );
  return rows;
};

export const getMovimiento = async (movimientoId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT m.*,
            p1.nombre as persona_entrega_nombre, p1.cedula as persona_entrega_cedula,
            p2.nombre as persona_recibe_nombre, p2.cedula as persona_recibe_cedula,
            a.codigo as activo_codigo, a.marca as activo_marca, a.modelo as activo_modelo,
            a.serial as activo_serial,
            u.nombre_completo as usuario_nombre
     FROM movimiento_inventario m
     LEFT JOIN persona p1 ON m.desde_persona_id = p1.id
     LEFT JOIN persona p2 ON m.hacia_persona_id = p2.id
     JOIN activo a ON m.activo_id = a.id
     LEFT JOIN usuario u ON m.usuario_id = u.id
     WHERE m.id = ?`,
    [movimientoId]
  );
  return rows[0] || null;
};

export const devolverActivo = async (activoId: number, usuarioAutorizaId: number, observaciones: string) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM activo WHERE id = ?`, [activoId]);
  if (existing.length === 0 || !existing[0].persona_id) return null;
  const personaAnteriorId = existing[0].persona_id;
  await pool.query(`UPDATE activo SET persona_id = NULL, estado = 'Stock' WHERE id = ?`, [activoId]);
  await pool.query(
    `INSERT INTO movimiento_inventario (activo_id, desde_persona_id, hacia_persona_id, usuario_id, tipo, observaciones)
     VALUES (?, ?, NULL, ?, 'Devolución', ?)`,
    [activoId, personaAnteriorId, usuarioAutorizaId, observaciones]
  );
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM activo WHERE id = ?`, [activoId]);
  return rows[0];
};

export const cambiarEstadoActivo = async (activoId: number, nuevoEstado: string, usuarioAutorizaId: number) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM activo WHERE id = ?`, [activoId]);
  if (existing.length === 0) return null;
  const estadoAnterior = existing[0].estado;
  const personaId = existing[0].persona_id;
  const limpiarPersona = ['Baja', 'Mantenimiento'].includes(nuevoEstado);
  await pool.query(
    `UPDATE activo SET estado = ?, persona_id = ? WHERE id = ?`,
    [nuevoEstado, limpiarPersona ? null : personaId, activoId]
  );
  await pool.query(
    `INSERT INTO movimiento_inventario (activo_id, desde_persona_id, hacia_persona_id, usuario_id, tipo, observaciones)
     VALUES (?, ?, NULL, ?, 'Cambio de Estado', ?)`,
    [activoId, personaId, usuarioAutorizaId, `El equipo pasó de ${estadoAnterior} a ${nuevoEstado}`]
  );

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM activo WHERE id = ?`, [activoId]);
  const activo = rows[0];

  // Auto-crear Ticket si pasa a 'Mantenimiento'
  if (nuevoEstado === 'Mantenimiento') {
    const [userRows] = await pool.query<RowDataPacket[]>(
      `SELECT u.*, r.nombre as rol_nombre 
       FROM usuario u 
       JOIN rol r ON u.rol_id = r.id 
       WHERE u.id = ?`,
      [usuarioAutorizaId]
    );
    const sysUser = userRows[0] || { id: usuarioAutorizaId, nombre_completo: 'Sistema de Inventarios', rol_nombre: 'ADMIN' };

    const ticketPayload = {
      titulo: `Mantenimiento: ${activo.codigo} - ${activo.marca} ${activo.modelo}`,
      descripcion: `Se requiere revisión/reparación del activo con código ${activo.codigo} y serial ${activo.serial} debido a cambio de estado a Mantenimiento.`,
      categoria: 'Mantenimiento de Activos',
      medio_solicitud: 'Automático (Inventario)',
      prioridad: 'Media',
      estado: 'Nuevo'
    };

    await createTicket(ticketPayload, sysUser).catch(console.error);
  }

  return activo;
};

export const getMovimientosGlobal = async (skip = 0, limit = 100, empresaIds?: number[]) => {
  let query = `
    SELECT m.*,
            p1.nombre as persona_entrega_nombre, p1.cedula as persona_entrega_cedula,
            p2.nombre as persona_recibe_nombre, p2.cedula as persona_recibe_cedula,
            a.codigo as activo_codigo, a.marca as activo_marca, a.modelo as activo_modelo,
            u.nombre_completo as usuario_nombre
     FROM movimiento_inventario m
     LEFT JOIN persona p1 ON m.desde_persona_id = p1.id
     LEFT JOIN persona p2 ON m.hacia_persona_id = p2.id
     JOIN activo a ON m.activo_id = a.id
     JOIN usuario u ON m.usuario_id = u.id
  `;
  const params: any[] = [];

  if (empresaIds && empresaIds.length > 0) {
    query += ` WHERE a.empresa_id IN (${empresaIds.map(() => '?').join(',')})`;
    params.push(...empresaIds);
  } else if (empresaIds) {
    query += ` WHERE 1=0`;
  }

  query += ` ORDER BY m.fecha DESC LIMIT ? OFFSET ?`;
  params.push(limit, skip);

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows;
};

export const updateActivo = async (
  activoId: number,
  data: {
    serial: string;
    marca: string;
    modelo: string;
    especificaciones?: string;
    estado?: string;
    persona_id?: number | null;
    proveedor_id?: number | null;
    fecha_compra?: string | null;
    tipo_equipo_id?: number | null;
    empresa_id?: number | null;
    bodega_id?: number | null;
    observaciones?: string;
  },
  usuarioId: number
) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM activo WHERE id = ?`, [activoId]);
  if (existing.length === 0) return null;
  const old = existing[0];

  const updates: string[] = [];
  const params: any[] = [];
  const changes: string[] = [];

  const fieldsToCompare = [
    { key: 'serial', label: 'Serial' },
    { key: 'marca', label: 'Marca' },
    { key: 'modelo', label: 'Modelo' },
    { key: 'especificaciones', label: 'Especificaciones' },
    { key: 'estado', label: 'Estado' },
    { key: 'persona_id', label: 'Persona' },
    { key: 'proveedor_id', label: 'Proveedor' },
    { key: 'fecha_compra', label: 'Fecha de Compra' },
    { key: 'tipo_equipo_id', label: 'Tipo de Equipo' },
    { key: 'empresa_id', label: 'Sede/Empresa' },
    { key: 'bodega_id', label: 'Bodega' },
    { key: 'observaciones', label: 'Observaciones' }
  ];

  for (const f of fieldsToCompare) {
    const newVal = (data as any)[f.key];
    const oldVal = old[f.key];

    let isChanged = false;
    if (newVal !== undefined) {
      if (newVal === null || newVal === 'null' || newVal === '') {
        if (oldVal !== null && oldVal !== '') {
          isChanged = true;
        }
      } else {
        if (String(newVal).trim() !== String(oldVal || '').trim()) {
          isChanged = true;
        }
      }
    }

    if (isChanged) {
      updates.push(`${f.key} = ?`);
      const finalVal = (newVal === null || newVal === 'null' || newVal === '') ? null : newVal;
      params.push(finalVal);

      let oldDisplay = oldVal;
      let newDisplay = newVal;

      if (f.key === 'persona_id') {
        const [oldPers] = await pool.query<any[]>('SELECT nombre FROM persona WHERE id = ?', [oldVal]);
        const [newPers] = await pool.query<any[]>('SELECT nombre FROM persona WHERE id = ?', [newVal]);
        oldDisplay = oldPers[0]?.nombre || 'Bodega';
        newDisplay = newPers[0]?.nombre || 'Bodega';
      } else if (f.key === 'tipo_equipo_id') {
        const [oldTe] = await pool.query<any[]>('SELECT nombre FROM tipo_equipo WHERE id = ?', [oldVal]);
        const [newTe] = await pool.query<any[]>('SELECT nombre FROM tipo_equipo WHERE id = ?', [newVal]);
        oldDisplay = oldTe[0]?.nombre || 'Ninguno';
        newDisplay = newTe[0]?.nombre || 'Ninguno';
      } else if (f.key === 'empresa_id') {
        const [oldEmp] = await pool.query<any[]>('SELECT nombre FROM empresa WHERE id = ?', [oldVal]);
        const [newEmp] = await pool.query<any[]>('SELECT nombre FROM empresa WHERE id = ?', [newVal]);
        oldDisplay = oldEmp[0]?.nombre || 'Ninguna';
        newDisplay = newEmp[0]?.nombre || 'Ninguna';
      } else if (f.key === 'bodega_id') {
        const [oldBod] = await pool.query<any[]>('SELECT nombre FROM bodega WHERE id = ?', [oldVal]);
        const [newBod] = await pool.query<any[]>('SELECT nombre FROM bodega WHERE id = ?', [newVal]);
        oldDisplay = oldBod[0]?.nombre || 'Ninguna';
        newDisplay = newBod[0]?.nombre || 'Ninguna';
      }

      changes.push(`${f.label}: de "${oldDisplay || ''}" a "${newDisplay || ''}"`);
    }
  }

  if (updates.length === 0) {
    return old;
  }

  params.push(activoId);
  await pool.query(`UPDATE activo SET ${updates.join(', ')} WHERE id = ?`, params);

  const obsLog = changes.join(' | ');
  await pool.query(
    `INSERT INTO historial_cambios_activo (activo_id, usuario_id, cambios) VALUES (?, ?, ?)`,
    [activoId, usuarioId, obsLog]
  );

  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT a.*, p.nombre as persona_nombre, te.nombre as tipo_equipo_nombre, e.nombre as empresa_nombre,
           b.nombre as bodega_nombre
    FROM activo a
    LEFT JOIN persona p ON a.persona_id = p.id
    LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
    LEFT JOIN empresa e ON a.empresa_id = e.id
    LEFT JOIN bodega b ON a.bodega_id = b.id
    WHERE a.id = ?`,
    [activoId]
  );
  return rows[0];
};

export const getHistorialCambiosActivo = async (activoId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT h.*, u.nombre_completo as usuario_nombre
     FROM historial_cambios_activo h
     JOIN usuario u ON h.usuario_id = u.id
     WHERE h.activo_id = ?
     ORDER BY h.fecha DESC`,
    [activoId]
  );
  return rows;
};
