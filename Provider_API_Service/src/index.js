/**
 * Provider API Service
 * Direct exposure of EV charging provider APIs
 * Implements endpoints for redPlug, greenPlug, bluePlug
 * OpenAPI 3.1.0 compatible
 * Port: 3200
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

// Import provider adapter
let ProviderAdapterFactory;
try {
  // Try loading from same directory (for Docker)
  const adapterPath = path.join(__dirname, '../adapters/providerAdapter.js');
  if (fs.existsSync(adapterPath)) {
    ({ ProviderAdapterFactory } = require('../adapters/providerAdapter'));
  } else {
    // Fallback to relative path from Provider Management Service
    ({ ProviderAdapterFactory } = require('../../Provider_Management_Service/src/adapters/providerAdapter'));
  }
} catch (err) {
  console.error('Error loading Provider Adapter:', err.message);
  process.exit(1);
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3200;

// ============== HEALTH CHECK ==============

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Provider API Service',
    version: '1.0.0'
  });
});

// ============== DOCUMENTATION ENDPOINTS ==============

/**
 * GET /docs
 * List provider OpenAPI YAML files
 */
app.get('/docs', (req, res) => {
  const docsData = {
    redPlug: [
      {
        endpoint: '/redPlug/api/points',
        method: 'GET',
        description: 'List all redPlug charging points'
      },
      {
        endpoint: '/redPlug/api/point/{pointid}',
        method: 'GET',
        description: 'Get redPlug charging point details'
      },
      {
        endpoint: '/redPlug/api/reserve/{pointid}',
        method: 'POST',
        description: 'Reserve a redPlug point with default duration'
      },
      {
        endpoint: '/redPlug/api/reserve/{pointid}/{minutes}',
        method: 'POST',
        description: 'Reserve a redPlug point for a requested duration'
      }
    ],
    greenPlug: [
      {
        endpoint: '/greenPlug/api/chargingPoints',
        method: 'GET',
        description: 'List all greenPlug charging points'
      },
      {
        endpoint: '/greenPlug/api/chargingPoints/{pointid}',
        method: 'GET',
        description: 'Get greenPlug charging point details'
      },
      {
        endpoint: '/greenPlug/api/chargingPoints/{pointid}/reservations',
        method: 'POST',
        description: 'Create a greenPlug reservation'
      }
    ],
    bluePlug: [
      {
        endpoint: '/bluePlug/api/locations',
        method: 'GET',
        description: 'List all bluePlug charging locations'
      },
      {
        endpoint: '/bluePlug/api/location/{pointid}/status',
        method: 'GET',
        description: 'Get bluePlug location status'
      },
      {
        endpoint: '/bluePlug/api/location/{pointid}/hold',
        method: 'POST',
        description: 'Reserve a bluePlug charger'
      }
    ]
  };

  res.status(200).json(docsData);
});

/**
 * GET /docs/{provider_name}
 * Download provider OpenAPI spec
 */
app.get('/docs/:provider_name', (req, res) => {
  const { provider_name } = req.params;
  const validProviders = ['redPlug', 'greenPlug', 'bluePlug'];

  if (!validProviders.includes(provider_name)) {
    return res.status(422).json({
      detail: [
        {
          loc: ['path', 'provider_name'],
          msg: `Invalid provider. Valid providers: ${validProviders.join(', ')}`,
          type: 'value_error'
        }
      ]
    });
  }

  // Return OpenAPI spec as JSON
  const specs = {
    redPlug: `OpenAPI 3.1.0 specification for redPlug provider. Base URL: /redPlug/api. Endpoints: GET /points, GET /point/{pointid}, POST /reserve/{pointid}, POST /reserve/{pointid}/{minutes}`,
    greenPlug: `OpenAPI 3.1.0 specification for greenPlug provider. Base URL: /greenPlug/api. Endpoints: GET /chargingPoints, GET /chargingPoints/{pointid}, POST /chargingPoints/{pointid}/reservations`,
    bluePlug: `OpenAPI 3.1.0 specification for bluePlug provider. Base URL: /bluePlug/api. Endpoints: GET /locations, GET /location/{pointid}/status, POST /location/{pointid}/hold`
  };

  res.status(200).json({
    provider: provider_name,
    spec: specs[provider_name]
  });
});

/**
 * GET /docs/{provider_name}.yaml
 * Download provider OpenAPI YAML (compatibility endpoint)
 */
app.get('/docs/:provider_name.yaml', (req, res) => {
  const { provider_name } = req.params;
  const validProviders = ['redPlug', 'greenPlug', 'bluePlug'];

  if (!validProviders.includes(provider_name)) {
    return res.status(422).json({
      detail: [
        {
          loc: ['path', 'provider_name'],
          msg: `Invalid provider`,
          type: 'value_error'
        }
      ]
    });
  }

  res.setHeader('Content-Type', 'application/yaml');
  res.status(200).send(`# OpenAPI 3.1.0
# Provider: ${provider_name}
# Generated: ${new Date().toISOString()}`);
});

/**
 * GET /docs/{provider_name}/postman
 * Download provider Postman collection
 */
app.get('/docs/:provider_name/postman', (req, res) => {
  const { provider_name } = req.params;
  const validProviders = ['redPlug', 'greenPlug', 'bluePlug'];

  if (!validProviders.includes(provider_name)) {
    return res.status(422).json({
      detail: [
        {
          loc: ['path', 'provider_name'],
          msg: `Invalid provider`,
          type: 'value_error'
        }
      ]
    });
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    info: {
      name: `${provider_name} API Collection`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: []
  });
});

// ============== REDPLUG ENDPOINTS ==============

/**
 * GET /redPlug/api/points
 * List all redPlug charging points
 */
app.get('/redPlug/api/points', async (req, res) => {
  try {
    const authToken = req.headers.authorization;
    const adapter = ProviderAdapterFactory.createAdapter('redPlug');
    const points = await adapter.listChargingPoints(authToken);

    res.status(200).json(points);
  } catch (err) {
    console.error('Error listing redPlug points:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

/**
 * GET /redPlug/api/point/{pointid}
 * Get one redPlug charging point by pointid
 */
app.get('/redPlug/api/point/:pointid', async (req, res) => {
  try {
    const { pointid } = req.params;
    const authToken = req.headers.authorization;

    if (!pointid || isNaN(pointid)) {
      return res.status(422).json({
        detail: [
          {
            loc: ['path', 'pointid'],
            msg: 'Invalid point ID',
            type: 'value_error'
          }
        ]
      });
    }

    const adapter = ProviderAdapterFactory.createAdapter('redPlug');
    const point = await adapter.getChargingPoint(pointid, authToken);

    res.status(200).json(point);
  } catch (err) {
    console.error('Error getting redPlug point:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

/**
 * POST /redPlug/api/reserve/{pointid}
 * Reserve a redPlug point with default duration
 */
app.post('/redPlug/api/reserve/:pointid', async (req, res) => {
  try {
    const { pointid } = req.params;
    const authToken = req.headers.authorization;

    if (!pointid || isNaN(pointid)) {
      return res.status(422).json({
        detail: [
          {
            loc: ['path', 'pointid'],
            msg: 'Invalid point ID',
            type: 'value_error'
          }
        ]
      });
    }

    const adapter = ProviderAdapterFactory.createAdapter('redPlug');
    const reservation = await adapter.reserveChargingPoint(pointid, 60, authToken);

    res.status(200).json(reservation);
  } catch (err) {
    console.error('Error reserving redPlug point:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

/**
 * POST /redPlug/api/reserve/{pointid}/{minutes}
 * Reserve a redPlug point for a requested duration in minutes
 */
app.post('/redPlug/api/reserve/:pointid/:minutes', async (req, res) => {
  try {
    const { pointid, minutes } = req.params;
    const authToken = req.headers.authorization;

    if (!pointid || isNaN(pointid)) {
      return res.status(422).json({
        detail: [
          {
            loc: ['path', 'pointid'],
            msg: 'Invalid point ID',
            type: 'value_error'
          }
        ]
      });
    }

    if (!minutes || isNaN(minutes)) {
      return res.status(422).json({
        detail: [
          {
            loc: ['path', 'minutes'],
            msg: 'Invalid duration',
            type: 'value_error'
          }
        ]
      });
    }

    const adapter = ProviderAdapterFactory.createAdapter('redPlug');
    const reservation = await adapter.reserveChargingPoint(pointid, parseInt(minutes), authToken);

    res.status(200).json(reservation);
  } catch (err) {
    console.error('Error reserving redPlug point:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

// ============== GREENPLUG ENDPOINTS ==============

/**
 * GET /greenPlug/api/chargingPoints
 * List all greenPlug charging points
 */
app.get('/greenPlug/api/chargingPoints', async (req, res) => {
  try {
    const authToken = req.headers.authorization;
    const adapter = ProviderAdapterFactory.createAdapter('greenPlug');
    const points = await adapter.listChargingPoints(authToken);

    res.status(200).json(points);
  } catch (err) {
    console.error('Error listing greenPlug points:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

/**
 * GET /greenPlug/api/chargingPoints/{pointid}
 * Get one greenPlug charging point by pointid
 */
app.get('/greenPlug/api/chargingPoints/:pointid', async (req, res) => {
  try {
    const { pointid } = req.params;
    const authToken = req.headers.authorization;

    if (!pointid || isNaN(pointid)) {
      return res.status(422).json({
        detail: [
          {
            loc: ['path', 'pointid'],
            msg: 'Invalid point ID',
            type: 'value_error'
          }
        ]
      });
    }

    const adapter = ProviderAdapterFactory.createAdapter('greenPlug');
    const point = await adapter.getChargingPoint(pointid, authToken);

    res.status(200).json(point);
  } catch (err) {
    console.error('Error getting greenPlug point:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

/**
 * POST /greenPlug/api/chargingPoints/{pointid}/reservations
 * Create a greenPlug reservation
 */
app.post('/greenPlug/api/chargingPoints/:pointid/reservations', async (req, res) => {
  try {
    const { pointid } = req.params;
    const { duration } = req.body;
    const authToken = req.headers.authorization;

    if (!pointid || isNaN(pointid)) {
      return res.status(422).json({
        detail: [
          {
            loc: ['path', 'pointid'],
            msg: 'Invalid point ID',
            type: 'value_error'
          }
        ]
      });
    }

    const durationMinutes = duration || 60;

    const adapter = ProviderAdapterFactory.createAdapter('greenPlug');
    const reservation = await adapter.reserveChargingPoint(pointid, durationMinutes, authToken);

    res.status(200).json(reservation);
  } catch (err) {
    console.error('Error creating greenPlug reservation:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

// ============== BLUEPLUG ENDPOINTS ==============

/**
 * GET /bluePlug/api/locations
 * List all bluePlug charging locations
 */
app.get('/bluePlug/api/locations', async (req, res) => {
  try {
    const authToken = req.headers.authorization;
    const adapter = ProviderAdapterFactory.createAdapter('bluePlug');
    const locations = await adapter.listChargingPoints(authToken);

    res.status(200).json(locations);
  } catch (err) {
    console.error('Error listing bluePlug locations:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

/**
 * GET /bluePlug/api/location/{pointid}/status
 * Get status for one bluePlug charger by pointid
 */
app.get('/bluePlug/api/location/:pointid/status', async (req, res) => {
  try {
    const { pointid } = req.params;
    const authToken = req.headers.authorization;

    if (!pointid || isNaN(pointid)) {
      return res.status(422).json({
        detail: [
          {
            loc: ['path', 'pointid'],
            msg: 'Invalid point ID',
            type: 'value_error'
          }
        ]
      });
    }

    const adapter = ProviderAdapterFactory.createAdapter('bluePlug');
    const location = await adapter.getChargingPoint(pointid, authToken);

    res.status(200).json(location);
  } catch (err) {
    console.error('Error getting bluePlug location:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

/**
 * POST /bluePlug/api/location/{pointid}/hold
 * Reserve a bluePlug charger using a query parameter for minutes
 */
app.post('/bluePlug/api/location/:pointid/hold', async (req, res) => {
  try {
    const { pointid } = req.params;
    const { minutes } = req.query;
    const authToken = req.headers.authorization;

    if (!pointid || isNaN(pointid)) {
      return res.status(422).json({
        detail: [
          {
            loc: ['path', 'pointid'],
            msg: 'Invalid point ID',
            type: 'value_error'
          }
        ]
      });
    }

    const durationMinutes = minutes ? parseInt(minutes) : 60;

    if (durationMinutes < 1) {
      return res.status(422).json({
        detail: [
          {
            loc: ['query', 'minutes'],
            msg: 'Duration must be at least 1 minute',
            type: 'value_error'
          }
        ]
      });
    }

    const adapter = ProviderAdapterFactory.createAdapter('bluePlug');
    const reservation = await adapter.reserveChargingPoint(pointid, durationMinutes, authToken);

    res.status(200).json(reservation);
  } catch (err) {
    console.error('Error holding bluePlug charger:', err.message);
    res.status(500).json({
      detail: [
        {
          loc: ['body'],
          msg: err.message,
          type: 'value_error'
        }
      ]
    });
  }
});

// ============== ERROR HANDLING ==============

/**
 * 404 Error Handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

/**
 * Global Error Handler
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// ============== SERVER STARTUP ==============

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║         Provider API Service Started              ║
║  Port: ${PORT}                                    ║
║  Version: 1.0.0                                   ║
║  OpenAPI: 3.1.0                                   ║
║  Providers: redPlug, greenPlug, bluePlug         ║
╚════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
