const express = require('express');
const axios = require('axios');
const amqp = require('amqplib');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3111);

const BASE_URL = process.env.REDPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/redPlug/api';
const API_KEY = process.env.REDPLUG_API_KEY || 'redplug-key-123';
const POINTS_SERVICE_URL = process.env.POINTS_SERVICE_URL || 'http://central-service:3001';
const ADAPTER_SYNC_INTERVAL_MS = Number(process.env.ADAPTER_SYNC_INTERVAL_MS || 86400000);
const SYNC_INGEST_TOKEN = process.env.SYNC_INGEST_TOKEN || '';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const ADAPTER_SYNC_REQUEST_EXCHANGE = process.env.ADAPTER_SYNC_REQUEST_EXCHANGE || 'adapter.sync.requests';
const ADAPTER_SYNC_ROUTING_KEY = 'adapter.redPlug.fetch_points';
const ADAPTER_SYNC_QUEUE = process.env.ADAPTER_SYNC_QUEUE || 'adapter.redPlug.sync.requests';
const ADAPTER_RESERVE_ROUTING_KEY = 'adapter.redPlug.reserve';
const ADAPTER_RESERVE_QUEUE = process.env.ADAPTER_RESERVE_QUEUE || 'adapter.redPlug.reserve.requests';

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
  const points = await fetchNormalizedPoints();
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
      const points = await fetchNormalizedPoints();
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
    const points = await fetchNormalizedPoints();
    res.json({ points });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

app.listen(PORT, () => {
  console.log(`✓ redPlug adapter listening on ${PORT}`);
  console.log(`[redPlug] Manual sync endpoint: POST /internal/sync-now`);
  console.log(`[redPlug] Query endpoints: GET /api/points, GET /api/points/:pointId`);
  console.log(`[redPlug] WARNING: Automatic sync disabled - Points Service orchestrates sync schedule`);
  startBrokerSyncConsumerWithRetry().catch((err) => {
    console.error('[redPlug] Failed to initialize broker sync consumer:', err.message);
  });
});
