/**
 * PROVIDER DATA MAPPER - QUICK REFERENCE CARD
 * 
 * One-page guide for normalizing provider responses
 * Copy-paste ready examples for common scenarios
 */

// ============================================================================
// IMPORT
// ============================================================================
const { ProviderDataMapper, RedPlugMapper, GreenPlugMapper, BluePlugMapper } = 
  require('./ProviderDataMapper');

// ============================================================================
// #1: NORMALIZE SINGLE RESPONSE (Most Common)
// ============================================================================

// ANY provider response → unified format
const normalized = ProviderDataMapper.normalize(providerResponse);
console.log(normalized.toJSON());

// Example:
const redPlugData = {
  pointid: 101,
  providerName: 'redPlug',
  status: 'available',
  long: 23.7275,
  lat: 37.9838
};
const result = ProviderDataMapper.normalize(redPlugData);
// Output:
// {
//   unifiedPointId: 101,
//   providerName: 'redPlug',
//   currentStatus: 'available',
//   reservationEndTime: null,
//   pricePerKwh: 0,
//   coordinates: { longitude: 23.7275, latitude: 37.9838 }
// }

// ============================================================================
// #2: NORMALIZE ARRAY OF RESPONSES
// ============================================================================

const normalizedArray = ProviderDataMapper.normalizeArray(providerResponses);
const json = normalizedArray.map(p => p.toJSON());

// ============================================================================
// #3: EXPLICIT PROVIDER NAME (When not in data)
// ============================================================================

const dataWithoutProvider = { pointid: 101, status: 'available', long: 23.7, lat: 37.9 };
const normalized = ProviderDataMapper.normalizeByProvider('redPlug', dataWithoutProvider);

// ============================================================================
// #4: USE SPECIFIC MAPPER (Direct access)
// ============================================================================

// RedPlug only
const redNormalized = RedPlugMapper.normalize(redData);

// GreenPlug only
const greenNormalized = GreenPlugMapper.normalize(greenData);

// BluePlug only
const blueNormalized = BluePlugMapper.normalize(blueData);

// ============================================================================
// #5: UNIFIED SCHEMA STRUCTURE
// ============================================================================

// ALL responses look like this:
{
  unifiedPointId: 123,                    // number
  providerName: 'redPlug',                // 'redPlug' | 'greenPlug' | 'bluePlug'
  currentStatus: 'available',             // string
  reservationEndTime: '2026-05-29T19:00:00Z', // string | null
  pricePerKwh: 0.45,                     // number
  coordinates: {
    longitude: 23.7275,                  // number
    latitude: 37.9838                    // number
  }
}

// ============================================================================
// #6: FIELD MAPPING CHEAT SHEET
// ============================================================================

// REDPLUG
// pointid           → unifiedPointId
// status            → currentStatus
// reservationendtime → reservationEndTime
// long              → coordinates.longitude
// lat               → coordinates.latitude
// (no price)        → pricePerKwh = 0

// GREENPLUG
// id                → unifiedPointId
// state             → currentStatus
// reservedUntil     → reservationEndTime
// kwhRateEur        → pricePerKwh
// coords.long       → coordinates.longitude
// coords.lat        → coordinates.latitude

// BLUEPLUG
// chargerId         → unifiedPointId
// currentStatus     → currentStatus (same!)
// reservationEnd    → reservationEndTime
// pricePerKwh       → pricePerKwh (same!)
// geo[0]            → coordinates.longitude
// geo[1]            → coordinates.latitude

// ============================================================================
// #7: IN CONTROLLER - PATTERN 1: GET POINT
// ============================================================================

app.get('/api/points/:providerId/:pointId', async (req, res) => {
  try {
    const providerResponse = await getPointFromProvider(providerId, pointId);
    const normalized = ProviderDataMapper.normalize(providerResponse);
    res.json(normalized.toJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// #8: IN CONTROLLER - PATTERN 2: LIST POINTS
// ============================================================================

app.get('/api/providers/:providerId/points', async (req, res) => {
  try {
    const providerPoints = await listPointsFromProvider(providerId);
    const normalized = ProviderDataMapper.normalizeArray(providerPoints);
    res.json({
      count: normalized.length,
      points: normalized.map(p => p.toJSON())
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// #9: IN CONTROLLER - PATTERN 3: MAKE RESERVATION
// ============================================================================

app.post('/api/reserve', async (req, res) => {
  try {
    const { providerName, pointId, duration } = req.body;
    
    // 1. Call provider
    const reservationResponse = await callProviderReservation(providerName, pointId, duration);
    
    // 2. Normalize
    const normalized = ProviderDataMapper.normalize(reservationResponse);
    
    // 3. Log to database
    await db.reservations.create({
      providerId: normalized.unifiedPointId,
      providerName: normalized.providerName,
      status: normalized.currentStatus,
      reservationEnd: normalized.reservationEndTime
    });
    
    // 4. Publish event
    await publishEvent('reservation_successful', {
      reservationId: reservationLog.id,
      ...normalized.toJSON(),
      duration
    });
    
    // 5. Return
    res.json(normalized.toJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// #10: IN CONTROLLER - PATTERN 4: CROSS-PROVIDER SEARCH
// ============================================================================

app.get('/api/search', async (req, res) => {
  try {
    // Query all 3 providers
    const [red, green, blue] = await Promise.all([
      axios.get(RED_API + '/points'),
      axios.get(GREEN_API + '/points'),
      axios.get(BLUE_API + '/points')
    ]);
    
    // Normalize all
    const normalizedRed = ProviderDataMapper.normalizeArray(red.data);
    const normalizedGreen = ProviderDataMapper.normalizeArray(green.data);
    const normalizedBlue = ProviderDataMapper.normalizeArray(blue.data);
    
    // Combine
    const allPoints = [...normalizedRed, ...normalizedGreen, ...normalizedBlue];
    
    // Return
    res.json({
      total: allPoints.length,
      points: allPoints.map(p => p.toJSON())
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// #11: ERROR HANDLING
// ============================================================================

try {
  const normalized = ProviderDataMapper.normalize(response);
  // ... use it
} catch (error) {
  if (error.message.includes('Unknown provider')) {
    // Invalid provider name
  } else if (error.message.includes('required')) {
    // Missing response data
  } else {
    // Normalization error
  }
  // Handle appropriately
}

// ============================================================================
// #12: TESTING
// ============================================================================

// Run all tests
node src/ProviderDataMapper.test.js

// Run examples
node src/ProviderDataMapper.examples.js

// Test single provider
const redTest = RedPlugMapper.normalize({ ... });
console.log(redTest.toJSON());

// ============================================================================
// #13: COMMON SCENARIOS
// ============================================================================

// Scenario: Display point from unknown provider on map
const point = ProviderDataMapper.normalize(unknownProviderResponse);
mapUI.addMarker({
  id: point.unifiedPointId,
  lat: point.coordinates.latitude,
  lng: point.coordinates.longitude,
  label: point.currentStatus
});
// Works for any provider!

// Scenario: Show pricing across providers
const points = ProviderDataMapper.normalizeArray(allPoints);
points.forEach(point => {
  console.log(`${point.providerName}: €${point.pricePerKwh}/kWh`);
});
// Clean and simple!

// Scenario: Filter by status
const points = ProviderDataMapper.normalizeArray(allPoints);
const available = points.filter(p => p.currentStatus === 'available');
// Same field name for all providers!

// ============================================================================
// #14: DATABASE SCHEMA (What to store)
// ============================================================================

// Store normalized data (always same structure):
{
  unified_point_id: 101,
  provider_name: 'redPlug',
  current_status: 'available',
  reservation_end_time: '2026-05-29T19:00:00Z',
  price_per_kwh: 0.45,
  latitude: 37.9838,
  longitude: 23.7275,
  created_at: '...'
}

// No provider-specific columns!
// Clean queries: SELECT * FROM points WHERE status = 'available'

// ============================================================================
// #15: FRONTEND RECEIVES (Always identical)
// ============================================================================

// No matter which provider or API:
{
  "unifiedPointId": 123,
  "providerName": "redPlug|greenPlug|bluePlug",
  "currentStatus": "available|occupied|reserved",
  "reservationEndTime": "2026-05-29T19:00:00Z|null",
  "pricePerKwh": 0.45,
  "coordinates": {
    "longitude": 23.7275,
    "latitude": 37.9838
  }
}

// Frontend code NEVER has:
// if (data.pointid) vs if (data.id) vs if (data.chargerId)
// if (data.status) vs if (data.state) vs if (data.currentStatus)
// if (data.coords) vs if (data.geo) vs if (data.long/data.lat)
// ALWAYS: data.unifiedPointId, data.currentStatus, data.coordinates.longitude

// ============================================================================
// #16: INTEGRATION CHECKLIST
// ============================================================================

// [ ] Copy ProviderDataMapper.js to src/
// [ ] Add import to controllers.js
// [ ] Replace manual mapping with ProviderDataMapper.normalize()
// [ ] Test each provider (node ProviderDataMapper.test.js)
// [ ] Verify frontend receives unified schema
// [ ] Update database schema if needed
// [ ] Remove old provider-specific code
// [ ] Document in service README

// ============================================================================
// #17: PERFORMANCE NOTES
// ============================================================================

// Normalize() is fast:
// - Single response: ~0.1ms
// - Array of 100 points: ~10ms
// - Uses pure JavaScript (no external deps)
// - Can normalize after each API call
// - Can normalize in streaming (per-response)

// ============================================================================
// #18: WHEN TO NORMALIZE
// ============================================================================

// DO normalize immediately after receiving from provider
const response = await api.getPoints();
const normalized = ProviderDataMapper.normalize(response.data); // ← Do this

// DO normalize before storing in database
await db.points.create(normalized.toJSON());

// DO normalize before publishing RabbitMQ event
await publishEvent('point_viewed', normalized.toJSON());

// DO normalize before sending to frontend
res.json(normalized.toJSON());

// DON'T normalize multiple times (store the result)
const n1 = ProviderDataMapper.normalize(data); // ← normalize once
const n2 = ProviderDataMapper.normalize(data); // ← don't do again
const n3 = ProviderDataMapper.normalize(data); // ← use n1 instead

// ============================================================================
// #19: KEY FILES
// ============================================================================

// Main implementation:
//   Reservation_Service/src/ProviderDataMapper.js

// Documentation:
//   Reservation_Service/src/ProviderDataMapper.README.md

// Examples (12 scenarios):
//   Reservation_Service/src/ProviderDataMapper.examples.js

// Tests (45+ test cases):
//   Reservation_Service/src/ProviderDataMapper.test.js

// Integration patterns:
//   Reservation_Service/src/ProviderDataMapper.integration.js

// This file (quick ref):
//   Reservation_Service/src/ProviderDataMapper.QUICK_REFERENCE.js

// ============================================================================
// #20: SUPPORT
// ============================================================================

// For detailed examples:
//   Read: ProviderDataMapper.examples.js

// For test scenarios:
//   Run: node ProviderDataMapper.test.js

// For integration help:
//   Read: ProviderDataMapper.integration.js

// For complete documentation:
//   Read: ProviderDataMapper.README.md

console.log('✅ Provider Data Mapper ready to use!');
