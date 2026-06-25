/**
 * Map UI utilities for Frontend Service
 * Handles fetching charging points from Points Service by provider
 */

const axios = require('axios');
const path = require('path');
const { normalizePoint, normalizeReservationEndTime } = require('./plugs_api');

// Dynamically import endpoints from Points Service index.js
let PLUGAPI_POINTS;
let API_POINTS;
try {
  const pointsServicePath = path.join(__dirname, '../../Points_Service/src/index.js');
  const pointsServiceModule = require(pointsServicePath);
  PLUGAPI_POINTS = pointsServiceModule.PLUGAPI_POINTS;
  API_POINTS = pointsServiceModule.API_POINTS;
  
  if (!PLUGAPI_POINTS) {
    throw new Error('PLUGAPI_POINTS not exported from Points Service');
  }
  if (!API_POINTS) {
    throw new Error('API_POINTS not exported from Points Service');
  }
  
  console.log('[map_ui] Successfully imported PLUGAPI_POINTS from Points Service:', PLUGAPI_POINTS);
  console.log('[map_ui] Successfully imported API_POINTS from Points Service:', API_POINTS);
} catch (err) {
  console.warn('[map_ui] Could not import endpoints from Points Service, using defaults:', err.message);
  PLUGAPI_POINTS = '/plugApi/points';
  API_POINTS = '/api/points';
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

/**
 * Fetch all charging points from central Points Service
 * 
 * @param {Object} options - Optional configuration
 * @param {string} options.protocol - HTTP protocol (default: 'http')
 * @param {string} options.host - Docker internal host (default: 'host.docker.internal')
 * @param {number} options.timeout - Request timeout in ms (default: 10000)
 * @param {Object} options.filters - Query filters for points (provider, status, etc.)
 * @returns {Promise<Array>} Array of all charging points from central service
 * @throws {Error} If POINTS_CENTRAL_PORT not configured or request fails
 * 
 * @example
 * // Fetch all points from central
 * const allPoints = await getAllPointsFromCentral();
 * console.log(allPoints.count, allPoints.points);
 * 
 * @example
 * // With filters
 * const filteredPoints = await getAllPointsFromCentral({
 *   filters: { provider: 'redPlug', status: 'available' }
 * });
 * 
 * @example
 * // With custom timeout
 * const pointsWithTimeout = await getAllPointsFromCentral({
 *   timeout: 5000
 * });
 */
async function getAllPointsFromCentral(options = {}) {
  try {
    // Get the central service port from environment
    const centralPort = process.env.POINTS_CENTRAL_PORT;
    
    if (!centralPort) {
      throw new Error(
        'Environment variable POINTS_CENTRAL_PORT is not set'
      );
    }

    // Extract options with defaults
    const protocol = options.protocol || 'http';
    const host = options.host || 'host.docker.internal';
    const timeout = options.timeout || 10000;
    const filters = options.filters || {};

    // Build the URL using API_POINTS endpoint
    let url = `${protocol}://${host}:${centralPort}${API_POINTS}`;

    // Append query parameters if filters provided
    const queryParams = new URLSearchParams();
    if (filters.provider) queryParams.append('provider', filters.provider);
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.avail) queryParams.append('avail', filters.avail);
    if (filters.connectorType) queryParams.append('connectorType', filters.connectorType);
    if (filters.lat && filters.lon && filters.radius) {
      queryParams.append('lat', filters.lat);
      queryParams.append('lon', filters.lon);
      queryParams.append('radius', filters.radius);
    }
    if (filters.limit) queryParams.append('limit', filters.limit);
    if (filters.costMin !== undefined) queryParams.append('costMin', filters.costMin);
    if (filters.costMax !== undefined) queryParams.append('costMax', filters.costMax);
    if (filters.powerMin !== undefined) queryParams.append('powerMin', filters.powerMin);
    if (filters.powerMax !== undefined) queryParams.append('powerMax', filters.powerMax);
    if (filters.type) queryParams.append('type', filters.type);

    if (queryParams.toString()) {
      url += '?' + queryParams.toString();
    }

    console.log(`[getAllPointsFromCentral] Fetching from ${url}`);

    // Make the request
    const response = await axios.get(url, { timeout });

    if (!response.data) {
      throw new Error(`Empty response from central service`);
    }

    console.log(`[getAllPointsFromCentral] Successfully fetched ${response.data.count || 0} points from central service`);

    return response.data;

  } catch (err) {
    const errorMessage = err.response?.data?.error || err.message;
    console.error('[getAllPointsFromCentral] Error fetching from central service:', errorMessage);
    throw err;
  }
}

/**
 * Fetch a specific point from central Points Service
 * 
 * @param {string|number} pointId - The point ID to fetch
 * @param {Object} options - Optional configuration
 * @param {string} options.protocol - HTTP protocol (default: 'http')
 * @param {string} options.host - Docker internal host (default: 'host.docker.internal')
 * @param {number} options.timeout - Request timeout in ms (default: 10000)
 * @returns {Promise<Object>} Point details from central service
 * @throws {Error} If point not found or request fails
 * 
 * @example
 * const point = await getPointFromCentral('3249146');
 * console.log(point.status, point.provider_name);
 */
async function getPointFromCentral(pointId, options = {}) {
  try {
    const centralPort = process.env.POINTS_CENTRAL_PORT;
    
    if (!centralPort) {
      throw new Error('Environment variable POINTS_CENTRAL_PORT is not set');
    }

    const protocol = options.protocol || 'http';
    const host = options.host || 'host.docker.internal';
    const timeout = options.timeout || 10000;

    const url = `${protocol}://${host}:${centralPort}${API_POINTS}/${pointId}`;

    console.log(`[getPointFromCentral] Fetching point ${pointId} from ${url}`);

    const response = await axios.get(url, { timeout });

    if (!response.data) {
      throw new Error(`Point ${pointId} not found in central service`);
    }

    console.log(`[getPointFromCentral] Successfully fetched point ${pointId}`);

    return response.data;

  } catch (err) {
    const errorMessage = err.response?.data?.error || err.message;
    console.error(`[getPointFromCentral] Error fetching point ${pointId}:`, errorMessage);
    throw err;
  }
}

module.exports = {
  getPointsByProvider,
  getAllPoints,
  getAllPointsFromCentral,
  getPointFromCentral,
  PLUGAPI_POINTS,
  API_POINTS,
  PROVIDER_PORT_MAP,
  normalizePoint,
  normalizeReservationEndTime
};
