import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { enviarCorreo } from './notificacion.service';
import ExcelJS from 'exceljs';

export const getTickets = async (currentUser: any, skip = 0, limit = 100) => {
  let query = `
    SELECT t.*,
           JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_dinamica
    FROM ticket t
  `;
  const params: any[] = [];

  if (currentUser.rol_nombre === 'TECNICO') {
    query += ` WHERE t.tecnico_id = ?`;
    params.push(currentUser.id);
  } else if (currentUser.rol_nombre === 'USUARIO') {
    query += ` WHERE t.creador_id = ?`;
    params.push(currentUser.id);
  }

  query += ` ORDER BY t.created_at DESC
             LIMIT ? OFFSET ?`;
  params.push(limit, skip);

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows.map(r => ({
    ...r,
    bitacora_dinamica: typeof r.bitacora_dinamica === 'string' 
      ? JSON.parse(r.bitacora_dinamica) 
      : r.bitacora_dinamica || []
  }));
};

export const createTicket = async (data: any, currentUser: any) => {
  let tecnicoAsignado: number | null = null;
  const ahora = new Date();
  const diaSemana = ahora.getDay(); // 0=Dom, 6=Sab

  if (currentUser.rol_nombre === 'TECNICO') {
    tecnicoAsignado = currentUser.id;
  } else if (currentUser.rol_nombre === 'ADMIN' && data.tecnico_id) {
    tecnicoAsignado = data.tecnico_id;
  } else {
    // Asignación automática
    const esDiaSemana = diaSemana >= 1 && diaSemana <= 5;
    if (esDiaSemana) {
      // 1. Intentar asignación dinámica por sede (pivot usuario_empresa)
      if (data.empresa_id) {
        const [techRows] = await pool.query<RowDataPacket[]>(
          `SELECT u.id 
           FROM usuario u
           JOIN usuario_empresa ue ON u.id = ue.usuario_id
           JOIN rol r ON u.rol_id = r.id
           WHERE ue.empresa_id = ? AND r.nombre = 'TECNICO' AND u.is_active = 1`,
          [data.empresa_id]
        );
        if (techRows.length > 0) {
          if (techRows.length === 1) {
            tecnicoAsignado = techRows[0].id;
          } else {
            // Balancear entre los técnicos de esa sede/empresa
            const techIds = techRows.map(t => t.id);
            const [balanceoSede] = await pool.query<RowDataPacket[]>(
              `SELECT u.id, COUNT(t.id) as total_tickets
               FROM usuario u
               LEFT JOIN ticket t ON u.id = t.tecnico_id AND t.estado IN ('Nuevo', 'Pendiente')
               WHERE u.id IN (?)
               GROUP BY u.id
               ORDER BY total_tickets ASC
               LIMIT 1`,
              [techIds]
            );
            if (balanceoSede.length > 0) tecnicoAsignado = balanceoSede[0].id;
          }
        }
      }
      
      // 2. Si no hay técnico para esa sede, balanceo global
      if (!tecnicoAsignado) {
        const [balanceo] = await pool.query<RowDataPacket[]>(
          `SELECT u.id, COUNT(t.id) as total_tickets
           FROM usuario u
           JOIN rol r ON u.rol_id = r.id
           LEFT JOIN ticket t ON u.id = t.tecnico_id AND t.estado IN ('Nuevo', 'Pendiente')
           WHERE r.nombre = 'TECNICO' AND u.is_active = 1
           GROUP BY u.id
           ORDER BY total_tickets ASC
           LIMIT 1`
        );
        if (balanceo.length > 0) tecnicoAsignado = balanceo[0].id;
      }
    } else {
      // Fines de semana y Feriados
      const fechaHoy = ahora.toISOString().split('T')[0];
      const [guardiaRows] = await pool.query<RowDataPacket[]>(
        `SELECT tecnico_id FROM guardia_feriado WHERE fecha = ?`,
        [fechaHoy]
      );
      if (guardiaRows.length > 0) {
        tecnicoAsignado = guardiaRows[0].tecnico_id;
      }
      
      // Fallback por si no hay guardia registrada en esa fecha
      if (!tecnicoAsignado) {
        const [balanceo] = await pool.query<RowDataPacket[]>(
          `SELECT u.id, COUNT(t.id) as total_tickets
           FROM usuario u
           JOIN rol r ON u.rol_id = r.id
           LEFT JOIN ticket t ON u.id = t.tecnico_id AND t.estado IN ('Nuevo', 'Pendiente')
           WHERE r.nombre = 'TECNICO' AND u.is_active = 1
           GROUP BY u.id
           ORDER BY total_tickets ASC
           LIMIT 1`
        );
        if (balanceo.length > 0) tecnicoAsignado = balanceo[0].id;
      }
    }
  }

  const bitacora = JSON.stringify([{ accion: `Ticket Creado por ${currentUser.nombre_completo}`, fecha: ahora.toISOString() }]);

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO ticket
      (titulo, descripcion, categoria, empresa_id, area_solicitante, persona_solicitante,
       medio_solicitud, fecha_final_tentativa, avance_proceso, observaciones, prioridad,
       estado, bitacora_dinamica, creador_id, tecnico_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.titulo, data.descripcion, data.categoria, data.empresa_id || null,
      data.area_solicitante || null, data.persona_solicitante || null,
      data.medio_solicitud || 'Plataforma', data.fecha_final_tentativa || null,
      data.avance_proceso ?? 0, data.observaciones || null,
      data.prioridad || 'Media', data.estado || 'Nuevo',
      bitacora, currentUser.id, tecnicoAsignado
    ]
  );
  
  // Background notifications
  if (tecnicoAsignado) {
    pool.query<RowDataPacket[]>(
      `SELECT email, nombre_completo FROM usuario WHERE id = ?`, [tecnicoAsignado]
    ).then(([techRows]) => {
      if (techRows.length > 0) {
        const techEmail = techRows[0].email;
        const techName = techRows[0].nombre_completo;
        enviarCorreo(
          techEmail, 
          `Nuevo Ticket Asignado: ${data.titulo}`,
          `Hola ${techName},\n\nSe te ha asignado un nuevo ticket de soporte:\n\nTítulo: ${data.titulo}\nDescripción: ${data.descripcion}\nCategoría: ${data.categoria}\nPrioridad: ${data.prioridad || 'Media'}\n\nPor favor, ingresa a la plataforma para gestionarlo.`
        ).catch(console.error);
      }
    }).catch(console.error);
  }

  if (currentUser.rol_nombre === 'USUARIO') {
    // Confirmación al usuario
    enviarCorreo(
      currentUser.email,
      `Recibimos tu solicitud de soporte: ${data.titulo}`,
      `Hola ${currentUser.nombre_completo},\n\nHemos registrado con éxito tu solicitud de soporte en el sistema:\n\nTítulo: ${data.titulo}\nDescripción: ${data.descripcion}\nCategoría: ${data.categoria}\nEstado: Nuevo\n\nUn técnico del equipo de IT revisará tu caso pronto.`
    ).catch(console.error);

    // Alerta a soporte central
    enviarCorreo(
      'soporte@smo.com',
      `[Alerta] Nuevo Ticket de Usuario: ${data.titulo}`,
      `El usuario ${currentUser.nombre_completo} (${currentUser.email}) ha reportado un nuevo ticket:\n\nTítulo: ${data.titulo}\nDescripción: ${data.descripcion}\nCategoría: ${data.categoria}\nAsignado automáticamente al Técnico ID: ${tecnicoAsignado || 'Sin asignar'}.`
    ).catch(console.error);
  } else {
    // Alerta estándar de soporte
    enviarCorreo(
      'soporte@smo.com',
      `Nuevo Ticket Registrado: ${data.titulo}`,
      `Se ha creado un nuevo ticket por ${currentUser.nombre_completo}.\nTítulo: ${data.titulo}\nAsignado al Técnico ID: ${tecnicoAsignado || 'Sin asignar'}.`
    ).catch(console.error);
  }

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [result.insertId]);
  const ticket = rows[0];
  return {
    ...ticket,
    bitacora_dinamica: typeof ticket.bitacora_dinamica === 'string'
      ? JSON.parse(ticket.bitacora_dinamica)
      : ticket.bitacora_dinamica || []
  };
};

export const updateTicket = async (ticketId: number, data: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [ticketId]);
  if (existing.length === 0) return null;

  const sets: string[] = [];
  const vals: any[] = [];
  const allowed = ['titulo','descripcion','categoria','empresa_id','area_solicitante','persona_solicitante',
                   'medio_solicitud','fecha_final_tentativa','avance_proceso','observaciones','prioridad',
                   'estado','tecnico_id'];
  for (const field of allowed) {
    if (data[field] !== undefined) { sets.push(`${field} = ?`); vals.push(data[field]); }
  }
  if (data.bitacora_dinamica !== undefined) {
    sets.push('bitacora_dinamica = ?');
    vals.push(JSON.stringify(data.bitacora_dinamica));
  }
  if (sets.length === 0) return existing[0];
  vals.push(ticketId);
  await pool.query(`UPDATE ticket SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, vals);

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [ticketId]);
  const t = rows[0];
  return {
    ...t,
    bitacora_dinamica: typeof t.bitacora_dinamica === 'string'
      ? JSON.parse(t.bitacora_dinamica)
      : t.bitacora_dinamica || []
  };
};

export const agregarBitacora = async (ticketId: number, currentUser: any, accion: string) => {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [ticketId]);
  if (rows.length === 0) return null;
  const ticket = rows[0];
  const bitacora = typeof ticket.bitacora_dinamica === 'string'
    ? JSON.parse(ticket.bitacora_dinamica)
    : ticket.bitacora_dinamica || [];
  bitacora.push({ accion, fecha: new Date().toISOString(), usuario: currentUser.nombre_completo });
  await pool.query(`UPDATE ticket SET bitacora_dinamica = ?, updated_at = NOW() WHERE id = ?`,
    [JSON.stringify(bitacora), ticketId]);
  return { ...ticket, bitacora_dinamica: bitacora };
};

export const crearDesdePlantilla = async (plantillaId: number, currentUser: any) => {
  const [plantillaRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM plantilla_recurrente WHERE id = ?`, [plantillaId]
  );
  if (plantillaRows.length === 0) return null;
  const plantilla = plantillaRows[0];

  // Try to match the template's enterprise (text string) to an actual enterprise ID
  let empresaId: number | null = null;
  if (plantilla.empresa) {
    const [empRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM empresa WHERE nombre LIKE ?`, [`%${plantilla.empresa}%`]
    );
    if (empRows.length > 0) {
      empresaId = empRows[0].id;
    }
  }

  // Build the ticket payload from the template
  const ticketData = {
    titulo: plantilla.titulo,
    descripcion: plantilla.descripcion,
    categoria: plantilla.categoria,
    empresa_id: empresaId,
    area_solicitante: plantilla.area_solicitante,
    persona_solicitante: 'Sistema Automático (Plantilla Recurrente)',
    medio_solicitud: 'Automático (Recurrente)',
    prioridad: 'Media',
    estado: 'Nuevo'
  };

  return await createTicket(ticketData, currentUser);
};

export const enviarRecordatoriosCierreDiario = async () => {
  const [tickets] = await pool.query<RowDataPacket[]>(
    `SELECT t.id, t.titulo, t.estado, u.email as tecnico_email, u.nombre_completo as tecnico_nombre
     FROM ticket t
     JOIN usuario u ON t.tecnico_id = u.id
     WHERE t.estado IN ('Nuevo', 'En Proceso', 'Pendiente', 'Pruebas') AND u.is_active = 1`
  );

  if (tickets.length === 0) {
    return { totalTecnicosAlertados: 0, totalTicketsRemitidos: 0 };
  }

  // Group tickets by technician email
  const techMap = new Map<string, { nombre: string; email: string; tickets: any[] }>();
  for (const t of tickets) {
    if (!techMap.has(t.tecnico_email)) {
      techMap.set(t.tecnico_email, { nombre: t.tecnico_nombre, email: t.tecnico_email, tickets: [] });
    }
    techMap.get(t.tecnico_email)!.tickets.push(t);
  }

  let totalTecnicosAlertados = 0;
  for (const tech of techMap.values()) {
    const listado = tech.tickets.map(t => `- [${t.estado}] Ticket #${t.id}: ${t.titulo}`).join('\n');
    const body = `Hola ${tech.nombre},\n\nEste es un recordatorio automático para el cierre diario de tus actividades.\n\nTienes los siguientes tickets pendientes que deben ser finalizados o actualizados antes de concluir el día:\n\n${listado}\n\nPor favor, ingresa a la plataforma y cambia el estado a 'Finalizada' si la novedad ya fue resuelta.`;
    
    await enviarCorreo(tech.email, `⚠️ Alerta de Cierre Diario: Tickets Pendientes`, body).catch(console.error);
    totalTecnicosAlertados++;
  }

  return { totalTecnicosAlertados, totalTicketsRemitidos: tickets.length };
};

export const generarReporteSemanalExcel = async (rolUsuario: string, usuarioId: number): Promise<Buffer> => {
  let query = `
    SELECT t.*, 
           u.nombre_completo as tecnico_nombre, 
           c.nombre_completo as creador_nombre,
           JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_parsed
    FROM ticket t 
    LEFT JOIN usuario u ON t.tecnico_id = u.id 
    LEFT JOIN usuario c ON t.creador_id = c.id
  `;
  const params: any[] = [];

  if (rolUsuario === 'TECNICO') {
    query += ` WHERE t.tecnico_id = ?`;
    params.push(usuarioId);
  }

  query += ` ORDER BY t.updated_at DESC`;

  const [tickets] = await pool.query<RowDataPacket[]>(query, params);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bitácora de Soportes');

  // Habilitar líneas de cuadrícula
  worksheet.views = [{ showGridLines: true }];

  // 1. Título Superior (Banner Premium)
  worksheet.mergeCells('A1:J1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'SMO IT CORE - REPORTE DE BITÁCORAS DE SOPORTES REALIZADOS';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F4E79' } // Azul Oscuro Corporativo
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 40;

  // Subtítulo de Información
  worksheet.mergeCells('A2:J2');
  const subtitleCell = worksheet.getCell('A2');
  subtitleCell.value = `Generado el: ${new Date().toLocaleString()} | Rol: ${rolUsuario} | Registros: ${tickets.length} tickets`;
  subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: '595959' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  // Celda en blanco de separación
  worksheet.getRow(3).height = 15;

  // Headers de la tabla
  const headers = [
    'ID Ticket', 'Título del Ticket', 'Categoría', 'Estado', 'Prioridad',
    'Técnico Asignado', 'Creador', 'Acción Realizada', 'Fecha Acción', 'Responsable Acción'
  ];
  worksheet.getRow(4).values = headers;
  worksheet.getRow(4).height = 28;

  // Estilo de la Fila de Headers
  const headerFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '2E75B6' } // Azul Medio Corporativo
  };
  const centerAlign: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const leftAlign: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'left', wrapText: true };

  for (let col = 1; col <= 10; col++) {
    const cell = worksheet.getCell(4, col);
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = centerAlign;
    cell.border = {
      top: { style: 'thin', color: { argb: 'BFBFBF' } },
      bottom: { style: 'medium', color: { argb: '000000' } },
      left: { style: 'thin', color: { argb: 'BFBFBF' } },
      right: { style: 'thin', color: { argb: 'BFBFBF' } }
    };
  }

  // Llenar datos y aplanar bitácora
  let rowIdx = 5;
  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'D9D9D9' } },
    bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
    left: { style: 'thin', color: { argb: 'D9D9D9' } },
    right: { style: 'thin', color: { argb: 'D9D9D9' } }
  };

  for (const t of tickets) {
    let bitacoraEntries: any[] = [];
    try {
      bitacoraEntries = typeof t.bitacora_parsed === 'string'
        ? JSON.parse(t.bitacora_parsed)
        : t.bitacora_parsed || [];
    } catch {
      bitacoraEntries = [];
    }

    if (bitacoraEntries.length === 0) {
      bitacoraEntries.push({
        accion: 'Sin bitácora registrada / Creado',
        fecha: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
        usuario: t.creador_nombre || 'Sistema'
      });
    }

    // Escribir fila para cada acción de bitácora
    for (const entry of bitacoraEntries) {
      const row = worksheet.getRow(rowIdx);
      row.height = 22;

      row.values = [
        t.id,
        t.titulo,
        t.categoria,
        t.estado,
        t.prioridad,
        t.tecnico_nombre || 'Sin asignar',
        t.creador_nombre || 'N/A',
        entry.accion || 'N/A',
        entry.fecha ? new Date(entry.fecha).toLocaleString() : 'N/A',
        entry.usuario || 'N/A'
      ];

      // Zebra striping y bordes
      const fillArgb = rowIdx % 2 === 0 ? 'F9FBFD' : 'FFFFFF'; // Alternar entre blanco y azul extremadamente claro
      const rowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };

      for (let col = 1; col <= 10; col++) {
        const cell = row.getCell(col);
        cell.fill = rowFill;
        cell.border = borderThin;
        cell.font = { name: 'Arial', size: 9 };
        
        // Alineaciones
        if ([1, 4, 5, 9].includes(col)) {
          cell.alignment = centerAlign;
        } else {
          cell.alignment = leftAlign;
        }
      }
      rowIdx++;
    }
  }

  // Ajuste automático de anchos de columna con padding
  worksheet.columns.forEach((column) => {
    let maxLen = 0;
    column.eachCell!({ includeEmpty: false }, (cell, rowNum) => {
      // Ignorar celdas del banner fusionado
      if (rowNum > 2 && cell.value) {
        const valueStr = cell.value.toString();
        if (valueStr.length > maxLen) {
          maxLen = valueStr.length;
        }
      }
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 45); // Límites razonables para evitar columnas infinitas
  });

  const buffer = await workbook.xlsx.writeBuffer() as unknown as Buffer;
  return buffer;
};
