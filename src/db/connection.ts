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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
