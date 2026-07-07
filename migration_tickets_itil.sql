-- ==============================================================
-- MIGRACIÓN DE BASE DE DATOS: SOPORTE POR NIVELES (ITIL) & RECURRENCIAS
-- ==============================================================

USE smo_it_core;

-- 1. Agregar nivel de soporte y grupo N2 a los usuarios (técnicos)
ALTER TABLE usuario ADD COLUMN nivel_soporte ENUM('N1', 'N2') DEFAULT 'N1';
ALTER TABLE usuario ADD COLUMN grupo_n2 ENUM('Infraestructura', 'Desarrollo') DEFAULT NULL;

-- Actualizar técnicos por defecto a N1 y N2 para pruebas
UPDATE usuario SET nivel_soporte = 'N1' WHERE rol_id = 2;
UPDATE usuario SET nivel_soporte = 'N2', grupo_n2 = 'Infraestructura' WHERE id = 8; -- Laura Datatrust
UPDATE usuario SET nivel_soporte = 'N2', grupo_n2 = 'Desarrollo' WHERE id = 9; -- Diego Teatro

-- 2. Modificar la tabla ticket para soportar niveles ITIL y pausa de SLAs
-- Modificar estado para incluir 'Escalado a Proveedor'
ALTER TABLE ticket MODIFY COLUMN estado ENUM('Nuevo','Pendiente','Pruebas','Finalizada','En Proceso','Escalado a Proyecto','Escalado a Proveedor') DEFAULT 'Nuevo';

-- Agregar columna de nivel de soporte del ticket y grupo N2
ALTER TABLE ticket ADD COLUMN nivel_soporte ENUM('N1', 'N2', 'N3') DEFAULT 'N1';
ALTER TABLE ticket ADD COLUMN grupo_n2 ENUM('Infraestructura', 'Desarrollo') DEFAULT NULL;

-- Agregar columnas para registrar pausas en el SLA
ALTER TABLE ticket ADD COLUMN sla_paused_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE ticket ADD COLUMN sla_acumulado_pausa_segundos INT DEFAULT 0;

-- 3. Eliminar la tabla obsoleta de plantillas de soporte
DROP TABLE IF EXISTS plantilla_recurrente;

-- 4. Crear la nueva tabla para gestionar Soportes Recurrentes (mantenimientos, revisiones, etc.)
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
