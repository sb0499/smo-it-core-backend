import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { enviarCorreo, crearNotificacion } from './notificacion.service';
import { config } from '../core/config';
import { getSlaHoras } from './sla.service';
import ExcelJS from 'exceljs';

export const formatTicketResponse = (r: any) => {
  if (!r) return null;
  let parsedBitacora = [];
  if (r.bitacora_dinamica || r.bitacora_raw) {
    const rawBit = r.bitacora_dinamica || r.bitacora_raw;
    if (typeof rawBit === 'string') {
      try {
        parsedBitacora = JSON.parse(rawBit);
      } catch {
        parsedBitacora = [];
      }
    } else if (Array.isArray(rawBit) || typeof rawBit === 'object') {
      parsedBitacora = rawBit;
    }
  }

  let parsedAdjuntos = [];
  if (r.adjuntos) {
    if (typeof r.adjuntos === 'string') {
      try {
        parsedAdjuntos = JSON.parse(r.adjuntos);
      } catch {
        parsedAdjuntos = [];
      }
    } else if (Array.isArray(r.adjuntos)) {
      parsedAdjuntos = r.adjuntos;
    }
  }

  const { bitacora_raw, ...rest } = r;
  return {
    ...rest,
    bitacora_dinamica: parsedBitacora,
    adjuntos: parsedAdjuntos
  };
};

export const getTickets = async (currentUser: any, skip = 0, limit = 100) => {
  let query = `
    SELECT t.*,
           u.nombre_completo as tecnico_nombre,
           u_n1.nombre_completo as tecnico_n1_nombre,
           u_n2.nombre_completo as tecnico_n2_nombre,
           e.nombre as empresa_nombre,
           s.nombre as sucursal_nombre,
           JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_dinamica
    FROM ticket t
    LEFT JOIN usuario u ON t.tecnico_id = u.id
    LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
    LEFT JOIN usuario u_n2 ON t.tecnico_n2_id = u_n2.id
    LEFT JOIN empresa e ON t.empresa_id = e.id
    LEFT JOIN sucursal s ON t.sucursal_id = s.id
  `;
  const params: any[] = [];

  if (currentUser.rol_nombre === 'TECNICO') {
    query += ` WHERE (t.tecnico_id = ? OR t.tecnico_n1_id = ? OR t.tecnico_n2_id = ?)`;
    params.push(currentUser.id, currentUser.id, currentUser.id);
  } else if (currentUser.rol_nombre === 'USUARIO') {
    query += ` WHERE t.creador_id = ?`;
    params.push(currentUser.id);
  }

  query += ` ORDER BY t.created_at DESC
             LIMIT ? OFFSET ?`;
  params.push(limit, skip);

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows.map(r => formatTicketResponse(r));
};
export const createTicket = async (data: any, currentUser: any) => {
  if (currentUser.rol_nombre === 'TECNICO' && currentUser.nivel_soporte === 'N2') {
    throw new Error('Los técnicos con Nivel de Soporte N2 no tienen permitido crear nuevos tickets.');
  }

  let tecnicoAsignado: number | null = null;
  const ahora = new Date();
  const diaSemana = ahora.getDay(); // 0=Dom, 6=Sab

  if (data.tecnico_id) {
    tecnicoAsignado = Number(data.tecnico_id);
  } else if (currentUser.rol_nombre === 'TECNICO' && currentUser.nivel_soporte !== 'N2') {
    let isAssignedToCompany = true;
    if (data.empresa_id) {
      const [assignedRows] = await pool.query<RowDataPacket[]>(
        `SELECT 1 FROM usuario_empresa WHERE usuario_id = ? AND empresa_id = ?`,
        [currentUser.id, data.empresa_id]
      );
      isAssignedToCompany = assignedRows.length > 0;
    }

    if (isAssignedToCompany) {
      tecnicoAsignado = currentUser.id;
    }
  }

  if (!tecnicoAsignado) {
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
      // 1. Prioridad: Técnico N1 de Sucursal específica si existe y está activo (buscando en sucursal.usuario_id y usuario_sucursal)
      if (data.sucursal_id) {
        const techNivelFilter = isSpecialCompany ? '' : "AND u.nivel_soporte = 'N1'";
        const [sucTechRows] = await pool.query<RowDataPacket[]>(
          `SELECT DISTINCT u.id 
           FROM usuario u
           JOIN rol r ON u.rol_id = r.id
           LEFT JOIN sucursal s ON s.usuario_id = u.id AND s.id = ?
           LEFT JOIN usuario_sucursal us ON us.usuario_id = u.id AND us.sucursal_id = ?
           WHERE (s.id IS NOT NULL OR us.sucursal_id IS NOT NULL)
             AND u.is_active = 1
             AND r.nombre IN ('TECNICO', 'SUPERVISOR') ${techNivelFilter}`,
          [data.sucursal_id, data.sucursal_id]
        );

        if (sucTechRows.length === 1) {
          tecnicoAsignado = sucTechRows[0].id;
        } else if (sucTechRows.length > 1) {
          // Si hay más de un técnico asignado a esa sucursal, balancear entre ellos
          const techIds = sucTechRows.map(t => t.id);
          const [balanceoSucursal] = await pool.query<RowDataPacket[]>(
            `SELECT u.id, COUNT(t.id) as total_tickets
             FROM usuario u
             LEFT JOIN ticket t ON u.id = t.tecnico_id AND t.estado IN ('Nuevo', 'Pendiente')
             WHERE u.id IN (?)
             GROUP BY u.id
             ORDER BY total_tickets ASC
             LIMIT 1`,
            [techIds]
          );
          if (balanceoSucursal.length > 0) tecnicoAsignado = balanceoSucursal[0].id;
        }
      }

      // 2. Prioridad: Técnico N1 Principal de la Empresa/Sede si existe y está activo
      if (!tecnicoAsignado && data.empresa_id) {
        const [empRows] = await pool.query<RowDataPacket[]>(
          `SELECT e.tecnico_principal_id 
           FROM empresa e
           JOIN usuario u ON e.tecnico_principal_id = u.id
           WHERE e.id = ? AND u.is_active = 1`,
          [data.empresa_id]
        );
        if (empRows.length > 0 && empRows[0].tecnico_principal_id) {
          tecnicoAsignado = empRows[0].tecnico_principal_id;
        }
      }

      // 3. Si no hay técnico principal asignado, balancear entre los técnicos N1 de esa sede/empresa (empresa o sus sucursales)
      if (!tecnicoAsignado && data.empresa_id) {
        // En empresas especiales no se toma en cuenta si son N1 o N2
        const techNivelFilter = isSpecialCompany ? '' : "AND u.nivel_soporte = 'N1'";
        const [techRows] = await pool.query<RowDataPacket[]>(
          `SELECT DISTINCT u.id 
           FROM usuario u
           JOIN rol r ON u.rol_id = r.id
           LEFT JOIN usuario_empresa ue ON u.id = ue.usuario_id AND ue.empresa_id = ?
           LEFT JOIN usuario_sucursal us ON u.id = us.usuario_id
           LEFT JOIN sucursal s ON (us.sucursal_id = s.id OR s.usuario_id = u.id) AND s.empresa_id = ?
           WHERE (ue.empresa_id IS NOT NULL OR s.empresa_id IS NOT NULL)
             AND r.nombre IN ('TECNICO', 'SUPERVISOR') ${techNivelFilter} 
             AND u.is_active = 1`,
          [data.empresa_id, data.empresa_id]
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
      const paramsGuardia: any[] = [fechaHoy];
      let sqlGuardia = `SELECT tecnico_id FROM guardia_feriado WHERE fecha = ? AND tecnico_id IS NOT NULL`;
      
      if (data.empresa_id) {
        sqlGuardia += ` AND (empresa_id = ? OR empresa_id IS NULL) ORDER BY empresa_id DESC LIMIT 1`;
        paramsGuardia.push(data.empresa_id);
      } else {
        sqlGuardia += ` LIMIT 1`;
      }

      const [guardiaRows] = await pool.query<RowDataPacket[]>(sqlGuardia, paramsGuardia);
      if (guardiaRows.length > 0 && guardiaRows[0].tecnico_id) {
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
  const adjuntosJson = data.adjuntos 
    ? (typeof data.adjuntos === 'string' ? data.adjuntos : JSON.stringify(data.adjuntos)) 
    : null;

  const tipoItil = (data.nivel_soporte && data.nivel_soporte !== 'N1') ? 'INCIDENCIA' : 'SOLICITUD';
  const slaHorasCalculado = await getSlaHoras(tipoItil, data.prioridad || 'Media');

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO ticket
      (titulo, descripcion, categoria, empresa_id, sucursal_id, area_solicitante, persona_solicitante,
       medio_solicitud, fecha_final_tentativa, avance_proceso, observaciones, prioridad,
       estado, nivel_soporte, bitacora_dinamica, creador_id, tecnico_id, tecnico_n1_id, adjuntos, sla_horas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.titulo, data.descripcion, data.categoria, data.empresa_id || null, data.sucursal_id || null,
      data.area_solicitante || null, data.persona_solicitante || null,
      data.medio_solicitud || 'Plataforma', data.fecha_final_tentativa || null,
      data.avance_proceso ?? 0, data.observaciones || null,
      data.prioridad || 'Media', data.estado || 'Nuevo',
      data.nivel_soporte || 'N1', bitacora, currentUser.id, tecnicoAsignado,
      (data.nivel_soporte === 'N2') ? null : tecnicoAsignado,
      adjuntosJson,
      slaHorasCalculado
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
            u_n1.nombre_completo as tecnico_n1_nombre,
            e.nombre as empresa_nombre, 
            s.nombre as sucursal_nombre,
            JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_dinamica
     FROM ticket t 
     LEFT JOIN usuario u ON t.tecnico_id = u.id 
     LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
     LEFT JOIN empresa e ON t.empresa_id = e.id
     LEFT JOIN sucursal s ON t.sucursal_id = s.id
     WHERE t.id = ?`,
    [result.insertId]
  );
  return formatTicketResponse(rows[0]);
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

  let logs: string[] = [];
  if (currentUser) {
    // Restricción Solo Lectura para técnico N1 en tickets asignados a N2/N3 (a menos que esté en estado Resuelto)
    if (currentUser.rol_nombre === 'TECNICO' && currentUser.nivel_soporte === 'N1') {
      if (tOld.tecnico_id !== currentUser.id && (tOld.tecnico_n1_id === currentUser.id || tOld.nivel_soporte !== 'N1')) {
        if (tOld.estado !== 'Resuelto') {
          throw new Error('El ticket se encuentra asignado a N2/N3. Lo tienes en modo solo lectura para ver sus avances.');
        }
      }
    }

    // Restricción Solo Lectura para técnico N2 en tickets devueltos a N1 o en estado Resuelto / Cerrado
    if (currentUser.rol_nombre === 'TECNICO' && currentUser.nivel_soporte === 'N2') {
      if (tOld.nivel_soporte === 'N1' || tOld.estado === 'Resuelto' || tOld.estado === 'Cerrado' || tOld.estado === 'Finalizada') {
        throw new Error('El ticket fue devuelto a N1 o se encuentra en estado Resuelto/Cerrado. Lo tienes en modo solo lectura.');
      }
    }

    if (
      data.nivel_soporte === 'N3' || 
      data.estado === 'Elevado a Proveedor' ||
      data.estado === 'Escalado a Proveedor'
    ) {
      if (currentUser.rol_nombre !== 'ADMIN' && currentUser.rol_nombre !== 'SUPERVISOR' && currentUser.rol_nombre !== 'TECNICO') {
        throw new Error('Solo el personal técnico, supervisores o administradores pueden elevar un soporte a Proveedor (N3).');
      }
    }

    if (data.estado !== undefined && data.estado !== tOld.estado) {
      // 1) Si N2 marca el ticket como Cerrado o Resuelto
      if ((data.estado === 'Cerrado' || data.estado === 'Finalizada' || data.estado === 'Resuelto') && tOld.nivel_soporte === 'N2') {
        data.estado = 'Resuelto';
        data.nivel_soporte = 'N1';
        data.tecnico_n2_id = tOld.tecnico_id || currentUser.id;
        if (tOld.tecnico_n1_id) {
          data.tecnico_id = tOld.tecnico_n1_id;
        }

        const obsText = data.observaciones ? ` - Solución/Observación N2: "${data.observaciones}"` : '';
        logs.push(`Ticket marcado como RESUELTO por N2 (${currentUser.nombre_completo}) y devuelto a N1 para confirmación con el usuario.${obsText}`);

        const targetN1Id = tOld.tecnico_n1_id || tOld.creador_id;
        if (targetN1Id && targetN1Id !== currentUser.id) {
          const [n1UserRows] = await pool.query<RowDataPacket[]>(`SELECT email, nombre_completo FROM usuario WHERE id = ?`, [targetN1Id]);
          if (n1UserRows.length > 0) {
            crearNotificacion(
              targetN1Id,
              `Ticket Resuelto por N2 (Pendiente tu Cierre): ${tOld.titulo}`,
              `El ticket #${tOld.id} "${tOld.titulo}" fue marcado como Resuelto por ${currentUser.nombre_completo}. Por favor contacta al usuario para confirmar la solución y cerrarlo definitivamente o reabrirlo.`
            ).catch(console.error);

            enviarCorreo(
              n1UserRows[0].email,
              `Ticket Resuelto por N2: ${tOld.titulo}`,
              `Hola ${n1UserRows[0].nombre_completo},\n\nEl ticket "${tOld.titulo}" que escalaste a N2 ha sido marcado como Resuelto por ${currentUser.nombre_completo}.\n\nPor favor contacta al usuario solicitante para confirmar que todo funciona correctamente y procede a cerrar o reabrir el ticket en la plataforma.`
            ).catch(console.error);
          }
        }
      }
      // 2) Si N1/Admin reabre el ticket (pasa a 'En Proceso' desde 'Resuelto' o 'Cerrado')
      else if (data.estado === 'En Proceso' && (tOld.estado === 'Resuelto' || tOld.estado === 'Cerrado' || tOld.estado === 'Finalizada')) {
        data.nivel_soporte = 'N1';
        if (tOld.tecnico_n1_id) {
          data.tecnico_id = tOld.tecnico_n1_id;
        } else if (!data.tecnico_id) {
          data.tecnico_id = currentUser.id;
        }
        logs.push(`Ticket reabierto por (${currentUser.nombre_completo}). Permanece asignado a N1 para su atención.`);

        if (tOld.tecnico_n2_id && tOld.tecnico_n2_id !== currentUser.id) {
          crearNotificacion(
            tOld.tecnico_n2_id,
            `Ticket Reabierto en N1: ${tOld.titulo}`,
            `El ticket #${tOld.id} "${tOld.titulo}" fue reabierto por ${currentUser.nombre_completo} y se mantiene en N1.`
          ).catch(console.error);
        }
      }
      // 3) Si N1 o Admin cierra un ticket (pasa a 'Cerrado')
      else if (data.estado === 'Cerrado' || data.estado === 'Finalizada') {
        data.estado = 'Cerrado';
        logs.push(`Ticket cerrado definitivamente por (${currentUser.nombre_completo}) tras confirmación con el usuario.`);
      }
      else {
        logs.push(`Estado cambiado de "${tOld.estado}" a "${data.estado}"`);
      }
      
      // SLA Pausing Logic (ITIL N3)
      if (data.estado === 'Elevado a Proveedor' || data.estado === 'Escalado a Proveedor') {
        data.estado = 'Elevado a Proveedor';
        data.nivel_soporte = 'N3';
        data.sla_paused_at = new Date();
      } else if (tOld.estado === 'Elevado a Proveedor' || tOld.estado === 'Escalado a Proveedor') {
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
  const allowed = ['titulo', 'descripcion', 'categoria', 'empresa_id', 'sucursal_id', 'area_solicitante', 'persona_solicitante',
    'medio_solicitud', 'fecha_final_tentativa', 'avance_proceso', 'observaciones', 'prioridad',
    'estado', 'tecnico_id', 'tecnico_n1_id', 'tecnico_n2_id', 'nivel_soporte', 'grupo_n2', 'sla_paused_at', 'sla_acumulado_pausa_segundos'];
  for (const field of allowed) {
    if (data[field] !== undefined) { sets.push(`${field} = ?`); vals.push(data[field]); }
  }
  if (data.adjuntos !== undefined) {
    sets.push('adjuntos = ?');
    vals.push(typeof data.adjuntos === 'string' ? data.adjuntos : JSON.stringify(data.adjuntos));
  }
  if (data.bitacora_dinamica !== undefined) {
    sets.push('bitacora_dinamica = ?');
    vals.push(JSON.stringify(data.bitacora_dinamica));
  }
  if (sets.length === 0) return formatTicketResponse(tOld);

  // Preservar tecnico_n1_id si cambia tecnico_id y no estaba definido
  if (tOld.tecnico_id && !tOld.tecnico_n1_id && data.tecnico_id !== undefined && data.tecnico_id !== tOld.tecnico_id) {
    sets.push('tecnico_n1_id = ?');
    vals.push(tOld.tecnico_id);
  }

  vals.push(ticketId);
  await pool.query(`UPDATE ticket SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, vals);

  // Notificar al técnico N1 original si existía y no es quien realizó la edición
  if (tOld.tecnico_n1_id && tOld.tecnico_n1_id !== currentUser?.id) {
    const [n1Rows] = await pool.query<RowDataPacket[]>(`SELECT email, nombre_completo FROM usuario WHERE id = ?`, [tOld.tecnico_n1_id]);
    if (n1Rows.length > 0) {
      const n1User = n1Rows[0];
      const cambioStr = (currentUser && logs.length > 0) ? logs.join(', ') : `Actualización en el ticket`;
      crearNotificacion(
        tOld.tecnico_n1_id,
        `Avance en Ticket #${ticketId}: ${tOld.titulo}`,
        `El soporte en N2/N3 fue actualizado por ${currentUser?.nombre_completo || 'el sistema'}: ${cambioStr}.`
      ).catch(console.error);

      enviarCorreo(
        n1User.email,
        `Avance en Ticket #${ticketId}: ${tOld.titulo}`,
        `Hola ${n1User.nombre_completo},\n\nEl ticket #${ticketId} ("${tOld.titulo}") que asignaste/escalaste ha tenido una actualización por ${currentUser?.nombre_completo || 'el sistema'}:\n\nDetalle: ${cambioStr}\nEstado actual: ${data.estado || tOld.estado}\nObservaciones: ${data.observaciones || tOld.observaciones || 'Sin observaciones'}\n\nIngresa a la plataforma para ver el detalle de los avances.`
      ).catch(console.error);
    }
  }

  // Si el ticket se cierra, enviar notificación al creador del ticket (solicitante)
  if ((data.estado === 'Cerrado' || data.estado === 'Finalizada') && tOld.estado !== 'Cerrado' && tOld.estado !== 'Finalizada') {
    const [creatorRows] = await pool.query<RowDataPacket[]>(
      `SELECT email, nombre_completo FROM usuario WHERE id = ?`, [tOld.creador_id]
    );
    if (creatorRows.length > 0) {
      const creatorUser = creatorRows[0];
      // Notificación en la campana
      crearNotificacion(
        tOld.creador_id,
        `Ticket Cerrado: ${tOld.titulo}`,
        `Tu solicitud de soporte "${tOld.titulo}" ha sido concluida y cerrada. Observaciones: ${data.observaciones || 'Sin observaciones de cierre.'}`
      ).catch(console.error);

      // Notificación por correo
      enviarCorreo(
        creatorUser.email,
        `Ticket Cerrado: ${tOld.titulo}`,
        `Hola ${creatorUser.nombre_completo},\n\nTu solicitud de soporte "${tOld.titulo}" ha sido atendida y cerrada por nuestro equipo.\n\nDetalle/Observaciones:\n${data.observaciones || 'Sin observaciones de cierre.'}\n\nGracias por usar el sistema.`
      ).catch(console.error);
    }
  }

  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT t.*, 
           u.nombre_completo as tecnico_nombre, 
           u_n1.nombre_completo as tecnico_n1_nombre,
           e.nombre as empresa_nombre, 
           s.nombre as sucursal_nombre 
    FROM ticket t 
    LEFT JOIN usuario u ON t.tecnico_id = u.id 
    LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
    LEFT JOIN empresa e ON t.empresa_id = e.id 
    LEFT JOIN sucursal s ON t.sucursal_id = s.id
    WHERE t.id = ?`, [ticketId]);
  return formatTicketResponse(rows[0]);
};

export const addAdjuntosToTicket = async (ticketId: number, newAdjuntos: any[], currentUser: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [ticketId]);
  if (existing.length === 0) return null;
  const ticket = existing[0];

  let currentAdjuntos: any[] = [];
  if (ticket.adjuntos) {
    if (typeof ticket.adjuntos === 'string') {
      try {
        currentAdjuntos = JSON.parse(ticket.adjuntos);
      } catch {
        currentAdjuntos = [];
      }
    } else if (Array.isArray(ticket.adjuntos)) {
      currentAdjuntos = ticket.adjuntos;
    }
  }

  let bitacora = [];
  try {
    bitacora = typeof ticket.bitacora_dinamica === 'string'
      ? JSON.parse(ticket.bitacora_dinamica)
      : ticket.bitacora_dinamica || [];
  } catch {
    bitacora = [];
  }

  const updatedAdjuntos = [...currentAdjuntos, ...newAdjuntos];
  const fileNames = newAdjuntos.map((a: any) => a.nombre).join(', ');
  bitacora.push({
    accion: `Se adjuntaron ${newAdjuntos.length} archivo(s): ${fileNames}`,
    fecha: new Date().toISOString(),
    usuario: currentUser?.nombre_completo || 'Usuario'
  });

  await pool.query(
    `UPDATE ticket SET adjuntos = ?, bitacora_dinamica = ?, updated_at = NOW() WHERE id = ?`,
    [JSON.stringify(updatedAdjuntos), JSON.stringify(bitacora), ticketId]
  );

  const [updatedRows] = await pool.query<RowDataPacket[]>(`
    SELECT t.*, 
           u.nombre_completo as tecnico_nombre, 
           u_n1.nombre_completo as tecnico_n1_nombre,
           e.nombre as empresa_nombre, 
           s.nombre as sucursal_nombre 
    FROM ticket t 
    LEFT JOIN usuario u ON t.tecnico_id = u.id 
    LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
    LEFT JOIN empresa e ON t.empresa_id = e.id 
    LEFT JOIN sucursal s ON t.sucursal_id = s.id
    WHERE t.id = ?`, [ticketId]);

  return formatTicketResponse(updatedRows[0]);
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

  // Cargar técnicos activos N2 de ese grupo específico y asignados a la empresa/sucursal del ticket
  let techRows: RowDataPacket[] = [];
  if (ticket.sucursal_id) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT u.id, u.nombre_completo, u.email 
       FROM usuario u
       JOIN rol r ON u.rol_id = r.id
       LEFT JOIN usuario_sucursal us ON u.id = us.usuario_id
       LEFT JOIN sucursal s ON s.usuario_id = u.id
       WHERE r.nombre = 'TECNICO' AND u.nivel_soporte = 'N2' AND u.grupo_n2 = ? AND u.is_active = 1
         AND (us.sucursal_id = ? OR s.id = ?)`,
      [grupo_n2, ticket.sucursal_id, ticket.sucursal_id]
    );
    techRows = rows;
  }

  if (techRows.length === 0 && ticket.empresa_id) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT u.id, u.nombre_completo, u.email 
       FROM usuario u
       JOIN rol r ON u.rol_id = r.id
       LEFT JOIN usuario_empresa ue ON u.id = ue.usuario_id
       LEFT JOIN usuario_sucursal us ON u.id = us.usuario_id
       LEFT JOIN sucursal s ON us.sucursal_id = s.id OR s.usuario_id = u.id
       WHERE r.nombre = 'TECNICO' AND u.nivel_soporte = 'N2' AND u.grupo_n2 = ? AND u.is_active = 1
         AND (ue.empresa_id = ? OR s.empresa_id = ?)`,
      [grupo_n2, ticket.empresa_id, ticket.empresa_id]
    );
    techRows = rows;
  }

  // Fallback únicamente si el ticket no tiene empresa ni sucursal especificada
  if (techRows.length === 0 && !ticket.empresa_id && !ticket.sucursal_id) {
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

  // Preservar N1 en tecnico_n1_id
  const n1IdToKeep = ticket.tecnico_n1_id || (currentUser.nivel_soporte === 'N1' || currentUser.rol_nombre === 'TECNICO' ? currentUser.id : ticket.tecnico_id) || currentUser.id;

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
         tecnico_n1_id = ?,
         tecnico_n2_id = ?,
         bitacora_dinamica = ?, 
         updated_at = NOW() 
     WHERE id = ?`,
    [grupo_n2, finalTecnicoId, n1IdToKeep, finalTecnicoId, JSON.stringify(bitacora), ticketId]
  );

  // Enviar correo y notificación al N1 original si no es quien escaló
  if (n1IdToKeep && n1IdToKeep !== currentUser.id) {
    const [n1Rows] = await pool.query<RowDataPacket[]>(`SELECT email, nombre_completo FROM usuario WHERE id = ?`, [n1IdToKeep]);
    if (n1Rows.length > 0) {
      crearNotificacion(
        n1IdToKeep,
        `Ticket Escalado a N2 (${grupo_n2})`,
        `El ticket: "${ticket.titulo}" fue escalado a N2 (${grupo_n2}) por ${currentUser.nombre_completo} y asignado a ${finalTecnicoNombre}. Podrás seguir viendo los avances en modo lectura.`
      ).catch(console.error);

      enviarCorreo(
        n1Rows[0].email,
        `Ticket Escalado a N2: ${ticket.titulo}`,
        `Hola ${n1Rows[0].nombre_completo},\n\nEl ticket "${ticket.titulo}" que tenías asignado ha sido escalado a Nivel 2 (${grupo_n2}) por ${currentUser.nombre_completo} y asignado a ${finalTecnicoNombre}.\n\nEl ticket permanecerá en tu bandeja en modo Solo Lectura para que puedas monitorear sus avances.`
      ).catch(console.error);
    }
  }

  // Enviar correos y notificaciones internas si hay técnico asignado N2
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
    `SELECT t.*, 
            u.nombre_completo as tecnico_nombre, 
            u_n1.nombre_completo as tecnico_n1_nombre,
            e.nombre as empresa_nombre, 
            s.nombre as sucursal_nombre 
     FROM ticket t 
     LEFT JOIN usuario u ON t.tecnico_id = u.id 
     LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
     LEFT JOIN empresa e ON t.empresa_id = e.id 
     LEFT JOIN sucursal s ON t.sucursal_id = s.id
     WHERE t.id = ?`,
    [ticketId]
  );
  return formatTicketResponse(updatedRows[0]);
};

export const escalarTicketAProveedor = async (ticketId: number, currentUser: any) => {
  if (currentUser.rol_nombre !== 'ADMIN' && currentUser.rol_nombre !== 'SUPERVISOR' && currentUser.rol_nombre !== 'TECNICO') {
    throw new Error('Solo los técnicos, supervisores o administradores pueden elevar un soporte a Proveedor (N3).');
  }

  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [ticketId]);
  if (existing.length === 0) return null;
  const ticket = existing[0];

  let bitacora = [];
  try {
    bitacora = typeof ticket.bitacora_dinamica === 'string'
      ? JSON.parse(ticket.bitacora_dinamica)
      : ticket.bitacora_dinamica || [];
  } catch (e) {
    bitacora = [];
  }

  const ahora = new Date();
  bitacora.push({
    accion: `Ticket elevado a Proveedor (N3) por ${currentUser.nombre_completo} - SLA Pausado`,
    fecha: ahora.toISOString(),
    usuario: currentUser.nombre_completo
  });

  await pool.query(
    `UPDATE ticket 
     SET nivel_soporte = 'N3', 
         estado = 'Elevado a Proveedor', 
         sla_paused_at = NOW(), 
         bitacora_dinamica = ?, 
         updated_at = NOW() 
     WHERE id = ?`,
    [JSON.stringify(bitacora), ticketId]
  );

  if (ticket.tecnico_n1_id && ticket.tecnico_n1_id !== currentUser.id) {
    const [n1Rows] = await pool.query<RowDataPacket[]>(`SELECT email, nombre_completo FROM usuario WHERE id = ?`, [ticket.tecnico_n1_id]);
    if (n1Rows.length > 0) {
      crearNotificacion(
        ticket.tecnico_n1_id,
        `Ticket Escalado a Proveedor (N3): ${ticket.titulo}`,
        `El ticket "${ticket.titulo}" fue elevado a Proveedor (N3) por ${currentUser.nombre_completo}. SLA Pausado.`
      ).catch(console.error);

      enviarCorreo(
        n1Rows[0].email,
        `Ticket Escalado a Proveedor (N3): ${ticket.titulo}`,
        `Hola ${n1Rows[0].nombre_completo},\n\nEl ticket "${ticket.titulo}" que habías asignado/atendido fue elevado a Proveedor (N3) por ${currentUser.nombre_completo}.\nEl tiempo SLA ha sido pausado mientras atiende el proveedor.`
      ).catch(console.error);
    }
  }

  const [updatedRows] = await pool.query<RowDataPacket[]>(
    `SELECT t.*, 
            u.nombre_completo as tecnico_nombre, 
            u_n1.nombre_completo as tecnico_n1_nombre,
            e.nombre as empresa_nombre, 
            s.nombre as sucursal_nombre 
     FROM ticket t 
     LEFT JOIN usuario u ON t.tecnico_id = u.id 
     LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
     LEFT JOIN empresa e ON t.empresa_id = e.id 
     LEFT JOIN sucursal s ON t.sucursal_id = s.id
     WHERE t.id = ?`,
    [ticketId]
  );
  return formatTicketResponse(updatedRows[0]);
};

export const escalarTicketAAdmin = async (
  ticketId: number,
  data: { tecnico_id?: number | null },
  currentUser: any
) => {
  if (currentUser.rol_nombre !== 'SUPERVISOR' && currentUser.rol_nombre !== 'ADMIN') {
    throw new Error('Solo el personal de Supervisión o Administración puede escalar un soporte a Nivel Administración.');
  }

  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM ticket WHERE id = ?`, [ticketId]
  );
  if (existing.length === 0) return null;
  const ticket = existing[0];

  // Cargar administradores activos habilitados para recibir escalado (recibir_escalado_admin = 1)
  const [adminRows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.nombre_completo, u.email 
     FROM usuario u
     JOIN rol r ON u.rol_id = r.id
     WHERE r.nombre = 'ADMIN' AND u.is_active = 1 AND (u.recibir_escalado_admin IS NULL OR u.recibir_escalado_admin = 1)`
  );

  if (adminRows.length === 0) {
    throw new Error('No hay Administradores habilitados en la plataforma para recibir este escalamiento.');
  }

  let finalAdminId: number | null = null;
  let finalAdminNombre = 'Administración';
  let finalAdminEmail = '';

  const tecnico_id = data.tecnico_id;
  if (tecnico_id && Number(tecnico_id) > 0) {
    const matched = adminRows.find(a => a.id === Number(tecnico_id));
    if (!matched) {
      throw new Error('El Administrador seleccionado no está habilitado para recibir escalamientos desde base de datos.');
    }
    finalAdminId = matched.id;
    finalAdminNombre = matched.nombre_completo;
    finalAdminEmail = matched.email;
  } else {
    // Auto-balanceo entre Administradores habilitados
    if (adminRows.length === 1) {
      finalAdminId = adminRows[0].id;
      finalAdminNombre = adminRows[0].nombre_completo;
      finalAdminEmail = adminRows[0].email;
    } else {
      const adminIds = adminRows.map(a => a.id);
      const [balanceo] = await pool.query<RowDataPacket[]>(
        `SELECT u.id, COUNT(t.id) as total_tickets
         FROM usuario u
         LEFT JOIN ticket t ON u.id = t.tecnico_id AND t.estado IN ('Nuevo', 'Pendiente', 'En Proceso')
         WHERE u.id IN (?)
         GROUP BY u.id
         ORDER BY total_tickets ASC
         LIMIT 1`,
        [adminIds]
      );
      if (balanceo.length > 0) {
        finalAdminId = balanceo[0].id;
        const found = adminRows.find(a => a.id === finalAdminId);
        if (found) {
          finalAdminNombre = found.nombre_completo;
          finalAdminEmail = found.email;
        }
      }
    }
  }

  const bitacora = typeof ticket.bitacora_dinamica === 'string'
    ? JSON.parse(ticket.bitacora_dinamica)
    : ticket.bitacora_dinamica || [];

  bitacora.push({
    accion: `Ticket escalado a Nivel Administración por ${currentUser.nombre_completo}. Asignado a: ${finalAdminNombre}`,
    fecha: new Date().toISOString(),
    usuario: currentUser.nombre_completo
  });

  await pool.query(
    `UPDATE ticket 
     SET nivel_soporte = 'ADMIN', 
         estado = 'Elevado a Administración', 
         tecnico_id = ?, 
         bitacora_dinamica = ?, 
         updated_at = NOW() 
     WHERE id = ?`,
    [finalAdminId, JSON.stringify(bitacora), ticketId]
  );

  if (finalAdminId) {
    crearNotificacion(
      finalAdminId,
      `Ticket Escalado a Nivel Administración: ${ticket.titulo}`,
      `El ticket #${ticket.id} "${ticket.titulo}" fue escalado a Nivel Administración por ${currentUser.nombre_completo}.`
    ).catch(console.error);

    if (finalAdminEmail) {
      enviarCorreo(
        finalAdminEmail,
        `Ticket Escalado a Administración: ${ticket.titulo}`,
        `Hola ${finalAdminNombre},\n\nSe te ha asignado el ticket #${ticket.id} "${ticket.titulo}" por escalación a Nivel Administración realizada por ${currentUser.nombre_completo}.\n\nIngresa a la plataforma para gestionarlo.`
      ).catch(console.error);
    }
  }

  const [updatedRows] = await pool.query<RowDataPacket[]>(
    `SELECT t.*, 
            u.nombre_completo as tecnico_nombre, 
            u_n1.nombre_completo as tecnico_n1_nombre,
            e.nombre as empresa_nombre, 
            s.nombre as sucursal_nombre 
     FROM ticket t 
     LEFT JOIN usuario u ON t.tecnico_id = u.id 
     LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
     LEFT JOIN empresa e ON t.empresa_id = e.id 
     LEFT JOIN sucursal s ON t.sucursal_id = s.id
     WHERE t.id = ?`,
    [ticketId]
  );
  return formatTicketResponse(updatedRows[0]);
};

export const escalarTicketAProyecto = async (ticketId: number, currentUser: any) => {
  if (currentUser.rol_nombre !== 'ADMIN' && currentUser.rol_nombre !== 'SUPERVISOR' && currentUser.nivel_soporte !== 'N2') {
    throw new Error('Solo el personal de Nivel 2, Supervisores o Administradores pueden elevar un soporte a Proyecto.');
  }

  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT t.*, e.nombre as empresa_nombre 
     FROM ticket t 
     LEFT JOIN empresa e ON t.empresa_id = e.id 
     WHERE t.id = ?`, 
    [ticketId]
  );
  if (existing.length === 0) return null;
  const ticket = existing[0];

  // 1. Crear el proyecto en la base de datos
  const nombreProyecto = `Proyecto: ${ticket.titulo}`;
  const descProyecto = `${ticket.descripcion}\n\n--- Información de Origen ---\nTicket ID: #${ticket.id}\nSolicitante: ${ticket.persona_solicitante || 'N/A'}\nÁrea: ${ticket.area_solicitante || 'General'}\nSede/Empresa: ${ticket.empresa_nombre || 'N/A'}`;
  
  const fechaFinEstimada = new Date();
  fechaFinEstimada.setDate(fechaFinEstimada.getDate() + 14); // 14 días por defecto
  const fechaFinStr = fechaFinEstimada.toISOString().slice(0, 19).replace('T', ' ');

  const miembrosJson = JSON.stringify([currentUser.id]);

  const [projResult] = await pool.query<ResultSetHeader>(
    `INSERT INTO proyecto (nombre, descripcion, fecha_fin_estimada, estado, tipo_proyecto, creador_id, ticket_origen_id, miembros)
     VALUES (?, ?, ?, 'Sin Iniciar', 'Soporte IT', ?, ?, ?)`,
    [nombreProyecto, descProyecto, fechaFinStr, currentUser.id, ticketId, miembrosJson]
  );

  const proyectoId = projResult.insertId;

  // 2. Log de historial en proyecto_historial
  await pool.query(
    `INSERT INTO proyecto_historial (proyecto_id, usuario_id, descripcion_cambio) VALUES (?, ?, ?)`,
    [proyectoId, currentUser.id, `El usuario N2 ${currentUser.nombre_completo} elevó el ticket #${ticketId} a Proyecto con éxito.`]
  );

  // 3. Actualizar Ticket
  let bitacora = [];
  try {
    bitacora = typeof ticket.bitacora_dinamica === 'string'
      ? JSON.parse(ticket.bitacora_dinamica)
      : ticket.bitacora_dinamica || [];
  } catch (e) {
    bitacora = [];
  }

  bitacora.push({
    accion: `Ticket elevado a Proyecto #${proyectoId} ("${nombreProyecto}") por ${currentUser.nombre_completo}. Asignado a ${currentUser.nombre_completo}.`,
    fecha: new Date().toISOString(),
    usuario: currentUser.nombre_completo
  });

  await pool.query(
    `UPDATE ticket 
     SET estado = 'Escalado a Proyecto', 
         bitacora_dinamica = ?, 
         updated_at = NOW() 
     WHERE id = ?`,
    [JSON.stringify(bitacora), ticketId]
  );

  if (ticket.tecnico_n1_id && ticket.tecnico_n1_id !== currentUser.id) {
    const [n1Rows] = await pool.query<RowDataPacket[]>(`SELECT email, nombre_completo FROM usuario WHERE id = ?`, [ticket.tecnico_n1_id]);
    if (n1Rows.length > 0) {
      crearNotificacion(
        ticket.tecnico_n1_id,
        `Ticket Elevado a Proyecto: ${ticket.titulo}`,
        `El ticket "${ticket.titulo}" fue elevado a Proyecto por ${currentUser.nombre_completo}.`
      ).catch(console.error);

      enviarCorreo(
        n1Rows[0].email,
        `Ticket Elevado a Proyecto: ${ticket.titulo}`,
        `Hola ${n1Rows[0].nombre_completo},\n\nEl ticket "${ticket.titulo}" que habías asignado/atendido fue elevado a Proyecto por ${currentUser.nombre_completo}.`
      ).catch(console.error);
    }
  }

  const [updatedRows] = await pool.query<RowDataPacket[]>(
    `SELECT t.*, 
            u.nombre_completo as tecnico_nombre, 
            u_n1.nombre_completo as tecnico_n1_nombre,
            e.nombre as empresa_nombre, 
            s.nombre as sucursal_nombre 
     FROM ticket t 
     LEFT JOIN usuario u ON t.tecnico_id = u.id 
     LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
     LEFT JOIN empresa e ON t.empresa_id = e.id 
     LEFT JOIN sucursal s ON t.sucursal_id = s.id
     WHERE t.id = ?`,
    [ticketId]
  );

  return {
    ticket: formatTicketResponse(updatedRows[0]),
    proyecto_id: proyectoId,
    proyecto_nombre: nombreProyecto
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
    SELECT t.id, t.titulo, t.estado, t.prioridad, t.created_at, t.updated_at,
           c.nombre_completo as creador_nombre, u.nombre_completo as tecnico_nombre
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
  const worksheet = workbook.addWorksheet('Reporte de Tickets');

  // Habilitar líneas de cuadrícula
  worksheet.views = [{ showGridLines: true }];

  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Título', key: 'titulo', width: 40 },
    { header: 'Estado', key: 'estado', width: 15 },
    { header: 'Prioridad', key: 'prioridad', width: 15 },
    { header: 'Fecha Creación', key: 'created_at', width: 20 },
    { header: 'Fecha Actualización', key: 'updated_at', width: 20 },
    { header: 'Creador', key: 'creador', width: 25 },
    { header: 'Técnico', key: 'tecnico', width: 25 }
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

  for (const t of tickets) {
    worksheet.addRow({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      prioridad: t.prioridad,
      created_at: t.created_at ? new Date(t.created_at).toLocaleString() : '',
      updated_at: t.updated_at ? new Date(t.updated_at).toLocaleString() : '',
      creador: t.creador_nombre || 'N/A',
      tecnico: t.tecnico_nombre || 'Sin asignar'
    });
  }

  // Ajuste automático de anchos de columna con padding
  worksheet.columns.forEach((column) => {
    let maxLen = 0;
    column.eachCell!({ includeEmpty: false }, (cell, rowNum) => {
      if (cell.value) {
        const valueStr = cell.value.toString();
        if (valueStr.length > maxLen) {
          maxLen = valueStr.length;
        }
      }
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 45);
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
  search?: string,
  tecnicoId?: number | string,
  tipoItil?: 'SOLICITUDES' | 'INCIDENCIAS' | string
) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;
  let whereClauses: string[] = [];
  const params: any[] = [];

  const isTechN2 = currentUser.rol_nombre === 'TECNICO' && currentUser.nivel_soporte === 'N2';
  const effectiveTipoItil = isTechN2 ? 'INCIDENCIAS' : (tipoItil || 'SOLICITUDES');

  if (currentUser.rol_nombre === 'TECNICO') {
    if (isTechN2) {
      whereClauses.push(`(t.tecnico_id = ? OR t.tecnico_n2_id = ?)`);
      params.push(currentUser.id, currentUser.id);
    } else {
      if (effectiveTipoItil === 'INCIDENCIAS') {
        whereClauses.push(`(t.tecnico_n1_id = ? OR t.creador_id = ?)`);
        params.push(currentUser.id, currentUser.id);
      } else {
        whereClauses.push(`(t.tecnico_id = ? OR t.tecnico_n1_id = ? OR t.creador_id = ?)`);
        params.push(currentUser.id, currentUser.id, currentUser.id);
      }
    }
  } else if (currentUser.rol_nombre === 'USUARIO') {
    whereClauses.push(`t.creador_id = ?`);
    params.push(currentUser.id);
  }

  // Filtro ITIL: SOLICITUDES (Nivel 1) vs INCIDENCIAS (N2, N3 / Proveedor, Administración)
  if (effectiveTipoItil === 'SOLICITUDES') {
    whereClauses.push(`((t.nivel_soporte = 'N1' OR t.nivel_soporte IS NULL) AND t.estado NOT IN ('Elevado a Proveedor', 'Elevado a Administración', 'Escalado a Proveedor'))`);
  } else if (effectiveTipoItil === 'INCIDENCIAS') {
    whereClauses.push(`(t.nivel_soporte IN ('N2', 'N3', 'ADMIN') OR t.estado IN ('Elevado a Proveedor', 'Elevado a Administración', 'Escalado a Proveedor'))`);
  }

  if (excludeStatus) {
    whereClauses.push(`t.estado != ?`);
    params.push(excludeStatus);
  }

  if (estado && estado !== 'todos') {
    whereClauses.push(`t.estado = ?`);
    params.push(estado);
  }

  if (tecnicoId && Number(tecnicoId) > 0) {
    const techIdNum = Number(tecnicoId);
    whereClauses.push(`(t.tecnico_id = ? OR t.tecnico_n1_id = ? OR t.tecnico_n2_id = ?)`);
    params.push(techIdNum, techIdNum, techIdNum);
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
           u_n1.nombre_completo as tecnico_n1_nombre,
           u_n2.nombre_completo as tecnico_n2_nombre,
           e.nombre as empresa_nombre,
           s.nombre as sucursal_nombre,
           t.bitacora_dinamica as bitacora_raw
    FROM ticket t
    LEFT JOIN usuario u ON t.tecnico_id = u.id
    LEFT JOIN usuario u_n1 ON t.tecnico_n1_id = u_n1.id
    LEFT JOIN usuario u_n2 ON t.tecnico_n2_id = u_n2.id
    LEFT JOIN empresa e ON t.empresa_id = e.id
    LEFT JOIN sucursal s ON t.sucursal_id = s.id
    ${whereStr}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const selectParams = [...params, limitNum, skip];
  const [dataRows] = await pool.query<RowDataPacket[]>(selectQuery, selectParams);

  const data = dataRows.map(r => formatTicketResponse(r));

  return {
    total,
    page: pageNum,
    limit: limitNum,
    data
  };
};

