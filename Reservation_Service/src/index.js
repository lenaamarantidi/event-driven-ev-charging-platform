/**
 * Reservation Service (Port 3106)
 * 
 * Unified API for reserving EV charging points across multiple providers
 * - redPlug, greenPlug, bluePlug
 * 
 * Publishes reservation_successful events to RabbitMQ for Billing & Analytics services
 */

const express = require('express');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
app.use(express.json());

// Import modules
const { initializeDatabase, testDatabaseConnection } = require('./db');
const { connectWithRetry, publishReservationEvent } = require('./rabbitmq');
const { createReservation } = require('./controllers');

const PORT = process.env.PORT || 3106;

// ============== MIDDLEWARE ==============

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============== ROUTES ==============

/**
 * Health Check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Reservation_Service',
    port: PORT,
    database: 'reservation_db',
    timestamp: new Date().toISOString()
  });
});

/**
 * Unified Reservation API
 * 
 * Request:
 * {
 *   "providerName": "redPlug" | "greenPlug" | "bluePlug",
 *   "pointId": "123",
 *   "duration": 60,
 *   "userId": "user-uuid" (optional, for tracking)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "reservationId": "uuid",
 *   "providerId": 1,
 *   "providerName": "redPlug",
 *   "pointId": "123",
 *   "reservationDetails": { ... provider response }
 * }
 */
app.post('/api/reserve', async (req, res) => {
  try {
    const { providerName, pointId, duration, userId } = req.body;

    // Validation
    if (!providerName || !pointId || !duration) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: providerName, pointId, duration'
      });
    }

    if (!['redPlug', 'greenPlug', 'bluePlug'].includes(providerName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Must be redPlug, greenPlug, or bluePlug'
      });
    }

    // Generate reservation ID
    const reservationId = uuidv4();

    console.log(`[RESERVE] Attempting reservation: ${reservationId} for ${providerName}#${pointId}`);

    // Call controller
    const result = await createReservation({
      reservationId,
      providerName,
      pointId,
      duration,
      userId
    });

    if (!result.success) {
      console.error(`[RESERVE] Failed: ${result.error}`);
      return res.status(400).json(result);
    }

    console.log(`[RESERVE] Success: ${reservationId}`);

    // Get provider ID for event publishing
    let providerId = 1; // Default mapping
    if (providerName === 'greenPlug') providerId = 2;
    if (providerName === 'bluePlug') providerId = 3;

    // Publish to RabbitMQ (async, non-blocking)
    try {
      await publishReservationEvent({
        reservationId,
        providerId,
        providerName,
        pointId,
        duration,
        timestamp: new Date().toISOString()
      });
      console.log(`[RABBITMQ] Event published for reservation ${reservationId}`);
    } catch (rabbitmqError) {
      console.error(`[RABBITMQ] Publishing error (non-blocking): ${rabbitmqError.message}`);
      // Don't fail the reservation because of RabbitMQ error
      // The event will be retried
    }

    // Return success response
    res.status(200).json({
      success: true,
      reservationId,
      providerId,
      providerName,
      pointId,
      duration,
      reservationDetails: result.data,
      message: 'Reservation successful. Event published to billing & analytics services.'
    });

  } catch (error) {
    console.error('[RESERVE] Unexpected error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Reservation History
 */
app.get('/api/reservations', async (req, res) => {
  try {
    const pool = require('./db').getPool();
    const [rows] = await pool.query(`
      SELECT 
        reservation_id, provider_name, point_id, duration, status, 
        created_at, reservation_details
      FROM reservation_logs
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      count: rows.length,
      reservations: rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Reservation Details
 */
app.get('/api/reservations/:reservationId', async (req, res) => {
  try {
    const { reservationId } = req.params;
    const pool = require('./db').getPool();
    const [rows] = await pool.query(
      `SELECT * FROM reservation_logs WHERE reservation_id = ? LIMIT 1`,
      [reservationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }

    res.json({
      success: true,
      reservation: rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== SERVER STARTUP ==============

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    await testDatabaseConnection();

    // Connect to RabbitMQ
    await connectWithRetry();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n✓ Reservation_Service started on http://localhost:${PORT}`);
      console.log(`✓ Database: reservation_db`);
      console.log(`✓ RabbitMQ: Connected`);
      console.log(`\nEndpoints:`);
      console.log(`  POST /api/reserve - Create reservation`);
      console.log(`  GET  /api/reservations - List recent reservations`);
      console.log(`  GET  /api/reservations/:id - Get reservation details`);
      console.log(`  GET  /health - Health check`);
    });
  } catch (error) {
    console.error('✗ Startup error:', error.message);
    process.exit(1);
  }
}

// ============== GRACEFUL SHUTDOWN ==============

process.on('SIGTERM', async () => {
  console.log('\nSIGTERM received. Shutting down gracefully...');
  const pool = require('./db').getPool();
  if (pool) await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received. Shutting down gracefully...');
  const pool = require('./db').getPool();
  if (pool) await pool.end();
  process.exit(0);
});

// Start the server
startServer();

initializeDatabase();

// ============== PROVIDER MAPPING ==============

const PROVIDER_CONFIG = {
  redPlug: {
    base: process.env.REDPLUG_BASE_URL || 'https://api.redplug.local',
    endpoints: {
      reserve: '/reserve/{pointid}',
      reserveWithDuration: '/reserve/{pointid}/{minutes}'
    }
  },
  greenPlug: {
    base: process.env.GREENPLUG_BASE_URL || 'https://api.greenplug.local',
    endpoints: {
      reserve: '/chargingPoints/{pointid}/reservations',
      reserveWithDuration: '/chargingPoints/{pointid}/reservations/{minutes}'
    }
  },
  bluePlug: {
    base: process.env.BLUEPLUG_BASE_URL || 'https://api.blueplug.local',
    endpoints: {
      reserve: '/location/{pointid}/hold',
      reserveWithDuration: '/location/{pointid}/hold/{minutes}'
    }
  }
};

// ============== HELPER FUNCTIONS ==============

/**
 * Publish event to message broker
 */
async function publishEvent(eventType, data) {
  try {
    const brokerUrl = process.env.MESSAGE_BROKER_URL || 'http://localhost:3003';
    await axios.post(`${brokerUrl}/api/events/publish`, {
      eventType,
      data
    }, { timeout: 5000 });
  } catch (err) {
    console.error('⚠️ Failed to publish event:', err.message);
  }
}

/**
 * Log reservation event
 */
async function logReservationEvent(reservationId, eventType, statusBefore, statusAfter, details = {}) {
  try {
    await pool.query(
      `INSERT INTO reservation_log (reservation_id, event_type, status_before, status_after, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [reservationId, eventType, statusBefore, statusAfter, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Error logging reservation event:', err.message);
  }
}

/**
 * Create reservation with external provider
 */
async function createReservationWithProvider(provider, pointId, durationMinutes) {
  try {
    const config = PROVIDER_CONFIG[provider];
    const endpoint = durationMinutes 
      ? config.endpoints.reserveWithDuration.replace('{pointid}', pointId).replace('{minutes}', durationMinutes)
      : config.endpoints.reserve.replace('{pointid}', pointId);

    const url = `${config.base}${endpoint}`;

    console.log(`📡 Creating reservation with ${provider}: ${url}`);

    const response = await axios.post(url, {}, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });

    console.log(`✓ Reservation created with ${provider}`);
    return response.data;
  } catch (err) {
    console.error(`✗ Error creating reservation with ${provider}:`, err.message);
    throw err;
  }
}

// ============== REST ENDPOINTS ==============

/**
 * POST /api/reservations
 * Create new reservation
 */
app.post('/api/reservations', async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, pointId, provider, durationMinutes, estimatedKwh, estimatedCost } = req.body;

    if (!userId || !pointId || !provider) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validProviders = ['redPlug', 'greenPlug', 'bluePlug'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    await client.query('BEGIN');

    // Create external reservation
    let externalId = null;
    try {
      const externalRes = await createReservationWithProvider(provider, pointId, durationMinutes);
      externalId = externalRes.reservationid || externalRes.id;
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Failed to create reservation with provider', details: err.message });
    }

    const reservedFrom = new Date();
    const reservedUntil = new Date(reservedFrom.getTime() + (durationMinutes || 60) * 60000);

    // Create local reservation
    const result = await client.query(
      `INSERT INTO reservations 
       (user_id, point_id, provider, external_reservation_id, reserved_from, reserved_until, 
        duration_minutes, requested_duration_minutes, estimated_kwh, estimated_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId, pointId, provider, externalId,
        reservedFrom, reservedUntil,
        durationMinutes || 60, durationMinutes,
        estimatedKwh, estimatedCost
      ]
    );

    const reservation = result.rows[0];

    // Log event
    await logReservationEvent(reservation.id, 'created', null, 'pending', {
      provider,
      externalId
    });

    await client.query('COMMIT');

    // Publish event
    publishEvent('ReservationCreated', {
      reservationId: reservation.id,
      userId,
      pointId,
      provider,
      estimatedCost,
      timestamp: new Date()
    });

    console.log(`✓ Reservation created: ${reservation.id}`);
    res.status(201).json(reservation);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating reservation:', err.message);
    res.status(500).json({ error: 'Failed to create reservation', details: err.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/reservations/:reservationId
 * Get reservation details
 */
app.get('/api/reservations/:reservationId', async (req, res) => {
  try {
    const { reservationId } = req.params;

    const result = await pool.query(
      'SELECT * FROM reservations WHERE id = $1',
      [reservationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = result.rows[0];

    // Get event log
    const logResult = await pool.query(
      'SELECT * FROM reservation_log WHERE reservation_id = $1 ORDER BY created_at DESC',
      [reservationId]
    );

    res.json({
      ...reservation,
      eventLog: logResult.rows
    });
  } catch (err) {
    console.error('Error fetching reservation:', err.message);
    res.status(500).json({ error: 'Failed to fetch reservation' });
  }
});

/**
 * GET /api/reservations/user/:userId
 * Get user's reservations
 */
app.get('/api/reservations/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    let query = 'SELECT * FROM reservations WHERE user_id = $1';
    const params = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({
      userId,
      count: result.rows.length,
      reservations: result.rows
    });
  } catch (err) {
    console.error('Error fetching user reservations:', err.message);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

/**
 * POST /api/reservations/:reservationId/cancel
 * Cancel reservation
 */
app.post('/api/reservations/:reservationId/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    const { reservationId } = req.params;
    const { reason } = req.body;

    await client.query('BEGIN');

    const result = await pool.query(
      'SELECT * FROM reservations WHERE id = $1',
      [reservationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = result.rows[0];

    if (reservation.status === 'cancelled') {
      return res.status(400).json({ error: 'Reservation already cancelled' });
    }

    const updateResult = await client.query(
      `UPDATE reservations 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [reservationId]
    );

    await logReservationEvent(reservationId, 'cancelled', reservation.status, 'cancelled', { reason });

    await client.query('COMMIT');

    publishEvent('ReservationCancelled', {
      reservationId,
      reason,
      timestamp: new Date()
    });

    res.json(updateResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error cancelling reservation:', err.message);
    res.status(500).json({ error: 'Failed to cancel reservation' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/reservations/statistics/daily
 * Get daily statistics
 */
app.get('/api/reservations/statistics/daily', async (req, res) => {
  try {
    const { date, provider } = req.query;

    let query = 'SELECT * FROM reservation_statistics WHERE 1=1';
    const params = [];

    if (date) {
      query += ' AND date = $' + (params.length + 1);
      params.push(date);
    }

    if (provider) {
      query += ' AND provider = $' + (params.length + 1);
      params.push(provider);
    }

    query += ' ORDER BY date DESC';

    const result = await pool.query(query, params);

    res.json({
      statistics: result.rows
    });
  } catch (err) {
    console.error('Error fetching statistics:', err.message);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * POST /api/reservations/statistics/update
 * Update daily statistics (called from message broker)
 */
app.post('/api/reservations/statistics/update', async (req, res) => {
  try {
    const { provider, date } = req.body;

    if (!provider || !date) {
      return res.status(400).json({ error: 'Missing provider or date' });
    }

    const statResult = await pool.query(
      `SELECT 
         COUNT(*) as total_reservations,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_reservations,
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_reservations,
         COALESCE(SUM(actual_kwh), 0) as total_kwh,
         COALESCE(SUM(actual_cost), 0) as total_revenue,
         COALESCE(ROUND(AVG(duration_minutes)), 0) as average_duration_minutes
       FROM reservations 
       WHERE provider = $1 AND DATE(created_at) = $2`,
      [provider, date]
    );

    const stats = statResult.rows[0];

    const result = await pool.query(
      `INSERT INTO reservation_statistics 
       (date, provider, total_reservations, completed_reservations, cancelled_reservations, 
        total_kwh, total_revenue, average_duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (date, provider) DO UPDATE SET
       total_reservations = $3, completed_reservations = $4, cancelled_reservations = $5,
       total_kwh = $6, total_revenue = $7, average_duration_minutes = $8
       RETURNING *`,
      [date, provider, stats.total_reservations, stats.completed_reservations,
       stats.cancelled_reservations, stats.total_kwh, stats.total_revenue,
       stats.average_duration_minutes]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating statistics:', err.message);
    res.status(500).json({ error: 'Failed to update statistics' });
  }
});

/**
 * GET /health
 * Health check
 */
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    
    res.json({
      status: 'ok',
      service: 'reservation-service',
      port: process.env.PORT || 3009,
      database: 'connected',
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      service: 'reservation-service',
      database: 'disconnected',
      error: err.message
    });
  }
});

// ============== SERVER START ==============

const PORT = process.env.PORT || 3009;

const server = app.listen(PORT, () => {
  console.log(`✓ Reservation Service running on port ${PORT}`);
  console.log(`✓ Database: ${process.env.RESERVATIONS_DB_URL || 'postgresql://localhost:5432/reservations_service'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

module.exports = app;
