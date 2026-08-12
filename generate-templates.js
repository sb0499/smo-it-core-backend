const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'smo-it-core-frontend', 'public', 'templates');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateTemplates() {
  try {
    // 1. Plantilla Activos Tecnológicos
    const workbookActivos = new ExcelJS.Workbook();
    const sheetActivos = workbookActivos.addWorksheet('Activos Tecnológicos');

    // Style headers
    const headersActivos = ["CÓDIGO", "MARCA", "TIPO EQUIPO", "SEDE", "N/S SERIAL", "MODELO", "ESTADO", "RESPONSABLE", "AREA", "PRECIO REFERENCIAL", "OBSERVACIONES"];
    sheetActivos.addRow(headersActivos);

    // Add some sample rows
    sheetActivos.addRow(["SMO-LAP-001", "Dell", "Laptop", "GAMETOWN", "CNU12345", "Latitude 3420", "Asignado", "Juan Perez", "Sistemas", 850, "Equipo asignado a sistemas"]);
    sheetActivos.addRow(["SMO-IMP-002", "Epson", "Impresora", "TEATRO", "EPSON123456", "L3150", "Stock", "", "Administración", 250, "En bodega central"]);

    // Format columns width and styles
    sheetActivos.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheetActivos.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F46E5' } // Indigo color
    };

    sheetActivos.columns.forEach(column => {
      column.width = 22;
    });

    const fileActivos = path.join(outputDir, 'plantilla_activos.xlsx');
    await workbookActivos.xlsx.writeFile(fileActivos);
    console.log(`Generated template: ${fileActivos}`);


    // 2. Plantilla Consumibles y Suministros
    const workbookConsumibles = new ExcelJS.Workbook();
    const sheetConsumibles = workbookConsumibles.addWorksheet('Consumibles y Suministros');

    const headersConsumibles = ["SEDE", "CATEGORIA", "MARCA", "MODELO", "CANTIDAD", "PRECIO", "OBSERVACIONES"];
    sheetConsumibles.addRow(headersConsumibles);

    sheetConsumibles.addRow(["GAMETOWN", "Tinta", "Epson", "544 Negra", 5, 12.50, "Tintas para administración"]);
    sheetConsumibles.addRow(["APPARCA", "Toner", "HP", "105A", 2, 75.00, "Toner para oficina central"]);

    sheetConsumibles.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheetConsumibles.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F46E5' } // Indigo color
    };

    sheetConsumibles.columns.forEach(column => {
      column.width = 22;
    });

    const fileConsumibles = path.join(outputDir, 'plantilla_consumibles.xlsx');
    await workbookConsumibles.xlsx.writeFile(fileConsumibles);
    console.log(`Generated template: ${fileConsumibles}`);

    console.log('Template generation completed successfully!');
  } catch (error) {
    console.error('Error generating templates:', error);
  }
}

generateTemplates();
