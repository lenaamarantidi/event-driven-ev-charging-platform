/**
 * ProviderDataMapper - Usage Examples & Test Cases
 * 
 * Demonstrates how to use the anti-corruption layer
 * for all 3 providers across different scenarios
 */

const {
  UnifiedPoint,
  RedPlugMapper,
  GreenPlugMapper,
  BluePlugMapper,
  ProviderDataMapper
} = require('./ProviderDataMapper');

// ============================================================================
// EXAMPLE 1: RedPlug Point Response
// ============================================================================
const redPlugPointResponse = {
  pointid: 101,
  providerName: 'redPlug',
  status: 'available',
  reservationendtime: null,
  cap: 22,
  connector: 'Type2',
  locationName: 'Central Station',
  address: 'Patision 76, Athens',
  long: 23.7275,
  lat: 37.9838
};

console.log('\n=== REDPLUG POINT ===');
const normalizedRedPlug = ProviderDataMapper.normalize(redPlugPointResponse);
console.log(JSON.stringify(normalizedRedPlug.toJSON(), null, 2));
// Output:
// {
//   "unifiedPointId": 101,
//   "providerName": "redPlug",
//   "currentStatus": "available",
//   "reservationEndTime": null,
//   "pricePerKwh": 0,
//   "coordinates": {
//     "longitude": 23.7275,
//     "latitude": 37.9838
//   }
// }

// ============================================================================
// EXAMPLE 2: GreenPlug Point Response
// ============================================================================
const greenPlugPointResponse = {
  id: 202,
  providerName: 'greenPlug',
  state: 'occupied',
  reservedUntil: '2026-05-29T18:30:00Z',
  kwhRateEur: 0.45,
  cap: 50,
  connector: 'CCS',
  locationName: 'Airport Terminal 2',
  address: 'Athens Airport, Greece',
  coords: {
    long: 23.9445,
    lat: 37.8847
  }
};

console.log('\n=== GREENPLUG POINT ===');
const normalizedGreenPlug = ProviderDataMapper.normalize(greenPlugPointResponse);
console.log(JSON.stringify(normalizedGreenPlug.toJSON(), null, 2));
// Output:
// {
//   "unifiedPointId": 202,
//   "providerName": "greenPlug",
//   "currentStatus": "occupied",
//   "reservationEndTime": "2026-05-29T18:30:00Z",
//   "pricePerKwh": 0.45,
//   "coordinates": {
//     "longitude": 23.9445,
//     "latitude": 37.8847
//   }
// }

// ============================================================================
// EXAMPLE 3: BluePlug Point Response
// ============================================================================
const bluePlugPointResponse = {
  chargerId: 303,
  providerName: 'bluePlug',
  currentStatus: 'available',
  reservationEnd: null,
  pricePerKwh: 0.59,
  cap: 11,
  connector: 'Schuko',
  locationName: 'Shopping Mall',
  address: 'Marousi, Athens',
  geo: [23.8103, 37.9973]  // [longitude, latitude]
};

console.log('\n=== BLUEPLUG POINT ===');
const normalizedBluePlug = ProviderDataMapper.normalize(bluePlugPointResponse);
console.log(JSON.stringify(normalizedBluePlug.toJSON(), null, 2));
// Output:
// {
//   "unifiedPointId": 303,
//   "providerName": "bluePlug",
//   "currentStatus": "available",
//   "reservationEndTime": null,
//   "pricePerKwh": 0.59,
//   "coordinates": {
//     "longitude": 23.8103,
//     "latitude": 37.9973
//   }
// }

// ============================================================================
// EXAMPLE 4: Array Normalization (Points List)
// ============================================================================
const mixedProvidersList = [
  {
    pointid: 101,
    providerName: 'redPlug',
    status: 'available',
    reservationendtime: null,
    long: 23.7275,
    lat: 37.9838
  },
  {
    id: 202,
    providerName: 'greenPlug',
    state: 'occupied',
    reservedUntil: '2026-05-29T18:30:00Z',
    kwhRateEur: 0.45,
    coords: {
      long: 23.9445,
      lat: 37.8847
    }
  },
  {
    chargerId: 303,
    providerName: 'bluePlug',
    currentStatus: 'available',
    reservationEnd: null,
    pricePerKwh: 0.59,
    geo: [23.8103, 37.9973]
  }
];

console.log('\n=== MIXED PROVIDERS LIST ===');
const normalizedList = ProviderDataMapper.normalizeArray(mixedProvidersList);
console.log(JSON.stringify(normalizedList.map(p => p.toJSON()), null, 2));
// Output: Array of 3 unified points, one from each provider

// ============================================================================
// EXAMPLE 5: Using Explicit Provider Name
// ============================================================================
const redPlugDataWithoutProvider = {
  pointid: 401,
  status: 'available',
  reservationendtime: null,
  long: 23.6345,
  lat: 37.9754
};

console.log('\n=== EXPLICIT PROVIDER MAPPING ===');
const normalizedWithExplicitProvider = ProviderDataMapper.normalizeByProvider(
  'redPlug',
  redPlugDataWithoutProvider
);
console.log(JSON.stringify(normalizedWithExplicitProvider.toJSON(), null, 2));

// ============================================================================
// EXAMPLE 6: Reservation Response (RedPlug)
// ============================================================================
const redPlugReservationResponse = {
  pointid: 101,
  providerName: 'redPlug',
  status: 'reserved',
  reservationendtime: '2026-05-29T19:00:00Z',
  long: 23.7275,
  lat: 37.9838
};

console.log('\n=== REDPLUG RESERVATION ===');
const normalizedRedPlugReservation = RedPlugMapper.normalizeReservation(
  redPlugReservationResponse
);
console.log(JSON.stringify(normalizedRedPlugReservation.toJSON(), null, 2));

// ============================================================================
// EXAMPLE 7: Reservation Response (GreenPlug)
// ============================================================================
const greenPlugReservationResponse = {
  id: 202,
  providerName: 'greenPlug',
  state: 'reserved',
  reservedUntil: '2026-05-29T19:30:00Z',
  kwhRateEur: 0.45,
  coords: {
    long: 23.9445,
    lat: 37.8847
  }
};

console.log('\n=== GREENPLUG RESERVATION ===');
const normalizedGreenPlugReservation = GreenPlugMapper.normalizeReservation(
  greenPlugReservationResponse
);
console.log(JSON.stringify(normalizedGreenPlugReservation.toJSON(), null, 2));

// ============================================================================
// EXAMPLE 8: Reservation Response (BluePlug)
// ============================================================================
const bluePlugReservationResponse = {
  chargerId: 303,
  providerName: 'bluePlug',
  currentStatus: 'reserved',
  reservationEnd: '2026-05-29T20:00:00Z',
  pricePerKwh: 0.59,
  geo: [23.8103, 37.9973]
};

console.log('\n=== BLUEPLUG RESERVATION ===');
const normalizedBluePlugReservation = BluePlugMapper.normalizeReservation(
  bluePlugReservationResponse
);
console.log(JSON.stringify(normalizedBluePlugReservation.toJSON(), null, 2));

// ============================================================================
// EXAMPLE 9: Error Handling - Invalid Provider
// ============================================================================
console.log('\n=== ERROR HANDLING ===');
try {
  const invalidProvider = {
    pointid: 999,
    providerName: 'unknownProvider',
    status: 'available'
  };
  ProviderDataMapper.normalize(invalidProvider);
} catch (error) {
  console.log('Expected error caught:', error.message);
  // Output: "Expected error caught: Unknown provider: unknownProvider"
}

// ============================================================================
// EXAMPLE 10: Error Handling - Missing Data
// ============================================================================
try {
  ProviderDataMapper.normalize(null);
} catch (error) {
  console.log('Expected error caught:', error.message);
  // Output: "Expected error caught: Provider response is required"
}

// ============================================================================
// EXAMPLE 11: Integration with Reservation_Service Controllers
// ============================================================================
/**
 * How to use in Reservation_Service/src/controllers.js:
 * 
 * async function createReservation(providerName, pointId, duration) {
 *   try {
 *     // Make request to provider
 *     const providerResponse = await makeReservationWithProvider(
 *       providerName,
 *       pointId,
 *       duration
 *     );
 *
 *     // Normalize response using anti-corruption layer
 *     const normalizedResponse = ProviderDataMapper.normalize(providerResponse);
 *
 *     // Return to frontend in unified format
 *     return {
 *       success: true,
 *       reservation: normalizedResponse.toJSON()
 *     };
 *   } catch (error) {
 *     return {
 *       success: false,
 *       error: error.message
 *     };
 *   }
 * }
 */

// ============================================================================
// EXAMPLE 12: Frontend Receives Always Same Format
// ============================================================================
console.log('\n=== FRONTEND ALWAYS RECEIVES UNIFIED FORMAT ===');
console.log('Query multiple providers, all return same structure:');

const frontendResponses = [
  ProviderDataMapper.normalize(redPlugPointResponse).toJSON(),
  ProviderDataMapper.normalize(greenPlugPointResponse).toJSON(),
  ProviderDataMapper.normalize(bluePlugPointResponse).toJSON()
];

frontendResponses.forEach((response, index) => {
  console.log(`\nResponse ${index + 1}:`);
  console.log(`  - ID: ${response.unifiedPointId}`);
  console.log(`  - Provider: ${response.providerName}`);
  console.log(`  - Status: ${response.currentStatus}`);
  console.log(`  - Price: €${response.pricePerKwh}/kWh`);
  console.log(`  - Location: (${response.coordinates.longitude}, ${response.coordinates.latitude})`);
});

// ============================================================================
// CONSOLE OUTPUT STRUCTURE
// ============================================================================
/**
 * When you run this file, you'll see:
 *
 * === REDPLUG POINT ===
 * {
 *   "unifiedPointId": 101,
 *   "providerName": "redPlug",
 *   "currentStatus": "available",
 *   "reservationEndTime": null,
 *   "pricePerKwh": 0,
 *   "coordinates": {
 *     "longitude": 23.7275,
 *     "latitude": 37.9838
 *   }
 * }
 *
 * === GREENPLUG POINT ===
 * {
 *   "unifiedPointId": 202,
 *   "providerName": "greenPlug",
 *   "currentStatus": "occupied",
 *   "reservationEndTime": "2026-05-29T18:30:00Z",
 *   "pricePerKwh": 0.45,
 *   "coordinates": {
 *     "longitude": 23.9445,
 *     "latitude": 37.8847
 *   }
 * }
 *
 * === BLUEPLUG POINT ===
 * {
 *   "unifiedPointId": 303,
 *   "providerName": "bluePlug",
 *   "currentStatus": "available",
 *   "reservationEndTime": null,
 *   "pricePerKwh": 0.59,
 *   "coordinates": {
 *     "longitude": 23.8103,
 *     "latitude": 37.9973
 *   }
 * }
 *
 * ... and so on for all examples
 */

console.log('\n✅ All examples completed!');
