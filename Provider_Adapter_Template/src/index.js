const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3119);
const PROVIDER_NAME = process.env.PROVIDER_NAME || 'examplePlug';
const BASE_URL = process.env.PROVIDER_BASE_URL || 'https://example.com/api';
const API_KEY = process.env.PROVIDER_API_KEY || '';
const AUTH_SCHEME = process.env.PROVIDER_AUTH_SCHEME || 'Bearer';
const LIST_POINTS_ENDPOINT = process.env.ENDPOINT_LIST_POINTS || '/points';
const POINT_DETAILS_ENDPOINT = process.env.ENDPOINT_POINT_DETAILS || '/points/{pointId}';
const RESERVE_ENDPOINT = process.env.ENDPOINT_RESERVE || '/points/{pointId}/reserve';
const RESERVE_DURATION_ENDPOINT = process.env.ENDPOINT_RESERVE_DURATION || '';

function buildUrl(template, params = {}) {
  const resolvedPath = String(template).replace(/\{(\w+)\}/g, (_, key) => {
    if (params[key] === undefined || params[key] === null) {
      throw new Error(`Missing URL parameter: ${key}`);
    }
    return encodeURIComponent(String(params[key]));
  });

  if (/^https?:\/\//i.test(resolvedPath)) {
    return resolvedPath;
  }

  return `${BASE_URL.replace(/\/$/, '')}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;
}

function buildHeaders() {
  const headers = { Accept: 'application/json' };

  if (API_KEY) {
    headers.Authorization = AUTH_SCHEME ? `${AUTH_SCHEME} ${API_KEY}`.trim() : API_KEY;
  }

  return headers;
}

async function proxyRequest(url, method = 'get', data = null) {
  const options = {
    method,
    url,
    headers: buildHeaders(),
    timeout: 10000
  };

  if (data !== null) {
    options.data = data;
  }

  const response = await axios(options);
  return response.data;
}

function normalizeListItem(rawPoint) {
  const point = rawPoint || {};

  return {
    pointId: point.pointId || point.id || point.pointid || point.chargerId || point.uid,
    providerName: PROVIDER_NAME,
    status: point.status || point.state || point.currentStatus || null,
    lon: point.lon || point.long || point.lng || point.coords?.long || point.geo?.[1] || null,
    lat: point.lat || point.coords?.lat || point.geo?.[0] || null,
    raw: point
  };
}

function normalizePointDetails(rawPoint) {
  return rawPoint || {};
}

function buildReserveRequest(pointId, duration) {
  const endpointTemplate = RESERVE_DURATION_ENDPOINT || RESERVE_ENDPOINT;
  const url = buildUrl(endpointTemplate, { pointId, duration, minutes: duration });

  return {
    url,
    method: 'post',
    data: RESERVE_DURATION_ENDPOINT ? null : { duration }
  };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', provider: PROVIDER_NAME });
});

app.get('/api/points', async (req, res) => {
  try {
    const data = await proxyRequest(buildUrl(LIST_POINTS_ENDPOINT));
    const rawPoints = Array.isArray(data) ? data : data.points || data.data || [];
    const points = Array.isArray(rawPoints) ? rawPoints.map(normalizeListItem) : [];
    res.json({ points });
  } catch (err) {
    res.status(500).json({ error: err.message, provider: PROVIDER_NAME });
  }
});

app.get('/api/points/:pointId', async (req, res) => {
  try {
    const data = await proxyRequest(buildUrl(POINT_DETAILS_ENDPOINT, { pointId: req.params.pointId }));
    res.json({ point: normalizePointDetails(data) });
  } catch (err) {
    res.status(500).json({ error: err.message, provider: PROVIDER_NAME });
  }
});

app.post('/api/reserve', async (req, res) => {
  try {
    const { pointId, duration } = req.body || {};

    if (!pointId) {
      return res.status(400).json({ error: 'pointId is required' });
    }

    const reserveRequest = buildReserveRequest(pointId, duration);
    const data = await proxyRequest(reserveRequest.url, reserveRequest.method, reserveRequest.data);
    res.json({ reservation: data });
  } catch (err) {
    res.status(500).json({ error: err.message, provider: PROVIDER_NAME });
  }
});

app.listen(PORT, () => {
  console.log(`✓ ${PROVIDER_NAME} template adapter listening on ${PORT}`);
});