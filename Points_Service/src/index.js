/**
 * Points Service
 * 
 * Κεντρικό repository για όλα τα σημεία φόρτισης (redPlug, greenPlug, bluePlug)
 * Διαχειρίζεται:
 * - Αποθήκευση σημείων από 3 πηγές
 * - Κατάσταση κάθε σημείου (available, reserved, offline)
 * - Query endpoints για τον Map Service
 * - Event publishing για ενημερώσεις
 */

const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// ============== DATABASE CONFIGURATION ==============
const pool = new Pool({
  connectionString: process.env.POINTS_DB_URL || 'postgresql://postgres:password@localhost:5432/points_service',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ============== DATABASE INITIALIZATION ==============

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS charging_points (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(50) NOT NULL CHECK (provider IN ('redPlug', 'greenPlug', 'bluePlug')),
        external_id VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255),
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        capacity_kw INTEGER,
        price_per_kwh DECIMAL(10, 4),
        status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'offline', 'maintenance')),
        reserved_until TIMESTAMP,
        reserved_by UUID,
        last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        raw_data JSONB
      );
      
      CREATE INDEX IF NOT EXISTS idx_provider ON charging_points(provider);
      CREATE INDEX IF NOT EXISTS idx_status ON charging_points(status);
      CREATE INDEX IF NOT EXISTS idx_external_id ON charging_points(external_id);
      CREATE INDEX IF NOT EXISTS idx_location ON charging_points USING GIST(
        ll_to_earth(latitude, longitude)
      );
      
      CREATE TABLE IF NOT EXISTS points_sync_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(50) NOT NULL,
        sync_type VARCHAR(50) DEFAULT 'full',
        total_points INTEGER,
        new_points INTEGER,
        updated_points INTEGER,
        deleted_points INTEGER,
        duration_ms INTEGER,
        status VARCHAR(50) DEFAULT 'success',
        error_message TEXT,
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_sync_log_provider ON points_sync_log(provider);
      CREATE INDEX IF NOT EXISTS idx_sync_log_date ON points_sync_log(synced_at);
      
      CREATE TABLE IF NOT EXISTS points_clicks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        point_id UUID NOT NULL REFERENCES charging_points(id) ON DELETE CASCADE,
        user_id UUID,
        click_type VARCHAR(50) NOT NULL CHECK (click_type IN ('view', 'reserve_attempt', 'details')),
        clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_clicks_point ON points_clicks(point_id);
      CREATE INDEX IF NOT EXISTS idx_clicks_user ON points_clicks(user_id);
      CREATE INDEX IF NOT EXISTS idx_clicks_date ON points_clicks(clicked_at);
    `);

    console.log('✓ Database initialized successfully');
  } catch (err) {
    console.error('✗ Database initialization error:', err.message);
  } finally {
    client.release();
  }
}

initializeDatabase();

// ============== PROVIDER MAPPING ==============

const PROVIDER_CONFIG = {
  redPlug: {
    base: process.env.REDPLUG_BASE_URL || 'https://api.redplug.local',
    endpoints: {
      list: '/points',
      detail: '/point/{pointid}',
      status: '/point/{pointid}/status'
    }
  },
  greenPlug: {
    base: process.env.GREENPLUG_BASE_URL || 'https://api.greenplug.local',
    endpoints: {
      list: '/chargingPoints',
      detail: '/chargingPoints/{pointid}',
      status: '/chargingPoints/{pointid}/status'
    }
  },
  bluePlug: {
    base: process.env.BLUEPLUG_BASE_URL || 'https://api.blueplug.local',
    endpoints: {
      list: '/locations',
      detail: '/location/{pointid}',
      status: '/location/{pointid}/status'
    }
  }
};

// ============== HELPER FUNCTIONS ==============

/**
 * Normalize point data from different providers
 */
function normalizePoint(rawPoint, provider) {
  const mapping = {
    redPlug: {
      id: rawPoint.pointid,
      name: rawPoint.name,
      lat: rawPoint.lat,
      lon: rawPoint.lon,
      capacity: rawPoint.cap,
      price: rawPoint.kwhprice,
      status: rawPoint.status
    },
    greenPlug: {
      id: rawPoint.id || rawPoint.pointid,
      name: rawPoint.name,
      lat: rawPoint.latitude,
      lon: rawPoint.longitude,
      capacity: rawPoint.capacity,
      price: rawPoint.price_per_kwh,
      status: rawPoint.status
    },
    bluePlug: {
      id: rawPoint.id,
      name: rawPoint.location_name,
      lat: rawPoint.latitude,
      lon: rawPoint.longitude,
      capacity: rawPoint.kwh_capacity,
      price: rawPoint.kwh_price,
      status: rawPoint.availability
    }
  };

  return mapping[provider];
}

/**
 * Fetch points from provider API
 */
async function fetchFromProvider(provider) {
  try {
    const config = PROVIDER_CONFIG[provider];
    const url = `${config.base}${config.endpoints.list}`;

    console.log(`📡 Fetching from ${provider}: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });

    const points = Array.isArray(response.data) ? response.data : response.data.points || [];
    console.log(`✓ Fetched ${points.length} points from ${provider}`);

    return points;
  } catch (err) {
    console.error(`✗ Error fetching from ${provider}:`, err.message);
    throw err;
  }
}

/**
 * Sync points from provider to database
 */
async function syncProviderPoints(provider) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const startTime = Date.now();
    const points = await fetchFromProvider(provider);
    
    let newCount = 0, updatedCount = 0;

    for (const rawPoint of points) {
      const normalized = normalizePoint(rawPoint, provider);
      
      const result = await client.query(
        `INSERT INTO charging_points 
         (provider, external_id, name, latitude, longitude, capacity_kw, price_per_kwh, status, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (external_id) DO UPDATE SET
         name = $3, latitude = $4, longitude = $5, capacity_kw = $6, 
         price_per_kwh = $7, status = $8, updated_at = CURRENT_TIMESTAMP, raw_data = $9
         RETURNING id, xmax`,
        [
          provider,
          normalized.id,
          normalized.name,
          normalized.lat,
          normalized.lon,
          normalized.capacity,
          normalized.price,
          normalized.status,
          JSON.stringify(rawPoint)
        ]
      );

      if (result.rows[0].xmax === 0) newCount++;
      else updatedCount++;
    }

    const duration = Date.now() - startTime;

    // Log sync
    await client.query(
      `INSERT INTO points_sync_log 
       (provider, total_points, new_points, updated_points, duration_ms, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [provider, points.length, newCount, updatedCount, duration, 'success']
    );

    await client.query('COMMIT');

    console.log(`✓ Synced ${provider}: ${newCount} new, ${updatedCount} updated in ${duration}ms`);

    // Publish event
    publishEvent('PointsSynced', {
      provider,
      totalPoints: points.length,
      newPoints: newCount,
      updatedPoints: updatedCount,
      timestamp: new Date()
    });

    return { newCount, updatedCount, totalPoints: points.length };
  } catch (err) {
    await client.query('ROLLBACK');
    
    console.error(`✗ Sync error for ${provider}:`, err.message);

    await client.query(
      `INSERT INTO points_sync_log (provider, status, error_message)
       VALUES ($1, $2, $3)`,
      [provider, 'error', err.message]
    );

    throw err;
  } finally {
    client.release();
  }
}

/**
 * Publish event to message broker
 */
async function publishEvent(eventType, data) {
  try {
    const brokerUrl = process.env.MESSAGE_BROKER_URL || 'http://localhost:3003';
    await axios.post(`${brokerUrl}/api/events/publish`, {
      eventType,
      data
    }, { timeout: 5000 });
  } catch (err) {
    console.error('⚠️ Failed to publish event:', err.message);
  }
}

// ============== REST ENDPOINTS ==============

/**
 * GET /api/points
 * Get all points with optional filters
 */
app.get('/api/points', async (req, res) => {
  try {
    const { provider, status, lat, lon, radius } = req.query;

    let query = 'SELECT * FROM charging_points WHERE 1=1';
    const params = [];

    if (provider) {
      query += ' AND provider = $' + (params.length + 1);
      params.push(provider);
    }

    if (status) {
      query += ' AND status = $' + (params.length + 1);
      params.push(status);
    }

    if (lat && lon && radius) {
      // Distance query using PostGIS
      query += ' AND earth_distance(ll_to_earth($' + (params.length + 1) + ', $' + (params.length + 2) + '), ll_to_earth(latitude, longitude)) < $' + (params.length + 3);
      params.push(lat, lon, radius * 1000); // Convert km to meters
    }

    query += ' LIMIT 100';

    const result = await pool.query(query, params);
    
    res.json({
      count: result.rows.length,
      points: result.rows
    });
  } catch (err) {
    console.error('Error fetching points:', err.message);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

/**
 * GET /api/points/:pointId
 * Get specific point details
 */
app.get('/api/points/:pointId', async (req, res) => {
  try {
    const { pointId } = req.params;

    const result = await pool.query(
      'SELECT * FROM charging_points WHERE id = $1 OR external_id = $1',
      [pointId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching point:', err.message);
    res.status(500).json({ error: 'Failed to fetch point' });
  }
});

/**
 * GET /api/points/status/:status
 * Get points by status
 */
app.get('/api/points/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['available', 'reserved', 'offline', 'maintenance'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'SELECT * FROM charging_points WHERE status = $1 LIMIT 100',
      [status]
    );

    res.json({
      status,
      count: result.rows.length,
      points: result.rows
    });
  } catch (err) {
    console.error('Error fetching points by status:', err.message);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

/**
 * POST /api/points/click
 * Track click on point
 */
app.post('/api/points/click', async (req, res) => {
  try {
    const { pointId, userId, clickType } = req.body;

    if (!['view', 'reserve_attempt', 'details'].includes(clickType)) {
      return res.status(400).json({ error: 'Invalid click type' });
    }

    const result = await pool.query(
      `INSERT INTO points_clicks (point_id, user_id, click_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [pointId, userId, clickType]
    );

    // Publish click event
    publishEvent('PointClicked', {
      pointId,
      userId,
      clickType,
      timestamp: new Date()
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error recording click:', err.message);
    res.status(500).json({ error: 'Failed to record click' });
  }
});

/**
 * GET /api/points/sync/log
 * Get sync history
 */
app.get('/api/points/sync/log', async (req, res) => {
  try {
    const { provider, limit = 50 } = req.query;

    let query = 'SELECT * FROM points_sync_log';
    const params = [];

    if (provider) {
      query += ' WHERE provider = $1';
      params.push(provider);
    }

    query += ' ORDER BY synced_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      logs: result.rows
    });
  } catch (err) {
    console.error('Error fetching sync log:', err.message);
    res.status(500).json({ error: 'Failed to fetch sync log' });
  }
});

/**
 * POST /api/points/sync/:provider
 * Manually sync specific provider
 */
app.post('/api/points/sync/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const validProviders = ['redPlug', 'greenPlug', 'bluePlug'];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    const result = await syncProviderPoints(provider);
    
    res.json({
      message: `Synced ${provider}`,
      ...result,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Sync error:', err.message);
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

/**
 * POST /api/points/sync/all
 * Sync all providers
 */
app.post('/api/points/sync/all', async (req, res) => {
  try {
    const results = {};

    for (const provider of ['redPlug', 'greenPlug', 'bluePlug']) {
      try {
        results[provider] = await syncProviderPoints(provider);
      } catch (err) {
        results[provider] = { error: err.message };
      }
    }

    res.json({
      message: 'Synced all providers',
      results,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Sync all error:', err.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

/**
 * GET /health
 * Health check
 */
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    
    res.json({
      status: 'ok',
      service: 'points-service',
      port: process.env.PORT || 3001,
      database: 'connected',
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      service: 'points-service',
      database: 'disconnected',
      error: err.message
    });
  }
});

// ============== SERVER START ==============

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`✓ Points Service running on port ${PORT}`);
  console.log(`✓ Database: ${process.env.POINTS_DB_URL || 'postgresql://localhost:5432/points_service'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

module.exports = app;
