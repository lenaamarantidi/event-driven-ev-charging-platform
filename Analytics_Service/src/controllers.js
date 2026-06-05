/**
 * Analytics Controllers
 * UC04: View own analytics
 * 
 * Provides aggregated analytics filtered by provider_id
 */

const { pool } = require('./db');

/**
 * GET /api/analytics/provider/:providerId
 * Get aggregated analytics for a specific provider
 * Returns counts of searches, point views, and reservations
 */
async function getProviderAnalytics(req, res) {
  try {
    const { providerId } = req.params;
    const { period = 'monthly', startDate, endDate } = req.query;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);

    // Determine date range
    let dateFrom, dateTo;

    if (startDate && endDate) {
      dateFrom = new Date(startDate);
      dateTo = new Date(endDate);
    } else if (period === 'daily') {
      const today = new Date();
      dateFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      dateTo = new Date(dateFrom.getTime() + 24 * 60 * 60 * 1000);
    } else if (period === 'weekly') {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      dateFrom = new Date(today.setDate(diff));
      dateTo = new Date(dateFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else { // monthly
      const today = new Date();
      dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
      dateTo = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    }

    // Get aggregated counts from analytics_logs
    const [aggregated] = await pool.query(
      `SELECT 
        action_type,
        COUNT(*) as count
       FROM analytics_logs
       WHERE provider_id = ? AND timestamp >= ? AND timestamp < ?
       GROUP BY action_type`,
      [parsedProviderId, dateFrom, dateTo]
    );

    // Get daily breakdown
    const [dailyData] = await pool.query(
      `SELECT 
        date,
        searches_count,
        point_views_count,
        reservations_count
       FROM analytics_daily
       WHERE provider_id = ? AND date >= ? AND date < ?
       ORDER BY date DESC`,
      [
        parsedProviderId,
        dateFrom.toISOString().split('T')[0],
        dateTo.toISOString().split('T')[0]
      ]
    );

    // Process aggregated data
    const stats = {
      searches: 0,
      point_views: 0,
      reservations: 0
    };

    aggregated.forEach(row => {
      if (row.action_type === 'search_performed') {
        stats.searches = row.count;
      } else if (row.action_type === 'point_viewed') {
        stats.point_views = row.count;
      } else if (row.action_type === 'reservation_made') {
        stats.reservations = row.count;
      }
    });

    return res.json({
      provider_id: parsedProviderId,
      period,
      date_range: {
        from: dateFrom.toISOString().split('T')[0],
        to: dateTo.toISOString().split('T')[0]
      },
      summary: {
        total_searches: stats.searches,
        total_point_views: stats.point_views,
        total_reservations: stats.reservations
      },
      daily_breakdown: dailyData,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error in getProviderAnalytics:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch analytics',
      message: err.message
    });
  }
}

/**
 * GET /api/analytics/provider/:providerId/daily
 * Get detailed daily breakdown for a provider
 */
async function getProviderDailyAnalytics(req, res) {
  try {
    const { providerId } = req.params;
    const { limit = 30, offset = 0 } = req.query;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);
    const parsedLimit = Math.min(parseInt(limit, 10) || 30, 365);
    const parsedOffset = parseInt(offset, 10) || 0;

    const [data] = await pool.query(
      `SELECT 
        date,
        searches_count,
        point_views_count,
        reservations_count,
        last_updated
       FROM analytics_daily
       WHERE provider_id = ?
       ORDER BY date DESC
       LIMIT ? OFFSET ?`,
      [parsedProviderId, parsedLimit, parsedOffset]
    );

    // Calculate totals
    const totals = {
      searches: 0,
      point_views: 0,
      reservations: 0
    };

    data.forEach(row => {
      totals.searches += row.searches_count || 0;
      totals.point_views += row.point_views_count || 0;
      totals.reservations += row.reservations_count || 0;
    });

    return res.json({
      provider_id: parsedProviderId,
      totals,
      daily_records: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error in getProviderDailyAnalytics:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch daily analytics',
      message: err.message
    });
  }
}

/**
 * GET /api/analytics/global
 * Get global analytics (all providers combined)
 * Professor's instruction: SELECT * vs SELECT * WHERE provider_id = ?
 */
async function getGlobalAnalytics(req, res) {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;

    // Determine date range
    let dateFrom, dateTo;

    if (startDate && endDate) {
      dateFrom = new Date(startDate);
      dateTo = new Date(endDate);
    } else if (period === 'daily') {
      const today = new Date();
      dateFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      dateTo = new Date(dateFrom.getTime() + 24 * 60 * 60 * 1000);
    } else if (period === 'weekly') {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      dateFrom = new Date(today.setDate(diff));
      dateTo = new Date(dateFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else { // monthly
      const today = new Date();
      dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
      dateTo = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    }

    // Get aggregated counts for ALL providers
    const [aggregated] = await pool.query(
      `SELECT 
        action_type,
        COUNT(*) as count
       FROM analytics_logs
       WHERE timestamp >= ? AND timestamp < ?
       GROUP BY action_type`,
      [dateFrom, dateTo]
    );

    // Get provider breakdown
    const [providerBreakdown] = await pool.query(
      `SELECT 
        provider_id,
        action_type,
        COUNT(*) as count
       FROM analytics_logs
       WHERE timestamp >= ? AND timestamp < ?
       GROUP BY provider_id, action_type
       ORDER BY provider_id, action_type`,
      [dateFrom, dateTo]
    );

    // Process aggregated data
    const stats = {
      searches: 0,
      point_views: 0,
      reservations: 0
    };

    aggregated.forEach(row => {
      if (row.action_type === 'search_performed') {
        stats.searches = row.count;
      } else if (row.action_type === 'point_viewed') {
        stats.point_views = row.count;
      } else if (row.action_type === 'reservation_made') {
        stats.reservations = row.count;
      }
    });

    return res.json({
      scope: 'global',
      period,
      date_range: {
        from: dateFrom.toISOString().split('T')[0],
        to: dateTo.toISOString().split('T')[0]
      },
      summary: {
        total_searches: stats.searches,
        total_point_views: stats.point_views,
        total_reservations: stats.reservations
      },
      provider_breakdown: providerBreakdown,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error in getGlobalAnalytics:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch global analytics',
      message: err.message
    });
  }
}

/**
 * UC08: Export own logs
 * GET /api/analytics/provider/:providerId/export
 * Download activity logs as CSV file
 * 
 * Provider manager can download log file with activities concerning their points
 */
async function exportProviderLogs(req, res) {
  try {
    const { providerId } = req.params;
    const { format = 'csv', startDate, endDate } = req.query;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);

    // Determine date range
    let dateFrom = startDate ? new Date(startDate) : null;
    let dateTo = endDate ? new Date(endDate) : new Date();

    if (!dateFrom) {
      // Default: last 30 days
      dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Fetch all logs for the provider within date range
    const [logs] = await pool.query(
      `SELECT 
        id,
        provider_id,
        action_type,
        user_id,
        point_id,
        session_id,
        timestamp,
        details
       FROM analytics_logs
       WHERE provider_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp DESC`,
      [parsedProviderId, dateFrom, dateTo]
    );

    if (format.toLowerCase() === 'csv') {
      // Generate CSV
      let csv = 'Log ID,Provider ID,Action Type,User ID,Point ID,Session ID,Timestamp,Details\n';
      
      logs.forEach(log => {
        const timestamp = log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp;
        const details = log.details ? log.details.replace(/"/g, '""') : '';
        csv += `"${log.id}","${log.provider_id}","${log.action_type}","${log.user_id || ''}","${log.point_id || ''}","${log.session_id || ''}","${timestamp}","${details}"\n`;
      });

      // Send as file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="provider_${parsedProviderId}_logs_${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csv);

    } else if (format.toLowerCase() === 'json') {
      // Generate JSON
      return res.json({
        provider_id: parsedProviderId,
        period: {
          from: dateFrom.toISOString().split('T')[0],
          to: dateTo.toISOString().split('T')[0]
        },
        total_records: logs.length,
        logs: logs,
        generated_at: new Date().toISOString()
      });

    } else {
      return res.status(400).json({
        error: 'Invalid format. Use "csv" or "json"'
      });
    }

  } catch (err) {
    console.error('Error in exportProviderLogs:', err.message);
    return res.status(500).json({
      error: 'Failed to export logs',
      message: err.message
    });
  }
}

/**
 * UC04 Extension: Request Invoice Generation
 * POST /api/analytics/provider/:providerId/request-invoice
 * Provider can request invoice generation from the system
 */
async function requestInvoiceGeneration(req, res) {
  try {
    const { providerId } = req.params;
    const { period = 'monthly', startDate, endDate } = req.body;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);

    // Determine date range based on period
    let dateFrom, dateTo;

    if (startDate && endDate) {
      dateFrom = new Date(startDate);
      dateTo = new Date(endDate);
    } else if (period === 'monthly') {
      const today = new Date();
      dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
      dateTo = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    } else if (period === 'weekly') {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      dateFrom = new Date(today.setDate(diff));
      dateTo = new Date(dateFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    // Count actions in the period for invoice basis
    const [actionCounts] = await pool.query(
      `SELECT 
        action_type,
        COUNT(*) as count
       FROM analytics_logs
       WHERE provider_id = ? AND timestamp >= ? AND timestamp <= ?
       GROUP BY action_type`,
      [parsedProviderId, dateFrom, dateTo]
    );

    // Return invoice-ready data
    return res.json({
      success: true,
      message: 'Invoice generation requested',
      provider_id: parsedProviderId,
      period,
      date_range: {
        from: dateFrom.toISOString().split('T')[0],
        to: dateTo.toISOString().split('T')[0]
      },
      action_summary: actionCounts,
      total_actions: actionCounts.reduce((sum, row) => sum + row.count, 0),
      status: 'ready_for_billing',
      next_step: 'Call Billing_Service to generate invoice',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Error in requestInvoiceGeneration:', err.message);
    return res.status(500).json({
      error: 'Failed to request invoice generation',
      message: err.message
    });
  }
}

/**
 * Health check endpoint
 */
async function healthCheck(req, res) {
  try {
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM analytics_logs');
    const [providerRows] = await pool.query('SELECT COUNT(DISTINCT provider_id) AS total FROM analytics_logs');

    return res.json({
      status: 'healthy',
      service: 'analytics-service',
      port: process.env.PORT || 3102,
      database: process.env.DB_NAME || 'analytics_db',
      totalEvents: Number(countRows[0].total || 0),
      totalProviders: Number(providerRows[0].total || 0),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'analytics-service',
      message: err.message
    });
  }
}

module.exports = {
  getProviderAnalytics,
  getProviderDailyAnalytics,
  getGlobalAnalytics,
  exportProviderLogs,
  requestInvoiceGeneration,
  healthCheck
};
