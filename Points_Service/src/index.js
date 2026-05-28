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
      provider_name: p.providerName,
      lat: p.lat,
      lon: p.long,
      capacity: p.cap,
      status: p.status,
      location_name: p.locationName,
      connector: p.connector,
      address: p.address,
      reservation_end_time: p.reservationendtime,
      price: null
    };
  }

  if (provider === 'greenPlug') {
    return {
      id: p.id,
      provider_name: p.providerName,
      lat: p.coords?.lat,
      lon: p.coords?.long,
      capacity: p.cap,
      price: p.kwhRateEur,
      status: p.state,
      connector: p.connectorType,
      location_name: p.locationName,
      address: p.address,
      reservation_end_time: p.reservedUntil
    };
  }

  if (provider === 'bluePlug') {
    return {
      id: p.chargerId,
      provider_name: p.providerName,
      lat: p.geo?.[0],
      lon: p.geo?.[1],
      capacity: p.cap,
      price: p.pricePerKwh,
      status: p.currentStatus,
      location_name: p.locationName,
      connector: p.connector,
      address: p.address,
      reservation_end_time: p.reservationEnd
    };
  }

  throw new Error(`normalizePoint: unknown provider '${provider}'`);
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
            (id, point_id, provider_name, lon, lat, status, capacity_kw, kwh_price, connector, location_name, address, reservation_end_time, last_updated, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            capacity_kw = VALUES(capacity_kw),
            kwh_price = VALUES(kwh_price),
            lon = VALUES(lon),
            lat = VALUES(lat),
            connector = VALUES(connector),
            location_name = VALUES(location_name),
            address = VALUES(address),
            reservation_end_time = VALUES(reservation_end_time),
            last_updated = CURRENT_TIMESTAMP`,
            [
              uuidv4(),
              normalized.id || null,
              normalized.provider_name || null,
              normalized.lon || null,
              normalized.lat || null,
              normalized.status || null,
              normalized.capacity || null,
              normalized.price || null,
              normalized.connector || null,
              normalized.location_name || null,
              normalized.address || null,
              normalized.reservation_end_time || null,
              new Date(),
              new Date(),
           ]
         );

        newCount++;
      }

      //await client.query(
       //  `INSERT INTO points_sync_log 
       //   (provider, total_points, new_points, updated_points, duration_ms, status)
       //   VALUES (?, ?, ?, ?, ?, ?)`,
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

    const [rows] = await pointsMysql.query(
      'SELECT * FROM points WHERE point_id = ?',
      [pointId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching point:', err.message);
    res.status(500).json({ error: 'Failed to fetch point' });
  }
});

/**
 * POST /api/points/:pointId/reserve
 * Reserve a charging point via provider API and update DB status
 */
app.post('/api/points/:pointId/reserve', async (req, res) => {
  try {
const { pointId } = req.params;

    // Client sends { duration: <minutes> } (per requirement: request JSON has `minutes` key)
    // Accept both `duration` and `minutes` for robustness.
    const { duration, minutes } = req.body || {};
    const reserveMinutes = duration ?? minutes;

    const [rows] = await pointsMysql.query(
      'SELECT * FROM points WHERE point_id = ?',
      [pointId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    const point = rows[0];
    const provider = point.provider_name;
    const config = PROVIDER_MAP[provider];

    if (!config) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    let reserveUrl = buildProviderUrl(provider, "reservePath", pointId);

    const bearerToken = process.env.BEARER_TOKEN;
    const headers = { 'Accept': 'application/json' };
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    }

    // Build provider-specific request body.
    // Requirement from user: body uses `minutes` key in the request JSON.
    // We'll use reserveMinutes to populate provider payload.
    let reserveBody = {};

    if (reserveMinutes !== undefined && reserveMinutes !== null) {
      // Normalize minutes to a number if possible
      const minutesNum = Number(reserveMinutes);
      const minutesInt = parseInt(minutesNum);
      if (!Number.isNaN(minutesNum)) {
        if (provider === 'bluePlug') {
          reserveBody = { minutes: minutesInt };
        }else if (provider === 'redPlug') {
          // redPlug supports duration in the URL path, so we can skip it in the body.
          reserveUrl = buildProviderUrl(provider, "reservePathWduration", `${pointId},${minutesInt}`);
          console.log(`Built reserveUrl for redPlug with duration in path: ${reserveUrl}`);
        }
      }
    }

    console.log(`📡 Reserving point ${pointId} via ${provider}: POST ${reserveUrl}`, reserveBody);
    const reserveResp = await axios.post(reserveUrl, reserveBody, {
      timeout: 10000,
      headers
    });

    const reserveData = reserveResp.data || {};
    const normalizedResp = normalizePoint(reserveData, provider);

    const newStatus = normalizedResp.status;
    const reservationEndTime = normalizedResp.reservation_end_time;



    if (newStatus !== 'held' && newStatus !== 'reserved') {
      return res.status(400).json({
        error: 'Reservation failed: Expecting provider to return status "held" or "reserved" after reservation attempt',
        status: newStatus,
        details: reserveData
      });
    }

    try {
      // Single UPDATE statement => atomic: either the whole row is updated or none.
      await pointsMysql.query(
        'UPDATE points SET status = ?, reservation_end_time = ?, last_updated = CURRENT_TIMESTAMP WHERE point_id = ?',
        [newStatus, reservationEndTime || null, pointId]
      );
    } catch (dbErr) {
      // If DB fails, do not mask the provider reservation result; return error to caller.
      throw dbErr;
    }

    console.log(`✓ Point ${pointId} reserved successfully, status updated to ${newStatus}`);

    res.json({
      pointId,
      provider,
      status: newStatus,
      reservationEndTime: reservationEndTime,
      timestamp: new Date(),
      message: `Point ${pointId} reserved successfully via ${provider} both on provider api and DB`
    });
  } catch (err) {
    console.error('Error reserving point:', err.message);
    res.status(500).json({ error: 'Failed to reserve point', details: err.message });
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
