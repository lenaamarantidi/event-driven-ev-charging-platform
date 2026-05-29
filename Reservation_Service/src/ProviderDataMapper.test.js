/**
 * PROVIDER DATA MAPPER - TEST SUITE
 * 
 * Comprehensive tests for the anti-corruption layer
 * Tests all provider mappers and the main orchestrator
 * 
 * Run with: npm test ProviderDataMapper.test.js
 * Or: node ProviderDataMapper.test.js (for standalone execution)
 */

const {
  UnifiedPoint,
  RedPlugMapper,
  GreenPlugMapper,
  BluePlugMapper,
  ProviderDataMapper
} = require('./ProviderDataMapper');

// Simple test framework
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  assertEquals(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, but got ${actual}: ${message}`);
    }
  }

  assertDeepEquals(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(`Objects not equal: ${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
    }
  }

  test(name, testFn) {
    try {
      testFn();
      this.passed++;
      console.log(`✅ PASS: ${name}`);
    } catch (error) {
      this.failed++;
      console.log(`❌ FAIL: ${name}`);
      console.log(`   Error: ${error.message}`);
    }
  }

  summary() {
    const total = this.passed + this.failed;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test Results: ${this.passed}/${total} passed`);
    if (this.failed > 0) {
      console.log(`${this.failed} test(s) failed`);
    } else {
      console.log('All tests passed! 🎉');
    }
    console.log(`${'='.repeat(60)}\n`);
  }
}

const runner = new TestRunner();

// ============================================================================
// TEST SUITE 1: RedPlugMapper
// ============================================================================
console.log('\n📋 TEST SUITE 1: RedPlugMapper');
console.log('─'.repeat(60));

runner.test('RedPlugMapper - Basic normalization', () => {
  const redData = {
    pointid: 101,
    providerName: 'redPlug',
    status: 'available',
    reservationendtime: null,
    long: 23.7275,
    lat: 37.9838
  };

  const result = RedPlugMapper.normalize(redData);
  runner.assertEquals(result.unifiedPointId, 101, 'pointid mapped to unifiedPointId');
  runner.assertEquals(result.providerName, 'redPlug', 'providerName preserved');
  runner.assertEquals(result.currentStatus, 'available', 'status mapped to currentStatus');
  runner.assertEquals(result.reservationEndTime, null, 'reservationendtime mapped');
  runner.assertEquals(result.coordinates.longitude, 23.7275, 'longitude correct');
  runner.assertEquals(result.coordinates.latitude, 37.9838, 'latitude correct');
});

runner.test('RedPlugMapper - With reservation', () => {
  const redData = {
    pointid: 101,
    providerName: 'redPlug',
    status: 'reserved',
    reservationendtime: '2026-05-29T19:00:00Z',
    long: 23.7275,
    lat: 37.9838
  };

  const result = RedPlugMapper.normalize(redData);
  runner.assertEquals(result.currentStatus, 'reserved', 'status is reserved');
  runner.assertEquals(result.reservationEndTime, '2026-05-29T19:00:00Z', 'reservation time captured');
});

runner.test('RedPlugMapper - Missing coordinates defaults to 0', () => {
  const redData = {
    pointid: 101,
    providerName: 'redPlug',
    status: 'available',
    reservationendtime: null
    // long and lat missing
  };

  const result = RedPlugMapper.normalize(redData);
  runner.assertEquals(result.coordinates.longitude, 0, 'missing longitude defaults to 0');
  runner.assertEquals(result.coordinates.latitude, 0, 'missing latitude defaults to 0');
});

runner.test('RedPlugMapper - Throws on null input', () => {
  try {
    RedPlugMapper.normalize(null);
    throw new Error('Should have thrown');
  } catch (error) {
    runner.assert(
      error.message.includes('required'),
      'Throws error for null data'
    );
  }
});

// ============================================================================
// TEST SUITE 2: GreenPlugMapper
// ============================================================================
console.log('\n📋 TEST SUITE 2: GreenPlugMapper');
console.log('─'.repeat(60));

runner.test('GreenPlugMapper - Basic normalization', () => {
  const greenData = {
    id: 202,
    providerName: 'greenPlug',
    state: 'occupied',
    reservedUntil: '2026-05-29T18:30:00Z',
    kwhRateEur: 0.45,
    coords: {
      long: 23.9445,
      lat: 37.8847
    }
  };

  const result = GreenPlugMapper.normalize(greenData);
  runner.assertEquals(result.unifiedPointId, 202, 'id mapped to unifiedPointId');
  runner.assertEquals(result.providerName, 'greenPlug', 'providerName preserved');
  runner.assertEquals(result.currentStatus, 'occupied', 'state mapped to currentStatus');
  runner.assertEquals(result.reservationEndTime, '2026-05-29T18:30:00Z', 'reservedUntil mapped');
  runner.assertEquals(result.pricePerKwh, 0.45, 'kwhRateEur mapped to pricePerKwh');
  runner.assertEquals(result.coordinates.longitude, 23.9445, 'nested longitude correct');
  runner.assertEquals(result.coordinates.latitude, 37.8847, 'nested latitude correct');
});

runner.test('GreenPlugMapper - Nested coords structure', () => {
  const greenData = {
    id: 202,
    providerName: 'greenPlug',
    state: 'available',
    reservedUntil: null,
    kwhRateEur: 0.45,
    coords: {
      long: 23.9445,
      lat: 37.8847
    }
  };

  const result = GreenPlugMapper.normalize(greenData);
  runner.assert(result.coordinates !== null, 'coordinates object created');
  runner.assertEquals(result.coordinates.longitude, 23.9445, 'accesses nested long');
  runner.assertEquals(result.coordinates.latitude, 37.8847, 'accesses nested lat');
});

runner.test('GreenPlugMapper - Missing price defaults to 0', () => {
  const greenData = {
    id: 202,
    providerName: 'greenPlug',
    state: 'available',
    reservedUntil: null,
    // kwhRateEur missing
    coords: {
      long: 23.9445,
      lat: 37.8847
    }
  };

  const result = GreenPlugMapper.normalize(greenData);
  runner.assertEquals(result.pricePerKwh, 0, 'missing price defaults to 0');
});

runner.test('GreenPlugMapper - Missing coords handling', () => {
  const greenData = {
    id: 202,
    providerName: 'greenPlug',
    state: 'available',
    reservedUntil: null,
    kwhRateEur: 0.45
    // coords missing
  };

  const result = GreenPlugMapper.normalize(greenData);
  runner.assertEquals(result.coordinates.longitude, 0, 'missing nested long defaults to 0');
  runner.assertEquals(result.coordinates.latitude, 0, 'missing nested lat defaults to 0');
});

// ============================================================================
// TEST SUITE 3: BluePlugMapper
// ============================================================================
console.log('\n📋 TEST SUITE 3: BluePlugMapper');
console.log('─'.repeat(60));

runner.test('BluePlugMapper - Basic normalization', () => {
  const blueData = {
    chargerId: 303,
    providerName: 'bluePlug',
    currentStatus: 'available',
    reservationEnd: null,
    pricePerKwh: 0.59,
    geo: [23.8103, 37.9973]
  };

  const result = BluePlugMapper.normalize(blueData);
  runner.assertEquals(result.unifiedPointId, 303, 'chargerId mapped to unifiedPointId');
  runner.assertEquals(result.providerName, 'bluePlug', 'providerName preserved');
  runner.assertEquals(result.currentStatus, 'available', 'currentStatus mapped');
  runner.assertEquals(result.reservationEndTime, null, 'reservationEnd mapped');
  runner.assertEquals(result.pricePerKwh, 0.59, 'pricePerKwh preserved');
  runner.assertEquals(result.coordinates.longitude, 23.8103, 'geo[0] is longitude');
  runner.assertEquals(result.coordinates.latitude, 37.9973, 'geo[1] is latitude');
});

runner.test('BluePlugMapper - Array coordinates [long, lat]', () => {
  const blueData = {
    chargerId: 303,
    providerName: 'bluePlug',
    currentStatus: 'available',
    reservationEnd: null,
    pricePerKwh: 0.59,
    geo: [23.8103, 37.9973]
  };

  const result = BluePlugMapper.normalize(blueData);
  runner.assert(Array.isArray([23.8103, 37.9973]), 'input geo is array');
  runner.assertEquals(result.coordinates.longitude, 23.8103, 'array[0] → longitude');
  runner.assertEquals(result.coordinates.latitude, 37.9973, 'array[1] → latitude');
});

runner.test('BluePlugMapper - With reservation', () => {
  const blueData = {
    chargerId: 303,
    providerName: 'bluePlug',
    currentStatus: 'reserved',
    reservationEnd: '2026-05-29T20:00:00Z',
    pricePerKwh: 0.59,
    geo: [23.8103, 37.9973]
  };

  const result = BluePlugMapper.normalize(blueData);
  runner.assertEquals(result.currentStatus, 'reserved', 'reserved status captured');
  runner.assertEquals(result.reservationEndTime, '2026-05-29T20:00:00Z', 'reservation end captured');
});

runner.test('BluePlugMapper - Missing geo defaults to [0, 0]', () => {
  const blueData = {
    chargerId: 303,
    providerName: 'bluePlug',
    currentStatus: 'available',
    reservationEnd: null,
    pricePerKwh: 0.59
    // geo missing
  };

  const result = BluePlugMapper.normalize(blueData);
  runner.assertEquals(result.coordinates.longitude, 0, 'missing geo[0] defaults to 0');
  runner.assertEquals(result.coordinates.latitude, 0, 'missing geo[1] defaults to 0');
});

// ============================================================================
// TEST SUITE 4: ProviderDataMapper (Main Orchestrator)
// ============================================================================
console.log('\n📋 TEST SUITE 4: ProviderDataMapper (Main Orchestrator)');
console.log('─'.repeat(60));

runner.test('ProviderDataMapper - Auto-detect redPlug', () => {
  const data = {
    pointid: 101,
    providerName: 'redPlug',
    status: 'available',
    long: 23.7275,
    lat: 37.9838
  };

  const result = ProviderDataMapper.normalize(data);
  runner.assertEquals(result.unifiedPointId, 101, 'redPlug detected and normalized');
  runner.assertEquals(result.providerName, 'redPlug', 'provider name preserved');
});

runner.test('ProviderDataMapper - Auto-detect greenPlug', () => {
  const data = {
    id: 202,
    providerName: 'greenPlug',
    state: 'occupied',
    kwhRateEur: 0.45,
    coords: { long: 23.9445, lat: 37.8847 }
  };

  const result = ProviderDataMapper.normalize(data);
  runner.assertEquals(result.unifiedPointId, 202, 'greenPlug detected and normalized');
  runner.assertEquals(result.providerName, 'greenPlug', 'provider name preserved');
});

runner.test('ProviderDataMapper - Auto-detect bluePlug', () => {
  const data = {
    chargerId: 303,
    providerName: 'bluePlug',
    currentStatus: 'available',
    pricePerKwh: 0.59,
    geo: [23.8103, 37.9973]
  };

  const result = ProviderDataMapper.normalize(data);
  runner.assertEquals(result.unifiedPointId, 303, 'bluePlug detected and normalized');
  runner.assertEquals(result.providerName, 'bluePlug', 'provider name preserved');
});

runner.test('ProviderDataMapper - Normalize array of mixed providers', () => {
  const mixedArray = [
    { pointid: 101, providerName: 'redPlug', status: 'available', long: 23.7, lat: 37.9 },
    { id: 202, providerName: 'greenPlug', state: 'occupied', kwhRateEur: 0.45, coords: { long: 23.9, lat: 37.8 } },
    { chargerId: 303, providerName: 'bluePlug', currentStatus: 'available', pricePerKwh: 0.59, geo: [23.8, 37.9] }
  ];

  const results = ProviderDataMapper.normalizeArray(mixedArray);
  runner.assertEquals(results.length, 3, 'all 3 points normalized');
  runner.assertEquals(results[0].unifiedPointId, 101, 'first is red');
  runner.assertEquals(results[1].unifiedPointId, 202, 'second is green');
  runner.assertEquals(results[2].unifiedPointId, 303, 'third is blue');
});

runner.test('ProviderDataMapper - Unknown provider throws error', () => {
  const invalidData = {
    pointid: 999,
    providerName: 'unknownProvider',
    status: 'available'
  };

  try {
    ProviderDataMapper.normalize(invalidData);
    throw new Error('Should have thrown');
  } catch (error) {
    runner.assert(
      error.message.includes('Unknown provider'),
      'Throws error for unknown provider'
    );
  }
});

runner.test('ProviderDataMapper - Normalize by explicit provider', () => {
  const dataWithoutProvider = {
    pointid: 101,
    status: 'available',
    long: 23.7275,
    lat: 37.9838
  };

  const result = ProviderDataMapper.normalizeByProvider('redPlug', dataWithoutProvider);
  runner.assertEquals(result.unifiedPointId, 101, 'data normalized with explicit provider');
  runner.assertEquals(result.providerName, 'redPlug', 'explicit provider set');
});

// ============================================================================
// TEST SUITE 5: UnifiedPoint Class
// ============================================================================
console.log('\n📋 TEST SUITE 5: UnifiedPoint Class');
console.log('─'.repeat(60));

runner.test('UnifiedPoint - toJSON() returns correct structure', () => {
  const unified = new UnifiedPoint({
    unifiedPointId: 101,
    providerName: 'redPlug',
    currentStatus: 'available',
    reservationEndTime: null,
    pricePerKwh: 0.45,
    coordinates: {
      longitude: 23.7275,
      latitude: 37.9838
    }
  });

  const json = unified.toJSON();
  runner.assertEquals(json.unifiedPointId, 101, 'unifiedPointId in JSON');
  runner.assertEquals(json.providerName, 'redPlug', 'providerName in JSON');
  runner.assertEquals(json.currentStatus, 'available', 'currentStatus in JSON');
  runner.assertEquals(json.reservationEndTime, null, 'reservationEndTime in JSON');
  runner.assertEquals(json.pricePerKwh, 0.45, 'pricePerKwh in JSON');
  runner.assertEquals(json.coordinates.longitude, 23.7275, 'coordinates in JSON');
  runner.assertEquals(json.coordinates.latitude, 37.9838, 'coordinates in JSON');
});

runner.test('UnifiedPoint - Default values when empty', () => {
  const unified = new UnifiedPoint();
  const json = unified.toJSON();

  runner.assertEquals(json.unifiedPointId, null, 'null unifiedPointId');
  runner.assertEquals(json.providerName, null, 'null providerName');
  runner.assertEquals(json.pricePerKwh, 0, 'default price is 0');
  runner.assertEquals(json.coordinates.longitude, 0, 'default longitude is 0');
  runner.assertEquals(json.coordinates.latitude, 0, 'default latitude is 0');
});

// ============================================================================
// TEST SUITE 6: Edge Cases & Error Handling
// ============================================================================
console.log('\n📋 TEST SUITE 6: Edge Cases & Error Handling');
console.log('─'.repeat(60));

runner.test('Edge case - Zero coordinates', () => {
  const redData = {
    pointid: 101,
    providerName: 'redPlug',
    status: 'available',
    long: 0,
    lat: 0
  };

  const result = RedPlugMapper.normalize(redData);
  runner.assertEquals(result.coordinates.longitude, 0, 'zero longitude accepted');
  runner.assertEquals(result.coordinates.latitude, 0, 'zero latitude accepted');
});

runner.test('Edge case - Negative coordinates', () => {
  const redData = {
    pointid: 101,
    providerName: 'redPlug',
    status: 'available',
    long: -23.7275,
    lat: -37.9838
  };

  const result = RedPlugMapper.normalize(redData);
  runner.assertEquals(result.coordinates.longitude, -23.7275, 'negative longitude accepted');
  runner.assertEquals(result.coordinates.latitude, -37.9838, 'negative latitude accepted');
});

runner.test('Edge case - Very large numbers', () => {
  const blueData = {
    chargerId: 999999999,
    providerName: 'bluePlug',
    currentStatus: 'available',
    pricePerKwh: 999.99,
    geo: [180, 90]
  };

  const result = BluePlugMapper.normalize(blueData);
  runner.assertEquals(result.unifiedPointId, 999999999, 'large ID handled');
  runner.assertEquals(result.pricePerKwh, 999.99, 'large price handled');
});

runner.test('Edge case - Empty coordinates object', () => {
  const greenData = {
    id: 202,
    providerName: 'greenPlug',
    state: 'available',
    kwhRateEur: 0.45,
    coords: {}
  };

  const result = GreenPlugMapper.normalize(greenData);
  runner.assertEquals(result.coordinates.longitude, 0, 'empty coords.long → 0');
  runner.assertEquals(result.coordinates.latitude, 0, 'empty coords.lat → 0');
});

runner.test('Edge case - Whitespace in strings', () => {
  const redData = {
    pointid: 101,
    providerName: 'redPlug',
    status: '  available  ',
    long: 23.7275,
    lat: 37.9838
  };

  const result = RedPlugMapper.normalize(redData);
  // Note: mapper preserves whitespace as-is (could add trim if needed)
  runner.assertEquals(result.currentStatus, '  available  ', 'whitespace preserved');
});

// ============================================================================
// TEST SUITE 7: Consistency Across Providers
// ============================================================================
console.log('\n📋 TEST SUITE 7: Consistency Across Providers');
console.log('─'.repeat(60));

runner.test('Consistency - Same output structure regardless of provider', () => {
  const redResult = RedPlugMapper.normalize({
    pointid: 101,
    providerName: 'redPlug',
    status: 'available',
    long: 23.7275,
    lat: 37.9838
  });

  const greenResult = GreenPlugMapper.normalize({
    id: 202,
    providerName: 'greenPlug',
    state: 'available',
    kwhRateEur: 0.45,
    coords: { long: 23.9445, lat: 37.8847 }
  });

  const blueResult = BluePlugMapper.normalize({
    chargerId: 303,
    providerName: 'bluePlug',
    currentStatus: 'available',
    pricePerKwh: 0.59,
    geo: [23.8103, 37.9973]
  });

  // All have same keys
  const redKeys = Object.keys(redResult.toJSON()).sort();
  const greenKeys = Object.keys(greenResult.toJSON()).sort();
  const blueKeys = Object.keys(blueResult.toJSON()).sort();

  runner.assertEquals(redKeys.length, greenKeys.length, 'same number of fields');
  runner.assertEquals(greenKeys.length, blueKeys.length, 'same number of fields');
});

runner.test('Consistency - All results serializable to JSON', () => {
  const results = [
    RedPlugMapper.normalize({
      pointid: 101,
      providerName: 'redPlug',
      status: 'available',
      long: 23.7275,
      lat: 37.9838
    }),
    GreenPlugMapper.normalize({
      id: 202,
      providerName: 'greenPlug',
      state: 'available',
      kwhRateEur: 0.45,
      coords: { long: 23.9445, lat: 37.8847 }
    }),
    BluePlugMapper.normalize({
      chargerId: 303,
      providerName: 'bluePlug',
      currentStatus: 'available',
      pricePerKwh: 0.59,
      geo: [23.8103, 37.9973]
    })
  ];

  results.forEach((result, index) => {
    try {
      const json = JSON.stringify(result.toJSON());
      runner.assert(json.length > 0, `result ${index} serializable`);
    } catch (error) {
      throw new Error(`Result ${index} not serializable: ${error.message}`);
    }
  });
});

// ============================================================================
// Run all tests and print summary
// ============================================================================
runner.summary();

module.exports = {
  TestRunner,
  RedPlugMapper,
  GreenPlugMapper,
  BluePlugMapper,
  ProviderDataMapper
};
