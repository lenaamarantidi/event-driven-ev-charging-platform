/**
 * Analytics Service
 * MariaDB-backed usage events tracking
 * Port: 3106
 */

const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3106);
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'analytics_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'analytics_pass';
const DB_NAME = process.env.DB_NAME || 'analytics_db';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS UsageEvent (
      event_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      provider_id INT(10),
      user_id INT(10),
      point_id INT(10),
      reservation_id INT(10) NULL,
      event_type VARCHAR(255) NOT NULL,
      event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      charge_amount DECIMAL(10,2),
      invoice_id INT(10),
      INDEX idx_usage_event_type (event_type),
      INDEX idx_usage_event_time (event_time),
      INDEX idx_usage_provider (provider_id),
      INDEX idx_usage_user (user_id),
      INDEX idx_usage_point (point_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function toInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toDecimal(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toMariaDbTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    return fallback.toISOString().slice(0, 19).replace('T', ' ');
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function mapEventToUsageRow(body) {
  const eventType = body.eventType || body.event_type;
  const payload = body.data || body.payload || {};
  const envelope = body.envelope || {};

  const providerId = toInt(payload.provider_id ?? payload.providerId);
  const userId = toInt(payload.user_id ?? payload.userId);
  const pointId = toInt(payload.point_id ?? payload.pointId ?? payload.providerPointId ?? payload.internalPointId);
  const reservationId = toInt(payload.reservation_id ?? payload.reservationId);
  const chargeAmount = toDecimal(payload.charge_amount ?? payload.chargeAmount ?? payload.amount ?? payload.estimatedCost);
  const invoiceId = toInt(payload.invoice_id ?? payload.invoiceId);
  const eventTime = toMariaDbTimestamp(envelope.timestamp || payload.timestamp || new Date().toISOString());

  return {
    provider_id: providerId,
    user_id: userId,
    point_id: pointId,
    reservation_id: reservationId,
    event_type: eventType,
    event_time: eventTime,
    charge_amount: chargeAmount,
    invoice_id: invoiceId
  };
}

app.get('/', (req, res) => {
  res.json({
    service: 'Analytics Service',
    version: '3.0.0',
    mode: 'mariadb-usage-events',
    port: PORT
  });
});

app.post('/api/events', async (req, res) => {
  try {
    const mapped = mapEventToUsageRow(req.body);

    if (!mapped.event_type) {
      return res.status(400).json({ error: 'eventType is required' });
    }

    const [result] = await pool.query(
      `INSERT INTO UsageEvent (provider_id, user_id, point_id, reservation_id, event_type, event_time, charge_amount, invoice_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mapped.provider_id,
        mapped.user_id,
        mapped.point_id,
        mapped.reservation_id,
        mapped.event_type,
        mapped.event_time,
        mapped.charge_amount,
        mapped.invoice_id
      ]
    );

    const [rows] = await pool.query(
      `SELECT event_id, provider_id, user_id, point_id, reservation_id, event_type, event_time, charge_amount, invoice_id
       FROM UsageEvent WHERE event_id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      message: 'Event recorded',
      event: rows[0]
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to process event',
      message: err.message
    });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const { eventType, providerId, userId, pointId, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT event_id, provider_id, user_id, point_id, reservation_id, event_type, event_time, charge_amount, invoice_id
      FROM UsageEvent
      WHERE 1=1
    `;

    const values = [];

    if (eventType) {
      query += ' AND event_type = ?';
      values.push(eventType);
    }

    if (providerId) {
      query += ' AND provider_id = ?';
      values.push(toInt(providerId));
    }

    if (userId) {
      query += ' AND user_id = ?';
      values.push(toInt(userId));
    }

    if (pointId) {
      query += ' AND point_id = ?';
      values.push(toInt(pointId));
    }

    query += ' ORDER BY event_time DESC LIMIT ? OFFSET ?';
    values.push(toInt(limit) || 100, toInt(offset) || 0);

    const [rows] = await pool.query(query, values);

    return res.json({
      total: rows.length,
      events: rows
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch events',
      message: err.message
    });
  }
});

app.get('/api/stats/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COUNT(*) AS total_events,
        COUNT(DISTINCT user_id) AS distinct_users,
        COUNT(DISTINCT point_id) AS distinct_points,
        COUNT(DISTINCT provider_id) AS distinct_providers,
        SUM(charge_amount) AS total_charge_amount
      FROM UsageEvent
    `);

    return res.json({
      summary: rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch summary',
      message: err.message
    });
  }
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM UsageEvent');

    return res.json({
      status: 'healthy',
      service: 'analytics-service',
      port: PORT,
      database: DB_NAME,
      totalEvents: Number(countRows[0].total || 0),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'analytics-service',
      message: err.message
    });
  }
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Analytics Service listening on port ${PORT}`);
      console.log(`MariaDB connected: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start Analytics Service:', err.message);
    process.exit(1);
  });

module.exports = app;
