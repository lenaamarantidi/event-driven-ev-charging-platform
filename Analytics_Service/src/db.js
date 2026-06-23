/**
 * Database Configuration and Connection Pool
 * Analytics_Service
 * Isolated MariaDB: analytics_db
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'analytics_user',
  password: process.env.DB_PASSWORD || 'analytics_pass',
  database: process.env.DB_NAME || 'analytics_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0
});

/**
 * Initialize database schema if not exists
 */
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();

    // Create user_registrations table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_registrations (
        id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        userId VARCHAR(255) NOT NULL UNIQUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_createdAt (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create provider_registrations table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS provider_registrations (
        id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        providerId INT(10) UNSIGNED NOT NULL UNIQUE,
        providerName VARCHAR(255) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_providerId (providerId),
        INDEX idx_createdAt (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create reservation_events table (raw event log)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS reservation_events (
        id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        reservationId VARCHAR(255) NOT NULL UNIQUE,
        providerId INT(10) UNSIGNED NOT NULL,
        providerName VARCHAR(255) NOT NULL,
        userId VARCHAR(255) NOT NULL,
        pointId VARCHAR(255),
        status VARCHAR(50) NOT NULL COMMENT 'success or failed',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_providerId (providerId),
        INDEX idx_userId (userId),
        INDEX idx_status (status),
        INDEX idx_timestamp (timestamp),
        INDEX idx_provider_timestamp (providerId, timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create provider_daily_stats table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS provider_daily_stats (
        providerId INT(10) UNSIGNED NOT NULL,
        date DATE NOT NULL,
        totalReservations INT(10) UNSIGNED DEFAULT 0,
        successfulReservations INT(10) UNSIGNED DEFAULT 0,
        failedReservations INT(10) UNSIGNED DEFAULT 0,
        uniqueUsers INT(10) UNSIGNED DEFAULT 0,
        PRIMARY KEY (providerId, date),
        INDEX idx_date (date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create global_daily_stats table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS global_daily_stats (
        date DATE NOT NULL PRIMARY KEY,
        totalReservations INT(10) UNSIGNED DEFAULT 0,
        successfulReservations INT(10) UNSIGNED DEFAULT 0,
        failedReservations INT(10) UNSIGNED DEFAULT 0,
        newUsers INT(10) UNSIGNED DEFAULT 0,
        newProviders INT(10) UNSIGNED DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    connection.release();
    console.log('Database schema initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err.message);
    throw err;
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    return true;
  } catch (err) {
    console.error('Database connection test failed:', err.message);
    return false;
  }
}

/**
 * Close all connections in the pool
 */
async function closePool() {
  return pool.end();
}

module.exports = {
  pool,
  initializeDatabase,
  testConnection,
  closePool
};
