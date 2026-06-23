/**
 * Provider Management Controllers
 * UC03: Register to saasCharge
 */

const { pool } = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { publishProviderRegistered } = require('./rabbitmq');

const JWT_SECRET = process.env.JWT_SECRET || 'provider_jwt_secret';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const COMPANY_TIN_REGEX = /^\d{9}$/;
const MAX_PROVIDER_NAME_LENGTH = 255;
const MAX_API_KEY_LENGTH = 255;
const MAX_ENDPOINT_LENGTH = 500;
const MAX_PASSWORD_LENGTH = 128;

function validateProviderEmail(email) {
  return typeof email === 'string' && /\S+@\S+\.\S+/.test(email);
}

function validateCompanyTin(companyTin) {
  return typeof companyTin === 'string' && COMPANY_TIN_REGEX.test(companyTin.trim());
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function getProviderByName(providerName) {
  const [rows] = await pool.query(
    'SELECT * FROM providers WHERE provider_name = ? ORDER BY provider_id ASC LIMIT 1',
    [providerName.trim()]
  );
  return rows[0] || null;
}

/**
 * Validate provider registration request
 */
function validateRegistrationRequest(data) {
  const errors = [];

  if (!data.provider_name || typeof data.provider_name !== 'string' || data.provider_name.trim().length === 0) {
    errors.push('provider_name is required and must be a non-empty string');
  } else if (data.provider_name.trim().length > MAX_PROVIDER_NAME_LENGTH) {
    errors.push(`provider_name must be at most ${MAX_PROVIDER_NAME_LENGTH} characters long`);
  }

  if (!data.company_tin || !validateCompanyTin(data.company_tin)) {
    errors.push('company_tin is required and must be exactly 9 digits');
  }

  if (!data.base_url || typeof data.base_url !== 'string' || data.base_url.trim().length === 0) {
    errors.push('base_url is required and must be a non-empty string');
  } else if (!isValidHttpUrl(data.base_url)) {
    errors.push('base_url must be a valid http/https URL');
  }

  if (!data.api_key || typeof data.api_key !== 'string' || data.api_key.trim().length === 0) {
    errors.push('api_key is required and must be a non-empty string');
  } else if (data.api_key.trim().length > MAX_API_KEY_LENGTH) {
    errors.push(`api_key must be at most ${MAX_API_KEY_LENGTH} characters long`);
  }

  if (!data.provider_email || !validateProviderEmail(data.provider_email)) {
    errors.push('provider_email is required and must be a valid email address');
  }

  if (!data.password || typeof data.password !== 'string' || data.password.length < 8 || data.password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`password is required and must be between 8 and ${MAX_PASSWORD_LENGTH} characters long`);
  }

  const requiredEndpoints = [
    'endpoint_list_points',
    'endpoint_point_details',
    'endpoint_reserve'
  ];

  requiredEndpoints.forEach(endpoint => {
    if (!data[endpoint] || typeof data[endpoint] !== 'string' || data[endpoint].trim().length === 0) {
      errors.push(`${endpoint} is required and must be a non-empty string`);
    } else if (!isValidEndpointPathOrUrl(data[endpoint])) {
      errors.push(`${endpoint} must be a valid absolute URL or an absolute path starting with /`);
    } else if (data[endpoint].trim().length > MAX_ENDPOINT_LENGTH) {
      errors.push(`${endpoint} must be at most ${MAX_ENDPOINT_LENGTH} characters long`);
    }
  });

  if (data.endpoint_reserve_duration !== undefined && data.endpoint_reserve_duration !== null && String(data.endpoint_reserve_duration).trim().length > 0) {
    if (typeof data.endpoint_reserve_duration !== 'string') {
      errors.push('endpoint_reserve_duration must be a string when provided');
    } else if (!isValidEndpointPathOrUrl(data.endpoint_reserve_duration)) {
      errors.push('endpoint_reserve_duration must be a valid absolute URL or an absolute path starting with /');
    } else if (data.endpoint_reserve_duration.trim().length > MAX_ENDPOINT_LENGTH) {
      errors.push(`endpoint_reserve_duration must be at most ${MAX_ENDPOINT_LENGTH} characters long`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Basic URL validation
 */
function isValidHttpUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isValidEndpointPathOrUrl(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) {
    return !/\s/.test(trimmed);
  }

  return isValidHttpUrl(trimmed);
}

function resolveAdapterAssignment(providerName) {
  const normalized = String(providerName || '').trim().toLowerCase();
  if (normalized === 'redplug') {
    return { adapter_name: 'provider-adapter-redplug', integration_status: 'integrated' };
  }
  if (normalized === 'greenplug') {
    return { adapter_name: 'provider-adapter-greenplug', integration_status: 'integrated' };
  }
  if (normalized === 'blueplug') {
    return { adapter_name: 'provider-adapter-blueplug', integration_status: 'integrated' };
  }

  return { adapter_name: null, integration_status: 'integration_pending' };
}

/**
 * POST /api/providers/register
 * Register a new EV charging provider
 * 
 * Request body:
 * {
 *   "provider_name": "string",
 *   "provider_email": "string",
 *   "company_tin": "string",
 *   "password": "string",
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
    const {
      provider_name,
      provider_email,
      company_tin,
      password,
      base_url,
      api_key,
      endpoint_list_points,
      endpoint_point_details,
      endpoint_reserve,
      endpoint_reserve_duration
    } = req.body;

    // Validate input
    const validation = validateRegistrationRequest({
      provider_name,
      provider_email,
      company_tin,
      password,
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

    const normalizedProvider = {
      provider_name: provider_name.trim(),
      provider_email: provider_email.toLowerCase().trim(),
      company_tin: company_tin.trim(),
      password,
      base_url: base_url.trim(),
      api_key: api_key.trim(),
      endpoint_list_points: endpoint_list_points.trim(),
      endpoint_point_details: endpoint_point_details.trim(),
      endpoint_reserve: endpoint_reserve.trim(),
      endpoint_reserve_duration:
        typeof endpoint_reserve_duration === 'string' && endpoint_reserve_duration.trim().length > 0
          ? endpoint_reserve_duration.trim()
          : null
    };

    // Check if provider already exists
    const [existingProvidersByName] = await pool.query(
      'SELECT provider_id FROM providers WHERE provider_name = ?',
      [normalizedProvider.provider_name]
    );

    if (existingProvidersByName.length > 0) {
      return res.status(409).json({
        error: 'Provider with this name already exists'
      });
    }

    const [existingProvidersByEmail] = await pool.query(
      'SELECT provider_id FROM providers WHERE provider_email = ?',
      [normalizedProvider.provider_email]
    );

    if (existingProvidersByEmail.length > 0) {
      return res.status(409).json({
        error: 'Provider with this email already exists'
      });
    }

    const [existingProvidersByTin] = await pool.query(
      'SELECT provider_id FROM providers WHERE company_tin = ?',
      [normalizedProvider.company_tin]
    );

    if (existingProvidersByTin.length > 0) {
      return res.status(409).json({
        error: 'Provider with this company_tin already exists'
      });
    }

    const passwordHash = await hashPassword(normalizedProvider.password);
    const adapterAssignment = resolveAdapterAssignment(normalizedProvider.provider_name);

    // Insert provider into database
    const [result] = await pool.query(
      `INSERT INTO providers (
        provider_name,
        provider_email,
        company_tin,
        password_hash,
        adapter_name,
        integration_status,
        base_url,
        api_key,
        endpoint_list_points,
        endpoint_point_details,
        endpoint_reserve,
        endpoint_reserve_duration,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        normalizedProvider.provider_name,
        normalizedProvider.provider_email,
        normalizedProvider.company_tin,
        passwordHash,
        adapterAssignment.adapter_name,
        adapterAssignment.integration_status,
        normalizedProvider.base_url,
        normalizedProvider.api_key,
        normalizedProvider.endpoint_list_points,
        normalizedProvider.endpoint_point_details,
        normalizedProvider.endpoint_reserve,
        normalizedProvider.endpoint_reserve_duration
      ]
    );

    // Fetch the created provider
    const [providers] = await pool.query(
      'SELECT provider_id, provider_name, provider_email, company_tin, adapter_name, integration_status, base_url, api_key, endpoint_list_points, endpoint_point_details, endpoint_reserve, endpoint_reserve_duration, status, registered_at FROM providers WHERE provider_id = ?',
      [result.insertId]
    );

    const newProvider = providers[0];

    // Publish provider_registered event to Analytics Service
    await publishProviderRegistered(newProvider.provider_id, newProvider.provider_name, new Date().toISOString());

    return res.status(201).json({
      message: 'Provider registered successfully',
      provider: {
        provider_id: newProvider.provider_id,
        provider_name: newProvider.provider_name,
        provider_email: newProvider.provider_email,
        company_tin: newProvider.company_tin,
        adapter_name: newProvider.adapter_name,
        integration_status: newProvider.integration_status,
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
      if (typeof err.sqlMessage === 'string' && err.sqlMessage.includes('uq_provider_email')) {
        return res.status(409).json({
          error: 'Provider with this email already exists'
        });
      }

      if (typeof err.sqlMessage === 'string' && err.sqlMessage.includes('uq_company_tin')) {
        return res.status(409).json({
          error: 'Provider with this company_tin already exists'
        });
      }

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
 * POST /api/providers/login
 * Provider login with provider_name and password.
 */
async function loginProvider(req, res) {
  try {
    const { provider_name, password } = req.body;

    if (!provider_name || typeof provider_name !== 'string' || provider_name.trim().length === 0) {
      return res.status(400).json({ error: 'provider_name is required' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'password is required and must be at least 8 characters' });
    }

    const provider = await getProviderByName(provider_name);
    if (!provider || !provider.password_hash) {
      return res.status(401).json({ error: 'Invalid provider name or password' });
    }

    const passwordMatches = await comparePassword(password, provider.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid provider name or password' });
    }

    const accessToken = jwt.sign(
      {
        sub: provider.provider_id,
        provider_name: provider.provider_name,
        provider_email: provider.provider_email
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.json({
      providerId: provider.provider_id,
      providerName: provider.provider_name,
      accessToken
    });
  } catch (err) {
    console.error('Error in loginProvider:', err.message);
    return res.status(500).json({
      error: 'Failed to login provider',
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
      'SELECT provider_id, provider_name, provider_email, company_tin, adapter_name, integration_status, base_url, status, endpoint_list_points, endpoint_point_details, endpoint_reserve, endpoint_reserve_duration, registered_at FROM providers WHERE provider_id = ?',
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
        provider_email: provider.provider_email,
        company_tin: provider.company_tin,
        adapter_name: provider.adapter_name,
        integration_status: provider.integration_status,
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

    let query = 'SELECT provider_id, provider_name, adapter_name, integration_status, base_url, status, registered_at FROM providers WHERE 1=1';
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
        adapter_name: p.adapter_name,
        integration_status: p.integration_status,
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
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
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
  loginProvider,
  getProvider,
  getAllProviders,
  suspendProvider,
  healthCheck
};
