/**
 * Provider Management Service
 * UC03: Register to saasCharge
 * Port: 3105
 * 
 * Handles provider registration and management
 * Isolated Database: provider_mgmt_db
 */

const express = require('express');
const { initializeDatabase, testConnection } = require('./db');
const {
  registerProvider,
  loginProvider,
  getProvider,
  getAllProviders,
  suspendProvider,
  healthCheck
} = require('./controllers');

const app = express();
const PORT = Number(process.env.PORT || 3105);

// Middleware
app.use(express.json());

// CORS for frontend development and service communication
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

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
    service: 'Provider Management Service',
    version: '1.0.0',
    description: 'UC03: Register to saasCharge',
    port: PORT,
    endpoints: [
      'POST /api/providers/register',
      'POST /api/providers/login',
      'GET /api/providers',
      'GET /api/providers/:providerId',
      'POST /api/providers/:providerId/suspend',
      'GET /health'
    ]
  });
});

/**
 * Provider Registration
 * POST /api/providers/register
 * Register a new EV charging provider with their 4 API endpoints
 */
app.post('/api/providers/register', registerProvider);

/**
 * Provider Login
 * POST /api/providers/login
 */
app.post('/api/providers/login', loginProvider);

/**
 * Get all providers
 * GET /api/providers
 * Query params: status (active, suspended, inactive), limit, offset
 */
app.get('/api/providers', getAllProviders);

/**
 * Get provider by ID
 * GET /api/providers/:providerId
 */
app.get('/api/providers/:providerId', getProvider);

/**
 * Suspend provider
 * POST /api/providers/:providerId/suspend
 */
app.post('/api/providers/:providerId/suspend', suspendProvider);

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
    console.log('Starting Provider Management Service...');

    // Initialize database
    console.log('Initializing database...');
    await initializeDatabase();

    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection test failed');
    }
    console.log('Database connection successful');

    // Start Express server
    app.listen(PORT, () => {
      console.log(`✓ Provider Management Service listening on port ${PORT}`);
      console.log(`✓ Database: ${process.env.DB_NAME || 'provider_mgmt_db'}`);
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
