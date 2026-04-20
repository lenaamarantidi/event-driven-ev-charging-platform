/**
 * Analytics Service v2
 * 
 * Event stream and metrics tracking
 * - Receives events from Message Broker
 * - Stores events in PostgreSQL
 * - Generates daily statistics
 * - Provides analytics queries
 * Port: 3106
 */

const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3106;
const DB_USER = process.env.DB_USER || 'analytics_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'analytics_pass';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'analytics_db';
const MESSAGE_BROKER_URL = process.env.MESSAGE_BROKER_URL || 'http://localhost:3003';

// ============== DATABASE ==============

const pool = new Pool({
  user: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// ============== DATABASE INITIALIZATION ==============

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    console.log('📋 Initializing Analytics database...');

    // Create events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        source_service VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_service ON events(source_service);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
    `);

    // Create metrics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        metric_type VARCHAR(100) NOT NULL,
        metric_name VARCHAR(150) NOT NULL,
        metric_value NUMERIC,
        dimensions JSONB,
        recorded_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
      CREATE INDEX IF NOT EXISTS idx_metrics_recorded ON metrics(recorded_at DESC);
    `);

    // Create daily_stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stats_date DATE NOT NULL,
        provider VARCHAR(50),
        stat_name VARCHAR(100) NOT NULL,
        stat_value NUMERIC,
        count BIGINT DEFAULT 0,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(stats_date, provider, stat_name)
      );

      CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(stats_date DESC);
      CREATE INDEX IF NOT EXISTS idx_daily_stats_provider ON daily_stats(provider);
    `);

    console.log('✓ Analytics database initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ============== HELPER FUNCTIONS ==============

/**
 * Store event in database
 */
async function storeEvent(eventType, sourceService, data) {
  try {
    const result = await pool.query(
      `INSERT INTO events (event_type, source_service, data) 
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [eventType, sourceService, JSON.stringify(data)]
    );

    return result.rows[0];
  } catch (err) {
    console.error('Error storing event:', err.message);
    throw err;
  }
}

/**
 * Record metric
 */
async function recordMetric(metricType, metricName, metricValue, dimensions = {}) {
  try {
    await pool.query(
      `INSERT INTO metrics (metric_type, metric_name, metric_value, dimensions)
       VALUES ($1, $2, $3, $4)`,
      [metricType, metricName, metricValue, JSON.stringify(dimensions)]
    );
  } catch (err) {
    console.error('Error recording metric:', err.message);
  }
}

/**
 * Update daily statistics
 */
async function updateDailyStat(statsDate, provider, statName, statValue) {
  try {
    await pool.query(
      `INSERT INTO daily_stats (stats_date, provider, stat_name, stat_value, count)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (stats_date, provider, stat_name)
       DO UPDATE SET 
         stat_value = EXCLUDED.stat_value,
         count = daily_stats.count + 1,
         created_at = NOW()`,
      [statsDate, provider, statName, statValue]
    );
  } catch (err) {
    console.error('Error updating daily stat:', err.message);
  }
}

// ============== REST ENDPOINTS ==============

/**
 * GET /
 * Service info
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Analytics Service v2',
    version: '2.0.0',
    port: PORT,
    mode: 'event-tracking',
    database: DB_NAME,
    description: 'Event stream and analytics aggregation'
  });
});

/**
 * POST /api/events
 * Receive events from Message Broker
 */
app.post('/api/events', async (req, res) => {
  try {
    const { eventType, data } = req.body;

    if (!eventType || !data) {
      return res.status(400).json({ error: 'Missing eventType or data' });
    }

    // Store event
    const event = await storeEvent(eventType, 'message-broker', data);

    // Process specific events for metrics
    switch (eventType) {
      case 'ProviderSynced':
        await recordMetric('sync', `${data.provider}_synced`, 1, { provider: data.provider });
        await updateDailyStat(new Date().toISOString().split('T')[0], data.provider, 'daily_syncs', 1);
        break;

      case 'ReservationCreated':
        await recordMetric('reservation', 'created', 1, { provider: data.provider });
        await updateDailyStat(new Date().toISOString().split('T')[0], data.provider, 'reservations_created', 1);
        break;

      case 'ReservationCancelled':
        await recordMetric('reservation', 'cancelled', 1);
        break;

      case 'ClickTrack':
        await recordMetric('click', data.clickType, 1, { pointId: data.pointId });
        break;

      case 'PaymentCompleted':
        await recordMetric('payment', 'completed', data.amount, { reservationId: data.reservationId });
        break;
    }

    res.json({
      message: 'Event recorded',
      eventId: event.id,
      eventType,
      timestamp: event.created_at
    });
  } catch (err) {
    console.error('Error processing event:', err.message);
    res.status(500).json({ error: 'Failed to process event' });
  }
});

/**
 * GET /api/events
 * Query events
 */
app.get('/api/events', async (req, res) => {
  try {
    const { eventType, service, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (eventType) {
      query += ` AND event_type = $${params.length + 1}`;
      params.push(eventType);
    }

    if (service) {
      query += ` AND source_service = $${params.length + 1}`;
      params.push(service);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      total: result.rows.length,
      limit,
      offset,
      events: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events', details: err.message });
  }
});

/**
 * GET /api/metrics
 * Query metrics
 */
app.get('/api/metrics', async (req, res) => {
  try {
    const { metricType, limit = 100 } = req.query;

    let query = 'SELECT * FROM metrics WHERE 1=1';
    const params = [];

    if (metricType) {
      query += ` AND metric_type = $${params.length + 1}`;
      params.push(metricType);
    }

    query += ` ORDER BY recorded_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      total: result.rows.length,
      metrics: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * GET /api/stats/daily
 * Get daily statistics
 */
app.get('/api/stats/daily', async (req, res) => {
  try {
    const { date, provider } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
    }

    let query = 'SELECT * FROM daily_stats WHERE stats_date = $1';
    const params = [date];

    if (provider) {
      query += ` AND provider = $2`;
      params.push(provider);
    }

    const result = await pool.query(query, params);

    res.json({
      date,
      provider,
      stats: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily stats' });
  }
});

/**
 * GET /api/stats/summary
 * Get summary statistics
 */
app.get('/api/stats/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM events) as total_events,
        (SELECT COUNT(*) FROM metrics) as total_metrics,
        (SELECT COUNT(DISTINCT stats_date) FROM daily_stats) as days_tracked,
        (SELECT COUNT(DISTINCT provider) FROM daily_stats) as providers_tracked,
        (SELECT MAX(created_at) FROM events) as last_event
    `);

    res.json({
      summary: result.rows[0],
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * GET /health
 * Health check
 */
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      status: 'ok',
      service: 'analytics-service',
      port: PORT,
      database: DB_NAME,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      service: 'analytics-service',
      error: err.message
    });
  }
});

// ============== SERVER STARTUP ==============

async function start() {
  try {
    // Initialize database
    await initializeDatabase();

    const server = app.listen(PORT, () => {
      console.log(`✓ Analytics Service v2 running on port ${PORT}`);
      console.log(`✓ Database: ${DB_NAME}`);
      console.log(`✓ Mode: Event tracking and aggregation\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing connections');
      server.close(() => {
        pool.end();
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, closing connections');
      server.close(() => {
        pool.end();
        process.exit(0);
      });
    });

  } catch (err) {
    console.error('Failed to start Analytics Service:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
