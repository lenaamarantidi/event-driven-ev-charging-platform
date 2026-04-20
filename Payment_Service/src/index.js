/**
 * Payment Service v2
 * 
 * Processes and tracks payment transactions
 * - Payment processing for reservations
 * - Payment status tracking
 * - Provider integration
 * - Publishes events to Message Broker
 * Port: 3107
 */

const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3107;
const DB_USER = process.env.DB_USER || 'payment_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'payment_pass';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'payment_db';
const MESSAGE_BROKER_URL = process.env.MESSAGE_BROKER_URL || 'http://localhost:3003';

// ============== DATABASE ==============

const pool = new Pool({
  user: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// ============== DATABASE INITIALIZATION ==============

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    console.log('📋 Initializing Payment database...');

    // Create payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id UUID NOT NULL,
        user_id UUID NOT NULL,
        provider VARCHAR(50),
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'EUR',
        status VARCHAR(50) DEFAULT 'pending',
        payment_method VARCHAR(50),
        transaction_id VARCHAR(100),
        gateway_response JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_payments_reservation ON payments(reservation_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
    `);

    // Create payment logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id UUID NOT NULL REFERENCES payments(id),
        event_type VARCHAR(100) NOT NULL,
        status_from VARCHAR(50),
        status_to VARCHAR(50),
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_payment_logs_payment ON payment_logs(payment_id);
      CREATE INDEX IF NOT EXISTS idx_payment_logs_event ON payment_logs(event_type);
    `);

    console.log('✓ Payment database initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ============== HELPER FUNCTIONS ==============

/**
 * Log payment event
 */
async function logPaymentEvent(paymentId, eventType, statusFrom, statusTo, details = {}) {
  try {
    await pool.query(
      `INSERT INTO payment_logs (payment_id, event_type, status_from, status_to, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [paymentId, eventType, statusFrom, statusTo, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Error logging payment event:', err.message);
  }
}

/**
 * Publish event to message broker
 */
async function publishEvent(eventType, data) {
  try {
    await axios.post(
      `${MESSAGE_BROKER_URL}/api/events/publish`,
      {
        eventType,
        data: {
          ...data,
          timestamp: new Date(),
          source: 'payment-service'
        }
      },
      { timeout: 5000 }
    );

    console.log(`✓ Event published: ${eventType}`);
  } catch (err) {
    console.error(`⚠️ Failed to publish event ${eventType}:`, err.message);
  }
}

// ============== REST ENDPOINTS ==============

/**
 * GET /
 * Service info
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Payment Service v2',
    version: '2.0.0',
    port: PORT,
    mode: 'transaction-processing',
    database: DB_NAME
  });
});

/**
 * POST /api/payments
 * Create and process a payment
 */
app.post('/api/payments', async (req, res) => {
  const client = await pool.connect();

  try {
    const { reservationId, userId, provider, amount, paymentMethod } = req.body;

    if (!reservationId || !userId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await client.query('BEGIN');

    // Create payment record
    const result = await client.query(
      `INSERT INTO payments (reservation_id, user_id, provider, amount, payment_method, status)
       VALUES ($1, $2, $3, $4, $5, 'processing')
       RETURNING id, created_at`,
      [reservationId, userId, provider, amount, paymentMethod]
    );

    const paymentId = result.rows[0].id;

    await logPaymentEvent(paymentId, 'created', null, 'processing', { amount });

    // Simulate payment processing success
    const gatewayResponse = {
      transactionId: `txn_${Date.now()}`,
      timestamp: new Date(),
      amount
    };

    // Update payment
    await client.query(
      `UPDATE payments SET status = 'completed', transaction_id = $1, gateway_response = $2, updated_at = NOW()
       WHERE id = $3`,
      [gatewayResponse.transactionId, JSON.stringify(gatewayResponse), paymentId]
    );

    await logPaymentEvent(paymentId, 'completed', 'processing', 'completed', gatewayResponse);
    await client.query('COMMIT');

    // Publish event
    await publishEvent('PaymentCompleted', {
      paymentId,
      reservationId,
      userId,
      amount,
      transactionId: gatewayResponse.transactionId
    });

    res.status(201).json({
      message: 'Payment successful',
      paymentId,
      status: 'completed',
      amount
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Payment error:', err.message);
    res.status(500).json({ error: 'Payment failed' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/payments/:paymentId
 * Get payment details
 */
app.get('/api/payments/:paymentId', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM payments WHERE id = $1`, [req.params.paymentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

/**
 * GET /api/payments/user/:userId
 * Get user payments
 */
app.get('/api/payments/user/:userId', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.userId, limit, offset]
    );

    res.json({
      total: result.rows.length,
      payments: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

/**
 * GET /api/payments/status/summary
 * Get status summary
 */
app.get('/api/payments/status/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT status, COUNT(*) as count, SUM(amount) as total_amount
      FROM payments GROUP BY status
    `);

    res.json({
      summary: result.rows,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * GET /health
 * Health check
 */
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      status: 'ok',
      service: 'payment-service',
      port: PORT,
      database: DB_NAME,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      service: 'payment-service',
      error: err.message
    });
  }
});

// ============== SERVER STARTUP ==============

async function start() {
  try {
    await initializeDatabase();

    const server = app.listen(PORT, () => {
      console.log(`✓ Payment Service v2 running on port ${PORT}`);
      console.log(`✓ Database: ${DB_NAME}\n`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing connections');
      server.close(() => {
        pool.end();
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, closing connections');
      server.close(() => {
        pool.end();
        process.exit(0);
      });
    });
  } catch (err) {
    console.error('Failed to start Payment Service:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
      wallets.set(transaction.userId, wallet);
    }

    res.json({
      message: 'Refund processed',
      transaction
    });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Refund failed', message: err.message });
  }
});

/**
 * GET /payments/health
 * Service health check
 */
app.get('/payments/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Payment Service',
    port: PORT,
    timestamp: new Date(),
    metrics: {
      totalTransactions: transactions.size,
      totalWallets: wallets.size,
      totalSubscriptions: subscriptions.size
    }
  });
});

/**
 * Error handling
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Payment Service listening on port ${PORT}`);
});

module.exports = app;
