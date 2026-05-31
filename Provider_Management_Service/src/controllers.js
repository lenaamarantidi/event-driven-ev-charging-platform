/**
 * Provider Management Controllers
 * UC03: Register to saasCharge
 */

const { pool } = require('./db');
const { publishProviderRegistered } = require('./rabbitmq');

/**
 * Validate provider registration request
 */
function validateRegistrationRequest(data) {
  const errors = [];

  if (!data.provider_name || typeof data.provider_name !== 'string' || data.provider_name.trim().length === 0) {
    errors.push('provider_name is required and must be a non-empty string');
  }

  if (!data.base_url || typeof data.base_url !== 'string' || data.base_url.trim().length === 0) {
    errors.push('base_url is required and must be a non-empty string');
  } else if (!isValidUrl(data.base_url)) {
    errors.push('base_url must be a valid URL');
  }

  if (!data.api_key || typeof data.api_key !== 'string' || data.api_key.trim().length === 0) {
    errors.push('api_key is required and must be a non-empty string');
  }

  // Validate the 4 required endpoints
  const endpoints = [
    'endpoint_list_points',
    'endpoint_point_details',
    'endpoint_reserve',
    'endpoint_reserve_duration'
  ];

  endpoints.forEach(endpoint => {
    if (!data[endpoint] || typeof data[endpoint] !== 'string' || data[endpoint].trim().length === 0) {
      errors.push(`${endpoint} is required and must be a non-empty string`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Basic URL validation
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * POST /api/providers/register
 * Register a new EV charging provider
 * 
 * Request body:
 * {
 *   "provider_name": "string",
 *   "base_url": "string",
 *   "api_key": "string",
 *   "endpoint_list_points": "string",
 *   "endpoint_point_details": "string",
 *   "endpoint_reserve": "string",
 *   "endpoint_reserve_duration": "string"
 * }
 */
async function registerProvider(req, res) {
  try {
    const { provider_name, base_url, api_key, endpoint_list_points, endpoint_point_details, endpoint_reserve, endpoint_reserve_duration } = req.body;

    // Validate input
    const validation = validateRegistrationRequest({
      provider_name,
      base_url,
      api_key,
      endpoint_list_points,
      endpoint_point_details,
      endpoint_reserve,
      endpoint_reserve_duration
    });

    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Check if provider already exists
    const [existingProviders] = await pool.query(
      'SELECT provider_id FROM providers WHERE provider_name = ?',
      [provider_name.trim()]
    );

    if (existingProviders.length > 0) {
      return res.status(409).json({
        error: 'Provider with this name already exists'
      });
    }

    // Insert provider into database
    const [result] = await pool.query(
      `INSERT INTO providers (
        provider_name, 
        base_url, 
        api_key, 
        endpoint_list_points, 
        endpoint_point_details, 
        endpoint_reserve, 
        endpoint_reserve_duration,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        provider_name.trim(),
        base_url.trim(),
        api_key.trim(),
        endpoint_list_points.trim(),
        endpoint_point_details.trim(),
        endpoint_reserve.trim(),
        endpoint_reserve_duration.trim()
      ]
    );

    // Fetch the created provider
    const [providers] = await pool.query(
      'SELECT provider_id, provider_name, base_url, api_key, endpoint_list_points, endpoint_point_details, endpoint_reserve, endpoint_reserve_duration, status, registered_at FROM providers WHERE provider_id = ?',
      [result.insertId]
    );

    const newProvider = providers[0];

    // Publish provider.registered event to RabbitMQ
    await publishProviderRegistered(newProvider);

    return res.status(201).json({
      message: 'Provider registered successfully',
      provider: {
        provider_id: newProvider.provider_id,
        provider_name: newProvider.provider_name,
        base_url: newProvider.base_url,
        status: newProvider.status,
        endpoints: {
          listPoints: newProvider.endpoint_list_points,
          pointDetails: newProvider.endpoint_point_details,
          reserve: newProvider.endpoint_reserve,
          reserveDuration: newProvider.endpoint_reserve_duration
        },
        registered_at: newProvider.registered_at
      }
    });
  } catch (err) {
    console.error('Error in registerProvider:', err.message);
    
    // Handle duplicate key error
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Provider with this name already exists'
      });
    }

    return res.status(500).json({
      error: 'Failed to register provider',
      message: err.message
    });
  }
}

/**
 * GET /api/providers/:providerId
 * Retrieve provider details by ID
 */
async function getProvider(req, res) {
  try {
    const { providerId } = req.params;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const [providers] = await pool.query(
      'SELECT provider_id, provider_name, base_url, status, endpoint_list_points, endpoint_point_details, endpoint_reserve, endpoint_reserve_duration, registered_at FROM providers WHERE provider_id = ?',
      [parseInt(providerId, 10)]
    );

    if (providers.length === 0) {
      return res.status(404).json({
        error: 'Provider not found'
      });
    }

    const provider = providers[0];

    return res.json({
      provider: {
        provider_id: provider.provider_id,
        provider_name: provider.provider_name,
        base_url: provider.base_url,
        status: provider.status,
        endpoints: {
          listPoints: provider.endpoint_list_points,
          pointDetails: provider.endpoint_point_details,
          reserve: provider.endpoint_reserve,
          reserveDuration: provider.endpoint_reserve_duration
        },
        registered_at: provider.registered_at
      }
    });
  } catch (err) {
    console.error('Error in getProvider:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch provider',
      message: err.message
    });
  }
}

/**
 * GET /api/providers
 * List all registered providers
 */
async function getAllProviders(req, res) {
  try {
    const { status = 'active', limit = 100, offset = 0 } = req.query;

    let query = 'SELECT provider_id, provider_name, base_url, status, registered_at FROM providers WHERE 1=1';
    const values = [];

    if (status) {
      query += ' AND status = ?';
      values.push(status);
    }

    query += ' ORDER BY registered_at DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit, 10) || 100, parseInt(offset, 10) || 0);

    const [providers] = await pool.query(query, values);

    return res.json({
      total: providers.length,
      providers: providers.map(p => ({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        base_url: p.base_url,
        status: p.status,
        registered_at: p.registered_at
      }))
    });
  } catch (err) {
    console.error('Error in getAllProviders:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch providers',
      message: err.message
    });
  }
}

/**
 * POST /api/providers/:providerId/suspend
 * Suspend a provider (change status to suspended)
 */
async function suspendProvider(req, res) {
  try {
    const { providerId } = req.params;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const [result] = await pool.query(
      'UPDATE providers SET status = ? WHERE provider_id = ?',
      ['suspended', parseInt(providerId, 10)]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Provider not found'
      });
    }

    return res.json({
      message: 'Provider suspended successfully',
      provider_id: parseInt(providerId, 10),
      status: 'suspended'
    });
  } catch (err) {
    console.error('Error in suspendProvider:', err.message);
    return res.status(500).json({
      error: 'Failed to suspend provider',
      message: err.message
    });
  }
}

/**
 * Health check endpoint
 */
async function healthCheck(req, res) {
  try {
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM providers');

    return res.json({
      status: 'healthy',
      service: 'provider-management-service',
      port: process.env.PORT || 3105,
      database: process.env.DB_NAME || 'provider_mgmt_db',
      totalProviders: Number(countRows[0].total || 0),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'provider-management-service',
      message: err.message
    });
  }
}

module.exports = {
  registerProvider,
  getProvider,
  getAllProviders,
  suspendProvider,
  healthCheck
};
