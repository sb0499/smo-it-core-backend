import PDFDocument from 'pdfkit';

export const generarActaMovimiento = (movimiento: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('ACTA DE MOVIMIENTO DE INVENTARIO', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('IT CORE SYSTEM - SMO', { align: 'center' });
    doc.moveDown(2);

    // Activo info
    doc.fontSize(14).font('Helvetica-Bold').text('Datos del Activo');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Código: ${movimiento.activo_codigo}`);
    doc.text(`Marca / Modelo: ${movimiento.activo_marca} ${movimiento.activo_modelo}`);
    doc.text(`Serial: ${movimiento.activo_serial}`);
    doc.moveDown();

    // Movimiento info
    doc.fontSize(14).font('Helvetica-Bold').text('Datos del Movimiento');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Tipo: ${movimiento.tipo}`);
    doc.text(`Fecha: ${new Date(movimiento.fecha).toLocaleDateString('es-EC')}`);
    doc.text(`Observaciones: ${movimiento.observaciones || 'N/A'}`);
    doc.moveDown();

    // Personas
    doc.fontSize(14).font('Helvetica-Bold').text('Transferencia');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Entrega: ${movimiento.persona_entrega_nombre || 'Bodega'}`);
    doc.text(`Recibe: ${movimiento.persona_recibe_nombre || 'N/A'} (CI: ${movimiento.persona_recibe_cedula || 'N/A'})`);
    doc.moveDown(3);

    // Firmas
    doc.fontSize(11).font('Helvetica');
    const firmaY = doc.y;
    doc.text('_________________________', 80, firmaY);
    doc.text('_________________________', 350, firmaY);
    doc.text('Firma de quien entrega', 80, firmaY + 15);
    doc.text('Firma de quien recibe', 350, firmaY + 15);

    doc.end();
  });
};
