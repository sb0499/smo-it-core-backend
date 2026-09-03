import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { enviarCorreo, crearNotificacion } from './notificacion.service';

// --- HELPERS DE SEMAFORO Y TIEMPO ---
export const calcularSemaforo = (fechaFinStr: string | Date, estado: string) => {
  if (estado === 'Finalizado') {
    return { semaforo: 'Verde', tiempo_restante: 'Completado' };
  }
  const ahora = new Date();
  const fin = new Date(fechaFinStr);
  const diffMs = fin.getTime() - ahora.getTime();
  const diffHoras = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) {
    return { semaforo: 'Rojo', tiempo_restante: 'Atrasado' };
  }
  if (diffHoras < 24) {
    return { semaforo: 'Rojo', tiempo_restante: `${Math.round(diffHoras)} horas` };
  }
  if (diffHoras < 48) {
    return { semaforo: 'Amarillo', tiempo_restante: `${Math.round(diffHoras)} horas` };
  }
  const dias = Math.ceil(diffHoras / 24);
  return { semaforo: 'Verde', tiempo_restante: `${dias} días` };
};

// --- LOGGING DE HISTORIAL Y NOTIFICACIONES ---
export const logProyectoHistorial = async (proyectoId: number, usuarioId: number, descripcion: string) => {
  await pool.query(
    `INSERT INTO proyecto_historial (proyecto_id, usuario_id, descripcion_cambio) VALUES (?, ?, ?)`,
    [proyectoId, usuarioId, descripcion]
  );
};

export const notificarUsuario = async (usuarioId: number, titulo: string, mensaje: string) => {
  if (!usuarioId) return;
  try {
    const [uRows] = await pool.query<RowDataPacket[]>(
      `SELECT email, nombre_completo FROM usuario WHERE id = ?`,
      [usuarioId]
    );
    if (uRows.length > 0) {
      const u = uRows[0];
      await crearNotificacion(usuarioId, titulo, mensaje).catch(console.error);
      if (u.email) {
        await enviarCorreo(
          u.email,
          titulo,
          `Hola ${u.nombre_completo},\n\n${mensaje}\n\nSaludos,\nSistema TISMO`
        ).catch(console.error);
      }
    }
  } catch (err) {
    console.error(`Error enviando notificación a usuario ID ${usuarioId}:`, err);
  }
};

// --- RECALCULO DE PORCENTAJES Y CASACADA ---
export const recalcularAvanceYEstados = async (proyectoId: number, usuarioId: number) => {
  // 1. Obtener todas las tareas del proyecto
  const [tareas] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM tarea_proyecto WHERE proyecto_id = ?`,
    [proyectoId]
  );

  for (const tarea of tareas) {
    // Buscar si esta tarea tiene subtareas
    const [subtareas] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM subtarea_proyecto WHERE tarea_id = ?`,
      [tarea.id]
    );

    if (subtareas.length > 0) {
      // Calcular promedio de subtareas
      const totalAvance = subtareas.reduce((acc, sub) => acc + sub.avance_porcentaje, 0);
      const promedio = Math.round(totalAvance / subtareas.length);
      const todasFinalizadas = subtareas.every((sub) => sub.estado === 'Finalizado');
      let nuevoEstado = tarea.estado;
      if (todasFinalizadas) {
        nuevoEstado = 'Finalizado';
      } else {
        nuevoEstado = promedio === 0 ? 'Sin Iniciar' : 'En Proceso';
      }

      if (tarea.avance_porcentaje !== promedio || tarea.estado !== nuevoEstado) {
        await pool.query(
          `UPDATE tarea_proyecto SET avance_porcentaje = ?, estado = ? WHERE id = ?`,
          [promedio, nuevoEstado, tarea.id]
        );
        await logProyectoHistorial(
          proyectoId,
          usuarioId,
          `Sistema recalculó Tarea "${tarea.titulo}": Avance ${promedio}%, Estado "${nuevoEstado}"`
        );
      }
    }
  }

  // 2. Recalcular Proyecto basado en promedio de tareas
  const [tareasActualizadas] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM tarea_proyecto WHERE proyecto_id = ?`,
    [proyectoId]
  );

  if (tareasActualizadas.length > 0) {
    const totalAvanceProj = tareasActualizadas.reduce((acc, t) => acc + t.avance_porcentaje, 0);
    const promedioProj = Math.round(totalAvanceProj / tareasActualizadas.length);
    const todasTareasFinalizadas = tareasActualizadas.every((t) => t.estado === 'Finalizado');
    
    // Obtener estado anterior del proyecto
    const [projRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [proyectoId]);
    const projAnterior = projRow[0];

    let nuevoEstadoProj = projAnterior.estado;
    if (todasTareasFinalizadas) {
      nuevoEstadoProj = 'Finalizado';
    } else {
      nuevoEstadoProj = promedioProj === 0 ? 'Sin Iniciar' : 'En Proceso';
    }

    if (projAnterior.avance_porcentaje !== promedioProj || projAnterior.estado !== nuevoEstadoProj) {
      await pool.query(
        `UPDATE proyecto SET avance_porcentaje = ?, estado = ? WHERE id = ?`,
        [promedioProj, nuevoEstadoProj, proyectoId]
      );
      await logProyectoHistorial(
        proyectoId,
        usuarioId,
        `Sistema recalculó Proyecto: Avance ${promedioProj}%, Estado "${nuevoEstadoProj}"`
      );

      // Si pasa a Finalizado y antes no lo estaba, disparar el correo de confirmación de fin
      if (nuevoEstadoProj === 'Finalizado' && projAnterior.estado !== 'Finalizado') {
        const [creadorRow] = await pool.query<RowDataPacket[]>(
          `SELECT id, email, nombre_completo FROM usuario WHERE id = ?`,
          [projAnterior.creador_id]
        );
        const creador = creadorRow[0];

        // Obtener correos de los técnicos involucrados
        const [techRows] = await pool.query<RowDataPacket[]>(
          `SELECT DISTINCT u.id, u.email, u.nombre_completo 
           FROM tarea_proyecto t
           JOIN usuario u ON t.responsable_id = u.id
           WHERE t.proyecto_id = ?`,
          [proyectoId]
        );

        const destinatarios = [creador?.email, ...techRows.map((t) => t.email)].filter(Boolean) as string[];

        for (const dest of destinatarios) {
          await enviarCorreo(
            dest,
            `Proyecto Finalizado: ${projAnterior.nombre}`,
            `Hola,\n\nNos complace informarte que el proyecto "${projAnterior.nombre}" ha sido finalizado con éxito (100% de avance en todas sus tareas y subtareas).\n\nCreador del Proyecto: ${creador?.nombre_completo || 'Sistema'}\nFecha de Finalización: ${new Date().toLocaleString()}\n\nSaludos,\nSistema TISMO`
          ).catch(console.error);
        }

        // Notify creator and assigned technicians internally
        const userIdsToNotify = [creador?.id, ...techRows.map((t) => t.id)].filter(Boolean) as number[];
        for (const uId of userIdsToNotify) {
          await crearNotificacion(
            uId,
            `Proyecto Finalizado: ${projAnterior.nombre}`,
            `El proyecto "${projAnterior.nombre}" ha sido finalizado con éxito (100% de avance).`
          ).catch(console.error);
        }
      }
    }
  }
};

// --- SERVICIOS DE PROYECTO ---
export const getProyectos = async (currentUser: any, page?: number, limit?: number, search = '') => {
  let whereClauses: string[] = [];
  const params: any[] = [];

  // Filter by search query
  if (search) {
    const wildcard = `%${search}%`;
    whereClauses.push(`(p.nombre LIKE ? OR p.descripcion LIKE ? OR t.titulo LIKE ?)`);
    params.push(wildcard, wildcard, wildcard);
  }

  // Role filters
  let joinSql = '';
  if (currentUser.rol_nombre === 'TECNICO') {
    joinSql = `
      LEFT JOIN tarea_proyecto tp ON tp.proyecto_id = p.id
      LEFT JOIN subtarea_proyecto sp ON sp.tarea_id = tp.id
    `;
    whereClauses.push(`(p.creador_id = ? OR tp.responsable_id = ? OR sp.responsable_id = ?)`);
    params.push(currentUser.id, currentUser.id, currentUser.id);
  } else if (currentUser.rol_nombre === 'USUARIO') {
    whereClauses.push(`(p.creador_id = ? OR t.creador_id = ?)`);
    params.push(currentUser.id, currentUser.id);
  }

  const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  if (page !== undefined && limit !== undefined) {
    const skip = (page - 1) * limit;

    // Count query
    const countQuery = `
      SELECT COUNT(DISTINCT p.id) as count
      FROM proyecto p
      JOIN usuario u ON p.creador_id = u.id
      LEFT JOIN ticket t ON p.ticket_origen_id = t.id
      ${joinSql}
      ${whereStr}
    `;
    const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
    const total = countRows[0]?.count || 0;

    // Data query
    const selectQuery = `
      SELECT DISTINCT p.*, u.nombre_completo as creador_nombre, t.titulo as ticket_titulo
      FROM proyecto p
      JOIN usuario u ON p.creador_id = u.id
      LEFT JOIN ticket t ON p.ticket_origen_id = t.id
      ${joinSql}
      ${whereStr}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query<RowDataPacket[]>(selectQuery, [...params, limit, skip]);

    return {
      total,
      page,
      limit,
      data: rows
    };
  } else {
    // Return raw list
    const query = `
      SELECT DISTINCT p.*, u.nombre_completo as creador_nombre, t.titulo as ticket_titulo
      FROM proyecto p
      JOIN usuario u ON p.creador_id = u.id
      LEFT JOIN ticket t ON p.ticket_origen_id = t.id
      ${joinSql}
      ${whereStr}
      ORDER BY p.created_at DESC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }
};

export const getProyectoById = async (id: number, currentUser: any) => {
  const [projRow] = await pool.query<RowDataPacket[]>(
    `SELECT p.*, u.nombre_completo as creador_nombre, t.titulo as ticket_titulo, t.creador_id as ticket_creador_id
     FROM proyecto p
     JOIN usuario u ON p.creador_id = u.id
     LEFT JOIN ticket t ON p.ticket_origen_id = t.id
     WHERE p.id = ?`,
    [id]
  );
  if (projRow.length === 0) return null;
  const proyecto = projRow[0];

  // Auth Check
  if (currentUser.rol_nombre === 'TECNICO') {
    const [tasks] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM tarea_proyecto WHERE proyecto_id = ? AND responsable_id = ?`,
      [id, currentUser.id]
    );
    const [subtasks] = await pool.query<RowDataPacket[]>(
      `SELECT sp.id FROM subtarea_proyecto sp 
       JOIN tarea_proyecto tp ON sp.tarea_id = tp.id 
       WHERE tp.proyecto_id = ? AND sp.responsable_id = ?`,
      [id, currentUser.id]
    );
    if (proyecto.creador_id !== currentUser.id && tasks.length === 0 && subtasks.length === 0) {
      throw new Error('403: No tienes permisos para ver este proyecto.');
    }
  } else if (currentUser.rol_nombre === 'USUARIO') {
    if (proyecto.creador_id !== currentUser.id && proyecto.ticket_creador_id !== currentUser.id) {
      throw new Error('403: No tienes permisos para ver este proyecto.');
    }
  }

  // Obtener tareas complejas con subtareas
  const [tareas] = await pool.query<RowDataPacket[]>(
    `SELECT t.*, u.nombre_completo as responsable_nombre
     FROM tarea_proyecto t
     JOIN usuario u ON t.responsable_id = u.id
     WHERE t.proyecto_id = ?`,
    [id]
  );

  const tareasConSubtareas = [];
  for (const t of tareas) {
    const [subtareas] = await pool.query<RowDataPacket[]>(
      `SELECT s.*, u.nombre_completo as responsable_nombre
       FROM subtarea_proyecto s
       JOIN usuario u ON s.responsable_id = u.id
       WHERE s.tarea_id = ?`,
      [t.id]
    );

    const [tComentarios] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, u.nombre_completo as autor_nombre
       FROM proyecto_comentario c
       JOIN usuario u ON c.autor_id = u.id
       WHERE c.tarea_id = ? AND c.subtarea_id IS NULL
       ORDER BY c.created_at ASC`,
      [t.id]
    );

    const mappedSubtareas = [];
    for (const s of subtareas) {
      const [sComentarios] = await pool.query<RowDataPacket[]>(
        `SELECT c.*, u.nombre_completo as autor_nombre
         FROM proyecto_comentario c
         JOIN usuario u ON c.autor_id = u.id
         WHERE c.subtarea_id = ?
         ORDER BY c.created_at ASC`,
        [s.id]
      );
      const subSem = calcularSemaforo(s.fecha_fin, s.estado);
      mappedSubtareas.push({
        ...s,
        semaforo: subSem.semaforo,
        tiempo_restante: subSem.tiempo_restante,
        comentarios: sComentarios
      });
    }

    const semInfo = calcularSemaforo(t.fecha_fin, t.estado);

    tareasConSubtareas.push({
      ...t,
      semaforo: semInfo.semaforo,
      tiempo_restante: semInfo.tiempo_restante,
      comentarios: tComentarios,
      subtareas: mappedSubtareas
    });
  }

  // Obtener comentarios
  const [comentarios] = await pool.query<RowDataPacket[]>(
    `SELECT c.*, u.nombre_completo as autor_nombre, u.email as autor_email
     FROM proyecto_comentario c
     JOIN usuario u ON c.autor_id = u.id
     WHERE c.proyecto_id = ? AND c.tarea_id IS NULL AND c.subtarea_id IS NULL
     ORDER BY c.created_at ASC`,
    [id]
  );

  // Obtener archivos
  const [archivos] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, u.nombre_completo as autor_nombre
     FROM proyecto_archivo a
     JOIN usuario u ON a.autor_id = u.id
     WHERE a.proyecto_id = ? AND a.tarea_id IS NULL AND a.subtarea_id IS NULL`,
    [id]
  );

  // Obtener historial
  const [historial] = await pool.query<RowDataPacket[]>(
    `SELECT h.*, u.nombre_completo as usuario_nombre
     FROM proyecto_historial h
     JOIN usuario u ON h.usuario_id = u.id
     WHERE h.proyecto_id = ?
     ORDER BY h.created_at DESC`,
    [id]
  );

  return {
    ...proyecto,
    tareas: tareasConSubtareas,
    comentarios,
    archivos,
    historial
  };
};

export const createProyecto = async (data: { nombre: string; descripcion?: string; fecha_fin_estimada: string; tipo_proyecto?: string; ticket_origen_id?: number; miembros?: string }, currentUser: any) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO proyecto (nombre, descripcion, fecha_fin_estimada, estado, tipo_proyecto, creador_id, ticket_origen_id, miembros)
     VALUES (?, ?, ?, 'Sin Iniciar', ?, ?, ?, ?)`,
    [data.nombre, data.descripcion || null, data.fecha_fin_estimada, data.tipo_proyecto || 'Otro', currentUser.id, data.ticket_origen_id || null, data.miembros || null]
  );

  const proyectoId = result.insertId;
  await logProyectoHistorial(
    proyectoId,
    currentUser.id,
    `El usuario ${currentUser.nombre_completo} creó el proyecto "${data.nombre}" en estado "Sin Iniciar"`
  );

  // Notificar a los miembros asignados
  if (data.miembros) {
    try {
      const ids = typeof data.miembros === 'string' ? JSON.parse(data.miembros) : data.miembros;
      if (Array.isArray(ids)) {
        for (const mId of ids) {
          if (mId !== currentUser.id) {
            await notificarUsuario(
              mId,
              `Nuevo Proyecto Asignado: ${data.nombre}`,
              `Has sido asignado como miembro en el proyecto "${data.nombre}". Creado por ${currentUser.nombre_completo}. Fecha fin estimada: ${data.fecha_fin_estimada}.`
            );
          }
        }
      }
    } catch (e) {
      console.error('Error procesando notificaciones a miembros:', e);
    }
  }

  return getProyectoById(proyectoId, currentUser);
};

export const updateProyecto = async (id: number, data: { nombre?: string; descripcion?: string; fecha_fin_estimada?: string; estado?: string; tipo_proyecto?: string; miembros?: string }, currentUser: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [id]);
  if (existing.length === 0) return null;
  const proj = existing[0];

  // Permiso: creador o admin
  const isAdmin = currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR';
  const isCreator = proj.creador_id === currentUser.id;
  if (!isAdmin && !isCreator) {
    throw new Error('403: No tienes permisos para modificar este proyecto.');
  }

  // Modificaciones permitidas
  const nombre = data.nombre !== undefined ? data.nombre : proj.nombre;
  const descripcion = data.descripcion !== undefined ? data.descripcion : proj.descripcion;
  const fechaFin = data.fecha_fin_estimada !== undefined ? data.fecha_fin_estimada : proj.fecha_fin_estimada;
  const estado = data.estado !== undefined ? data.estado : proj.estado;
  const tipo = data.tipo_proyecto !== undefined ? data.tipo_proyecto : proj.tipo_proyecto;
  const miembros = data.miembros !== undefined ? data.miembros : proj.miembros;

  await pool.query(
    `UPDATE proyecto SET nombre = ?, descripcion = ?, fecha_fin_estimada = ?, estado = ?, tipo_proyecto = ?, miembros = ? WHERE id = ?`,
    [nombre, descripcion, fechaFin, estado, tipo, miembros, id]
  );

  let msg = `El usuario ${currentUser.nombre_completo} actualizó datos del proyecto:`;
  if (data.estado && data.estado !== proj.estado) msg += ` Cambió estado de "${proj.estado}" a "${data.estado}".`;
  if (data.fecha_fin_estimada && data.fecha_fin_estimada !== proj.fecha_fin_estimada) msg += ` Cambió fecha de fin a ${data.fecha_fin_estimada}.`;
  
  await logProyectoHistorial(id, currentUser.id, msg);
  await recalcularAvanceYEstados(id, currentUser.id);

  // Notificar nuevos miembros agregados
  if (data.miembros && data.miembros !== proj.miembros) {
    try {
      const oldIds = proj.miembros ? JSON.parse(proj.miembros) : [];
      const newIds = typeof data.miembros === 'string' ? JSON.parse(data.miembros) : data.miembros;
      if (Array.isArray(newIds)) {
        const agregados = newIds.filter((mId: number) => !oldIds.includes(mId) && mId !== currentUser.id);
        for (const mId of agregados) {
          await notificarUsuario(
            mId,
            `Nuevo Proyecto Asignado: ${nombre}`,
            `Has sido agregado como miembro en el proyecto "${nombre}".`
          );
        }
      }
    } catch (e) {
      console.error('Error notificando miembros actualizados:', e);
    }
  }

  return getProyectoById(id, currentUser);
};

export const deleteProyecto = async (id: number, currentUser: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [id]);
  if (existing.length === 0) return false;
  const proj = existing[0];

  const isAdmin = currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR';
  const isCreator = proj.creador_id === currentUser.id;
  if (!isAdmin && !isCreator) {
    throw new Error('403: No tienes permisos para eliminar este proyecto.');
  }

  await pool.query(`DELETE FROM proyecto WHERE id = ?`, [id]);
  return true;
};

// --- SERVICIOS DE TAREA ---
export const getTareaById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM tarea_proyecto WHERE id = ?`, [id]);
  if (rows.length === 0) return null;
  const tarea = rows[0];

  const [subtareas] = await pool.query<RowDataPacket[]>(`SELECT * FROM subtarea_proyecto WHERE tarea_id = ?`, [id]);
  const [comentarios] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto_comentario WHERE tarea_id = ? AND subtarea_id IS NULL`, [id]);
  const [archivos] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto_archivo WHERE tarea_id = ? AND subtarea_id IS NULL`, [id]);

  return {
    ...tarea,
    subtareas,
    comentarios,
    archivos
  };
};

export const createTarea = async (data: { proyecto_id: number; titulo: string; descripcion?: string; fecha_fin: string; responsable_id: number }, currentUser: any) => {
  const [projRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [data.proyecto_id]);
  if (projRow.length === 0) return null;
  const proj = projRow[0];

  const isAdmin = currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR';
  const isCreator = proj.creador_id === currentUser.id;
  const miembrosArr = proj.miembros ? JSON.parse(proj.miembros) : [];
  const isMember = Array.isArray(miembrosArr) && miembrosArr.includes(currentUser.id);
  if (!isAdmin && !isCreator && !isMember) {
    throw new Error('403: Solo los miembros asignados al proyecto, el creador o el administrador pueden agregar tareas.');
  }

  // Validación de fecha límite de la Tarea respecto al Proyecto
  const fechaFinProj = new Date(proj.fecha_fin_estimada);
  const fechaFinTarea = new Date(data.fecha_fin);
  if (fechaFinTarea > fechaFinProj) {
    throw new Error('400: La fecha de fin de la tarea no puede ser posterior a la fecha estimada del proyecto.');
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO tarea_proyecto (proyecto_id, titulo, descripcion, fecha_fin, estado, responsable_id)
     VALUES (?, ?, ?, ?, 'Sin Iniciar', ?)`,
    [data.proyecto_id, data.titulo, data.descripcion || null, data.fecha_fin, data.responsable_id]
  );

  const [respRow] = await pool.query<RowDataPacket[]>(`SELECT nombre_completo FROM usuario WHERE id = ?`, [data.responsable_id]);
  const respName = respRow[0]?.nombre_completo || 'Desconocido';

  await logProyectoHistorial(
    data.proyecto_id,
    currentUser.id,
    `El usuario ${currentUser.nombre_completo} creó la tarea "${data.titulo}" asignada a ${respName}`
  );

  await recalcularAvanceYEstados(data.proyecto_id, currentUser.id);

  // Notificaciones automáticas de Tarea
  if (data.responsable_id) {
    await notificarUsuario(
      data.responsable_id,
      `Nueva Tarea Asignada: ${data.titulo}`,
      `Te han asignado la tarea "${data.titulo}" en el proyecto "${proj.nombre}". Fecha límite: ${data.fecha_fin}.`
    );
  }
  if (proj.creador_id !== currentUser.id) {
    await notificarUsuario(
      proj.creador_id,
      `Nueva Tarea Creada: ${data.titulo}`,
      `El usuario ${currentUser.nombre_completo} creó la tarea "${data.titulo}" asignada a ${respName} en tu proyecto "${proj.nombre}".`
    );
  }

  return getTareaById(result.insertId);
};

export const updateTarea = async (id: number, data: { titulo?: string; descripcion?: string; fecha_fin?: string; estado?: string; avance_porcentaje?: number; responsable_id?: number }, currentUser: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM tarea_proyecto WHERE id = ?`, [id]);
  if (existing.length === 0) return null;
  const tarea = existing[0];

  const [projRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [tarea.proyecto_id]);
  const proj = projRow[0];

  const isAdmin = currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR';
  const isCreator = proj.creador_id === currentUser.id;
  const isResponsible = tarea.responsable_id === currentUser.id;

  if (!isAdmin && !isCreator && !isResponsible) {
    throw new Error('403: No tienes permisos para actualizar esta tarea.');
  }

  // Regla: Técnico asignado SOLO puede modificar estado y porcentaje
  if (!isAdmin && !isCreator && isResponsible) {
    if (data.titulo !== undefined || data.descripcion !== undefined || data.fecha_fin !== undefined || data.responsable_id !== undefined) {
      throw new Error('403: Como responsable técnico, solo puedes modificar el estado y el porcentaje de avance de la tarea.');
    }
  }

  // Validaciones de fecha si se modifica
  if (data.fecha_fin !== undefined) {
    const fechaFinProj = new Date(proj.fecha_fin_estimada);
    const fechaFinTarea = new Date(data.fecha_fin);
    if (fechaFinTarea > fechaFinProj) {
      throw new Error('400: La fecha de fin de la tarea no puede ser posterior a la fecha estimada del proyecto.');
    }
  }

  const titulo = data.titulo !== undefined ? data.titulo : tarea.titulo;
  const descripcion = data.descripcion !== undefined ? data.descripcion : tarea.descripcion;
  const fechaFin = data.fecha_fin !== undefined ? data.fecha_fin : tarea.fecha_fin;
  const responsableId = data.responsable_id !== undefined ? data.responsable_id : tarea.responsable_id;
  
  // Si tiene subtareas, ignorar el avance enviado manualmente por body y dejarlo en el cálculo
  const [subtareas] = await pool.query<RowDataPacket[]>(`SELECT id FROM subtarea_proyecto WHERE tarea_id = ?`, [id]);
  let avance = tarea.avance_porcentaje;
  if (subtareas.length === 0 && data.avance_porcentaje !== undefined) {
    avance = data.avance_porcentaje;
  }
  const estado = data.estado !== undefined ? data.estado : tarea.estado;

  await pool.query(
    `UPDATE tarea_proyecto SET titulo = ?, descripcion = ?, fecha_fin = ?, estado = ?, avance_porcentaje = ?, responsable_id = ? WHERE id = ?`,
    [titulo, descripcion, fechaFin, estado, avance, responsableId, id]
  );

  let msg = `El usuario ${currentUser.nombre_completo} actualizó la tarea "${tarea.titulo}":`;
  if (data.estado && data.estado !== tarea.estado) msg += ` Estado de "${tarea.estado}" a "${data.estado}".`;
  if (data.avance_porcentaje !== undefined && data.avance_porcentaje !== tarea.avance_porcentaje) msg += ` Avance a ${data.avance_porcentaje}%.`;
  
  await logProyectoHistorial(tarea.proyecto_id, currentUser.id, msg);
  await recalcularAvanceYEstados(tarea.proyecto_id, currentUser.id);

  // Notificar cambios de tarea
  if (data.responsable_id !== undefined && data.responsable_id !== tarea.responsable_id) {
    await notificarUsuario(
      data.responsable_id,
      `Tarea Asignada: ${titulo}`,
      `Te han reasignado la tarea "${titulo}" en el proyecto "${proj.nombre}".`
    );
  }

  if ((data.estado && data.estado !== tarea.estado) || (data.avance_porcentaje !== undefined && data.avance_porcentaje !== tarea.avance_porcentaje)) {
    const estadoAct = data.estado || tarea.estado;
    const avanceAct = data.avance_porcentaje !== undefined ? data.avance_porcentaje : tarea.avance_porcentaje;

    if (tarea.responsable_id !== currentUser.id) {
      await notificarUsuario(
        tarea.responsable_id,
        `Actualización de Tarea: ${titulo}`,
        `La tarea "${titulo}" en el proyecto "${proj.nombre}" fue actualizada por ${currentUser.nombre_completo}. Estado: "${estadoAct}" (${avanceAct}%).`
      );
    }
    if (proj.creador_id !== currentUser.id && proj.creador_id !== tarea.responsable_id) {
      await notificarUsuario(
        proj.creador_id,
        `Actualización de Tarea: ${titulo}`,
        `La tarea "${titulo}" en tu proyecto "${proj.nombre}" fue actualizada por ${currentUser.nombre_completo}. Estado: "${estadoAct}" (${avanceAct}%).`
      );
    }
  }

  return getTareaById(id);
};

export const deleteTarea = async (id: number, currentUser: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM tarea_proyecto WHERE id = ?`, [id]);
  if (existing.length === 0) return false;
  const tarea = existing[0];

  const [projRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [tarea.proyecto_id]);
  const proj = projRow[0];

  const isAdmin = currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR';
  const isCreator = proj.creador_id === currentUser.id;
  if (!isAdmin && !isCreator) {
    throw new Error('403: No tienes permisos para eliminar esta tarea.');
  }

  await pool.query(`DELETE FROM tarea_proyecto WHERE id = ?`, [id]);
  await logProyectoHistorial(tarea.proyecto_id, currentUser.id, `El usuario ${currentUser.nombre_completo} eliminó la tarea "${tarea.titulo}"`);
  await recalcularAvanceYEstados(tarea.proyecto_id, currentUser.id);
  return true;
};

// --- SERVICIOS DE SUBTAREA ---
export const getSubtareaById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM subtarea_proyecto WHERE id = ?`, [id]);
  if (rows.length === 0) return null;
  const sub = rows[0];

  const [comentarios] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto_comentario WHERE subtarea_id = ?`, [id]);
  const [archivos] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto_archivo WHERE subtarea_id = ?`, [id]);

  return {
    ...sub,
    comentarios,
    archivos
  };
};

export const createSubtarea = async (data: { tarea_id: number; titulo: string; descripcion?: string; fecha_fin: string; responsable_id: number }, currentUser: any) => {
  const [tareaRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM tarea_proyecto WHERE id = ?`, [data.tarea_id]);
  if (tareaRow.length === 0) return null;
  const tarea = tareaRow[0];

  const [projRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [tarea.proyecto_id]);
  const proj = projRow[0];

  const isAdmin = currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR';
  const isCreator = proj.creador_id === currentUser.id;
  const miembrosArr = proj.miembros ? JSON.parse(proj.miembros) : [];
  const isMember = Array.isArray(miembrosArr) && miembrosArr.includes(currentUser.id);
  const isTaskResponsible = tarea.responsable_id === currentUser.id;
  if (!isAdmin && !isCreator && !isMember && !isTaskResponsible) {
    throw new Error('403: Solo los miembros asignados al proyecto, el creador, el administrador o el responsable de la tarea pueden agregar subtareas.');
  }

  // Validación: Subtarea fecha_fin <= Tarea fecha_fin
  const fechaFinTarea = new Date(tarea.fecha_fin);
  const fechaFinSub = new Date(data.fecha_fin);
  if (fechaFinSub > fechaFinTarea) {
    throw new Error('400: La fecha de fin de la subtarea no puede ser posterior a la fecha de fin de la tarea padre.');
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO subtarea_proyecto (tarea_id, titulo, descripcion, fecha_fin, estado, responsable_id)
     VALUES (?, ?, ?, ?, 'Sin Iniciar', ?)`,
    [data.tarea_id, data.titulo, data.descripcion || null, data.fecha_fin, data.responsable_id]
  );

  const [respRow] = await pool.query<RowDataPacket[]>(`SELECT nombre_completo FROM usuario WHERE id = ?`, [data.responsable_id]);
  const respName = respRow[0]?.nombre_completo || 'Desconocido';

  await logProyectoHistorial(
    tarea.proyecto_id,
    currentUser.id,
    `El usuario ${currentUser.nombre_completo} creó la subtarea "${data.titulo}" en la tarea "${tarea.titulo}" asignada a ${respName}`
  );

  await recalcularAvanceYEstados(tarea.proyecto_id, currentUser.id);

  // Notificaciones automáticas de Subtarea
  if (data.responsable_id) {
    await notificarUsuario(
      data.responsable_id,
      `Nueva Subtarea Asignada: ${data.titulo}`,
      `Te han asignado la subtarea "${data.titulo}" dentro de la tarea "${tarea.titulo}" en el proyecto "${proj.nombre}". Fecha límite: ${data.fecha_fin}.`
    );
  }
  if (tarea.responsable_id !== currentUser.id && tarea.responsable_id !== data.responsable_id) {
    await notificarUsuario(
      tarea.responsable_id,
      `Nueva Subtarea Creada: ${data.titulo}`,
      `Se creó la subtarea "${data.titulo}" asignada a ${respName} en tu tarea "${tarea.titulo}" (Proyecto: "${proj.nombre}").`
    );
  }

  return getSubtareaById(result.insertId);
};

export const updateSubtarea = async (id: number, data: { titulo?: string; descripcion?: string; fecha_fin?: string; estado?: string; avance_porcentaje?: number; responsable_id?: number }, currentUser: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM subtarea_proyecto WHERE id = ?`, [id]);
  if (existing.length === 0) return null;
  const sub = existing[0];

  const [tareaRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM tarea_proyecto WHERE id = ?`, [sub.tarea_id]);
  const tarea = tareaRow[0];

  const [projRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [tarea.proyecto_id]);
  const proj = projRow[0];

  const isAdmin = currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR';
  const isCreator = proj.creador_id === currentUser.id;
  const isResponsible = sub.responsable_id === currentUser.id;

  if (!isAdmin && !isCreator && !isResponsible) {
    throw new Error('403: No tienes permisos para actualizar esta subtarea.');
  }

  // Regla: Técnico asignado SOLO puede modificar estado y porcentaje
  if (!isAdmin && !isCreator && isResponsible) {
    if (data.titulo !== undefined || data.descripcion !== undefined || data.fecha_fin !== undefined || data.responsable_id !== undefined) {
      throw new Error('403: Como responsable técnico, solo puedes modificar el estado y el porcentaje de avance de la subtarea.');
    }
  }

  // Validación de fecha si se modifica
  if (data.fecha_fin !== undefined) {
    const fechaFinTarea = new Date(tarea.fecha_fin);
    const fechaFinSub = new Date(data.fecha_fin);
    if (fechaFinSub > fechaFinTarea) {
      throw new Error('400: La fecha de fin de la subtarea no puede ser posterior a la fecha de fin de la tarea padre.');
    }
  }

  const titulo = data.titulo !== undefined ? data.titulo : sub.titulo;
  const descripcion = data.descripcion !== undefined ? data.descripcion : sub.descripcion;
  const fechaFin = data.fecha_fin !== undefined ? data.fecha_fin : sub.fecha_fin;
  const responsableId = data.responsable_id !== undefined ? data.responsable_id : sub.responsable_id;
  const avance = data.avance_porcentaje !== undefined ? data.avance_porcentaje : sub.avance_porcentaje;
  const estado = data.estado !== undefined ? data.estado : sub.estado;

  await pool.query(
    `UPDATE subtarea_proyecto SET titulo = ?, descripcion = ?, fecha_fin = ?, estado = ?, avance_porcentaje = ?, responsable_id = ? WHERE id = ?`,
    [titulo, descripcion, fechaFin, estado, avance, responsableId, id]
  );

  let msg = `El usuario ${currentUser.nombre_completo} actualizó la subtarea "${sub.titulo}" en tarea "${tarea.titulo}":`;
  if (data.estado && data.estado !== sub.estado) msg += ` Estado de "${sub.estado}" a "${data.estado}".`;
  if (data.avance_porcentaje !== undefined && data.avance_porcentaje !== sub.avance_porcentaje) msg += ` Avance a ${data.avance_porcentaje}%.`;
  
  await logProyectoHistorial(tarea.proyecto_id, currentUser.id, msg);
  await recalcularAvanceYEstados(tarea.proyecto_id, currentUser.id);

  // Notificar cambios de subtarea
  if (data.responsable_id !== undefined && data.responsable_id !== sub.responsable_id) {
    await notificarUsuario(
      data.responsable_id,
      `Subtarea Asignada: ${titulo}`,
      `Te han reasignado la subtarea "${titulo}" en la tarea "${tarea.titulo}" del proyecto "${proj.nombre}".`
    );
  }

  if ((data.estado && data.estado !== sub.estado) || (data.avance_porcentaje !== undefined && data.avance_porcentaje !== sub.avance_porcentaje)) {
    const estadoAct = data.estado || sub.estado;
    const avanceAct = data.avance_porcentaje !== undefined ? data.avance_porcentaje : sub.avance_porcentaje;

    if (sub.responsable_id !== currentUser.id) {
      await notificarUsuario(
        sub.responsable_id,
        `Actualización de Subtarea: ${titulo}`,
        `La subtarea "${titulo}" en el proyecto "${proj.nombre}" fue actualizada por ${currentUser.nombre_completo}. Estado: "${estadoAct}" (${avanceAct}%).`
      );
    }
    if (tarea.responsable_id !== currentUser.id && tarea.responsable_id !== sub.responsable_id) {
      await notificarUsuario(
        tarea.responsable_id,
        `Actualización de Subtarea: ${titulo}`,
        `La subtarea "${titulo}" en tu tarea "${tarea.titulo}" fue actualizada por ${currentUser.nombre_completo}. Estado: "${estadoAct}" (${avanceAct}%).`
      );
    }
  }

  return getSubtareaById(id);
};

export const deleteSubtarea = async (id: number, currentUser: any) => {
  const [existing] = await pool.query<RowDataPacket[]>(`SELECT * FROM subtarea_proyecto WHERE id = ?`, [id]);
  if (existing.length === 0) return false;
  const sub = existing[0];

  const [tareaRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM tarea_proyecto WHERE id = ?`, [sub.tarea_id]);
  const tarea = tareaRow[0];

  const [projRow] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto WHERE id = ?`, [tarea.proyecto_id]);
  const proj = projRow[0];

  const isAdmin = currentUser.rol_nombre === 'ADMIN' || currentUser.rol_nombre === 'SUPERVISOR';
  const isCreator = proj.creador_id === currentUser.id;
  if (!isAdmin && !isCreator) {
    throw new Error('403: No tienes permisos para eliminar esta subtarea.');
  }

  await pool.query(`DELETE FROM subtarea_proyecto WHERE id = ?`, [id]);
  await logProyectoHistorial(tarea.proyecto_id, currentUser.id, `El usuario ${currentUser.nombre_completo} eliminó la subtarea "${sub.titulo}"`);
  await recalcularAvanceYEstados(tarea.proyecto_id, currentUser.id);
  return true;
};

// --- BUZON / INBOX DE TAREAS Y SUBTAREAS ---
export const getInbox = async (usuarioId: number) => {
  // 1. Obtener Tareas directas asignadas
  const [tareas] = await pool.query<RowDataPacket[]>(
    `SELECT t.*, p.nombre as proyecto_nombre
     FROM tarea_proyecto t
     JOIN proyecto p ON t.proyecto_id = p.id
     WHERE t.responsable_id = ?`,
    [usuarioId]
  );

  // 2. Obtener Subtareas asignadas
  const [subtareas] = await pool.query<RowDataPacket[]>(
    `SELECT s.*, t.titulo as tarea_nombre, p.nombre as proyecto_nombre, t.proyecto_id
     FROM subtarea_proyecto s
     JOIN tarea_proyecto t ON s.tarea_id = t.id
     JOIN proyecto p ON t.proyecto_id = p.id
     WHERE s.responsable_id = ?`,
    [usuarioId]
  );

  const formatItem = (item: any, isSubtask = false) => {
    const semInfo = calcularSemaforo(item.fecha_fin, item.estado);
    return {
      id: item.id,
      tipo: isSubtask ? 'Subtarea' : 'Tarea',
      titulo: item.titulo,
      descripcion: item.descripcion,
      fecha_inicio: item.fecha_inicio,
      fecha_fin: item.fecha_fin,
      avance_porcentaje: item.avance_porcentaje,
      estado: item.estado,
      proyecto_nombre: item.proyecto_nombre,
      padre_nombre: isSubtask ? item.tarea_nombre : null,
      proyecto_id: isSubtask ? item.proyecto_id : item.proyecto_id,
      semaforo: semInfo.semaforo,
      tiempo_restante: semInfo.tiempo_restante
    };
  };

  const inboxUnificados = [
    ...tareas.map((t) => formatItem(t, false)),
    ...subtareas.map((s) => formatItem(s, true))
  ];

  // Separar en pestañas/categorías solicitadas
  return {
    todo: inboxUnificados,
    atrasados: inboxUnificados.filter((i) => i.semaforo === 'Rojo' && i.estado !== 'Finalizado'),
    en_proceso: inboxUnificados.filter((i) => i.estado === 'En Proceso'),
    sin_iniciar: inboxUnificados.filter((i) => i.estado === 'Sin Iniciar'),
    stand_by: inboxUnificados.filter((i) => i.estado === 'Stand By'),
    finalizados: inboxUnificados.filter((i) => i.estado === 'Finalizado')
  };
};

// --- COMENTARIOS Y MENCIONES ---
export const addComentario = async (data: { autor_id: number; proyecto_id?: number; tarea_id?: number; subtarea_id?: number; contenido: string }) => {
  // Si viene tarea o subtarea, deducir el proyecto_id para que quede ordenado
  let projId = data.proyecto_id || null;
  if (!projId && data.tarea_id) {
    const [tRow] = await pool.query<RowDataPacket[]>(`SELECT proyecto_id FROM tarea_proyecto WHERE id = ?`, [data.tarea_id]);
    if (tRow.length > 0) projId = tRow[0].proyecto_id;
  } else if (!projId && data.subtarea_id) {
    const [sRow] = await pool.query<RowDataPacket[]>(
      `SELECT t.proyecto_id 
       FROM subtarea_proyecto s
       JOIN tarea_proyecto t ON s.tarea_id = t.id 
       WHERE s.id = ?`,
      [data.subtarea_id]
    );
    if (sRow.length > 0) projId = sRow[0].proyecto_id;
  }

  // Permission checks: "comentarios de quien creo la tarea o subtarea y comentarios de a quien fue asignada"
  if (data.tarea_id) {
    const [tRow] = await pool.query<RowDataPacket[]>(
      `SELECT t.responsable_id, p.creador_id 
       FROM tarea_proyecto t 
       JOIN proyecto p ON t.proyecto_id = p.id 
       WHERE t.id = ?`,
      [data.tarea_id]
    );
    if (tRow.length > 0) {
      const task = tRow[0];
      const isCreator = task.creador_id === data.autor_id;
      const isResponsible = task.responsable_id === data.autor_id;
      const [userRow] = await pool.query<RowDataPacket[]>(`SELECT r.nombre as rol_nombre FROM usuario u JOIN rol r ON u.rol_id = r.id WHERE u.id = ?`, [data.autor_id]);
      const isAdmin = userRow[0]?.rol_nombre === 'ADMIN' || userRow[0]?.rol_nombre === 'SUPERVISOR';
      if (!isCreator && !isResponsible && !isAdmin) {
        throw new Error('403: Solo el creador de la tarea o el responsable asignado pueden agregar comentarios.');
      }
    }
  } else if (data.subtarea_id) {
    const [sRow] = await pool.query<RowDataPacket[]>(
      `SELECT s.responsable_id, p.creador_id 
       FROM subtarea_proyecto s 
       JOIN tarea_proyecto t ON s.tarea_id = t.id 
       JOIN proyecto p ON t.proyecto_id = p.id 
       WHERE s.id = ?`,
      [data.subtarea_id]
    );
    if (sRow.length > 0) {
      const sub = sRow[0];
      const isCreator = sub.creador_id === data.autor_id;
      const isResponsible = sub.responsable_id === data.autor_id;
      const [userRow] = await pool.query<RowDataPacket[]>(`SELECT r.nombre as rol_nombre FROM usuario u JOIN rol r ON u.rol_id = r.id WHERE u.id = ?`, [data.autor_id]);
      const isAdmin = userRow[0]?.rol_nombre === 'ADMIN' || userRow[0]?.rol_nombre === 'SUPERVISOR';
      if (!isCreator && !isResponsible && !isAdmin) {
        throw new Error('403: Solo el creador de la subtarea o el responsable asignado pueden agregar comentarios.');
      }
    }
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO proyecto_comentario (autor_id, proyecto_id, tarea_id, subtarea_id, contenido)
     VALUES (?, ?, ?, ?, ?)`,
    [data.autor_id, projId, data.tarea_id || null, data.subtarea_id || null, data.contenido]
  );

  // Obtener autor
  const [autorRow] = await pool.query<RowDataPacket[]>(`SELECT nombre_completo FROM usuario WHERE id = ?`, [data.autor_id]);
  const autorNombre = autorRow[0]?.nombre_completo || 'Un usuario';

  // Buscar menciones: buscar cadenas tipo @correo o @nombre (admite guiones bajos, guiones y puntos)
  const regexMenciones = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._-]+)/g;
  let matches = data.contenido.match(regexMenciones);
  if (matches) {
    for (const match of matches) {
      const limpio = match.substring(1); // Quitar el @
      // Buscar si coincide con email, prefijo de email, o nombre completo (incluso con guiones bajos)
      const [userRows] = await pool.query<RowDataPacket[]>(
        `SELECT id, email, nombre_completo FROM usuario 
         WHERE email = ? 
            OR SUBSTRING_INDEX(email, '@', 1) = ?
            OR nombre_completo LIKE ? 
            OR REPLACE(nombre_completo, ' ', '_') LIKE ?`,
        [limpio, limpio, `%${limpio}%`, `%${limpio}%`]
      );

      for (const u of userRows) {
        await enviarCorreo(
          u.email,
          `Mención en TISMO: @${u.nombre_completo}`,
          `Hola ${u.nombre_completo},\n\nEl usuario "${autorNombre}" te ha mencionado en un comentario:\n\n"${data.contenido}"\n\nSaludos,\nSistema TISMO`
        ).catch(console.error);

        // Internal Notification
        await crearNotificacion(
          u.id,
          `Mención de ${autorNombre}`,
          `Te mencionó en un comentario de proyecto: "${data.contenido}"`
        ).catch(console.error);
      }
    }
  }

  const [inserted] = await pool.query<RowDataPacket[]>(
    `SELECT c.*, u.nombre_completo as autor_nombre 
     FROM proyecto_comentario c 
     JOIN usuario u ON c.autor_id = u.id 
     WHERE c.id = ?`,
    [result.insertId]
  );
  return inserted[0];
};

// --- ARCHIVOS ---
export const addArchivo = async (data: { nombre_original: string; nombre_guardado: string; mimetype: string; tamano_bytes: number; autor_id: number; proyecto_id?: number; tarea_id?: number; subtarea_id?: number }) => {
  let projId = data.proyecto_id || null;
  if (!projId && data.tarea_id) {
    const [tRow] = await pool.query<RowDataPacket[]>(`SELECT proyecto_id FROM tarea_proyecto WHERE id = ?`, [data.tarea_id]);
    if (tRow.length > 0) projId = tRow[0].proyecto_id;
  } else if (!projId && data.subtarea_id) {
    const [sRow] = await pool.query<RowDataPacket[]>(
      `SELECT t.proyecto_id 
       FROM subtarea_proyecto s
       JOIN tarea_proyecto t ON s.tarea_id = t.id 
       WHERE s.id = ?`,
      [data.subtarea_id]
    );
    if (sRow.length > 0) projId = sRow[0].proyecto_id;
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO proyecto_archivo (nombre_original, nombre_guardado, mimetype, tamano_bytes, autor_id, proyecto_id, tarea_id, subtarea_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.nombre_original, data.nombre_guardado, data.mimetype, data.tamano_bytes, data.autor_id, projId, data.tarea_id || null, data.subtarea_id || null]
  );

  const [inserted] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, u.nombre_completo as autor_nombre 
     FROM proyecto_archivo a
     JOIN usuario u ON a.autor_id = u.id
     WHERE a.id = ?`,
    [result.insertId]
  );
  return inserted[0];
};

export const getArchivoById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM proyecto_archivo WHERE id = ?`, [id]);
  return rows[0] || null;
};

// --- ESCALAR TICKET A PROYECTO ---
export const escalarTicketAProyecto = async (ticketId: number, data: { nombre: string; descripcion?: string; fecha_fin_estimada: string; tipo_proyecto?: string }, currentUser: any) => {
  const [ticketRows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ticket WHERE id = ?`, [ticketId]);
  if (ticketRows.length === 0) return null;
  const ticket = ticketRows[0];

  // Crear proyecto enlazado
  const proj = await createProyecto({
    nombre: data.nombre,
    descripcion: data.descripcion || ticket.descripcion,
    fecha_fin_estimada: data.fecha_fin_estimada,
    tipo_proyecto: data.tipo_proyecto || 'Soporte Complejo',
    ticket_origen_id: ticketId
  }, currentUser);

  // Actualizar ticket original a "Escalado a Proyecto"
  await pool.query(
    `UPDATE ticket SET estado = 'Escalado a Proyecto', observaciones = ? WHERE id = ?`,
    [`Escalado a Proyecto por ${currentUser.nombre_completo} el ${new Date().toLocaleString()}`, ticketId]
  );

  return proj;
};

// --- REPORTES SEMANALES DE CORREO ---
export const enviarReporteSemanalTecnicos = async () => {
  const [tecnicos] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.email, u.nombre_completo 
     FROM usuario u
     JOIN rol r ON u.rol_id = r.id
     WHERE r.nombre IN ('TECNICO', 'SUPERVISOR') AND u.is_active = TRUE`
  );

  for (const tech of tecnicos) {
    const inbox = await getInbox(tech.id);
    const tareasPendientes = inbox.todo.filter((i) => i.estado !== 'Finalizado');

    if (tareasPendientes.length === 0) continue;

    let tableRows = '';
    for (const t of tareasPendientes) {
      const color = t.semaforo === 'Rojo' ? '#FFC7CE' : t.semaforo === 'Amarillo' ? '#FFEB9C' : '#C6EFCE';
      const textColor = t.semaforo === 'Rojo' ? '#9C0006' : t.semaforo === 'Amarillo' ? '#9C6500' : '#006100';
      
      tableRows += `
        <tr>
          <td style="border:1px solid #ddd; padding:8px;">${t.proyecto_nombre}</td>
          <td style="border:1px solid #ddd; padding:8px;"><b>${t.titulo}</b> (${t.tipo})</td>
          <td style="border:1px solid #ddd; padding:8px;">${t.estado}</td>
          <td style="border:1px solid #ddd; padding:8px;">${t.avance_porcentaje}%</td>
          <td style="border:1px solid #ddd; padding:8px;">${new Date(t.fecha_fin).toLocaleDateString()}</td>
          <td style="border:1px solid #ddd; padding:8px; background-color:${color}; color:${textColor}; font-weight:bold;">${t.tiempo_restante}</td>
        </tr>
      `;
    }

    const html = `
      <h2>Hola ${tech.nombre_completo},</h2>
      <p>Este es tu reporte semanal de avances y tareas pendientes asignadas en el Módulo de Proyectos:</p>
      <table style="border-collapse:collapse; width:100%; font-family:sans-serif;">
        <thead>
          <tr style="background-color:#1F4E79; color:white;">
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Proyecto</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Tarea / Subtarea</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Estado</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Avance</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Fecha Fin</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Semaforización</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <p style="margin-top:20px;">Por favor, procura actualizar el avance y finalizar a tiempo tus pendientes. ¡Éxitos!</p>
      <br/>
      <small>Enviado automáticamente por TISMO System</small>
    `;

    await enviarCorreo(tech.email, `Reporte Semanal de Pendientes: ${tech.nombre_completo}`, html).catch(console.error);
    
    // Internal Notification
    await crearNotificacion(
      tech.id,
      `Reporte Semanal de Pendientes`,
      `Tienes ${tareasPendientes.length} tareas/subtareas activas en Proyectos TI esta semana.`
    ).catch(console.error);
  }
  return true;
};

export const enviarReporteSemanalAdmin = async () => {
  const [admins] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.email 
     FROM usuario u 
     JOIN rol r ON u.rol_id = r.id 
     WHERE r.nombre IN ('ADMIN', 'SUPERVISOR') AND u.is_active = TRUE`
  );

  const [tecnicos] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.nombre_completo 
     FROM usuario u
     JOIN rol r ON u.rol_id = r.id
     WHERE r.nombre IN ('TECNICO', 'SUPERVISOR') AND u.is_active = TRUE`
  );

  let techReportHtml = '';

  for (const tech of tecnicos) {
    const inbox = await getInbox(tech.id);
    const total = inbox.todo.length;
    const finalizadas = inbox.finalizados.length;
    const pendientes = inbox.todo.filter((i) => i.estado !== 'Finalizado').length;
    const atrasadas = inbox.todo.filter((i) => i.semaforo === 'Rojo' && i.estado !== 'Finalizado').length;

    techReportHtml += `
      <tr style="border-bottom:1px solid #ddd;">
        <td style="padding:10px;"><b>${tech.nombre_completo}</b></td>
        <td style="padding:10px; text-align:center;">${total}</td>
        <td style="padding:10px; text-align:center; color:green; font-weight:bold;">${finalizadas}</td>
        <td style="padding:10px; text-align:center; color:orange;">${pendientes}</td>
        <td style="padding:10px; text-align:center; color:red; font-weight:bold;">${atrasadas}</td>
      </tr>
    `;
  }

  const html = `
    <h2>Reporte de Avances Semanales - TISMO</h2>
    <p>Estimado Administrador, a continuación se detalla el estado actual de tareas/subtareas del personal técnico:</p>
    <table style="border-collapse:collapse; width:100%; font-family:sans-serif; border:1px solid #ddd;">
      <thead>
        <tr style="background-color:#1F4E79; color:white;">
          <th style="padding:10px; text-align:left;">Técnico</th>
          <th style="padding:10px; text-align:center;">Total Asignadas</th>
          <th style="padding:10px; text-align:center;">Finalizadas (100%)</th>
          <th style="padding:10px; text-align:center;">En Progreso</th>
          <th style="padding:10px; text-align:center;">Atrasadas (Alerta 🔴)</th>
        </tr>
      </thead>
      <tbody>
        ${techReportHtml}
      </tbody>
    </table>
    <p style="margin-top:20px;">Puede ingresar al panel web de administración para revisar el desglose y bitácora de cada proyecto.</p>
    <br/>
    <small>Enviado automáticamente por TISMO</small>
  `;

  for (const adm of admins) {
    await enviarCorreo(adm.email, `Reporte General de Avance de Técnicos`, html).catch(console.error);

    // Internal Notification
    await crearNotificacion(
      adm.id,
      `Reporte de Avances Semanales`,
      `El reporte semanal consolidado de avances del personal técnico ha sido enviado a tu correo.`
    ).catch(console.error);
  }

  return true;
};
