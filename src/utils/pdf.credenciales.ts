import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

/**
 * Converts a date string (YYYY-MM-DD) or Date object to a long Spanish text description.
 * E.g., "2025-09-26" -> "veintiséis días del mes de septiembre del dos mil veinticinco"
 */
export function dateToSpanishWords(dateInput: string | Date): string {
  if (!dateInput) return '';
  
  let day: number;
  let month: number;
  let year: number;

  if (dateInput instanceof Date) {
    day = dateInput.getDate();
    month = dateInput.getMonth();
    year = dateInput.getFullYear();
  } else {
    // String parsing (avoiding timezone shift by parsing parts)
    const cleanStr = String(dateInput).split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1; // 0-indexed
      day = parseInt(parts[2], 10);
    } else {
      const date = new Date(dateInput);
      day = date.getDate();
      month = date.getMonth();
      year = date.getFullYear();
    }
  }

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return 'FECHA INVALIDA';
  }

  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const especiales = {
    11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
    16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
    21: 'veintiuno', 22: 'veintidós', 23: 'veintitrés', 24: 'veinticuatro',
    25: 'veinticinco', 26: 'veintiséis', 27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve'
  };

  const numeroALetras = (n: number): string => {
    if (n === 0) return 'cero';
    if (n === 10) return 'diez';
    if (n === 20) return 'veinte';
    if (n === 30) return 'treinta';
    
    if (n in especiales) {
      return (especiales as any)[n];
    }
    
    if (n < 10) return unidades[n];
    if (n < 30) {
      return 'veinti' + unidades[n % 10];
    }
    
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return decenas[d];
    return decenas[d] + ' y ' + unidades[u];
  };

  const yearALetras = (y: number): string => {
    if (y >= 2000 && y < 3000) {
      const resto = y - 2000;
      if (resto === 0) return 'dos mil';
      return 'dos mil ' + numeroALetras(resto);
    }
    return y.toString();
  };

  const diaPalabra = day === 1 ? 'primer día' : `${numeroALetras(day)} días`;
  const mesPalabra = meses[month];
  const yearPalabra = yearALetras(year);

  return `${diaPalabra} del mes de ${mesPalabra} del ${yearPalabra}`;
}

const formatCCName = (name: string): string => {
  const n = name.toUpperCase();
  if (n === 'CONDADO') return 'Condado Shopping';
  if (n === 'SCALA') return 'Scala Shopping';
  if (n === 'POMASQUI') return 'Pomasqui';
  if (n === 'PORTOSHOPPING') return 'Portoshopping';
  return name;
};

export const generarActaCredenciales = (entrega: any, version: 'usuario' | 'ti'): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // 1. Esquina superior derecha: logo-shopping.png (fijo)
    const defaultLogoPath = path.join(__dirname, '..', 'assets', 'logo-shopping.png');
    if (fs.existsSync(defaultLogoPath)) {
      doc.image(defaultLogoPath, 395, 25, { width: 150 });
    } else {
      doc.save();
      doc.fillColor('#304d69'); // Slate blue of shoppingmanagements logo
      doc.moveTo(435, 45)
         .lineTo(535, 45)
         .lineTo(538, 40)
         .lineTo(545, 75)
         .lineTo(542, 80)
         .lineTo(532, 80)
         .lineTo(432, 80)
         .lineTo(428, 80)
         .lineTo(425, 75)
         .lineTo(430, 40)
         .lineTo(435, 45)
         .closePath()
         .fill();

      // Ribbon logo text
      doc.fillColor('#ffffff')
         .fontSize(8.5)
         .font('Helvetica-Bold')
         .text('shoppingmanagements', 435, 58, { width: 97, align: 'center' });
      doc.restore();
    }

    // 2. Esquina superior izquierda: logo-nombresede.png si existe (si no existe se deja vacío)
    const cleanCompanyName = String(entrega.empresa_nombre || '')
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '');

    const isShoppingMain = !cleanCompanyName || cleanCompanyName === 'shopping' || cleanCompanyName === 'shopping-managements';
    const specificLogoPath = path.join(__dirname, '..', 'assets', `logo-${cleanCompanyName}.png`);

    if (!isShoppingMain && fs.existsSync(specificLogoPath)) {
      doc.image(specificLogoPath, 50, 25, { fit: [120, 65] });
    }

    // Safe Date Parsing for top header date
    let dateObj: Date;
    if (entrega.fecha_entrega instanceof Date) {
      dateObj = entrega.fecha_entrega;
    } else {
      const cleanStr = String(entrega.fecha_entrega).split('T')[0];
      const parts = cleanStr.split('-');
      if (parts.length === 3) {
        dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      } else {
        dateObj = new Date(entrega.fecha_entrega);
      }
    }

    const dateOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };
    const fechaTop = isNaN(dateObj.getTime()) ? '—' : dateObj.toLocaleDateString('es-EC', dateOptions);

    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('#111827')
       .text(`Quito, ${fechaTop}`, 50, 110);

    // Document Secuencial
    doc.moveDown(2);
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text(entrega.secuencial, { align: 'center' });

    // Document Title
    doc.moveDown(1);
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('ACTA DE ENTREGA-RECEPCION', { align: 'center' });
    
    // Introductory text (excluding physical address as requested)
    const ccNameFormatted = formatCCName(entrega.empresa_nombre);
    const fechaLetras = dateToSpanishWords(entrega.fecha_entrega);
    const introText = `En las instalaciones de ${ccNameFormatted}, a los ${fechaLetras}, se procede a entregar lo siguiente.`;

    doc.moveDown(1.5);
    doc.font('Helvetica')
       .fontSize(11)
       .fillColor('#111827')
       .text(introText, { align: 'justify', lineGap: 3 });

    // Table parameters
    const tableY = doc.y + 15;
    const rowHeight = 35;
    const colX = {
      num: 50,
      tipo: 80,
      sitio: 180,
      user: 290,
      pass: 445
    };
    const colW = {
      num: 30,
      tipo: 100,
      sitio: 110,
      user: 155,
      pass: 100
    };

    // Header Background
    doc.rect(50, tableY, 495, 20).fillColor('#f3f4f6').fill();
    
    // Header Texts
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10);
    doc.text('#', colX.num, tableY + 5, { width: colW.num, align: 'center' });
    doc.text('TIPO', colX.tipo, tableY + 5, { width: colW.tipo, align: 'center' });
    doc.text('SITIO', colX.sitio, tableY + 5, { width: colW.sitio, align: 'center' });
    doc.text('USUARIO', colX.user, tableY + 5, { width: colW.user, align: 'center' });
    doc.text('CLAVE', colX.pass, tableY + 5, { width: colW.pass, align: 'center' });

    // Row Content
    const rowY = tableY + 20;
    doc.font('Helvetica').fontSize(9).fillColor('#111827');
    
    // Row 1 Values
    doc.text('1', colX.num, rowY + 12, { width: colW.num, align: 'center' });
    doc.text(entrega.tipo || 'Usuario y Clave', colX.tipo, rowY + 12, { width: colW.tipo, align: 'center' });
    doc.text(entrega.sitio, colX.sitio, rowY + 12, { width: colW.sitio, align: 'center' });
    doc.text(entrega.usuario, colX.user, rowY + 12, { width: colW.user, align: 'center' });
    
    const passVal = version === 'ti' ? 'Entregada al Usuario' : entrega.clave;
    doc.text(passVal, colX.pass, rowY + 12, { width: colW.pass, align: 'center' });

    // Draw borders
    doc.strokeColor('#000000').lineWidth(1);
    doc.rect(50, tableY, 495, 20 + rowHeight).stroke();
    
    // Columns borders
    doc.moveTo(colX.tipo, tableY).lineTo(colX.tipo, tableY + 20 + rowHeight).stroke();
    doc.moveTo(colX.sitio, tableY).lineTo(colX.sitio, tableY + 20 + rowHeight).stroke();
    doc.moveTo(colX.user, tableY).lineTo(colX.user, tableY + 20 + rowHeight).stroke();
    doc.moveTo(colX.pass, tableY).lineTo(colX.pass, tableY + 20 + rowHeight).stroke();
    
    // Line under header
    doc.moveTo(50, tableY + 20).lineTo(545, tableY + 20).stroke();

    // Footer note - EXPLICITLY specify X=50 and Width=495 to avoid narrow column layout inherits
    doc.moveDown(3);
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
    doc.text('Nota: La información entregada debe ser custodiada y utilizada de la mejor manera por parte del usuario.', 50, doc.y, { width: 495, lineGap: 4 });

    // Acceptance text - EXPLICITLY specify X=50 and Width=495
    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(10);
    doc.text('En fe de conformidad y aceptación se procede a suscribir la presente acta de entrega-recepción en original y una copia del mismo tenor y efecto.', 50, doc.y, { width: 495, align: 'justify' });

    // Signatures lines and details
    const firmaY = doc.y + 65;
    
    // Deliverer signature
    doc.moveTo(50, firmaY).lineTo(230, firmaY).strokeColor('#000000').lineWidth(0.75).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
    doc.text('ENTREGA CONFORME', 50, firmaY + 5, { width: 180, align: 'center' });
    doc.text(entrega.entregado_por_nombre, 50, firmaY + 17, { width: 180, align: 'center' });
    doc.text('TI', 50, firmaY + 29, { width: 180, align: 'center' });

    // Receiver signature
    doc.moveTo(365, firmaY).lineTo(545, firmaY).stroke();
    doc.text('RECIBE CONFORME', 365, firmaY + 5, { width: 180, align: 'center' });
    doc.text(entrega.recibido_por_nombre, 365, firmaY + 17, { width: 180, align: 'center' });
    doc.text(entrega.recibido_por_area, 365, firmaY + 29, { width: 180, align: 'center' });

    doc.end();
  });
};
