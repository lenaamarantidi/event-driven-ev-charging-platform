/**
 * Payment Service
 * Simplified MariaDB-backed payment management with Payment table
 * Port: 3107
 */

const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3107);
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'payment_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'payment_pass';
const DB_NAME = process.env.DB_NAME || 'payment_db';
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
    CREATE TABLE IF NOT EXISTS Payment (
      payment_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      invoice_id INT(10) UNSIGNED,
      provider_id INT(10) UNSIGNED,
      amount DECIMAL(10,2),
      payment_method VARCHAR(100) NULL,
      reference VARCHAR(255) NULL,
      notes VARCHAR(500) NULL,
      status VARCHAR(255),
      paid_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_payment_invoice (invoice_id),
      INDEX idx_payment_provider (provider_id),
      INDEX idx_payment_status (status),
      INDEX idx_payment_paid_at (paid_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    ALTER TABLE Payment
      ADD COLUMN IF NOT EXISTS provider_id INT(10) UNSIGNED AFTER invoice_id;
  `);
  await pool.query(`
    ALTER TABLE Payment
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100) NULL AFTER amount;
  `);
  await pool.query(`
    ALTER TABLE Payment
      ADD COLUMN IF NOT EXISTS reference VARCHAR(255) NULL AFTER payment_method;
  `);
  await pool.query(`
    ALTER TABLE Payment
      ADD COLUMN IF NOT EXISTS notes VARCHAR(500) NULL AFTER reference;
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

async function publishEvent(eventType, data) {
  try {
    await axios.post(
      `${MESSAGE_BROKER_URL}/api/events/publish`,
      {
        eventType,
        data: {
          ...data,
          sourceService: 'payment-service'
        }
      },
      { timeout: 5000 }
    );
  } catch (err) {
    console.error(`Event publish failed (${eventType}):`, err.message);
  }
}

app.get('/', (req, res) => {
  res.json({
    service: 'Payment Service',
    version: '3.0.0',
    mode: 'mariadb-payment',
    port: PORT
  });
});

app.post('/api/payments', async (req, res) => {
  try {
    const invoiceId = toInt(req.body.invoice_id ?? req.body.invoiceId);
    const providerId = toInt(req.body.provider_id ?? req.body.providerId);
    const amount = toDecimal(req.body.amount);
    const status = req.body.status || 'pending';
    const paymentMethod = req.body.paymentMethod || req.body.payment_method || 'bank_transfer';
    const reference = req.body.reference || null;
    const notes = req.body.notes || null;

    if (!invoiceId || !providerId) {
      return res.status(400).json({
        error: 'invoice_id and provider_id are required'
      });
    }

    const normalizedStatus = status.toString();
    const paidAt = normalizedStatus === 'paid' ? new Date() : null;

    const [result] = await pool.query(
      `INSERT INTO Payment (invoice_id, provider_id, amount, payment_method, reference, notes, status, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, providerId, amount, paymentMethod, reference, notes, normalizedStatus, paidAt]
    );

    const [rows] = await pool.query(
      `SELECT payment_id, invoice_id, provider_id, amount, payment_method, reference, notes, status, paid_at
       FROM Payment
       WHERE payment_id = ?`,
      [result.insertId]
    );

    const payment = rows[0];

    if (payment.status === 'paid') {
      await publishEvent('payment.processed', {
        paymentId: payment.payment_id,
        invoiceId: payment.invoice_id,
        providerId: payment.provider_id,
        amount: Number(payment.amount || 0),
        currency: 'EUR',
        status: payment.status,
        paymentMethod: payment.payment_method,
        reference: payment.reference,
        notes: payment.notes,
        paidAt: payment.paid_at
      });
    }

    return res.status(201).json({
      message: 'Payment created',
      payment
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to create payment',
      message: err.message
    });
  }
});

app.get('/api/payments/:paymentId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT payment_id, invoice_id, provider_id, amount, payment_method, reference, notes, status, paid_at
       FROM Payment
       WHERE payment_id = ?`,
      [toInt(req.params.paymentId)]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch payment',
      message: err.message
    });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    const { invoice_id, status, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT payment_id, invoice_id, provider_id, amount, payment_method, reference, notes, status, paid_at
      FROM Payment
      WHERE 1=1
    `;

    const values = [];

    if (invoice_id) {
      query += ' AND invoice_id = ?';
      values.push(toInt(invoice_id));
    }

    if (status) {
      query += ' AND status = ?';
      values.push(status);
    }

    query += ' ORDER BY payment_id DESC LIMIT ? OFFSET ?';
    values.push(toInt(limit) || 100, toInt(offset) || 0);

    const [rows] = await pool.query(query, values);

    return res.json({
      total: rows.length,
      payments: rows
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch payments',
      message: err.message
    });
  }
});

app.post('/api/payments/:paymentId/status', async (req, res) => {
  try {
    const paymentId = toInt(req.params.paymentId);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const paidAt = status === 'paid' ? new Date() : null;

    await pool.query(
      `UPDATE Payment SET status = ?, paid_at = ? WHERE payment_id = ?`,
      [status, paidAt, paymentId]
    );

    const [rows] = await pool.query(
      `SELECT payment_id, invoice_id, provider_id, amount, payment_method, reference, notes, status, paid_at
       FROM Payment
       WHERE payment_id = ?`,
      [paymentId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = rows[0];

    if (status === 'paid') {
      await publishEvent('payment.processed', {
        paymentId: payment.payment_id,
        invoiceId: payment.invoice_id,
        providerId: payment.provider_id,
        amount: Number(payment.amount || 0),
        currency: 'EUR',
        paymentMethod: payment.payment_method,
        reference: payment.reference,
        notes: payment.notes,
        status: payment.status,
        paidAt: payment.paid_at
      });
    }

    return res.json({
      message: 'Payment status updated',
      payment
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to update payment status',
      message: err.message
    });
  }
});

app.get('/api/payments/status/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT status, COUNT(*) AS count, SUM(amount) AS total_amount
      FROM Payment
      GROUP BY status
    `);

    return res.json({
      summary: rows,
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
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
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM Payment');

    return res.json({
      status: 'healthy',
      service: 'payment-service',
      port: PORT,
      database: DB_NAME,
      totalPayments: Number(countRows[0].total || 0),
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'payment-service',
      message: err.message
    });
  }
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Payment Service listening on port ${PORT}`);
      console.log(`MariaDB connected: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start Payment Service:', err.message);
    process.exit(1);
  });

module.exports = app;
