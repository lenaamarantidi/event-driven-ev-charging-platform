/**
 * Analytics Service
 * UC04: View own analytics
 * Port: 3102
 * 
 * Handles analytics event consumption via RabbitMQ
 * Provides analytics aggregation endpoints
 * Isolated Database: analytics_db
 */

const express = require('express');
const { initializeDatabase, testConnection } = require('./db');
const { connectWithRetry, closeConnection } = require('./rabbitmq');
const {
  getProviderAnalytics,
  getProviderDailyAnalytics,
  getGlobalAnalytics,
  exportProviderLogs,
  requestInvoiceGeneration,
  healthCheck
} = require('./controllers');

const app = express();
const PORT = Number(process.env.PORT || 3102);

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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
    service: 'Analytics Service',
    version: '1.0.0',
    description: 'UC04: View own analytics',
    port: PORT,
    endpoints: [
      'GET /api/analytics/provider/:providerId',
      'GET /api/analytics/provider/:providerId/daily',
      'GET /api/analytics/global',
      'GET /health'
    ]
  });
});

/**
 * Get provider analytics
 * GET /api/analytics/provider/:providerId
 * Query params: period (daily, weekly, monthly), startDate, endDate
 */
app.get('/api/analytics/provider/:providerId', getProviderAnalytics);

/**
 * Get provider daily analytics breakdown
 * GET /api/analytics/provider/:providerId/daily
 */
app.get('/api/analytics/provider/:providerId/daily', getProviderDailyAnalytics);

/**
 * UC08: Export provider logs
 * GET /api/analytics/provider/:providerId/export
 * Query params: format (csv or json), startDate, endDate
 * Downloads activity logs as file
 */
app.get('/api/analytics/provider/:providerId/export', exportProviderLogs);

/**
 * UC04 Extension: Request invoice generation
 * POST /api/analytics/provider/:providerId/request-invoice
 * Body: { period, startDate, endDate }
 */
app.post('/api/analytics/provider/:providerId/request-invoice', requestInvoiceGeneration);

/**
 * Get global analytics (all providers)
 * GET /api/analytics/global
 */
app.get('/api/analytics/global', getGlobalAnalytics);

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
    console.log('Starting Analytics Service...');

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
      console.log(`✓ Analytics Service listening on port ${PORT}`);
      console.log(`✓ Database: ${process.env.DB_NAME || 'analytics_db'}`);
      console.log(`✓ RabbitMQ: ${process.env.RABBITMQ_URL || 'amqp://localhost'}`);
      console.log(`✓ Consuming events from analytics_exchange`);
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
