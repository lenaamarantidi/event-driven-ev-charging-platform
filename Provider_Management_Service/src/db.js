/**
 * Database Configuration and Connection Pool
 * Provider_Management_Service
 * Isolated MariaDB: provider_mgmt_db
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'provider_mgmt_user',
  password: process.env.DB_PASSWORD || 'provider_mgmt_pass',
  database: process.env.DB_NAME || 'provider_mgmt_db',
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

    // Create providers table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS providers (
        provider_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        provider_name VARCHAR(255) NOT NULL UNIQUE,
        provider_email VARCHAR(255) NULL,
        password_hash VARCHAR(255) NULL,
        base_url VARCHAR(500) NOT NULL,
        api_key VARCHAR(255) NOT NULL,
        endpoint_list_points VARCHAR(500) NOT NULL COMMENT 'GET endpoint to list charging points',
        endpoint_point_details VARCHAR(500) NOT NULL COMMENT 'GET endpoint to get point details',
        endpoint_reserve VARCHAR(500) NOT NULL COMMENT 'POST endpoint to make reservation',
        endpoint_reserve_duration VARCHAR(500) NOT NULL COMMENT 'POST endpoint to make reservation with duration',
        status VARCHAR(50) DEFAULT 'active' COMMENT 'active, suspended, inactive',
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_provider_name (provider_name),
        INDEX idx_provider_status (status),
        INDEX idx_registered_at (registered_at),
        UNIQUE KEY uq_provider_email (provider_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create provider_webhooks table (optional, for future use)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS provider_webhooks (
        webhook_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        provider_id INT(10) UNSIGNED NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        webhook_url VARCHAR(500) NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(provider_id) ON DELETE CASCADE,
        INDEX idx_provider_id (provider_id),
        INDEX idx_event_type (event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    if (!(await indexExists('providers', 'uq_provider_email'))) {
      await connection.query('ALTER TABLE providers ADD UNIQUE KEY uq_provider_email (provider_email)');
    }

    if (!(await columnExists('providers', 'provider_email'))) {
      await connection.query('ALTER TABLE providers ADD COLUMN provider_email VARCHAR(255) NULL AFTER provider_name');
    }

    if (!(await columnExists('providers', 'password_hash'))) {
      await connection.query('ALTER TABLE providers ADD COLUMN password_hash VARCHAR(255) NULL AFTER provider_email');
    }

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
async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

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
