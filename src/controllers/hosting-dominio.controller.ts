import { Request, Response } from 'express';
import * as hostingDominioService from '../services/hosting-dominio.service';

export const getHostingDominiosController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tipo, empresa_id, search } = req.query;
    const currentUser = (req as any).currentUser || (req as any).user;

    const tipoFilter = tipo === 'HOSTING' || tipo === 'DOMINIO' ? tipo : undefined;
    const empresaIdFilter = empresa_id ? Number(empresa_id) : undefined;
    const searchFilter = search ? String(search) : undefined;

    const data = await hostingDominioService.getHostingDominios(
      currentUser,
      tipoFilter,
      empresaIdFilter,
      searchFilter
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error in getHostingDominiosController:', error);
    res.status(500).json({ detail: 'Error al obtener hostings y dominios', error: error.message });
  }
};

export const getHostingDominioByIdController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const item = await hostingDominioService.getHostingDominioById(Number(id));
    if (!item) {
      res.status(404).json({ detail: 'Registro no encontrado' });
      return;
    }
    res.json(item);
  } catch (error: any) {
    console.error('Error in getHostingDominioByIdController:', error);
    res.status(500).json({ detail: 'Error al obtener el registro', error: error.message });
  }
};

export const createHostingDominioController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tipo, nombre, pagado_hasta } = req.body;
    if (!tipo || !nombre || !pagado_hasta) {
      res.status(400).json({ detail: 'Tipo, nombre y fecha "pagado hasta" son campos requeridos.' });
      return;
    }

    const currentUser = (req as any).user;
    const creadorId = currentUser ? currentUser.id : null;

    const newItem = await hostingDominioService.createHostingDominio(req.body, creadorId);
    res.status(201).json(newItem);
  } catch (error: any) {
    console.error('Error in createHostingDominioController:', error);
    res.status(500).json({ detail: 'Error al crear el registro de hosting/dominio', error: error.message });
  }
};

export const updateHostingDominioController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updatedItem = await hostingDominioService.updateHostingDominio(Number(id), req.body);
    if (!updatedItem) {
      res.status(404).json({ detail: 'Registro no encontrado' });
      return;
    }
    res.json(updatedItem);
  } catch (error: any) {
    console.error('Error in updateHostingDominioController:', error);
    res.status(500).json({ detail: 'Error al actualizar el registro', error: error.message });
  }
};

export const renovarPagadoHastaController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { pagado_hasta } = req.body;

    if (!pagado_hasta) {
      res.status(400).json({ detail: 'Debe especificar la nueva fecha "pagado_hasta"' });
      return;
    }

    const renewedItem = await hostingDominioService.renovarPagadoHasta(Number(id), pagado_hasta);
    res.json(renewedItem);
  } catch (error: any) {
    console.error('Error in renovarPagadoHastaController:', error);
    res.status(500).json({ detail: 'Error al renovar la fecha de pagado hasta', error: error.message });
  }
};

export const deleteHostingDominioController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await hostingDominioService.deleteHostingDominio(Number(id));
    res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteHostingDominioController:', error);
    res.status(500).json({ detail: 'Error al eliminar el registro', error: error.message });
  }
};
