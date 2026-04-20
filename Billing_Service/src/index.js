/**
 * Billing Service v2
 * 
 * Manages invoices and billing cycles
 * - Invoice generation from reservations
 * - Billing cycle tracking
 * - Usage charge calculation
 * - Publishes events to Message Broker
 * Port: 3108
 */

const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3108;
const DB_USER = process.env.DB_USER || 'billing_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'billing_pass';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'billing_db';
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
    console.log('📋 Initializing Billing database...');

    // Create invoices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        reservation_id UUID,
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        billing_period_start DATE NOT NULL,
        billing_period_end DATE NOT NULL,
        provider VARCHAR(50),
        monthly_fee DECIMAL(10, 2),
        usage_kwh DECIMAL(10, 2),
        charge_per_kwh DECIMAL(10, 2),
        usage_charge DECIMAL(10, 2),
        taxes DECIMAL(10, 2),
        total DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        due_date DATE,
        paid_date TIMESTAMP,
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(billing_period_start, billing_period_end);
    `);

    // Create line_items table 
    await client.query(`
      CREATE TABLE IF NOT EXISTS line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID NOT NULL REFERENCES invoices(id),
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(10, 2),
        unit_price DECIMAL(10, 2),
        total DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON line_items(invoice_id);
    `);

    console.log('✓ Billing database initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ============== HELPER FUNCTIONS ==============

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
          source: 'billing-service'
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
    service: 'Billing Service v2',
    version: '2.0.0',
    port: PORT,
    mode: 'invoice-generation',
    database: DB_NAME
  });
});

/**
 * POST /api/invoices
 * Create invoice from reservation
 */
app.post('/api/invoices', async (req, res) => {
  try {
    const { userId, reservationId, provider, usageKwh = 0, monthlyFee = 0 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const chargePerKwh = 0.15;
    const usageCharge = parseFloat((usageKwh * chargePerKwh).toFixed(2));
    const taxes = parseFloat((usageCharge * 0.19).toFixed(2));
    const total = monthlyFee + usageCharge + taxes;

    const result = await pool.query(
      `INSERT INTO invoices (user_id, reservation_id, invoice_number, billing_period_start, billing_period_end, provider, monthly_fee, usage_kwh, charge_per_kwh, usage_charge, taxes, total, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', $13)
       RETURNING id, invoice_number`,
      [userId, reservationId, `INV-${Date.now()}`, new Date(), new Date(Date.now() + 30*24*60*60*1000), provider, monthlyFee, usageKwh, chargePerKwh, usageCharge, taxes, total, new Date(Date.now() + 7*24*60*60*1000)]
    );

    res.status(201).json({
      message: 'Invoice created',
      invoiceId: result.rows[0].id,
      invoiceNumber: result.rows[0].invoice_number,
      total
    });
  } catch (err) {
    console.error('Invoice creation error:', err.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

/**
 * GET /api/invoices/:invoiceId
 * Get invoice details
 */
app.get('/api/invoices/:invoiceId', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM invoices WHERE id = $1`, [req.params.invoiceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

/**
 * GET /api/invoices/user/:userId
 * Get user invoices
 */
app.get('/api/invoices/user/:userId', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.userId, limit, offset]
    );

    res.json({
      total: result.rows.length,
      invoices: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * POST /api/invoices/:invoiceId/finalize
 * Finalize invoice (draft → pending)
 */
app.post('/api/invoices/:invoiceId/finalize', async (req, res) => {
  try {
    await pool.query(
      `UPDATE invoices SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [req.params.invoiceId]
    );

    await publishEvent('InvoiceFinalized', { invoiceId: req.params.invoiceId });

    res.json({ message: 'Invoice finalized', invoiceId: req.params.invoiceId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to finalize invoice' });
  }
});

/**
 * POST /api/invoices/:invoiceId/paid
 * Mark invoice as paid
 */
app.post('/api/invoices/:invoiceId/paid', async (req, res) => {
  try {
    await pool.query(
      `UPDATE invoices SET status = 'paid', paid_date = NOW(), updated_at = NOW() WHERE id = $1`,
      [req.params.invoiceId]
    );

    await publishEvent('InvoicePaid', { invoiceId: req.params.invoiceId });

    res.json({ message: 'Invoice marked as paid' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark invoice as paid' });
  }
});

/**
 * GET /api/invoices/status/summary
 * Get summary by status
 */
app.get('/api/invoices/status/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT status, COUNT(*) as count, SUM(total) as total_amount
      FROM invoices GROUP BY status
    `);

    res.json({ summary: result.rows, timestamp: new Date() });
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
      service: 'billing-service',
      port: PORT,
      database: DB_NAME,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      service: 'billing-service',
      error: err.message
    });
  }
});

// ============== SERVER STARTUP ==============

async function start() {
  try {
    await initializeDatabase();

    const server = app.listen(PORT, () => {
      console.log(`✓ Billing Service v2 running on port ${PORT}`);
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
    console.error('Failed to start Billing Service:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;

    if (!name || typeof monthlyFee !== 'number' || typeof chargePerKwh !== 'number') {
      return res.status(400).json({ error: 'Name, monthly fee, and charge per kWh required' });
    }

    const planId = uuidv4();
    const plan = {
      id: planId,
      name,
      monthlyFee,
      chargePerKwh,
      maxMonthlyKwh: maxMonthlyKwh || null,
      createdAt: new Date()
    };

    pricingPlans.set(planId, plan);

    res.status(201).json({
      message: 'Pricing plan created',
      plan
    });
  } catch (err) {
    console.error('Plan creation error:', err);
    res.status(500).json({ error: 'Plan creation failed', message: err.message });
  }
});

/**
 * GET /billing/health
 * Service health check
 */
app.get('/billing/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Billing Service',
    port: PORT,
    timestamp: new Date(),
    metrics: {
      totalInvoices: invoices.size,
      totalPlans: pricingPlans.size,
      activeCycles: billingCycles.size
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
  console.log(`✅ Billing Service listening on port ${PORT}`);
  console.log(`💳 Default plans: ${Array.from(pricingPlans.keys()).join(', ')}`);
});

module.exports = app;
