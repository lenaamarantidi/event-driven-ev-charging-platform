/**
 * Controllers - Provider Adapter Logic
 * * Maps unified reservation request to provider-specific APIs
 */

const axios = require('axios');
const { logReservation } = require('./db');

// Διορθώθηκαν τα ονόματα των μεταβλητών για να ταιριάζουν με το docker-compose
// και προστέθηκαν τα πραγματικά default URLs του εργαστηρίου!
const PROVIDER_CONFIG = {
  redPlug: {
    id: 1,
    baseUrl: process.env.REDPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/redPlug/api',
    apiKey: process.env.REDPLUG_API_KEY || 'redplug-key-123',
    timeout: 10000
  },
  greenPlug: {
    id: 2,
    baseUrl: process.env.GREENPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/greenPlug/api',
    apiKey: process.env.GREENPLUG_API_KEY || 'greenplug-key-123',
    timeout: 10000
  },
  bluePlug: {
    id: 3,
    baseUrl: process.env.BLUEPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/bluePlug/api',
    apiKey: process.env.BLUEPLUG_API_KEY || 'blueplug-key-123',
    timeout: 10000
  }
};

/**
 * Create Reservation - Main controller
 */
async function createReservation(params) {
  const { reservationId, providerName, pointId, duration, userId } = params;

  try {
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

    const normalizedResponse = normalizeReservationResponse(providerName, response, pointId);

    // Log successful reservation
    await logReservation({
      reservationId,
      providerId: config.id,
      providerName,
      pointId,
      duration,
      status: 'confirmed',
      details: normalizedResponse,
      userId
    });

    return {
      success: true,
      data: normalizedResponse,
      message: `Reservation confirmed with ${providerName}`
    };

  } catch (error) {
    console.error(`[${providerName}] Reservation failed:`, error.message);

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
 * Διορθωμένο endpoint (χωρίς το περιττό /redPlug/api)
 */
async function reserveRedPlug(config, pointId, duration) {
  const url = `${config.baseUrl}/reserve/${pointId}/${duration}`;

  console.log(`[redPlug] Calling: POST ${url}`);

  const response = await axios.post(
    url,
    {}, 
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    }
  );

  return response.data;
}

/**
 * GreenPlug Adapter
 * Διορθωμένο endpoint
 */
async function reserveGreenPlug(config, pointId, duration) {
  const url = `${config.baseUrl}/chargingPoints/${pointId}/reservations`;

  console.log(`[greenPlug] Calling: POST ${url} with duration=${duration}`);

  const response = await axios.post(
    url,
    { duration }, 
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    }
  );

  return response.data;
}

/**
 * BluePlug Adapter
 * Διορθωμένο endpoint
 */
async function reserveBluePlug(config, pointId, duration) {
  const url = `${config.baseUrl}/location/${pointId}/hold?minutes=${duration}`;

  console.log(`[bluePlug] Calling: POST ${url}`);

  const response = await axios.post(
    url,
    {}, 
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    }
  );

  return response.data;
}

function normalizeReservationResponse(providerName, responseData, fallbackPointId = null) {
  if (!responseData || typeof responseData !== 'object') {
    throw new Error('Invalid provider reservation response');
  }

  let pointid = null;
  let status = null;
  let reservationendtime = null;

  switch (providerName) {
    case 'redPlug':
      pointid = responseData.pointid ?? responseData.id ?? responseData.chargerId ?? null;
      status = responseData.status ?? responseData.state ?? responseData.currentStatus ?? null;
      reservationendtime = responseData.reservationendtime ?? responseData.reservedUntil ?? responseData.reservationEnd ?? null;
      break;
    case 'greenPlug':
      pointid = responseData.id ?? responseData.pointid ?? responseData.chargerId ?? null;
      status = responseData.state ?? responseData.status ?? responseData.currentStatus ?? null;
      reservationendtime = responseData.reservedUntil ?? responseData.reservationendtime ?? responseData.reservationEnd ?? null;
      break;
    case 'bluePlug':
      pointid = responseData.chargerId ?? responseData.pointid ?? responseData.id ?? null;
      status = responseData.currentStatus ?? responseData.status ?? responseData.state ?? null;
      reservationendtime = responseData.reservationEnd ?? responseData.reservedUntil ?? responseData.reservationendtime ?? null;
      break;
    default:
      throw new Error(`Unknown provider for normalization: ${providerName}`);
  }

  if (!pointid && fallbackPointId) {
    pointid = fallbackPointId;
  }

  if (!status || String(status).toLowerCase() !== 'reserved') {
    reservationendtime = '1970-01-01 00:00';
  } else if (!reservationendtime) {
    reservationendtime = '1970-01-01 00:00';
  }

  return {
    pointid,
    status,
    reservationendtime,
    provider: providerName,
    raw: responseData
  };
}

module.exports = {
  createReservation,
  reserveRedPlug,
  reserveGreenPlug,
  reserveBluePlug
};