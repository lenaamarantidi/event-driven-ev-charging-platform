/**
 * Reserve UI utilities for Frontend Service
 * Handles point reservation flows and API communication
 */

const axios = require('axios');
const path = require('path');

// Dynamically import endpoints from Points Service index.js
let API_POINTS_RESERVE;
let API_POINTS_RESERVE_MINUTES;
try {
  // Try multiple paths: local development and Docker
  let pointsServicePath;
  try {
    // Local development
    pointsServicePath = path.join(__dirname, '../../Points_Service/src/index.js');
    require.resolve(pointsServicePath);
  } catch {
    // Docker: Points Service is in /app/Points_Service
    pointsServicePath = '/app/Points_Service/src/index.js';
    require.resolve(pointsServicePath);
  }
  const pointsServiceModule = require(pointsServicePath);
  API_POINTS_RESERVE = pointsServiceModule.API_POINTS_RESERVE;
  API_POINTS_RESERVE_MINUTES = pointsServiceModule.API_POINTS_RESERVE_MINUTES;
  
  if (!API_POINTS_RESERVE) {
    throw new Error('API_POINTS_RESERVE not exported from Points Service');
  }
  if (!API_POINTS_RESERVE_MINUTES) {
    throw new Error('API_POINTS_RESERVE_MINUTES not exported from Points Service');
  }
  
  console.log('[reserve_ui] Successfully imported API_POINTS_RESERVE:', API_POINTS_RESERVE);
  console.log('[reserve_ui] Successfully imported API_POINTS_RESERVE_MINUTES:', API_POINTS_RESERVE_MINUTES);
} catch (err) {
  console.warn('[reserve_ui] Could not import endpoints from Points Service, using defaults:', err.message);
  API_POINTS_RESERVE = '/api/points/:pointId/reserve';
  API_POINTS_RESERVE_MINUTES = '/api/points/:pointId/reserve/:minutes';
}

/**
 * Reserve a charging point for a user
 * 
 * @param {string|number} pointId - The point ID to reserve
 * @param {Object} options - Optional configuration
 * @param {number} options.minutes - Duration of reservation in minutes (optional)
 * @param {string} options.protocol - HTTP protocol (default: 'http')
 * @param {string} options.host - Docker internal host (default: 'host.docker.internal')
 * @param {number} options.timeout - Request timeout in ms (default: 10000)
 * @returns {Promise<Object>} Reservation response from central Points Service
 * @throws {Error} If reservation fails
 * 
 * @example
 * // Reserve a point without duration
 * const result = await reservePoint('3249146');
 * console.log(result);
 * 
 * @example
 * // Reserve a point for 30 minutes
 * const result = await reservePoint('3249146', { minutes: 30 });
 * console.log(result);
 */
async function reservePoint(pointId, options = {}) {
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
    const minutes = options.minutes;

    // Build the URL based on whether minutes are specified
    let url;
    if (minutes) {
      // Use endpoint with duration: /api/points/:pointId/reserve/:minutes
      url = `${protocol}://${host}:${centralPort}${API_POINTS_RESERVE_MINUTES}`
        .replace(':pointId', pointId)
        .replace(':minutes', minutes);
    } else {
      // Use endpoint without duration: /api/points/:pointId/reserve
      url = `${protocol}://${host}:${centralPort}${API_POINTS_RESERVE}`
        .replace(':pointId', pointId);
    }

    console.log(`[reservePoint] Reserving point ${pointId} at ${url}${minutes ? ` for ${minutes} minutes` : ''}`);

    // Make the request (POST)
    const response = await axios.post(url, {}, { timeout });

    if (!response.data) {
      throw new Error(`Empty response from central service`);
    }

    console.log(`[reservePoint] Successfully reserved point ${pointId}`);

    return response.data;

  } catch (err) {
    const errorMessage = err.response?.data?.error || err.message;
    console.error(`[reservePoint] Error reserving point ${pointId}:`, errorMessage);
    throw err;
  }
}

/**
 * Cancel/release a reservation for a charging point
 * 
 * @param {string|number} pointId - The point ID to cancel reservation for
 * @param {Object} options - Optional configuration
 * @param {string} options.protocol - HTTP protocol (default: 'http')
 * @param {string} options.host - Docker internal host (default: 'host.docker.internal')
 * @param {number} options.timeout - Request timeout in ms (default: 10000)
 * @returns {Promise<Object>} Cancellation response from central Points Service
 * @throws {Error} If cancellation fails
 * 
 * @example
 * const result = await cancelReservation('3249146');
 * console.log(result);
 */
async function cancelReservation(pointId, options = {}) {
  try {
    const centralPort = process.env.POINTS_CENTRAL_PORT;
    
    if (!centralPort) {
      throw new Error(
        'Environment variable POINTS_CENTRAL_PORT is not set'
      );
    }

    const protocol = options.protocol || 'http';
    const host = options.host || 'host.docker.internal';
    const timeout = options.timeout || 10000;

    const url = `${protocol}://${host}:${centralPort}/api/points/${pointId}/cancel`;

    console.log(`[cancelReservation] Canceling reservation for point ${pointId} at ${url}`);

    const response = await axios.post(url, {}, { timeout });

    if (!response.data) {
      throw new Error(`Empty response from central service`);
    }

    console.log(`[cancelReservation] Successfully canceled reservation for point ${pointId}`);

    return response.data;

  } catch (err) {
    const errorMessage = err.response?.data?.error || err.message;
    console.error(`[cancelReservation] Error canceling reservation for point ${pointId}:`, errorMessage);
    throw err;
  }
}

module.exports = {
  reservePoint,
  cancelReservation,
  API_POINTS_RESERVE,
  API_POINTS_RESERVE_MINUTES
};
