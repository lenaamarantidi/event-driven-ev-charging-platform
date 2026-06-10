/**
 * Frontend Service
 * HTTP service with 4 styled dashboard pages
 * Port: from PORT env variable (default: 3000)
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Frontend Service',
    port: PORT,
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
});

module.exports = app;
