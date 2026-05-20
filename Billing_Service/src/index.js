/**
 * Billing Service
 * Simplified MariaDB-backed billing with Invoice table
 * Port: 3108
 */

const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3108);
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'billing_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'billing_pass';
const DB_NAME = process.env.DB_NAME || 'billing_db';
const MESSAGE_BROKER_URL = process.env.MESSAGE_BROKER_URL || 'http://localhost:3003';

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
    CREATE TABLE IF NOT EXISTS Invoice (
      invoice_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      provider_id INT(10) UNSIGNED,
      period_start DATE,
      period_end DATE,
      total_amount DECIMAL(10,2),
      status VARCHAR(255),
      issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_invoice_provider (provider_id),
      INDEX idx_invoice_period (period_start, period_end),
      INDEX idx_invoice_status (status),
      INDEX idx_invoice_issued_at (issued_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function publishEvent(eventType, data) {
  try {
    await axios.post(
      `${MESSAGE_BROKER_URL}/api/events/publish`,
      {
        eventType,
        data: {
          ...data,
          sourceService: 'billing-service'
        }
      },
      { timeout: 5000 }
    );
  } catch (err) {
    console.error(`Event publish failed (${eventType}):`, err.message);
  }
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

app.get('/', (req, res) => {
  res.json({
    service: 'Billing Service',
    version: '3.0.0',
    mode: 'mariadb-invoice',
    port: PORT
  });
});

app.post('/api/invoices', async (req, res) => {
  try {
    const {
      provider_id,
      period_start,
      period_end,
      total_amount,
      status
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO Invoice (provider_id, period_start, period_end, total_amount, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        toInt(provider_id),
        period_start || null,
        period_end || null,
        toDecimal(total_amount),
        status || 'draft'
      ]
    );

    const [rows] = await pool.query(
      `SELECT invoice_id, provider_id, period_start, period_end, total_amount, status, issued_at
       FROM Invoice
       WHERE invoice_id = ?`,
      [result.insertId]
    );

    const invoice = rows[0];

    await publishEvent('invoice.generated', {
      invoiceId: invoice.invoice_id,
      providerId: invoice.provider_id,
      amount: Number(invoice.total_amount || 0),
      currency: 'EUR',
      status: invoice.status
    });

    return res.status(201).json({
      message: 'Invoice created',
      invoice
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to create invoice',
      message: err.message
    });
  }
});

app.get('/api/invoices/:invoiceId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT invoice_id, provider_id, period_start, period_end, total_amount, status, issued_at
       FROM Invoice
       WHERE invoice_id = ?`,
      [toInt(req.params.invoiceId)]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch invoice',
      message: err.message
    });
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const { provider_id, status, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT invoice_id, provider_id, period_start, period_end, total_amount, status, issued_at
      FROM Invoice
      WHERE 1=1
    `;

    const values = [];

    if (provider_id) {
      query += ' AND provider_id = ?';
      values.push(toInt(provider_id));
    }

    if (status) {
      query += ' AND status = ?';
      values.push(status);
    }

    query += ' ORDER BY issued_at DESC LIMIT ? OFFSET ?';
    values.push(toInt(limit) || 100, toInt(offset) || 0);

    const [rows] = await pool.query(query, values);

    return res.json({
      total: rows.length,
      invoices: rows
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch invoices',
      message: err.message
    });
  }
});

app.post('/api/invoices/:invoiceId/status', async (req, res) => {
  try {
    const invoiceId = toInt(req.params.invoiceId);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    await pool.query(
      `UPDATE Invoice SET status = ? WHERE invoice_id = ?`,
      [status, invoiceId]
    );

    const [rows] = await pool.query(
      `SELECT invoice_id, provider_id, period_start, period_end, total_amount, status, issued_at
       FROM Invoice
       WHERE invoice_id = ?`,
      [invoiceId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = rows[0];

    if (status === 'paid') {
      await publishEvent('invoice.paid', {
        invoiceId: invoice.invoice_id,
        providerId: invoice.provider_id,
        amount: Number(invoice.total_amount || 0),
        currency: 'EUR',
        status: invoice.status
      });
    }

    return res.json({
      message: 'Invoice status updated',
      invoice
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to update invoice status',
      message: err.message
    });
  }
});

app.get('/api/invoices/status/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT status, COUNT(*) AS count, SUM(total_amount) AS total_amount
      FROM Invoice
      GROUP BY status
    `);

    return res.json({
      summary: rows,
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
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM Invoice');

    return res.json({
      status: 'healthy',
      service: 'billing-service',
      port: PORT,
      database: DB_NAME,
      totalInvoices: Number(countRows[0].total || 0),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'billing-service',
      message: err.message
    });
  }
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Billing Service listening on port ${PORT}`);
      console.log(`MariaDB connected: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start Billing Service:', err.message);
    process.exit(1);
  });

module.exports = app;
