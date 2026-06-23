/**
 * Analytics Service
 * Provides analytics, KPI metrics, and reporting
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
  getProviderTimeseries,
  getGlobalAnalytics,
  getGlobalTimeseries,
  getGlobalRankings,
  getBillingStats,
  exportProviderLogs,
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
    description: 'Provides analytics, KPI metrics, and reporting',
    port: PORT,
    endpoints: [
      'GET /analytics/providers/:providerId',
      'GET /analytics/providers/:providerId/timeseries',
      'GET /analytics/providers/:providerId/export',
      'GET /analytics/global',
      'GET /analytics/global/timeseries',
      'GET /analytics/global/rankings',
      'POST /analytics/billing/request',
      'GET /health'
    ]
  });
});

/**
 * Provider Analytics
 */
app.get('/analytics/providers/:providerId', getProviderAnalytics);
app.get('/analytics/providers/:providerId/timeseries', getProviderTimeseries);
app.get('/analytics/providers/:providerId/export', exportProviderLogs);

/**
 * Global/Operator Analytics
 */
app.get('/analytics/global', getGlobalAnalytics);
app.get('/analytics/global/timeseries', getGlobalTimeseries);
app.get('/analytics/global/rankings', getGlobalRankings);

/**
 * Billing Service Integration
 */
app.post('/analytics/billing/request', getBillingStats);

/**
 * Health check endpoint
 */
app.get('/health', healthCheck);

// =====================
// Error Handlers
// =====================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// =====================
// Server Startup
// =====================

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Database initialized');

    // Test database connection
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }
    console.log('Database connection successful');

    // Connect to RabbitMQ
    try {
      await connectWithRetry();
      console.log('RabbitMQ connected and listening for events');
    } catch (err) {
      console.error('Warning: Could not connect to RabbitMQ, service will continue without event consumption:', err.message);
    }

    // Start Express server
    app.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] Analytics Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start Analytics Service:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await closeConnection();
  process.exit(0);
});

startServer();

