/**
 * Cache Manager
 * Manages point_id → provider_name mappings
 * 
 * Flow:
 * 1. Initialize: Fetch all points from Points_Service on startup
 * 2. Subscribe: Listen for point update events from RabbitMQ
 * 3. Lookup: Fast local cache lookup with fallback to Points_Service
 */

const axios = require('axios');
const { getPool } = require('./db');

const POINTS_SERVICE_URL = process.env.POINTS_SERVICE_URL || 'http://localhost:3001';

/**
 * Initialize cache from Points_Service
 * Called once at service startup
 */
async function initializeCacheFromPointsService() {
  try {
    console.log(`[CACHE] Initializing from Points_Service (${POINTS_SERVICE_URL}/api/points)...`);

    const response = await axios.get(`${POINTS_SERVICE_URL}/api/points`, {
      timeout: 15000
    });

    const points = Array.isArray(response.data) ? response.data : response.data.points || [];

    if (points.length === 0) {
      console.warn('[CACHE] No points returned from Points_Service');
      return 0;
    }

    const pool = getPool();
    let inserted = 0;

    for (const point of points) {
      try {
        const pointId = point.point_id || point.pointId || point.id;
        const providerName = point.provider_name || point.provider || 'unknown';

        if (!pointId) {
          console.warn('[CACHE] Skipping point without ID:', point);
          continue;
        }

        await pool.query(
          `INSERT INTO points_provider_cache (point_id, provider_name, cached_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE
           provider_name = VALUES(provider_name),
           updated_at = CURRENT_TIMESTAMP`,
          [pointId, providerName]
        );

        inserted++;
      } catch (err) {
        console.error('[CACHE] Error inserting point:', err.message);
      }
    }

    console.log(`✓ Cache initialized with ${inserted} points`);
    return inserted;
  } catch (err) {
    console.error('[CACHE] Initialization error:', err.message);
    throw err;
  }
}

/**
 * Get provider for a point from cache
 * Returns: provider name or null if not found
 */
async function getProviderFromCache(pointId) {
  try {
    if (!pointId) {
      return null;
    }

    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT provider_name FROM points_provider_cache WHERE point_id = ? LIMIT 1',
      [pointId]
    );

    if (rows.length > 0) {
      console.log(`[CACHE-HIT] Point ${pointId} → ${rows[0].provider_name}`);
      return rows[0].provider_name;
    }

    console.log(`[CACHE-MISS] Point ${pointId} not found in cache`);
    return null;
  } catch (err) {
    console.error('[CACHE] Lookup error:', err.message);
    return null;
  }
}

/**
 * Get provider with fallback to Points_Service
 * 1. Try cache first (fast path)
 * 2. If miss or outdated, fetch from Points_Service (slow path)
 * 3. Update cache for future requests
 */
async function getProviderWithFallback(pointId) {
  try {
    // Fast path: check cache
    let provider = await getProviderFromCache(pointId);
    if (provider) {
      return provider;
    }

    // Slow path: fetch from Points_Service
    console.log(`[FALLBACK] Fetching point ${pointId} from Points_Service...`);

    const response = await axios.get(`${POINTS_SERVICE_URL}/api/points/${pointId}`, {
      timeout: 10000
    });

    const point = response.data;
    provider = point.provider_name || point.provider || 'unknown';

    // Update cache
    const pool = getPool();
    await pool.query(
      `INSERT INTO points_provider_cache (point_id, provider_name, cached_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
       provider_name = VALUES(provider_name),
       updated_at = CURRENT_TIMESTAMP`,
      [pointId, provider]
    );

    console.log(`[FALLBACK-SUCCESS] Point ${pointId} → ${provider} (cached)`);
    return provider;
  } catch (err) {
    console.error(`[FALLBACK-ERROR] Could not get provider for point ${pointId}:`, err.message);
    return null;
  }
}

/**
 * Update single point in cache
 * Used when RabbitMQ event arrives
 */
async function updatePointInCache(pointId, providerName) {
  try {
    const pool = getPool();

    await pool.query(
      `INSERT INTO points_provider_cache (point_id, provider_name, cached_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
       provider_name = VALUES(provider_name),
       updated_at = CURRENT_TIMESTAMP`,
      [pointId, providerName]
    );

    console.log(`[CACHE-UPDATE] Point ${pointId} → ${providerName}`);
  } catch (err) {
    console.error('[CACHE-UPDATE-ERROR]:', err.message);
  }
}

/**
 * Update entire cache from Points_Service
 * Called periodically or when bulk update event arrives
 */
async function refreshEntireCache() {
  try {
    console.log('[CACHE-REFRESH] Starting full refresh from Points_Service...');

    const response = await axios.get(`${POINTS_SERVICE_URL}/api/points`, {
      timeout: 15000
    });

    const points = Array.isArray(response.data) ? response.data : response.data.points || [];

    if (points.length === 0) {
      console.warn('[CACHE-REFRESH] No points returned');
      return 0;
    }

    const pool = getPool();
    let updated = 0;

    for (const point of points) {
      try {
        const pointId = point.point_id || point.pointId || point.id;
        const providerName = point.provider_name || point.provider || 'unknown';

        if (!pointId) continue;

        await pool.query(
          `INSERT INTO points_provider_cache (point_id, provider_name, cached_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE
           provider_name = VALUES(provider_name),
           updated_at = CURRENT_TIMESTAMP`,
          [pointId, providerName]
        );

        updated++;
      } catch (err) {
        console.error('[CACHE-REFRESH-ERROR]:', err.message);
      }
    }

    console.log(`✓ Cache refreshed: ${updated} points updated`);
    return updated;
  } catch (err) {
    console.error('[CACHE-REFRESH] Error:', err.message);
    return 0;
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM points_provider_cache'
    );

    return {
      cached_points: rows[0].count,
      timestamp: new Date()
    };
  } catch (err) {
    console.error('[CACHE-STATS]:', err.message);
    return { cached_points: 0, error: err.message };
  }
}

module.exports = {
  initializeCacheFromPointsService,
  getProviderFromCache,
  getProviderWithFallback,
  updatePointInCache,
  refreshEntireCache,
  getCacheStats
};
