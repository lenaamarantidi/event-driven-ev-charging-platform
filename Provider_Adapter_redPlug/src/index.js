const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3111);

const BASE_URL = process.env.REDPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/redPlug/api';
const API_KEY = process.env.REDPLUG_API_KEY || 'redplug-key-123';
const POINTS_SERVICE_URL = process.env.POINTS_SERVICE_URL || 'http://central-service:3001';
const ADAPTER_SYNC_INTERVAL_MS = Number(process.env.ADAPTER_SYNC_INTERVAL_MS || 86400000);
const SYNC_INGEST_TOKEN = process.env.SYNC_INGEST_TOKEN || '';

async function proxyRequest(url, method = 'get', data = null) {
  const opts = { method, url, headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' }, timeout: 10000 };
  if (data) opts.data = data;
  const resp = await axios(opts);
  return resp.data;
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
  const data = await proxyRequest(`${BASE_URL}/points`);
  return Array.isArray(data) ? data.map(normalizePointForCentral) : [];
}

async function syncToPointsService(trigger = 'interval') {
  const points = await fetchNormalizedPoints();
  const headers = { 'Content-Type': 'application/json' };
  if (SYNC_INGEST_TOKEN) {
    headers['x-sync-token'] = SYNC_INGEST_TOKEN;
  }

  const response = await axios.post(
    `${POINTS_SERVICE_URL.replace(/\/$/, '')}/internal/providers/redPlug/sync`,
    {
      provider: 'redPlug',
      snapshot: true,
      points
    },
    { timeout: 15000, headers }
  );

  console.log(`[redPlug] Sync (${trigger}) completed`, response.data);
  return response.data;
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
    const p = await proxyRequest(`${BASE_URL}/point/${encodeURIComponent(req.params.pointId)}`);
    res.json({ point: p });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reserve', async (req, res) => {
  try {
    const { pointId, duration } = req.body;
    const data = await proxyRequest(`${BASE_URL}/reserve/${encodeURIComponent(pointId)}/${encodeURIComponent(duration)}`, 'post', {});
    res.json({ reservation: data });
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
  console.log(`[redPlug] Sync interval ms: ${ADAPTER_SYNC_INTERVAL_MS}`);

  syncToPointsService('startup').catch(err => {
    console.error('[redPlug] Startup sync failed:', err.message);
  });

  setInterval(() => {
    syncToPointsService('interval').catch(err => {
      console.error('[redPlug] Interval sync failed:', err.message);
    });
  }, ADAPTER_SYNC_INTERVAL_MS);
});
