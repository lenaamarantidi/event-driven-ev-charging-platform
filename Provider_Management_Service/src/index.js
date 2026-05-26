/**
 * Provider Management Service
 * MariaDB-backed provider registry
 * Port: 3101
 */

const express = require('express');
const mysql = require('mysql2/promise');
const { ProviderAdapterFactory } = require('./adapters/providerAdapter');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3101);
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'provider_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'provider_pass';
const DB_NAME = process.env.DB_NAME || 'provider_db';
const MESSAGE_BROKER_URL = process.env.MESSAGE_BROKER_URL || 'http://localhost:3003';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Provider (
      provider_id INT PRIMARY KEY AUTO_INCREMENT,
      company_name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      TIN DECIMAL(9,0) NOT NULL,
      email VARCHAR(255) NOT NULL,
      contact_number DECIMAL(10,0) NULL,
      API_endpoint VARCHAR(255) NOT NULL,
      API_key VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_provider_company_name (company_name),
      UNIQUE KEY uq_provider_tin (TIN),
      UNIQUE KEY uq_provider_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function mapRequestToProviderPayload(body) {
  return {
    company_name: body.company_name ?? body.name,
    password_hash: body.password_hash,
    TIN: body.TIN,
    email: body.email ?? body.contactEmail,
    contact_number: body.contact_number ?? body.phone ?? null,
    API_endpoint: body.API_endpoint,
    API_key: body.API_key
  };
}

function validateCreatePayload(payload) {
  const required = ['company_name', 'password_hash', 'TIN', 'email', 'API_endpoint', 'API_key'];
  const missing = required.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
  const formatErrors = [];

  // Email format check
  if (payload.email && !/^\S+@\S+\.\S+$/.test(payload.email)) {
    formatErrors.push('email');
  }
  // API_endpoint URL format check (simple)
  try {
    if (payload.API_endpoint) {
      new URL(payload.API_endpoint);
    }
  } catch (e) {
    formatErrors.push('API_endpoint');
  }

  return { missing, formatErrors };
}

function normalizeProvider(row) {
  return {
    provider_id: row.provider_id,
    company_name: row.company_name,
    password_hash: row.password_hash,
    TIN: row.TIN,
    email: row.email,
    contact_number: row.contact_number,
    API_endpoint: row.API_endpoint,
    API_key: row.API_key,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getProviderById(providerId) {
  const [rows] = await pool.query(
    `SELECT provider_id, company_name, password_hash, TIN, email, contact_number, API_endpoint, API_key, created_at, updated_at
     FROM Provider
     WHERE provider_id = ?`,
    [providerId]
  );

  if (!rows.length) {
    return null;
  }

  return normalizeProvider(rows[0]);
}


// Νέο endpoint: /providers/signup (secured, validation, broker event)
const axios = require('axios');

app.post('/providers/signup', async (req, res) => {
  try {
    const payload = mapRequestToProviderPayload(req.body);
    const { missing, formatErrors } = validateCreatePayload(payload);

    if (missing.length || formatErrors.length) {
      return res.status(400).json({
        error: missing.length ? 'Missing required fields' : 'Invalid field format',
        missing,
        formatErrors
      });
    }

    // Εισαγωγή provider
    let result, provider;
    try {
      [result] = await pool.query(
        `INSERT INTO Provider (company_name, password_hash, TIN, email, contact_number, API_endpoint, API_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.company_name,
          payload.password_hash,
          payload.TIN,
          payload.email,
          payload.contact_number,
          payload.API_endpoint,
          payload.API_key
        ]
      );
      provider = await getProviderById(result.insertId);
    } catch (err) {
      // Έλεγχος για duplicate entry
      if (err.code === 'ER_DUP_ENTRY' && err.message) {
        let conflictField = 'unknown';
        if (err.message.includes('uq_provider_company_name')) conflictField = 'company_name';
        else if (err.message.includes('uq_provider_tin')) conflictField = 'TIN';
        else if (err.message.includes('uq_provider_email')) conflictField = 'email';
        return res.status(409).json({
          error: 'Duplicate provider',
          conflictField
        });
      }
      // Άλλο DB error
      return res.status(500).json({
        error: 'Provider registration failed',
        message: err.message
      });
    }

    // Αποστολή canonical event στον message broker
    try {
      await axios.post(`${MESSAGE_BROKER_URL}/api/events/publish`, {
        eventType: 'provider.registered',
        data: {
          providerId: provider.provider_id,
          companyName: provider.company_name,
          TIN: provider.TIN,
          email: provider.email,
          apiEndpoint: provider.API_endpoint,
          apiKey: provider.API_key,
          contactNumber: provider.contact_number,
          createdAt: provider.created_at
        },
        sourceService: 'provider-management-service'
      }, { timeout: 5000 });
    } catch (err) {
      // Δεν μπλοκάρει το registration αν αποτύχει το event
      console.error('⚠️ Failed to publish provider.registered event:', err.message);
    }

    return res.status(201).json({
      message: 'Provider registered successfully',
      provider
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Provider registration failed',
      message: err.message
    });
  }
});

app.get('/providers', verifyAuth, async (req, res) => {
  try {
    const { externalSource } = req.query;

    if (externalSource) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(externalSource);
        const externalProviders = await adapter.getProviders();

        return res.json({
          source: externalSource,
          total: externalProviders.length,
          providers: externalProviders
        });
      } catch (err) {
        return res.status(400).json({
          error: `Failed to fetch from ${externalSource}`,
          message: err.message
        });
      }
    }

    const [rows] = await pool.query(
      `SELECT provider_id, company_name, password_hash, TIN, email, contact_number, API_endpoint, API_key, created_at, updated_at
       FROM Provider
       ORDER BY provider_id DESC`
    );

    return res.json({
      total: rows.length,
      source: 'provider-db',
      providers: rows.map(normalizeProvider)
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch providers',
      message: err.message
    });
  }
});

app.get('/providers/:providerId(\\d+)', verifyAuth, async (req, res) => {
  try {
    const provider = await getProviderById(req.params.providerId);

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    return res.json({ provider });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch provider',
      message: err.message
    });
  }
});

app.put('/providers/:providerId(\\d+)', verifyAuth, async (req, res) => {
  try {
    const providerId = req.params.providerId;
    const existing = await getProviderById(providerId);

    if (!existing) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const payload = mapRequestToProviderPayload(req.body);
    const mutable = ['company_name', 'password_hash', 'TIN', 'email', 'contact_number', 'API_endpoint', 'API_key'];

    const setClauses = [];
    const values = [];

    for (const column of mutable) {
      if (payload[column] !== undefined) {
        setClauses.push(`${column} = ?`);
        values.push(payload[column]);
      }
    }

    if (!setClauses.length) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    values.push(providerId);

    await pool.query(
      `UPDATE Provider
       SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE provider_id = ?`,
      values
    );

    const provider = await getProviderById(providerId);

    return res.json({
      message: 'Provider updated successfully',
      provider
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Provider update failed',
      message: err.message
    });
  }
});

app.post('/providers/:providerId(\\d+)/sync', verifyAuth, async (req, res) => {
  try {
    const provider = await getProviderById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const sourceList = req.body.sources || ['redPlug', 'greenPlug', 'bluePlug'];
    const syncResults = {};

    for (const providerName of sourceList) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(providerName);
        const status = await adapter.checkStatus();
        syncResults[providerName] = { status: 'synced', data: status };
      } catch (err) {
        syncResults[providerName] = { status: 'failed', error: err.message };
      }
    }

    return res.json({
      message: 'Provider sync completed',
      provider,
      syncDetails: syncResults
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Provider sync failed',
      message: err.message
    });
  }
});

app.get('/providers/status/all', async (req, res) => {
  try {
    const statusList = {};

    for (const providerName of ['redPlug', 'greenPlug', 'bluePlug']) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(providerName);
        statusList[providerName] = await adapter.checkStatus();
      } catch (err) {
        statusList[providerName] = {
          provider: providerName,
          status: 'error',
          error: err.message
        };
      }
    }

    return res.json({
      timestamp: new Date(),
      statuses: statusList
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to check statuses',
      message: err.message
    });
  }
});

app.get('/providers/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM Provider');
    return res.json({
      status: 'healthy',
      service: 'Provider Management Service',
      port: PORT,
      timestamp: new Date(),
      registeredProviders: Number(rows[0].total || 0)
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'Provider Management Service',
      message: err.message
    });
  }
});

app.use((err, req, res, next) => {
  return res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Provider Management Service listening on port ${PORT}`);
      console.log(`MariaDB connected: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start Provider Management Service:', err.message);
    process.exit(1);
  });

module.exports = app;
