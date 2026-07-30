import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as service from '../services/credencial.service';
import { generarActaCredenciales } from '../utils/pdf.credenciales';

export const getEntregas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const result = await service.getEntregas(page, limit, search, req.currentUser);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener entregas', error: error.message });
  }
};

export const getEntregaById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const entrega = await service.getEntregaById(id, req.currentUser);
    if (!entrega) {
      res.status(404).json({ detail: 'Entrega no encontrada' });
      return;
    }
    res.json(entrega);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al obtener entrega', error: error.message });
  }
};

export const getNextSecuencial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const empresaId = parseInt(req.query.empresa_id as string);
    const fechaEntrega = req.query.fecha_entrega as string;
    
    if (!empresaId || !fechaEntrega) {
      res.status(400).json({ detail: 'Faltan parámetros empresa_id o fecha_entrega' });
      return;
    }
    
    const secuencial = await service.getNextSecuencial(empresaId, fechaEntrega);
    res.json({ secuencial });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al generar secuencial', error: error.message });
  }
};

export const createEntrega = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { 
      empresa_id, 
      fecha_entrega, 
      tipo, 
      sitio, 
      usuario, 
      clave, 
      recibido_por_nombre, 
      recibido_por_area,
      correo_receptor
    } = req.body;

    if (!empresa_id || !fecha_entrega || !sitio || !usuario || !clave || !recibido_por_nombre || !recibido_por_area) {
      res.status(400).json({ detail: 'Faltan campos obligatorios para registrar la entrega' });
      return;
    }

    const payload = {
      empresa_id: parseInt(empresa_id),
      fecha_entrega,
      tipo: tipo || 'Usuario y Clave',
      sitio,
      usuario,
      clave,
      entregado_por_id: req.currentUser.id, // Current logged in user
      recibido_por_nombre,
      recibido_por_area,
      correo_receptor: correo_receptor || null
    };

    const entrega = await service.createEntrega(payload);
    res.status(201).json(entrega);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al registrar entrega', error: error.message });
  }
};

export const deleteEntrega = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await service.deleteEntrega(id);
    if (!deleted) {
      res.status(404).json({ detail: 'Entrega no encontrada' });
      return;
    }
    res.json({ message: 'Entrega de credenciales eliminada correctamente' });
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al eliminar entrega', error: error.message });
  }
};

export const descargarPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const version = (req.query.version as 'usuario' | 'ti') || 'usuario';
    
    if (version !== 'usuario' && version !== 'ti') {
      res.status(400).json({ detail: 'Versión de PDF no válida (debe ser usuario o ti)' });
      return;
    }

    const entrega = await service.getEntregaById(id);
    if (!entrega) {
      res.status(404).json({ detail: 'Entrega no encontrada' });
      return;
    }

    const pdfBuffer = await generarActaCredenciales(entrega, version);
    const versionLabel = version === 'ti' ? 'TI' : 'Usuario';
    const nombreArchivo = `Acta_Credenciales_${entrega.secuencial}_${versionLabel}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ detail: 'Error al generar PDF de entrega', error: error.message });
  }
};
