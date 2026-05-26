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
const mysql = require('mysql2/promise');

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// ============== DATABASE CONFIGURATION ==============
const dbName = process.env.MARIADB_DB || 'central';
const pointsMysql = mysql.createPool({
  host: process.env.MARIADB_HOST || 'unknown-host',
  port: process.env.MARIADB_PORT ? Number(process.env.MARIADB_PORT) : 3306,
  user: process.env.MARIADB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || 'root',
  database: dbName,
  connectTimeout: process.env.MARIADB_CONNECT_TIMEOUT ? Number(process.env.MARIADB_CONNECT_TIMEOUT) : 5000,
  ssl: process.env.MARIADB_SSL ? JSON.parse(process.env.MARIADB_SSL) : false,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
});


// ============== DATABASE INITIALIZATION ==============

async function initializeDatabase() {
  try {
    const maxAttempts = Number(process.env.MARIADB_DB_WAIT_ATTEMPTS || 10);
    const attemptDelayMs = Number(process.env.MARIADB_DB_WAIT_DELAY_MS || 1000);

    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await pointsMysql.query('SELECT 1');
        console.log(`✓ MariaDB connection ok (using database: ${dbName})`);
        lastErr = null;
        break;
      } catch (useErr) {
        lastErr = useErr;
        console.warn(`⚠️ Database ${dbName} not ready yet (attempt ${attempt}/${maxAttempts})`, useErr.message);
        await new Promise(r => setTimeout(r, attemptDelayMs));
      }
    }

    if (lastErr) {
      throw lastErr;
    }
  } catch (err) {
    console.error('✗ Database initialization error:', err.message);
    throw err;
  }
}

initializeDatabase();

// ============== PROVIDER MAPPING ==============

const { PROVIDER_MAP } = require('./plugs_api');
const { buildProviderUrl } = require('./plugs_api');

// ============== HELPER FUNCTIONS ==============

/**
 * Normalize point data from different providers
 */
function normalizePoint(rawPoint, provider) {
  const p = rawPoint || {};

  if (provider === 'redPlug') {
    return {
      id: p.pointid,
      name: p.providerName,
      lat: p.lat,
      lon: p.long,
      capacity: p.cap,
      status: p.status,
    };
  }

  if (provider === 'greenPlug') {
    return {
      id: p.id,
      name: p.providerName,
      lat: p.coords?.lat,
      lon: p.coords?.long,
      capacity: p.cap,
      price: p.kwhRateEur,
      status: p.state,
    };
  }

  if (provider === 'bluePlug') {
    return {
      id: p.chargerId,
      name: p.providerName,
      lat: p.geo?.[0],
      lon: p.geo?.[1],
      capacity: p.cap,
      price: p.pricePerKwh,
      status: p.currentStatus,
    };
  }

  throw new Error(`normalizePoint: unknown provider '${provider}'`);
}

/**
 * Fetch points from provider API
 */
async function fetchFromProvider(provider) {
  try {
    const config = PROVIDER_MAP[provider];
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const base = process.env[config.baseUrlEnv] || config.baseUrlDefault;
    const url = `${base}${config.listPath}`;

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
  const client = await pointsMysql.getConnection();
  try {
    await client.beginTransaction();

    const startTime = Date.now();
    const points = await fetchFromProvider(provider);
    
    let newCount = 0, updatedCount = 0;

    for (const rawPoint of points) {
      const normalized = normalizePoint(rawPoint, provider);

      await client.query(
          `INSERT INTO points 
           (id, point_id, provider_name, lon, lat, status, capacity_kw, kwh_price, location_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON DUPLICATE KEY UPDATE
           status = VALUES(status),
           capacity_kw = VALUES(capacity_kw),
           kwh_price = VALUES(kwh_price),
           lon = VALUES(lon),
           lat = VALUES(lat),
           location_name = VALUES(location_name),
           last_updated = CURRENT_TIMESTAMP
           `,
          [
            uuidv4(),
            normalized.id,
            provider,
            normalized.lon,
            normalized.lat,
            normalized.status,
            normalized.capacity,
            normalized.price,
            normalized.name,
          ]
        );

      if (newCount !== undefined) {
        newCount++;
      } else {
        updatedCount++;
      }
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

// ---- plugApi ----

/**
 * GET /plugApi/points
 * Debug endpoint: returns this service plug, listPath url template and logs the JSON
 */
app.get('/plugApi/points', async (req, res) => {
  try {
    const service = process.env.SERVICE;

    if (!service) {
      throw new Error(
        "Missing process.env.SERVICE. Provide a plug name (red/green/blue) so this endpoint can compute the provider URL. Examples: redPlug, greenPlug, bluePlug"
      );
    }

    const s = String(service).toLowerCase();

    let plugKey;
    if (s.includes('green')) plugKey = 'greenPlug';
    else if (s.includes('red')) plugKey = 'redPlug';
    else if (s.includes('blue')) plugKey = 'bluePlug';
    else if (s.includes('central')) {
      throw new Error(
        `process.env.SERVICE='${service}' looks like a central service. Please set process.env.SERVICE to a specific plug: redPlug | greenPlug | bluePlug`
      );
    } else {
      throw new Error(
        `Invalid process.env.SERVICE='${service}'. Expected a plug identifier containing one of: red, green, blue (e.g. redPlug | greenPlug | bluePlug)`
      );
    }

    const url = buildProviderUrl(plugKey, 'listPath', '');

    const bearerToken = process.env.BEARER_TOKEN;

    const requestHeaders = { Accept: 'application/json' };
    if (bearerToken) {
      requestHeaders.Authorization = `Bearer ${bearerToken}`;
    }

    const providerResp = await axios.get(url, {
      timeout: 10000,
      headers: requestHeaders,
    });

    const payload = {
      service,
      plugKey,
      url,
      data: providerResp.data,
    };

    console.log('[/db/points] provider json:', payload);
    return res.json(payload);

  } catch (err) {
    console.error('Error in /db/points:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- db ----

/**
 * POST /db/populate
 * Fetch all points from the selected plug API and insert them into MariaDB.
 * Body (optional): { provider?: 'redPlug'|'greenPlug'|'bluePlug' }
 */
app.post('/db/repopulate', async (req, res) => {
  try {
    const service = process.env.SERVICE;
    if (!service) {
      throw new Error(
        "Missing process.env.SERVICE. Provide a plug name (red/green/blue) so this endpoint can populate the DB. Examples: redPlug, greenPlug, bluePlug"
      );
    }

    const s = String(service).toLowerCase();

    let plugKey;
    if (s.includes('green')) plugKey = 'greenPlug';
    else if (s.includes('red')) plugKey = 'redPlug';
    else if (s.includes('blue')) plugKey = 'bluePlug';
    else if (s.includes('central')) {
      throw new Error(
        `process.env.SERVICE='${service}' looks like a central service. Please set process.env.SERVICE to a specific plug: redPlug | greenPlug | bluePlug`
      );
    } else {
      throw new Error(
        `Invalid process.env.SERVICE='${service}'. Expected a plug identifier containing one of: red, green, blue (e.g. redPlug | greenPlug | bluePlug)`
      );
    }

    const url = buildProviderUrl(plugKey, 'listPath', '');

    const bearerToken = process.env.BEARER_TOKEN || process.env.AUTH_TOKEN || process.env.TOKEN;
    const headers = { Accept: 'application/json' };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

    const providerResp = await axios.get(url, { timeout: 10000, headers });

    const rawPoints = Array.isArray(providerResp.data)
      ? providerResp.data
      : providerResp.data.points || providerResp.data;

    if (!Array.isArray(rawPoints)) {
      throw new Error('Provider response did not contain an array of points');
    }

    const client = await pointsMysql.getConnection();
    try {
      await client.beginTransaction();

      // Empty the table first (full repopulate)
      await client.query('DELETE FROM points');

      let newCount = 0;
      let updatedCount = 0;

      for (const rawPoint of rawPoints) {
        const normalized = normalizePoint(rawPoint, plugKey);

        await client.query(
          `INSERT INTO points
           (id, point_id, provider_name, lon, lat, status, capacity_kw, kwh_price, location_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           status = VALUES(status),
           capacity_kw = VALUES(capacity_kw),
           kwh_price = VALUES(kwh_price),
           lon = VALUES(lon),
           lat = VALUES(lat),
           location_name = VALUES(location_name),
           last_updated = CURRENT_TIMESTAMP`,
          [
            uuidv4(),
            normalized.id,
            plugKey,
            normalized.lon,
            normalized.lat,
            normalized.status,
            normalized.capacity,
            normalized.price,
            normalized.name,
          ]
        );

        newCount++;
      }

      //await client.query(
      //  `INSERT INTO points_sync_log 
      //   (provider, total_points, new_points, updated_points, duration_ms, status)
      //   VALUES ($1, $2, $3, $4, $5, $6)`,
      //  [plugKey, rawPoints.length, newCount, updatedCount, 0, 'success']
      //);

      await client.query('COMMIT');

      const payload = {
        service,
        plugKey,
        url,
        fetched: rawPoints.length,
        newCount,
        updatedCount,
      };

      console.log('[/db/populate]', payload);
      return res.json(payload);
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error in /db/populate:', err.message);
    return res.status(500).json({ error: err.message });
  }
});


// ---- api ----

/**
 * GET /api/points
 * Get all points with optional filters
 */
app.get('/api/points', async (req, res) => {

  try {
    const { provider, status, lat, lon, radius, limit } = req.query;
    const safeLimit = limit !== undefined ? Number(limit) : undefined;

    let query = 'SELECT * FROM points WHERE 1=1';
    const params = [];

    if (provider) {
      // central schema uses provider_name
      query += ' AND provider_name = ?';
      params.push(provider);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (lat && lon && radius) {
      // Keep simple bounding approximation if radius is provided (central schema has no PostGIS).
      // radius is assumed in km.
      const km = Number(radius);
      const latDelta = km / 111; // ~111km per degree latitude
      const lonDelta = km / (111 * Math.cos(Number(lat) * Math.PI / 180));

      query += ' AND lat BETWEEN ? AND ?';
      params.push(Number(lat) - latDelta, Number(lat) + latDelta);

      query += ' AND lon BETWEEN ? AND ?';
      params.push(Number(lon) - lonDelta, Number(lon) + lonDelta);
    }

    if (safeLimit !== undefined && Number.isFinite(safeLimit)) {
      query += ' LIMIT ?';
      params.push(safeLimit);
    }

    const [rows] = await pointsMysql.query(query, params);

    res.json({
      count: rows.length,
      points: rows
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

    const result = await pointsMysql.query(
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

    const result = await pointsMysql.query(
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

    const result = await pointsMysql.query(
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
      query += ' WHERE provider = ?';
      params.push(provider);
    }

    query += ' ORDER BY synced_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const result = await pointsMysql.query(query, params);

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
    const result = await pointsMysql.query('SELECT 1');

    res.json({
      status: 'ok',

      service: process.env.SERVICE || 'points-service',
      port: process.env.PORT || 3001,
      database: 'connected',
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      service: process.env.SERVICE || 'points-service',
      database: 'disconnected',
      error: err.message
    });
  }
});

// ============== SERVER START ==============

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`✓ Points Service ${process.env.SERVICE || 'points-service'} running on port ${PORT}`);
  console.log(`✓ MariaDB: ${process.env.MARIADB_HOST || 'localhost'}:${process.env.MARIADB_PORT || 5432}/${dbName}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    pointsMysql.end();
    process.exit(0);
  });
});

module.exports = app;
