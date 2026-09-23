import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { crearNotificacion, enviarCorreo } from './notificacion.service';

export interface HostingDominio {
  id: number;
  tipo: 'HOSTING' | 'DOMINIO' | 'LICENCIA' | 'SERVICIO' | 'FIRMA' | string;
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

const ensureTableExists = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hosting_dominio (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        detalle TEXT NULL,
        pagado_hasta DATE NOT NULL,
        empresa_id INT NULL,
        proveedor_id INT NULL,
        creador_id INT NULL,
        precio_renovacion DECIMAL(10,2) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        ultima_notificacion DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_hd_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id) ON DELETE SET NULL,
        CONSTRAINT fk_hd_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedor(id) ON DELETE SET NULL,
        CONSTRAINT fk_hd_creador FOREIGN KEY (creador_id) REFERENCES usuario(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  } catch (e) {
    console.error('Error auto-creating hosting_dominio table:', e);
  }
};

export const getHostingDominios = async (
  currentUser: any,
  tipo?: string,
  empresaId?: number,
  search?: string,
  page?: number,
  limit?: number
) => {
  await ensureTableExists();

  const baseWhereClauses: string[] = ['hd.is_active = 1'];
  const baseParams: any[] = [];

  if (empresaId) {
    baseWhereClauses.push('hd.empresa_id = ?');
    baseParams.push(empresaId);
  }

  if (search) {
    baseWhereClauses.push('(hd.nombre LIKE ? OR hd.detalle LIKE ? OR e.nombre LIKE ? OR p.nombre LIKE ?)');
    const wildcard = `%${search}%`;
    baseParams.push(wildcard, wildcard, wildcard, wildcard);
  }

  // Filter by company permissions (Sedes Soporte - usuario_empresa)
  const userRole = currentUser?.rol || currentUser?.rol_nombre;
  if (currentUser && userRole !== 'ADMIN') {
    const [userEmpRows] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM usuario_empresa WHERE usuario_id = ? LIMIT 1',
      [currentUser.id]
    );
    if (userEmpRows.length > 0) {
      baseWhereClauses.push('(hd.empresa_id IS NULL OR hd.empresa_id IN (SELECT empresa_id FROM usuario_empresa WHERE usuario_id = ?))');
      baseParams.push(currentUser.id);
    }
  }

  // Calculate stats per tipo (HOSTING, DOMINIO, LICENCIA, SERVICIO, FIRMA)
  const baseWhereStr = baseWhereClauses.length > 0 ? `WHERE ${baseWhereClauses.join(' AND ')}` : '';
  const statsQuery = `
    SELECT hd.tipo, COUNT(*) as count
    FROM hosting_dominio hd
    LEFT JOIN empresa e ON hd.empresa_id = e.id
    LEFT JOIN proveedor p ON hd.proveedor_id = p.id
    ${baseWhereStr}
    GROUP BY hd.tipo
  `;
  const [statsRows] = await pool.query<RowDataPacket[]>(statsQuery, baseParams);

  const stats = {
    totalHostings: 0,
    totalDominios: 0,
    totalLicencias: 0,
    totalServicios: 0,
    totalFirmas: 0
  };

  for (const r of statsRows) {
    if (r.tipo === 'HOSTING') stats.totalHostings = Number(r.count);
    if (r.tipo === 'DOMINIO') stats.totalDominios = Number(r.count);
    if (r.tipo === 'LICENCIA') stats.totalLicencias = Number(r.count);
    if (r.tipo === 'SERVICIO') stats.totalServicios = Number(r.count);
    if (r.tipo === 'FIRMA') stats.totalFirmas = Number(r.count);
  }

  // Where clauses including specific tipo if requested
  const whereClauses = [...baseWhereClauses];
  const params = [...baseParams];

  if (tipo) {
    whereClauses.push('hd.tipo = ?');
    params.push(tipo);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  if (page && limit) {
    const skip = (page - 1) * limit;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM hosting_dominio hd
      LEFT JOIN empresa e ON hd.empresa_id = e.id
      LEFT JOIN proveedor p ON hd.proveedor_id = p.id
      ${whereStr}
    `;
    const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
    const total = countRows[0]?.count || 0;

    const dataQuery = `
      SELECT 
        hd.*,
        e.nombre as empresa_nombre,
        p.nombre as proveedor_nombre,
        u.nombre_completo as creador_nombre,
        DATEDIFF(hd.pagado_hasta, CURDATE()) as dias_restantes,
        CASE 
          WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) < 0 THEN 'VENCIDO'
          WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) <= 60 THEN 'POR_VENCER'
          ELSE 'VIGENTE'
        END as estado_vencimiento
      FROM hosting_dominio hd
      LEFT JOIN empresa e ON hd.empresa_id = e.id
      LEFT JOIN proveedor p ON hd.proveedor_id = p.id
      LEFT JOIN usuario u ON hd.creador_id = u.id
      ${whereStr}
      ORDER BY 
        CASE WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) <= 60 THEN 0 ELSE 1 END,
        hd.pagado_hasta ASC,
        hd.nombre ASC
      LIMIT ? OFFSET ?
    `;

    const [dataRows] = await pool.query<RowDataPacket[]>(dataQuery, [...params, limit, skip]);
    return {
      total,
      page,
      limit,
      data: dataRows as HostingDominio[],
      stats
    };
  }

  const query = `
    SELECT 
      hd.*,
      e.nombre as empresa_nombre,
      p.nombre as proveedor_nombre,
      u.nombre_completo as creador_nombre,
      DATEDIFF(hd.pagado_hasta, CURDATE()) as dias_restantes,
      CASE 
        WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) < 0 THEN 'VENCIDO'
        WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) <= 60 THEN 'POR_VENCER'
        ELSE 'VIGENTE'
      END as estado_vencimiento
    FROM hosting_dominio hd
    LEFT JOIN empresa e ON hd.empresa_id = e.id
    LEFT JOIN proveedor p ON hd.proveedor_id = p.id
    LEFT JOIN usuario u ON hd.creador_id = u.id
    ${whereStr}
    ORDER BY 
      CASE WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) <= 60 THEN 0 ELSE 1 END,
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
        WHEN DATEDIFF(hd.pagado_hasta, CURDATE()) <= 60 THEN 'POR_VENCER'
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
  console.log('[Cron] Verificando vencimientos de Hostings, Dominios, Licencias, Servicios y Firmas (Alerta <= 60 días)...');
  try {
    await ensureTableExists();
    const query = `
      SELECT 
        hd.*,
        u.email as creador_email,
        u.nombre_completo as creador_nombre,
        e.nombre as empresa_nombre,
        DATEDIFF(hd.pagado_hasta, CURDATE()) as dias_restantes
      FROM hosting_dominio hd
      LEFT JOIN usuario u ON hd.creador_id = u.id
      LEFT JOIN empresa e ON hd.empresa_id = e.id
      WHERE hd.is_active = 1
        AND DATEDIFF(hd.pagado_hasta, CURDATE()) <= 60
        AND (hd.ultima_notificacion IS NULL OR hd.ultima_notificacion < CURDATE())
    `;

    const [expiringItems] = await pool.query<RowDataPacket[]>(query);
    if (!expiringItems || expiringItems.length === 0) {
      console.log('[Cron] No hay servicios próximos a vencer pendientes de notificación hoy.');
      return;
    }

    // Fetch admin & supervisor users to also receive notifications
    const [adminUsers] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.email, u.nombre_completo as nombre 
       FROM usuario u 
       JOIN rol r ON u.rol_id = r.id 
       WHERE r.nombre IN ('ADMIN', 'SUPERVISOR') AND u.is_active = 1`
    );

    const tipoMap: Record<string, string> = {
      'HOSTING': 'Hosting',
      'DOMINIO': 'Dominio',
      'LICENCIA': 'Licencia',
      'SERVICIO': 'Servicio',
      'FIRMA': 'Firma Digital'
    };

    for (const item of expiringItems) {
      const tipoLabel = tipoMap[item.tipo] || item.tipo;
      const empresaLabel = item.empresa_nombre ? ` (${item.empresa_nombre})` : '';
      const diasMsg = item.dias_restantes < 0 
        ? `venció hace ${Math.abs(item.dias_restantes)} días` 
        : item.dias_restantes === 0 
          ? 'vence el día de HOY' 
          : `vencerá en ${item.dias_restantes} días (Fecha: ${item.pagado_hasta.toISOString ? item.pagado_hasta.toISOString().split('T')[0] : item.pagado_hasta})`;

      const titulo = `Alerta Pago de ${tipoLabel}: ${item.nombre}`;
      const mensaje = `El servicio (${tipoLabel}) "${item.nombre}"${empresaLabel} ${diasMsg}. Por favor gestionar la renovación del pago.`;

      // Set to keep track of notified users to prevent duplicate notifications
      const notifiedUserIds = new Set<number>();

      // 1. Notify N1 Technician(s) of the Empresa
      if (item.empresa_id) {
        const [n1Techs] = await pool.query<RowDataPacket[]>(
          `SELECT DISTINCT u.id, u.email, u.nombre_completo as nombre
           FROM usuario u
           LEFT JOIN empresa e ON e.tecnico_principal_id = u.id AND e.id = ?
           LEFT JOIN usuario_empresa ue ON u.id = ue.usuario_id AND ue.empresa_id = ?
           WHERE (e.id IS NOT NULL OR ue.empresa_id IS NOT NULL)
             AND u.is_active = 1
             AND u.nivel_soporte = 'N1'`,
          [item.empresa_id, item.empresa_id]
        );

        for (const n1 of n1Techs) {
          if (!notifiedUserIds.has(n1.id)) {
            await crearNotificacion(n1.id, titulo, mensaje);
            notifiedUserIds.add(n1.id);
            if (n1.email) {
              await enviarCorreo(n1.email, titulo, mensaje);
            }
          }
        }
      }

      // 2. Notify creator
      if (item.creador_id && !notifiedUserIds.has(item.creador_id)) {
        await crearNotificacion(item.creador_id, titulo, mensaje);
        notifiedUserIds.add(item.creador_id);

        if (item.creador_email) {
          await enviarCorreo(item.creador_email, titulo, mensaje);
        }
      }

      // 3. Notify Admins & Supervisors
      for (const admin of adminUsers) {
        if (!notifiedUserIds.has(admin.id)) {
          await crearNotificacion(admin.id, titulo, mensaje);
          notifiedUserIds.add(admin.id);
          if (admin.email) {
            await enviarCorreo(admin.email, titulo, mensaje);
          }
        }
      }

      // Mark notification date as today so we don't spam multiple times on the same date
      await pool.query(
        `UPDATE hosting_dominio SET ultima_notificacion = CURDATE() WHERE id = ?`,
        [item.id]
      );
      console.log(`[Cron] Notificación enviada para ${item.tipo} #${item.id} ("${item.nombre}") a ${notifiedUserIds.size} usuarios.`);
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
