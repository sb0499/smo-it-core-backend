import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  multipleStatements: true
};

const DB_NAME = 'smo_it_core';

async function forceSeed() {
  const conn = await mysql.createConnection(DB_CONFIG);

  console.log('📦 Creando base de datos si no existe...');
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB_NAME}\``);

  console.log('🗑️  Eliminando tablas (con FOREIGN_KEY_CHECKS desactivado)...');
  await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);
  const tables = [
    'tarea_interna', 'proyecto', 'movimiento_inventario', 'activo', 'consumible',
    'guardia_feriado', 'ticket', 'usuario_empresa', 'usuario', 'persona', 'empresa', 'rol',
    'plantilla_recurrente'
  ];
  for (const t of tables) {
    await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
  }
  await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);

  console.log('🏗️  Creando tablas...');
  await conn.query(`
    CREATE TABLE rol (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL UNIQUE,
      descripcion VARCHAR(255)
    );

    CREATE TABLE empresa (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL UNIQUE
    );

    CREATE TABLE usuario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(150) NOT NULL UNIQUE,
      hashed_password VARCHAR(255) NOT NULL,
      nombre_completo VARCHAR(150) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      rol_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (rol_id) REFERENCES rol(id)
    );

    CREATE TABLE usuario_empresa (
      usuario_id INT NOT NULL,
      empresa_id INT NOT NULL,
      PRIMARY KEY (usuario_id, empresa_id),
      FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
      FOREIGN KEY (empresa_id) REFERENCES empresa(id) ON DELETE CASCADE
    );

    CREATE TABLE persona (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cedula VARCHAR(20) NOT NULL UNIQUE,
      nombre VARCHAR(150) NOT NULL,
      telefono VARCHAR(20),
      departamento VARCHAR(100),
      cargo VARCHAR(100),
      empresa_id INT NOT NULL,
      FOREIGN KEY (empresa_id) REFERENCES empresa(id)
    );

    CREATE TABLE activo (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(50) NOT NULL UNIQUE,
      serial VARCHAR(100) NOT NULL UNIQUE,
      marca VARCHAR(100) NOT NULL,
      modelo VARCHAR(100) NOT NULL,
      especificaciones TEXT,
      estado ENUM('Stock','Asignado','Mantenimiento','Baja') DEFAULT 'Stock',
      persona_id INT,
      fecha_compra DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (persona_id) REFERENCES persona(id)
    );

    CREATE TABLE movimiento_inventario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      activo_id INT NOT NULL,
      desde_persona_id INT,
      hacia_persona_id INT,
      usuario_id INT NOT NULL,
      tipo VARCHAR(50),
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      observaciones VARCHAR(255),
      FOREIGN KEY (activo_id) REFERENCES activo(id),
      FOREIGN KEY (desde_persona_id) REFERENCES persona(id),
      FOREIGN KEY (hacia_persona_id) REFERENCES persona(id),
      FOREIGN KEY (usuario_id) REFERENCES usuario(id)
    );

    CREATE TABLE consumible (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      descripcion VARCHAR(255),
      unidad_medida VARCHAR(50) NOT NULL,
      stock_actual INT DEFAULT 0,
      stock_minimo INT DEFAULT 5
    );

    CREATE TABLE ticket (
      id INT AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(255) NOT NULL,
      descripcion TEXT NOT NULL,
      categoria VARCHAR(100) NOT NULL,
      empresa_id INT,
      area_solicitante VARCHAR(100),
      persona_solicitante VARCHAR(150),
      medio_solicitud ENUM('Plataforma','WhatsApp','Llamada','Correo','Presencial','Automático (Recurrente)') DEFAULT 'Plataforma',
      fecha_final_tentativa DATETIME,
      avance_proceso INT DEFAULT 0,
      observaciones TEXT,
      prioridad ENUM('Baja','Media','Alta','Critica') DEFAULT 'Media',
      estado ENUM('Nuevo','Pendiente','Pruebas','Finalizada','En Proceso') DEFAULT 'Nuevo',
      bitacora_dinamica JSON,
      creador_id INT NOT NULL,
      tecnico_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (empresa_id) REFERENCES empresa(id),
      FOREIGN KEY (creador_id) REFERENCES usuario(id),
      FOREIGN KEY (tecnico_id) REFERENCES usuario(id)
    );

    CREATE TABLE guardia_feriado (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fecha DATE NOT NULL UNIQUE,
      tecnico_id INT NOT NULL,
      observaciones TEXT,
      FOREIGN KEY (tecnico_id) REFERENCES usuario(id)
    );

    CREATE TABLE proyecto (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(200) NOT NULL,
      descripcion TEXT,
      fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_fin_estimada DATETIME
    );

    CREATE TABLE tarea_interna (
      id INT AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(200) NOT NULL,
      descripcion TEXT,
      estado ENUM('Pendiente','En Progreso','Resuelto') DEFAULT 'Pendiente',
      proyecto_id INT NOT NULL,
      ticket_origen_id INT,
      responsable_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proyecto_id) REFERENCES proyecto(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_origen_id) REFERENCES ticket(id),
      FOREIGN KEY (responsable_id) REFERENCES usuario(id)
    );

    CREATE TABLE plantilla_recurrente (
      id INT AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(255) NOT NULL,
      descripcion TEXT NOT NULL,
      categoria VARCHAR(100) NOT NULL,
      empresa VARCHAR(100),
      area_solicitante VARCHAR(100),
      is_active BOOLEAN DEFAULT TRUE
    );
  `);

  console.log('🌱 Insertando roles...');
  const roles = ['ADMIN', 'TECNICO', 'USUARIO'];
  for (const r of roles) {
    await conn.query(`INSERT INTO rol (nombre, descripcion) VALUES (?, ?)`, [r, `Rol de ${r}`]);
  }

  console.log('🏢 Insertando empresas...');
  const empresas = ['CONDADO', 'SCALA', 'POMASQUI', 'CCI', 'SMO', 'PORTOSHOPPING', 'GAMETOWN', 'APPARCA', 'DATATRUST', 'EL TEATRO'];
  for (const e of empresas) {
    await conn.query(`INSERT INTO empresa (nombre) VALUES (?)`, [e]);
  }

  console.log('👤 Creando usuario ADMIN...');
  const [rolRows]: any = await conn.query(`SELECT id FROM rol WHERE nombre = 'ADMIN'`);
  const rolId = rolRows[0].id;
  const hash = await bcrypt.hash('admin123', 12);
  const [adminResult]: any = await conn.query(
    `INSERT INTO usuario (email, hashed_password, nombre_completo, is_active, rol_id) VALUES (?, ?, ?, ?, ?)`,
    ['admin@smo.com', hash, 'Administrador Sistema', true, rolId]
  );
  const adminId = adminResult.insertId;

  const [empRows]: any = await conn.query(`SELECT id FROM empresa`);
  for (const e of empRows) {
    await conn.query(`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (?, ?)`, [adminId, e.id]);
  }

  console.log('\n✅ Base de datos reiniciada exitosamente.');
  console.log('   📧 admin@smo.com | 🔑 admin123\n');

  await conn.end();
}

forceSeed().catch(err => {
  console.error('❌ Error crítico en el seed:', err);
  process.exit(1);
});
