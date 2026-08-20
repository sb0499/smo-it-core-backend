import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import ExcelJS from 'exceljs';
import { generateUniqueCode } from './inventario.service';
import { generateUniqueAbbreviation } from './tipo-equipo.service';

// Helper to sanitize cell values to string
const getCellString = (cell: any): string => {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object') {
    if (cell.text) return String(cell.text).trim();
    if (cell.result !== undefined) return String(cell.result).trim();
    return JSON.stringify(cell);
  }
  return String(cell).trim();
};

// Helper to sanitize cell values to number
const getCellNumber = (cell: any): number => {
  if (cell === null || cell === undefined) return 0;
  if (typeof cell === 'object') {
    const val = cell.result !== undefined ? cell.result : cell.text;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }
  const num = Number(cell);
  return isNaN(num) ? 0 : num;
};

// Helper to normalize header names for matching
const normalizeHeader = (name: string): string => {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^A-Z0-9]/g, "")      // remove special chars/spaces
    .trim();
};

export interface ImportResult {
  success: boolean;
  totalProcessed: number;
  totalInserted: number;
  errors: string[];
}

export const excelService = {
  /**
   * Imports inventory data from an Excel file.
   */
  async importarExcel(
    filePath: string,
    tipoInventarioId: number,
    currentUser: { id: number; rol_nombre: string; nivel_soporte: string },
    assignedEmpresaIds: number[],
    bodegaNombreOpcional?: string
  ): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Determine which worksheets to process
    const worksheetsToProcess: { ws: ExcelJS.Worksheet; typeId: number }[] = [];
    if (workbook.worksheets.length > 1) {
      for (const ws of workbook.worksheets) {
        const name = ws.name.toUpperCase().trim();
        let targetTypeId = 0;
        if (name === 'BODEGA') targetTypeId = 1;
        else if (name === 'ASIGNADOS USUARIOS') targetTypeId = 2;
        else if (name === 'SERVIDORES') targetTypeId = 3;
        else if (name === 'CONSUMIBLES') targetTypeId = 4;
        else if (name === 'RECICLAJE') targetTypeId = 5;

        if (targetTypeId > 0) {
          worksheetsToProcess.push({ ws, typeId: targetTypeId });
        }
      }
    }

    // Fallback to first sheet if no template sheet names matched
    if (worksheetsToProcess.length === 0 && workbook.worksheets[0]) {
      worksheetsToProcess.push({ ws: workbook.worksheets[0], typeId: tipoInventarioId });
    }

    if (worksheetsToProcess.length === 0) {
      throw new Error('El archivo Excel no contiene hojas de cálculo.');
    }

    // Load all inventory types into a map in memory
    const [tipoInvRows] = await pool.query<RowDataPacket[]>('SELECT id, nombre FROM tipo_inventario');
    const tipoInvMap = new Map<number, string>();
    for (const row of tipoInvRows) {
      tipoInvMap.set(row.id, row.nombre);
    }

    // Load all existing equipment types for memory matching (case and accent insensitive)
    const [allTipos] = await pool.query<RowDataPacket[]>('SELECT id, nombre FROM tipo_equipo');
    const tipoMap = new Map<string, number>();
    for (const t of allTipos) {
      tipoMap.set(normalizeHeader(t.nombre), t.id);
    }

    const result: ImportResult = {
      success: true,
      totalProcessed: 0,
      totalInserted: 0,
      errors: []
    };

    const isN1 = currentUser.rol_nombre === 'TECNICO' && currentUser.nivel_soporte === 'N1';

    // Loop through each sheet to process
    for (const sheetItem of worksheetsToProcess) {
      const worksheet = sheetItem.ws;
      const currentTypeId = sheetItem.typeId;
      const tipoInventarioNombre = tipoInvMap.get(currentTypeId) || 'Otro'; 
      const tipoInvLower = tipoInventarioNombre.toLowerCase();

      // 1. Map headers to column numbers
      const headerRow = worksheet.getRow(1);
      const colMap: { [key: string]: number } = {};

      headerRow.eachCell((cell, colNumber) => {
        const headerStr = getCellString(cell.value);
        if (headerStr) {
          const norm = normalizeHeader(headerStr);
          colMap[norm] = colNumber;
        }
      });

      // Helper to get column index by possible matching names
      const getColIndex = (possibleNames: string[]): number | undefined => {
        for (const name of possibleNames) {
          const norm = normalizeHeader(name);
          if (colMap[norm] !== undefined) {
            return colMap[norm];
          }
        }
        return undefined;
      };

      // Find indices for target columns
      const idxNro = getColIndex(['NRO', 'NO', 'NUM', 'NUMERO']);
      const idxCantidad = getColIndex(['CANTIDAD', 'CANT']);
      const idxEmpresa = getColIndex(['EMPRESA', 'SEDE', 'CENTRO COMERCIAL', 'CC']);
      const idxArea = getColIndex(['AREA', 'DEPARTAMENTO', 'DEPTO']);
      const idxUsuario = getColIndex(['USUARIO', 'CUSTODIO', 'RESPONSABLE', 'PERSONA']);
      const idxTipo = getColIndex(['TIPO', 'TIPO EQUIPO', 'CATEGORIA']);
      const idxMarca = getColIndex(['MARCA']);
      const idxModelo = getColIndex(['MODELO']);
      const idxSerial = getColIndex(['SERIAL', 'SERIE', 'S/N']);
      const idxObservaciones = getColIndex(['OBSERVACIONES', 'OBS', 'COMENTARIOS', 'DETALLE']);
      const idxPrecio = getColIndex(['PRECIO REFERENCIAL', 'PRECIO', 'COSTO', 'VALOR']);
      const idxCodigo = getColIndex(['CODIGO', 'CÓDIGO']);
      const idxEstado = getColIndex(['ESTADO']);

      // Check required columns
      if (!idxEmpresa) {
        result.errors.push(`Hoja "${worksheet.name}": No se pudo encontrar la columna "EMPRESA" (o "SEDE").`);
        continue;
      }
      if (!idxTipo && !idxMarca) {
        result.errors.push(`Hoja "${worksheet.name}": El Excel debe contener al menos las columnas "TIPO" o "MARCA".`);
        continue;
      }

      const rowCount = worksheet.rowCount;

      // Iterate through rows sequentially
      for (let r = 2; r <= rowCount; r++) {
        const row = worksheet.getRow(r);
        
        // Skip completely empty rows
        let hasData = false;
        row.eachCell(() => { hasData = true; });
        if (!hasData) continue;

        result.totalProcessed++;

        try {
          // Read cells
          const empresaName = idxEmpresa ? getCellString(row.getCell(idxEmpresa).value) : '';
          const areaVal = idxArea ? getCellString(row.getCell(idxArea).value) : '';
          const usuarioName = idxUsuario ? getCellString(row.getCell(idxUsuario).value) : '';
          const tipoName = idxTipo ? getCellString(row.getCell(idxTipo).value) : 'Otro';
          const marcaVal = idxMarca ? getCellString(row.getCell(idxMarca).value) : 'Genérico';
          const modeloVal = idxModelo ? getCellString(row.getCell(idxModelo).value) : 'N/A';
          const serialVal = idxSerial ? getCellString(row.getCell(idxSerial).value) : 'S/N';
          const observacionesVal = idxObservaciones ? getCellString(row.getCell(idxObservaciones).value) : '';
          const precioVal = idxPrecio ? getCellNumber(row.getCell(idxPrecio).value) : null;
          const cantidadVal = idxCantidad ? Math.max(1, getCellNumber(row.getCell(idxCantidad).value)) : 1;
          const codigoExcel = idxCodigo ? getCellString(row.getCell(idxCodigo).value) : '';
          const estadoExcel = idxEstado ? getCellString(row.getCell(idxEstado).value) : '';

          if (!empresaName.trim()) {
            result.errors.push(`Hoja "${worksheet.name}" Fila ${r}: Nombre de empresa/sede vacío.`);
            continue;
          }

          // --- 2. Match or Create Empresa ---
          let empresaId = 0;
          const [empresaRows] = await pool.query<RowDataPacket[]>(
            'SELECT id, nombre FROM empresa WHERE LOWER(nombre) = ?',
            [empresaName.toLowerCase().trim()]
          );

          if (empresaRows.length > 0) {
            empresaId = empresaRows[0].id;
          } else {
            if (isN1) {
              result.errors.push(`Hoja "${worksheet.name}" Fila ${r}: La sede "${empresaName}" no existe en el sistema y no tienes permisos para crearla.`);
              continue;
            } else {
              const [newEmp] = await pool.query<ResultSetHeader>(
                'INSERT INTO empresa (nombre) VALUES (?)',
                [empresaName.trim().toUpperCase()]
              );
              empresaId = newEmp.insertId;
              console.log(`Created new Sede/Empresa: ${empresaName} with ID ${empresaId}`);
            }
          }

          // Validate N1 permissions
          if (isN1 && !assignedEmpresaIds.includes(empresaId)) {
            result.errors.push(`Hoja "${worksheet.name}" Fila ${r}: No tienes autorización para registrar activos en la sede "${empresaName}".`);
            continue;
          }

          let customCodigo: string | null = null;
          if (codigoExcel.trim()) {
            const [existingCode] = await pool.query<RowDataPacket[]>(
              'SELECT id FROM activo WHERE codigo = ?',
              [codigoExcel.trim().toUpperCase()]
            );
            if (existingCode.length > 0) {
              result.errors.push(`Hoja "${worksheet.name}" Fila ${r}: El código de activo "${codigoExcel.trim().toUpperCase()}" ya está registrado.`);
              continue;
            }
            customCodigo = codigoExcel.trim().toUpperCase();
          }

          if (tipoInvLower.includes('consumible')) {
            // --- CONSUMIBLE IMPORT LOGIC ---
            const nombreParts = [];
            if (tipoName) nombreParts.push(tipoName.trim());
            if (marcaVal && marcaVal !== 'Genérico') nombreParts.push(marcaVal.trim());
            if (modeloVal && modeloVal !== 'N/A') nombreParts.push(modeloVal.trim());
            const consumibleNombre = nombreParts.join(' ').trim() || 'Consumible Sin Nombre';

            const descParts = [];
            if (empresaName) descParts.push(`Sede: ${empresaName.trim()}`);
            if (areaVal) descParts.push(`Área: ${areaVal.trim()}`);
            if (usuarioName) descParts.push(`Usuario: ${usuarioName.trim()}`);
            if (serialVal && serialVal !== 'S/N') descParts.push(`Serial: ${serialVal.trim()}`);
            if (precioVal && precioVal > 0) descParts.push(`Precio Ref: $${precioVal}`);
            if (observacionesVal) descParts.push(`Obs: ${observacionesVal.trim()}`);
            const consumibleDescripcion = descParts.join(', ') || null;

            const [existing] = await pool.query<RowDataPacket[]>(
              'SELECT id FROM consumible WHERE nombre = ? AND (descripcion = ? OR (descripcion IS NULL AND ? IS NULL))',
              [consumibleNombre, consumibleDescripcion, consumibleDescripcion]
            );

            if (existing.length > 0) {
              await pool.query(
                'UPDATE consumible SET stock_actual = stock_actual + ? WHERE id = ?',
                [cantidadVal, existing[0].id]
              );
            } else {
              await pool.query(
                'INSERT INTO consumible (nombre, descripcion, unidad_medida, stock_actual, stock_minimo) VALUES (?, ?, ?, ?, ?)',
                [consumibleNombre, consumibleDescripcion, 'Unidades', cantidadVal, 5]
              );
            }
            result.totalInserted++;
            continue;
          }

          // --- 3. Match or Create Tipo de Equipo ---
          const targetTipoStr = tipoName.trim() || 'Otro';
          const normalizedInput = normalizeHeader(targetTipoStr);
          let tipoEquipoId = tipoMap.get(normalizedInput);

          if (!tipoEquipoId) {
            const abrev = await generateUniqueAbbreviation(targetTipoStr);
            const [newTipo] = await pool.query<ResultSetHeader>(
              'INSERT INTO tipo_equipo (nombre, abreviacion) VALUES (?, ?)',
              [targetTipoStr, abrev]
            );
            tipoEquipoId = newTipo.insertId;
            tipoMap.set(normalizedInput, tipoEquipoId);
            console.log(`Created new Tipo Equipo: ${targetTipoStr} with ID ${tipoEquipoId} (Abrev: ${abrev})`);
          }

          // --- 4. Match or Create Persona (Usuario) ---
          let personaId: number | null = null;
          const targetUsuarioStr = usuarioName.trim();
          const skipPersonaNames = ['bodega', 'bodega central', 'stock', 'libre', 'disponible', 'n/a', ''];
          
          if (targetUsuarioStr && !skipPersonaNames.includes(targetUsuarioStr.toLowerCase())) {
            const [personaRows] = await pool.query<RowDataPacket[]>(
              'SELECT id FROM persona WHERE LOWER(nombre) = ? AND empresa_id = ?',
              [targetUsuarioStr.toLowerCase(), empresaId]
            );

            if (personaRows.length > 0) {
              personaId = personaRows[0].id;
            } else {
              const tempCedula = `TEMP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
              const [newPers] = await pool.query<ResultSetHeader>(
                'INSERT INTO persona (cedula, nombre, departamento, cargo, empresa_id) VALUES (?, ?, ?, ?, ?)',
                [tempCedula, targetUsuarioStr, areaVal || 'Sistemas', 'Importado desde Excel', empresaId]
              );
              personaId = newPers.insertId;
              console.log(`Created new Persona: ${targetUsuarioStr} with ID ${personaId}`);
            }
          }

          // --- 5. Determine State ---
          let estado: 'Stock' | 'Asignado' | 'Mantenimiento' | 'Baja' | 'Reciclaje' = 'Stock';
          const rawEstado = estadoExcel.trim().toLowerCase();
          if (rawEstado.includes('stock') || rawEstado.includes('bodega') || rawEstado.includes('libre') || rawEstado.includes('disponible')) {
            estado = 'Stock';
          } else if (rawEstado.includes('asignado') || rawEstado.includes('uso') || rawEstado.includes('entregado')) {
            estado = 'Asignado';
          } else if (rawEstado.includes('mantenimiento') || rawEstado.includes('taller') || rawEstado.includes('reparacion')) {
            estado = 'Mantenimiento';
          } else if (rawEstado.includes('baja') || rawEstado.includes('desechado') || rawEstado.includes('dañado')) {
            estado = 'Baja';
          } else if (rawEstado.includes('reciclaje') || rawEstado.includes('chatarra')) {
            estado = 'Reciclaje';
          } else {
            if (tipoInvLower.includes('reciclaje')) {
              estado = 'Reciclaje';
            } else if (tipoInvLower.includes('asignado')) {
              estado = 'Asignado';
            } else if (tipoInvLower.includes('servidor') || tipoInvLower.includes('infraestructura')) {
              estado = personaId ? 'Asignado' : 'Stock';
            } else {
              estado = 'Stock';
            }
          }

          // Bodega Name mapping
          const bodegaVal = bodegaNombreOpcional || (tipoInvLower.includes('bodega') ? 'Bodega Central' : null);

          // --- 6. Insert Loop for quantity ---
          const loopCount = (tipoInvLower.includes('asignado') || customCodigo) ? 1 : cantidadVal;

          for (let i = 0; i < loopCount; i++) {
            const codigo = customCodigo || await generateUniqueCode(empresaId, tipoEquipoId);

            const [insertRes] = await pool.query<ResultSetHeader>(
              `INSERT INTO activo (
                codigo, serial, marca, modelo, especificaciones, estado, 
                persona_id, proveedor_id, fecha_compra, tipo_equipo_id, empresa_id,
                bodega, area, precio_referencial, observaciones, tipo_inventario_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                codigo,                  // 1
                serialVal,               // 2
                marcaVal,                // 3
                modeloVal,               // 4
                observacionesVal || null,// 5
                estado,                  // 6
                personaId,               // 7
                null,                    // 8
                null,                    // 9
                tipoEquipoId,            // 10
                empresaId,               // 11
                bodegaVal || null,       // 12
                areaVal || null,         // 13
                precioVal,               // 14
                observacionesVal || null,// 15
                currentTypeId            // 16
              ]
            );

            await pool.query(
              `INSERT INTO historial_cambios_activo (activo_id, usuario_id, cambios) VALUES (?, ?, ?)`,
              [insertRes.insertId, currentUser.id, `Activo registrado por importación de hoja Excel (${worksheet.name})`]
            );

            result.totalInserted++;
          }
        } catch (err: any) {
          result.errors.push(`Hoja "${worksheet.name}" Fila ${r}: Error inesperado - ${err.message}`);
        }
      }
    }

    if (result.errors.length > 0) {
      result.success = result.totalInserted > 0;
    }

    return result;
  },

  /**
   * Exports inventory data into a structured Excel workbook with 5 sheets.
   */
  async exportarExcel(
    currentUser: { id: number; rol_nombre: string; nivel_soporte: string },
    assignedEmpresaIds: number[]
  ): Promise<ExcelJS.Workbook> {
    const isTech = currentUser.rol_nombre === 'TECNICO';
    const isN1 = isTech && currentUser.nivel_soporte === 'N1';

    // 1. Fetch assets based on user authorization
    let query = `
      SELECT a.*, p.nombre as persona_nombre, p.cedula as persona_cedula,
             prov.nombre as proveedor_nombre,
             te.nombre as tipo_equipo_nombre, e.nombre as empresa_nombre,
             ti.nombre as tipo_inventario_nombre
      FROM activo a
      LEFT JOIN persona p ON a.persona_id = p.id
      LEFT JOIN proveedor prov ON a.proveedor_id = prov.id
      LEFT JOIN tipo_equipo te ON a.tipo_equipo_id = te.id
      LEFT JOIN empresa e ON a.empresa_id = e.id
      LEFT JOIN tipo_inventario ti ON a.tipo_inventario_id = ti.id
    `;
    
    const params: any[] = [];
    if (isTech) {
      if (assignedEmpresaIds.length > 0) {
        query += ` WHERE a.empresa_id IN (${assignedEmpresaIds.map(() => '?').join(',')})`;
        params.push(...assignedEmpresaIds);
      } else {
        query += ` WHERE 1=0`; // No access, return empty
      }
    }

    const [activos] = await pool.query<RowDataPacket[]>(query, params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TISMO';
    workbook.created = new Date();

    // Define columns structures
    const colsBodega = [
      { header: 'NRO', key: 'nro', width: 8 },
      { header: 'CANTIDAD', key: 'cantidad', width: 12 },
      { header: 'EMPRESA', key: 'empresa', width: 20 },
      { header: 'AREA', key: 'area', width: 15 },
      { header: 'USUARIO', key: 'usuario', width: 25 },
      { header: 'TIPO', key: 'tipo', width: 15 },
      { header: 'MARCA', key: 'marca', width: 15 },
      { header: 'MODELO', key: 'modelo', width: 20 },
      { header: 'SERIAL', key: 'serial', width: 20 },
      { header: 'OBSERVACIONES', key: 'observaciones', width: 35 }
    ];

    const colsConsumibles = [
      { header: 'NRO', key: 'nro', width: 8 },
      { header: 'CANTIDAD', key: 'cantidad', width: 12 },
      { header: 'EMPRESA', key: 'empresa', width: 20 },
      { header: 'AREA', key: 'area', width: 15 },
      { header: 'USUARIO', key: 'usuario', width: 25 },
      { header: 'TIPO', key: 'tipo', width: 15 },
      { header: 'MARCA', key: 'marca', width: 15 },
      { header: 'MODELO', key: 'modelo', width: 20 },
      { header: 'SERIAL', key: 'serial', width: 20 },
      { header: 'PRECIO REFERENCIAL', key: 'precio', width: 20 }
    ];

    const colsReciclaje = [
      { header: 'NRO', key: 'nro', width: 8 },
      { header: 'CANTIDAD', key: 'cantidad', width: 12 },
      { header: 'EMPRESA', key: 'empresa', width: 20 },
      { header: 'AREA', key: 'area', width: 15 },
      { header: 'USUARIO', key: 'usuario', width: 25 },
      { header: 'TIPO', key: 'tipo', width: 15 },
      { header: 'MARCA', key: 'marca', width: 15 },
      { header: 'MODELO', key: 'modelo', width: 20 },
      { header: 'SERIAL', key: 'serial', width: 20 },
      { header: 'OBSERVACIONES', key: 'observaciones', width: 35 }
    ];

    const colsAsignados = [
      { header: 'NRO', key: 'nro', width: 8 },
      { header: 'EMPRESA', key: 'empresa', width: 20 },
      { header: 'AREA', key: 'area', width: 15 },
      { header: 'USUARIO', key: 'usuario', width: 25 },
      { header: 'TIPO', key: 'tipo', width: 15 },
      { header: 'MARCA', key: 'marca', width: 15 },
      { header: 'MODELO', key: 'modelo', width: 20 },
      { header: 'SERIAL', key: 'serial', width: 20 },
      { header: 'PRECIO REFERENCIAL', key: 'precio', width: 20 }
    ];

    const colsServidores = [
      { header: 'NRO', key: 'nro', width: 8 },
      { header: 'CANTIDAD', key: 'cantidad', width: 12 },
      { header: 'EMPRESA', key: 'empresa', width: 20 },
      { header: 'AREA', key: 'area', width: 15 },
      { header: 'USUARIO', key: 'usuario', width: 25 },
      { header: 'TIPO', key: 'tipo', width: 15 },
      { header: 'MARCA', key: 'marca', width: 15 },
      { header: 'MODELO', key: 'modelo', width: 20 },
      { header: 'SERIAL', key: 'serial', width: 20 }
    ];

    // Create sheets
    const wsBodega = workbook.addWorksheet('BODEGA');
    wsBodega.columns = colsBodega;

    const wsConsumibles = workbook.addWorksheet('CONSUMIBLES');
    wsConsumibles.columns = colsConsumibles;

    const wsReciclaje = workbook.addWorksheet('RECICLAJE');
    wsReciclaje.columns = colsReciclaje;

    const wsAsignados = workbook.addWorksheet('ASIGNADOS USUARIOS');
    wsAsignados.columns = colsAsignados;

    const wsServidores = workbook.addWorksheet('SERVIDORES');
    wsServidores.columns = colsServidores;

    // Style helper for headers
    const styleHeaderRow = (ws: ExcelJS.Worksheet) => {
      const row = ws.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFF' } };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2563EB' } // Royal blue header
      };
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    };

    styleHeaderRow(wsBodega);
    styleHeaderRow(wsConsumibles);
    styleHeaderRow(wsReciclaje);
    styleHeaderRow(wsAsignados);
    styleHeaderRow(wsServidores);

    // Sorter and counter for each list
    let countBod = 0, countCons = 0, countRec = 0, countAsig = 0, countServ = 0;

    for (const act of activos) {
      // Determine sheet destination
      let destSheet: ExcelJS.Worksheet;
      let count = 0;

      const userDisplayName = act.persona_nombre || (act.bodega ? `En Bodega (${act.bodega})` : 'Bodega Central');

      if (act.tipo_inventario_nombre === 'Bodega') {
        destSheet = wsBodega;
        countBod++;
        count = countBod;
      } else if (act.tipo_inventario_nombre === 'Consumible') {
        destSheet = wsConsumibles;
        countCons++;
        count = countCons;
      } else if (act.tipo_inventario_nombre === 'Reciclaje' || act.estado === 'Reciclaje') {
        destSheet = wsReciclaje;
        countRec++;
        count = countRec;
      } else if (act.tipo_inventario_nombre === 'Asignado') {
        destSheet = wsAsignados;
        countAsig++;
        count = countAsig;
      } else if (act.tipo_inventario_nombre === 'Servidor' || (act.tipo_equipo_nombre && act.tipo_equipo_nombre.toLowerCase() === 'servidor')) {
        destSheet = wsServidores;
        countServ++;
        count = countServ;
      } else {
        // Fallbacks for assets created manually without excel source
        if (act.estado === 'Asignado') {
          destSheet = wsAsignados;
          countAsig++;
          count = countAsig;
        } else if (act.estado === 'Baja') {
          destSheet = wsReciclaje;
          countRec++;
          count = countRec;
        } else {
          destSheet = wsBodega;
          countBod++;
          count = countBod;
        }
      }

      // Prepare row values
      const rowData: any = {
        nro: count,
        cantidad: 1, // exported individually
        empresa: act.empresa_nombre || 'SMO',
        area: act.area || (act.persona_nombre ? 'Sistemas' : ''),
        usuario: userDisplayName,
        tipo: act.tipo_equipo_nombre || 'Otro',
        marca: act.marca,
        modelo: act.modelo,
        serial: act.serial || 'S/N',
        observaciones: act.observaciones || act.especificaciones || '',
        precio: act.precio_referencial || ''
      };

      destSheet.addRow(rowData);
    }

    // 2. Fetch and populate consumables
    const [consumiblesRows] = await pool.query<RowDataPacket[]>('SELECT * FROM consumible');
    
    // If technician, resolve company names for authorization filtering
    let assignedCompanyNames: string[] = [];
    if (isN1 && assignedEmpresaIds.length > 0) {
      const [empRows] = await pool.query<RowDataPacket[]>(
        `SELECT nombre FROM empresa WHERE id IN (${assignedEmpresaIds.map(() => '?').join(',')})`,
        assignedEmpresaIds
      );
      assignedCompanyNames = empRows.map(r => r.nombre.toLowerCase().trim());
    }

    for (const c of consumiblesRows) {
      const desc = c.descripcion || '';
      const getFieldVal = (label: string): string => {
        const regex = new RegExp(`${label}:\\s*([^,]+)(?:,|$)`);
        const match = desc.match(regex);
        return match ? match[1].trim() : '';
      };

      const empresa = getFieldVal('Sede') || 'SMO';
      
      // Filter by technician's companies if N1
      if (isN1 && assignedEmpresaIds.length > 0) {
        if (!assignedCompanyNames.includes(empresa.toLowerCase().trim())) {
          continue;
        }
      }

      countCons++;
      const area = getFieldVal('Área') || 'Sistemas';
      const usuario = getFieldVal('Usuario') || 'En Bodega';
      const serial = getFieldVal('Serial') || 'S/N';
      let precio = getFieldVal('Precio Ref');
      if (precio.startsWith('$')) {
        precio = precio.substring(1);
      }

      const nameParts = c.nombre.split(' ');
      const tipo = nameParts[0] || 'Consumible';
      const marca = nameParts[1] || 'Genérico';
      const modelo = nameParts.slice(2).join(' ') || 'N/A';

      wsConsumibles.addRow({
        nro: countCons,
        cantidad: c.stock_actual,
        empresa,
        area,
        usuario,
        tipo,
        marca,
        modelo,
        serial,
        precio: precio || ''
      });
    }

    return workbook;
  }
};
