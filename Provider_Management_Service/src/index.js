/**
 * Provider Management Service
 * Manages provider registration, updates, and federation
 * Uses MariaDB for persistence
 * Port: 3101
 */

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3101;

// ============== DATABASE CONFIGURATION ==============

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mariadb',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'provider_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});

/**
 * Middleware: Verify auth token (simplified for demo)
 */
function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /providers/register
 * Register a new provider
 */
app.post('/providers/register', verifyAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      company_name,
      password,
      TIN,
      email,
      contact_number,
      API_endpoint,
      API_key
    } = req.body;

    if (!company_name || !password || !TIN || !email || !API_endpoint || !API_key) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await conn.query(
      `INSERT INTO providers (company_name, password_hash, TIN, email, contact_number, API_endpoint, API_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [company_name, passwordHash, TIN, email, contact_number || null, API_endpoint, API_key]
    );

    res.status(201).json({
      message: 'Provider registered successfully',
      provider: {
        company_name,
        email,
        API_endpoint
      }
    });
  } catch (err) {
    console.error('Provider registration error:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Provider or field already exists' });
    }
    res.status(500).json({ error: 'Provider registration failed', message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * GET /providers
 * List all registered providers
 */
app.get('/providers', verifyAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [providers] = await conn.query(
      `SELECT provider_id, company_name, email, contact_number, API_endpoint, created_at, updated_at 
       FROM providers ORDER BY created_at DESC`
    );

    res.json({
      total: providers.length,
      providers
    });
  } catch (err) {
    console.error('Error fetching providers:', err.message);
    res.status(500).json({ error: 'Failed to fetch providers', message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * GET /providers/:providerId
 * Get provider details by ID
 */
app.get('/providers/:providerId', verifyAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { providerId } = req.params;

    const [providers] = await conn.query(
      `SELECT provider_id, company_name, email, contact_number, API_endpoint, created_at, updated_at 
       FROM providers WHERE provider_id = ?`,
      [providerId]
    );

    if (providers.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json(providers[0]);
  } catch (err) {
    console.error('Error fetching provider:', err.message);
    res.status(500).json({ error: 'Failed to fetch provider', message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * PUT /providers/:providerId
 * Update provider information
 */
app.put('/providers/:providerId', verifyAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { providerId } = req.params;
    const { company_name, email, contact_number, API_endpoint } = req.body;

    const updateFields = [];
    const updateValues = [];

    if (company_name) {
      updateFields.push('company_name = ?');
      updateValues.push(company_name);
    }
    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (contact_number) {
      updateFields.push('contact_number = ?');
      updateValues.push(contact_number);
    }
    if (API_endpoint) {
      updateFields.push('API_endpoint = ?');
      updateValues.push(API_endpoint);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(providerId);

    const query = `UPDATE providers SET ${updateFields.join(', ')} WHERE provider_id = ?`;
    const result = await conn.query(query, updateValues);

    if (result[0].affectedRows === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({ message: 'Provider updated successfully' });
  } catch (err) {
    console.error('Provider update error:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email or API endpoint already in use' });
    }
    res.status(500).json({ error: 'Provider update failed', message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /providers/:providerId
 * Delete a provider
 */
app.delete('/providers/:providerId', verifyAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { providerId } = req.params;

    const result = await conn.query(
      `DELETE FROM providers WHERE provider_id = ?`,
      [providerId]
    );

    if (result[0].affectedRows === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({ message: 'Provider deleted successfully' });
  } catch (err) {
    console.error('Provider delete error:', err.message);
    res.status(500).json({ error: 'Provider deletion failed', message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * POST /providers/:providerId/validate
 * Validate provider credentials
 */
app.post('/providers/:providerId/validate', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { providerId } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const [providers] = await conn.query(
      `SELECT password_hash FROM providers WHERE provider_id = ?`,
      [providerId]
    );

    if (providers.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const isValid = await bcrypt.compare(password, providers[0].password_hash);

    res.json({ valid: isValid });
  } catch (err) {
    console.error('Validation error:', err.message);
    res.status(500).json({ error: 'Validation failed', message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * GET /providers/health
 * Service health check
 */
app.get('/providers/health', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');

    res.json({
      status: 'healthy',
      service: 'Provider Management Service',
      port: PORT,
      database: process.env.DB_NAME || 'provider_db',
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed',
      message: err.message
    });
  } finally {
    conn.release();
  }
});

/**
 * GET /health
 * Alias for health check
 */
app.get('/health', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');

    res.json({
      status: 'ok',
      service: 'provider-management-service',
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      message: err.message
    });
  } finally {
    conn.release();
  }
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

// ============== SERVER STARTUP ==============

async function start() {
  try {
    // Test database connection
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();

    app.listen(PORT, () => {
      console.log(`✅ Provider Management Service listening on port ${PORT}`);
      console.log(`📍 Database: ${process.env.DB_NAME || 'provider_db'}`);
      console.log(`📍 DB Host: ${process.env.DB_HOST || 'mariadb'}`);
    });
  } catch (err) {
    console.error('Failed to start service:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;

