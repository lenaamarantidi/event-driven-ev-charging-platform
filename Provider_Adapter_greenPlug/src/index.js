const express = require('express');
const axios = require('axios');
const amqp = require('amqplib');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3112);

const BASE_URL = process.env.GREENPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/greenPlug/api';
const API_KEY = process.env.GREENPLUG_API_KEY || 'greenplug-key-123';
const POINTS_SERVICE_URL = process.env.POINTS_SERVICE_URL || 'http://central-service:3001';
const ADAPTER_SYNC_INTERVAL_MS = Number(process.env.ADAPTER_SYNC_INTERVAL_MS || 86400000);
const SYNC_INGEST_TOKEN = process.env.SYNC_INGEST_TOKEN || '';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const ADAPTER_SYNC_REQUEST_EXCHANGE = process.env.ADAPTER_SYNC_REQUEST_EXCHANGE || 'adapter.sync.requests';
const ADAPTER_SYNC_ROUTING_KEY = 'adapter.greenPlug.fetch_points';
const ADAPTER_SYNC_QUEUE = process.env.ADAPTER_SYNC_QUEUE || 'adapter.greenPlug.sync.requests';
const ADAPTER_RESERVE_ROUTING_KEY = 'adapter.greenPlug.reserve';
const ADAPTER_RESERVE_QUEUE = process.env.ADAPTER_RESERVE_QUEUE || 'adapter.greenPlug.reserve.requests';

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
  console.log(`[greenPlug] Provider request method=${String(method).toUpperCase()} url=${url} pointId=${pointId || ''} auth=${maskAuthHeader(providerHeaders.Authorization)} hasXApiKey=${Boolean(providerHeaders['x-api-key'])}`);
}

function logProviderResponseError(err, { method, url, pointId }) {
  const status = err?.response?.status;
  const body = err?.response?.data;
  console.error(`[greenPlug] Provider error method=${String(method).toUpperCase()} url=${url} pointId=${pointId || ''} status=${status || 'n/a'} body=${typeof body === 'string' ? body : JSON.stringify(body || {})}`);
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
    pointId: p.id ?? p.pointid,
    providerName: 'greenPlug',
    status: p.state,
    lon: p.coords?.long,
    lat: p.coords?.lat,
    capacityKw: p.cap,
    kwhPrice: p.kwhRateEur,
    connector: p.connectorType,
    locationName: p.locationName,
    address: p.address,
    reservationEndTime: p.reservedUntil,
    raw: p
  };
}

async function fetchNormalizedPoints() {
  const data = await proxyRequest(`${BASE_URL}/chargingPoints`, 'get', null, { op: 'list_points' });
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
    `${BASE_URL}/chargingPoints/${encodeURIComponent(pointId)}/reservations`,
    'post',
    { duration: Number(duration), ...(userId ? { userId } : {}) },
    { op: 'reserve', pointId }
  );
  return normalizeReservationResponse(data, pointId);
}

async function syncToPointsService(trigger = 'interval') {
  const points = await fetchNormalizedPoints();
  const response = {
    provider: 'greenPlug',
    trigger,
    snapshot: true,
    fetched: points.length,
    points,
    fetchedAt: new Date().toISOString(),
  };
  console.log(`[greenPlug] Snapshot prepared (${trigger}), points=${points.length}`);
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
        provider: 'greenPlug',
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
      console.error('[greenPlug] Broker sync request failed:', err.message);
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
      console.log(`[greenPlug] Reserve RPC received routingKey=${msg.fields?.routingKey || ADAPTER_RESERVE_ROUTING_KEY} pointId=${pointId || ''} duration=${duration}`);
      const reservation = await reservePoint(pointId, duration, requestPayload?.userId);

      if (msg.properties.replyTo) {
        channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify({ success: true, provider: 'greenPlug', reservation })),
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
            provider: 'greenPlug',
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

      console.error('[greenPlug] Broker reserve request failed:', err.message);
      channel.ack(msg);
    }
  });

  console.log(`[greenPlug] RabbitMQ sync consumer ready on ${ADAPTER_SYNC_QUEUE}`);
  console.log(`[greenPlug] RabbitMQ reserve consumer ready on ${ADAPTER_RESERVE_QUEUE}`);
}

app.get('/health', (req, res) => res.json({ status: 'ok', provider: 'greenPlug' }));

app.get('/api/points', async (req, res) => {
  try {
    const points = await fetchNormalizedPoints();
    res.json({ points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/points/:pointId', async (req, res) => {
  try {
    const p = await proxyRequest(`${BASE_URL}/chargingPoints/${encodeURIComponent(req.params.pointId)}`, 'get', null, { op: 'get_point', pointId: req.params.pointId });
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
  console.log(`✓ greenPlug adapter listening on ${PORT}`);
  console.log(`[greenPlug] Manual sync endpoint: POST /internal/sync-now`);
  console.log(`[greenPlug] Query endpoints: GET /api/points, GET /api/points/:pointId`);
  console.log(`[greenPlug] WARNING: Automatic sync disabled - Points Service orchestrates sync schedule`);
  startBrokerSyncConsumer().catch((err) => {
    console.error('[greenPlug] Failed to start broker sync consumer:', err.message);
  });
});
