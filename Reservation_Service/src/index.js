/**
 * Reservation Service
 * 
 * Διαχειρίζει κρατήσεις σημείων φόρτισης
 * Αποθήκευση:
 * - Κρατήσεις χρήστη
 * - Ιστορικό κρατήσεων
 * - Δεσμευμένο χρόνο για κάθε σημείο
 * - Λογαριασμό τιμολόγησης ανά κράτηση
 */

const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// ============== DATABASE CONFIGURATION ==============
const pool = new Pool({
  connectionString: process.env.RESERVATIONS_DB_URL || 'postgresql://postgres:password@localhost:5432/reservations_service',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ============== DATABASE INITIALIZATION ==============

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        point_id VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL CHECK (provider IN ('redPlug', 'greenPlug', 'bluePlug')),
        external_reservation_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'active', 'completed', 'cancelled')),
        reserved_from TIMESTAMP NOT NULL,
        reserved_until TIMESTAMP NOT NULL,
        duration_minutes INTEGER,
        requested_duration_minutes INTEGER,
        estimated_kwh DECIMAL(10, 2),
        estimated_cost DECIMAL(10, 2),
        actual_kwh DECIMAL(10, 2),
        actual_cost DECIMAL(10, 2),
        payment_status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        remarks TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_id ON reservations(user_id);
      CREATE INDEX IF NOT EXISTS idx_point_id ON reservations(point_id);
      CREATE INDEX IF NOT EXISTS idx_provider ON reservations(provider);
      CREATE INDEX IF NOT EXISTS idx_status ON reservations(status);
      CREATE INDEX IF NOT EXISTS idx_reserved_from ON reservations(reserved_from);
      CREATE INDEX IF NOT EXISTS idx_payment_status ON reservations(payment_status);
      
      CREATE TABLE IF NOT EXISTS reservation_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        status_before VARCHAR(50),
        status_after VARCHAR(50),
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_log_reservation ON reservation_log(reservation_id);
      CREATE INDEX IF NOT EXISTS idx_log_event ON reservation_log(event_type);
      
      CREATE TABLE IF NOT EXISTS reservation_statistics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        provider VARCHAR(50) NOT NULL,
        total_reservations INTEGER,
        completed_reservations INTEGER,
        cancelled_reservations INTEGER,
        total_kwh DECIMAL(15, 2),
        total_revenue DECIMAL(15, 2),
        average_duration_minutes INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stats ON reservation_statistics(date, provider);
    `);

    console.log('✓ Reservations database initialized successfully');
  } catch (err) {
    console.error('✗ Database initialization error:', err.message);
  } finally {
    client.release();
  }
}

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
