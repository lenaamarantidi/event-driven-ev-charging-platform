require('dotenv').config();

const express = require('express');
const cors = require('cors');
const proxy = require('express-http-proxy');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 8000);
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3100';

function rewritePath(req) {
  return `/auth${req.url}`;
}

app.get('/', (req, res) => {
  res.json({
    service: 'API Gateway',
    routes: [
      '/api/auth/*'
    ],
    authService: AUTH_SERVICE_URL
  });
});

app.use('/api/auth', proxy(AUTH_SERVICE_URL, {
  proxyReqPathResolver: (req) => rewritePath(req)
}));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'API Gateway',
    port: PORT,
    authService: AUTH_SERVICE_URL
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
  console.log(`Proxying /api/auth/* to ${AUTH_SERVICE_URL}`);
});
