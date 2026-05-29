/**
 * ANTI-CORRUPTION LAYER INTEGRATION GUIDE
 * 
 * This document shows exactly how to integrate ProviderDataMapper
 * into Reservation_Service controllers to normalize responses.
 */

const { ProviderDataMapper } = require('./ProviderDataMapper');

// ============================================================================
// INTEGRATION PATTERN #1: Normalize Single Point Response
// ============================================================================
/**
 * When you call a provider's "get single point" API,
 * normalize the response immediately
 */
async function getPoint(providerName, pointId) {
  try {
    // 1. Make request to provider (provider-specific adapter)
    const rawProviderResponse = await fetchPointFromProvider(providerName, pointId);
    // Example raw response:
    // {
    //   pointid: 101,
    //   providerName: 'redPlug',
    //   status: 'available',
    //   long: 23.7275,
    //   lat: 37.9838,
    //   ...
    // }

    // 2. Normalize using anti-corruption layer
    const normalizedPoint = ProviderDataMapper.normalize(rawProviderResponse);

    // 3. Return to frontend in unified format
    return {
      success: true,
      point: normalizedPoint.toJSON()
    };
    // Frontend receives:
    // {
    //   unifiedPointId: 101,
    //   providerName: 'redPlug',
    //   currentStatus: 'available',
    //   reservationEndTime: null,
    //   pricePerKwh: 0,
    //   coordinates: { longitude: 23.7275, latitude: 37.9838 }
    // }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// INTEGRATION PATTERN #2: Normalize Array Response (Points List)
// ============================================================================
/**
 * When you call a provider's "list points" API,
 * normalize the array immediately
 */
async function listPoints(providerName, filters = {}) {
  try {
    // 1. Make request to provider
    const rawProviderPoints = await fetchPointsFromProvider(providerName, filters);
    // Example: Array of 10+ points, each with provider-specific structure

    // 2. Normalize entire array using anti-corruption layer
    const normalizedPoints = ProviderDataMapper.normalizeArray(rawProviderPoints);

    // 3. Return to frontend
    return {
      success: true,
      count: normalizedPoints.length,
      points: normalizedPoints.map(p => p.toJSON())
    };
    // Frontend receives:
    // {
    //   success: true,
    //   count: 15,
    //   points: [
    //     { unifiedPointId: 101, providerName: 'redPlug', ... },
    //     { unifiedPointId: 102, providerName: 'redPlug', ... },
    //     ...
    //   ]
    // }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// INTEGRATION PATTERN #3: Normalize Reservation Response
// ============================================================================
/**
 * When you call a provider's "make reservation" API,
 * normalize the response immediately
 */
async function createReservation(providerName, pointId, duration) {
  try {
    // 1. Make request to provider using provider-specific adapter
    const rawReservationResponse = await makeReservationWithProvider(
      providerName,
      pointId,
      duration
    );
    // Example raw response (varies significantly by provider):
    // RedPlug: { pointid: 101, status: 'reserved', reservationendtime: '...', ... }
    // GreenPlug: { id: 202, state: 'reserved', reservedUntil: '...', ... }
    // BluePlug: { chargerId: 303, currentStatus: 'reserved', reservationEnd: '...', ... }

    // 2. Normalize using anti-corruption layer
    const normalizedReservation = ProviderDataMapper.normalize(rawReservationResponse);

    // 3. Log to database (with normalized structure)
    await logReservation(normalizedReservation.toJSON());

    // 4. Publish event (with normalized structure)
    await publishReservationEvent({
      type: 'reservation_successful',
      reservationId: `${providerName}-${pointId}-${Date.now()}`,
      ...normalizedReservation.toJSON(),
      duration
    });

    // 5. Return to frontend in unified format
    return {
      success: true,
      reservation: normalizedReservation.toJSON()
    };
    // Frontend receives:
    // {
    //   success: true,
    //   reservation: {
    //     unifiedPointId: 101,
    //     providerName: 'redPlug',
    //     currentStatus: 'reserved',
    //     reservationEndTime: '2026-05-29T19:00:00Z',
    //     pricePerKwh: 0,
    //     coordinates: { longitude: 23.7275, latitude: 37.9838 }
    //   }
    // }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// INTEGRATION PATTERN #4: Mixed Provider Query
// ============================================================================
/**
 * When frontend requests points from MULTIPLE providers,
 * normalize responses from each provider before aggregating
 */
async function searchPointsAcrossAllProviders(filters = {}) {
  try {
    // 1. Query all 3 providers in parallel
    const [redPlugPoints, greenPlugPoints, bluePlugPoints] = await Promise.all([
      fetchPointsFromProvider('redPlug', filters),
      fetchPointsFromProvider('greenPlug', filters),
      fetchPointsFromProvider('bluePlug', filters)
    ]);

    // 2. Normalize responses from each provider
    const normalizedRed = ProviderDataMapper.normalizeArray(redPlugPoints);
    const normalizedGreen = ProviderDataMapper.normalizeArray(greenPlugPoints);
    const normalizedBlue = ProviderDataMapper.normalizeArray(bluePlugPoints);

    // 3. Aggregate into single list
    const allPoints = [
      ...normalizedRed,
      ...normalizedGreen,
      ...normalizedBlue
    ];

    // 4. Return to frontend in unified format
    return {
      success: true,
      count: allPoints.length,
      points: allPoints.map(p => p.toJSON())
    };
    // Frontend receives uniform array regardless of provider diversity
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// INTEGRATION PATTERN #5: Error Handling in Normalization
// ============================================================================
/**
 * If a provider response has missing or malformed data,
 * handle gracefully
 */
async function robustNormalization(providerName, rawResponse) {
  try {
    // Attempt normalization
    const normalized = ProviderDataMapper.normalize(rawResponse);
    return {
      success: true,
      data: normalized.toJSON()
    };
  } catch (error) {
    console.error(`[${providerName}] Normalization error:`, error.message);

    // Option 1: Fail and return error
    return {
      success: false,
      error: `Failed to normalize ${providerName} response: ${error.message}`
    };

    // Option 2: Return partial data (depends on use case)
    // const partialUnified = createPartialUnifiedPoint(providerName, rawResponse);
    // return {
    //   success: true,
    //   partial: true,
    //   data: partialUnified
    // };
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING controllers.js
// ============================================================================
/**
 * Add this import at the top of Reservation_Service/src/controllers.js:
 *
 * const { ProviderDataMapper } = require('./ProviderDataMapper');
 *
 * Then replace the response normalization in your existing functions:
 *
 * // OLD: Manually constructing response
 * return {
 *   success: true,
 *   unifiedPointId: response.pointid || response.id || response.chargerId,
 *   providerName: response.providerName,
 *   currentStatus: response.status || response.state || response.currentStatus,
 *   // ... manually mapping all fields
 * };
 *
 * // NEW: Using anti-corruption layer
 * const normalized = ProviderDataMapper.normalize(response);
 * return {
 *   success: true,
 *   point: normalized.toJSON()
 * };
 */

// ============================================================================
// EXAMPLE: Complete Controller Function with Normalization
// ============================================================================
/**
 * This is how a complete controller function should look
 */
async function completeExampleController(req, res) {
  try {
    const { providerName, pointId, duration } = req.body;

    // Validate input
    if (!['redPlug', 'greenPlug', 'bluePlug'].includes(providerName)) {
      return res.status(400).json({
        error: 'Invalid provider. Must be redPlug, greenPlug, or bluePlug'
      });
    }

    // Step 1: Call provider (provider-specific logic)
    const rawResponse = await callProviderAPI(providerName, pointId, duration);

    // Step 2: Normalize using anti-corruption layer
    const normalized = ProviderDataMapper.normalize(rawResponse);

    // Step 3: Log to database
    const reservationLog = await database.logReservation({
      providerId: normalized.unifiedPointId,
      providerName: normalized.providerName,
      status: normalized.currentStatus,
      reservationEnd: normalized.reservationEndTime,
      // ... other fields
    });

    // Step 4: Publish RabbitMQ event
    await publishEvent('billing_exchange', 'reservation_successful', {
      reservationId: reservationLog.id,
      ...normalized.toJSON(),
      duration
    });

    // Step 5: Return to frontend in unified format
    return res.status(200).json({
      success: true,
      reservation: normalized.toJSON()
    });
  } catch (error) {
    console.error('[createReservation] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================================================
// BENEFITS OF THIS APPROACH
// ============================================================================
/**
 * 1. SINGLE SOURCE OF TRUTH
 *    - One place (ProviderDataMapper) handles all normalization logic
 *    - Easy to maintain and extend
 *
 * 2. FRONTEND DECOUPLING
 *    - Frontend never sees provider-specific field names
 *    - Frontend code doesn't need provider conditionals
 *    - Add new providers without frontend changes
 *
 * 3. DATABASE CONSISTENCY
 *    - Database always receives normalized structure
 *    - No duplicate logic in multiple controllers
 *    - Easy to query consistent schema
 *
 * 4. ERROR ISOLATION
 *    - Normalization errors caught in one place
 *    - Easy debugging
 *    - Provider issues don't break other parts
 *
 * 5. TESTING
 *    - Test mapper independently with mock responses
 *    - Test each provider adapter separately
 *    - No need to test provider mapping in every controller
 *
 * 6. SCALABILITY
 *    - Add new provider? Just add new mapper class
 *    - Change provider API? Update one mapper
 *    - No ripple effects through codebase
 */

// ============================================================================
// TESTING THE INTEGRATION
// ============================================================================
/**
 * To test ProviderDataMapper integration:
 *
 * 1. Run examples:
 *    node Reservation_Service/src/ProviderDataMapper.examples.js
 *
 * 2. Unit test each mapper:
 *    npm test ProviderDataMapper.test.js
 *
 * 3. Integration test in controller:
 *    npm test controllers.test.js
 *
 * 4. Manual test with curl:
 *    curl -X POST http://localhost:3106/api/reserve \
 *      -H "Content-Type: application/json" \
 *      -d '{
 *        "providerName": "redPlug",
 *        "pointId": "123",
 *        "duration": 60
 *      }'
 *
 * Verify frontend receives unified format regardless of provider.
 */

module.exports = {
  getPoint,
  listPoints,
  createReservation,
  searchPointsAcrossAllProviders,
  robustNormalization,
  completeExampleController
};
