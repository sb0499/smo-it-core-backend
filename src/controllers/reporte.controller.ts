import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { pool } from '../db/connection';
import { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';
import { formatearFechaEcuador, getFechaHoraActualEcuador } from '../utils/date.utils';

/**
 * Función auxiliar para calcular estado y cumplimiento de SLA de un ticket
 */
const calcularSlaTicket = (t: any): { slaHoras: number; slaEstadoStr: string; esCumplido: boolean } => {
  const slaHoras = t.sla_horas || (
    t.prioridad === 'Critica' || t.prioridad === 'Crítica' ? 4 :
    t.prioridad === 'Alta' ? 8 :
    t.prioridad === 'Media' ? 24 : 48
  );

  let slaEstadoStr = 'En Tiempo';
  let esCumplido = true;

  const createdDate = new Date(t.created_at).getTime();
  const endDate = (t.estado === 'Cerrado' || t.estado === 'Resuelto' || t.estado === 'Finalizada') && t.updated_at
    ? new Date(t.updated_at).getTime()
    : new Date().getTime();

  let pausaHoras = 0;
  if (t.sla_acumulado_pausa_segundos) {
    pausaHoras = t.sla_acumulado_pausa_segundos / 3600;
  }
  if (t.sla_paused_at && t.estado !== 'Cerrado' && t.estado !== 'Resuelto' && t.estado !== 'Finalizada') {
    const pausaStart = new Date(t.sla_paused_at).getTime();
    pausaHoras += (endDate - pausaStart) / (1000 * 60 * 60);
  }

  const diffHours = Math.max(0, (endDate - createdDate) / (1000 * 60 * 60) - pausaHoras);

  if (t.estado === 'Cerrado' || t.estado === 'Resuelto' || t.estado === 'Finalizada') {
    if (diffHours > slaHoras) {
      slaEstadoStr = 'Vencido en Cierre';
      esCumplido = false;
    } else {
      slaEstadoStr = 'Cumplido';
      esCumplido = true;
    }
  } else {
    if (diffHours > slaHoras) {
      slaEstadoStr = 'SLA Vencido';
      esCumplido = false;
    } else if (diffHours > slaHoras * 0.75) {
      slaEstadoStr = 'En Riesgo';
      esCumplido = true;
    } else {
      slaEstadoStr = 'En Tiempo';
      esCumplido = true;
    }
  }

  return { slaHoras, slaEstadoStr, esCumplido };
};

/**
 * Obtiene métricas analíticas, distribuciones y SLA general para el rango de fechas y técnico seleccionado
 */
export const getReporteStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, tecnico_id } = req.query;
    let query = `
      SELECT t.id, t.titulo, t.descripcion, t.categoria, t.prioridad, t.estado, 
             t.nivel_soporte, t.grupo_n2, t.created_at, t.updated_at,
             t.sla_horas, t.sla_paused_at, t.sla_acumulado_pausa_segundos,
             t.tecnico_id,
             a.nombre_completo AS tecnico_nombre
      FROM ticket t
      LEFT JOIN usuario a ON t.tecnico_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (start_date) {
      query += ` AND DATE(t.created_at) >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND DATE(t.created_at) <= ?`;
      params.push(end_date);
    }

    if (req.currentUser.rol_nombre === 'ADMIN' || req.currentUser.rol_nombre === 'SUPERVISOR') {
      if (tecnico_id) {
        query += ` AND t.tecnico_id = ?`;
        params.push(tecnico_id);
      }
    } else if (req.currentUser.rol_nombre === 'TECNICO') {
      query += ` AND t.tecnico_id = ?`;
      params.push(req.currentUser.id);
    } else {
      query += ` AND t.creador_id = ?`;
      params.push(req.currentUser.id);
    }

    const [tickets] = await pool.query<RowDataPacket[]>(query, params);

    // Contadores de inventario y proyectos
    const [activosRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) as total_stock FROM activo WHERE estado = 'Stock'`);
    const [proyectosRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) as total_activos FROM proyecto WHERE estado != 'Finalizado'`);

    let slaCumplidos = 0;
    let slaVencidos = 0;
    let slaEnRiesgo = 0;
    let slaEnTiempo = 0;

    const ticketsPorPrioridad = { Baja: 0, Media: 0, Alta: 0, Critica: 0 };
    const ticketsPorEstado = {
      Nuevo: 0,
      EnProceso: 0,
      Resuelto: 0,
      Cerrado: 0,
      ElevadoAProveedor: 0,
      ElevadoAAdministracion: 0
    };

    let solucionados = 0;
    let pendientes = 0;

    const tecMap = new Map<number, { id: number; nombre: string; total: number; resueltos: number; abiertos: number; slaCumplidos: number; slaVencidos: number }>();

    for (const t of tickets) {
      const { slaEstadoStr, esCumplido } = calcularSlaTicket(t);

      if (slaEstadoStr === 'SLA Vencido' || slaEstadoStr === 'Vencido en Cierre') {
        slaVencidos++;
      } else if (slaEstadoStr === 'En Riesgo') {
        slaEnRiesgo++;
        slaCumplidos++;
      } else {
        slaEnTiempo++;
        slaCumplidos++;
      }

      const normPrio = t.prioridad === 'Crítica' ? 'Critica' : t.prioridad;
      if (ticketsPorPrioridad[normPrio as keyof typeof ticketsPorPrioridad] !== undefined) {
        ticketsPorPrioridad[normPrio as keyof typeof ticketsPorPrioridad]++;
      }

      const esCerrado = t.estado === 'Cerrado' || t.estado === 'Finalizada';
      const esResuelto = t.estado === 'Resuelto';
      if (esCerrado || esResuelto) {
        solucionados++;
      } else {
        pendientes++;
      }

      const stateKey = (t.estado === 'Finalizada' ? 'Cerrado' : t.estado === 'Escalado a Proveedor' ? 'ElevadoAProveedor' : t.estado.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '')) as keyof typeof ticketsPorEstado;
      if (ticketsPorEstado[stateKey] !== undefined) {
        ticketsPorEstado[stateKey]++;
      }

      const tid = t.tecnico_id || 0;
      const tnom = t.tecnico_nombre || 'Sin Asignar';
      if (!tecMap.has(tid)) {
        tecMap.set(tid, { id: tid, nombre: tnom, total: 0, resueltos: 0, abiertos: 0, slaCumplidos: 0, slaVencidos: 0 });
      }
      const tecInfo = tecMap.get(tid)!;
      tecInfo.total++;
      if (esCerrado || esResuelto) tecInfo.resueltos++;
      else tecInfo.abiertos++;
      if (esCumplido) tecInfo.slaCumplidos++;
      else tecInfo.slaVencidos++;
    }

    const totalTickets = tickets.length;
    const slaTotalEvaluados = slaCumplidos + slaVencidos;
    const cumplimientoSlaPct = slaTotalEvaluados > 0 ? Math.round((slaCumplidos / slaTotalEvaluados) * 100) : 100;
    const efectividadPct = totalTickets > 0 ? Math.round((solucionados / totalTickets) * 100) : 0;

    const desgloseTecnicos = Array.from(tecMap.values()).map(tec => {
      const totSla = tec.slaCumplidos + tec.slaVencidos;
      return {
        ...tec,
        slaPct: totSla > 0 ? Math.round((tec.slaCumplidos / totSla) * 100) : 100
      };
    });

    res.json({
      totalTickets,
      solucionados,
      pendientes,
      efectividadPct,
      assetsInStock: activosRows[0]?.total_stock || 0,
      activeProjects: proyectosRows[0]?.total_activos || 0,
      sla: {
        totalEvaluados: slaTotalEvaluados,
        cumplidos: slaCumplidos,
        vencidos: slaVencidos,
        enRiesgo: slaEnRiesgo,
        enTiempo: slaEnTiempo,
        cumplimientoPct: cumplimientoSlaPct
      },
      ticketsPorPrioridad,
      ticketsPorEstado,
      desgloseTecnicos
    });
  } catch (error: any) {
    console.error('Error al obtener estadísticas de reportes:', error);
    res.status(500).json({ detail: error.message || 'Error al obtener estadísticas de reportes' });
  }
};

export const exportTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, tecnico_id } = req.query;
    let query = `
      SELECT t.id, t.titulo, t.descripcion, t.categoria, t.prioridad, t.estado, 
             t.nivel_soporte, t.grupo_n2, t.area_solicitante, t.persona_solicitante, 
             t.medio_solicitud, t.created_at, t.updated_at,
             t.sla_horas, t.sla_paused_at, t.sla_acumulado_pausa_segundos,
             emp.nombre AS empresa_nombre,
             suc.nombre AS sucursal_nombre,
             c.nombre_completo AS creador_nombre,
             a.id AS tecnico_id,
             a.nombre_completo AS tecnico_nombre,
             a.email AS tecnico_email
      FROM ticket t
      LEFT JOIN empresa emp ON t.empresa_id = emp.id
      LEFT JOIN sucursal suc ON t.sucursal_id = suc.id
      LEFT JOIN usuario c ON t.creador_id = c.id
      LEFT JOIN usuario a ON t.tecnico_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (start_date) {
      query += ` AND DATE(t.created_at) >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND DATE(t.created_at) <= ?`;
      params.push(end_date);
    }

    if (req.currentUser.rol_nombre === 'ADMIN' || req.currentUser.rol_nombre === 'SUPERVISOR') {
      if (tecnico_id) {
        query += ` AND t.tecnico_id = ?`;
        params.push(tecnico_id);
      }
    } else if (req.currentUser.rol_nombre === 'TECNICO') {
      query += ` AND t.tecnico_id = ?`;
      params.push(req.currentUser.id);
    } else {
      query += ` AND t.creador_id = ?`;
      params.push(req.currentUser.id);
    }

    query += ` ORDER BY t.id DESC`;

    const [tickets] = await pool.query<RowDataPacket[]>(query, params);

    // Obtener nombre del técnico filtrado si aplica
    let tecnicoFiltradoNombre = 'Todos los Especialistas (Global)';
    if (tecnico_id) {
      const [techRes] = await pool.query<RowDataPacket[]>(
        `SELECT nombre_completo FROM usuario WHERE id = ?`,
        [tecnico_id]
      );
      if (techRes.length > 0) {
        tecnicoFiltradoNombre = techRes[0].nombre_completo;
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TISMO - IT CORE SYSTEM';
    workbook.created = new Date();

    // =========================================================================
    // HOJA 1: RESUMEN GENERAL CONSOLIDADO
    // =========================================================================
    const ws = workbook.addWorksheet('Resumen de Tickets', {
      views: [{ showGridLines: true }]
    });

    // 1. Banner Corporativo Superior
    ws.mergeCells('A2:N2');
    const titleCell = ws.getCell('A2');
    titleCell.value = 'TISMO • REPORTE GENERAL DE SOPORTE, SLA & GESTIÓN DE TICKETS TI';
    titleCell.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    ws.getRow(2).height = 34;

    // 2. Subtítulo con filtros y fecha
    ws.mergeCells('A3:N3');
    const subtitleCell = ws.getCell('A3');
    const filtroFechaStr = `Filtro: ${start_date ? `Desde ${start_date}` : 'Inicio Histórico'} ${end_date ? `Hasta ${end_date}` : 'Hasta la actualidad'}`;
    subtitleCell.value = `${filtroFechaStr}  |  Especialista: ${tecnicoFiltradoNombre}  |  Generado: ${getFechaHoraActualEcuador()}`;
    subtitleCell.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: 'FFFFFFFF' } };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    ws.getRow(3).height = 22;

    // Métricas KPI
    const totalCount = tickets.length;
    const resueltosCount = tickets.filter(t => t.estado === 'Finalizada' || t.estado === 'Resuelto' || t.estado === 'Cerrado').length;
    const enProcesoCount = tickets.filter(t => t.estado === 'En Proceso' || t.estado === 'Pruebas').length;
    const nuevosCount = tickets.filter(t => t.estado === 'Nuevo' || t.estado === 'Pendiente').length;

    let slaCumplidosG = 0;
    let slaVencidosG = 0;

    // Procesar cada ticket con su SLA
    const ticketsConSla: any[] = (tickets as any[]).map(t => {
      const { slaHoras, slaEstadoStr, esCumplido } = calcularSlaTicket(t);
      if (esCumplido) slaCumplidosG++;
      else slaVencidosG++;
      return { ...t, slaHoras, slaEstadoStr, esCumplido };
    });

    const totalSlaG = slaCumplidosG + slaVencidosG;
    const cumplimientoSlaGlobal = totalSlaG > 0 ? Math.round((slaCumplidosG / totalSlaG) * 100) : 100;

    const kpis = [
      { label: 'Total Tickets', val: totalCount, color: 'FF2563EB' },
      { label: '% Cumplimiento SLA', val: `${cumplimientoSlaGlobal}%`, color: 'FF0D9488' },
      { label: 'Resueltos / Cerrados', val: resueltosCount, color: 'FF059669' },
      { label: 'En Proceso / Pruebas', val: enProcesoCount, color: 'FF0284C7' },
      { label: 'Nuevos / Pendientes', val: nuevosCount, color: 'FFD97706' },
      { label: 'SLA Vencidos', val: slaVencidosG, color: 'FFDC2626' }
    ];

    ws.getRow(5).height = 18;
    ws.getRow(6).height = 26;

    // Renderizar tarjetas KPI en pares de columnas
    kpis.forEach((kpi, idx) => {
      const col = idx * 2 + 1; // A, C, E, G, I, K
      const colNext = col + 1;
      
      ws.mergeCells(5, col, 5, colNext);
      const labelCell = ws.getCell(5, col);
      labelCell.value = kpi.label;
      labelCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      labelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

      ws.mergeCells(6, col, 6, colNext);
      const valCell = ws.getCell(6, col);
      valCell.value = kpi.val;
      valCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: kpi.color } };
      valCell.alignment = { horizontal: 'center', vertical: 'middle' };
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      valCell.border = { bottom: { style: 'medium', color: { argb: kpi.color } }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 3. Título de la tabla
    ws.mergeCells('A8:N8');
    const tableTitle = ws.getCell('A8');
    tableTitle.value = 'DETALLE DE TICKETS, CASOS DE SOPORTE Y SEGUIMIENTO DE SLA';
    tableTitle.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    tableTitle.alignment = { vertical: 'middle' };
    ws.getRow(8).height = 24;

    // 4. Cabeceras de la tabla
    const headers = [
      'ID',
      'Tipo ITIL / Cat.',
      'Nivel',
      'Sede / Empresa',
      'Sucursal',
      'Requerimiento / Asunto',
      'Solicitante',
      'Área',
      'Prioridad',
      'Estado Actual',
      'Horas SLA',
      'Estado SLA',
      'Especialista Asignado',
      'Fecha Creación'
    ];

    const hRow = ws.getRow(9);
    hRow.height = 26;
    headers.forEach((h, idx) => {
      const c = hRow.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      c.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 5. Filas de datos
    let currentRowNum = 10;
    if (ticketsConSla.length === 0) {
      ws.mergeCells('A10:N10');
      const emptyCell = ws.getCell('A10');
      emptyCell.value = 'No se encontraron tickets registrados con los filtros seleccionados.';
      emptyCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(10).height = 30;
    } else {
      for (const t of ticketsConSla) {
        const row = ws.getRow(currentRowNum);
        row.height = 24;
        const isZebra = currentRowNum % 2 === 0;
        const bgColor = isZebra ? 'FFFFFFFF' : 'FFF8FAFC';

        // Color condicional según el estado
        let estadoColor = 'FF334155';
        if (t.estado === 'Finalizada' || t.estado === 'Resuelto' || t.estado === 'Cerrado') estadoColor = 'FF059669';
        else if (t.estado === 'En Proceso' || t.estado === 'Pruebas') estadoColor = 'FF2563EB';
        else if (t.estado && t.estado.includes('Escalado')) estadoColor = 'FF7C3AED';
        else if (t.estado === 'Nuevo' || t.estado === 'Pendiente') estadoColor = 'FFD97706';

        // Color SLA
        let slaColor = 'FF059669';
        if (t.slaEstadoStr.includes('Vencido')) slaColor = 'FFDC2626';
        else if (t.slaEstadoStr.includes('Riesgo')) slaColor = 'FFD97706';

        const rowValues = [
          `#${t.id}`,
          t.categoria || 'Soporte',
          t.grupo_n2 ? `${t.nivel_soporte || 'N1'} (${t.grupo_n2})` : (t.nivel_soporte || 'N1'),
          t.empresa_nombre || 'General',
          t.sucursal_nombre || 'Matriz',
          t.titulo || 'Sin título',
          t.persona_solicitante || t.creador_nombre || 'N/A',
          t.area_solicitante || 'General',
          t.prioridad || 'Media',
          t.estado || 'Nuevo',
          `${t.slaHoras}h`,
          t.slaEstadoStr,
          t.tecnico_nombre || 'Sin asignar',
          formatearFechaEcuador(t.created_at)
        ];

        rowValues.forEach((v, idx) => {
          const cell = row.getCell(idx + 1);
          cell.value = v;
          cell.font = {
            name: 'Arial',
            size: 9,
            bold: idx === 0 || idx === 9 || idx === 11,
            color: idx === 9 ? { argb: estadoColor } : idx === 11 ? { argb: slaColor } : { argb: 'FF1E293B' }
          };
          cell.alignment = {
            horizontal: (idx === 5 || idx === 6) ? 'left' : 'center',
            vertical: 'middle'
          };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        });

        currentRowNum++;
      }
    }

    // Configuración de anchos de columna
    ws.getColumn(1).width = 10;  // ID
    ws.getColumn(2).width = 18;  // Tipo / Cat
    ws.getColumn(3).width = 16;  // Nivel
    ws.getColumn(4).width = 24;  // Empresa
    ws.getColumn(5).width = 18;  // Sucursal
    ws.getColumn(6).width = 38;  // Requerimiento
    ws.getColumn(7).width = 24;  // Solicitante
    ws.getColumn(8).width = 18;  // Área
    ws.getColumn(9).width = 14;  // Prioridad
    ws.getColumn(10).width = 18; // Estado
    ws.getColumn(11).width = 12; // Horas SLA
    ws.getColumn(12).width = 16; // Estado SLA
    ws.getColumn(13).width = 25; // Especialista
    ws.getColumn(14).width = 20; // Fecha

    // =========================================================================
    // HOJAS ADICIONALES: PESTAÑAS INDIVIDUALES SI HAY VARIOS ESPECIALISTAS
    // =========================================================================
    if (!tecnico_id && ticketsConSla.length > 0) {
      const tecMap = new Map<number, { nombre: string; email: string; tickets: typeof ticketsConSla }>();
      for (const t of ticketsConSla) {
        if (t.tecnico_id) {
          if (!tecMap.has(t.tecnico_id)) {
            tecMap.set(t.tecnico_id, {
              nombre: t.tecnico_nombre || `Técnico #${t.tecnico_id}`,
              email: t.tecnico_email || '',
              tickets: []
            });
          }
          tecMap.get(t.tecnico_id)!.tickets.push(t);
        }
      }

      for (const [, tecData] of tecMap) {
        const sanitizedSheetName = tecData.nombre
          .replace(/[\\/?*:[\]]/g, '')
          .trim()
          .substring(0, 28);

        const wsTec = workbook.addWorksheet(sanitizedSheetName, {
          views: [{ showGridLines: true }]
        });

        const tecCumplidos = tecData.tickets.filter(x => x.esCumplido).length;
        const tecTotal = tecData.tickets.length;
        const tecSlaPct = tecTotal > 0 ? Math.round((tecCumplidos / tecTotal) * 100) : 100;

        // Banner del especialista
        wsTec.mergeCells('A1:L1');
        const tecBanner = wsTec.getCell('A1');
        tecBanner.value = `TISMO • TICKETS DEL ESPECIALISTA: ${tecData.nombre.toUpperCase()} (SLA: ${tecSlaPct}%)`;
        tecBanner.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        tecBanner.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        tecBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        wsTec.getRow(1).height = 28;

        // Sub-banner
        wsTec.mergeCells('A2:L2');
        const tecSub = wsTec.getCell('A2');
        tecSub.value = `Total Asignados: ${tecData.tickets.length}  |  Resueltos: ${tecData.tickets.filter(x => x.estado === 'Finalizada' || x.estado === 'Resuelto' || x.estado === 'Cerrado').length}  |  En Proceso: ${tecData.tickets.filter(x => x.estado === 'En Proceso' || x.estado === 'Pruebas').length}  |  % SLA: ${tecSlaPct}%  |  Correo: ${tecData.email || 'N/A'}`;
        tecSub.font = { name: 'Arial', size: 9, color: { argb: 'FFFFFFFF' } };
        tecSub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        tecSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        wsTec.getRow(2).height = 20;

        // Headers de la pestaña
        const tecHeaders = [
          'ID',
          'Tipo / Cat.',
          'Sede',
          'Requerimiento',
          'Solicitante',
          'Área',
          'Prioridad',
          'Estado',
          'Horas SLA',
          'Estado SLA',
          'Fecha Creación',
          'Última Modificación'
        ];

        const tecHRow = wsTec.getRow(4);
        tecHRow.height = 24;
        tecHeaders.forEach((h, idx) => {
          const c = tecHRow.getCell(idx + 1);
          c.value = h;
          c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
          c.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        let tRow = 5;
        for (const item of tecData.tickets) {
          const r = wsTec.getRow(tRow);
          r.height = 22;
          const bgZebra = tRow % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

          let stCol = 'FF334155';
          if (item.estado === 'Finalizada' || item.estado === 'Resuelto' || item.estado === 'Cerrado') stCol = 'FF059669';
          else if (item.estado === 'En Proceso') stCol = 'FF2563EB';

          let slaCol = item.esCumplido ? 'FF059669' : 'FFDC2626';

          const vals = [
            `#${item.id}`,
            item.categoria || 'Soporte',
            item.empresa_nombre || 'General',
            item.titulo,
            item.persona_solicitante || item.creador_nombre || 'N/A',
            item.area_solicitante || 'General',
            item.prioridad,
            item.estado,
            `${item.slaHoras}h`,
            item.slaEstadoStr,
            formatearFechaEcuador(item.created_at),
            formatearFechaEcuador(item.updated_at)
          ];

          vals.forEach((v, idx) => {
            const cell = r.getCell(idx + 1);
            cell.value = v;
            cell.font = {
              name: 'Arial',
              size: 9,
              bold: idx === 0 || idx === 7 || idx === 9,
              color: idx === 7 ? { argb: stCol } : idx === 9 ? { argb: slaCol } : { argb: 'FF1E293B' }
            };
            cell.alignment = {
              horizontal: (idx === 3 || idx === 4) ? 'left' : 'center',
              vertical: 'middle'
            };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgZebra } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
          });

          tRow++;
        }

        wsTec.getColumn(1).width = 10;
        wsTec.getColumn(2).width = 16;
        wsTec.getColumn(3).width = 22;
        wsTec.getColumn(4).width = 36;
        wsTec.getColumn(5).width = 24;
        wsTec.getColumn(6).width = 18;
        wsTec.getColumn(7).width = 14;
        wsTec.getColumn(8).width = 16;
        wsTec.getColumn(9).width = 12;
        wsTec.getColumn(10).width = 16;
        wsTec.getColumn(11).width = 18;
        wsTec.getColumn(12).width = 18;
      }
    }

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(`reporte_tickets_${start_date || 'inicio'}_${end_date || 'actual'}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('Error al exportar reporte de tickets:', error);
    res.status(500).json({ detail: error.message || 'Error al generar reporte de tickets' });
  }
};

export const exportProyectos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, tecnico_id } = req.query;
    let query = `
      SELECT p.id, p.nombre, p.descripcion, p.estado, p.tipo_proyecto, p.avance_porcentaje,
             p.fecha_inicio, p.fecha_fin_estimada, p.created_at,
             c.nombre_completo AS creador_nombre,
             COUNT(DISTINCT tp.id) AS total_tareas,
             SUM(CASE WHEN tp.estado = 'Finalizado' THEN 1 ELSE 0 END) AS tareas_finalizadas,
             SUM(CASE WHEN tp.estado = 'En Proceso' THEN 1 ELSE 0 END) AS tareas_en_proceso,
             COUNT(DISTINCT tc.usuario_id) AS total_miembros
      FROM proyecto p
      LEFT JOIN usuario c ON p.creador_id = c.id
      LEFT JOIN tarea_proyecto tp ON p.id = tp.proyecto_id
      LEFT JOIN (
        SELECT proyecto_id, responsable_id AS usuario_id FROM tarea_proyecto
      ) tc ON p.id = tc.proyecto_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (start_date) {
      query += ` AND DATE(p.created_at) >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND DATE(p.created_at) <= ?`;
      params.push(end_date);
    }

    if (req.currentUser.rol_nombre === 'ADMIN' || req.currentUser.rol_nombre === 'SUPERVISOR') {
      if (tecnico_id) {
        query += ` AND p.id IN (SELECT proyecto_id FROM tarea_proyecto WHERE responsable_id = ?)`;
        params.push(tecnico_id);
      }
    } else if (req.currentUser.rol_nombre === 'TECNICO') {
      query += ` AND p.id IN (SELECT proyecto_id FROM tarea_proyecto WHERE responsable_id = ?)`;
      params.push(req.currentUser.id);
    } else {
      query += ` AND p.creador_id = ?`;
      params.push(req.currentUser.id);
    }

    query += ` GROUP BY p.id ORDER BY p.id DESC`;

    const [proyectos] = await pool.query<RowDataPacket[]>(query, params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TISMO - IT CORE SYSTEM';
    workbook.created = new Date();

    // =========================================================================
    // HOJA 1: RESUMEN DE PROYECTOS Y PLANIFICACIÓN
    // =========================================================================
    const ws = workbook.addWorksheet('Resumen de Proyectos', {
      views: [{ showGridLines: true }]
    });

    // 1. Banner Corporativo Superior
    ws.mergeCells('A2:L2');
    const titleCell = ws.getCell('A2');
    titleCell.value = 'TISMO • REPORTE GENERAL DE PROYECTOS Y PLANIFICACIÓN TI';
    titleCell.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    ws.getRow(2).height = 34;

    // 2. Subtítulo con filtros y fecha
    ws.mergeCells('A3:L3');
    const subtitleCell = ws.getCell('A3');
    const filtroFechaStr = `Filtro: ${start_date ? `Desde ${start_date}` : 'Inicio Histórico'} ${end_date ? `Hasta ${end_date}` : 'Hasta la actualidad'}`;
    subtitleCell.value = `${filtroFechaStr}  |  Generado: ${getFechaHoraActualEcuador()}`;
    subtitleCell.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: 'FFFFFFFF' } };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    ws.getRow(3).height = 22;

    // Métricas KPI
    const totalProj = proyectos.length;
    const finalizadosProj = proyectos.filter(p => p.estado === 'Finalizado').length;
    const enProcesoProj = proyectos.filter(p => p.estado === 'En Proceso' || p.estado === 'Pruebas').length;
    const sinIniciarProj = proyectos.filter(p => p.estado === 'Sin Iniciar' || p.estado === 'Stand By').length;
    const totalTareasCount = proyectos.reduce((acc, p) => acc + Number(p.total_tareas || 0), 0);
    const avgAvance = totalProj > 0 ? Math.round(proyectos.reduce((acc, p) => acc + Number(p.avance_porcentaje || 0), 0) / totalProj) : 0;

    const kpis = [
      { label: 'Total Proyectos', val: totalProj, color: 'FF2563EB' },
      { label: 'En Proceso / Pruebas', val: enProcesoProj, color: 'FF0284C7' },
      { label: 'Finalizados', val: finalizadosProj, color: 'FF059669' },
      { label: 'Stand By / Sin Iniciar', val: sinIniciarProj, color: 'FFD97706' },
      { label: 'Total Tareas', val: totalTareasCount, color: 'FF7C3AED' },
      { label: 'Avance Promedio', val: `${avgAvance}%`, color: 'FF0D9488' }
    ];

    ws.getRow(5).height = 18;
    ws.getRow(6).height = 26;

    kpis.forEach((kpi, idx) => {
      const col = idx * 2 + 1;
      const colNext = col + 1;
      
      ws.mergeCells(5, col, 5, colNext);
      const labelCell = ws.getCell(5, col);
      labelCell.value = kpi.label;
      labelCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      labelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

      ws.mergeCells(6, col, 6, colNext);
      const valCell = ws.getCell(6, col);
      valCell.value = kpi.val;
      valCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: kpi.color } };
      valCell.alignment = { horizontal: 'center', vertical: 'middle' };
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      valCell.border = { bottom: { style: 'medium', color: { argb: kpi.color } }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 3. Título de la tabla matriz
    ws.mergeCells('A8:L8');
    const tableTitle = ws.getCell('A8');
    tableTitle.value = 'MATRIZ DE SEGUIMIENTO Y AVANCE DE PROYECTOS';
    tableTitle.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    tableTitle.alignment = { vertical: 'middle' };
    ws.getRow(8).height = 24;

    // 4. Cabeceras de la tabla
    const headers = [
      'ID',
      'Nombre del Proyecto',
      'Tipo / Categoría',
      'Estado',
      'Avance',
      'Líder / Creador',
      'Fecha Inicio',
      'Fecha Fin Estimada',
      'Tareas Totales',
      'Tareas Finalizadas',
      'Tareas En Proceso',
      'Descripción / Alcance'
    ];

    const hRow = ws.getRow(9);
    hRow.height = 26;
    headers.forEach((h, idx) => {
      const c = hRow.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      c.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 5. Filas de datos
    let currentRowNum = 10;
    if (proyectos.length === 0) {
      ws.mergeCells('A10:L10');
      const emptyCell = ws.getCell('A10');
      emptyCell.value = 'No se encontraron proyectos registrados con los filtros seleccionados.';
      emptyCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(10).height = 30;
    } else {
      for (const p of proyectos) {
        const row = ws.getRow(currentRowNum);
        row.height = 24;
        const isZebra = currentRowNum % 2 === 0;
        const bgColor = isZebra ? 'FFFFFFFF' : 'FFF8FAFC';

        let estadoColor = 'FF334155';
        if (p.estado === 'Finalizado') estadoColor = 'FF059669';
        else if (p.estado === 'En Proceso') estadoColor = 'FF2563EB';
        else if (p.estado === 'Pruebas') estadoColor = 'FF7C3AED';
        else if (p.estado === 'Sin Iniciar' || p.estado === 'Stand By') estadoColor = 'FFD97706';

        const rowValues = [
          `#${p.id}`,
          p.nombre,
          p.tipo_proyecto || 'General',
          p.estado,
          `${p.avance_porcentaje || 0}%`,
          p.creador_nombre || 'N/A',
          formatearFechaEcuador(p.fecha_inicio, false),
          formatearFechaEcuador(p.fecha_fin_estimada, false),
          p.total_tareas || 0,
          p.tareas_finalizadas || 0,
          p.tareas_en_proceso || 0,
          p.descripcion || 'Sin descripción'
        ];

        rowValues.forEach((v, idx) => {
          const cell = row.getCell(idx + 1);
          cell.value = v;
          cell.font = {
            name: 'Arial',
            size: 9,
            bold: idx === 0 || idx === 3 || idx === 4,
            color: idx === 3 ? { argb: estadoColor } : { argb: 'FF1E293B' }
          };
          cell.alignment = {
            horizontal: (idx === 1 || idx === 5 || idx === 11) ? 'left' : 'center',
            vertical: 'middle'
          };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        });

        currentRowNum++;
      }
    }

    // Configuración de anchos de columna
    ws.getColumn(1).width = 10;  // ID
    ws.getColumn(2).width = 34;  // Nombre
    ws.getColumn(3).width = 18;  // Tipo
    ws.getColumn(4).width = 16;  // Estado
    ws.getColumn(5).width = 12;  // Avance
    ws.getColumn(6).width = 24;  // Creador
    ws.getColumn(7).width = 16;  // Fecha Inicio
    ws.getColumn(8).width = 18;  // Fecha Fin
    ws.getColumn(9).width = 14;  // Tareas Totales
    ws.getColumn(10).width = 16; // Finalizadas
    ws.getColumn(11).width = 16; // En Proceso
    ws.getColumn(12).width = 38; // Descripción

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(`reporte_proyectos_${start_date || 'inicio'}_${end_date || 'actual'}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('Error al exportar reporte de proyectos:', error);
    res.status(500).json({ detail: error.message || 'Error al generar reporte de proyectos' });
  }
};
