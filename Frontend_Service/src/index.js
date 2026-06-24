/**
 * Frontend Service
 * HTTP service with 4 styled dashboard pages
 * Port: from PORT env variable (default: 3000)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('yaml');
const { getPointsByProvider, getAllPoints } = require('./map_ui');

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

// API endpoint to fetch points by provider with normalization
app.get('/api/points/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const data = await getPointsByProvider(provider, { normalize: true });
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      error: err.message,
      provider: req.params.provider
    });
  }
});

// API endpoint to fetch points from all providers with normalization
app.get('/api/points', async (req, res) => {
  try {
    const data = await getAllPoints({ normalize: true });
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch points from all providers',
      details: err.message
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
