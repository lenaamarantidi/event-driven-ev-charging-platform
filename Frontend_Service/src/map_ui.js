/**
 * Map UI utilities for Frontend Service
 * Handles fetching charging points from Points Service by provider
 */

const axios = require('axios');
const path = require('path');
const { normalizePoint, normalizeReservationEndTime } = require('./plugs_api');

// Dynamically import PLUGAPI_POINTS from Points Service index.js
let PLUGAPI_POINTS;
try {
  const pointsServicePath = path.join(__dirname, '../../Points_Service/src/index.js');
  const pointsServiceModule = require(pointsServicePath);
  PLUGAPI_POINTS = pointsServiceModule.PLUGAPI_POINTS;
  
  if (!PLUGAPI_POINTS) {
    throw new Error('PLUGAPI_POINTS not exported from Points Service');
  }
  
  console.log('[map_ui] Successfully imported PLUGAPI_POINTS from Points Service:', PLUGAPI_POINTS);
} catch (err) {
  console.warn('[map_ui] Could not import PLUGAPI_POINTS from Points Service, using default:', err.message);
  PLUGAPI_POINTS = '/plugApi/points';
}

// Map provider names/colors to environment variables (all keys lowercase for case-insensitive lookup)
const PROVIDER_PORT_MAP = {
  'red': 'POINTS_RED_PORT',
  'redplug': 'POINTS_RED_PORT',
  'green': 'POINTS_GREEN_PORT',
  'greenplug': 'POINTS_GREEN_PORT',
  'blue': 'POINTS_BLUE_PORT',
  'blueplug': 'POINTS_BLUE_PORT'
};

// Map normalized provider names to plugKey for normalization
const PROVIDER_TO_PLUGKEY = {
  'red': 'redPlug',
  'redplug': 'redPlug',
  'green': 'greenPlug',
  'greenplug': 'greenPlug',
  'blue': 'bluePlug',
  'blueplug': 'bluePlug'
};

/**
 * Fetch charging points from a specific provider/color service
 * 
 * @param {string} provider - Provider name or color (e.g., 'red', 'redPlug', 'blue', 'bluePlug', 'green', 'greenPlug')
 * @param {Object} options - Optional configuration
 * @param {string} options.protocol - HTTP protocol (default: 'http')
 * @param {string} options.host - Docker internal host (default: 'host.docker.internal')
 * @param {number} options.timeout - Request timeout in ms (default: 10000)
 * @param {boolean} options.normalize - Normalize points using normalizePoint() (default: false)
 * @returns {Promise<Object>} Points data from the provider service, optionally normalized
 * @throws {Error} If provider is invalid, port not configured, or request fails
 * 
 * @example
 * // Fetch points by color
 * const redPoints = await getPointsByProvider('red');
 * console.log(redPoints);
 * 
 * @example
 * // Fetch points by plug name
 * const bluePoints = await getPointsByProvider('bluePlug');
 * 
 * @example
 * // With normalization
 * const greenPoints = await getPointsByProvider('green', {
 *   normalize: true
 * });
 * 
 * @example
 * // With custom options
 * const redPoints = await getPointsByProvider('red', {
 *   protocol: 'https',
 *   host: 'localhost',
 *   timeout: 5000,
 *   normalize: true
 * });
 */
async function getPointsByProvider(provider, options = {}) {
  try {
    // Normalize provider name to lowercase for case-insensitive lookup
    const normalizedProvider = String(provider).toLowerCase();
    
    // Get the port environment variable name
    const portEnvVar = PROVIDER_PORT_MAP[normalizedProvider];
    
    if (!portEnvVar) {
      const validProviders = Object.keys(PROVIDER_PORT_MAP).join(', ');
      throw new Error(
        `Invalid provider: "${provider}". Valid providers are: ${validProviders}`
      );
    }

    // Get the port from environment variables
    const port = process.env[portEnvVar];
    
    if (!port) {
      throw new Error(
        `Environment variable ${portEnvVar} is not set for provider "${provider}"`
      );
    }

    // Extract options with defaults
    const protocol = options.protocol || 'http';
    const host = options.host || 'host.docker.internal';
    const timeout = options.timeout || 10000;
    const normalize = options.normalize || false;

    // Build the URL using the imported PLUGAPI_POINTS constant from Points Service
    const url = `${protocol}://${host}:${port}${PLUGAPI_POINTS}`;

    console.log(`[getPointsByProvider] Fetching points from ${provider} at ${url} (normalize: ${normalize})`);

    // Make the request
    const response = await axios.get(url, { timeout });

    // Validate response
    if (!response.data) {
      throw new Error(`Empty response from ${url}`);
    }

    let data = response.data;

    // Normalize points if requested
    if (normalize) {
      const plugKey = PROVIDER_TO_PLUGKEY[normalizedProvider];
      if (plugKey && data.data && Array.isArray(data.data)) {
        console.log(`[getPointsByProvider] Normalizing ${data.data.length} points for ${plugKey}`);
        data.data = data.data.map(point => normalizePoint(point, plugKey));
      }
    }

    console.log(`[getPointsByProvider] Successfully fetched points from ${provider}`);

    return data;

  } catch (err) {
    const errorMessage = err.response?.data?.error || err.message;
    console.error(`[getPointsByProvider] Error fetching points for provider "${provider}":`, errorMessage);
    throw err;
  }
}

/**
 * Fetch charging points from all three providers in parallel
 * 
 * @param {Object} options - Optional configuration (same as getPointsByProvider)
 * @param {boolean} options.normalize - Normalize points (default: false)
 * @returns {Promise<Object>} Object with keys 'red', 'green', 'blue' containing provider data
 * 
 * @example
 * const allPoints = await getAllPoints();
 * console.log(allPoints.red, allPoints.green, allPoints.blue);
 * 
 * @example
 * const allPointsNormalized = await getAllPoints({ normalize: true });
 */
async function getAllPoints(options = {}) {
  try {
    const providers = ['red', 'green', 'blue'];
    const results = {};

    console.log('[getAllPoints] Fetching points from all providers (normalize: ' + (options.normalize || false) + ')...');

    // Fetch all providers in parallel
    const promises = providers.map(provider =>
      getPointsByProvider(provider, options)
        .then(data => {
          results[provider] = { status: 'success', data };
        })
        .catch(err => {
          results[provider] = { status: 'error', error: err.message };
        })
    );

    await Promise.all(promises);

    return results;

  } catch (err) {
    console.error('[getAllPoints] Error in getAllPoints:', err.message);
    throw err;
  }
}

module.exports = {
  getPointsByProvider,
  getAllPoints,
  PLUGAPI_POINTS,
  PROVIDER_PORT_MAP,
  normalizePoint,
  normalizeReservationEndTime
};
