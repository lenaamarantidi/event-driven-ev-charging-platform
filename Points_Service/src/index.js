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
const { connectRabbitMQ, closeConnection: closeRabbitMQ, setDependencies } = require('./rabbitmq');

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

// ============== PROVIDER ADAPTER CONFIG (per-provider services) ==============

const PROVIDER_ADAPTER_URLS = {
  redPlug: process.env.REDPLUG_ADAPTER_URL || 'http://localhost:3111',
  greenPlug: process.env.GREENPLUG_ADAPTER_URL || 'http://localhost:3112',
  bluePlug: process.env.BLUEPLUG_ADAPTER_URL || 'http://localhost:3113'
};

function getProviderFromServiceEnv() {
  const service = process.env.SERVICE;
  if (!service) throw new Error("Missing process.env.SERVICE. Provide a plug name (red/green/blue)");
  const s = String(service).toLowerCase();
  if (s.includes('green')) return 'greenPlug';
  if (s.includes('red')) return 'redPlug';
  if (s.includes('blue')) return 'bluePlug';
  throw new Error(`Invalid process.env.SERVICE='${service}'. Expected a plug identifier containing one of: red, green, blue`);
}

function getAdapterBaseUrl(provider) {
  const url = PROVIDER_ADAPTER_URLS[provider];
  if (!url) throw new Error(`No adapter url configured for provider: ${provider}`);
  return url;
}

async function fetchProviderPoints(provider) {
  const base = getAdapterBaseUrl(provider);
  const resp = await axios.get(`${base}/api/points`, { timeout: 10000 });
  return resp.data.points || resp.data || [];
}

async function fetchProviderPoint(provider, pointId) {
  const base = getAdapterBaseUrl(provider);
  const resp = await axios.get(`${base}/api/points/${encodeURIComponent(pointId)}`, { timeout: 10000 });
  return resp.data.point || resp.data;
}

async function reserveProviderPoint(provider, pointId, duration) {
  const base = getAdapterBaseUrl(provider);
  const resp = await axios.post(`${base}/api/reserve`, { pointId, duration }, { timeout: 10000 });
  return resp.data.reservation || resp.data;
}

// ============== HELPER FUNCTIONS ==============
const { getAccessibleIps } = require('./util');

const reservationTimers = new Map();

function scheduleReservationExpiry(pointId, reservationEndTime) {
  try {
    // Calculate remaining time in milliseconds
    const endTime = new Date(reservationEndTime).getTime();
    const now = new Date().getTime();
    const remainingMs = endTime - now;

    // Clear any existing timer for this point
    if (reservationTimers.has(pointId)) {
      clearTimeout(reservationTimers.get(pointId));
    }

    // Set timer to update status when reservation expires
    if (remainingMs > 0) {
      const timerId = setTimeout(async () => {
        try {
          console.log(`⏰ Reservation expired for point ${pointId}, updating status to available`);

          // first get new point status from povider api
          // Get point details from provider API
          const service = getProviderFromServiceEnv();
          const normalized = await fetchProviderPoint(service, pointId);
          const currentStatus = normalized?.status;

          console.log(`📊 Point ${pointId} current status from provider: ${currentStatus}`);

          // Query DB to get current point status
          const [dbRows] = await pointsMysql.query(
            'SELECT * FROM points WHERE point_id = ?',
            [pointId]
          );

          if (dbRows.length === 0) {
            throw new Error(`Point ${pointId} not found in database`);
          }

          if (dbRows.length > 1) {
            throw new Error(`Duplicate points found in database for point_id ${pointId}: ${dbRows.length} rows`);
          }

          const dbPoint = dbRows[0];
          console.log(`📋 Point ${pointId} current status in DB: ${dbPoint.status}`);
          console.log(`📋 Point ${pointId} DB details:`, {
            status: dbPoint.status,
            reservationEndTime: dbPoint.reservation_end_time,
            lastUpdated: dbPoint.last_updated
          });

          reservationTimers.delete(pointId);
          // Compare statuses
          if (String(dbPoint.status) !== String(currentStatus)) {
            console.log(`Expected status mismatch for point ${pointId}:`);
            console.log(`   DB status: ${dbPoint.status}`);
            console.log(`   Provider status: ${currentStatus}`);
            console.log(`   Updating DB to match provider status`);
            await pointsMysql.query(
              'UPDATE points SET status = ?, reservation_end_time = NULL, last_updated = CURRENT_TIMESTAMP WHERE point_id = ?',
              [String(currentStatus), pointId]
            );
          } else {
            throw new Error(`Expected status mismatch for point ${pointId}, but DB and provider have same status: ${dbPoint.status}`);
          }

        } catch (err) {
          console.error(`Error updating expired reservation for ${pointId}:`, err.message);
        }
      }, remainingMs+60000); // add 1 minute because reservation end time does not take into account remaining seconds in the last minute, so we add a buffer to ensure the reservation has actually expired in the provider system before we update our DB.

      reservationTimers.set(pointId, timerId);
      console.log(`⏱️ Timer scheduled for point ${pointId}, expires in ${Math.floor(remainingMs / 1000)} seconds`);
    }

    return remainingMs;
  } catch (err) {
    console.error(`Error scheduling reservation expiry for ${pointId}:`, err.message);
    return 0;
  }
}

// ============== REST ENDPOINTS CONST URLS ==============

const API_POINTS = '/api/points';
const API_POINTS_BY_ID = '/api/points/:pointId';

const PLUGAPI_POINTS = '/plugApi/points';
const PLUGAPI_POINT = '/plugApi/points/:pointId';

const DB_REPOPULATE = '/db/repopulate';
const HEALTH = '/health';

// ============== REST ENDPOINTS ==============

// ---- plugApi ----

/**
 * GET /plugApi/points
 * Debug endpoint: returns this service plug, listPath url template and logs the JSON
 */
app.get(PLUGAPI_POINTS, async (req, res) => {
  try {
    const service = getProviderFromServiceEnv();
    const points = await fetchProviderPoints(service);
    return res.json({ service, provider: service, points });

  } catch (err) {
    console.error('Error in /db/points:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get(PLUGAPI_POINT, async (req, res) => {
  try {
    const { pointId } = req.params;
    const service = getProviderFromServiceEnv();
    const point = await fetchProviderPoint(service, pointId);
    return res.json({ service, provider: service, point });

  } catch (err) {
    console.error('Error in /plugApi/points/:pointId:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- db ----

/**
 * POST /db/populate
 * Fetch all points from the selected plug API and insert them into MariaDB.
 * Body (optional): { provider?: 'redPlug'|'greenPlug'|'bluePlug' }
 */
app.post(DB_REPOPULATE, async (req, res) => {
  try {
    const service = getProviderFromServiceEnv();
    let rawPoints = await fetchProviderPoints(service);

    if (!Array.isArray(rawPoints)) {
      throw new Error('Provider response did not contain an array of points');
    }

    // Filter points if IDs provided in request body
    const { points: filterIds } = req.body || {};
    if (Array.isArray(filterIds) && filterIds.length > 0) {
      rawPoints = rawPoints.filter(p => {
        const pointId = p.pointId || p.id || p.chargerId || p.pointid;
        return filterIds.includes(pointId) || filterIds.includes(String(pointId));
      });
      console.log(`📋 Filtering to ${rawPoints.length} points from provided IDs: ${filterIds.join(', ')}`);
    }

    const client = await pointsMysql.getConnection();
    try {
      await client.beginTransaction();

      // Empty the table first (full repopulate) - or just update if filtering
      if (!Array.isArray(filterIds) || filterIds.length === 0) {
        await client.query('DELETE FROM points');
      }

      let newCount = 0;
      let updatedCount = 0;

      for (const normalized of rawPoints) {

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
              normalized.pointId || null,
              normalized.providerName || null,
              normalized.lon || null,
              normalized.lat || null,
              normalized.status || null,
              normalized.capacityKw || null,
              normalized.kwhPrice || null,
              normalized.connector || null,
              normalized.locationName || null,
              normalized.address || null,
              normalized.reservationEndTime || null,
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
        provider: service,
        fetched: rawPoints.length,
        newCount,
        updatedCount,
        filtered: Array.isArray(filterIds) && filterIds.length > 0,
        filterIds: filterIds || null,
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
app.get(API_POINTS, async (req, res) => {

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
app.get(API_POINTS_BY_ID, async (req, res) => {
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

// Reservation endpoints removed from Points Service: reservation logic centralized in Reservation_Service


/**
 * GET /health
 * Health check
 */
app.get(HEALTH, async (req, res) => {
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

let server = null;

async function startServer() {
  try {
    setDependencies({ db: pointsMysql, scheduleReservationExpiry });
    await connectRabbitMQ();

    server = app.listen(PORT, () => {
      const ips = getAccessibleIps();
      console.log(`✓ Points Service ${process.env.SERVICE } running on port ${PORT}`);
      console.log(`✓ MariaDB: ${process.env.MARIADB_HOST}:${process.env.MARIADB_PORT}/${dbName}`);
      console.log(`✓ Access via: ${ips.map(ip => `http://${ip}:${PORT}`).join(', ')}`);
    });
  } catch (err) {
    console.error('✗ Failed to start Points Service:', err.message);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (server) {
    server.close(async () => {
      await closeRabbitMQ();
      await pointsMysql.end();
      process.exit(0);
    });
  } else {
    await closeRabbitMQ();
    await pointsMysql.end();
    process.exit(0);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  if (server) {
    server.close(async () => {
      await closeRabbitMQ();
      await pointsMysql.end();
      process.exit(0);
    });
  } else {
    await closeRabbitMQ();
    await pointsMysql.end();
    process.exit(0);
  }
});

module.exports = app;
