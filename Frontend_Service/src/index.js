/**
 * Frontend Service
 * HTTP service with 4 styled dashboard pages
 * Port: from PORT env variable (default: 3000)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('yaml');
const { getAllPointsFromCentral } = require('./map_ui');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Read extra_hosts from docker-compose
function getExtraHosts() {
  try {
    const composeFilePath = path.join(__dirname, '../docker-compose.frontend.service.yml');
    const fileContent = fs.readFileSync(composeFilePath, 'utf8');
    const compose = yaml.parse(fileContent);
    return compose.services['frontend-service']?.extra_hosts || [];
  } catch (err) {
    console.warn('Could not read extra_hosts from compose file:', err.message);
    return [];
  }
}

const extraHosts = getExtraHosts();
console.log('Extra hosts:', extraHosts);

// Serve static HTML pages from the pages directory
app.get('/login-register', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/login-register.html'));
});

app.get('/ev-user', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/ev-user.html'));
});

app.get('/operator', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/operator.html'));
});

app.get('/provider', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/provider.html'));
});

// API endpoint to fetch points from central service with optional provider filter
app.get('/api/points', async (req, res) => {
  try {
    const { provider, status, avail, connectorType, lat, lon, radius, limit, costMin, costMax, powerMin, powerMax, type } = req.query;
    
    // Build filters object from query parameters
    const filters = {};
    if (provider) filters.provider = provider;
    if (status) filters.status = status;
    if (avail) filters.avail = avail;
    if (connectorType) filters.connectorType = connectorType;
    if (lat && lon && radius) {
      filters.lat = lat;
      filters.lon = lon;
      filters.radius = radius;
    }
    if (limit) filters.limit = limit;
    if (costMin !== undefined) filters.costMin = costMin;
    if (costMax !== undefined) filters.costMax = costMax;
    if (powerMin !== undefined) filters.powerMin = powerMin;
    if (powerMax !== undefined) filters.powerMax = powerMax;
    if (type) filters.type = type;

    console.log('[/api/points] Fetching from central with filters:', filters);
    const data = await getAllPointsFromCentral({ filters });
    
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      error: err.message,
      details: err.response?.data?.error || err.message
    });
  }
});

// API endpoint to return extra_hosts
app.get('/api/hosts', (req, res) => {
  res.json({
    extra_hosts: extraHosts,
    hosts_map: Object.fromEntries(
      extraHosts.map(h => {
        const [hostname, ip] = h.split(':');
        return [hostname, ip];
      })
    )
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Frontend Service',
    port: PORT,
    extra_hosts: extraHosts,
    timestamp: new Date().toISOString()
  });
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/login-register');
});

// Start server
app.listen(PORT, () => {
  console.log(`Frontend Service listening on port ${PORT}`);
  console.log(`Extra hosts configured:`, extraHosts);
  console.log(`Environment variables:`);
  console.log(`  POINTS_RED_PORT=${process.env.POINTS_RED_PORT}`);
  console.log(`  POINTS_GREEN_PORT=${process.env.POINTS_GREEN_PORT}`);
  console.log(`  POINTS_BLUE_PORT=${process.env.POINTS_BLUE_PORT}`);
});

module.exports = app;
