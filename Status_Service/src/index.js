/**
 * Status Service
 * Κάνει αιτήσεις σε provider APIs για κατάσταση σημείων
 * και ενημερώνει την κεντρική βάση
 */

const express = require('express');
const axios = require('axios');
const { ProviderAdapterFactory } = require('./adapters/providerAdapter');

const app = express();
app.use(express.json());

const POINTS_SERVICE_URL = process.env.POINTS_SERVICE_URL || 'http://localhost:3001';

/**
 * GET /api/status/all
 * Comprehensive health check of all providers
 */
app.get('/api/status/all', async (req, res) => {
  try {
    const results = await ProviderAdapterFactory.checkAllProviders();
    res.json(results);
  } catch (error) {
    console.error('Error in comprehensive status check:', error);
    res.status(500).json({ error: 'Comprehensive status check failed', details: error.message });
  }
});

/**
 * GET /api/status/:provider/health
 * Get health status of specific provider
 */
app.get('/api/status/:provider/health', async (req, res) => {
  try {
    const { provider } = req.params;
    const adapter = ProviderAdapterFactory.createAdapter(provider);
    const health = await adapter.checkHealth();
    
    res.json(health);
  } catch (error) {
    console.error(`Health check failed for ${req.params.provider}:`, error.message);
    res.status(500).json({ 
      provider: req.params.provider,
      error: error.message 
    });
  }
});

/**
 * GET /api/status/:provider/details
 * Get comprehensive system status including critical endpoints
 */
app.get('/api/status/:provider/details', async (req, res) => {
  try {
    const { provider } = req.params;
    const adapter = ProviderAdapterFactory.createAdapter(provider);
    const systemStatus = await adapter.getSystemStatus();
    
    res.json(systemStatus);
  } catch (error) {
    console.error(`System status check failed for ${req.params.provider}:`, error.message);
    res.status(500).json({ 
      provider: req.params.provider,
      error: error.message 
    });
  }
});

/**
 * GET /api/status
 * Get status of all providers (legacy - returns point counts)
 */
app.get('/api/status', async (req, res) => {
  try {
    const results = {};
    const providers = ProviderAdapterFactory.getAllProviders();

    for (const providerName of providers) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(providerName);
        const url = adapter.getListPointsUrl();

        console.log(`📡 Status check: ${providerName}`);
        const response = await axios.get(url, { timeout: 10000 });
        const points = Array.isArray(response.data) ? response.data : response.data.points || [];

        // Κατηγοριοποίηση κατά status
        const byStatus = {};
        points.forEach(p => {
          const status = p.status;
          byStatus[status] = (byStatus[status] || 0) + 1;
        });

        results[providerName] = {
          online: true,
          total_points: points.length,
          by_status: byStatus,
          timestamp: new Date().toISOString()
        };

        console.log(`✓ ${providerName}: ${points.length} points`);
      } catch (error) {
        console.error(`✗ ${providerName} status check failed:`, error.message);
        results[providerName] = {
          online: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error in status check:', error);
    res.status(500).json({ error: 'Status check failed' });
  }
});

/**
 * GET /api/status/:provider
 * Get status of specific provider (legacy - returns point counts)
 */
app.get('/api/status/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const adapter = ProviderAdapterFactory.createAdapter(provider);
    const url = adapter.getListPointsUrl();

    console.log(`📡 Checking status for ${provider}`);
    const response = await axios.get(url, { timeout: 10000 });
    const points = Array.isArray(response.data) ? response.data : response.data.points || [];

    const byStatus = {};
    points.forEach(p => {
      const status = p.status;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    res.json({
      provider,
      online: true,
      total_points: points.length,
      by_status: byStatus,
      points: points.slice(0, 5) // Sample first 5 points
    });
  } catch (error) {
    console.error(`Status check failed for ${req.params.provider}:`, error.message);
    res.status(500).json({ 
      provider: req.params.provider,
      online: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/status/detailed/:provider/:pointid
 * Get detailed status of specific point
 */
app.get('/api/status/detailed/:provider/:pointid', async (req, res) => {
  try {
    const { provider, pointid } = req.params;
    const adapter = ProviderAdapterFactory.createAdapter(provider);
    const url = adapter.getPointUrl(pointid);

    console.log(`📡 Detailed status: ${provider}/${pointid}`);
    const response = await axios.get(url, { timeout: 10000 });
    
    const normalizedPoint = adapter.normalizePoint(response.data);

    res.json(normalizedPoint);
  } catch (error) {
    console.error(`Detailed status failed:`, error.message);
    
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'Point not found' });
    } else {
      res.status(500).json({ error: 'Status check failed' });
    }
  }
});

/**
 * GET /api/status/ping
 * Simple healthcheck - δεν κάνει actual requests
 */
app.get('/api/status/ping', (req, res) => {
  try {
    const providers = ProviderAdapterFactory.getAllProviders();
    res.json({
      message: 'Pong',
      configured_providers: providers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Ping failed' });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'status-service', port: process.env.PORT || 3002 });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✓ Status Service running on port ${PORT}`);
});

module.exports = app;
