const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3113);

const BASE_URL = process.env.BLUEPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/bluePlug/api';
const API_KEY = process.env.BLUEPLUG_API_KEY || 'blueplug-key-123';
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
    pointId: p.uid ?? p.id ?? p.chargerId,
    providerName: 'bluePlug',
    status: p.currentStatus ?? (p.available ? 'available' : 'occupied'),
    lon: p.lng ?? p.geo?.[1],
    lat: p.lat ?? p.geo?.[0],
    capacityKw: p.cap,
    kwhPrice: p.pricePerKwh,
    connector: p.connector,
    locationName: p.locationName,
    address: p.address,
    reservationEndTime: p.reservationEnd,
    raw: p
  };
}

async function fetchNormalizedPoints() {
  const data = await proxyRequest(`${BASE_URL}/locations`);
  return Array.isArray(data) ? data.map(normalizePointForCentral) : [];
}

async function syncToPointsService(trigger = 'interval') {
  const points = await fetchNormalizedPoints();
  const headers = { 'Content-Type': 'application/json' };
  if (SYNC_INGEST_TOKEN) {
    headers['x-sync-token'] = SYNC_INGEST_TOKEN;
  }

  const response = await axios.post(
    `${POINTS_SERVICE_URL.replace(/\/$/, '')}/internal/providers/bluePlug/sync`,
    {
      provider: 'bluePlug',
      snapshot: true,
      points
    },
    { timeout: 15000, headers }
  );

  console.log(`[bluePlug] Sync (${trigger}) completed`, response.data);
  return response.data;
}

app.get('/health', (req, res) => res.json({ status: 'ok', provider: 'bluePlug' }));

app.get('/api/points', async (req, res) => {
  try {
    const points = await fetchNormalizedPoints();
    res.json({ points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/points/:pointId', async (req, res) => {
  try {
    const p = await proxyRequest(`${BASE_URL}/location/${encodeURIComponent(req.params.pointId)}/status`);
    res.json({ point: p });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Hold endpoint used by reservation service / postman:
// POST /bluePlug/api/location/{pointid}/hold?minutes=60
// Adapter should map body/query -> provider's expected params.
app.post('/api/location/:pointid/hold', async (req, res) => {
  try {
    const pointId = req.params.pointid;
    const minutesRaw = req.query.minutes ?? req.body?.minutes ?? req.body?.duration;
    const minutes = Number(minutesRaw ?? 60);

    if (!Number.isFinite(minutes) || minutes < 1) {
      return res.status(422).json({ error: 'minutes must be an integer >= 1' });
    }

    const data = await proxyRequest(
      `${BASE_URL}/location/${encodeURIComponent(pointId)}/hold`,
      'post',
      { minutes }
    );

    res.json({ reservation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reserve', async (req, res) => {
  try {
    console.log('[BluePlug POST /api/reserve] Body:', JSON.stringify(req.body));
    
    const { pointId, duration, minutes: minutesFromBody } = req.body;
    if (!pointId) {
      return res.status(400).json({ error: 'pointId is required' });
    }
    
    // Accept both 'duration' and 'minutes' from body
    const minutes = Number(minutesFromBody ?? duration ?? 60);
    if (!Number.isFinite(minutes) || minutes < 1) {
      return res.status(422).json({ error: 'duration/minutes must be an integer >= 1' });
    }

    console.log(`[BluePlug] Calling: ${BASE_URL}/location/${pointId}/hold?minutes=${minutes}`);
    const data = await proxyRequest(
      `${BASE_URL}/location/${encodeURIComponent(pointId)}/hold?minutes=${encodeURIComponent(String(minutes))}`,
      'post'
    );

    console.log('[BluePlug] Response:', JSON.stringify(data));
    res.json({ reservation: data });
  } catch (err) {
    console.error('[BluePlug POST /api/reserve] Error:', err.message);
    console.error('[BluePlug] Full error:', err.response?.data || err);
    res.status(500).json({ 
      error: err.message,
      details: err.response?.data || null
    });
  }
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
  console.log(`✓ bluePlug adapter listening on ${PORT}`);
  console.log(`[bluePlug] Sync interval ms: ${ADAPTER_SYNC_INTERVAL_MS}`);

  syncToPointsService('startup').catch(err => {
    console.error('[bluePlug] Startup sync failed:', err.message);
  });

  setInterval(() => {
    syncToPointsService('interval').catch(err => {
      console.error('[bluePlug] Interval sync failed:', err.message);
    });
  }, ADAPTER_SYNC_INTERVAL_MS);
});
