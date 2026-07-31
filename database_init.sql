CREATE DATABASE IF NOT EXISTS smo_it_core CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smo_it_core;

-- 1. rol
CREATE TABLE IF NOT EXISTS rol (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255)
) ENGINE=InnoDB;

-- 2. empresa
CREATE TABLE IF NOT EXISTS empresa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- 3. usuario
CREATE TABLE IF NOT EXISTS usuario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL UNIQUE,
  hashed_password VARCHAR(255) NOT NULL,
  nombre_completo VARCHAR(150) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  rol_id INT NOT NULL,
  must_change_password BOOLEAN DEFAULT FALSE,
  nivel_soporte ENUM('N1', 'N2') DEFAULT 'N1',
  grupo_n2 ENUM('Infraestructura', 'Desarrollo') DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id) REFERENCES rol(id)
) ENGINE=InnoDB;

-- 4. notificacion
CREATE TABLE IF NOT EXISTS notificacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT NOT NULL,
  leido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. usuario_empresa
CREATE TABLE IF NOT EXISTS usuario_empresa (
  usuario_id INT NOT NULL,
  empresa_id INT NOT NULL,
  PRIMARY KEY (usuario_id, empresa_id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresa(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. proveedor
CREATE TABLE IF NOT EXISTS proveedor (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  contacto VARCHAR(150),
  telefono VARCHAR(50),
  email VARCHAR(150)
) ENGINE=InnoDB;

-- 7. persona
CREATE TABLE IF NOT EXISTS persona (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cedula VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(20),
  departamento VARCHAR(100),
  cargo VARCHAR(100),
  empresa_id INT NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresa(id)
) ENGINE=InnoDB;

-- 8. activo
CREATE TABLE IF NOT EXISTS activo (
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
) ENGINE=InnoDB;

-- 9. movimiento_inventario
CREATE TABLE IF NOT EXISTS movimiento_inventario (
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
) ENGINE=InnoDB;

-- 10. consumible
CREATE TABLE IF NOT EXISTS consumible (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  descripcion VARCHAR(255),
  unidad_medida VARCHAR(50) NOT NULL,
  stock_actual INT DEFAULT 0,
  stock_minimo INT DEFAULT 5
) ENGINE=InnoDB;

-- 11. categoria_ticket
CREATE TABLE IF NOT EXISTS categoria_ticket (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 12. ticket
CREATE TABLE IF NOT EXISTS ticket (
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
  estado ENUM('Nuevo','Pendiente','Pruebas','Finalizada','En Proceso','Escalado a Proyecto','Escalado a Proveedor') DEFAULT 'Nuevo',
  nivel_soporte ENUM('N1','N2','N3') DEFAULT 'N1',
  grupo_n2 ENUM('Infraestructura', 'Desarrollo') DEFAULT NULL,
  sla_paused_at TIMESTAMP NULL DEFAULT NULL,
  sla_acumulado_pausa_segundos INT DEFAULT 0,
  bitacora_dinamica JSON,
  creador_id INT NOT NULL,
  tecnico_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresa(id),
  FOREIGN KEY (creador_id) REFERENCES usuario(id),
  FOREIGN KEY (tecnico_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- 13. guardia_feriado
CREATE TABLE IF NOT EXISTS guardia_feriado (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  tecnico_id INT NOT NULL,
  observaciones TEXT,
  FOREIGN KEY (tecnico_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- 14. proyecto
CREATE TABLE IF NOT EXISTS proyecto (
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
) ENGINE=InnoDB;

-- 15. tarea_proyecto
CREATE TABLE IF NOT EXISTS tarea_proyecto (
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
) ENGINE=InnoDB;

-- 16. subtarea_proyecto
CREATE TABLE IF NOT EXISTS subtarea_proyecto (
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
) ENGINE=InnoDB;

-- 17. proyecto_comentario
CREATE TABLE IF NOT EXISTS proyecto_comentario (
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
) ENGINE=InnoDB;

-- 18. proyecto_archivo
CREATE TABLE IF NOT EXISTS proyecto_archivo (
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
) ENGINE=InnoDB;

-- 19. proyecto_historial
CREATE TABLE IF NOT EXISTS proyecto_historial (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proyecto_id INT NOT NULL,
  usuario_id INT NOT NULL,
  descripcion_cambio TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyecto(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- 20. chat_canal
CREATE TABLE IF NOT EXISTS chat_canal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  is_private BOOLEAN DEFAULT FALSE,
  is_dm BOOLEAN DEFAULT FALSE,
  creador_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creador_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- 21. chat_canal_miembro
CREATE TABLE IF NOT EXISTS chat_canal_miembro (
  canal_id INT NOT NULL,
  usuario_id INT NOT NULL,
  PRIMARY KEY (canal_id, usuario_id),
  FOREIGN KEY (canal_id) REFERENCES chat_canal(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 22. chat_mensaje
CREATE TABLE IF NOT EXISTS chat_mensaje (
  id INT AUTO_INCREMENT PRIMARY KEY,
  canal_id INT NOT NULL,
  usuario_id INT NOT NULL,
  mensaje TEXT NOT NULL,
  archivo_nombre VARCHAR(255) DEFAULT NULL,
  archivo_ruta VARCHAR(255) DEFAULT NULL,
  archivo_mimetype VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canal_id) REFERENCES chat_canal(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 23. soporte_recurrente
CREATE TABLE IF NOT EXISTS soporte_recurrente (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  empresa_id INT, -- Centro Comercial (CC)
  area_solicitante VARCHAR(100),
  persona_solicitante VARCHAR(150),
  prioridad ENUM('Baja','Media','Alta','Critica') DEFAULT 'Media',
  frecuencia ENUM('Diario','Semanal','Mensual','Trimestral','Semestral','Anual') NOT NULL,
  fecha_inicio DATE NOT NULL,
  siguiente_ejecucion DATE NOT NULL,
  ultima_ejecucion DATE DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresa(id) ON DELETE SET NULL
) ENGINE=InnoDB;


-- ==========================================
-- SEEDS E INSERCIONES DE DATOS POR DEFECTO
-- ==========================================

-- Insertar roles
INSERT INTO rol (id, nombre, descripcion) VALUES
(1, 'ADMIN', 'Rol de ADMIN'),
(2, 'TECNICO', 'Rol de TECNICO'),
(3, 'USUARIO', 'Rol de USUARIO'),
(4, 'SUPERVISOR', 'Rol de SUPERVISOR')
ON DUPLICATE KEY UPDATE nombre=nombre;

-- Insertar empresas/sedes
INSERT INTO empresa (id, nombre) VALUES
(1, 'CONDADO'),
(2, 'SCALA'),
(3, 'POMASQUI'),
(4, 'CCI'),
(5, 'SMO'),
(6, 'PORTOSHOPPING'),
(7, 'GAMETOWN'),
(8, 'APPARCA'),
(9, 'DATATRUST'),
(10, 'EL TEATRO')
ON DUPLICATE KEY UPDATE nombre=nombre;

-- Insertar categorías por defecto
INSERT INTO categoria_ticket (id, nombre) VALUES
(1, 'Sistemas'),
(2, 'Redes'),
(3, 'Hardware'),
(4, 'Software'),
(5, 'Cámaras'),
(6, 'Impresoras')
ON DUPLICATE KEY UPDATE nombre=nombre;

-- Insertar proveedores por defecto
INSERT INTO proveedor (id, nombre, contacto, telefono, email) VALUES
(1, 'TecnoGlobal S.A.', 'Juan Pérez', '0999999999', 'ventas@tecnoglobal.com'),
(2, 'CompuWorld Ecuador', 'María Gómez', '0988888888', 'contacto@compuworld.com'),
(3, 'HP Ecuador', 'Carlos Ruiz', '0977777777', 'soporte@hp.com.ec')
ON DUPLICATE KEY UPDATE nombre=nombre;

-- Insertar usuarios iniciales
-- Claves encriptadas por defecto:
-- Admin: admin@smo.com | admin123
-- Técnicos: tech123 (santi@smo.com, fide@smo.com, gabo@smo.com, carlos@smo.com, etc.)
-- Sede/Usuario: user123 (user@smo.com)
INSERT INTO usuario (id, email, hashed_password, nombre_completo, is_active, rol_id, must_change_password, nivel_soporte, grupo_n2) VALUES
(1, 'admin@smo.com', '$2a$10$90/Ku5J22/UExoZxU2oATOw/zIB0rhlsywIItUa5myqzgjaT11eki', 'Administrador Sistema', 1, 1, 0, 'N1', NULL),
(2, 'santi@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Santi Condado', 1, 2, 1, 'N1', NULL),
(3, 'fide@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Fide Scala', 1, 2, 1, 'N1', NULL),
(4, 'gabo@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Gabo CCI', 1, 2, 1, 'N1', NULL),
(5, 'carlos@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Carlos Portoshopping', 1, 2, 1, 'N1', NULL),
(6, 'ana@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Ana Gametown', 1, 2, 1, 'N1', NULL),
(7, 'pedro@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Pedro Aparca', 1, 2, 1, 'N1', NULL),
(8, 'laura@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Laura Datatrust', 1, 2, 1, 'N2', 'Infraestructura'),
(9, 'diego@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Diego Teatro', 1, 2, 1, 'N2', 'Desarrollo'),
(10, 'juan@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Juan Pomasqui', 1, 2, 1, 'N1', NULL),
(11, 'maria@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Maria Portocarrero', 1, 2, 1, 'N1', NULL),
(12, 'andres@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Andres Lopez', 1, 2, 1, 'N1', NULL),
(13, 'sofia@smo.com', '$2a$10$LjnA3fyNA2J4p8XhYI.04uEAZxuKSHOrVy1.VLr5wqnqBPCBWqcdK', 'Sofia Martinez', 1, 2, 1, 'N1', NULL),
(14, 'user@smo.com', '$2a$10$7q6Q8c9a3d4Umr7ru778wOrVoC/AQ6dz/iCtMsGep2ZQH9n0VBmie', 'Cliente Condado', 1, 3, 0, 'N1', NULL)
ON DUPLICATE KEY UPDATE hashed_password=values(hashed_password);

-- Asignar empresas/sedes a los usuarios
INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8), (1, 9), (1, 10), -- Admin a todo
(2, 1),  -- Santi a Condado
(3, 2),  -- Fide a Scala
(4, 4),  -- Gabo a CCI
(5, 6),  -- Carlos a Portoshopping
(6, 7),  -- Ana a Gametown
(7, 8),  -- Pedro a Apparca
(8, 9),  -- Laura a Datatrust
(9, 10), -- Diego a El Teatro
(10, 3), -- Juan a Pomasqui
(11, 6), -- Maria a Portoshopping
(12, 5), -- Andres a SMO
(13, 5), -- Sofia a SMO
(14, 1)  -- Cliente a Condado
ON DUPLICATE KEY UPDATE usuario_id=usuario_id;

-- Canales de chat por defecto
INSERT INTO chat_canal (id, nombre, is_private, is_dm, creador_id) VALUES
(1, 'general', 0, 0, 1),
(2, 'directores', 1, 0, 1)
ON DUPLICATE KEY UPDATE nombre=nombre;

INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES
(2, 1),
(2, 2)
ON DUPLICATE KEY UPDATE canal_id=canal_id;

INSERT INTO chat_mensaje (canal_id, usuario_id, mensaje) VALUES
(1, 1, '¡Bienvenidos al chat oficial de SMO IT CORE! 🚀'),
(1, 2, 'Excelente. Reportándose para soporte semanal. 🫡')
ON DUPLICATE KEY UPDATE mensaje=mensaje;
