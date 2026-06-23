/**
 * Reservation Service (Port 3009)
 * * Unified API for reserving EV charging points across multiple providers
 * Publishes reservation_successful events to RabbitMQ for Points service and reservation.completed events to Analytics service
 */

const express = require('express');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
app.use(express.json());

// Import modules
const { initializeDatabase, testDatabaseConnection, getPool } = require('./db');
const { connectWithRetry, publishReservationEvent, publishReservationCompleted, publishAnalyticsDaily, requestPointLookup, requestAdapterReservation } = require('./rabbitmq');
const { logReservation } = require('./db');


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

function buildReservationResponse(pointId, status, reservationEndTime) {
  return {
    pointid: String(pointId),
    status: String(status || 'failed'),
    reservationendtime: String(reservationEndTime || '1970-01-01 00:00')
  };
}

function formatDateTimeForSpec(date) {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);

  const getPart = (type) => parts.find((p) => p.type === type)?.value || '';
  const yyyy = getPart('year');
  const mm = getPart('month');
  const dd = getPart('day');
  const hh = getPart('hour');
  const min = getPart('minute');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function normalizeProviderName(value) {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'redplug') return 'redPlug';
  if (raw === 'greenplug') return 'greenPlug';
  if (raw === 'blueplug') return 'bluePlug';
  return null;
}

async function handleReservationRequest({ pointId, minutes, userId, providerNameFromBody }) {
  const reservationId = uuidv4();
  const duration = Number(minutes ?? 60);

  if (!Number.isFinite(duration) || duration < 1) {
    throw new Error('minutes must be an integer >= 1');
  }

  let providerName = normalizeProviderName(providerNameFromBody);
  let pointSnapshot = null;
  let providerFromLookup = null;

  const lookup = await requestPointLookup(pointId);
  if (!lookup?.found) {
    console.warn(`[RESERVE] Point lookup miss pointId=${pointId}`);
    return {
      success: false,
      reservationId,
      providerName: null,
      reservation: buildReservationResponse(pointId, 'not_found', '1970-01-01 00:00'),
      error: 'Point not found in Points Service'
    };
  }

  providerFromLookup = normalizeProviderName(lookup?.point?.provider_name || lookup?.point?.providerName || null);
  pointSnapshot = lookup?.point || null;

  if (providerName && providerFromLookup && providerName !== providerFromLookup) {
    console.warn(`[RESERVE] Provider mismatch pointId=${pointId} requestedProvider=${providerName} lookupProvider=${providerFromLookup}`);
    return {
      success: false,
      reservationId,
      providerName: providerFromLookup,
      reservation: buildReservationResponse(pointId, 'failed', '1970-01-01 00:00'),
      error: `Provider mismatch for point '${pointId}': requested=${providerName}, expected=${providerFromLookup}`
    };
  }

  providerName = providerFromLookup || providerName;
  console.log(`[RESERVE] Routing reservation pointId=${pointId} provider=${providerName} duration=${duration}`);

  if (!providerName || !['redPlug', 'greenPlug', 'bluePlug'].includes(providerName)) {
    throw new Error('Unable to determine provider for point');
  }

  const adapterResult = await requestAdapterReservation(providerName, pointId, duration, userId);
  console.log(`[RESERVE] Adapter response pointId=${pointId} provider=${providerName} success=${Boolean(adapterResult?.success)} status=${adapterResult?.reservation?.status || 'failed'}`);
  const normalized = adapterResult?.reservation || buildReservationResponse(pointId, 'failed', '1970-01-01 00:00');

  const status = String(normalized?.status || 'failed');
  const reservationEndTime = status === 'reserved'
    ? formatDateTimeForSpec(new Date(Date.now() + Math.min(60, duration) * 60 * 1000))
    : '1970-01-01 00:00';
  const successful = status === 'reserved';

  await logReservation({
    reservationId,
    providerId: providerName === 'greenPlug' ? 2 : providerName === 'bluePlug' ? 3 : 1,
    providerName,
    pointId,
    duration,
    status: successful ? 'confirmed' : 'failed',
    details: {
      adapterResult,
      reservation: normalized,
      pointSnapshot,
    },
    userId
  });

  if (successful) {
    await publishReservationEvent({
      reservationId,
      providerId: providerName === 'greenPlug' ? 2 : providerName === 'bluePlug' ? 3 : 1,
      providerName,
      pointId,
      duration,
      timestamp: new Date().toISOString(),
      reservationDetails: normalized,
      reservation_end_time: reservationEndTime,
      reservation_status: status
    });
  }

  // Publish reservation_completed event to Analytics Service for both success and failure cases
  await publishReservationCompleted({
    reservationId,
    providerId: providerName === 'greenPlug' ? 2 : providerName === 'bluePlug' ? 3 : 1,
    providerName,
    userId,
    pointId,
    status: successful ? 'success' : 'failed',
    timestamp: new Date().toISOString()
  });

  return {
    success: successful,
    reservationId,
    providerName,
    reservation: buildReservationResponse(pointId, status, reservationEndTime),
    error: successful ? null : (adapterResult?.error || 'Reservation failed')
  };
}

/**
 * Unified Reservation API (body-based, backward-compatible)
 */
app.post('/api/reserve', async (req, res) => {
  try {
    const { providerName, pointId, duration, minutes, userId } = req.body;

    if (!pointId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: pointId'
      });
    }

    const result = await handleReservationRequest({
      pointId,
      minutes: minutes ?? duration,
      userId,
      providerNameFromBody: providerName || null
    });

    return res.status(result.success ? 200 : 409).json({
      reservationId: result.reservationId,
      providerName: result.providerName,
      ...result.reservation,
      ...(result.error ? { error: result.error } : {})
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
 * Frontend API: POST /reserve/:id/:minutes
 */
app.post('/reserve/:id/:minutes', async (req, res) => {
  try {
    const pointId = req.params.id;
    const minutes = Number(req.params.minutes);
    const userId = req.body?.userId || null;

    const result = await handleReservationRequest({ pointId, minutes, userId, providerNameFromBody: null });
    return res.status(200).json(result.reservation);
  } catch (error) {
    console.error('[RESERVE path] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Frontend API: POST /reserve/:id (defaults to 60 minutes)
 */
app.post('/reserve/:id', async (req, res) => {
  try {
    const pointId = req.params.id;
    const minutes = Number(req.body?.minutes ?? 60);
    const userId = req.body?.userId || null;

    const result = await handleReservationRequest({ pointId, minutes, userId, providerNameFromBody: null });
    return res.status(200).json(result.reservation);
  } catch (error) {
    console.error('[RESERVE path default] Error:', error.message);
    return res.status(500).json({ error: error.message });
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

