import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { pool } from '../db/connection';
import { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

export const exportTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, tecnico_id } = req.query;
    let query = `
      SELECT t.id, t.titulo, t.estado, t.prioridad, t.created_at, t.updated_at,
             c.nombre_completo as creador, a.nombre_completo as tecnico
      FROM ticket t
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

    if (req.currentUser.rol_nombre === 'ADMIN') {
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

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de Tickets');

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
        created_at: new Date(t.created_at).toLocaleString(),
        updated_at: t.updated_at ? new Date(t.updated_at).toLocaleString() : '',
        creador: t.creador || 'N/A',
        tecnico: t.tecnico || 'Sin asignar'
      });
    }

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment('reporte_tickets.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};

export const exportProyectos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, tecnico_id } = req.query;
    let query = `
      SELECT p.id, p.nombre, p.estado, p.tipo_proyecto, p.avance_porcentaje, p.created_at, p.fecha_fin_estimada,
             c.nombre_completo as creador
      FROM proyecto p
      LEFT JOIN usuario c ON p.creador_id = c.id
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

    if (req.currentUser.rol_nombre === 'ADMIN') {
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

    const [proyectos] = await pool.query<RowDataPacket[]>(query, params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de Proyectos');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Nombre', key: 'nombre', width: 40 },
      { header: 'Estado', key: 'estado', width: 15 },
      { header: 'Tipo Proyecto', key: 'tipo', width: 20 },
      { header: 'Avance (%)', key: 'avance', width: 12 },
      { header: 'Fecha Creación', key: 'created_at', width: 20 },
      { header: 'Fecha Fin Estimada', key: 'fecha_fin', width: 20 },
      { header: 'Creador', key: 'creador', width: 25 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };

    for (const p of proyectos) {
      worksheet.addRow({
        id: p.id,
        nombre: p.nombre,
        estado: p.estado,
        tipo: p.tipo_proyecto,
        avance: p.avance_porcentaje,
        created_at: new Date(p.created_at).toLocaleString(),
        fecha_fin: new Date(p.fecha_fin_estimada).toLocaleDateString(),
        creador: p.creador || 'N/A'
      });
    }

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment('reporte_proyectos.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    res.status(500).json({ detail: error.message });
  }
};
