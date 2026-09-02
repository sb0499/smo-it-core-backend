import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { getEmpresaAbbr } from '../services/credencial.service';

function renderActaHeaderLogos(
  doc: InstanceType<typeof PDFDocument>,
  empresaNombre?: string,
  options: { leftX?: number; rightX?: number; topY?: number; logoWidth?: number } = {}
) {
  const leftX = options.leftX ?? 40;
  const rightX = options.rightX ?? 395;
  const topY = options.topY ?? 25;
  const logoWidth = options.logoWidth ?? 150;

  // 1. Esquina superior derecha: logo-shopping.png (fijo)
  const shoppingLogoPath = path.join(__dirname, '..', 'assets', 'logo-shopping.png');
  if (fs.existsSync(shoppingLogoPath)) {
    doc.image(shoppingLogoPath, rightX, topY, { width: logoWidth });
  }

  // 2. Esquina superior izquierda: logo-nombresede.png si existe (si no existe se deja vacío)
  const cleanSedeName = String(empresaNombre || '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');

  const isShoppingMain = !cleanSedeName || cleanSedeName === 'shopping' || cleanSedeName === 'shopping-managements';
  const specificLogoPath = path.join(__dirname, '..', 'assets', `logo-${cleanSedeName}.png`);

  if (!isShoppingMain && fs.existsSync(specificLogoPath)) {
    doc.image(specificLogoPath, leftX, topY, { fit: [120, 65] });
  }

  // Desplazar Y debajo de los logos para evitar que el texto o fecha se solapen con las imágenes
  doc.y = 105;
}

export const generarActaMovimiento = (movimiento: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Encabezado institucional con logos
    renderActaHeaderLogos(doc, movimiento.empresa_nombre || movimiento.sede_nombre, { leftX: 50, rightX: 425, topY: 30, logoWidth: 120 });

    // Número de acta y fecha
    doc.moveUp(3);
    const numeroActa = movimiento.id.toString().padStart(5, '0');
    doc.fillColor('#3b82f6').fontSize(12).font('Helvetica-Bold').text(`ACTA Nº ${numeroActa}`, { align: 'right' });
    doc.fillColor('#6b7280').fontSize(11).font('Helvetica').text(`Fecha: ${new Date(movimiento.fecha).toLocaleDateString('es-EC')}`, { align: 'right' });
    
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#3b82f6').lineWidth(2).stroke();
    doc.moveDown(2);

    // Título del documento
    doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
       .text('ACTA DE ENTREGA - RECEPCIÓN DE EQUIPOS Y ACTIVOS', { align: 'center' });
    doc.moveDown(1.5);

    // Párrafo descriptivo
    doc.fillColor('#374151').fontSize(11).font('Helvetica')
       .text('Por medio del presente documento, se deja constancia de la entrega física y configuración del activo detallado a continuación, bajo las condiciones y observaciones registradas. El receptor asume la responsabilidad del cuidado y uso exclusivo institucional del bien.', { align: 'justify', lineGap: 4 });
    doc.moveDown(2);

    // Recuadro de detalles del activo
    const tableTop = doc.y;
    doc.rect(50, tableTop, 495, 120).fillColor('#f3f4f6').fill();
    
    doc.fillColor('#1f2937').fontSize(12).font('Helvetica-Bold')
       .text('DETALLES DEL ACTIVO', 65, tableTop + 15);

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151').text('CÓDIGO DE ACTIVO:', 65, tableTop + 40);
    doc.font('Helvetica').fillColor('#2563eb').text(movimiento.activo_codigo, 180, tableTop + 40);

    doc.font('Helvetica-Bold').fillColor('#374151').text('TIPO MOVIMIENTO:', 300, tableTop + 40);
    doc.font('Helvetica').text(movimiento.tipo, 415, tableTop + 40);

    doc.font('Helvetica-Bold').text('MARCA Y MODELO:', 65, tableTop + 65);
    doc.font('Helvetica').text(`${movimiento.activo_marca} ${movimiento.activo_modelo}`, 180, tableTop + 65);

    doc.font('Helvetica-Bold').text('AUTORIZADO POR:', 300, tableTop + 65);
    doc.font('Helvetica').text(movimiento.usuario_nombre, 415, tableTop + 65);

    // Observaciones dentro del recuadro
    doc.moveTo(65, tableTop + 85).lineTo(530, tableTop + 85).strokeColor('#d1d5db').lineWidth(1).dash(2, {space: 2}).stroke();
    doc.undash();
    doc.font('Helvetica-Bold').text('OBSERVACIONES:', 65, tableTop + 95);
    doc.font('Helvetica-Oblique').fillColor('#4b5563')
       .text(movimiento.observaciones || 'Sin observaciones específicas. Se entrega en perfecto estado funcional.', 165, tableTop + 95, { width: 360, height: 20, ellipsis: true });

    // Firmas
    const firmaY = tableTop + 180;
    doc.moveTo(50, firmaY - 30).lineTo(545, firmaY - 30).strokeColor('#e5e7eb').lineWidth(1).stroke();

    // Emisor
    doc.fillColor('#6b7280').fontSize(10).font('Helvetica-Bold')
       .text('ENTREGADO / AUTORIZADO POR', 50, firmaY, { width: 220, align: 'center' });
    
    doc.moveTo(70, firmaY + 50).lineTo(250, firmaY + 50).strokeColor('#9ca3af').lineWidth(1).stroke();
    
    doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold')
       .text(movimiento.usuario_nombre, 50, firmaY + 60, { width: 220, align: 'center' });
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
       .text('Soporte TI SMO', 50, firmaY + 75, { width: 220, align: 'center' });

    // Receptor
    doc.fillColor('#6b7280').fontSize(10).font('Helvetica-Bold')
       .text('RECIBIDO CONFORME POR', 325, firmaY, { width: 220, align: 'center' });
    
    doc.moveTo(345, firmaY + 50).lineTo(525, firmaY + 50).strokeColor('#9ca3af').lineWidth(1).stroke();
    
    const receptorNombre = movimiento.persona_recibe_nombre || 'Bodega Central';
    const receptorCedula = movimiento.persona_recibe_cedula ? `C.I. ${movimiento.persona_recibe_cedula}` : 'Soporte Inventario';

    doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold')
       .text(receptorNombre, 325, firmaY + 60, { width: 220, align: 'center' });
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
       .text(receptorCedula, 325, firmaY + 75, { width: 220, align: 'center' });

    doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
       .text('Documento generado automáticamente por Soporte TI SMO', 50, 750, { align: 'center' });

    doc.end();
  });
};

export const generarActaIngreso = (ingreso: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header section with logos
    renderActaHeaderLogos(doc, ingreso.empresa_nombre, { leftX: 30, rightX: 440, topY: 20, logoWidth: 110 });

    // Green Banner Box "INGRESO DE BODEGA"
    const bannerY = 96;
    doc.roundedRect(210, bannerY, 175, 26, 4).fillAndStroke('#2d572c', '#1b3b1b');
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text('INGRESO DE BODEGA', 210, bannerY + 7, { width: 175, align: 'center' });

    // Subheader: Código de Ingreso
    const subheaderTop = bannerY + 34;
    doc.moveTo(30, subheaderTop).lineTo(565, subheaderTop).lineWidth(1).strokeColor('#000000').stroke();
    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text(`Código de Ingreso: ${ingreso.codigo_ingreso}`, 35, subheaderTop + 6);

    const boxY = subheaderTop + 22;
    doc.moveTo(30, boxY).lineTo(565, boxY).lineWidth(1).strokeColor('#000000').stroke();

    // Metadata Grid Box (3 rows)
    const rowHeight = 32;

    // Row 1 divider
    doc.moveTo(30, boxY + rowHeight).lineTo(565, boxY + rowHeight).strokeColor('#000000').lineWidth(1).stroke();
    // Row 2 divider
    doc.moveTo(30, boxY + rowHeight * 2).lineTo(565, boxY + rowHeight * 2).strokeColor('#000000').lineWidth(1).stroke();
    // Row 3 divider
    doc.moveTo(30, boxY + rowHeight * 3).lineTo(565, boxY + rowHeight * 3).strokeColor('#000000').lineWidth(1).stroke();

    // Outer border around metadata grid & subheader box
    doc.rect(30, subheaderTop, 535, 22 + rowHeight * 3).lineWidth(1).strokeColor('#000000').stroke();

    // Vertical dividers for 3 columns in rows 1 and 2
    const col1X = 30;
    const col2X = 208;
    const col3X = 386;

    doc.moveTo(col2X, boxY).lineTo(col2X, boxY + rowHeight * 2).strokeColor('#000000').lineWidth(1).stroke();
    doc.moveTo(col3X, boxY).lineTo(col3X, boxY + rowHeight * 2).strokeColor('#000000').lineWidth(1).stroke();

    // Vertical divider in row 3 (after Fecha Ingreso)
    const colDescX = 208;
    doc.moveTo(colDescX, boxY + rowHeight * 2).lineTo(colDescX, boxY + rowHeight * 3).strokeColor('#000000').lineWidth(1).stroke();

    // Helper for dates
    const formatDate = (dateStr?: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toISOString().split('T')[0];
    };

    // Cell Row 1
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');
    doc.text('Empresa:', col1X, boxY + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(ingreso.empresa_nombre || '', col1X, boxY + 16, { width: 178, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5).text('Proveedor:', col2X, boxY + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(ingreso.proveedor_nombre || 'N/A', col2X, boxY + 16, { width: 178, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5).text('Nro. Orden de Compra:', col3X, boxY + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(ingreso.nro_orden_compra || 'N/A', col3X, boxY + 16, { width: 178, align: 'center' });

    // Cell Row 2
    const r2Y = boxY + rowHeight;
    doc.font('Helvetica-Bold').fontSize(8.5).text('Nro. de Factura:', col1X, r2Y + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(ingreso.nro_factura || '', col1X, r2Y + 16, { width: 178, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5).text('Nro. Solicitud de Pago:', col2X, r2Y + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(ingreso.nro_solicitud_pago || '', col2X, r2Y + 16, { width: 178, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5).text('Fecha de Compra:', col3X, r2Y + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(formatDate(ingreso.fecha_compra), col3X, r2Y + 16, { width: 178, align: 'center' });

    // Cell Row 3
    const r3Y = boxY + rowHeight * 2;
    doc.font('Helvetica-Bold').fontSize(8.5).text('Fecha de Ingreso:', col1X, r3Y + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(formatDate(ingreso.fecha_ingreso), col1X, r3Y + 16, { width: 178, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5).text('Descripción:', colDescX + 8, r3Y + 4);
    doc.font('Helvetica').fontSize(9).text(ingreso.descripcion || '', colDescX + 8, r3Y + 16, { width: 340, ellipsis: true });

    // Assets Table Section
    let tableStartY = boxY + rowHeight * 3 + 20;

    // Header row
    doc.rect(30, tableStartY, 535, 22).fillAndStroke('#e5e7eb', '#000000');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');

    // Column boundaries
    const tCol1 = 30;   // TIPO (width 130)
    const tCol2 = 160;  // MARCA (width 130)
    const tCol3 = 290;  // MODELO (width 130)
    const tCol4 = 420;  // SERIE (width 145)

    doc.text('TIPO', tCol1, tableStartY + 6, { width: 130, align: 'center' });
    doc.text('MARCA', tCol2, tableStartY + 6, { width: 130, align: 'center' });
    doc.text('MODELO', tCol3, tableStartY + 6, { width: 130, align: 'center' });
    doc.text('SERIE', tCol4, tableStartY + 6, { width: 145, align: 'center' });

    // Table Column borders for Header
    doc.moveTo(tCol2, tableStartY).lineTo(tCol2, tableStartY + 22).stroke();
    doc.moveTo(tCol3, tableStartY).lineTo(tCol3, tableStartY + 22).stroke();
    doc.moveTo(tCol4, tableStartY).lineTo(tCol4, tableStartY + 22).stroke();

    let currentY = tableStartY + 22;

    const activos = ingreso.activos || [];
    activos.forEach((activo: any) => {
      const rowH = 22;
      doc.rect(30, currentY, 535, rowH).strokeColor('#000000').stroke();

      doc.moveTo(tCol2, currentY).lineTo(tCol2, currentY + rowH).stroke();
      doc.moveTo(tCol3, currentY).lineTo(tCol3, currentY + rowH).stroke();
      doc.moveTo(tCol4, currentY).lineTo(tCol4, currentY + rowH).stroke();

      doc.font('Helvetica').fontSize(9).fillColor('#000000');
      doc.text((activo.tipo_equipo_nombre || 'N/A').toUpperCase(), tCol1, currentY + 6, { width: 130, align: 'center' });
      doc.text((activo.marca || 'N/A').toUpperCase(), tCol2, currentY + 6, { width: 130, align: 'center' });
      doc.text((activo.modelo || 'N/A').toUpperCase(), tCol3, currentY + 6, { width: 130, align: 'center' });
      doc.text((activo.serial || 'NA').toUpperCase(), tCol4, currentY + 6, { width: 145, align: 'center' });

      currentY += rowH;
    });

    // Bottom Signatures Section (Placed right below the table, not forced to page bottom)
    const signatureY = currentY + 60;

    const realizadoNombre = (ingreso.realizado_por_nombre || 'FIDEL GARCIA').toUpperCase();
    const realizadoRol = (ingreso.realizado_por_rol || 'ASISTENTE DE SISTEMAS').toUpperCase();

    doc.moveTo(90, signatureY).lineTo(230, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).text('REALIZADO POR:', 50, signatureY + 6, { width: 220, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(realizadoNombre, 50, signatureY + 18, { width: 220, align: 'center' });
    doc.font('Helvetica').fontSize(8).text(realizadoRol, 50, signatureY + 30, { width: 220, align: 'center' });

    const revisadoNombre = (ingreso.revisado_por || 'Paulina Porras');
    const revisadoCargo = (ingreso.revisado_por_cargo || 'GERENTE DE TI');

    doc.moveTo(335, signatureY).lineTo(475, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).text('REVISADO POR:', 295, signatureY + 6, { width: 220, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(revisadoNombre, 295, signatureY + 18, { width: 220, align: 'center' });
    doc.font('Helvetica').fontSize(8).text(revisadoCargo, 295, signatureY + 30, { width: 220, align: 'center' });

    doc.end();
  });
};

export const generarActaEgreso = (egreso: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header section with logos
    renderActaHeaderLogos(doc, egreso.empresa_nombre, { leftX: 30, rightX: 440, topY: 20, logoWidth: 110 });

    // Red Banner Box "EGRESO DE BODEGA"
    const bannerY = 96;
    doc.roundedRect(210, bannerY, 175, 26, 4).fillAndStroke('#b91c1c', '#7f1d1d');
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text('EGRESO DE BODEGA', 210, bannerY + 7, { width: 175, align: 'center' });

    // Subheader: Código de Egreso
    const subheaderTop = bannerY + 34;
    doc.moveTo(30, subheaderTop).lineTo(565, subheaderTop).lineWidth(1).strokeColor('#000000').stroke();
    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text(`Código de Egreso: ${egreso.codigo_egreso}`, 35, subheaderTop + 6);

    const boxY = subheaderTop + 22;
    doc.moveTo(30, boxY).lineTo(565, boxY).lineWidth(1).strokeColor('#000000').stroke();

    // Metadata Grid Box (2 rows)
    const rowHeight = 32;

    // Row 1 divider
    doc.moveTo(30, boxY + rowHeight).lineTo(565, boxY + rowHeight).strokeColor('#000000').lineWidth(1).stroke();
    // Row 2 divider
    doc.moveTo(30, boxY + rowHeight * 2).lineTo(565, boxY + rowHeight * 2).strokeColor('#000000').lineWidth(1).stroke();

    // Outer border around metadata grid & subheader box
    doc.rect(30, subheaderTop, 535, 22 + rowHeight * 2).lineWidth(1).strokeColor('#000000').stroke();

    // Vertical dividers for 3 columns in row 1
    const col1X = 30;
    const col2X = 208;
    const col3X = 386;

    doc.moveTo(col2X, boxY).lineTo(col2X, boxY + rowHeight).strokeColor('#000000').lineWidth(1).stroke();
    doc.moveTo(col3X, boxY).lineTo(col3X, boxY + rowHeight).strokeColor('#000000').lineWidth(1).stroke();

    // Vertical divider in row 2 (after Observación)
    const colObsX = 350;
    doc.moveTo(colObsX, boxY + rowHeight).lineTo(colObsX, boxY + rowHeight * 2).strokeColor('#000000').lineWidth(1).stroke();

    // Cell Row 1
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');
    doc.text('Empresa:', col1X, boxY + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(egreso.empresa_nombre || '', col1X, boxY + 16, { width: 178, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5).text('Usuario:', col2X, boxY + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text((egreso.custodio_nombre || '').toUpperCase(), col2X, boxY + 16, { width: 178, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5).text('Área:', col3X, boxY + 4, { width: 178, align: 'center' });
    doc.font('Helvetica').fontSize(9).text((egreso.area || egreso.custodio_departamento || egreso.custodio_cargo || 'N/A').toUpperCase(), col3X, boxY + 16, { width: 178, align: 'center' });

    // Cell Row 2
    const r2Y = boxY + rowHeight;
    doc.font('Helvetica-Bold').fontSize(8.5).text('Observación:', col1X + 8, r2Y + 4);
    doc.font('Helvetica').fontSize(9).text(egreso.observaciones || 'Sin observaciones.', col1X + 8, r2Y + 16, { width: 310, ellipsis: true });

    const formatDateTime = (dateStr?: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toISOString().replace('T', ' ').substring(0, 19);
    };

    doc.font('Helvetica-Bold').fontSize(8.5).text('Fecha-Hora del Egreso:', colObsX, r2Y + 4, { width: 215, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(formatDateTime(egreso.fecha_egreso || egreso.created_at), colObsX, r2Y + 16, { width: 215, align: 'center' });

    // Assets Table Section
    let tableStartY = boxY + rowHeight * 2 + 20;

    // Header row
    doc.rect(30, tableStartY, 535, 22).fillAndStroke('#e5e7eb', '#000000');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');

    // Column boundaries: TIPO (100), MARCA (100), MODELO (145), SERIE (110), ADICIONALES (80)
    const tCol1 = 30;   // TIPO (width 100)
    const tCol2 = 130;  // MARCA (width 100)
    const tCol3 = 230;  // MODELO (width 145)
    const tCol4 = 375;  // SERIE (width 110)
    const tCol5 = 485;  // ADICIONALES (width 80)

    doc.text('TIPO', tCol1, tableStartY + 6, { width: 100, align: 'center' });
    doc.text('MARCA', tCol2, tableStartY + 6, { width: 100, align: 'center' });
    doc.text('MODELO', tCol3, tableStartY + 6, { width: 145, align: 'center' });
    doc.text('SERIE', tCol4, tableStartY + 6, { width: 110, align: 'center' });
    doc.text('ADICIONALES', tCol5, tableStartY + 6, { width: 80, align: 'center' });

    // Table Column borders for Header
    doc.moveTo(tCol2, tableStartY).lineTo(tCol2, tableStartY + 22).stroke();
    doc.moveTo(tCol3, tableStartY).lineTo(tCol3, tableStartY + 22).stroke();
    doc.moveTo(tCol4, tableStartY).lineTo(tCol4, tableStartY + 22).stroke();
    doc.moveTo(tCol5, tableStartY).lineTo(tCol5, tableStartY + 22).stroke();

    let currentY = tableStartY + 22;

    const activos = egreso.activos || [];
    activos.forEach((activo: any) => {
      const rowH = 22;
      doc.rect(30, currentY, 535, rowH).strokeColor('#000000').stroke();

      doc.moveTo(tCol2, currentY).lineTo(tCol2, currentY + rowH).stroke();
      doc.moveTo(tCol3, currentY).lineTo(tCol3, currentY + rowH).stroke();
      doc.moveTo(tCol4, currentY).lineTo(tCol4, currentY + rowH).stroke();
      doc.moveTo(tCol5, currentY).lineTo(tCol5, currentY + rowH).stroke();

      doc.font('Helvetica').fontSize(8.5).fillColor('#000000');
      doc.text((activo.tipo_equipo_nombre || 'N/A').toUpperCase(), tCol1, currentY + 6, { width: 100, align: 'center' });
      doc.text((activo.marca || 'N/A').toUpperCase(), tCol2, currentY + 6, { width: 100, align: 'center' });
      doc.text((activo.modelo || 'N/A').toUpperCase(), tCol3, currentY + 6, { width: 145, align: 'center' });
      doc.text((activo.serial || 'NA').toUpperCase(), tCol4, currentY + 6, { width: 110, align: 'center' });
      doc.text('NA', tCol5, currentY + 6, { width: 80, align: 'center' });

      currentY += rowH;
    });

    // 3 Signatures Section below table
    const signatureY = currentY + 60;

    const realizadoNombre = (egreso.realizado_por_nombre || 'FIDEL GARCIA').toUpperCase();
    const realizadoRol = (egreso.realizado_por_rol || 'ASISTENTE DE SISTEMAS').toUpperCase();

    const recibidoNombre = (egreso.custodio_nombre || 'LUCIA ROMERO').toUpperCase();
    const recibidoArea = (egreso.area || egreso.custodio_area || 'SAP').toUpperCase();

    const revisadoNombre = (egreso.revisado_por || 'Paulina Porras');
    const revisadoCargo = (egreso.revisado_por_cargo || 'JEFE DE SISTEMAS');

    // Signature 1: REALIZADO POR
    doc.moveTo(40, signatureY).lineTo(180, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8).text('REALIZADO POR:', 35, signatureY + 6, { width: 150, align: 'center' });
    doc.font('Helvetica').fontSize(8.5).text(realizadoNombre, 35, signatureY + 18, { width: 150, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).text(realizadoRol, 35, signatureY + 30, { width: 150, align: 'center' });

    // Signature 2: RECIBIDO POR
    doc.moveTo(222, signatureY).lineTo(362, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8).text('RECIBIDO POR:', 217, signatureY + 6, { width: 150, align: 'center' });
    doc.font('Helvetica').fontSize(8.5).text(recibidoNombre, 217, signatureY + 18, { width: 150, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).text(recibidoArea, 217, signatureY + 30, { width: 150, align: 'center' });

    // Signature 3: REVISADO POR
    doc.moveTo(405, signatureY).lineTo(545, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8).text('REVISADO POR:', 400, signatureY + 6, { width: 150, align: 'center' });
    doc.font('Helvetica').fontSize(8.5).text(revisadoNombre, 400, signatureY + 18, { width: 150, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).text(revisadoCargo, 400, signatureY + 30, { width: 150, align: 'center' });

    doc.end();
  });
};

export const generarActaEntregaEgreso = (egreso: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Helpers for dates in Spanish
    const fechaObj = egreso.fecha_egreso ? new Date(egreso.fecha_egreso) : new Date(egreso.created_at || Date.now());
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const diaNum = fechaObj.getDate();
    const mesNombre = meses[fechaObj.getMonth()];
    const anioNum = fechaObj.getFullYear();
    const fechaFormattedStr = `Quito, ${String(diaNum).padStart(2, '0')} de ${mesNombre} de ${anioNum}`;

    // Extract code TI-INICIALES-AE-NUMERACION
    const empresaNombre = egreso.empresa_nombre || 'SMO';
    const ccAbbr = getEmpresaAbbr(empresaNombre);
    const codigoEntrega = egreso.codigo_egreso && egreso.codigo_egreso.startsWith('TI-') 
      ? egreso.codigo_egreso 
      : `TI-${ccAbbr}-AE-${String(egreso.id || 1).padStart(4, '0')}`;

    // Header section with logos (logo-shopping rightX 395 width 150, logo-sede fit 120x65 leftX 40)
    renderActaHeaderLogos(doc, egreso.empresa_nombre, { leftX: 40, rightX: 395, topY: 25, logoWidth: 150 });

    // Date (positioned safely below header logos at y = 105)
    doc.font('Helvetica').fontSize(9.5).fillColor('#000000').text(fechaFormattedStr, 40, doc.y);
    doc.moveDown(1.2);

    // Code & Title
    doc.font('Helvetica-Bold').fontSize(10).text(codigoEntrega, { align: 'center' });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).text('Acta Entrega', { align: 'center' });
    doc.moveDown(1.2);

    // Intro text
    const sedeNombre = (egreso.empresa_nombre || 'SHOPPING MANAGEMENTS OPERADORA').toUpperCase();
    doc.font('Helvetica').fontSize(9).text(
      `En las instalaciones de ${sedeNombre}, se procede a la entrega de los equipos con las siguientes características:`,
      40,
      doc.y,
      { width: 515, align: 'justify' }
    );
    doc.moveDown(1);

    // Table Header
    let tableStartY = doc.y;
    const tColIndex = 40;  // width 25
    const tCol1 = 65;      // TIPO width 90
    const tCol2 = 155;     // MARCA width 90
    const tCol3 = 245;     // MODELO width 130
    const tCol4 = 375;     // SERIE width 90
    const tCol5 = 465;     // ADICIONALES width 90

    doc.rect(40, tableStartY, 515, 20).fillAndStroke('#f3f4f6', '#000000');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');

    doc.text('#', tColIndex, tableStartY + 5, { width: 25, align: 'center' });
    doc.text('TIPO', tCol1, tableStartY + 5, { width: 90, align: 'center' });
    doc.text('MARCA', tCol2, tableStartY + 5, { width: 90, align: 'center' });
    doc.text('MODELO', tCol3, tableStartY + 5, { width: 130, align: 'center' });
    doc.text('SERIE', tCol4, tableStartY + 5, { width: 90, align: 'center' });
    doc.text('ADICIONALES', tCol5, tableStartY + 5, { width: 90, align: 'center' });

    // Table Column borders for Header
    doc.moveTo(tCol1, tableStartY).lineTo(tCol1, tableStartY + 20).stroke();
    doc.moveTo(tCol2, tableStartY).lineTo(tCol2, tableStartY + 20).stroke();
    doc.moveTo(tCol3, tableStartY).lineTo(tCol3, tableStartY + 20).stroke();
    doc.moveTo(tCol4, tableStartY).lineTo(tCol4, tableStartY + 20).stroke();
    doc.moveTo(tCol5, tableStartY).lineTo(tCol5, tableStartY + 20).stroke();

    let currentY = tableStartY + 20;
    const activos = egreso.activos || [];

    activos.forEach((activo: any, index: number) => {
      const rowH = 20;
      doc.rect(40, currentY, 515, rowH).strokeColor('#000000').stroke();

      doc.moveTo(tCol1, currentY).lineTo(tCol1, currentY + rowH).stroke();
      doc.moveTo(tCol2, currentY).lineTo(tCol2, currentY + rowH).stroke();
      doc.moveTo(tCol3, currentY).lineTo(tCol3, currentY + rowH).stroke();
      doc.moveTo(tCol4, currentY).lineTo(tCol4, currentY + rowH).stroke();
      doc.moveTo(tCol5, currentY).lineTo(tCol5, currentY + rowH).stroke();

      doc.font('Helvetica').fontSize(8).fillColor('#000000');
      doc.text(String(index + 1), tColIndex, currentY + 5, { width: 25, align: 'center' });
      doc.text((activo.tipo_equipo_nombre || 'N/A').toUpperCase(), tCol1, currentY + 5, { width: 90, align: 'center' });
      doc.text((activo.marca || 'N/A').toUpperCase(), tCol2, currentY + 5, { width: 90, align: 'center' });
      doc.text((activo.modelo || 'N/A').toUpperCase(), tCol3, currentY + 5, { width: 130, align: 'center' });
      doc.text((activo.serial || 'NA').toUpperCase(), tCol4, currentY + 5, { width: 90, align: 'center' });
      doc.text('NA', tCol5, currentY + 5, { width: 90, align: 'center' });

      currentY += rowH;
    });

    // Observaciones Section
    currentY += 15;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text('Observaciones:', 40, currentY);
    currentY += 14;
    doc.font('Helvetica').fontSize(8.5).text(egreso.observaciones || 'Sin observaciones.', 40, currentY, { width: 515 });

    currentY += 25;
    doc.font('Helvetica-Bold').fontSize(8.5).text(
      'Los equipos antes descritos quedan bajo responsabilidad del usuario, cualquier daño, perdida o reparación serán asumidos por el funcionario.',
      40,
      currentY,
      { width: 515 }
    );

    currentY += 25;
    doc.font('Helvetica').fontSize(8.5).text(
      `En fe de conformidad y aceptación se procede a suscribir la presente acta de entrega-recepción en original y una copia del mismo tenor y efecto, en Quito a los ${diaNum} días del mes de ${mesNombre} de ${anioNum}.`,
      40,
      currentY,
      { width: 515 }
    );

    // 2 Signatures Section at bottom
    const signatureY = currentY + 65;

    const realizadoNombre = (egreso.realizado_por_nombre || 'FIDEL GARCIA').toUpperCase();
    const recibidoNombre = (egreso.custodio_nombre || 'LUCIA ROMERO').toUpperCase();
    const recibidoArea = (egreso.area || egreso.custodio_departamento || egreso.custodio_cargo || 'SAP').toUpperCase();

    // Signature 1: ENTREGA CONFORME
    doc.moveTo(60, signatureY).lineTo(230, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).text(realizadoNombre, 50, signatureY + 5, { width: 190, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(8).text('ENTREGA CONFORME', 50, signatureY + 16, { width: 190, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(8).text('SISTEMAS', 50, signatureY + 27, { width: 190, align: 'left' });

    // Signature 2: RECIBE CONFORME
    doc.moveTo(345, signatureY).lineTo(515, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).text(recibidoNombre, 335, signatureY + 5, { width: 190, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(8).text('RECIBE CONFORME', 335, signatureY + 16, { width: 190, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(8).text(recibidoArea, 335, signatureY + 27, { width: 190, align: 'left' });

    doc.end();
  });
};

export const generarActaRecepcion = (recepcion: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fechaObj = recepcion.fecha_recepcion ? new Date(recepcion.fecha_recepcion) : new Date(recepcion.created_at || Date.now());
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const diaNum = fechaObj.getDate();
    const mesNombre = meses[fechaObj.getMonth()];
    const anioNum = fechaObj.getFullYear();
    const fechaFormattedStr = `Quito, ${String(diaNum).padStart(2, '0')} de ${mesNombre} de ${anioNum}`;

    const codigoRecepcion = recepcion.codigo_recepcion || 'TI-AR-0001';

    renderActaHeaderLogos(doc, recepcion.empresa_nombre, { leftX: 40, rightX: 395, topY: 25, logoWidth: 150 });

    doc.font('Helvetica').fontSize(9.5).fillColor('#000000').text(fechaFormattedStr, 40, doc.y);
    doc.moveDown(1.2);

    doc.font('Helvetica-Bold').fontSize(10).text(codigoRecepcion, { align: 'center' });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).text('ACTA DE RECEPCIÓN DE ACTIVOS', { align: 'center' });
    doc.moveDown(1.2);

    const sedeNombre = (recepcion.empresa_nombre || 'SHOPPING MANAGEMENTS OPERADORA').toUpperCase();
    const personaEntregaNombre = (recepcion.persona_entrega_nombre || 'N/A').toUpperCase();
    doc.font('Helvetica').fontSize(9).text(
      `En las instalaciones de ${sedeNombre}, el funcionario ${personaEntregaNombre} procede a la entrega / devolución de los activos a la Coordinación de TI con el siguiente detalle:`,
      40,
      doc.y,
      { width: 515, align: 'justify' }
    );
    doc.moveDown(1);

    let tableStartY = doc.y;
    const tColIndex = 40;
    const tCol1 = 65;
    const tCol2 = 155;
    const tCol3 = 245;
    const tCol4 = 375;
    const tCol5 = 465;

    doc.rect(40, tableStartY, 515, 20).fillAndStroke('#f3f4f6', '#000000');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');

    doc.text('#', tColIndex, tableStartY + 5, { width: 25, align: 'center' });
    doc.text('TIPO', tCol1, tableStartY + 5, { width: 90, align: 'center' });
    doc.text('MARCA', tCol2, tableStartY + 5, { width: 90, align: 'center' });
    doc.text('MODELO', tCol3, tableStartY + 5, { width: 130, align: 'center' });
    doc.text('SERIE', tCol4, tableStartY + 5, { width: 90, align: 'center' });
    doc.text('ESTADO', tCol5, tableStartY + 5, { width: 90, align: 'center' });

    doc.moveTo(tCol1, tableStartY).lineTo(tCol1, tableStartY + 20).stroke();
    doc.moveTo(tCol2, tableStartY).lineTo(tCol2, tableStartY + 20).stroke();
    doc.moveTo(tCol3, tableStartY).lineTo(tCol3, tableStartY + 20).stroke();
    doc.moveTo(tCol4, tableStartY).lineTo(tCol4, tableStartY + 20).stroke();
    doc.moveTo(tCol5, tableStartY).lineTo(tCol5, tableStartY + 20).stroke();

    let currentY = tableStartY + 20;
    const activos = recepcion.activos || [];

    activos.forEach((activo: any, index: number) => {
      const rowH = 20;
      doc.rect(40, currentY, 515, rowH).strokeColor('#000000').stroke();

      doc.moveTo(tCol1, currentY).lineTo(tCol1, currentY + rowH).stroke();
      doc.moveTo(tCol2, currentY).lineTo(tCol2, currentY + rowH).stroke();
      doc.moveTo(tCol3, currentY).lineTo(tCol3, currentY + rowH).stroke();
      doc.moveTo(tCol4, currentY).lineTo(tCol4, currentY + rowH).stroke();
      doc.moveTo(tCol5, currentY).lineTo(tCol5, currentY + rowH).stroke();

      doc.font('Helvetica').fontSize(8).fillColor('#000000');
      doc.text(String(index + 1), tColIndex, currentY + 5, { width: 25, align: 'center' });
      doc.text((activo.tipo_equipo_nombre || 'N/A').toUpperCase(), tCol1, currentY + 5, { width: 90, align: 'center' });
      doc.text((activo.marca || 'N/A').toUpperCase(), tCol2, currentY + 5, { width: 90, align: 'center' });
      doc.text((activo.modelo || 'N/A').toUpperCase(), tCol3, currentY + 5, { width: 130, align: 'center' });
      doc.text((activo.serial || 'NA').toUpperCase(), tCol4, currentY + 5, { width: 90, align: 'center' });
      doc.text('DEVUELTO', tCol5, currentY + 5, { width: 90, align: 'center' });

      currentY += rowH;
    });

    currentY += 15;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text('Observaciones / Motivo de Devolución:', 40, currentY);
    currentY += 14;
    doc.font('Helvetica').fontSize(8.5).text(recepcion.observaciones || 'Sin observaciones.', 40, currentY, { width: 515 });

    currentY += 25;
    doc.font('Helvetica').fontSize(8.5).text(
      `En fe de conformidad y recepción de los activos descritos a bodega, se suscribe la presente acta en original y copia del mismo tenor y efecto en Quito a los ${diaNum} días del mes de ${mesNombre} de ${anioNum}.`,
      40,
      currentY,
      { width: 515 }
    );

    const signatureY = currentY + 65;
    const realizaNombre = personaEntregaNombre;
    const realizaArea = (recepcion.area || recepcion.persona_entrega_cargo || 'EMPLEADO').toUpperCase();
    const recibeNombre = (recepcion.recibido_por_nombre || 'SOPORTE TI').toUpperCase();

    // Signature 1: ENTREGA CONFORME (Empleado que devuelve)
    doc.moveTo(60, signatureY).lineTo(230, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).text(realizaNombre, 50, signatureY + 5, { width: 190, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(8).text('ENTREGA CONFORME', 50, signatureY + 16, { width: 190, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(8).text(realizaArea, 50, signatureY + 27, { width: 190, align: 'left' });

    // Signature 2: RECIBE CONFORME (Sistema TI)
    doc.moveTo(345, signatureY).lineTo(515, signatureY).strokeColor('#000000').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).text(recibeNombre, 335, signatureY + 5, { width: 190, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(8).text('RECIBE CONFORME', 335, signatureY + 16, { width: 190, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(8).text('SISTEMAS / BODEGA TI', 335, signatureY + 27, { width: 190, align: 'left' });

    doc.end();
  });
};

