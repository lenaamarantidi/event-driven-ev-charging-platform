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

    // Create analytics_logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS analytics_logs (
        id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        provider_id INT(10) UNSIGNED NOT NULL,
        action_type VARCHAR(50) NOT NULL COMMENT 'point_viewed, reservation_made, search_performed, etc.',
        action_metadata JSON COMMENT 'Additional metadata about the action',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_provider_id (provider_id),
        INDEX idx_action_type (action_type),
        INDEX idx_timestamp (timestamp),
        INDEX idx_provider_action (provider_id, action_type, timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create analytics_summary table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS analytics_summary (
        summary_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        provider_id INT(10) UNSIGNED NOT NULL UNIQUE,
        total_searches INT(10) DEFAULT 0,
        total_point_views INT(10) DEFAULT 0,
        total_reservations INT(10) DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        INDEX idx_provider_id (provider_id),
        INDEX idx_period (period_start, period_end)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create analytics_daily table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS analytics_daily (
        daily_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        provider_id INT(10) UNSIGNED NOT NULL,
        date DATE NOT NULL,
        searches_count INT(10) DEFAULT 0,
        point_views_count INT(10) DEFAULT 0,
        reservations_count INT(10) DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_provider_date (provider_id, date),
        INDEX idx_provider_id (provider_id),
        INDEX idx_date (date)
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
