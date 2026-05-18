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
    'chat_mensaje', 'chat_canal_miembro', 'chat_canal', 'proyecto_historial',
    'proyecto_archivo', 'proyecto_comentario', 'subtarea_proyecto', 'tarea_proyecto',
    'proyecto', 'movimiento_inventario', 'activo', 'consumible',
    'guardia_feriado', 'ticket', 'usuario_empresa', 'usuario', 'persona', 'empresa', 'rol',
    'plantilla_recurrente', 'proveedor'
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

    CREATE TABLE proveedor (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL UNIQUE,
      contacto VARCHAR(150),
      telefono VARCHAR(50),
      email VARCHAR(150)
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
      proveedor_id INT,
      fecha_compra DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (persona_id) REFERENCES persona(id),
      FOREIGN KEY (proveedor_id) REFERENCES proveedor(id)
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
      medio_solicitud ENUM('Plataforma','WhatsApp','Llamada','Correo','Presencial','Automático (Recurrente)','Automático (Inventario)') DEFAULT 'Plataforma',
      fecha_final_tentativa DATETIME,
      avance_proceso INT DEFAULT 0,
      observaciones TEXT,
      prioridad ENUM('Baja','Media','Alta','Critica') DEFAULT 'Media',
      estado ENUM('Nuevo','Pendiente','Pruebas','Finalizada','En Proceso','Escalado a Proyecto') DEFAULT 'Nuevo',
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
      fecha_fin_estimada DATETIME NOT NULL,
      avance_porcentaje INT DEFAULT 0,
      estado ENUM('Stand By', 'Sin Iniciar', 'En Proceso', 'Pruebas', 'Finalizado') DEFAULT 'Sin Iniciar',
      tipo_proyecto VARCHAR(100) DEFAULT 'Otro',
      creador_id INT NOT NULL,
      ticket_origen_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creador_id) REFERENCES usuario(id),
      FOREIGN KEY (ticket_origen_id) REFERENCES ticket(id) ON DELETE SET NULL
    );

    CREATE TABLE tarea_proyecto (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proyecto_id INT NOT NULL,
      titulo VARCHAR(200) NOT NULL,
      descripcion TEXT,
      fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_fin DATETIME NOT NULL,
      avance_porcentaje INT DEFAULT 0,
      estado ENUM('Stand By', 'Sin Iniciar', 'En Proceso', 'Pruebas', 'Finalizado') DEFAULT 'Sin Iniciar',
      responsable_id INT NOT NULL,
      ticket_origen_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proyecto_id) REFERENCES proyecto(id) ON DELETE CASCADE,
      FOREIGN KEY (responsable_id) REFERENCES usuario(id),
      FOREIGN KEY (ticket_origen_id) REFERENCES ticket(id) ON DELETE SET NULL
    );

    CREATE TABLE subtarea_proyecto (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tarea_id INT NOT NULL,
      titulo VARCHAR(200) NOT NULL,
      descripcion TEXT,
      fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_fin DATETIME NOT NULL,
      avance_porcentaje INT DEFAULT 0,
      estado ENUM('Stand By', 'Sin Iniciar', 'En Proceso', 'Pruebas', 'Finalizado') DEFAULT 'Sin Iniciar',
      responsable_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tarea_id) REFERENCES tarea_proyecto(id) ON DELETE CASCADE,
      FOREIGN KEY (responsable_id) REFERENCES usuario(id)
    );

    CREATE TABLE proyecto_comentario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      autor_id INT NOT NULL,
      proyecto_id INT DEFAULT NULL,
      tarea_id INT DEFAULT NULL,
      subtarea_id INT DEFAULT NULL,
      contenido TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (autor_id) REFERENCES usuario(id),
      FOREIGN KEY (proyecto_id) REFERENCES proyecto(id) ON DELETE CASCADE,
      FOREIGN KEY (tarea_id) REFERENCES tarea_proyecto(id) ON DELETE CASCADE,
      FOREIGN KEY (subtarea_id) REFERENCES subtarea_proyecto(id) ON DELETE CASCADE
    );

    CREATE TABLE proyecto_archivo (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre_original VARCHAR(255) NOT NULL,
      nombre_guardado VARCHAR(255) NOT NULL,
      mimetype VARCHAR(150),
      tamano_bytes INT,
      autor_id INT NOT NULL,
      proyecto_id INT DEFAULT NULL,
      tarea_id INT DEFAULT NULL,
      subtarea_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (autor_id) REFERENCES usuario(id),
      FOREIGN KEY (proyecto_id) REFERENCES proyecto(id) ON DELETE CASCADE,
      FOREIGN KEY (tarea_id) REFERENCES tarea_proyecto(id) ON DELETE CASCADE,
      FOREIGN KEY (subtarea_id) REFERENCES subtarea_proyecto(id) ON DELETE CASCADE
    );

    CREATE TABLE proyecto_historial (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proyecto_id INT NOT NULL,
      usuario_id INT NOT NULL,
      descripcion_cambio TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proyecto_id) REFERENCES proyecto(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuario(id)
    );

    CREATE TABLE chat_canal (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL UNIQUE,
      is_private BOOLEAN DEFAULT FALSE,
      creador_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creador_id) REFERENCES usuario(id)
    );

    CREATE TABLE chat_canal_miembro (
      canal_id INT NOT NULL,
      usuario_id INT NOT NULL,
      PRIMARY KEY (canal_id, usuario_id),
      FOREIGN KEY (canal_id) REFERENCES chat_canal(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
    );

    CREATE TABLE chat_mensaje (
      id INT AUTO_INCREMENT PRIMARY KEY,
      canal_id INT NOT NULL,
      usuario_id INT NOT NULL,
      mensaje TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (canal_id) REFERENCES chat_canal(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
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

  console.log('🔌 Insertando proveedores...');
  const proveedores = [
    { nombre: 'TecnoGlobal S.A.', contacto: 'Juan Pérez', telefono: '0999999999', email: 'ventas@tecnoglobal.com' },
    { nombre: 'CompuWorld Ecuador', contacto: 'María Gómez', telefono: '0988888888', email: 'contacto@compuworld.com' },
    { nombre: 'HP Ecuador', contacto: 'Carlos Ruiz', telefono: '0977777777', email: 'soporte@hp.com.ec' }
  ];
  for (const p of proveedores) {
    await conn.query(
      `INSERT INTO proveedor (nombre, contacto, telefono, email) VALUES (?, ?, ?, ?)`,
      [p.nombre, p.contacto, p.telefono, p.email]
    );
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

  console.log('👤 Creando usuarios Técnicos y de Sede...');
  const [techRolRows]: any = await conn.query(`SELECT id FROM rol WHERE nombre = 'TECNICO'`);
  const techRolId = techRolRows[0].id;
  const [userRolRows]: any = await conn.query(`SELECT id FROM rol WHERE nombre = 'USUARIO'`);
  const userRolId = userRolRows[0].id;

  const techHash = await bcrypt.hash('tech123', 12);
  const userHash = await bcrypt.hash('user123', 12);

  // 1. Santi Condado (CONDADO)
  const [santiResult]: any = await conn.query(
    `INSERT INTO usuario (email, hashed_password, nombre_completo, is_active, rol_id) VALUES (?, ?, ?, ?, ?)`,
    ['santi@smo.com', techHash, 'Santi Condado', true, techRolId]
  );
  const [condadoRows]: any = await conn.query(`SELECT id FROM empresa WHERE nombre = 'CONDADO'`);
  if (condadoRows.length > 0) {
    await conn.query(`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (?, ?)`, [santiResult.insertId, condadoRows[0].id]);
  }

  // 2. Fide Scala (SCALA)
  const [fideResult]: any = await conn.query(
    `INSERT INTO usuario (email, hashed_password, nombre_completo, is_active, rol_id) VALUES (?, ?, ?, ?, ?)`,
    ['fide@smo.com', techHash, 'Fide Scala', true, techRolId]
  );
  const [scalaRows]: any = await conn.query(`SELECT id FROM empresa WHERE nombre = 'SCALA'`);
  if (scalaRows.length > 0) {
    await conn.query(`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (?, ?)`, [fideResult.insertId, scalaRows[0].id]);
  }

  // 3. Gabo CCI (CCI)
  const [gaboResult]: any = await conn.query(
    `INSERT INTO usuario (email, hashed_password, nombre_completo, is_active, rol_id) VALUES (?, ?, ?, ?, ?)`,
    ['gabo@smo.com', techHash, 'Gabo CCI', true, techRolId]
  );
  const [cciRows]: any = await conn.query(`SELECT id FROM empresa WHERE nombre = 'CCI'`);
  if (cciRows.length > 0) {
    await conn.query(`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (?, ?)`, [gaboResult.insertId, cciRows[0].id]);
  }

  // 4. Cliente Condado (USUARIO)
  const [userResult]: any = await conn.query(
    `INSERT INTO usuario (email, hashed_password, nombre_completo, is_active, rol_id) VALUES (?, ?, ?, ?, ?)`,
    ['user@smo.com', userHash, 'Cliente Condado', true, userRolId]
  );
  if (condadoRows.length > 0) {
    await conn.query(`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (?, ?)`, [userResult.insertId, condadoRows[0].id]);
  }

  console.log('🌱 Creando canales de chat mock...');
  // 1. Canal General (Público)
  const [generalCanal]: any = await conn.query(
    `INSERT INTO chat_canal (nombre, is_private, creador_id) VALUES (?, ?, ?)`,
    ['general', false, adminId]
  );
  // 2. Canal Directores (Privado)
  const [directoresCanal]: any = await conn.query(
    `INSERT INTO chat_canal (nombre, is_private, creador_id) VALUES (?, ?, ?)`,
    ['directores', true, adminId]
  );
  // Unir miembros al canal privado
  await conn.query(`INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (?, ?)`, [directoresCanal.insertId, adminId]);
  await conn.query(`INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (?, ?)`, [directoresCanal.insertId, santiResult.insertId]);

  console.log('🌱 Insertando mensajes de chat mock...');
  await conn.query(
    `INSERT INTO chat_mensaje (canal_id, usuario_id, mensaje) VALUES (?, ?, ?)`,
    [generalCanal.insertId, adminId, '¡Bienvenidos al chat oficial de SMO IT CORE! 🚀']
  );
  await conn.query(
    `INSERT INTO chat_mensaje (canal_id, usuario_id, mensaje) VALUES (?, ?, ?)`,
    [generalCanal.insertId, santiResult.insertId, 'Excelente. Reportándose para soporte semanal. 🫡']
  );

  console.log('🌱 Creando proyectos mock...');
  const [proy1]: any = await conn.query(
    `INSERT INTO proyecto (nombre, descripcion, fecha_inicio, fecha_fin_estimada, avance_porcentaje, estado, tipo_proyecto, creador_id)
     VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 10 DAY), 0, 'En Proceso', 'Infraestructura', ?)`,
    ['Renovación Servidor Central SMO', 'Migración del servidor principal físico de la sede a un clúster virtualizado.', adminId]
  );

  const [proy2]: any = await conn.query(
    `INSERT INTO proyecto (nombre, descripcion, fecha_inicio, fecha_fin_estimada, avance_porcentaje, estado, tipo_proyecto, creador_id)
     VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 15 DAY), 0, 'Sin Iniciar', 'Desarrollo', ?)`,
    ['Migración Correo Corporativo a Microsoft 365', 'Traspaso de cuentas POP3/IMAP locales hacia la nube de Microsoft 365.', adminId]
  );

  console.log('🌱 Creando tareas de proyecto mock...');
  const [t1]: any = await conn.query(
    `INSERT INTO tarea_proyecto (proyecto_id, titulo, descripcion, fecha_inicio, fecha_fin, avance_porcentaje, estado, responsable_id)
     VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 5 DAY), 0, 'En Proceso', ?)`,
    [proy1.insertId, 'Configurar Servidores DNS', 'Crear y validar zonas DNS, registros MX y SPF en Cloudflare.', santiResult.insertId]
  );

  const [t2]: any = await conn.query(
    `INSERT INTO tarea_proyecto (proyecto_id, titulo, descripcion, fecha_inicio, fecha_fin, avance_porcentaje, estado, responsable_id)
     VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 8 DAY), 0, 'Sin Iniciar', ?)`,
    [proy2.insertId, 'Auditoría de Buzones de Correo', 'Levantamiento de capacidades de disco y contraseñas de los usuarios actuales.', fideResult.insertId]
  );

  console.log('🌱 Creando subtareas de proyecto mock...');
  await conn.query(
    `INSERT INTO subtarea_proyecto (tarea_id, titulo, descripcion, fecha_inicio, fecha_fin, avance_porcentaje, estado, responsable_id)
     VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY), 0, 'En Proceso', ?),
            (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 4 DAY), 0, 'Sin Iniciar', ?)`,
    [
      t1.insertId, 'Revisar Zonas DNS Actuales', 'Exportar archivo BIND de configuración de DNS vieja.', santiResult.insertId,
      t1.insertId, 'Validar Propagación DNS global', 'Comprobación vía herramientas tipo DNSChecker.', santiResult.insertId
    ]
  );

  console.log('🌱 Creando comentarios y auditoría mock...');
  await conn.query(
    `INSERT INTO proyecto_comentario (autor_id, proyecto_id, contenido)
     VALUES (?, ?, ?)`,
    [adminId, proy1.insertId, 'Favor prestar especial atención a los tiempos límite de la renovación. ¡Buen trabajo!']
  );

  await conn.query(
    `INSERT INTO proyecto_historial (proyecto_id, usuario_id, descripcion_cambio)
     VALUES (?, ?, ?)`,
    [proy1.insertId, adminId, 'El usuario Administrador Sistema creó el proyecto en estado Sin Iniciar']
  );

  await conn.query(
    `INSERT INTO proyecto_historial (proyecto_id, usuario_id, descripcion_cambio)
     VALUES (?, ?, ?)`,
    [proy1.insertId, adminId, 'El usuario Administrador Sistema cambió el estado del proyecto a En Proceso']
  );

  console.log('\n✅ Base de datos reiniciada exitosamente.');
  console.log('   📧 admin@smo.com   | 🔑 admin123 (ADMIN)');
  console.log('   📧 santi@smo.com   | 🔑 tech123  (TECNICO - CONDADO)');
  console.log('   📧 fide@smo.com    | 🔑 tech123  (TECNICO - SCALA)');
  console.log('   📧 gabo@smo.com    | 🔑 tech123  (TECNICO - CCI)');
  console.log('   📧 user@smo.com    | 🔑 user123  (USUARIO - CONDADO)\n');

  await conn.end();
}

forceSeed().catch(err => {
  console.error('❌ Error crítico en el seed:', err);
  process.exit(1);
});
