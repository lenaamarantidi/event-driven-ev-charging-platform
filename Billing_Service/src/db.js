/**
 * Database Configuration and Connection Pool
 * Billing_Service
 * Isolated MariaDB: billing_db
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'billing_user',
  password: process.env.DB_PASSWORD || 'billing_pass',
  database: process.env.DB_NAME || 'billing_db',
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

    // Create billable_events table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS billable_events (
        event_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        provider_id INT(10) UNSIGNED NOT NULL,
        reservation_id INT(10) UNSIGNED NOT NULL,
        amount DECIMAL(10, 2) NOT NULL COMMENT 'Amount in EUR',
        event_type VARCHAR(50) DEFAULT 'reservation' COMMENT 'reservation, charging, etc.',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        billing_month DATE NOT NULL COMMENT 'First day of the month for aggregation',
        INDEX idx_provider_id (provider_id),
        INDEX idx_reservation_id (reservation_id),
        INDEX idx_billing_month (billing_month),
        INDEX idx_provider_month (provider_id, billing_month)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create invoices table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        invoice_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        provider_id INT(10) UNSIGNED NOT NULL,
        billing_period_start DATE NOT NULL,
        billing_period_end DATE NOT NULL,
        total_amount DECIMAL(15, 2) NOT NULL,
        tax_amount DECIMAL(15, 2) DEFAULT 0.00,
        grand_total DECIMAL(15, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'draft' COMMENT 'draft, sent, paid, overdue, cancelled',
        event_count INT(10) DEFAULT 0 COMMENT 'Number of billable events in this invoice',
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        due_date DATE NOT NULL,
        paid_at TIMESTAMP NULL,
        UNIQUE KEY uq_provider_period (provider_id, billing_period_start, billing_period_end),
        INDEX idx_provider_id (provider_id),
        INDEX idx_status (status),
        INDEX idx_issued_at (issued_at),
        INDEX idx_due_date (due_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create invoice_line_items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoice_line_items (
        line_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        invoice_id INT(10) UNSIGNED NOT NULL,
        description VARCHAR(255) NOT NULL,
        quantity INT(10) DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL,
        line_total DECIMAL(15, 2) NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE CASCADE,
        INDEX idx_invoice_id (invoice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create pricing_config table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pricing_config (
        config_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        provider_id INT(10) UNSIGNED COMMENT 'NULL for global default',
        cost_per_reservation DECIMAL(10, 2) NOT NULL DEFAULT 0.50 COMMENT 'EUR per reservation',
        cost_per_charging_hour DECIMAL(10, 2) NOT NULL DEFAULT 1.00 COMMENT 'EUR per charging hour',
        setup_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Monthly setup fee in EUR',
        active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_provider_config (provider_id),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Insert default pricing if not exists
    await connection.query(`
      INSERT IGNORE INTO pricing_config (cost_per_reservation, cost_per_charging_hour, setup_fee, active)
      VALUES (0.50, 1.00, 0.00, 1);
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
