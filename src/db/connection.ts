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
  .then(connection => {
    console.log('Successfully connected to the database.');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to the database:', err);
  });
