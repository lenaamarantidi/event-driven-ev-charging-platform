/**
 * API Gateway
 * Single entry point για όλα τα requests
 * Κάνει routing σε διαφορετικά microservices
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const httpProxy = require('express-http-proxy');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} [${req.method}] ${req.path}`);
  next();
});

// Service URLs
const SERVICES = {
  points: process.env.POINTS_SERVICE_URL || 'http://localhost:3001',
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3100',
  providers: process.env.PROVIDER_MGMT_SERVICE_URL || 'http://localhost:3101',
  status: process.env.STATUS_SERVICE_URL || 'http://localhost:3102',
  collector: process.env.COLLECTOR_SERVICE_URL || 'http://localhost:3104',
  map: process.env.MAP_SERVICE_URL || 'http://localhost:3105',
  analytics: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3106',
  payments: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3107',
  billing: process.env.BILLING_SERVICE_URL || 'http://localhost:3108',
  messageBroker: process.env.MESSAGE_BROKER_URL || 'http://localhost:3003',
  reservations: process.env.RESERVATION_SERVICE_URL || 'http://localhost:3009'
};

/**
 * Route to Auth Service
 */
app.use('/api/auth', httpProxy(SERVICES.auth, {
  proxyReqPathResolver: (req) => {
    return `/auth${req.url}`;
  }
}));

/**
 * Route to Provider Management Service
 */
app.use('/api/providers', httpProxy(SERVICES.providers, {
  proxyReqPathResolver: (req) => {
    return `/providers${req.url}`;
  }
}));

/**
 * Route to Points Service
 */
app.use('/api/points', httpProxy(SERVICES.points, {
  proxyReqPathResolver: (req) => {
    return `/api/points${req.url}`;
  }
}));

/**
 * Route to Status Service
 */
app.use('/api/status', httpProxy(SERVICES.status, {
  proxyReqPathResolver: (req) => {
    return `/api/status${req.url}`;
  }
}));

/**
 * Route to Collector Service
 */
app.use('/api/collector', httpProxy(SERVICES.collector, {
  proxyReqPathResolver: (req) => {
    return `/collector${req.url}`;
  }
}));

/**
 * Route to Map Service
 */
app.use('/api/map', httpProxy(SERVICES.map, {
  proxyReqPathResolver: (req) => {
    return `/map${req.url}`;
  }
}));

/**
 * Route to Analytics Service
 */
app.use('/api/analytics', httpProxy(SERVICES.analytics, {
  proxyReqPathResolver: (req) => {
    return `/analytics${req.url}`;
  }
}));

/**
 * Route to Payment Service
 */
app.use('/api/payments', httpProxy(SERVICES.payments, {
  proxyReqPathResolver: (req) => {
    return `/payments${req.url}`;
  }
}));

/**
 * Route to Billing Service
 */
app.use('/api/billing', httpProxy(SERVICES.billing, {
  proxyReqPathResolver: (req) => {
    return `/billing${req.url}`;
  }
}));

/**
 * Route to Message Broker
 */
app.use('/api/events', httpProxy(SERVICES.messageBroker, {
  proxyReqPathResolver: (req) => {
    return `/api/events${req.url}`;
  }
}));

/**
 * Route to Message Broker Webhooks
 */
app.use('/api/webhooks', httpProxy(SERVICES.messageBroker, {
  proxyReqPathResolver: (req) => {
    return `/api/webhooks${req.url}`;
  }
}));

/**
 * Route to Reservations Service
 */
app.use('/api/reservations', httpProxy(SERVICES.reservations, {
  proxyReqPathResolver: (req) => {
    return `/api/reservations${req.url}`;
  }
}));

/**
 * Health checks for all services
 */
app.get('/health', async (req, res) => {
  const axios = require('axios');
  const health = {};

  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const response = await axios.get(`${url}/health`, { timeout: 2000 });
      health[name] = { status: 'ok', ...response.data };
    } catch (error) {
      health[name] = { status: 'error', message: error.message };
    }
  }

  const allHealthy = Object.values(health).every(h => h.status === 'ok');
  
  res.status(allHealthy ? 200 : 503).json({
    gateway: 'ok',
    timestamp: new Date().toISOString(),
    services: health
  });
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    name: 'SaaS Plug - API Gateway',
    version: '1.0.0',
    description: 'Main entry point for all 8 microservices',
    timestamp: new Date().toISOString(),
    endpoints: {
      'POST /api/auth/register': 'User registration',
      'POST /api/auth/login': 'User login',
      'POST /api/auth/google': 'Google OAuth',
      'GET /api/providers': 'List providers',
      'POST /api/providers/register': 'Register new provider',
      'GET /api/points': 'Aggregated charging points',
      'GET /api/status/all': 'Comprehensive provider health check',
      'GET /api/collector/import': 'Import charging points',
      'POST /api/map/search': 'Search nearby points',
      'GET /api/analytics/events': 'Get analytics events',
      'GET /api/analytics/report': 'Generate analytics report',
      'POST /api/payments/process': 'Process payment',
      'GET /api/billing/invoices': 'Get invoices',
      'POST /api/events/publish': 'Publish event (Message Broker)',
      'POST /api/webhooks/subscribe': 'Subscribe to events',
      'GET /health': 'Health check all services'
    },
    services: SERVICES
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error('Gateway error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`✓ API Gateway running on port ${PORT}`);
  console.log(`✓ Services configured:`);
  Object.entries(SERVICES).forEach(([name, url]) => {
    console.log(`  - ${name}: ${url}`);
  });
});

module.exports = app;
