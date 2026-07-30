import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { enviarCorreo } from './notificacion.service';

export const getEntregas = async (page = 1, limit = 10, search = '', currentUser?: any) => {
  const skip = (page - 1) * limit;
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (search) {
    const wildcard = `%${search}%`;
    whereClauses.push(`(ec.secuencial LIKE ? OR ec.sitio LIKE ? OR ec.usuario LIKE ? OR ec.recibido_por_nombre LIKE ? OR e.nombre LIKE ?)`);
    params.push(wildcard, wildcard, wildcard, wildcard, wildcard);
  }

  if (currentUser && currentUser.rol_nombre !== 'ADMIN') {
    whereClauses.push(`ec.entregado_por_id = ?`);
    params.push(currentUser.id);
  }

  const whereClause = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total count
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count 
     FROM entrega_credencial ec
     JOIN empresa e ON ec.empresa_id = e.id
     ${whereClause}`,
    params
  );
  const total = countRows[0]?.count || 0;

  // Get paginated data
  const query = `
    SELECT ec.*, e.nombre as empresa_nombre, u.nombre_completo as entregado_por_nombre
    FROM entrega_credencial ec
    JOIN empresa e ON ec.empresa_id = e.id
    JOIN usuario u ON ec.entregado_por_id = u.id
    ${whereClause}
    ORDER BY ec.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [...params, limit, skip]);

  return {
    total,
    page,
    limit,
    data: rows
  };
};

export const getEntregaById = async (id: number, currentUser?: any) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ec.*, e.nombre as empresa_nombre, u.nombre_completo as entregado_por_nombre
     FROM entrega_credencial ec
     JOIN empresa e ON ec.empresa_id = e.id
     JOIN usuario u ON ec.entregado_por_id = u.id
     WHERE ec.id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  const entry = rows[0];
  if (currentUser && currentUser.rol_nombre !== 'ADMIN' && entry.entregado_por_id !== currentUser.id) {
    throw new Error('403: No tienes permisos para ver esta entrega de credenciales.');
  }
  return entry;
};

export const getNextSecuencial = async (empresaId: number, fechaStr: string): Promise<string> => {
  const [empresaRows] = await pool.query<RowDataPacket[]>(
    `SELECT nombre FROM empresa WHERE id = ?`, [empresaId]
  );
  if (empresaRows.length === 0) {
    throw new Error('Empresa no encontrada');
  }
  const ccName = empresaRows[0].nombre.toUpperCase();
  
  // Abbreviation map
  const ccMap: Record<string, string> = {
    'CONDADO': 'CON',
    'SCALA': 'SCA',
    'POMASQUI': 'POM',
    'CCI': 'CCI',
    'SMO': 'SMO',
    'PORTOSHOPPING': 'POR',
    'GAMETOWN': 'GAM',
    'APPARCA': 'APP',
    'DATATRUST': 'DAT',
    'EL TEATRO': 'TEA'
  };
  const ccAbbr = ccMap[ccName] || ccName.substring(0, 3);

  // Parse date components
  const date = new Date(fechaStr + 'T12:00:00');
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  // Count existing deliveries for this CC in the same year
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM entrega_credencial 
     WHERE empresa_id = ? AND YEAR(fecha_entrega) = ?`,
    [empresaId, yy]
  );
  
  const count = (countRows[0]?.total || 0) + 1;
  const seq = String(count).padStart(3, '0');

  // SI-SCA-0926004-2026
  return `SI-${ccAbbr}-${mm}${dd}${seq}-${yy}`;
};

export const createEntrega = async (data: {
  empresa_id: number;
  fecha_entrega: string;
  tipo?: string;
  sitio: string;
  usuario: string;
  clave: string;
  entregado_por_id: number;
  recibido_por_nombre: string;
  recibido_por_area: string;
  correo_receptor?: string;
}) => {
  const secuencial = await getNextSecuencial(data.empresa_id, data.fecha_entrega);

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO entrega_credencial 
     (secuencial, empresa_id, fecha_entrega, tipo, sitio, usuario, clave, entregado_por_id, recibido_por_nombre, recibido_por_area, correo_receptor) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      secuencial,
      data.empresa_id,
      data.fecha_entrega,
      data.tipo || 'Usuario y Clave',
      data.sitio,
      data.usuario,
      data.clave,
      data.entregado_por_id,
      data.recibido_por_nombre,
      data.recibido_por_area,
      data.correo_receptor || null
    ]
  );

  const newRecord = await getEntregaById(result.insertId);
  if (!newRecord) {
    throw new Error('No se pudo recuperar la entrega de credenciales recién creada.');
  }

  // Send email if receptor email is provided
  if (data.correo_receptor && data.correo_receptor.trim() !== '') {
    try {
      const subject = `Entrega de Credenciales - ${newRecord.sitio}`;
      const fechaNormal = new Date(newRecord.fecha_entrega + 'T12:00:00').toLocaleDateString('es-EC');
      
      const body = `Estimado/a ${newRecord.recibido_por_nombre},

Se le hace entrega de las credenciales de acceso para el aplicativo/sitio detallado a continuación:

Centro Comercial: ${newRecord.empresa_nombre}
Sitio / Aplicativo: ${newRecord.sitio}
Usuario: ${newRecord.usuario}
Clave: ${newRecord.clave}

Fecha de Entrega: ${fechaNormal}
Entregado por: ${newRecord.entregado_por_nombre} (TI)

Nota: La información entregada debe ser custodiada y utilizada de la mejor manera por parte del usuario.

Atentamente,
Departamento de Tecnología de la Información
Shopping Managements Operadora`;

      await enviarCorreo(data.correo_receptor.trim(), subject, body);
    } catch (mailErr) {
      console.error('Error sending credentials email:', mailErr);
    }
  }

  return newRecord;
};

export const deleteEntrega = async (id: number) => {
  const existing = await getEntregaById(id);
  if (!existing) return null;
  await pool.query(`DELETE FROM entrega_credencial WHERE id = ?`, [id]);
  return existing;
};
