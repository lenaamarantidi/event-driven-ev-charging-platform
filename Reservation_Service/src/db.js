/**
 * Database Connection & Initialization
 * MariaDB 10.5+
 * Database: reservation_db
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

const DB_CONFIG = {
  host: process.env.DB_HOST || 'mariadb-reservations', // <--- Η αλλαγή έγινε εδώ!
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'reservation_user',
  password: process.env.DB_PASSWORD || 'reservation_pass',
  database: process.env.DB_NAME || 'reservation_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0
};

/**
 * Initialize connection pool
 */
async function initializePool() {
  try {
    pool = mysql.createPool(DB_CONFIG);
    console.log('✓ MariaDB connection pool created');
    return pool;
  } catch (error) {
    console.error('✗ Failed to create pool:', error.message);
    throw error;
  }
}

/**
 * Initialize database schema
 */
async function initializeDatabase() {
  try {
    if (!pool) await initializePool();

    const connection = await pool.getConnection();

    // Create reservation_logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS reservation_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id VARCHAR(36) NOT NULL UNIQUE,
        provider_name VARCHAR(50) NOT NULL,
        provider_id INT NOT NULL,
        point_id VARCHAR(100) NOT NULL,
        duration INT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reservation_details JSON,
        user_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_reservation_id (reservation_id),
        INDEX idx_provider (provider_name),
        INDEX idx_point_id (point_id),
        INDEX idx_created_at (created_at),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✓ Database schema initialized (reservation_logs table)');
    connection.release();
  } catch (error) {
    console.error('✗ Database initialization error:', error.message);
    throw error;
  }
}

/**
 * Test database connection
 */
async function testDatabaseConnection() {
  try {
    if (!pool) await initializePool();

    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    console.log('✓ MariaDB connection test successful');
  } catch (error) {
    console.error('✗ Database connection test failed:', error.message);
    throw error;
  }
}

/**
 * Get pool instance
 */
function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return pool;
}

/**
 * Log reservation attempt
 */
async function logReservation(reservationData) {
  try {
    if (!pool) await initializePool();

    const {
      reservationId,
      providerId,
      providerName,
      pointId,
      duration,
      status,
      details,
      userId
    } = reservationData;

    const [result] = await pool.query(
      `INSERT INTO reservation_logs 
       (reservation_id, provider_id, provider_name, point_id, duration, status, reservation_details, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reservationId,
        providerId,
        providerName,
        pointId,
        duration,
        status || 'pending',
        JSON.stringify(details || {}),
        userId || null
      ]
    );

    console.log(`✓ Reservation logged: ${reservationId}`);
    return result;
  } catch (error) {
    console.error('✗ Error logging reservation:', error.message);
    throw error;
  }
}

module.exports = {
  initializePool,
  initializeDatabase,
  testDatabaseConnection,
  getPool,
  logReservation
};