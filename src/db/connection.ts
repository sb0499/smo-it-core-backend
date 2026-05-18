import mysql from 'mysql2/promise';
import { config } from '../core/config';

// Create a connection pool using the connection URI
export const pool = mysql.createPool({
  uri: config.DATABASE_URL,
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
