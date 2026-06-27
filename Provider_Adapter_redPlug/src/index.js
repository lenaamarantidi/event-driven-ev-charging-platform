const express = require('express');
const axios = require('axios');
const mysql = require('mysql2/promise');
const amqp = require('amqplib');
const { randomUUID } = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3111);

const BASE_URL = process.env.REDPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/redPlug/api';
const API_KEY = process.env.REDPLUG_API_KEY || 'redplug-key-123';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const ADAPTER_SYNC_REQUEST_EXCHANGE = process.env.ADAPTER_SYNC_REQUEST_EXCHANGE || 'adapter.sync.requests';
const ADAPTER_SYNC_ROUTING_KEY = 'adapter.redPlug.fetch_points';
const ADAPTER_SYNC_QUEUE = process.env.ADAPTER_SYNC_QUEUE || 'adapter.redPlug.sync.requests';
const ADAPTER_RESERVE_ROUTING_KEY = 'adapter.redPlug.reserve';
const ADAPTER_RESERVE_QUEUE = process.env.ADAPTER_RESERVE_QUEUE || 'adapter.redPlug.reserve.requests';
const DB_NAME = process.env.DB_NAME || 'red_provider_db';
const dbPool = mysql.createPool({
  host: process.env.DB_HOST || 'mariadb-red',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'red_user',
  password: process.env.DB_PASSWORD || 'red_pass',
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
const NORMALIZED_POINTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS normalized_points (
    id CHAR(36) NOT NULL,
    point_id VARCHAR(255) NOT NULL,
    provider_name VARCHAR(100) NOT NULL,
    lon DECIMAL(12,8) NULL,
    lat DECIMAL(12,8) NULL,
    status VARCHAR(50) NULL,
    capacity_kw DECIMAL(10,2) NULL,
    kwh_price DECIMAL(10,4) NULL,
    connector VARCHAR(100) NULL,
    location_name VARCHAR(255) NULL,
    address VARCHAR(255) NULL,
    reservation_end_time VARCHAR(64) NULL,
    raw_payload LONGTEXT NULL,
    last_synced_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_normalized_points_point_id (point_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

function maskAuthHeader(value) {
  if (!value) return '';
  const s = String(value);
  if (s.toLowerCase().startsWith('bearer ')) {
    const token = s.slice(7);
    const masked = token.length > 10 ? `${token.slice(0, 6)}...${token.slice(-4)}` : '***';
    return `Bearer ${masked}`;
  }
  return s.length > 10 ? `${s.slice(0, 6)}...${s.slice(-4)}` : '***';
}

function logProviderRequest({ method, url, pointId, providerHeaders }) {
  console.log(`[redPlug] Provider request method=${String(method).toUpperCase()} url=${url} pointId=${pointId || ''} auth=${maskAuthHeader(providerHeaders.Authorization)} hasXApiKey=${Boolean(providerHeaders['x-api-key'])}`);
}

function logProviderResponseError(err, { method, url, pointId }) {
  const status = err?.response?.status;
  const body = err?.response?.data;
  console.error(`[redPlug] Provider error method=${String(method).toUpperCase()} url=${url} pointId=${pointId || ''} status=${status || 'n/a'} body=${typeof body === 'string' ? body : JSON.stringify(body || {})}`);
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizePointRow(point) {
  return {
    pointId: String(point.pointId ?? point.id ?? point.uid ?? point.chargerId ?? point.pointid ?? ''),
    providerName: String(point.providerName ?? point.provider_name ?? 'redPlug'),
    lon: point.lon ?? point.lng ?? point.geo?.[1] ?? point.coords?.long ?? null,
    lat: point.lat ?? point.geo?.[0] ?? point.coords?.lat ?? null,
    capacityKw: point.capacityKw ?? point.capacity_kw ?? point.cap ?? point.capacity ?? null,
    kwhPrice: point.kwhPrice ?? point.kwh_price ?? point.pricePerKwh ?? point.kwhRateEur ?? point.price ?? null,
    status: point.status ?? point.state ?? point.currentStatus ?? null,
    locationName: point.locationName ?? point.location_name ?? null,
    connector: point.connector ?? point.connectorType ?? null,
    address: point.address ?? null,
    reservationEndTime: point.reservationEndTime ?? point.reservation_end_time ?? point.reservationEnd ?? point.reservedUntil ?? null,
    raw: point.raw ?? point,
  };
}

function normalizeDbRow(row) {
  return {
    pointId: String(row.point_id || ''),
    providerName: String(row.provider_name || 'redPlug'),
    lon: toNumberOrNull(row.lon),
    lat: toNumberOrNull(row.lat),
    capacityKw: toNumberOrNull(row.capacity_kw),
    kwhPrice: toNumberOrNull(row.kwh_price),
    status: row.status ?? null,
    locationName: row.location_name ?? null,
    connector: row.connector ?? null,
    address: row.address ?? null,
    reservationEndTime: row.reservation_end_time ?? null,
    raw: safeJsonParse(row.raw_payload),
    lastSyncedAt: row.last_synced_at,
  };
}

async function initializeDatabase() {
  const maxAttempts = Number(process.env.DB_WAIT_ATTEMPTS || 10);
  const delayMs = Number(process.env.DB_WAIT_DELAY_MS || 1000);

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await dbPool.query('SELECT 1');
      await dbPool.query(NORMALIZED_POINTS_TABLE_SQL);
      console.log(`✓ redPlug adapter database ready (${DB_NAME})`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[redPlug] Waiting for adapter database (${attempt}/${maxAttempts}):`, err.message);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastErr;
}

async function persistNormalizedPoints(points, trigger) {
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM normalized_points');

    const timestamp = new Date();
    for (const point of points) {
      const normalized = normalizePointRow(point);
      if (!normalized.pointId) continue;

      await connection.query(
        `INSERT INTO normalized_points
          (id, point_id, provider_name, lon, lat, status, capacity_kw, kwh_price, connector, location_name, address, reservation_end_time, raw_payload, last_synced_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          randomUUID(),
          normalized.pointId,
          normalized.providerName,
          normalized.lon,
          normalized.lat,
          normalized.status,
          normalized.capacityKw,
          normalized.kwhPrice,
          normalized.connector,
          normalized.locationName,
          normalized.address,
          normalized.reservationEndTime,
          JSON.stringify({ ...normalized, trigger }),
          timestamp,
          timestamp,
          timestamp,
        ]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function loadNormalizedPointsFromDb() {
  const [rows] = await dbPool.query('SELECT * FROM normalized_points ORDER BY provider_name, point_id');
  return rows.map(normalizeDbRow);
}

async function fetchPointsFromProvider() {
  const data = await proxyRequest(`${BASE_URL}/points`, 'get', null, { op: 'list_points' });
  return Array.isArray(data) ? data.map(normalizePointForCentral) : [];
}

async function refreshNormalizedPoints(trigger = 'interval') {
  const points = await fetchPointsFromProvider();
  await persistNormalizedPoints(points, trigger);
  return loadNormalizedPointsFromDb();
}

async function proxyRequest(url, method = 'get', data = null, meta = {}) {
  const authHeaderValue = process.env.PROVIDER_AUTH_HEADER || `Bearer ${API_KEY}`;
  const headers = {
    Authorization: authHeaderValue,
    authorization: authHeaderValue,
    'x-api-key': API_KEY,
    Accept: 'application/json'
  };

  logProviderRequest({ method, url, pointId: meta?.pointId, providerHeaders: headers });

  const opts = {
    method,
    url,
    headers,
    timeout: 10000
  };
  if (data) opts.data = data;
  try {
    const resp = await axios(opts);
    return resp.data;
  } catch (err) {
    logProviderResponseError(err, { method, url, pointId: meta?.pointId });
    throw err;
  }
}

function normalizePointForCentral(p) {
  return {
    pointId: p.pointid ?? p.id,
    providerName: 'redPlug',
    status: p.status,
    lon: p.long,
    lat: p.lat,
    capacityKw: p.cap,
    connector: p.connector,
    locationName: p.locationName,
    address: p.address,
    reservationEndTime: p.reservationendtime,
    raw: p
  };
}

async function fetchNormalizedPoints() {
  const data = await proxyRequest(`${BASE_URL}/points`, 'get', null, { op: 'list_points' });
  return Array.isArray(data) ? data.map(normalizePointForCentral) : [];
}

function normalizeReservationResponse(resp, pointId) {
  const rawStatus = String(resp?.status ?? resp?.state ?? resp?.currentStatus ?? 'unknown').toLowerCase();
  const status = (rawStatus === 'reserved' || rawStatus === 'held') ? 'reserved' : rawStatus;
  const reservationEndTime = resp?.reservationendtime ?? resp?.reservedUntil ?? resp?.reservationEnd ?? '1970-01-01 00:00';

  return {
    pointid: String(resp?.pointid ?? resp?.id ?? pointId),
    status: String(status),
    reservationendtime: String(reservationEndTime)
  };
}

async function reservePoint(pointId, duration, userId) {
  const data = await proxyRequest(
    `${BASE_URL}/reserve/${encodeURIComponent(pointId)}/${encodeURIComponent(duration)}`,
    'post',
    userId ? { userId } : {},
    { op: 'reserve', pointId }
  );
  return normalizeReservationResponse(data, pointId);
}

async function syncToPointsService(trigger = 'interval') {
  const points = await refreshNormalizedPoints(trigger);
  const response = {
    provider: 'redPlug',
    trigger,
    snapshot: true,
    fetched: points.length,
    points,
    fetchedAt: new Date().toISOString(),
  };
  console.log(`[redPlug] Snapshot prepared (${trigger}), points=${points.length}`);
  return response;
}

async function startBrokerSyncConsumer() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(ADAPTER_SYNC_REQUEST_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(ADAPTER_SYNC_QUEUE, { durable: true });
  await channel.bindQueue(ADAPTER_SYNC_QUEUE, ADAPTER_SYNC_REQUEST_EXCHANGE, ADAPTER_SYNC_ROUTING_KEY);

  await channel.consume(ADAPTER_SYNC_QUEUE, async (msg) => {
    if (!msg) return;

    try {
      const points = await refreshNormalizedPoints('broker-sync');
      const payload = {
        provider: 'redPlug',
        points,
        fetchedAt: new Date().toISOString(),
      };

      if (msg.properties.replyTo) {
        channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify(payload)),
          {
            contentType: 'application/json',
            correlationId: msg.properties.correlationId,
            persistent: false,
          }
        );
      }

      channel.ack(msg);
    } catch (err) {
      console.error('[redPlug] Broker sync request failed:', err.message);
      channel.nack(msg, false, false);
    }
  });

  await channel.assertQueue(ADAPTER_RESERVE_QUEUE, { durable: true });
  await channel.bindQueue(ADAPTER_RESERVE_QUEUE, ADAPTER_SYNC_REQUEST_EXCHANGE, ADAPTER_RESERVE_ROUTING_KEY);

  await channel.consume(ADAPTER_RESERVE_QUEUE, async (msg) => {
    if (!msg) return;

    let requestPayload = {};
    try {
      requestPayload = JSON.parse(msg.content.toString('utf8'));
      const pointId = requestPayload?.pointId;
      const duration = Number(requestPayload?.minutes ?? requestPayload?.duration ?? 60);
      console.log(`[redPlug] Reserve RPC received routingKey=${msg.fields?.routingKey || ADAPTER_RESERVE_ROUTING_KEY} pointId=${pointId || ''} duration=${duration}`);
      const reservation = await reservePoint(pointId, duration, requestPayload?.userId);

      if (msg.properties.replyTo) {
        channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify({ success: true, provider: 'redPlug', reservation })),
          {
            contentType: 'application/json',
            correlationId: msg.properties.correlationId,
            persistent: false,
          }
        );
      }

      channel.ack(msg);
    } catch (err) {
      if (msg.properties.replyTo) {
        channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify({
            success: false,
            provider: 'redPlug',
            error: err.message,
            reservation: {
              pointid: String(requestPayload?.pointId || ''),
              status: 'failed',
              reservationendtime: '1970-01-01 00:00'
            }
          })),
          {
            contentType: 'application/json',
            correlationId: msg.properties.correlationId,
            persistent: false,
          }
        );
      }

      console.error('[redPlug] Broker reserve request failed:', err.message);
      channel.ack(msg);
    }
  });

  console.log(`[redPlug] RabbitMQ sync consumer ready on ${ADAPTER_SYNC_QUEUE}`);
  console.log(`[redPlug] RabbitMQ reserve consumer ready on ${ADAPTER_RESERVE_QUEUE}`);
}

async function startBrokerSyncConsumerWithRetry(attempt = 1, maxAttempts = 10) {
  try {
    await startBrokerSyncConsumer();
  } catch (err) {
    console.error(`[redPlug] Failed to start broker sync consumer (attempt ${attempt}/${maxAttempts}):`, err.message);
    if (attempt < maxAttempts) {
      const delayMs = Math.min(2000 * attempt, 10000);
      setTimeout(() => {
        startBrokerSyncConsumerWithRetry(attempt + 1, maxAttempts).catch((retryErr) => {
          console.error('[redPlug] Broker sync consumer retry failed:', retryErr.message);
        });
      }, delayMs);
    }
  }
}

app.get('/health', (req, res) => res.json({ status: 'ok', provider: 'redPlug' }));

app.get('/api/points', async (req, res) => {
  try {
    const points = await refreshNormalizedPoints('api');
    res.json({ points });
  } catch (err) {
    try {
      const cachedPoints = await loadNormalizedPointsFromDb();
      if (cachedPoints.length > 0) {
        return res.json({ points: cachedPoints, cached: true });
      }
    } catch {
      // Fall through to error response.
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/points/:pointId', async (req, res) => {
  try {
    const p = await proxyRequest(`${BASE_URL}/point/${encodeURIComponent(req.params.pointId)}`, 'get', null, { op: 'get_point', pointId: req.params.pointId });
    res.json({ point: p });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reserve', async (req, res) => {
  try {
    const { pointId, duration } = req.body;
    const reservation = await reservePoint(pointId, duration, req.body?.userId);
    res.json({ reservation });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/internal/sync-now', async (req, res) => {
  try {
    const result = await syncToPointsService('manual');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`✓ redPlug adapter listening on ${PORT}`);
    console.log(`[redPlug] Manual sync endpoint: POST /internal/sync-now`);
    console.log(`[redPlug] Query endpoints: GET /api/points, GET /api/points/:pointId`);
    console.log(`[redPlug] WARNING: Automatic sync disabled - Points Service orchestrates sync schedule`);
    startBrokerSyncConsumerWithRetry().catch((err) => {
      console.error('[redPlug] Failed to initialize broker sync consumer:', err.message);
    });
  });
}

startServer().catch((err) => {
  console.error('[redPlug] Failed to start adapter:', err.message);
  process.exit(1);
});
