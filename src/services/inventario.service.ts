import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createTicket } from './ticket.service';

export const getActivos = async (skip = 0, limit = 100) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, p.nombre as persona_nombre, p.cedula as persona_cedula,
            prov.nombre as proveedor_nombre, prov.contacto as proveedor_contacto,
            te.nombre as tipo_equipo_nombre, e.nombre as empresa_nombre
     FROM activo a
     LEFT JOIN persona p ON a.persona_id = p.id
     LEFT JOIN proveedor prov ON a.proveedor_id = prov.id
     LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
     LEFT JOIN empresa e ON a.empresa_id = e.id
     LIMIT ? OFFSET ?`,
    [limit, skip]
  );
  return rows;
};

export const generateUniqueCode = async (empresaId: number, tipoEquipoId: number): Promise<string> => {
  // 1. Fetch Sede name
  const [empresaRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [empresaId]);
  if (empresaRows.length === 0) throw new Error('Sede no encontrada.');
  const sedeName = empresaRows[0].nombre;

  // 2. Fetch Tipo Equipo name
  const [tipoRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM tipo_equipo WHERE id = ?', [tipoEquipoId]);
  if (tipoRows.length === 0) throw new Error('Tipo de equipo no encontrado.');
  const tipoName = tipoRows[0].nombre;

  // 3. Generate prefixes (first 3 letters, uppercase)
  const cleanSede = sedeName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
  const cleanTipo = tipoName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
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
  tipo_equipo_id?: number; empresa_id?: number;
}) => {
  let finalCodigo = data.codigo || '';
  if (data.empresa_id && data.tipo_equipo_id && !finalCodigo) {
    finalCodigo = await generateUniqueCode(data.empresa_id, data.tipo_equipo_id);
  } else if (!finalCodigo) {
    throw new Error('El código único o la combinación de Sede y Tipo de Equipo es requerida.');
  }

  const estado = data.persona_id ? 'Asignado' : 'Stock';
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO activo (codigo, serial, marca, modelo, especificaciones, estado, persona_id, proveedor_id, fecha_compra, tipo_equipo_id, empresa_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [finalCodigo, data.serial, data.marca, data.modelo,
     data.especificaciones || null, estado, data.persona_id || null, data.proveedor_id || null, data.fecha_compra || null, data.tipo_equipo_id || null, data.empresa_id || null]
  );
  
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, p.nombre as persona_nombre, p.cedula as persona_cedula,
            prov.nombre as proveedor_nombre, prov.contacto as proveedor_contacto,
            te.nombre as tipo_equipo_nombre, e.nombre as empresa_nombre
     FROM activo a
     LEFT JOIN persona p ON a.persona_id = p.id
     LEFT JOIN proveedor prov ON a.proveedor_id = prov.id
     LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
     LEFT JOIN empresa e ON a.empresa_id = e.id
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
            a.serial as activo_serial
     FROM movimiento_inventario m
     LEFT JOIN persona p1 ON m.desde_persona_id = p1.id
     LEFT JOIN persona p2 ON m.hacia_persona_id = p2.id
     JOIN activo a ON m.activo_id = a.id
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

export const getMovimientosGlobal = async (skip = 0, limit = 100) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT m.*,
            p1.nombre as persona_entrega_nombre, p1.cedula as persona_entrega_cedula,
            p2.nombre as persona_recibe_nombre, p2.cedula as persona_recibe_cedula,
            a.codigo as activo_codigo, a.marca as activo_marca, a.modelo as activo_modelo,
            u.nombre_completo as usuario_nombre
     FROM movimiento_inventario m
     LEFT JOIN persona p1 ON m.desde_persona_id = p1.id
     LEFT JOIN persona p2 ON m.hacia_persona_id = p2.id
     JOIN activo a ON m.activo_id = a.id
     JOIN usuario u ON m.usuario_id = u.id
     ORDER BY m.fecha DESC
     LIMIT ? OFFSET ?`,
    [limit, skip]
  );
  return rows;
};
