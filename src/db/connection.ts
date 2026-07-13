import mysql from 'mysql2/promise';
import { config } from '../core/config';

// Create a connection pool using individual configurations
export const pool = mysql.createPool({
  host: config.DB_HOST,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  port: config.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0
});

// Test the connection
pool.getConnection()
  .then(async (connection) => {
    console.log('Successfully connected to the database.');
    connection.release();
    
    // Run schema migrations
    await initDbSchema();
  })
  .catch(err => {
    console.error('Error connecting to the database:', err);
  });

async function initDbSchema() {
  try {
    // 1. Create tipo_equipo table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tipo_equipo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        abreviacion VARCHAR(10) NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Check and add abreviacion column to tipo_equipo
    const [colsTipoEquipo] = await pool.query<any[]>(`SHOW COLUMNS FROM tipo_equipo`);
    const tipoEquipoColNames = colsTipoEquipo.map((c: any) => c.Field);
    if (!tipoEquipoColNames.includes('abreviacion')) {
      console.log('Adding abreviacion column to tipo_equipo table...');
      await pool.query(`ALTER TABLE tipo_equipo ADD COLUMN abreviacion VARCHAR(10) NULL UNIQUE`);
    }

    // Create tipo_inventario table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tipo_inventario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion VARCHAR(255) NULL
      ) ENGINE=InnoDB;
    `);

    // Seed default types
    const [typesCount] = await pool.query<any[]>(`SELECT COUNT(*) as count FROM tipo_inventario`);
    if (typesCount[0] && typesCount[0].count === 0) {
      console.log('Seeding default inventory types...');
      const defaultTypes = [
        { nombre: 'Bodega', descripcion: 'Bodega (Stock central/CC)' },
        { nombre: 'Consumibles y Suministros', descripcion: 'Consumibles y Suministros (Stock)' },
        { nombre: 'Reciclaje', descripcion: 'Reciclaje (Bajas de inventario)' },
        { nombre: 'Asignado a Usuarios', descripcion: 'Asignados a Usuarios (Custodios)' },
        { nombre: 'Servidores e Infraestructura', descripcion: 'Servidores e Infraestructura' }
      ];
      for (const t of defaultTypes) {
        await pool.query(`INSERT IGNORE INTO tipo_inventario (nombre, descripcion) VALUES (?, ?)`, [t.nombre, t.descripcion]);
      }
    }

    // Create historial_cambios_activo table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS historial_cambios_activo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activo_id INT NOT NULL,
        usuario_id INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cambios TEXT NOT NULL,
        CONSTRAINT fk_cambios_activo FOREIGN KEY (activo_id) REFERENCES activo (id) ON DELETE CASCADE,
        CONSTRAINT fk_cambios_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id)
      ) ENGINE=InnoDB;
    `);

    // 2. Check and modify activo table columns
    const [colsActivo] = await pool.query<any[]>(`SHOW COLUMNS FROM activo`);
    const colNames = colsActivo.map((c: any) => c.Field);

    if (!colNames.includes('tipo_equipo_id')) {
      console.log('Adding tipo_equipo_id column to activo table...');
      await pool.query(`ALTER TABLE activo ADD COLUMN tipo_equipo_id INT NULL`);
      await pool.query(`ALTER TABLE activo ADD CONSTRAINT fk_activo_tipo_equipo FOREIGN KEY (tipo_equipo_id) REFERENCES tipo_equipo(id) ON DELETE SET NULL`);
    }

    if (!colNames.includes('empresa_id')) {
      console.log('Adding empresa_id column to activo table...');
      await pool.query(`ALTER TABLE activo ADD COLUMN empresa_id INT NULL`);
      await pool.query(`ALTER TABLE activo ADD CONSTRAINT fk_activo_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id) ON DELETE SET NULL`);
    }

    if (!colNames.includes('bodega')) {
      console.log('Adding bodega column to activo table...');
      await pool.query(`ALTER TABLE activo ADD COLUMN bodega VARCHAR(150) NULL`);
    }

    if (!colNames.includes('area')) {
      console.log('Adding area column to activo table...');
      await pool.query(`ALTER TABLE activo ADD COLUMN area VARCHAR(100) NULL`);
    }

    if (!colNames.includes('precio_referencial')) {
      console.log('Adding precio_referencial column to activo table...');
      await pool.query(`ALTER TABLE activo ADD COLUMN precio_referencial DECIMAL(10,2) NULL`);
    }

    if (!colNames.includes('observaciones')) {
      console.log('Adding observaciones column to activo table...');
      await pool.query(`ALTER TABLE activo ADD COLUMN observaciones TEXT NULL`);
    }

    if (!colNames.includes('tipo_inventario_id')) {
      console.log('Adding tipo_inventario_id column to activo table...');
      await pool.query(`ALTER TABLE activo ADD COLUMN tipo_inventario_id INT NULL`);
      await pool.query(`ALTER TABLE activo ADD CONSTRAINT fk_activo_tipo_inventario FOREIGN KEY (tipo_inventario_id) REFERENCES tipo_inventario(id) ON DELETE SET NULL`);
    }

    if (colNames.includes('origen_excel')) {
      console.log('Dropping legacy origen_excel column from activo table...');
      try {
        await pool.query(`ALTER TABLE activo DROP COLUMN origen_excel`);
      } catch (err) {
        console.log('Could not drop origen_excel:', err);
      }
    }

    // Modify estado ENUM to include 'Reciclaje'
    console.log('Modifying estado column enum in activo table...');
    await pool.query(`ALTER TABLE activo MODIFY COLUMN estado ENUM('Stock','Asignado','Mantenimiento','Baja','Reciclaje') DEFAULT 'Stock'`);

    // Modify serial to be nullable and drop its UNIQUE index if it's unique
    try {
      console.log('Modifying serial column to be nullable...');
      await pool.query(`ALTER TABLE activo MODIFY COLUMN serial VARCHAR(100) NULL`);

      const [indexes] = await pool.query<any[]>(`SHOW INDEX FROM activo WHERE Key_name = 'serial'`);
      if (indexes && indexes.length > 0) {
        const isUnique = indexes.some((idx: any) => !idx.Non_unique);
        if (isUnique) {
          console.log('Unique index on serial found. Dropping unique constraint...');
          await pool.query(`ALTER TABLE activo DROP INDEX serial`);
          console.log('Adding non-unique index on serial...');
          await pool.query(`ALTER TABLE activo ADD INDEX idx_serial (serial)`);
        }
      }
    } catch (err: any) {
      console.log('Note on serial index migration:', err.message);
    }


    // 3. Pre-seed default equipment types if table is empty
    const [rows] = await pool.query<any[]>(`SELECT COUNT(*) as count FROM tipo_equipo`);
    if (rows[0] && rows[0].count === 0) {
      console.log('Seeding default equipment types...');
      const defaultTypes = [
        'Laptop', 'Monitor', 'Impresora', 'Teclado', 'Mouse', 
        'Cámara', 'Router', 'Switch', 'Servidor', 'Teléfono IP'
      ];
      for (const t of defaultTypes) {
        await pool.query(`INSERT IGNORE INTO tipo_equipo (nombre) VALUES (?)`, [t]);
      }
    }
    // 4. Check and modify guardia_feriado table columns
    const [colsGuardia] = await pool.query<any[]>(`SHOW COLUMNS FROM guardia_feriado`);
    const colNamesGuardia = colsGuardia.map((c: any) => c.Field);

    if (!colNamesGuardia.includes('empresa_id')) {
      console.log('Adding empresa_id column to guardia_feriado table...');
      try {
        await pool.query(`ALTER TABLE guardia_feriado DROP INDEX fecha`);
      } catch (err) {
        console.log('Could not drop index "fecha", maybe it does not exist:', err);
      }
      await pool.query(`ALTER TABLE guardia_feriado ADD COLUMN empresa_id INT NULL`);
      await pool.query(`ALTER TABLE guardia_feriado ADD CONSTRAINT fk_guardia_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id) ON DELETE CASCADE`);
      await pool.query(`ALTER TABLE guardia_feriado ADD UNIQUE INDEX uq_fecha_empresa (fecha, empresa_id)`);
      console.log('guardia_feriado migration completed.');
    }

    // 5. Check and modify proyecto table columns to add miembros
    const [colsProyecto] = await pool.query<any[]>(`SHOW COLUMNS FROM proyecto`);
    const colNamesProyecto = colsProyecto.map((c: any) => c.Field);
    if (!colNamesProyecto.includes('miembros')) {
      console.log('Adding miembros column to proyecto table...');
      await pool.query(`ALTER TABLE proyecto ADD COLUMN miembros TEXT NULL`);
      console.log('proyecto table migration completed.');
    }

    console.log('Database schema initialization completed.');
  } catch (error) {
    console.error('Error running auto migrations:', error);
  }
}
