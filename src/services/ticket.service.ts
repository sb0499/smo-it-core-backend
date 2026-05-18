import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { enviarCorreo } from './notificacion.service';

const TECNICOS_SEDE: Record<string, string> = {
  CCI: 'cci@smo.com',
  SCALA: 'scala@smo.com',
  CONDADO: 'condado@smo.com'
};

export const getTickets = async (skip = 0, limit = 100) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.*,
            JSON_UNQUOTE(t.bitacora_dinamica) as bitacora_dinamica
     FROM ticket t
     ORDER BY t.created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, skip]
  );
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
    const esDiaSemana = diaSemana >= 1 && diaSemana <= 5;
    if (esDiaSemana) {
      if (data.empresa_id) {
        const [empRows] = await pool.query<RowDataPacket[]>(`SELECT nombre FROM empresa WHERE id = ?`, [data.empresa_id]);
        if (empRows.length > 0) {
          const nombreEmpresa = empRows[0].nombre.toUpperCase();
          if (TECNICOS_SEDE[nombreEmpresa]) {
            const [tecRows] = await pool.query<RowDataPacket[]>(`SELECT id FROM usuario WHERE email = ?`, [TECNICOS_SEDE[nombreEmpresa]]);
            if (tecRows.length > 0) tecnicoAsignado = tecRows[0].id;
          }
        }
      }
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
      const fechaHoy = ahora.toISOString().split('T')[0];
      const [guardiaRows] = await pool.query<RowDataPacket[]>(
        `SELECT tecnico_id FROM guardia_feriado WHERE fecha = ?`,
        [fechaHoy]
      );
      if (guardiaRows.length > 0) tecnicoAsignado = guardiaRows[0].tecnico_id;
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
  
  // Background notification
  enviarCorreo('soporte@smo.com', `Nuevo Ticket: ${data.titulo}`,
    `Se ha creado un nuevo ticket. Asignado al técnico ID: ${tecnicoAsignado || 'Sin asignar'}.`
  ).catch(console.error);

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
