/**
 * Controllers - Provider Adapter Logic
 * * Maps unified reservation request to provider-specific APIs
 */

const axios = require('axios');
const { logReservation } = require('./db');

// Use per-provider adapter service URLs
const PROVIDER_ADAPTER_URLS = {
  redPlug: process.env.REDPLUG_ADAPTER_URL || 'http://localhost:3111',
  greenPlug: process.env.GREENPLUG_ADAPTER_URL || 'http://localhost:3112',
  bluePlug: process.env.BLUEPLUG_ADAPTER_URL || 'http://localhost:3113'
};

function getAdapterBaseUrl(providerName) {
  const url = PROVIDER_ADAPTER_URLS[providerName];
  if (!url) throw new Error(`No adapter URL configured for provider: ${providerName}`);
  return url;
}

function isValidProvider(providerName) {
  return ['redPlug', 'greenPlug', 'bluePlug'].includes(providerName);
}

async function reserveViaAdapter(providerName, pointId, duration, userId) {
  const base = getAdapterBaseUrl(providerName);
  const response = await axios.post(`${base}/api/reserve`, { pointId, duration, userId }, { timeout: 10000 });
  return response.data.reservation || response.data;
}

/**
 * Create Reservation - Main controller
 * Delegates provider-specific calls to Provider Adapter Service.
 */
async function createReservation(params) {
  const { reservationId, providerName, pointId, duration, userId } = params;

  try {
    if (!isValidProvider(providerName)) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    console.log(`[${providerName}] Reserving point ${pointId} via adapter service`);
    const normalizedResponse = await reserveViaAdapter(providerName, pointId, duration, userId);

    // Log successful reservation
    await logReservation({
      reservationId,
      providerId: providerName === 'greenPlug' ? 2 : providerName === 'bluePlug' ? 3 : 1,
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
      await logReservation({
        reservationId,
        providerId: providerName === 'greenPlug' ? 2 : providerName === 'bluePlug' ? 3 : 1,
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

module.exports = {
  createReservation,
};
