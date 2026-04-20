/**
 * Collector Service v2
 * 
 * Daily batch collector for provider APIs
 * - 3 daily syncs (one per provider): RedPlug at 22:00, GreenPlug at 23:00, BluePlug at 00:00
 * - Triggers Points Service sync
 * - Publishes events to Message Broker
 * - Tracks sync history and errors
 * Port: 3104
 */

const express = require('express');
const schedule = require('node-schedule');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3104;
const POINTS_SERVICE_URL = process.env.POINTS_SERVICE_URL || 'http://localhost:3001';
const MESSAGE_BROKER_URL = process.env.MESSAGE_BROKER_URL || 'http://localhost:3003';

// ============== CONFIGURATION ==============

// Sync schedule per provider (end of day)
const SYNC_SCHEDULE = {
  redPlug: '0 22 * * *',      // 22:00 (10 PM)
  greenPlug: '0 23 * * *',    // 23:00 (11 PM)
  bluePlug: '0 0 * * *'       // 00:00 (Midnight)
};

// ============== STATE ==============

const syncState = {
  lastSync: new Map(),
  syncCount: new Map(),
  errors: new Map(),
  schedules: new Map()
};

// Initialize state for each provider
['redPlug', 'greenPlug', 'bluePlug'].forEach(provider => {
  syncState.lastSync.set(provider, null);
  syncState.syncCount.set(provider, 0);
  syncState.errors.set(provider, []);
});

// ============== HELPER FUNCTIONS ==============

/**
 * Publish event to message broker
 */
async function publishEvent(eventType, data) {
  try {
    const response = await axios.post(
      `${MESSAGE_BROKER_URL}/api/events/publish`,
      {
        eventType,
        data: {
          ...data,
          timestamp: new Date(),
          source: 'collector-service'
        }
      },
      { timeout: 5000 }
    );

    console.log(`✓ Event published: ${eventType}`);
    return response.data;
  } catch (err) {
    console.error(`⚠️ Failed to publish event ${eventType}:`, err.message);
  }
}

/**
 * Trigger points sync in Points Service
 */
async function triggerPointsSync(provider) {
  try {
    console.log(`📡 Triggering sync for ${provider}...`);

    const response = await axios.post(
      `${POINTS_SERVICE_URL}/api/points/sync/${provider}`,
      {},
      { timeout: 30000 }
    );

    console.log(`✓ Sync completed for ${provider}:`, response.data);

    // Update state
    syncState.lastSync.set(provider, new Date());
    syncState.syncCount.set(provider, (syncState.syncCount.get(provider) || 0) + 1);

    // Publish success event
    await publishEvent('ProviderSynced', {
      provider,
      syncTime: new Date(),
      syncCount: syncState.syncCount.get(provider)
    });

    return response.data;
  } catch (err) {
    console.error(`✗ Sync failed for ${provider}:`, err.message);

    // Store error
    const errors = syncState.errors.get(provider) || [];
    errors.push({
      timestamp: new Date(),
      error: err.message
    });
    syncState.errors.set(provider, errors.slice(-10)); // Keep last 10

    // Publish error event
    await publishEvent('SyncFailed', {
      provider,
      error: err.message,
      timestamp: new Date()
    });

    throw err;
  }
}

/**
 * Schedule daily sync for provider using cron expression
 */
function scheduleProviderSync(provider) {
  // Cancel previous job if exists
  if (syncState.schedules.has(provider)) {
    syncState.schedules.get(provider).cancel();
  }

  const cronTime = SYNC_SCHEDULE[provider];

  console.log(`⏰ Scheduling ${provider} sync at: ${cronTime}`);

  const job = schedule.scheduleJob(cronTime, async () => {
    console.log(`\n📅 [${new Date().toISOString()}] Starting scheduled sync for ${provider}...`);

    try {
      const result = await triggerPointsSync(provider);
      console.log(`✓ Scheduled sync completed for ${provider}`);
    } catch (err) {
      console.error(`✗ Scheduled sync failed for ${provider}:`, err.message);
    }
  });

  syncState.schedules.set(provider, job);
}

/**
 * Initialize all daily sync schedules
 */
function initializeSchedules() {
  console.log('📋 Initializing daily sync schedules...');

  for (const provider of ['redPlug', 'greenPlug', 'bluePlug']) {
    scheduleProviderSync(provider);
  }

  console.log('✓ All schedules initialized:');
  console.log(`  - redPlug: ${SYNC_SCHEDULE.redPlug} (10 PM)`);
  console.log(`  - greenPlug: ${SYNC_SCHEDULE.greenPlug} (11 PM)`);
  console.log(`  - bluePlug: ${SYNC_SCHEDULE.bluePlug} (Midnight)`);
}

// ============== REST ENDPOINTS ==============

/**
 * GET /
 * Service info
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Collector Service v2',
    version: '2.0.0',
    mode: 'daily-batch',
    description: '3 daily syncs with Message Broker integration',
    schedules: SYNC_SCHEDULE,
    pointsServiceUrl: POINTS_SERVICE_URL,
    messageBrokerUrl: MESSAGE_BROKER_URL
  });
});

/**
 * POST /collector/sync/:provider
 * Manually trigger sync for a specific provider
 */
app.post('/collector/sync/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const validProviders = ['redPlug', 'greenPlug', 'bluePlug'];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    const result = await triggerPointsSync(provider);

    res.json({
      message: `Synced ${provider}`,
      provider,
      syncTime: new Date(),
      success: true
    });
  } catch (err) {
    res.status(500).json({
      error: 'Sync failed',
      provider: req.params.provider,
      details: err.message
    });
  }
});

/**
 * POST /collector/sync/all
 * Manually sync all providers (useful for testing)
 */
app.post('/collector/sync/all', async (req, res) => {
  try {
    const results = {};
    const startTime = Date.now();

    for (const provider of ['redPlug', 'greenPlug', 'bluePlug']) {
      try {
        results[provider] = { status: 'success' };
        await triggerPointsSync(provider);
      } catch (err) {
        results[provider] = { status: 'failed', error: err.message };
      }
    }

    const duration = Date.now() - startTime;

    // Publish bulk sync event
    await publishEvent('AllProvidersSynced', {
      results,
      duration,
      timestamp: new Date()
    });

    res.json({
      message: 'Synced all providers',
      results,
      duration,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({
      error: 'Bulk sync failed',
      details: err.message
    });
  }
});

/**
 * GET /collector/status
 * Get current sync status for all providers
 */
app.get('/collector/status', (req, res) => {
  const status = {
    timestamp: new Date(),
    collectors: {}
  };

  for (const provider of ['redPlug', 'greenPlug', 'bluePlug']) {
    const lastSync = syncState.lastSync.get(provider);
    const errors = syncState.errors.get(provider);
    const syncCount = syncState.syncCount.get(provider);

    status.collectors[provider] = {
      schedule: SYNC_SCHEDULE[provider],
      lastSync,
      syncCount,
      errorCount: errors?.length || 0,
      lastError: errors?.length > 0 ? errors[errors.length - 1] : null
    };
  }

  res.json(status);
});

/**
 * GET /collector/stats
 * Get detailed sync statistics
 */
app.get('/collector/stats', (req, res) => {
  const stats = {};

  for (const provider of ['redPlug', 'greenPlug', 'bluePlug']) {
    stats[provider] = {
      lastSync: syncState.lastSync.get(provider),
      syncCount: syncState.syncCount.get(provider),
      schedule: SYNC_SCHEDULE[provider],
      errorCount: syncState.errors.get(provider).length,
      recentErrors: syncState.errors.get(provider).slice(-3)
    };
  }

  res.json({
    collectors: stats,
    timestamp: new Date()
  });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'collector-service',
    mode: 'daily-batch',
    version: '2.0',
    port: PORT,
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

// ============== SERVER STARTUP ==============

const server = app.listen(PORT, () => {
  console.log(`\n✓ Collector Service v2 running on port ${PORT}`);
  console.log(`✓ Mode: Daily Batch (3 calls per day)`);
  console.log(`✓ Points Service URL: ${POINTS_SERVICE_URL}`);
  console.log(`✓ Message Broker URL: ${MESSAGE_BROKER_URL}\n`);

  // Initialize schedules on startup
  initializeSchedules();
});

// ============== GRACEFUL SHUTDOWN ==============

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');

  // Cancel all scheduled jobs
  for (const [provider, job] of syncState.schedules.entries()) {
    console.log(`Cancelling schedule for ${provider}`);
    job.cancel();
  }

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');

  // Cancel all scheduled jobs
  for (const [provider, job] of syncState.schedules.entries()) {
    console.log(`Cancelling schedule for ${provider}`);
    job.cancel();
  }

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
