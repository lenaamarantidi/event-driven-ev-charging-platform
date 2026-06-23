/**
 * Analytics Controllers
 * Analytics Service - Provides KPI metrics and reporting
 * 
 * Provides:
 * - Provider analytics (KPI metrics and timeseries)
 * - Global/Operator analytics
 * - Rankings
 * - Billing service integration
 */

const { pool } = require('./db');

/**
 * GET /analytics/providers/:providerId
 * Get provider KPI metrics
 * Returns: totalReservations, successfulReservations, failedReservations, uniqueUsers, successRate
 */
async function getProviderAnalytics(req, res) {
  try {
    const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }

    const numProviderId = parseInt(providerId, 10);
    if (isNaN(numProviderId)) {
      return res.status(400).json({ error: 'Invalid providerId' });
    }

    // Get provider registration date
    const [providerReg] = await pool.query(
      `SELECT createdAt FROM provider_registrations WHERE providerId = ?`,
      [numProviderId]
    );

    // Get aggregated stats from reservation_events
    const [stats] = await pool.query(
      `SELECT
        COUNT(*) as totalReservations,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulReservations,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedReservations,
        COUNT(DISTINCT userId) as uniqueUsers
       FROM reservation_events
       WHERE providerId = ?`,
      [numProviderId]
    );

    const total = stats[0]?.totalReservations || 0;
    const successful = stats[0]?.successfulReservations || 0;
    const failed = stats[0]?.failedReservations || 0;
    const unique = stats[0]?.uniqueUsers || 0;
    const successRate = total > 0 ? ((successful / total) * 100).toFixed(2) : 0;

    return res.json({
      providerId: numProviderId,
      registeredSince: providerReg[0]?.createdAt || null,
      totalReservations: total,
      successfulReservations: successful,
      failedReservations: failed,
      uniqueUsers: unique,
      successRate: parseFloat(successRate)
    });
  } catch (err) {
    console.error('Error in getProviderAnalytics:', err.message);
    return res.status(500).json({ error: 'Failed to fetch provider analytics', details: err.message });
  }
}

/**
 * GET /analytics/providers/:providerId/timeseries
 * Get provider timeseries data (last 6 months)
 * Returns: reservationsPerMonth[], usersPerMonth[]
 */
async function getProviderTimeseries(req, res) {
  try {
    const { providerId } = req.params;
    const { period = '6months' } = req.query;

    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }

    const numProviderId = parseInt(providerId, 10);
    if (isNaN(numProviderId)) {
      return res.status(400).json({ error: 'Invalid providerId' });
    }

    // Get last 6 months of data
    const [timeseries] = await pool.query(
      `SELECT
        DATE_FORMAT(timestamp, '%Y-%m') as month,
        COUNT(*) as reservations,
        COUNT(DISTINCT userId) as uniqueUsers
       FROM reservation_events
       WHERE providerId = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(timestamp, '%Y-%m')
       ORDER BY month ASC`,
      [numProviderId]
    );

    return res.json({
      providerId: numProviderId,
      period: '6months',
      reservationsPerMonth: timeseries.map(row => ({
        month: row.month,
        count: row.reservations
      })),
      usersPerMonth: timeseries.map(row => ({
        month: row.month,
        count: row.uniqueUsers
      }))
    });
  } catch (err) {
    console.error('Error in getProviderTimeseries:', err.message);
    return res.status(500).json({ error: 'Failed to fetch provider timeseries', details: err.message });
  }
}

/**
 * GET /analytics/global
 * Get global/operator analytics
 * Returns: totalUsers, totalProviders, totalReservations, successfulReservations, failedReservations, successRate
 */
async function getGlobalAnalytics(req, res) {
  try {
    // Total users and providers
    const [users] = await pool.query(`SELECT COUNT(*) as total FROM user_registrations`);
    const [providers] = await pool.query(`SELECT COUNT(*) as total FROM provider_registrations`);

    // Reservation stats
    const [reservationStats] = await pool.query(
      `SELECT
        COUNT(*) as totalReservations,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulReservations,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedReservations
       FROM reservation_events`
    );

    const totalUsers = users[0]?.total || 0;
    const totalProviders = providers[0]?.total || 0;
    const totalReservations = reservationStats[0]?.totalReservations || 0;
    const successfulReservations = reservationStats[0]?.successfulReservations || 0;
    const failedReservations = reservationStats[0]?.failedReservations || 0;
    const successRate = totalReservations > 0
      ? ((successfulReservations / totalReservations) * 100).toFixed(2)
      : 0;

    return res.json({
      totalUsers,
      totalProviders,
      totalReservations,
      successfulReservations,
      failedReservations,
      successRate: parseFloat(successRate)
    });
  } catch (err) {
    console.error('Error in getGlobalAnalytics:', err.message);
    return res.status(500).json({ error: 'Failed to fetch global analytics', details: err.message });
  }
}

/**
 * GET /analytics/global/timeseries
 * Get global timeseries data (last 6 months)
 * Returns: reservationsPerMonth[], usersPerMonth[], providersPerMonth[]
 */
async function getGlobalTimeseries(req, res) {
  try {
    const { period = '6months' } = req.query;

    // Reservations and users per month
    const [reservationData] = await pool.query(
      `SELECT
        DATE_FORMAT(timestamp, '%Y-%m') as month,
        COUNT(*) as reservations,
        COUNT(DISTINCT userId) as uniqueUsers
       FROM reservation_events
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(timestamp, '%Y-%m')
       ORDER BY month ASC`
    );

    // Providers per month
    const [providerData] = await pool.query(
      `SELECT
        DATE_FORMAT(createdAt, '%Y-%m') as month,
        COUNT(*) as newProviders
       FROM provider_registrations
       WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
       ORDER BY month ASC`
    );

    return res.json({
      period: '6months',
      reservationsPerMonth: reservationData.map(row => ({
        month: row.month,
        count: row.reservations
      })),
      usersPerMonth: reservationData.map(row => ({
        month: row.month,
        count: row.uniqueUsers
      })),
      providersPerMonth: providerData.map(row => ({
        month: row.month,
        count: row.newProviders
      }))
    });
  } catch (err) {
    console.error('Error in getGlobalTimeseries:', err.message);
    return res.status(500).json({ error: 'Failed to fetch global timeseries', details: err.message });
  }
}

/**
 * GET /analytics/global/rankings
 * Get provider rankings based on reservations in the last week
 * Returns: topProviders[], providerRanking[]
 */
async function getGlobalRankings(req, res) {
  try {
    // Top 3 providers of the last week
    const [topProviders] = await pool.query(
      `SELECT
        providerId,
        providerName,
        COUNT(*) as reservationCount
       FROM reservation_events
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY providerId, providerName
       ORDER BY reservationCount DESC
       LIMIT 3`
    );

    // Full ranking of all providers
    const [allProviders] = await pool.query(
      `SELECT
        providerId,
        providerName,
        COUNT(*) as totalReservations,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulReservations,
        COUNT(DISTINCT userId) as uniqueUsers
       FROM reservation_events
       GROUP BY providerId, providerName
       ORDER BY totalReservations DESC`
    );

    return res.json({
      topProviders: topProviders.map((p, idx) => ({
        rank: idx + 1,
        providerId: p.providerId,
        providerName: p.providerName,
        reservationCount: p.reservationCount
      })),
      providerRanking: allProviders.map((p, idx) => ({
        rank: idx + 1,
        providerId: p.providerId,
        providerName: p.providerName,
        totalReservations: p.totalReservations,
        successfulReservations: p.successfulReservations,
        uniqueUsers: p.uniqueUsers
      }))
    });
  } catch (err) {
    console.error('Error in getGlobalRankings:', err.message);
    return res.status(500).json({ error: 'Failed to fetch global rankings', details: err.message });
  }
}

/**
 * POST /analytics/billing/request
 * Billing Service integration - provide statistics for billing
 * Body: { providerId, billingPeriodStart, billingPeriodEnd }
 * Returns: { providerId, billingPeriodStart, billingPeriodEnd, successfulReservationsCount }
 */
async function getBillingStats(req, res) {
  try {
    const { providerId, billingPeriodStart, billingPeriodEnd } = req.body;

    if (!providerId || !billingPeriodStart || !billingPeriodEnd) {
      return res.status(400).json({ error: 'providerId, billingPeriodStart, and billingPeriodEnd are required' });
    }

    const numProviderId = parseInt(providerId, 10);
    if (isNaN(numProviderId)) {
      return res.status(400).json({ error: 'Invalid providerId' });
    }

    // Get successful reservations count for the billing period
    const [result] = await pool.query(
      `SELECT COUNT(*) as count FROM reservation_events
       WHERE providerId = ?
       AND status = 'success'
       AND DATE(timestamp) >= ?
       AND DATE(timestamp) < ?`,
      [numProviderId, billingPeriodStart, billingPeriodEnd]
    );

    const successfulReservationsCount = result[0]?.count || 0;

    return res.json({
      providerId: numProviderId,
      billingPeriodStart,
      billingPeriodEnd,
      successfulReservationsCount
    });
  } catch (err) {
    console.error('Error in getBillingStats:', err.message);
    return res.status(500).json({ error: 'Failed to fetch billing stats', details: err.message });
  }
}

/**
 * GET /health
 * Health check endpoint
 */
async function healthCheck(req, res) {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    return res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Health check failed:', err.message);
    return res.status(503).json({ status: 'unhealthy', error: err.message });
  }
}

/**
 * Export provider logs
 * GET /analytics/providers/:providerId/export
 */
async function exportProviderLogs(req, res) {
  try {
    const { providerId } = req.params;
    const { format = 'json', startDate, endDate } = req.query;

    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }

    const numProviderId = parseInt(providerId, 10);
    if (isNaN(numProviderId)) {
      return res.status(400).json({ error: 'Invalid providerId' });
    }

    let query = `SELECT * FROM reservation_events WHERE providerId = ?`;
    const params = [numProviderId];

    if (startDate) {
      query += ` AND DATE(timestamp) >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND DATE(timestamp) < ?`;
      params.push(endDate);
    }

    query += ` ORDER BY timestamp DESC`;

    const [data] = await pool.query(query, params);

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['reservationId', 'providerId', 'userId', 'pointId', 'status', 'timestamp'];
      const csv = [headers.join(',')];
      data.forEach(row => {
        csv.push([row.reservationId, row.providerId, row.userId, row.pointId || '', row.status, row.timestamp].join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="provider_${numProviderId}_logs.csv"`);
      return res.send(csv.join('\n'));
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="provider_${numProviderId}_logs.json"`);
      return res.json(data);
    }
  } catch (err) {
    console.error('Error in exportProviderLogs:', err.message);
    return res.status(500).json({ error: 'Failed to export logs', details: err.message });
  }
}

module.exports = {
  getProviderAnalytics,
  getProviderTimeseries,
  getGlobalAnalytics,
  getGlobalTimeseries,
  getGlobalRankings,
  getBillingStats,
  exportProviderLogs,
  healthCheck
};
