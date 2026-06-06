const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3111);

const BASE_URL = process.env.REDPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/redPlug/api';
const API_KEY = process.env.REDPLUG_API_KEY || 'redplug-key-123';

async function proxyRequest(url, method = 'get', data = null) {
  const opts = { method, url, headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' }, timeout: 10000 };
  if (data) opts.data = data;
  const resp = await axios(opts);
  return resp.data;
}

app.get('/health', (req, res) => res.json({ status: 'ok', provider: 'redPlug' }));

app.get('/api/points', async (req, res) => {
  try {
    const data = await proxyRequest(`${BASE_URL}/points`);
    // normalize minimal shape
    const points = Array.isArray(data) ? data.map(p => ({ pointId: p.pointid ?? p.id, providerName: 'redPlug', status: p.status, lon: p.long, lat: p.lat, raw: p })) : [];
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

app.listen(PORT, () => console.log(`✓ redPlug adapter listening on ${PORT}`));
