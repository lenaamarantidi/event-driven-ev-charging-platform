/**
 * Reservation Service (Port 3009)
 * * Unified API for reserving EV charging points across multiple providers
 * Publishes reservation_successful events to RabbitMQ for Points service and daily analytics batches to Analytics service
 */

const express = require('express');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
app.use(express.json());

// Import modules
const { initializeDatabase, testDatabaseConnection, getPool } = require('./db');
const { connectWithRetry, publishReservationEvent, publishAnalyticsDaily } = require('./rabbitmq');
const { createReservation } = require('./controllers');


// To σωστό port σύμφωνα με το docker-compose.yml
const PORT = process.env.PORT || 3009;

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
    status: 'ok',
    service: 'Reservation_Service',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

/**
 * Unified Reservation API
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
    let providerId = 1;
    if (providerName === 'greenPlug') providerId = 2;
    if (providerName === 'bluePlug') providerId = 3;

    const reservationDetails = result.data;
    const reservationEndTime = reservationDetails?.reservationendtime || reservationDetails?.reservedUntil || reservationDetails?.reservationEnd || reservationDetails?.reservation_end_time || null;
    const reservationStatus = reservationDetails?.status || reservationDetails?.state || reservationDetails?.currentStatus || 'reserved';

    // Publish to RabbitMQ (async, non-blocking)
    try {
      await publishReservationEvent({
        reservationId,
        providerId,
        providerName,
        pointId,
        duration,
        timestamp: new Date().toISOString(),
        reservationDetails,
        reservation_end_time: reservationEndTime,
        reservation_status: reservationStatus
      });
      console.log(`[RABBITMQ] Event published for reservation ${reservationId}`);
    } catch (rabbitmqError) {
      console.error(`[RABBITMQ] Publishing error (non-blocking): ${rabbitmqError.message}`);
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
      message: 'Reservation successful. Event published.'
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
      SELECT * FROM reservation_logs ORDER BY created_at DESC LIMIT 50
    `);

    res.json({ success: true, count: rows.length, reservations: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    res.json({ success: true, reservation: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SERVER STARTUP ==============

function runDailyAnalyticsBatch() {
  const runAtHour = Number(process.env.DAILY_ANALYTICS_HOUR || 2); // 02:00 local by default
  const pool = getPool();

  const now = new Date();
  const next = new Date(now);
  next.setHours(runAtHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delayMs = next.getTime() - now.getTime();

  setTimeout(async () => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];

      // Fetch *all* reservation attempts for the day (successful + unsuccessful)
      const [rows] = await pool.query(
        `SELECT reservation_id, provider_id, provider_name, point_id, duration, status, created_at,
                reservation_details, user_id
         FROM reservation_logs
         WHERE DATE(created_at) = ?
         ORDER BY created_at ASC`,
        [dateStr]
      );

      // Send full daily reservation logs list ONLY (no aggregates/sums)
      const dailyLogs = rows.map(r => ({
        reservationId: r.reservation_id,
        providerId: r.provider_id,
        providerName: r.provider_name,
        pointId: r.point_id,
        duration: r.duration,
        status: r.status,
        userId: r.user_id,
        createdAt: r.created_at,
        reservationDetails: r.reservation_details
      }));

      await publishAnalyticsDaily({
        date: dateStr,
        reservationLogs: dailyLogs
      });


      // console.log(`[DailyAnalyticsBatch] Published for date=${dateStr}`);

    } catch (err) {
      console.error('[DailyAnalyticsBatch] failed:', err.message);
    } finally {
      // schedule next run (24h)
      setTimeout(() => runDailyAnalyticsBatch(), 24 * 60 * 60 * 1000);
    }
  }, delayMs);
}

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    await testDatabaseConnection();

    // Connect to RabbitMQ
    await connectWithRetry();

    // Start daily analytics job
    runDailyAnalyticsBatch();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n✓ Reservation_Service started on http://localhost:${PORT}`);
      console.log('✓ RabbitMQ: Connected');
      console.log(`✓ Daily analytics batch scheduled (hour=${process.env.DAILY_ANALYTICS_HOUR || 2})`);
    });
  } catch (error) {
    console.error('✗ Startup error:', error.message);
    console.error('Full error details:', error);
    process.exit(1);
  }
}

startServer();

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

