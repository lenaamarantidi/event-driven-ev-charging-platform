/**
 * Billing Service
 * UC05: View invoice
 * Port: 3103
 * 
 * Handles invoice generation and management
 * Consumes billable events via RabbitMQ
 * Isolated Database: billing_db
 */

const express = require('express');
const { initializeDatabase, testConnection } = require('./db');
const { connectWithRetry, closeConnection } = require('./rabbitmq');
const {
  getProviderInvoice,
  getProviderInvoices,
  markInvoicePaid,
  processPayment,
  getProviderPaymentHistory,
  getOutstandingInvoices,
  getBillingSummary,
  healthCheck
} = require('./controllers');

const app = express();
const PORT = Number(process.env.PORT || 3103);

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })}] ${req.method} ${req.path}`);
  next();
});

// =====================
// Routes
// =====================

/**
 * Root endpoint - Service info
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Billing Service',
    version: '1.0.0',
    description: 'UC05: View invoice, UC07: Pay invoice',
    port: PORT,
    endpoints: [
      'GET /api/billing/invoice/:providerId',
      'GET /api/billing/invoices/:providerId',
      'POST /api/billing/invoices/:providerId/:invoiceId/mark-paid',
      'POST /api/billing/invoices/:providerId/:invoiceId/pay',
      'GET /api/billing/provider/:providerId/payments',
      'GET /api/billing/outstanding/:providerId',
      'GET /api/billing/summary/:providerId',
      'GET /health'
    ]
  });
});

/**
 * Get current month invoice for a provider
 * GET /api/billing/invoice/:providerId
 */
app.get('/api/billing/invoice/:providerId', getProviderInvoice);

/**
 * Get all invoices for a provider
 * GET /api/billing/invoices/:providerId
 * Query params: limit, offset, status
 */
app.get('/api/billing/invoices/:providerId', getProviderInvoices);

/**
 * Mark an invoice as paid (legacy endpoint)
 * POST /api/billing/invoices/:providerId/:invoiceId/mark-paid
 */
app.post('/api/billing/invoices/:providerId/:invoiceId/mark-paid', markInvoicePaid);

/**
 * UC07: Process payment for invoice
 * POST /api/billing/invoices/:providerId/:invoiceId/pay
 * Body: { paymentMethod, reference, notes }
 */
app.post('/api/billing/invoices/:providerId/:invoiceId/pay', processPayment);

/**
 * UC07: Get payment history for provider
 * GET /api/billing/provider/:providerId/payments
 * Query params: limit, offset
 */
app.get('/api/billing/provider/:providerId/payments', getProviderPaymentHistory);

/**
 * Get all outstanding invoices for provider
 * GET /api/billing/outstanding/:providerId
 */
app.get('/api/billing/outstanding/:providerId', getOutstandingInvoices);

/**
 * Get billing summary for a provider
 * GET /api/billing/summary/:providerId
 */
app.get('/api/billing/summary/:providerId', getBillingSummary);

/**
 * Health check endpoint
 */
app.get('/health', healthCheck);

// =====================
// Error Handlers
// =====================

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// =====================
// Server Startup
// =====================

async function startServer() {
  try {
    console.log('Starting Billing Service...');

    // Initialize database
    console.log('Initializing database...');
    await initializeDatabase();

    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection test failed');
    }
    console.log('Database connection successful');

    // Connect to RabbitMQ
    console.log('Connecting to RabbitMQ...');
    await connectWithRetry(5, 2000);
    console.log('RabbitMQ connection successful');

    // Start Express server
    app.listen(PORT, () => {
      console.log(`✓ Billing Service listening on port ${PORT}`);
      console.log(`✓ Database: ${process.env.DB_NAME || 'billing_db'}`);
      console.log(`✓ RabbitMQ: ${process.env.RABBITMQ_URL || 'amqp://localhost'}`);
      console.log(`✓ Consuming events from billing_exchange`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

// =====================
// Graceful Shutdown
// =====================

async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  try {
    await closeConnection();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
