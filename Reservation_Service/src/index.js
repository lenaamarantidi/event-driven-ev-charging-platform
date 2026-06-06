/**
 * Reservation Service (Port 3009)
 * * Unified API for reserving EV charging points across multiple providers
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

// To σωστό port σύμφωνα με το docker-compose.yml
const PORT = process.env.PORT || 3009;

// ============== MIDDLEWARE ==============

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })}] ${req.method} ${req.path}`);
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
    timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
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

    // Publish to RabbitMQ (async, non-blocking)
    try {
      await publishReservationEvent({
        reservationId,
        providerId,
        providerName,
        pointId,
        duration,
        timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
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
      console.log(`✓ RabbitMQ: Connected`);
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

startServer();