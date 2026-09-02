import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createTicket } from './ticket.service';
import { getEmpresaAbbr } from './credencial.service';

export const getActivos = async (
  page = 1,
  limit = 10,
  search = '',
  estado = '',
  empresaIds?: number[],
  custodioId?: number,
  empresaIdFilter?: number
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

  if (empresaIdFilter && empresaIdFilter > 0) {
    whereClauses.push('a.empresa_id = ?');
    params.push(empresaIdFilter);
  }

  if (custodioId && custodioId > 0) {
    const [colsActivo] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM activo');
    const fieldNames = colsActivo.map((c: any) => c.Field);
    const clauses: string[] = ['(a.estado = \'Asignado\' AND eb.custodio_id = ? AND a.egreso_bodega_id IS NOT NULL)'];
    params.push(custodioId);
    if (fieldNames.includes('persona_id')) {
      clauses.push('(a.persona_id = ? AND a.estado = \'Asignado\')');
      params.push(custodioId);
    }
    if (fieldNames.includes('custodio_id')) {
      clauses.push('(a.custodio_id = ? AND a.estado = \'Asignado\')');
      params.push(custodioId);
    }
    whereClauses.push(`(${clauses.join(' OR ')})`);
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
    LEFT JOIN egreso_bodega eb ON a.egreso_bodega_id = eb.id
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
    LEFT JOIN egreso_bodega eb ON a.egreso_bodega_id = eb.id
    LEFT JOIN persona p ON eb.custodio_id = p.id
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

export const createActivo = async (
  data: {
    codigo?: string; serial: string; marca: string; modelo: string;
    especificaciones?: string; persona_id?: number; proveedor_id?: number; fecha_compra?: string;
    tipo_equipo_id?: number; empresa_id?: number; bodega_id?: number;
  },
  usuarioId?: number
) => {
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
  
  if (usuarioId) {
    await pool.query(
      `INSERT INTO historial_cambios_activo (activo_id, usuario_id, cambios) VALUES (?, ?, ?)`,
      [result.insertId, usuarioId, 'Activo creado / registrado en el sistema']
    );
  }
  
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

export const generateCodigoIngreso = async (empresaId: number): Promise<string> => {
  const [empresaRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [empresaId]);
  if (empresaRows.length === 0) throw new Error('Sede no encontrada.');
  const sedeName = empresaRows[0].nombre;

  const words = sedeName.trim().split(/\s+/).filter((w: string) => w.length > 0);
  let initials = 'XX';
  if (words.length >= 2) {
    initials = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    initials = words[0].substring(0, 2).toUpperCase();
  }

  const prefix = `IB-${initials}`;

  const [ingresoRows] = await pool.query<RowDataPacket[]>(
    'SELECT codigo_ingreso FROM ingreso_bodega WHERE codigo_ingreso LIKE ?',
    [`${prefix}-%`]
  );

  let maxSeq = 0;
  for (const row of ingresoRows) {
    const parts = row.codigo_ingreso.split('-');
    const seqStr = parts[parts.length - 1];
    const seq = parseInt(seqStr, 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `${prefix}-${nextSeq}`;
};

export const createIngresoBodega = async (
  data: {
    empresa_id: number;
    proveedor_id?: number;
    nro_orden_compra: string;
    nro_factura?: string;
    nro_solicitud_pago?: string;
    fecha_compra: string;
    fecha_ingreso: string;
    descripcion: string;
    revisado_por?: string;
    revisado_por_cargo?: string;
    activos: Array<{
      tipo_equipo_id: number;
      marca: string;
      modelo: string;
      serial?: string;
      especificaciones?: string;
      bodega_id?: number;
    }>;
  },
  usuarioId?: number
) => {
  if (!data.activos || data.activos.length === 0) {
    throw new Error('Debe incluir al menos un activo para registrar el ingreso de bodega.');
  }

  const codigoIngreso = await generateCodigoIngreso(data.empresa_id);

  // Default bodega for company if not provided per asset
  const [bodegaRows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM bodega WHERE empresa_id = ? ORDER BY id ASC LIMIT 1',
    [data.empresa_id]
  );
  const defaultBodegaId = bodegaRows[0]?.id || null;

  const revisadoPor = data.revisado_por || 'Paulina Porras';
  const revisadoPorCargo = data.revisado_por_cargo || 'GERENTE DE TI';

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO ingreso_bodega (codigo_ingreso, empresa_id, proveedor_id, nro_orden_compra, nro_factura, nro_solicitud_pago, fecha_compra, fecha_ingreso, descripcion, realizado_por_id, revisado_por, revisado_por_cargo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      codigoIngreso,
      data.empresa_id,
      data.proveedor_id || null,
      data.nro_orden_compra,
      data.nro_factura || null,
      data.nro_solicitud_pago || null,
      data.fecha_compra,
      data.fecha_ingreso,
      data.descripcion,
      usuarioId || null,
      revisadoPor,
      revisadoPorCargo
    ]
  );

  const ingresoId = result.insertId;
  const createdActivos = [];

  for (const item of data.activos) {
    const finalCodigo = await generateUniqueCode(data.empresa_id, item.tipo_equipo_id);
    const bodegaId = item.bodega_id || defaultBodegaId;

    const [activoResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO activo (codigo, serial, marca, modelo, especificaciones, estado, proveedor_id, fecha_compra, tipo_equipo_id, empresa_id, bodega_id, ingreso_bodega_id)
       VALUES (?, ?, ?, ?, ?, 'Stock', ?, ?, ?, ?, ?, ?)`,
      [
        finalCodigo,
        item.serial || null,
        item.marca,
        item.modelo,
        item.especificaciones || null,
        data.proveedor_id || null,
        data.fecha_compra,
        item.tipo_equipo_id,
        data.empresa_id,
        bodegaId,
        ingresoId
      ]
    );

    if (usuarioId) {
      await pool.query(
        `INSERT INTO historial_cambios_activo (activo_id, usuario_id, cambios) VALUES (?, ?, ?)`,
        [activoResult.insertId, usuarioId, `Activo registrado en Ingreso de Bodega ${codigoIngreso}`]
      );
    }

    createdActivos.push(activoResult.insertId);
  }

  return getIngresoBodegaById(ingresoId);
};

export const getIngresosBodega = async (
  page = 1,
  limit = 10,
  search = '',
  empresaIds?: number[],
  fechaDesde?: string,
  fechaHasta?: string,
  empresaIdFilter?: number,
  realizadoPorId?: number
) => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (empresaIds && empresaIds.length > 0) {
    whereClauses.push(`(ib.empresa_id IN (${empresaIds.map(() => '?').join(',')})${realizadoPorId ? ' OR ib.realizado_por_id = ?' : ''})`);
    params.push(...empresaIds);
    if (realizadoPorId) params.push(realizadoPorId);
  } else if (empresaIds) {
    if (realizadoPorId) {
      whereClauses.push('ib.realizado_por_id = ?');
      params.push(realizadoPorId);
    } else {
      whereClauses.push('1=0');
    }
  }

  if (empresaIdFilter && empresaIdFilter > 0) {
    whereClauses.push('ib.empresa_id = ?');
    params.push(empresaIdFilter);
  }

  if (fechaDesde) {
    whereClauses.push('ib.fecha_ingreso >= ?');
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    whereClauses.push('ib.fecha_ingreso <= ?');
    params.push(fechaHasta);
  }

  if (search) {
    const searchWildcard = `%${search}%`;
    whereClauses.push(
      `(ib.codigo_ingreso LIKE ? OR ib.nro_orden_compra LIKE ? OR ib.nro_factura LIKE ? OR e.nombre LIKE ? OR prov.nombre LIKE ?)`
    );
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*) as count
    FROM ingreso_bodega ib
    LEFT JOIN empresa e ON ib.empresa_id = e.id
    LEFT JOIN proveedor prov ON ib.proveedor_id = prov.id
    ${whereStr}
  `;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  const selectQuery = `
    SELECT ib.*, e.nombre as empresa_nombre, prov.nombre as proveedor_nombre,
           u.nombre_completo as realizado_por_nombre,
           (SELECT COUNT(*) FROM activo a WHERE a.ingreso_bodega_id = ib.id) as cantidad_activos
    FROM ingreso_bodega ib
    LEFT JOIN empresa e ON ib.empresa_id = e.id
    LEFT JOIN proveedor prov ON ib.proveedor_id = prov.id
    LEFT JOIN usuario u ON ib.realizado_por_id = u.id
    ${whereStr}
    ORDER BY ib.created_at DESC
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

export const getIngresoBodegaById = async (ingresoId: number) => {
  const [ingresoRows] = await pool.query<RowDataPacket[]>(
    `SELECT ib.*, e.nombre as empresa_nombre, prov.nombre as proveedor_nombre,
            u.nombre_completo as realizado_por_nombre,
            r.nombre as realizado_por_rol
     FROM ingreso_bodega ib
     LEFT JOIN empresa e ON ib.empresa_id = e.id
     LEFT JOIN proveedor prov ON ib.proveedor_id = prov.id
     LEFT JOIN usuario u ON ib.realizado_por_id = u.id
     LEFT JOIN rol r ON u.rol_id = r.id
     WHERE ib.id = ?`,
    [ingresoId]
  );

  if (ingresoRows.length === 0) return null;
  const ingreso = ingresoRows[0];

  const [activosRows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, te.nombre as tipo_equipo_nombre
     FROM activo a
     LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
     WHERE a.ingreso_bodega_id = ?
     ORDER BY a.id ASC`,
    [ingresoId]
  );

  ingreso.activos = activosRows;
  return ingreso;
};

export const getEgresoCodigoFormatted = async (egreso: any): Promise<string> => {
  if (egreso.codigo_egreso && egreso.codigo_egreso.startsWith('TI-')) {
    return egreso.codigo_egreso;
  }
  const [empresaRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [egreso.empresa_id]);
  const empresaNombre = empresaRows.length > 0 ? empresaRows[0].nombre : (egreso.empresa_nombre || 'SMO');
  const ccAbbr = getEmpresaAbbr(empresaNombre);

  const [countRows] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) as seq FROM egreso_bodega WHERE empresa_id = ? AND id <= ?',
    [egreso.empresa_id, egreso.id]
  );
  const seq = countRows[0]?.seq || 1;
  const seqStr = String(seq).padStart(4, '0');
  return `TI-${ccAbbr}-AE-${seqStr}`;
};

export const generateCodigoEgreso = async (empresaId: number): Promise<string> => {
  const [empresaRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [empresaId]);
  const empresaNombre = empresaRows.length > 0 ? empresaRows[0].nombre : 'SMO';
  const ccAbbr = getEmpresaAbbr(empresaNombre);

  const prefix = `TI-${ccAbbr}-AE`;

  const [egresoRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, codigo_egreso FROM egreso_bodega WHERE empresa_id = ? ORDER BY id ASC',
    [empresaId]
  );

  let maxSeq = 0;
  for (const row of egresoRows) {
    if (row.codigo_egreso && row.codigo_egreso.startsWith(prefix)) {
      const parts = row.codigo_egreso.split('-');
      const seqStr = parts[parts.length - 1];
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  if (maxSeq === 0) {
    maxSeq = egresoRows.length;
  }

  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `${prefix}-${nextSeq}`;
};

export const createEgresoBodega = async (
  data: {
    empresa_id: number;
    custodio_id: number;
    area?: string;
    observaciones?: string;
    revisado_por?: string;
    revisado_por_cargo?: string;
    activo_ids: number[];
  },
  usuarioId?: number
) => {
  if (!data.activo_ids || data.activo_ids.length === 0) {
    throw new Error('Debe seleccionar al menos un activo para registrar el egreso de bodega.');
  }

  const codigoEgreso = await generateCodigoEgreso(data.empresa_id);
  const revisadoPor = data.revisado_por || 'Paulina Porras';
  const revisadoPorCargo = data.revisado_por_cargo || 'JEFE DE SISTEMAS';

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO egreso_bodega (codigo_egreso, empresa_id, custodio_id, area, observaciones, realizado_por_id, revisado_por, revisado_por_cargo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      codigoEgreso,
      data.empresa_id,
      data.custodio_id,
      data.area || null,
      data.observaciones || null,
      usuarioId || null,
      revisadoPor,
      revisadoPorCargo
    ]
  );

  const egresoId = result.insertId;

  // Get custodio name & persona info for movement log
  const [custodioRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM persona WHERE id = ?', [data.custodio_id]);
  const custodioNombre = custodioRows[0]?.nombre || 'Custodio';

  for (const activoId of data.activo_ids) {
    // Update asset to Asignado
    await pool.query(
      `UPDATE activo SET estado = 'Asignado', persona_id = ?, egreso_bodega_id = ? WHERE id = ?`,
      [data.custodio_id, egresoId, activoId]
    );

    // Log movement
    await pool.query(
      `INSERT INTO movimiento_inventario (activo_id, hacia_persona_id, usuario_id, tipo, observaciones)
       VALUES (?, ?, ?, 'Asignación', ?)`,
      [activoId, data.custodio_id, usuarioId || null, `Egreso de Bodega ${codigoEgreso}: ${data.observaciones || ''}`]
    );

    if (usuarioId) {
      await pool.query(
        `INSERT INTO historial_cambios_activo (activo_id, usuario_id, cambios) VALUES (?, ?, ?)`,
        [activoId, usuarioId, `Asignado a ${custodioNombre} mediante Egreso de Bodega ${codigoEgreso}`]
      );
    }
  }

  return getEgresoBodegaById(egresoId);
};

export const getEgresosBodega = async (
  page = 1,
  limit = 10,
  search = '',
  empresaIds?: number[],
  fechaDesde?: string,
  fechaHasta?: string,
  empresaIdFilter?: number,
  realizadoPorId?: number
) => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (empresaIds && empresaIds.length > 0) {
    whereClauses.push(`(eb.empresa_id IN (${empresaIds.map(() => '?').join(',')})${realizadoPorId ? ' OR eb.realizado_por_id = ?' : ''})`);
    params.push(...empresaIds);
    if (realizadoPorId) params.push(realizadoPorId);
  } else if (empresaIds) {
    if (realizadoPorId) {
      whereClauses.push('eb.realizado_por_id = ?');
      params.push(realizadoPorId);
    } else {
      whereClauses.push('1=0');
    }
  }

  if (empresaIdFilter && empresaIdFilter > 0) {
    whereClauses.push('eb.empresa_id = ?');
    params.push(empresaIdFilter);
  }

  if (fechaDesde) {
    whereClauses.push('eb.fecha_egreso >= ?');
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    whereClauses.push('eb.fecha_egreso <= ?');
    params.push(fechaHasta);
  }

  if (search) {
    const searchWildcard = `%${search}%`;
    whereClauses.push(
      `(eb.codigo_egreso LIKE ? OR p.nombre LIKE ? OR eb.area LIKE ? OR e.nombre LIKE ?)`
    );
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*) as count
    FROM egreso_bodega eb
    LEFT JOIN empresa e ON eb.empresa_id = e.id
    LEFT JOIN persona p ON eb.custodio_id = p.id
    ${whereStr}
  `;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  const selectQuery = `
    SELECT eb.*, e.nombre as empresa_nombre, p.nombre as custodio_nombre,
           u.nombre_completo as realizado_por_nombre,
           (SELECT COUNT(*) FROM activo a WHERE a.egreso_bodega_id = eb.id) as cantidad_activos
    FROM egreso_bodega eb
    LEFT JOIN empresa e ON eb.empresa_id = e.id
    LEFT JOIN persona p ON eb.custodio_id = p.id
    LEFT JOIN usuario u ON eb.realizado_por_id = u.id
    ${whereStr}
    ORDER BY eb.created_at DESC
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

export const getEgresoBodegaById = async (egresoId: number) => {
  const [egresoRows] = await pool.query<RowDataPacket[]>(
    `SELECT eb.*, e.nombre as empresa_nombre, p.nombre as custodio_nombre, p.cargo as custodio_cargo, p.departamento as custodio_departamento,
            u.nombre_completo as realizado_por_nombre,
            r.nombre as realizado_por_rol
     FROM egreso_bodega eb
     LEFT JOIN empresa e ON eb.empresa_id = e.id
     LEFT JOIN persona p ON eb.custodio_id = p.id
     LEFT JOIN usuario u ON eb.realizado_por_id = u.id
     LEFT JOIN rol r ON u.rol_id = r.id
     WHERE eb.id = ?`,
    [egresoId]
  );

  if (egresoRows.length === 0) return null;
  const egreso = egresoRows[0];

  const [activosRows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, te.nombre as tipo_equipo_nombre
     FROM activo a
     LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
     WHERE a.egreso_bodega_id = ?
     ORDER BY a.id ASC`,
    [egresoId]
  );

  egreso.activos = activosRows;
  return egreso;
};

export const generateCodigoRecepcion = async (empresaId: number): Promise<string> => {
  const [empresaRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [empresaId]);
  const empresaNombre = empresaRows.length > 0 ? empresaRows[0].nombre : 'SMO';
  const ccAbbr = getEmpresaAbbr(empresaNombre);

  const prefix = `TI-${ccAbbr}-AR`;

  const [recepcionRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, codigo_recepcion FROM recepcion_bodega WHERE empresa_id = ? ORDER BY id ASC',
    [empresaId]
  );

  let maxSeq = 0;
  for (const row of recepcionRows) {
    if (row.codigo_recepcion && row.codigo_recepcion.startsWith(prefix)) {
      const parts = row.codigo_recepcion.split('-');
      const seqStr = parts[parts.length - 1];
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  if (maxSeq === 0) {
    maxSeq = recepcionRows.length;
  }

  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `${prefix}-${nextSeq}`;
};

export const createRecepcionBodega = async (
  data: {
    empresa_id: number;
    persona_entrega_id: number;
    area?: string;
    bodega_id?: number;
    observaciones?: string;
    revisado_por?: string;
    revisado_por_cargo?: string;
    activo_ids: number[];
  },
  usuarioId?: number
) => {
  if (!data.activo_ids || data.activo_ids.length === 0) {
    throw new Error('Debe seleccionar al menos un activo para registrar la recepción.');
  }

  const codigoRecepcion = await generateCodigoRecepcion(data.empresa_id);
  const revisadoPor = data.revisado_por || 'Paulina Porras';
  const revisadoPorCargo = data.revisado_por_cargo || 'JEFE DE SISTEMAS';

  // 1. Insert into recepcion_bodega
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO recepcion_bodega 
     (codigo_recepcion, empresa_id, persona_entrega_id, recibido_por_id, area, bodega_id, observaciones, revisado_por, revisado_por_cargo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      codigoRecepcion,
      data.empresa_id,
      data.persona_entrega_id,
      usuarioId || null,
      data.area || null,
      data.bodega_id || null,
      data.observaciones || null,
      revisadoPor,
      revisadoPorCargo
    ]
  );
  const recepcionId = result.insertId;

  // 2. Autogenerate corresponding ingreso_bodega (tipo DEVOLUCION)
  const [empresaRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [data.empresa_id]);
  const empresaNombre = empresaRows.length > 0 ? empresaRows[0].nombre : 'SMO';
  const ccAbbr = getEmpresaAbbr(empresaNombre);
  const codigoIngreso = `IB-${ccAbbr}-AR-${codigoRecepcion.split('-').pop() || '0001'}`;

  const todayStr = new Date().toISOString().split('T')[0];
  const [ingresoResult] = await pool.query<ResultSetHeader>(
    `INSERT INTO ingreso_bodega 
     (codigo_ingreso, empresa_id, proveedor_id, nro_orden_compra, nro_factura, fecha_compra, fecha_ingreso, descripcion, realizado_por_id, revisado_por, revisado_por_cargo, tipo_ingreso, recepcion_bodega_id)
     VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, 'DEVOLUCION', ?)`,
    [
      codigoIngreso,
      data.empresa_id,
      codigoRecepcion,
      todayStr,
      todayStr,
      `Ingreso a bodega por devolución de activo(s) según Acta de Recepción ${codigoRecepcion}`,
      usuarioId || null,
      revisadoPor,
      revisadoPorCargo,
      recepcionId
    ]
  );
  const ingresoId = ingresoResult.insertId;

  // Link ingreso_bodega_id to recepcion_bodega
  await pool.query(`UPDATE recepcion_bodega SET ingreso_bodega_id = ? WHERE id = ?`, [ingresoId, recepcionId]);

  // 3. Update assets status and record history
  const [colsActivo] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM activo');
  const fieldNames = colsActivo.map((c: any) => c.Field);

  for (const activoId of data.activo_ids) {
    const setClauses = ["estado = 'Stock'", "bodega_id = COALESCE(?, bodega_id)", "recepcion_bodega_id = ?", "ingreso_bodega_id = ?"];
    const setParams: any[] = [data.bodega_id || null, recepcionId, ingresoId];

    if (fieldNames.includes('persona_id')) {
      setClauses.push("persona_id = NULL");
    }
    if (fieldNames.includes('custodio_id')) {
      setClauses.push("custodio_id = NULL");
    }
    if (fieldNames.includes('egreso_bodega_id')) {
      setClauses.push("egreso_bodega_id = NULL");
    }
    setParams.push(activoId);

    await pool.query(
      `UPDATE activo SET ${setClauses.join(', ')} WHERE id = ?`,
      setParams
    );

    await pool.query(
      `INSERT INTO movimiento_inventario 
       (activo_id, desde_persona_id, usuario_id, tipo, observaciones)
       VALUES (?, ?, ?, 'Devolución', ?)`,
      [
        activoId,
        data.persona_entrega_id,
        usuarioId || null,
        `Devolución a bodega según Acta de Recepción ${codigoRecepcion}. ${data.observaciones || ''}`
      ]
    );
  }

  return getRecepcionBodegaById(recepcionId);
};

export const getRecepcionesBodega = async (
  page = 1,
  limit = 10,
  search = '',
  empresaIds?: number[],
  fechaDesde?: string,
  fechaHasta?: string,
  empresaIdFilter?: number,
  realizadoPorId?: number
) => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (empresaIds && empresaIds.length > 0) {
    whereClauses.push(`(rb.empresa_id IN (${empresaIds.map(() => '?').join(',')})${realizadoPorId ? ' OR rb.recibido_por_id = ?' : ''})`);
    params.push(...empresaIds);
    if (realizadoPorId) params.push(realizadoPorId);
  } else if (empresaIds) {
    if (realizadoPorId) {
      whereClauses.push('rb.recibido_por_id = ?');
      params.push(realizadoPorId);
    } else {
      whereClauses.push('1=0');
    }
  } else if (realizadoPorId) {
    whereClauses.push('rb.recibido_por_id = ?');
    params.push(realizadoPorId);
  }

  if (empresaIdFilter && empresaIdFilter > 0) {
    whereClauses.push('rb.empresa_id = ?');
    params.push(empresaIdFilter);
  }

  if (fechaDesde) {
    whereClauses.push('rb.fecha_recepcion >= ?');
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    whereClauses.push('rb.fecha_recepcion <= ?');
    params.push(fechaHasta);
  }

  if (search) {
    const searchWildcard = `%${search}%`;
    whereClauses.push(
      `(rb.codigo_recepcion LIKE ? OR p.nombre LIKE ? OR rb.area LIKE ? OR e.nombre LIKE ?)`
    );
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*) as count
    FROM recepcion_bodega rb
    LEFT JOIN empresa e ON rb.empresa_id = e.id
    LEFT JOIN persona p ON rb.persona_entrega_id = p.id
    ${whereStr}
  `;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  const selectQuery = `
    SELECT rb.*, e.nombre as empresa_nombre, p.nombre as persona_entrega_nombre,
           u.nombre_completo as recibido_por_nombre,
           (SELECT COUNT(*) FROM activo a WHERE a.recepcion_bodega_id = rb.id) as cantidad_activos
    FROM recepcion_bodega rb
    LEFT JOIN empresa e ON rb.empresa_id = e.id
    LEFT JOIN persona p ON rb.persona_entrega_id = p.id
    LEFT JOIN usuario u ON rb.recibido_por_id = u.id
    ${whereStr}
    ORDER BY rb.created_at DESC
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

export const getRecepcionBodegaById = async (recepcionId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT rb.*, e.nombre as empresa_nombre, p.nombre as persona_entrega_nombre, p.cargo as persona_entrega_cargo, p.departamento as persona_entrega_departamento,
            u.nombre_completo as recibido_por_nombre,
            r.nombre as recibido_por_rol
     FROM recepcion_bodega rb
     LEFT JOIN empresa e ON rb.empresa_id = e.id
     LEFT JOIN persona p ON rb.persona_entrega_id = p.id
     LEFT JOIN usuario u ON rb.recibido_por_id = u.id
     LEFT JOIN rol r ON u.rol_id = r.id
     WHERE rb.id = ?`,
    [recepcionId]
  );

  if (rows.length === 0) return null;
  const recepcion = rows[0];

  const [activosRows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, te.nombre as tipo_equipo_nombre
     FROM activo a
     LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
     WHERE a.recepcion_bodega_id = ?
     ORDER BY a.id ASC`,
    [recepcionId]
  );

  recepcion.activos = activosRows;
  return recepcion;
};

