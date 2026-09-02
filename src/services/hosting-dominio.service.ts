import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { crearNotificacion, enviarCorreo } from './notificacion.service';

export interface HostingDominio {
  id: number;
  tipo: 'HOSTING' | 'DOMINIO';
  nombre: string;
  detalle?: string;
  pagado_hasta: string;
  empresa_id?: number | null;
  proveedor_id?: number | null;
  creador_id?: number | null;
  precio_renovacion?: number | null;
  is_active: boolean;
  ultima_notificacion?: string | null;
  created_at?: string;
  updated_at?: string;
  empresa_nombre?: string;
  proveedor_nombre?: string;
  creador_nombre?: string;
  dias_restantes?: number;
  estado_vencimiento?: 'VIGENTE' | 'POR_VENCER' | 'VENCIDO';
}

export const getHostingDominios = async (
  currentUser: any,
  tipo?: 'HOSTING' | 'DOMINIO',
  empresaId?: number,
  search?: string
) => {
  const whereClauses: string[] = ['hd.is_active = 1'];
  const params: any[] = [];

  if (tipo) {
    whereClauses.push('hd.tipo = ?');
    params.push(tipo);
  }

  if (empresaId) {
    whereClauses.push('hd.empresa_id = ?');
    params.push(empresaId);
  }

  if (search) {
    whereClauses.push('(hd.nombre LIKE ? OR hd.detalle LIKE ? OR e.nombre LIKE ? OR p.nombre LIKE ?)');
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard, wildcard);
  }

  // Filter by company permissions if TECNICO or restricted role
  const userRole = currentUser?.rol || currentUser?.rol_nombre;
  if (currentUser && userRole === 'TECNICO' && currentUser?.nivel_soporte === 'N1') {
    whereClauses.push('(hd.empresa_id IS NULL OR hd.empresa_id IN (SELECT empresa_id FROM usuario_empresa_inventario WHERE usuario_id = ?))');
    params.push(currentUser.id);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `
    SELECT 
      hd.*,
      e.nombre as empresa_nombre,
      p.nombre as proveedor_nombre,
      u.nombre_completo as creador_nombre,
      DATEDIFF(hd.pagado_hasta, CURDATE()) as dias_restantes,
      CASE 
        WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) < 0 THEN 'VENCIDO'
        WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) <= 30 THEN 'POR_VENCER'
        ELSE 'VIGENTE'
      END as estado_vencimiento
    FROM hosting_dominio hd
    LEFT JOIN empresa e ON hd.empresa_id = e.id
    LEFT JOIN proveedor p ON hd.proveedor_id = p.id
    LEFT JOIN usuario u ON hd.creador_id = u.id
    ${whereStr}
    ORDER BY 
      CASE WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) <= 30 THEN 0 ELSE 1 END,
      hd.pagado_hasta ASC,
      hd.nombre ASC
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows as HostingDominio[];
};

export const getHostingDominioById = async (id: number) => {
  const query = `
    SELECT 
      hd.*,
      e.nombre as empresa_nombre,
      p.nombre as proveedor_nombre,
      u.nombre_completo as creador_nombre,
      DATEDIFF(hd.pagado_hasta, CURDATE()) as dias_restantes,
      CASE 
        WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) < 0 THEN 'VENCIDO'
        WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) <= 30 THEN 'POR_VENCER'
        ELSE 'VIGENTE'
      END as estado_vencimiento
    FROM hosting_dominio hd
    LEFT JOIN empresa e ON hd.empresa_id = e.id
    LEFT JOIN proveedor p ON hd.proveedor_id = p.id
    LEFT JOIN usuario u ON hd.creador_id = u.id
    WHERE hd.id = ? AND hd.is_active = 1
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [id]);
  return rows[0] ? (rows[0] as HostingDominio) : null;
};

export const createHostingDominio = async (data: any, creadorId: number) => {
  const { tipo, nombre, detalle, pagado_hasta, empresa_id, proveedor_id, precio_renovacion } = data;

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO hosting_dominio 
     (tipo, nombre, detalle, pagado_hasta, empresa_id, proveedor_id, creador_id, precio_renovacion) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tipo,
      nombre,
      detalle || null,
      pagado_hasta,
      empresa_id || null,
      proveedor_id || null,
      creadorId,
      precio_renovacion || null
    ]
  );

  return getHostingDominioById(result.insertId);
};

export const updateHostingDominio = async (id: number, data: any) => {
  const { tipo, nombre, detalle, pagado_hasta, empresa_id, proveedor_id, precio_renovacion } = data;

  await pool.query(
    `UPDATE hosting_dominio 
     SET tipo = ?, nombre = ?, detalle = ?, pagado_hasta = ?, empresa_id = ?, proveedor_id = ?, precio_renovacion = ?
     WHERE id = ?`,
    [
      tipo,
      nombre,
      detalle || null,
      pagado_hasta,
      empresa_id || null,
      proveedor_id || null,
      precio_renovacion || null,
      id
    ]
  );

  return getHostingDominioById(id);
};

export const renovarPagadoHasta = async (id: number, nuevaFechaPagadoHasta: string) => {
  await pool.query(
    `UPDATE hosting_dominio 
     SET pagado_hasta = ?, ultima_notificacion = NULL 
     WHERE id = ?`,
    [nuevaFechaPagadoHasta, id]
  );

  return getHostingDominioById(id);
};

export const deleteHostingDominio = async (id: number) => {
  await pool.query(`UPDATE hosting_dominio SET is_active = 0 WHERE id = ?`, [id]);
  return true;
};

export const verificarExpiracionesHostingsDominios = async () => {
  console.log('[Cron] Verificando vencimientos de Hostings y Dominios (Alerta <= 30 días)...');
  try {
    const query = `
      SELECT 
        hd.*,
        u.email as creador_email,
        u.nombre_completo as creador_nombre,
        DATEDIFF(hd.pagado_hasta, CURDATE()) as dias_restantes
      FROM hosting_dominio hd
      LEFT JOIN usuario u ON hd.creador_id = u.id
      WHERE hd.is_active = 1
        AND DATEDIFF(hd.pagado_hasta, CURDATE()) <= 30
        AND (hd.ultima_notificacion IS NULL OR hd.ultima_notificacion < CURDATE())
    `;

    const [expiringItems] = await pool.query<RowDataPacket[]>(query);
    if (!expiringItems || expiringItems.length === 0) {
      console.log('[Cron] No hay Hostings ni Dominios próximos a vencer pendientes de notificación hoy.');
      return;
    }

    // Fetch admin & supervisor users to also receive notifications
    const [adminUsers] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.email, u.nombre_completo as nombre 
       FROM usuario u 
       JOIN rol r ON u.rol_id = r.id 
       WHERE r.nombre IN ('ADMIN', 'SUPERVISOR') AND u.is_active = 1`
    );

    for (const item of expiringItems) {
      const tipoLabel = item.tipo === 'HOSTING' ? 'Hosting' : 'Dominio';
      const diasMsg = item.dias_restantes < 0 
        ? `venció hace ${Math.abs(item.dias_restantes)} días` 
        : item.dias_restantes === 0 
          ? 'vence el día de HOY' 
          : `vencerá en ${item.dias_restantes} días (Fecha: ${item.pagado_hasta.toISOString ? item.pagado_hasta.toISOString().split('T')[0] : item.pagado_hasta})`;

      const titulo = `⚠️ Alerta Pago de ${tipoLabel}: ${item.nombre}`;
      const mensaje = `El ${tipoLabel} "${item.nombre}" ${diasMsg}. Por favor gestionar la renovación del pago.`;

      // Set to keep track of notified users to prevent duplicate notifications
      const notifiedUserIds = new Set<number>();

      // 1. Notify creator
      if (item.creador_id) {
        await crearNotificacion(item.creador_id, titulo, mensaje);
        notifiedUserIds.add(item.creador_id);

        if (item.creador_email) {
          await enviarCorreo(item.creador_email, titulo, mensaje);
        }
      }

      // 2. Notify Admins & Supervisors
      for (const admin of adminUsers) {
        if (!notifiedUserIds.has(admin.id)) {
          await crearNotificacion(admin.id, titulo, mensaje);
          notifiedUserIds.add(admin.id);
          if (admin.email && admin.email !== item.creador_email) {
            await enviarCorreo(admin.email, titulo, mensaje);
          }
        }
      }

      // Mark notification date as today so we don't spam multiple times on the same date
      await pool.query(
        `UPDATE hosting_dominio SET ultima_notificacion = CURDATE() WHERE id = ?`,
        [item.id]
      );
      console.log(`[Cron] Notificación enviada para ${item.tipo} #${item.id} ("${item.nombre}")`);
    }
  } catch (err) {
    console.error('[Cron] Error al verificar vencimientos de hostings y dominios:', err);
  }
};

export const startHostingDominioCron = () => {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  console.log('Inicializando programador de Alertas de Hostings y Dominios');

  // Initial check 10 seconds after boot
  setTimeout(async () => {
    try {
      await verificarExpiracionesHostingsDominios();
    } catch (e) {
      console.error('Error en la verificación inicial de hostings y dominios:', e);
    }
  }, 10000);

  // Interval check every 24 hours
  setInterval(async () => {
    try {
      await verificarExpiracionesHostingsDominios();
    } catch (e) {
      console.error('Error en el intervalo de hostings y dominios:', e);
    }
  }, TWENTY_FOUR_HOURS);
};
