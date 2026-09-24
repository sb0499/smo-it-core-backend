import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { 
  getDatosReporteDiario, 
  generarExcelReporteDiario, 
  enviarReporteDiarioTicketsPorCorreo 
} from '../services/reporte-diario-tickets.service';

export const getPreviewReporteDiario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.currentUser.rol_nombre)) {
      res.status(403).json({ detail: 'Solo los Administradores y Supervisores pueden acceder a los reportes diarios consolidados.' });
      return;
    }

    const fecha = req.query.fecha ? String(req.query.fecha) : undefined;
    const datos = await getDatosReporteDiario(fecha);
    res.json(datos);
  } catch (error: any) {
    console.error('Error al obtener vista previa del reporte diario:', error);
    res.status(500).json({ detail: error.message || 'Error al obtener vista previa del reporte diario' });
  }
};

export const descargarReporteDiarioExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.currentUser.rol_nombre)) {
      res.status(403).json({ detail: 'Solo los Administradores y Supervisores pueden descargar el reporte diario.' });
      return;
    }

    const fecha = req.query.fecha ? String(req.query.fecha) : undefined;
    const datos = await getDatosReporteDiario(fecha);
    const workbook = await generarExcelReporteDiario(datos);

    const filename = `Reporte_Diario_Soporte_${datos.fecha}.xlsx`;
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('Error al descargar reporte diario en Excel:', error);
    res.status(500).json({ detail: error.message || 'Error al generar archivo Excel del reporte diario' });
  }
};

export const enviarReporteDiarioEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.currentUser.rol_nombre)) {
      res.status(403).json({ detail: 'Solo los Administradores y Supervisores pueden solicitar el envío del reporte diario.' });
      return;
    }

    const { fecha } = req.body;
    const resultado = await enviarReporteDiarioTicketsPorCorreo(fecha);

    res.json({
      message: `Reporte diario enviado exitosamente a ${resultado.enviados} administradores y supervisores.`,
      destinatarios: resultado.destinatarios
    });
  } catch (error: any) {
    console.error('Error al enviar reporte diario por correo:', error);
    res.status(500).json({ detail: error.message || 'Error al enviar reporte diario por correo' });
  }
};
