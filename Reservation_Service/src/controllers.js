/**
 * Controllers - Provider Adapter Logic
 * 
 * Maps unified reservation request to provider-specific APIs:
 * - redPlug: POST /redPlug/api/reserve/{pointid}/{minutes}
 * - greenPlug: POST /greenPlug/api/chargingPoints/{pointid}/reservations
 * - bluePlug: POST /bluePlug/api/location/{pointid}/hold?minutes={minutes}
 */

const axios = require('axios');
const { logReservation } = require('./db');

const PROVIDER_CONFIG = {
  redPlug: {
    id: 1,
    baseUrl: process.env.REDPLUG_BASE_URL || 'http://localhost:8001',
    apiKey: process.env.REDPLUG_API_KEY || 'redplug-key-123',
    timeout: 10000
  },
  greenPlug: {
    id: 2,
    baseUrl: process.env.GREENPLUG_BASE_URL || 'http://localhost:8002',
    apiKey: process.env.GREENPLUG_API_KEY || 'greenplug-key-123',
    timeout: 10000
  },
  bluePlug: {
    id: 3,
    baseUrl: process.env.BLUEPLUG_BASE_URL || 'http://localhost:8003',
    apiKey: process.env.BLUEPLUG_API_KEY || 'blueplug-key-123',
    timeout: 10000
  }
};

/**
 * Create Reservation - Main controller
 * Maps unified API to provider-specific endpoints
 */
async function createReservation(params) {
  const { reservationId, providerName, pointId, duration, userId } = params;

  try {
    // Validate provider
    if (!PROVIDER_CONFIG[providerName]) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    const config = PROVIDER_CONFIG[providerName];
    let response;

    console.log(`[${providerName}] Making API call for point ${pointId} with ${duration} minutes`);

    // Provider-specific API calls
    if (providerName === 'redPlug') {
      response = await reserveRedPlug(config, pointId, duration);
    } else if (providerName === 'greenPlug') {
      response = await reserveGreenPlug(config, pointId, duration);
    } else if (providerName === 'bluePlug') {
      response = await reserveBluePlug(config, pointId, duration);
    }

    // Log successful reservation
    await logReservation({
      reservationId,
      providerId: config.id,
      providerName,
      pointId,
      duration,
      status: 'confirmed',
      details: response,
      userId
    });

    return {
      success: true,
      data: response,
      message: `Reservation confirmed with ${providerName}`
    };

  } catch (error) {
    console.error(`[${providerName}] Reservation failed:`, error.message);

    // Log failed reservation
    try {
      const config = PROVIDER_CONFIG[providerName];
      await logReservation({
        reservationId,
        providerId: config?.id || 0,
        providerName,
        pointId,
        duration,
        status: 'failed',
        details: { error: error.message },
        userId
      });
    } catch (logError) {
      console.error('Failed to log reservation error:', logError.message);
    }

    return {
      success: false,
      error: error.message,
      provider: providerName,
      details: error.response?.data || null
    };
  }
}

/**
 * RedPlug Adapter
 * Endpoint: POST /redPlug/api/reserve/{pointid}/{minutes}
 * Minutes in URL path
 */
async function reserveRedPlug(config, pointId, duration) {
  const url = `${config.baseUrl}/redPlug/api/reserve/${pointId}/${duration}`;

  console.log(`[redPlug] Calling: POST ${url}`);

  const response = await axios.post(
    url,
    {}, // empty body
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    }
  );

  // RedPlug response format (from OpenAPI)
  return {
    provider: 'redPlug',
    pointid: response.data.pointid,
    status: response.data.status,
    reservationendtime: response.data.reservationendtime,
    location: {
      long: response.data.long,
      lat: response.data.lat
    }
  };
}

/**
 * GreenPlug Adapter
 * Endpoint: POST /greenPlug/api/chargingPoints/{pointid}/reservations
 * Duration in JSON body: { "duration": minutes }
 */
async function reserveGreenPlug(config, pointId, duration) {
  const url = `${config.baseUrl}/greenPlug/api/chargingPoints/${pointId}/reservations`;

  console.log(`[greenPlug] Calling: POST ${url} with duration=${duration}`);

  const response = await axios.post(
    url,
    { duration }, // duration in body
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    }
  );

  // GreenPlug response format (from OpenAPI)
  return {
    provider: 'greenPlug',
    id: response.data.id,
    state: response.data.state,
    reservedUntil: response.data.reservedUntil,
    kwhRateEur: response.data.kwhRateEur,
    location: {
      long: response.data.coords?.long,
      lat: response.data.coords?.lat
    }
  };
}

/**
 * BluePlug Adapter
 * Endpoint: POST /bluePlug/api/location/{pointid}/hold?minutes={minutes}
 * Minutes as query parameter
 */
async function reserveBluePlug(config, pointId, duration) {
  const url = `${config.baseUrl}/bluePlug/api/location/${pointId}/hold?minutes=${duration}`;

  console.log(`[bluePlug] Calling: POST ${url}`);

  const response = await axios.post(
    url,
    {}, // empty body
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    }
  );

  // BluePlug response format (from OpenAPI)
  return {
    provider: 'bluePlug',
    chargerId: response.data.chargerId,
    currentStatus: response.data.currentStatus,
    reservationEnd: response.data.reservationEnd,
    pricePerKwh: response.data.pricePerKwh,
    location: {
      long: response.data.geo?.[0],
      lat: response.data.geo?.[1]
    }
  };
}

module.exports = {
  createReservation,
  reserveRedPlug,
  reserveGreenPlug,
  reserveBluePlug
};
