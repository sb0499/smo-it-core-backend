import PDFDocument from 'pdfkit';

export const generarActaMovimiento = (movimiento: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Encabezado institucional
    doc.fillColor('#1e3a8a').fontSize(22).font('Helvetica-Bold').text('TISMO');
    doc.fillColor('#4b5563').fontSize(12).font('Helvetica').text('SHOPPING MANAGEMENTS OPERADORA');
    doc.fillColor('#9ca3af').fontSize(10).text('DEPARTAMENTO DE TI');

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
