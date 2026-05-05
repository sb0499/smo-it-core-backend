-- Creación de la base de datos
CREATE DATABASE IF NOT EXISTS smo_it_core CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smo_it_core;

CREATE TABLE IF NOT EXISTS usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    rol ENUM('ADMIN', 'TECNICO', 'USUARIO') DEFAULT 'USUARIO',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar usuario Admin inicial (password: admin123)
-- Hash generado con bcrypt para 'admin123'
INSERT INTO usuario (email, hashed_password, nombre_completo, rol) 
VALUES ('admin@smo.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6L6s57OTWzKuYzL2', 'Administrador Sistema', 'ADMIN');
