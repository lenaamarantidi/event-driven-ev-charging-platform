const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3113);

const BASE_URL = process.env.BLUEPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/bluePlug/api';
const API_KEY = process.env.BLUEPLUG_API_KEY || 'blueplug-key-123';

async function proxyRequest(url, method = 'get', data = null) {
  const opts = { method, url, headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' }, timeout: 10000 };
  if (data) opts.data = data;
  const resp = await axios(opts);
  return resp.data;
}

app.get('/health', (req, res) => res.json({ status: 'ok', provider: 'bluePlug' }));

app.get('/api/points', async (req, res) => {
  try {
    const data = await proxyRequest(`${BASE_URL}/locations`);
    const points = Array.isArray(data) ? data.map(p => ({ pointId: p.uid ?? p.id, providerName: 'bluePlug', status: p.available ? 'available' : 'occupied', lon: p.lng, lat: p.lat, raw: p })) : [];
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

app.listen(PORT, () => console.log(`✓ bluePlug adapter listening on ${PORT}`));
