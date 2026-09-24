import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface Consumible {
  id: number;
  codigo?: string;
  nombre: string;
  empresa_id?: number | null;
  serial?: string | null;
  precio_unitario: number;
  unidad_medida: string;
  stock_actual: number;
  stock_minimo: number;
  fecha_restock?: string | null;
  descripcion?: string | null;
  is_active: boolean;
  empresa_nombre?: string;
  created_at?: string;
  updated_at?: string;
}

export const generateCodigoConsumible = async (empresaId?: number | null): Promise<string> => {
  let prefix = 'SUM';
  if (empresaId) {
    const [empRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [empresaId]);
    if (empRows.length > 0 && empRows[0].nombre) {
      const words = empRows[0].nombre.trim().split(/\s+/);
      if (words.length >= 2) {
        prefix = (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase();
      } else {
        prefix = empRows[0].nombre.substring(0, 3).toUpperCase();
      }
    }
  }

  const [countRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as total FROM consumible');
  const count = (countRows[0]?.total || 0) + 1;
  const numFormatted = String(count).padStart(4, '0');
  let candidate = `${prefix}-SUM-${numFormatted}`;

  // Ensure uniqueness
  const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM consumible WHERE codigo = ?', [candidate]);
  if (existing.length > 0) {
    candidate = `${prefix}-SUM-${numFormatted}-${Math.floor(Math.random() * 100)}`;
  }

  return candidate;
};

export const getConsumibles = async (
  page = 1,
  limit = 10,
  search = '',
  empresaIds?: number[],
  criticalOnly = false
) => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = ['c.is_active = 1'];
  const params: any[] = [];

  if (search) {
    whereClauses.push('(c.nombre LIKE ? OR c.codigo LIKE ? OR c.serial LIKE ? OR c.descripcion LIKE ? OR e.nombre LIKE ?)');
    const searchWildcard = `%${search}%`;
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }

  if (criticalOnly) {
    whereClauses.push('c.stock_actual <= c.stock_minimo');
  }

  // Filter by user assigned Sedes (empresaIds)
  if (empresaIds && empresaIds.length > 0) {
    whereClauses.push(`(c.empresa_id IS NULL OR c.empresa_id IN (${empresaIds.map(() => '?').join(',')}))`);
    params.push(...empresaIds);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as count 
    FROM consumible c
    LEFT JOIN empresa e ON c.empresa_id = e.id
    ${whereStr}
  `;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  // Get paginated data
  const selectQuery = `
    SELECT c.*, e.nombre as empresa_nombre 
    FROM consumible c
    LEFT JOIN empresa e ON c.empresa_id = e.id
    ${whereStr} 
    ORDER BY c.id DESC 
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

export const getConsumibleById = async (id: number) => {
  const query = `
    SELECT c.*, e.nombre as empresa_nombre
    FROM consumible c
    LEFT JOIN empresa e ON c.empresa_id = e.id
    WHERE c.id = ? AND c.is_active = 1
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [id]);
  return rows[0] || null;
};

export const createConsumible = async (
  data: {
    codigo?: string;
    nombre: string;
    empresa_id?: number | null;
    serial?: string | null;
    precio_unitario?: number;
    unidad_medida?: string;
    stock_actual?: number;
    stock_minimo?: number;
    descripcion?: string | null;
  },
  usuarioId?: number
) => {
  const codigo = data.codigo || (await generateCodigoConsumible(data.empresa_id));
  const stockInicial = Number(data.stock_actual) || 0;
  const fechaRestock = stockInicial > 0 ? new Date() : null;

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO consumible 
     (codigo, nombre, empresa_id, serial, precio_unitario, unidad_medida, stock_actual, stock_minimo, fecha_restock, descripcion) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      codigo,
      data.nombre,
      data.empresa_id || null,
      data.serial || null,
      data.precio_unitario || 0,
      data.unidad_medida || 'Unidades',
      stockInicial,
      data.stock_minimo ?? 5,
      fechaRestock,
      data.descripcion || null
    ]
  );

  const newId = result.insertId;

  if (stockInicial > 0) {
    await pool.query(
      `INSERT INTO consumible_historial 
       (consumible_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) 
       VALUES (?, 'RESTOCK', ?, 0, ?, ?, ?)`,
      [newId, stockInicial, stockInicial, 'Ingreso inicial de suministro', usuarioId || null]
    );
  }

  return getConsumibleById(newId);
};

export const updateConsumible = async (
  id: number,
  data: {
    nombre?: string;
    empresa_id?: number | null;
    serial?: string | null;
    precio_unitario?: number;
    unidad_medida?: string;
    stock_minimo?: number;
    descripcion?: string | null;
  }
) => {
  await pool.query(
    `UPDATE consumible 
     SET nombre = COALESCE(?, nombre),
         empresa_id = ?,
         serial = ?,
         precio_unitario = COALESCE(?, precio_unitario),
         unidad_medida = COALESCE(?, unidad_medida),
         stock_minimo = COALESCE(?, stock_minimo),
         descripcion = ?
     WHERE id = ?`,
    [
      data.nombre,
      data.empresa_id || null,
      data.serial || null,
      data.precio_unitario,
      data.unidad_medida,
      data.stock_minimo,
      data.descripcion || null,
      id
    ]
  );
  return getConsumibleById(id);
};

export const usarConsumible = async (
  consumibleId: number,
  cantidad: number,
  motivo?: string,
  usuarioId?: number
) => {
  const item = await getConsumibleById(consumibleId);
  if (!item) throw new Error('Suministro no encontrado');

  const cantidadUsar = Math.max(1, Number(cantidad) || 1);
  const stockAnterior = Number(item.stock_actual);
  const stockNuevo = Math.max(0, stockAnterior - cantidadUsar);

  await pool.query(`UPDATE consumible SET stock_actual = ? WHERE id = ?`, [stockNuevo, consumibleId]);

  await pool.query(
    `INSERT INTO consumible_historial 
     (consumible_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) 
     VALUES (?, 'USO', ?, ?, ?, ?, ?)`,
    [consumibleId, -cantidadUsar, stockAnterior, stockNuevo, motivo || 'Uso registrado', usuarioId || null]
  );

  return getConsumibleById(consumibleId);
};

export const restockConsumible = async (
  consumibleId: number,
  cantidad: number,
  nuevoPrecioUnitario?: number | null,
  motivo?: string,
  usuarioId?: number
) => {
  const item = await getConsumibleById(consumibleId);
  if (!item) throw new Error('Suministro no encontrado');

  const cantidadRestock = Math.max(1, Number(cantidad) || 1);
  const stockAnterior = Number(item.stock_actual);
  const stockNuevo = stockAnterior + cantidadRestock;

  let updateQuery = `UPDATE consumible SET stock_actual = ?, fecha_restock = NOW()`;
  const updateParams: any[] = [stockNuevo];

  if (nuevoPrecioUnitario !== undefined && nuevoPrecioUnitario !== null && !isNaN(nuevoPrecioUnitario)) {
    updateQuery += `, precio_unitario = ?`;
    updateParams.push(nuevoPrecioUnitario);
  }

  updateQuery += ` WHERE id = ?`;
  updateParams.push(consumibleId);

  await pool.query(updateQuery, updateParams);

  await pool.query(
    `INSERT INTO consumible_historial 
     (consumible_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) 
     VALUES (?, 'RESTOCK', ?, ?, ?, ?, ?)`,
    [consumibleId, cantidadRestock, stockAnterior, stockNuevo, motivo || 'Restock / Ingreso de stock', usuarioId || null]
  );

  return getConsumibleById(consumibleId);
};

export const getHistorialConsumible = async (consumibleId: number) => {
  const query = `
    SELECT ch.*, u.nombre_completo as usuario_nombre
    FROM consumible_historial ch
    LEFT JOIN usuario u ON ch.usuario_id = u.id
    WHERE ch.consumible_id = ?
    ORDER BY ch.created_at DESC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [consumibleId]);
  return rows;
};

export const ajustarStock = async (consumibleId: number, cantidad: number, usuarioId?: number) => {
  const item = await getConsumibleById(consumibleId);
  if (!item) return null;

  const stockAnterior = Number(item.stock_actual);
  const stockNuevo = Math.max(0, stockAnterior + cantidad);
  const tipoMov = cantidad >= 0 ? 'RESTOCK' : 'USO';

  await pool.query(`UPDATE consumible SET stock_actual = ? WHERE id = ?`, [stockNuevo, consumibleId]);

  await pool.query(
    `INSERT INTO consumible_historial 
     (consumible_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [consumibleId, tipoMov, cantidad, stockAnterior, stockNuevo, 'Ajuste directo de stock', usuarioId || null]
  );

  return getConsumibleById(consumibleId);
};

export const deleteConsumible = async (id: number) => {
  await pool.query(`UPDATE consumible SET is_active = 0 WHERE id = ?`, [id]);
  return true;
};
