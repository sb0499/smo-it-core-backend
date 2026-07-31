import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { enviarCorreo, crearNotificacion } from './notificacion.service';
import { config } from '../core/config';
import ExcelJS from 'exceljs';

export const getTickets = async (currentUser: any, skip = 0, limit = 100) => {
  let query = `
    SELECT t.*,
           u.nombre_completo as tecnico_nombre,
           e.nombre as empresa_nombre,
           JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_dinamica
    FROM ticket t
    LEFT JOIN usuario u ON t.tecnico_id = u.id
    LEFT JOIN empresa e ON t.empresa_id = e.id
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
    let isAssignedToCompany = true;
    if (data.empresa_id) {
      const [assignedRows] = await pool.query<RowDataPacket[]>(
        `SELECT 1 FROM usuario_empresa WHERE usuario_id = ? AND empresa_id = ?`,
        [currentUser.id, data.empresa_id]
      );
      isAssignedToCompany = assignedRows.length > 0;
    }

    if (isAssignedToCompany && !(currentUser.nivel_soporte === 'N2' && data.nivel_soporte !== 'N2')) {
      tecnicoAsignado = currentUser.id;
    }
  } else if ((currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR') && data.tecnico_id) {
    tecnicoAsignado = data.tecnico_id;
  } else {
    // Verificar si es una sede con calendario especial (Gametown, El Teatro, Apparca)
    let isSpecialCompany = false;
    let specialSedeName = '';
    if (data.empresa_id) {
      const [empRows] = await pool.query<RowDataPacket[]>('SELECT nombre FROM empresa WHERE id = ?', [data.empresa_id]);
      if (empRows.length > 0) {
        specialSedeName = empRows[0].nombre.toUpperCase();
        isSpecialCompany = ['GAMETOWN', 'EL TEATRO', 'APPARCA'].some(name => specialSedeName.includes(name));
      }
    }

    // Gametown, El Teatro, Apparca trabajan de Martes (2) a Sábado (6).
    // Las demás de Lunes (1) a Viernes (5).
    const esDiaTrabajo = isSpecialCompany 
      ? (diaSemana >= 2 && diaSemana <= 6)
      : (diaSemana >= 1 && diaSemana <= 5);

    if (esDiaTrabajo) {
      // 1. Intentar asignación dinámica por Centro Comercial - CC (pivot usuario_empresa)
      if (data.empresa_id) {
        // En empresas especiales no se toma en cuenta si son N1 o N2
        const techNivelFilter = isSpecialCompany ? '' : "AND u.nivel_soporte = 'N1'";
        const [techRows] = await pool.query<RowDataPacket[]>(
          `SELECT u.id 
           FROM usuario u
           JOIN usuario_empresa ue ON u.id = ue.usuario_id
           JOIN rol r ON u.rol_id = r.id
           WHERE ue.empresa_id = ? AND r.nombre IN ('TECNICO', 'SUPERVISOR') ${techNivelFilter} AND u.is_active = 1`,
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

      // 2. Si no hay técnico para esa sede, balanceo global de técnicos
      if (!tecnicoAsignado) {
        const fallbackNivelFilter = isSpecialCompany ? '' : "AND u.nivel_soporte = 'N1'";
        const [balanceo] = await pool.query<RowDataPacket[]>(
          `SELECT u.id, COUNT(t.id) as total_tickets
           FROM usuario u
           JOIN rol r ON u.rol_id = r.id
           LEFT JOIN ticket t ON u.id = t.tecnico_id AND t.estado IN ('Nuevo', 'Pendiente')
           WHERE r.nombre IN ('TECNICO', 'SUPERVISOR') ${fallbackNivelFilter} AND u.is_active = 1
           GROUP BY u.id
           ORDER BY total_tickets ASC
           LIMIT 1`
        );
        if (balanceo.length > 0) tecnicoAsignado = balanceo[0].id;
      }
    } else {
      // Fines de semana / días libres y Feriados
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
        const fallbackNivelFilter = isSpecialCompany ? '' : "AND u.nivel_soporte = 'N1'";
        const [balanceo] = await pool.query<RowDataPacket[]>(
          `SELECT u.id, COUNT(t.id) as total_tickets
           FROM usuario u
           JOIN rol r ON u.rol_id = r.id
           LEFT JOIN ticket t ON u.id = t.tecnico_id AND t.estado IN ('Nuevo', 'Pendiente')
           WHERE r.nombre IN ('TECNICO', 'SUPERVISOR') ${fallbackNivelFilter} AND u.is_active = 1
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
       estado, nivel_soporte, bitacora_dinamica, creador_id, tecnico_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.titulo, data.descripcion, data.categoria, data.empresa_id || null,
      data.area_solicitante || null, data.persona_solicitante || null,
      data.medio_solicitud || 'Plataforma', data.fecha_final_tentativa || null,
      data.avance_proceso ?? 0, data.observaciones || null,
      data.prioridad || 'Media', data.estado || 'Nuevo',
      data.nivel_soporte || 'N1', bitacora, currentUser.id, tecnicoAsignado
    ]
  );

  // Background notifications
  let labelAsignado = 'Sin asignar';
  let emailAsignado = '';

  if (tecnicoAsignado) {
    const [techResult] = await pool.query<RowDataPacket[]>(
      `SELECT email, nombre_completo FROM usuario WHERE id = ?`, [tecnicoAsignado]
    );
    if (techResult.length > 0) {
      emailAsignado = techResult[0].email;
      labelAsignado = (tecnicoAsignado === currentUser.id) 
        ? 'él mismo' 
        : techResult[0].nombre_completo;
    }
  }

  if (tecnicoAsignado && emailAsignado) {
    enviarCorreo(
      emailAsignado,
      `Nuevo Ticket Asignado: ${data.titulo}`,
      `Hola ${labelAsignado === 'él mismo' ? currentUser.nombre_completo : labelAsignado},\n\nSe te ha asignado un nuevo ticket de soporte:\n\nTítulo: ${data.titulo}\nDescripción: ${data.descripcion}\nCategoría: ${data.categoria}\nPrioridad: ${data.prioridad || 'Media'}\n\nPor favor, ingresa a la plataforma para gestionarlo.`
    ).catch(console.error);

    // Internal Notification
    crearNotificacion(
      tecnicoAsignado,
      `Nuevo Ticket Asignado`,
      `Se te ha asignado el ticket: "${data.titulo}" (Categoría: ${data.categoria}, Prioridad: ${data.prioridad || 'Media'}).`
    ).catch(console.error);
  }

  if (currentUser.rol_nombre === 'USUARIO') {
    // Confirmación al usuario
    enviarCorreo(
      currentUser.email,
      `Recibimos tu solicitud de soporte: ${data.titulo}`,
      `Hola ${currentUser.nombre_completo},\n\nHemos registrado con éxito tu solicitud de soporte en el sistema:\n\nTítulo: ${data.titulo}\nDescripción: ${data.descripcion}\nCategoría: ${data.categoria}\nEstado: Nuevo\n\nUn técnico del equipo de IT revisará tu caso pronto.`
    ).catch(console.error);

    crearNotificacion(
      currentUser.id,
      `Ticket registrado con éxito`,
      `Tu solicitud de soporte "${data.titulo}" fue registrada y está en cola.`
    ).catch(console.error);

    // Notify all admin/supervisor users internally
    pool.query<RowDataPacket[]>(
      `SELECT u.id FROM usuario u JOIN rol r ON u.rol_id = r.id WHERE r.nombre IN ('ADMIN', 'SUPERVISOR')`
    ).then(([adminRows]) => {
      adminRows.forEach(adm => {
        crearNotificacion(
          adm.id,
          `Nuevo ticket de usuario: ${data.titulo}`,
          `El usuario ${currentUser.nombre_completo} reportó un ticket. Asignado a: ${labelAsignado}.`
        ).catch(console.error);
      });
    }).catch(console.error);
  } else {
    // Notify all admin/supervisor users internally
    pool.query<RowDataPacket[]>(
      `SELECT u.id FROM usuario u JOIN rol r ON u.rol_id = r.id WHERE r.nombre IN ('ADMIN', 'SUPERVISOR')`
    ).then(([adminRows]) => {
      adminRows.forEach(adm => {
        if (adm.id !== currentUser.id) { // Avoid notifying self
          crearNotificacion(
            adm.id,
            `Nuevo Ticket: ${data.titulo}`,
            `Creado por ${currentUser.nombre_completo}. Asignado a: ${labelAsignado}.`
          ).catch(console.error);
        }
      });
    }).catch(console.error);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.*, 
            u.nombre_completo as tecnico_nombre, 
            e.nombre as empresa_nombre, 
            JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_dinamica
     FROM ticket t 
     LEFT JOIN usuario u ON t.tecnico_id = u.id 
     LEFT JOIN empresa e ON t.empresa_id = e.id
     WHERE t.id = ?`,
    [result.insertId]
  );
  const ticket = rows[0];
  return {
    ...ticket,
    bitacora_dinamica: typeof ticket.bitacora_dinamica === 'string'
      ? JSON.parse(ticket.bitacora_dinamica)
      : ticket.bitacora_dinamica || []
  };
};
export const updateTicket = async (ticketId: number, data: any, currentUser?: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [ticketId]);
  if (existing.length === 0) return null;
  const tOld = existing[0];

  let bitacora = [];
  try {
    bitacora = typeof tOld.bitacora_dinamica === 'string'
      ? JSON.parse(tOld.bitacora_dinamica)
      : tOld.bitacora_dinamica || [];
  } catch (e) {
    bitacora = [];
  }

  if (currentUser) {
    let logs: string[] = [];
    if (
      data.nivel_soporte === 'N3' || 
      data.estado === 'Escalado a Proyecto' || 
      data.estado === 'Escalado a Proveedor'
    ) {
      if (currentUser.rol_nombre !== 'ADMIN' && currentUser.rol_nombre !== 'SUPERVISOR' && currentUser.nivel_soporte !== 'N2') {
        throw new Error('Solo el personal de Nivel 2 o Administradores pueden elevar un soporte a Nivel 3 o a Proyecto.');
      }
    }
    if (data.estado !== undefined && data.estado !== tOld.estado) {
      logs.push(`Estado cambiado de "${tOld.estado}" a "${data.estado}"`);
      
      // SLA Pausing Logic (ITIL N3)
      if (data.estado === 'Escalado a Proveedor') {
        data.nivel_soporte = 'N3';
        data.sla_paused_at = new Date();
      } else if (tOld.estado === 'Escalado a Proveedor') {
        data.sla_paused_at = null;
        data.nivel_soporte = 'N2'; // Regresar a N2 por defecto para revisión
        if (tOld.sla_paused_at) {
          const pausedMs = Date.now() - new Date(tOld.sla_paused_at).getTime();
          const pausedSec = Math.floor(pausedMs / 1000);
          data.sla_acumulado_pausa_segundos = (tOld.sla_acumulado_pausa_segundos || 0) + pausedSec;
          
          if (tOld.fecha_final_tentativa) {
            const currentTentative = new Date(tOld.fecha_final_tentativa);
            const newTentative = new Date(currentTentative.getTime() + pausedMs);
            data.fecha_final_tentativa = newTentative;
          }
        }
      }
    }
    if (data.tecnico_id !== undefined && data.tecnico_id !== tOld.tecnico_id) {
      if (data.tecnico_id) {
        const [techRow] = await pool.query<RowDataPacket[]>(`SELECT nombre_completo FROM usuario WHERE id = ?`, [data.tecnico_id]);
        const techName = techRow[0]?.nombre_completo || 'Desconocido';
        logs.push(`Técnico asignado cambiado a: ${techName}`);
      } else {
        logs.push(`Se removió el técnico asignado`);
      }
    }

    if (logs.length > 0) {
      const actionStr = logs.join(', ');
      bitacora.push({
        accion: actionStr,
        fecha: new Date().toISOString(),
        usuario: currentUser.nombre_completo
      });
      data.bitacora_dinamica = bitacora;
    }
  }

  const sets: string[] = [];
  const vals: any[] = [];
  const allowed = ['titulo', 'descripcion', 'categoria', 'empresa_id', 'area_solicitante', 'persona_solicitante',
    'medio_solicitud', 'fecha_final_tentativa', 'avance_proceso', 'observaciones', 'prioridad',
    'estado', 'tecnico_id', 'nivel_soporte', 'grupo_n2', 'sla_paused_at', 'sla_acumulado_pausa_segundos'];
  for (const field of allowed) {
    if (data[field] !== undefined) { sets.push(`${field} = ?`); vals.push(data[field]); }
  }
  if (data.bitacora_dinamica !== undefined) {
    sets.push('bitacora_dinamica = ?');
    vals.push(JSON.stringify(data.bitacora_dinamica));
  }
  if (sets.length === 0) return {
    ...tOld,
    bitacora_dinamica: typeof tOld.bitacora_dinamica === 'string'
      ? JSON.parse(tOld.bitacora_dinamica)
      : tOld.bitacora_dinamica || []
  };

  vals.push(ticketId);
  await pool.query(`UPDATE ticket SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, vals);

  // Si el ticket se finaliza, enviar notificación al creador del ticket (solicitante)
  if (data.estado === 'Finalizada' && tOld.estado !== 'Finalizada') {
    const [creatorRows] = await pool.query<RowDataPacket[]>(
      `SELECT email, nombre_completo FROM usuario WHERE id = ?`, [tOld.creador_id]
    );
    if (creatorRows.length > 0) {
      const creatorUser = creatorRows[0];
      // Notificación en la campana
      crearNotificacion(
        tOld.creador_id,
        `Ticket Finalizado: ${tOld.titulo}`,
        `Tu solicitud de soporte "${tOld.titulo}" ha sido resuelta. Observaciones: ${data.observaciones || 'Sin observaciones de cierre.'}`
      ).catch(console.error);

      // Notificación por correo
      enviarCorreo(
        creatorUser.email,
        `Solucionado: ${tOld.titulo}`,
        `Hola ${creatorUser.nombre_completo},\n\nTu solicitud de soporte "${tOld.titulo}" ha sido resuelta por nuestro equipo.\n\nDetalle/Observaciones:\n${data.observaciones || 'Sin observaciones de cierre.'}\n\nGracias por usar el sistema.`
      ).catch(console.error);
    }
  }

  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT t.*, u.nombre_completo as tecnico_nombre, e.nombre as empresa_nombre 
    FROM ticket t 
    LEFT JOIN usuario u ON t.tecnico_id = u.id 
    LEFT JOIN empresa e ON t.empresa_id = e.id 
    WHERE t.id = ?`, [ticketId]);
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

export const escalarTicketAN2 = async (
  ticketId: number,
  data: { grupo_n2: 'Infraestructura' | 'Desarrollo'; tecnico_id?: number | null },
  currentUser: any
) => {
  const { grupo_n2, tecnico_id } = data;

  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM ticket WHERE id = ?`, [ticketId]
  );
  if (existing.length === 0) return null;
  const ticket = existing[0];

  // Cargar técnicos activos N2 de ese grupo específico y asignados a la empresa del ticket
  let techRows: RowDataPacket[] = [];
  if (ticket.empresa_id) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.nombre_completo, u.email 
       FROM usuario u
       JOIN rol r ON u.rol_id = r.id
       JOIN usuario_empresa ue ON u.id = ue.usuario_id
       WHERE r.nombre = 'TECNICO' AND u.nivel_soporte = 'N2' AND u.grupo_n2 = ? AND u.is_active = 1 AND ue.empresa_id = ?`,
      [grupo_n2, ticket.empresa_id]
    );
    techRows = rows;
  }

  // Fallback: cargar todos los técnicos activos N2 de ese grupo
  if (techRows.length === 0) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.nombre_completo, u.email 
       FROM usuario u
       JOIN rol r ON u.rol_id = r.id
       WHERE r.nombre = 'TECNICO' AND u.nivel_soporte = 'N2' AND u.grupo_n2 = ? AND u.is_active = 1`,
      [grupo_n2]
    );
    techRows = rows;
  }

  let finalTecnicoId: number | null = null;
  let finalTecnicoNombre = 'Sin asignar';
  let finalTecnicoEmail = '';

  if (tecnico_id && Number(tecnico_id) > 0) {
    const matched = techRows.find(t => t.id === Number(tecnico_id));
    if (!matched) {
      throw new Error(`El técnico seleccionado no pertenece al grupo N2 ${grupo_n2} o no está activo.`);
    }
    finalTecnicoId = matched.id;
    finalTecnicoNombre = matched.nombre_completo;
    finalTecnicoEmail = matched.email;
  } else {
    // Balancear carga dentro de este grupo
    if (techRows.length > 0) {
      if (techRows.length === 1) {
        finalTecnicoId = techRows[0].id;
        finalTecnicoNombre = techRows[0].nombre_completo;
        finalTecnicoEmail = techRows[0].email;
      } else {
        const techIds = techRows.map(t => t.id);
        const [balanceo] = await pool.query<RowDataPacket[]>(
          `SELECT u.id, COUNT(t.id) as total_tickets
           FROM usuario u
           LEFT JOIN ticket t ON u.id = t.tecnico_id AND t.estado IN ('Nuevo', 'Pendiente', 'En Proceso')
           WHERE u.id IN (?)
           GROUP BY u.id
           ORDER BY total_tickets ASC
           LIMIT 1`,
          [techIds]
        );
        if (balanceo.length > 0) {
          finalTecnicoId = balanceo[0].id;
          const matched = techRows.find(t => t.id === finalTecnicoId);
          if (matched) {
            finalTecnicoNombre = matched.nombre_completo;
            finalTecnicoEmail = matched.email;
          }
        }
      }
    }
  }

  // Cargar bitácora
  let bitacora = [];
  try {
    bitacora = typeof ticket.bitacora_dinamica === 'string'
      ? JSON.parse(ticket.bitacora_dinamica)
      : ticket.bitacora_dinamica || [];
  } catch (e) {
    bitacora = [];
  }

  bitacora.push({
    accion: `Ticket escalado a Nivel 2 (${grupo_n2}). Asignado a: ${finalTecnicoNombre}`,
    fecha: new Date().toISOString(),
    usuario: currentUser.nombre_completo
  });

  await pool.query(
    `UPDATE ticket 
     SET nivel_soporte = 'N2', 
         grupo_n2 = ?,
         tecnico_id = ?, 
         bitacora_dinamica = ?, 
         updated_at = NOW() 
     WHERE id = ?`,
    [grupo_n2, finalTecnicoId, JSON.stringify(bitacora), ticketId]
  );

  // Enviar correos y notificaciones internas si hay técnico asignado
  if (finalTecnicoId && finalTecnicoEmail) {
    enviarCorreo(
      finalTecnicoEmail,
      `Ticket Escalado a N2 (${grupo_n2}): ${ticket.titulo}`,
      `Hola ${finalTecnicoNombre},\n\nSe te ha asignado por escalación a Nivel 2 (${grupo_n2}) el siguiente ticket:\n\nTítulo: ${ticket.titulo}\nDescripción: ${ticket.descripcion}\nPrioridad: ${ticket.prioridad}\n\nIngresa a la plataforma para gestionarlo.`
    ).catch(console.error);

    crearNotificacion(
      finalTecnicoId,
      `Ticket Escalado a N2 (${grupo_n2})`,
      `Se te ha asignado el ticket: "${ticket.titulo}" por escalación a Nivel 2 (${grupo_n2}).`
    ).catch(console.error);
  } else {
    // Si no hay técnico asignado, notificar a todos los N2 del grupo
    for (const tech of techRows) {
      crearNotificacion(
        tech.id,
        `Nuevo Ticket N2 (${grupo_n2}) en Cola`,
        `Se ha escalado el ticket: "${ticket.titulo}" a Nivel 2 (${grupo_n2}) sin técnico asignado.`
      ).catch(console.error);
    }
  }

  const [updatedRows] = await pool.query<RowDataPacket[]>(
    `SELECT t.*, u.nombre_completo as tecnico_nombre, e.nombre as empresa_nombre 
     FROM ticket t 
     LEFT JOIN usuario u ON t.tecnico_id = u.id 
     LEFT JOIN empresa e ON t.empresa_id = e.id 
     WHERE t.id = ?`,
    [ticketId]
  );
  return {
    ...updatedRows[0],
    bitacora_dinamica: bitacora
  };
};

export const enviarRecordatoriosCierreDiario = async () => {
  const [tickets] = await pool.query<RowDataPacket[]>(
    `SELECT t.id, t.titulo, t.estado, t.tecnico_id, u.email as tecnico_email, u.nombre_completo as tecnico_nombre
     FROM ticket t
     JOIN usuario u ON t.tecnico_id = u.id
     WHERE t.estado IN ('Nuevo', 'En Proceso', 'Pendiente', 'Pruebas') AND u.is_active = 1`
  );

  if (tickets.length === 0) {
    return { totalTecnicosAlertados: 0, totalTicketsRemitidos: 0 };
  }

  // Group tickets by technician email
  const techMap = new Map<string, { id: number; nombre: string; email: string; tickets: any[] }>();
  for (const t of tickets) {
    if (!techMap.has(t.tecnico_email)) {
      techMap.set(t.tecnico_email, { id: t.tecnico_id, nombre: t.tecnico_nombre, email: t.tecnico_email, tickets: [] });
    }
    techMap.get(t.tecnico_email)!.tickets.push(t);
  }

  let totalTecnicosAlertados = 0;
  for (const tech of techMap.values()) {
    const listado = tech.tickets.map(t => `- [${t.estado}] Ticket #${t.id}: ${t.titulo}`).join('\n');
    const body = `Hola ${tech.nombre},\n\nEste es un recordatorio automático para el cierre diario de tus actividades.\n\nTienes los siguientes tickets pendientes que deben ser finalizados o actualizados antes de concluir el día:\n\n${listado}\n\nPor favor, ingresa a la plataforma y cambia el estado a 'Finalizada' si la novedad ya fue resuelta.`;

    await enviarCorreo(tech.email, `Alerta de Cierre Diario: Tickets Pendientes`, body).catch(console.error);

    // Internal notification
    await crearNotificacion(
      tech.id,
      `Cierre Diario: Tickets Pendientes`,
      `Tienes ${tech.tickets.length} tickets de soporte asignados aún pendientes de resolver hoy.`
    ).catch(console.error);

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
  titleCell.value = 'REPORTE DE BITÁCORAS DE SOPORTES REALIZADOS';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F4E79' }
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

export interface CategoriaTicket {
  id: number;
  nombre: string;
  is_active: boolean;
  created_at: string;
}

export const getCategorias = async (): Promise<CategoriaTicket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM categoria_ticket WHERE is_active = 1 ORDER BY nombre ASC'
  );
  return rows as CategoriaTicket[];
};

export const getTicketsPaginated = async (
  currentUser: any, 
  page = 1, 
  limit = 10, 
  excludeStatus?: string, 
  estado?: string, 
  search?: string
) => {
  const skip = (page - 1) * limit;
  let whereClauses: string[] = [];
  const params: any[] = [];

  if (currentUser.rol_nombre === 'TECNICO') {
    whereClauses.push(`t.tecnico_id = ?`);
    params.push(currentUser.id);
  } else if (currentUser.rol_nombre === 'USUARIO') {
    whereClauses.push(`t.creador_id = ?`);
    params.push(currentUser.id);
  }

  if (excludeStatus) {
    whereClauses.push(`t.estado != ?`);
    params.push(excludeStatus);
  }

  if (estado && estado !== 'todos') {
    whereClauses.push(`t.estado = ?`);
    params.push(estado);
  }

  if (search) {
    whereClauses.push(`(t.titulo LIKE ? OR t.descripcion LIKE ? OR t.categoria LIKE ?)`);
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as count 
    FROM ticket t
    ${whereStr}
  `;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0]?.count || 0;

  // Get paginated data
  const selectQuery = `
    SELECT t.*,
           u.nombre_completo as tecnico_nombre,
           e.nombre as empresa_nombre,
           JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_dinamica
    FROM ticket t
    LEFT JOIN usuario u ON t.tecnico_id = u.id
    LEFT JOIN empresa e ON t.empresa_id = e.id
    ${whereStr}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const selectParams = [...params, limit, skip];
  const [dataRows] = await pool.query<RowDataPacket[]>(selectQuery, selectParams);

  const data = dataRows.map(r => ({
    ...r,
    bitacora_dinamica: typeof r.bitacora_dinamica === 'string'
      ? JSON.parse(r.bitacora_dinamica)
      : r.bitacora_dinamica || []
  }));

  return {
    total,
    page,
    limit,
    data
  };
};

