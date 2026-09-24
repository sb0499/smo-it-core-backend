import { pool } from '../db/connection';
import { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';
import { enviarCorreo } from './notificacion.service';
import { 
  getFechaHoyEcuador, 
  getHoraActualEcuador, 
  formatearFechaEcuador, 
  getNowEcuadorParts 
} from '../utils/date.utils';

export interface ResumenTecnico {
  tecnico_id: number;
  nombre_completo: string;
  email: string;
  rol_nombre: string;
  nivel_soporte: string;
  grupo_n2: string | null;
  total_gestionados: number;
  solicitudes_n1: number;
  incidencias_n2_n3: number;
  resueltos_hoy: number;
  cerrados_hoy: number;
  abiertos_pendientes: number;
  sla_cumplidos: number;
  sla_vencidos: number;
  tickets: TicketReporte[];
}

export interface TicketReporte {
  id: number;
  titulo: string;
  descripcion: string;
  tipo_itil: 'Solicitud' | 'Incidencia';
  nivel_soporte: string;
  grupo_n2: string | null;
  empresa_nombre: string;
  sucursal_nombre: string;
  solicitante: string;
  prioridad: string;
  estado: string;
  created_at: string;
  updated_at: string;
  fecha_resolucion: string | null;
  sla_horas: number;
  sla_cumplido: boolean | null;
  sla_estado_str: string;
  adjuntos_count: number;
  adjuntos_nombres: string;
  bitacora_texto: string;
  tecnico_asignado_nombre: string;
  tecnico_n1_nombre: string;
  tecnico_n2_nombre: string;
}

export interface ReporteDiarioData {
  fecha: string;
  hora_generacion: string;
  total_tickets_dia: number;
  total_solicitudes_n1: number;
  total_incidencias: number;
  total_resueltos_hoy: number;
  total_cerrados_hoy: number;
  total_abiertos: number;
  cumplimiento_sla_porcentaje: number;
  tecnicos: ResumenTecnico[];
}

/**
 * Obtiene y procesa todos los datos para el reporte diario
 */
export const getDatosReporteDiario = async (fechaParam?: string): Promise<ReporteDiarioData> => {
  const fechaStr = fechaParam || getFechaHoyEcuador();
  const horaStr = getHoraActualEcuador();

  // 1. Obtener todos los técnicos y supervisores activos
  const [tecnicosRows] = await pool.query<RowDataPacket[]>(`
    SELECT u.id, u.nombre_completo, u.email, r.nombre as rol_nombre, 
           u.nivel_soporte, u.grupo_n2
    FROM usuario u
    JOIN rol r ON u.rol_id = r.id
    WHERE u.is_active = 1 AND r.nombre IN ('TECNICO', 'SUPERVISOR', 'ADMIN')
    ORDER BY u.nombre_completo ASC
  `);

  // 2. Obtener todos los tickets creados/actualizados en la fecha, o que están actualmente abiertos
  const [ticketRows] = await pool.query<RowDataPacket[]>(`
    SELECT t.*,
           e.nombre as empresa_nombre,
           s.nombre as sucursal_nombre,
           COALESCE(c.nombre_completo, t.persona_solicitante, 'N/A') as solicitante_nombre,
           u_tec.nombre_completo as tecnico_asignado_nombre,
           u_n1.nombre_completo as tecnico_n1_nombre,
           u_n2.nombre_completo as tecnico_n2_nombre,
           JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_raw,
           JSON_UNQUOTE(t.adjuntos) as adjuntos_raw
    FROM ticket t
    LEFT JOIN empresa e ON t.empresa_id = e.id
    LEFT JOIN sucursal s ON t.sucursal_id = s.id
    LEFT JOIN usuario c ON t.creador_id = c.id
    LEFT JOIN usuario u_tec ON t.tecnico_id = u_tec.id
    LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
    LEFT JOIN usuario u_n2 ON t.tecnico_n2_id = u_n2.id
    WHERE DATE(t.created_at) = ? 
       OR DATE(t.updated_at) = ?
       OR t.estado IN ('Nuevo', 'En Proceso', 'Elevado a Proveedor', 'Elevado a Administración')
    ORDER BY t.id DESC
  `, [fechaStr, fechaStr]);

  // Formatear cada ticket
  const allTickets: TicketReporte[] = ticketRows.map((t: any) => {
    // Tipo ITIL
    const esIncidencia = (t.nivel_soporte && t.nivel_soporte !== 'N1') || t.grupo_n2;
    const tipo_itil: 'Solicitud' | 'Incidencia' = esIncidencia ? 'Incidencia' : 'Solicitud';

    // Formatear Adjuntos
    let adjuntosCount = 0;
    let adjuntosNombres = '-';
    try {
      if (t.adjuntos_raw) {
        const parsedAdj = typeof t.adjuntos_raw === 'string' ? JSON.parse(t.adjuntos_raw) : t.adjuntos_raw;
        if (Array.isArray(parsedAdj) && parsedAdj.length > 0) {
          adjuntosCount = parsedAdj.length;
          adjuntosNombres = parsedAdj.map((a: any) => a.nombre_original || a.nombre_archivo).join(', ');
        }
      }
    } catch (_) {}

    // Formatear Bitácora Dinámica / Historial de Acciones
    let bitacoraTexto = '';
    try {
      if (t.bitacora_raw) {
        const parsedBit = typeof t.bitacora_raw === 'string' ? JSON.parse(t.bitacora_raw) : t.bitacora_raw;
        if (Array.isArray(parsedBit) && parsedBit.length > 0) {
          bitacoraTexto = parsedBit.map((b: any) => {
            const f = b.fecha ? formatearFechaEcuador(b.fecha) : '';
            const usr = b.usuario || b.autor_nombre || 'Sistema';
            const acc = b.accion || b.detalle || '';
            const not = b.notas ? ` [Notas: ${b.notas}]` : '';
            return `• [${f}] ${usr}: ${acc}${not}`;
          }).join('\n');
        }
      }
    } catch (_) {}

    if (!bitacoraTexto) {
      if (t.observaciones) {
        bitacoraTexto = `• Observaciones: ${t.observaciones}`;
      } else {
        bitacoraTexto = `• Ticket registrado el ${formatearFechaEcuador(t.created_at)}`;
      }
    }

    // SLA
    const slaHoras = t.sla_horas || (t.prioridad === 'Crítica' ? 4 : t.prioridad === 'Alta' ? 8 : t.prioridad === 'Media' ? 24 : 48);
    let slaEstadoStr = 'En Tiempo';
    if (t.estado === 'Cerrado' || t.estado === 'Resuelto') {
      slaEstadoStr = t.sla_cumplido === 0 ? 'Vencido en Cierre' : 'Cumplido';
    } else {
      const createdDate = new Date(t.created_at).getTime();
      const now = new Date().getTime();
      const diffHours = (now - createdDate) / (1000 * 60 * 60);
      if (diffHours > slaHoras) {
        slaEstadoStr = 'SLA Vencido';
      } else if (diffHours > slaHoras * 0.75) {
        slaEstadoStr = 'En Riesgo';
      }
    }

    return {
      id: t.id,
      titulo: t.titulo || '',
      descripcion: t.descripcion || '',
      tipo_itil,
      nivel_soporte: t.nivel_soporte || 'N1',
      grupo_n2: t.grupo_n2 || null,
      empresa_nombre: t.empresa_nombre || 'N/A',
      sucursal_nombre: t.sucursal_nombre || 'Principal',
      solicitante: t.solicitante_nombre || 'N/A',
      prioridad: t.prioridad || 'Media',
      estado: t.estado || 'Nuevo',
      created_at: formatearFechaEcuador(t.created_at),
      updated_at: t.updated_at ? formatearFechaEcuador(t.updated_at) : '-',
      fecha_resolucion: (t.estado === 'Resuelto' || t.estado === 'Cerrado') && t.updated_at ? formatearFechaEcuador(t.updated_at) : null,
      sla_horas: slaHoras,
      sla_cumplido: t.sla_cumplido,
      sla_estado_str: slaEstadoStr,
      adjuntos_count: adjuntosCount,
      adjuntos_nombres: adjuntosNombres,
      bitacora_texto: bitacoraTexto,
      tecnico_asignado_nombre: t.tecnico_asignado_nombre || 'Sin Asignar',
      tecnico_n1_nombre: t.tecnico_n1_nombre || '-',
      tecnico_n2_nombre: t.tecnico_n2_nombre || '-'
    };
  });

  // 3. Organizar los tickets por Técnico
  const tecnicosResumenMap = new Map<number, ResumenTecnico>();

  for (const row of tecnicosRows) {
    tecnicosResumenMap.set(row.id, {
      tecnico_id: row.id,
      nombre_completo: row.nombre_completo,
      email: row.email,
      rol_nombre: row.rol_nombre,
      nivel_soporte: row.nivel_soporte || 'N1',
      grupo_n2: row.grupo_n2 || null,
      total_gestionados: 0,
      solicitudes_n1: 0,
      incidencias_n2_n3: 0,
      resueltos_hoy: 0,
      cerrados_hoy: 0,
      abiertos_pendientes: 0,
      sla_cumplidos: 0,
      sla_vencidos: 0,
      tickets: []
    });
  }

  // Asignar tickets a técnicos
  for (const rawTicket of ticketRows) {
    const formatted = allTickets.find(t => t.id === rawTicket.id)!;
    const tecId = rawTicket.tecnico_id || rawTicket.tecnico_n1_id || rawTicket.tecnico_n2_id;

    if (tecId && tecnicosResumenMap.has(tecId)) {
      const res = tecnicosResumenMap.get(tecId)!;
      res.tickets.push(formatted);
      res.total_gestionados++;
      if (formatted.tipo_itil === 'Solicitud') res.solicitudes_n1++;
      else res.incidencias_n2_n3++;

      const isToday = rawTicket.updated_at && new Date(rawTicket.updated_at).toISOString().split('T')[0] === fechaStr;
      if (rawTicket.estado === 'Resuelto' && isToday) res.resueltos_hoy++;
      if (rawTicket.estado === 'Cerrado' && isToday) res.cerrados_hoy++;
      if (['Nuevo', 'En Proceso', 'Elevado a Proveedor', 'Elevado a Administración'].includes(rawTicket.estado)) {
        res.abiertos_pendientes++;
      }

      if (formatted.sla_estado_str.includes('Vencido')) res.sla_vencidos++;
      else res.sla_cumplidos++;
    }
  }

  const tecnicosList = Array.from(tecnicosResumenMap.values())
    // Solo incluimos en el reporte aquellos que tengan tickets o sean técnicos de campo / mesa
    .filter(t => t.tickets.length > 0 || t.rol_nombre === 'TECNICO');

  // Totales globales
  const totalTicketsDia = allTickets.length;
  const totalSolicitudesN1 = allTickets.filter(t => t.tipo_itil === 'Solicitud').length;
  const totalIncidencias = allTickets.filter(t => t.tipo_itil === 'Incidencia').length;
  const totalResueltosHoy = allTickets.filter(t => t.estado === 'Resuelto' && t.updated_at.includes(fechaStr)).length;
  const totalCerradosHoy = allTickets.filter(t => t.estado === 'Cerrado' && t.updated_at.includes(fechaStr)).length;
  const totalAbiertos = allTickets.filter(t => ['Nuevo', 'En Proceso', 'Elevado a Proveedor', 'Elevado a Administración'].includes(t.estado)).length;
  
  const totalConSla = allTickets.length;
  const vencidos = allTickets.filter(t => t.sla_estado_str.includes('Vencido')).length;
  const cumplimientoSlaPorcentaje = totalConSla > 0 ? Math.round(((totalConSla - vencidos) / totalConSla) * 100) : 100;

  return {
    fecha: fechaStr,
    hora_generacion: horaStr,
    total_tickets_dia: totalTicketsDia,
    total_solicitudes_n1: totalSolicitudesN1,
    total_incidencias: totalIncidencias,
    total_resueltos_hoy: totalResueltosHoy,
    total_cerrados_hoy: totalCerradosHoy,
    total_abiertos: totalAbiertos,
    cumplimiento_sla_porcentaje: cumplimientoSlaPorcentaje,
    tecnicos: tecnicosList
  };
};

/**
 * Genera el archivo Excel (.xlsx) con hojas por especialista
 */
export const generarExcelReporteDiario = async (datos: ReporteDiarioData): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TISMO - IT CORE SYSTEM';
  workbook.created = new Date();

  // =========================================================================
  // HOJA 1: RESUMEN CONSOLIDADO (DASHBOARD GENERAL)
  // =========================================================================
  const wsConsolidado = workbook.addWorksheet('Resumen Consolidado', {
    views: [{ showGridLines: true }]
  });

  // Titulo Corporativo
  wsConsolidado.mergeCells('B2:I2');
  const titleCell = wsConsolidado.getCell('B2');
  titleCell.value = 'TISMO • RESUMEN FINAL DEL DÍA DE SOPORTE Y TICKETS';
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  wsConsolidado.getRow(2).height = 35;

  // Subtítulo con fecha
  wsConsolidado.mergeCells('B3:I3');
  const subtitleCell = wsConsolidado.getCell('B3');
  subtitleCell.value = `Reporte Diario | Fecha de Corte: ${datos.fecha} | Hora: ${datos.hora_generacion}`;
  subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  wsConsolidado.getRow(3).height = 22;

  // Bloque de KPIs
  const kpis = [
    { label: 'Total Tickets Hoy', val: datos.total_tickets_dia, color: 'FF2563EB' },
    { label: 'Solicitudes (N1)', val: datos.total_solicitudes_n1, color: 'FF0284C7' },
    { label: 'Incidencias (N2/N3)', val: datos.total_incidencias, color: 'FF7C3AED' },
    { label: 'Resueltos/Cerrados', val: datos.total_resueltos_hoy + datos.total_cerrados_hoy, color: 'FF059669' },
    { label: 'Abiertos / En Proceso', val: datos.total_abiertos, color: 'FFD97706' },
    { label: '% Cumplimiento SLA', val: `${datos.cumplimiento_sla_porcentaje}%`, color: 'FF0D9488' }
  ];

  wsConsolidado.getRow(5).height = 18;
  wsConsolidado.getRow(6).height = 28;

  const colStart = 2; // Col B
  kpis.forEach((kpi, idx) => {
    const colIndex = colStart + idx;
    const labelCell = wsConsolidado.getRow(5).getCell(colIndex);
    labelCell.value = kpi.label;
    labelCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    labelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    const valCell = wsConsolidado.getRow(6).getCell(colIndex);
    valCell.value = kpi.val;
    valCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: kpi.color } };
    valCell.alignment = { horizontal: 'center', vertical: 'middle' };
    valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    valCell.border = { bottom: { style: 'medium', color: { argb: kpi.color } }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Título de la tabla matriz
  wsConsolidado.mergeCells('B8:I8');
  const tableTitle = wsConsolidado.getCell('B8');
  tableTitle.value = 'DESGLOSE DE RENDIMIENTO POR ESPECIALISTA / TÉCNICO';
  tableTitle.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  tableTitle.alignment = { vertical: 'middle' };
  wsConsolidado.getRow(8).height = 25;

  // Cabecera de la tabla matriz
  const headersMatriz = [
    'Técnico / Especialista',
    'Nivel / Especialidad',
    'Total Casos',
    'Solicitudes (N1)',
    'Incidencias (N2/N3)',
    'Resueltos Hoy',
    'Abiertos Pendientes',
    '% Cumplimiento SLA'
  ];

  const headerRow = wsConsolidado.getRow(9);
  headerRow.height = 26;
  headersMatriz.forEach((h, idx) => {
    const c = headerRow.getCell(colStart + idx);
    c.value = h;
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    c.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Filas de técnicos
  let currentRowNum = 10;
  for (const tec of datos.tecnicos) {
    const row = wsConsolidado.getRow(currentRowNum);
    row.height = 22;
    const isZebra = currentRowNum % 2 === 0;
    const bgColor = isZebra ? 'FFFFFFFF' : 'FFF8FAFC';

    const nivelStr = tec.grupo_n2 ? `${tec.nivel_soporte} (${tec.grupo_n2})` : tec.nivel_soporte;
    const totalSla = tec.sla_cumplidos + tec.sla_vencidos;
    const slaPct = totalSla > 0 ? `${Math.round((tec.sla_cumplidos / totalSla) * 100)}%` : '100%';

    const values = [
      tec.nombre_completo,
      nivelStr,
      tec.total_gestionados,
      tec.solicitudes_n1,
      tec.incidencias_n2_n3,
      tec.resueltos_hoy + tec.cerrados_hoy,
      tec.abiertos_pendientes,
      slaPct
    ];

    values.forEach((v, idx) => {
      const cell = row.getCell(colStart + idx);
      cell.value = v;
      cell.font = { name: 'Arial', size: 9.5, bold: idx === 0 || idx === 2 };
      cell.alignment = { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });

    currentRowNum++;
  }

  // Auto-ajuste de anchos para Hoja 1
  wsConsolidado.getColumn(1).width = 4;
  wsConsolidado.getColumn(2).width = 30; // Nombre
  wsConsolidado.getColumn(3).width = 22; // Nivel
  wsConsolidado.getColumn(4).width = 16; // Total
  wsConsolidado.getColumn(5).width = 18; // Solicitudes
  wsConsolidado.getColumn(6).width = 20; // Incidencias
  wsConsolidado.getColumn(7).width = 16; // Resueltos
  wsConsolidado.getColumn(8).width = 20; // Abiertos
  wsConsolidado.getColumn(9).width = 20; // SLA

  // =========================================================================
  // HOJAS 2..N: PESTAÑA INDIVIDUAL POR CADA TÉCNICO CON TICKETS
  // =========================================================================
  for (const tec of datos.tecnicos) {
    // Nombre de la hoja limpio (máx 28 caracteres, sin caracteres no válidos de Excel)
    const sanitizedSheetName = tec.nombre_completo
      .replace(/[\\/?*:[\]]/g, '')
      .trim()
      .substring(0, 28) || `Tecnico_${tec.tecnico_id}`;

    const wsTec = workbook.addWorksheet(sanitizedSheetName, {
      views: [{ showGridLines: true }]
    });

    // Banner del especialista
    wsTec.mergeCells('A1:O1');
    const tecBanner = wsTec.getCell('A1');
    tecBanner.value = `REPORTE DIARIO DE TICKETS • ESPECIALISTA: ${tec.nombre_completo.toUpperCase()} (${tec.nivel_soporte}${tec.grupo_n2 ? ` - ${tec.grupo_n2}` : ''})`;
    tecBanner.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    tecBanner.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    tecBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    wsTec.getRow(1).height = 30;

    // Sub-banner con resumen rápido
    wsTec.mergeCells('A2:O2');
    const subBanner = wsTec.getCell('A2');
    subBanner.value = `Casos Asignados: ${tec.total_gestionados}  |  Solicitudes: ${tec.solicitudes_n1}  |  Incidencias: ${tec.incidencias_n2_n3}  |  Resueltos Hoy: ${tec.resueltos_hoy + tec.cerrados_hoy}  |  Abiertos: ${tec.abiertos_pendientes}  |  Correo: ${tec.email}`;
    subBanner.font = { name: 'Arial', size: 9.5, color: { argb: 'FFFFFFFF' } };
    subBanner.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    subBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    wsTec.getRow(2).height = 20;

    // Encabezados de columnas de la tabla del técnico
    const tecHeaders = [
      'ID Ticket',
      'Tipo',
      'Nivel',
      'Grupo N2',
      'Empresa',
      'Sucursal',
      'Requerimiento',
      'Solicitante',
      'Prioridad',
      'Estado Actual',
      'Fecha Creación',
      'Fecha Resolución / Cierre',
      'Estado SLA',
      'Adjuntos',
      'Bitácora y Trazabilidad Cronológica de Acciones'
    ];

    const hRow = wsTec.getRow(4);
    hRow.height = 26;
    tecHeaders.forEach((h, idx) => {
      const c = hRow.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      c.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Filas de tickets
    let tRowNum = 5;
    if (tec.tickets.length === 0) {
      wsTec.mergeCells(`A5:O5`);
      const emptyCell = wsTec.getCell('A5');
      emptyCell.value = 'No se registraron tickets activos o modificados para este especialista en la fecha de corte.';
      emptyCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      wsTec.getRow(5).height = 30;
    } else {
      for (const t of tec.tickets) {
        const row = wsTec.getRow(tRowNum);
        const isZebra = tRowNum % 2 === 0;
        const bgColor = isZebra ? 'FFFFFFFF' : 'FFF8FAFC';

        // Color condicional para el estado
        let estadoColor = 'FF334155';
        if (t.estado === 'Resuelto' || t.estado === 'Cerrado') estadoColor = 'FF059669';
        else if (t.estado === 'En Proceso') estadoColor = 'FF2563EB';
        else if (t.estado.includes('Elevado')) estadoColor = 'FF7C3AED';
        else if (t.estado === 'Nuevo') estadoColor = 'FFD97706';

        const rowValues = [
          `#${t.id}`,
          t.tipo_itil,
          t.nivel_soporte,
          t.grupo_n2 || '-',
          t.empresa_nombre,
          t.sucursal_nombre,
          t.titulo,
          t.solicitante,
          t.prioridad,
          t.estado,
          t.created_at,
          t.fecha_resolucion || '-',
          t.sla_estado_str,
          t.adjuntos_count > 0 ? `${t.adjuntos_count} (${t.adjuntos_nombres})` : '0',
          t.bitacora_texto
        ];

        rowValues.forEach((v, idx) => {
          const cell = row.getCell(idx + 1);
          cell.value = v;
          cell.font = { 
            name: 'Arial', 
            size: 9, 
            bold: idx === 0 || idx === 1 || idx === 9,
            color: idx === 9 ? { argb: estadoColor } : { argb: 'FF1E293B' }
          };
          cell.alignment = { 
            horizontal: (idx === 6 || idx === 14) ? 'left' : 'center', 
            vertical: 'top',
            wrapText: idx === 6 || idx === 14 // Wrap en Título y Bitácora
          };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        });

        // Estimar altura de fila según el tamaño de la bitácora
        const lineCount = (t.bitacora_texto.match(/\n/g) || []).length + 1;
        row.height = Math.max(26, lineCount * 14 + 10);

        tRowNum++;
      }
    }

    // Configuración de anchos de columna de la hoja del técnico
    wsTec.getColumn(1).width = 12;  // ID
    wsTec.getColumn(2).width = 14;  // Tipo ITIL
    wsTec.getColumn(3).width = 10;  // Nivel
    wsTec.getColumn(4).width = 16;  // Grupo N2
    wsTec.getColumn(5).width = 24;  // Empresa
    wsTec.getColumn(6).width = 18;  // Sucursal
    wsTec.getColumn(7).width = 36;  // Asunto (wrap)
    wsTec.getColumn(8).width = 22;  // Solicitante
    wsTec.getColumn(9).width = 12;  // Prioridad
    wsTec.getColumn(10).width = 20; // Estado
    wsTec.getColumn(11).width = 18; // Creación
    wsTec.getColumn(12).width = 20; // Cierre
    wsTec.getColumn(13).width = 16; // SLA
    wsTec.getColumn(14).width = 18; // Adjuntos
    wsTec.getColumn(15).width = 65; // Bitácora detallada
  }

  return workbook;
};

/**
 * Genera la plantilla HTML ejecutiva para el correo diario
 */
export const generarHtmlCorreoReporteDiario = (datos: ReporteDiarioData): string => {
  let filasTecnicosHtml = '';
  for (const tec of datos.tecnicos) {
    filasTecnicosHtml += `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
        <td style="padding: 10px 12px; font-weight: 600; color: #0f172a;">${tec.nombre_completo}</td>
        <td style="padding: 10px 12px; text-align: center;"><span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;">${tec.nivel_soporte}${tec.grupo_n2 ? ` (${tec.grupo_n2})` : ''}</span></td>
        <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #2563eb;">${tec.total_gestionados}</td>
        <td style="padding: 10px 12px; text-align: center; color: #0284c7;">${tec.solicitudes_n1}</td>
        <td style="padding: 10px 12px; text-align: center; color: #7c3aed;">${tec.incidencias_n2_n3}</td>
        <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #059669;">${tec.resueltos_hoy + tec.cerrados_hoy}</td>
        <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #d97706;">${tec.abiertos_pendientes}</td>
      </tr>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Resumen Final del Día • TISMO</title>
</head>
<body style="font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #334155;">
  <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15,23,42,0.06);">
    <!-- HEADER -->
    <div style="background-color: #0f172a; padding: 24px 30px; border-bottom: 4px solid #2563eb;">
      <div style="font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: 1.5px;">TISMO</div>
      <div style="font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; margin-top: 4px;">RESUMEN FINAL DEL DÍA • MESA DE AYUDA Y SOPORTE</div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Shopping Management Operadora • ${datos.fecha} (${datos.hora_generacion})</div>
    </div>

    <!-- CUERPO -->
    <div style="padding: 24px 28px;">
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
        Estimados Administradores y Supervisores,<br />
        Adjunto encontrarán el <strong>Resumen Diario de Casos por Especialista</strong> en formato Excel (.xlsx), conteniendo la hoja de resumen consolidado y una pestaña individual con el detalle de bitácora y nivel por cada técnico.
      </p>

      <!-- TARJETAS KPIS -->
      <div style="display: table; width: 100%; margin: 18px 0; border-spacing: 6px;">
        <div style="display: table-cell; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #1e40af;">TOTAL CASOS</div>
          <div style="font-size: 20px; font-weight: 800; color: #1d4ed8; margin-top: 4px;">${datos.total_tickets_dia}</div>
        </div>
        <div style="display: table-cell; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #166534;">RESUELTOS HOY</div>
          <div style="font-size: 20px; font-weight: 800; color: #15803d; margin-top: 4px;">${datos.total_resueltos_hoy + datos.total_cerrados_hoy}</div>
        </div>
        <div style="display: table-cell; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #92400e;">ABIERTOS</div>
          <div style="font-size: 20px; font-weight: 800; color: #b45309; margin-top: 4px;">${datos.total_abiertos}</div>
        </div>
        <div style="display: table-cell; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #5b21b6;">CUMPLIMIENTO SLA</div>
          <div style="font-size: 20px; font-weight: 800; color: #6d28d9; margin-top: 4px;">${datos.cumplimiento_sla_porcentaje}%</div>
        </div>
      </div>

      <!-- TABLA RESUMEN DE TÉCNICOS -->
      <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 20px 0 10px 0;">Resumen Consolidado por Especialista:</h3>
      <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #1e293b; color: #ffffff; font-size: 11px; text-transform: uppercase;">
            <th style="padding: 9px 12px; text-align: left;">Técnico</th>
            <th style="padding: 9px 12px; text-align: center;">Nivel</th>
            <th style="padding: 9px 12px; text-align: center;">Total</th>
            <th style="padding: 9px 12px; text-align: center;">Sol. N1</th>
            <th style="padding: 9px 12px; text-align: center;">Inc. N2/N3</th>
            <th style="padding: 9px 12px; text-align: center;">Resueltos</th>
            <th style="padding: 9px 12px; text-align: center;">Abiertos</th>
          </tr>
        </thead>
        <tbody>
          ${filasTecnicosHtml}
        </tbody>
      </table>

      <!-- DETALLE ADJUNTO -->
      <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-top: 20px; font-size: 12.5px; color: #475569;">
        📎 <strong>Archivo Adjunto:</strong> <code>Reporte_Diario_Soporte_${datos.fecha}.xlsx</code><br />
        El archivo Excel contiene pestañas dedicadas para cada técnico con la bitácora completa de intervenciones, fechas, empresas y tiempos de atención.
      </div>
    </div>

    <!-- FOOTER -->
    <div style="background-color: #f8fafc; padding: 16px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
      Shopping Managements Operadora (SMO) • Plataforma TISMO • Reporte Automático de Mesa de Ayuda
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * Genera el reporte y lo envía por correo a todos los Administradores y Supervisores
 */
export const enviarReporteDiarioTicketsPorCorreo = async (fechaParam?: string): Promise<{ enviados: number; destinatarios: string[] }> => {
  const datos = await getDatosReporteDiario(fechaParam);
  const workbook = await generarExcelReporteDiario(datos);
  const excelBuffer = await workbook.xlsx.writeBuffer();

  // Consultar todos los administradores y supervisores activos
  const [adminRows] = await pool.query<RowDataPacket[]>(`
    SELECT u.id, u.nombre_completo, u.email 
    FROM usuario u 
    JOIN rol r ON u.rol_id = r.id 
    WHERE u.is_active = 1 
      AND r.nombre IN ('ADMIN', 'SUPERVISOR')
      AND u.email IS NOT NULL AND u.email != ''
  `);

  const filename = `Reporte_Diario_Soporte_${datos.fecha}.xlsx`;
  const subject = `📊 Reporte Diario de Soporte y Tickets [${datos.fecha}] - Resumen por Técnico`;
  const htmlContent = generarHtmlCorreoReporteDiario(datos);
  const textSummary = `Resumen Diario de Soporte y Tickets para la fecha ${datos.fecha}. Total tickets: ${datos.total_tickets_dia}, Resueltos: ${datos.total_resueltos_hoy + datos.total_cerrados_hoy}, Abiertos: ${datos.total_abiertos}. Ver archivo adjunto ${filename}.`;

  const destinatarios: string[] = [];
  for (const admin of adminRows) {
    try {
      await enviarCorreo(
        admin.email,
        subject,
        textSummary,
        htmlContent,
        [
          {
            filename,
            content: Buffer.from(excelBuffer as ArrayBuffer),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }
        ],
        true // forzarEnvio: true (el reporte diario es obligatorio e institucional)
      );
      destinatarios.push(admin.email);
    } catch (e) {
      console.error(`Error enviando reporte diario a ${admin.email}:`, e);
    }
  }

  console.log(`[Cron Reporte Diario] Reporte de fecha ${datos.fecha} enviado exitosamente a ${destinatarios.length} administradores y supervisores.`);
  return { enviados: destinatarios.length, destinatarios };
};

// Variable para controlar que no se envíe múltiples veces el mismo día
let ultimaFechaEnvioReporteDiario: string | null = null;

/**
 * Inicia el cron / programador diario para despacho automático a las 18:30 horas
 */
export const startReporteDiarioTicketsCron = () => {
  console.log('Inicializando programador de Reporte Diario de Tickets...');

  // Chequeo cada 10 minutos
  const CHECK_INTERVAL = 10 * 60 * 1000;

  setInterval(async () => {
    try {
      const { hour, minute } = getNowEcuadorParts();
      const hoyStr = getFechaHoyEcuador();

      // Disparar entre 18:30 y 19:30 (Hora Ecuador) si no se ha enviado hoy
      if (hour === 18 && minute >= 30 && ultimaFechaEnvioReporteDiario !== hoyStr) {
        console.log(`[Cron Reporte Diario] Iniciando generación y envío automático del día ${hoyStr} (Hora Ecuador: ${hour}:${minute})...`);
        ultimaFechaEnvioReporteDiario = hoyStr;
        await enviarReporteDiarioTicketsPorCorreo(hoyStr);
      }
    } catch (err) {
      console.error('[Cron Reporte Diario] Error en ejecución del intervalo diario:', err);
    }
  }, CHECK_INTERVAL);
};
