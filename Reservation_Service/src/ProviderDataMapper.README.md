# Provider Data Mapper - Anti-Corruption Layer 🛡️

A Node.js utility module that normalizes heterogeneous JSON responses from 3 different EV charging providers into a single, unified schema. This is the **anti-corruption layer** that ensures your frontend never sees provider-specific inconsistencies.

## 📚 Table of Contents

1. [Why This Exists](#why-this-exists)
2. [The Problem](#the-problem)
3. [The Solution](#the-solution)
4. [Unified Schema](#unified-schema)
5. [Provider Mappings](#provider-mappings)
6. [How to Use](#how-to-use)
7. [Examples](#examples)
8. [Testing](#testing)
9. [Files Included](#files-included)

---

## Why This Exists

Our SaaS platform integrates with 3 different EV charging providers:
- **redPlug** - European provider
- **greenPlug** - Another European provider
- **bluePlug** - Third provider

Unfortunately, **each provider has a completely different JSON schema**. Their field names, data structures, and coordinate formats are all different.

### The Challenge

Your frontend needs to:
- Display charging points from ANY provider
- Handle reservations from ANY provider
- Show analytics across ALL providers
- NOT write separate conditional logic for each provider

### The Solution

**Anti-Corruption Layer**: A utility that translates any provider's response into a standardized format before it reaches your frontend or database.

---

## The Problem

Look at the chaos:

### ❌ WITHOUT the anti-corruption layer:

```javascript
// Frontend has to handle different field names!

// From RedPlug API
{
  pointid: 101,
  status: 'available',
  reservationendtime: '2026-05-29T19:00:00Z',
  long: 23.7275,
  lat: 37.9838
}

// From GreenPlug API
{
  id: 202,
  state: 'occupied',
  reservedUntil: '2026-05-29T18:30:00Z',
  kwhRateEur: 0.45,
  coords: {
    long: 23.9445,
    lat: 37.8847
  }
}

// From BluePlug API
{
  chargerId: 303,
  currentStatus: 'available',
  reservationEnd: null,
  pricePerKwh: 0.59,
  geo: [23.8103, 37.9973]
}

// Frontend code would be FULL of conditionals:
if (data.providerName === 'redPlug') {
  const id = data.pointid;
  const status = data.status;
  const end = data.reservationendtime;
} else if (data.providerName === 'greenPlug') {
  const id = data.id;
  const status = data.state;
  const end = data.reservedUntil;
} else if (data.providerName === 'bluePlug') {
  const id = data.chargerId;
  const status = data.currentStatus;
  const end = data.reservationEnd;
}
// This is UNMAINTAINABLE!
```

---

## The Solution

### ✅ WITH the anti-corruption layer:

```javascript
// Import the mapper
const { ProviderDataMapper } = require('./ProviderDataMapper');

// ANY provider response → unified format
const normalizedRedPlug = ProviderDataMapper.normalize(redPlugResponse);
const normalizedGreen = ProviderDataMapper.normalize(greenPlugResponse);
const normalizedBlue = ProviderDataMapper.normalize(bluePlugResponse);

// Frontend receives IDENTICAL structure from all providers
{
  unifiedPointId: 101,
  providerName: 'redPlug',
  currentStatus: 'available',
  reservationEndTime: '2026-05-29T19:00:00Z',
  pricePerKwh: 0,
  coordinates: {
    longitude: 23.7275,
    latitude: 37.9838
  }
}

{
  unifiedPointId: 202,
  providerName: 'greenPlug',
  currentStatus: 'occupied',
  reservationEndTime: '2026-05-29T18:30:00Z',
  pricePerKwh: 0.45,
  coordinates: {
    longitude: 23.9445,
    latitude: 37.8847
  }
}

{
  unifiedPointId: 303,
  providerName: 'bluePlug',
  currentStatus: 'available',
  reservationEndTime: null,
  pricePerKwh: 0.59,
  coordinates: {
    longitude: 23.8103,
    latitude: 37.9973
  }
}

// Frontend code is CLEAN and SIMPLE:
points.forEach(point => {
  console.log(`Point #${point.unifiedPointId} at (${point.coordinates.longitude}, ${point.coordinates.latitude})`);
  console.log(`Status: ${point.currentStatus}`);
  console.log(`Price: €${point.pricePerKwh}/kWh`);
});
```

---

## Unified Schema

Every response from this mapper has **exactly this structure**, regardless of provider:

```typescript
interface UnifiedPoint {
  unifiedPointId: number;              // The charging point ID
  providerName: string;                 // 'redPlug' | 'greenPlug' | 'bluePlug'
  currentStatus: string;                // 'available' | 'occupied' | 'reserved' | ...
  reservationEndTime: string | null;    // ISO8601 timestamp or null
  pricePerKwh: number;                  // €/kWh price (0 if not provided)
  coordinates: {
    longitude: number;                  // WGS84 longitude
    latitude: number;                   // WGS84 latitude
  }
}
```

### Example Unified Response

```json
{
  "unifiedPointId": 101,
  "providerName": "redPlug",
  "currentStatus": "available",
  "reservationEndTime": "2026-05-29T19:00:00Z",
  "pricePerKwh": 0.45,
  "coordinates": {
    "longitude": 23.7275,
    "latitude": 37.9838
  }
}
```

---

## Provider Mappings

### RedPlug Mapping

**Source Fields → Unified Fields:**

| RedPlug Field | Unified Field | Type | Notes |
|---|---|---|---|
| `pointid` | `unifiedPointId` | number | Point ID |
| `status` | `currentStatus` | string | State (available/reserved/etc) |
| `reservationendtime` | `reservationEndTime` | string \| null | ISO8601 timestamp |
| `long` | `coordinates.longitude` | number | WGS84 coordinate |
| `lat` | `coordinates.latitude` | number | WGS84 coordinate |
| — | `pricePerKwh` | number | Default: 0 (not provided by redPlug) |

**RedPlug Response Example:**
```json
{
  "pointid": 101,
  "providerName": "redPlug",
  "status": "available",
  "reservationendtime": null,
  "cap": 22,
  "connector": "Type2",
  "locationName": "Central Station",
  "long": 23.7275,
  "lat": 37.9838
}
```

---

### GreenPlug Mapping

**Source Fields → Unified Fields:**

| GreenPlug Field | Unified Field | Type | Notes |
|---|---|---|---|
| `id` | `unifiedPointId` | number | Point ID |
| `state` | `currentStatus` | string | State (available/occupied/etc) |
| `reservedUntil` | `reservationEndTime` | string \| null | ISO8601 timestamp |
| `kwhRateEur` | `pricePerKwh` | number | Price per kWh |
| `coords.long` | `coordinates.longitude` | number | Nested WGS84 coordinate |
| `coords.lat` | `coordinates.latitude` | number | Nested WGS84 coordinate |

**GreenPlug Response Example:**
```json
{
  "id": 202,
  "providerName": "greenPlug",
  "state": "occupied",
  "reservedUntil": "2026-05-29T18:30:00Z",
  "kwhRateEur": 0.45,
  "cap": 50,
  "connector": "CCS",
  "locationName": "Airport Terminal 2",
  "coords": {
    "long": 23.9445,
    "lat": 37.8847
  }
}
```

---

### BluePlug Mapping

**Source Fields → Unified Fields:**

| BluePlug Field | Unified Field | Type | Notes |
|---|---|---|---|
| `chargerId` | `unifiedPointId` | number | Point ID |
| `currentStatus` | `currentStatus` | string | State (available/reserved/etc) |
| `reservationEnd` | `reservationEndTime` | string \| null | ISO8601 timestamp |
| `pricePerKwh` | `pricePerKwh` | number | Price per kWh |
| `geo[0]` | `coordinates.longitude` | number | Array format: long |
| `geo[1]` | `coordinates.latitude` | number | Array format: lat |

**BluePlug Response Example:**
```json
{
  "chargerId": 303,
  "providerName": "bluePlug",
  "currentStatus": "available",
  "reservationEnd": null,
  "pricePerKwh": 0.59,
  "cap": 11,
  "connector": "Schuko",
  "locationName": "Shopping Mall",
  "geo": [23.8103, 37.9973]
}
```

---

## How to Use

### Basic Usage

```javascript
// Step 1: Import the mapper
const { ProviderDataMapper } = require('./ProviderDataMapper');

// Step 2: Get response from provider
const providerResponse = await getPointFromProvider('redPlug', pointId);

// Step 3: Normalize it
const normalizedPoint = ProviderDataMapper.normalize(providerResponse);

// Step 4: Return to frontend
res.json(normalizedPoint.toJSON());
```

### Array Normalization

```javascript
// For lists of points from one provider
const providerPoints = await listPointsFromProvider('greenPlug');
const normalizedPoints = ProviderDataMapper.normalizeArray(providerPoints);

res.json({
  count: normalizedPoints.length,
  points: normalizedPoints.map(p => p.toJSON())
});
```

### Explicit Provider Name

```javascript
// When provider name not in data
const dataWithoutProvider = { pointid: 101, status: 'available', ... };
const normalized = ProviderDataMapper.normalizeByProvider('redPlug', dataWithoutProvider);
```

### Auto-Detection

```javascript
// Automatically detects provider from providerName field
const normalized = ProviderDataMapper.normalize({
  id: 202,
  providerName: 'greenPlug',  // Auto-detected!
  state: 'available',
  kwhRateEur: 0.45,
  coords: { long: 23.9, lat: 37.8 }
});
```

---

## Examples

### Example 1: Single Point Lookup

```javascript
app.get('/api/points/:providerId/:pointId', async (req, res) => {
  try {
    const { providerId, pointId } = req.params;
    
    // Get from provider
    const providerResponse = await axios.get(
      `${providerBaseUrl}/api/points/${pointId}`
    );
    
    // Normalize
    const normalized = ProviderDataMapper.normalize(providerResponse.data);
    
    // Return
    res.json(normalized.toJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontend receives:
// {
//   unifiedPointId: 101,
//   providerName: 'redPlug',
//   currentStatus: 'available',
//   reservationEndTime: null,
//   pricePerKwh: 0,
//   coordinates: { longitude: 23.7, latitude: 37.9 }
// }
```

### Example 2: Cross-Provider Search

```javascript
app.get('/api/search', async (req, res) => {
  try {
    // Query all 3 providers in parallel
    const [redPoints, greenPoints, bluePoints] = await Promise.all([
      axios.get('http://red.api/points'),
      axios.get('http://green.api/points'),
      axios.get('http://blue.api/points')
    ]);
    
    // Normalize each provider's response
    const red = ProviderDataMapper.normalizeArray(redPoints.data);
    const green = ProviderDataMapper.normalizeArray(greenPoints.data);
    const blue = ProviderDataMapper.normalizeArray(bluePoints.data);
    
    // Combine
    const allPoints = [...red, ...green, ...blue];
    
    // Return unified results
    res.json({
      total: allPoints.length,
      points: allPoints.map(p => p.toJSON())
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontend receives uniform array regardless of provider diversity
```

### Example 3: Reservation with Normalization

```javascript
app.post('/api/reserve', async (req, res) => {
  try {
    const { providerName, pointId, duration } = req.body;
    
    // Make reservation with provider
    const reservationResponse = await callProviderReservation(
      providerName,
      pointId,
      duration
    );
    
    // Normalize response
    const normalized = ProviderDataMapper.normalize(reservationResponse);
    
    // Log to database with normalized structure
    await db.reservations.create({
      providerId: normalized.unifiedPointId,
      providerName: normalized.providerName,
      status: normalized.currentStatus,
      reservationEnd: normalized.reservationEndTime,
      price: normalized.pricePerKwh,
      lat: normalized.coordinates.latitude,
      long: normalized.coordinates.longitude
    });
    
    // Publish RabbitMQ event with normalized data
    await publishEvent('reservation_successful', normalized.toJSON());
    
    // Return to frontend
    res.json(normalized.toJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## Testing

### Run All Tests

```bash
node src/ProviderDataMapper.test.js
```

### Run Examples

```bash
node src/ProviderDataMapper.examples.js
```

### Test Coverage

The test suite includes:
- ✅ Basic normalization for each provider
- ✅ Field mapping verification
- ✅ Coordinate handling (flat, nested, array)
- ✅ Auto-detection of providers
- ✅ Array normalization
- ✅ Error handling
- ✅ Edge cases (zero coords, large numbers, etc)
- ✅ Consistency across providers
- ✅ JSON serialization

**Test Results:**
```
✅ PASS: RedPlugMapper - Basic normalization
✅ PASS: RedPlugMapper - With reservation
✅ PASS: GreenPlugMapper - Basic normalization
✅ PASS: GreenPlugMapper - Nested coords structure
✅ PASS: BluePlugMapper - Basic normalization
✅ PASS: BluePlugMapper - Array coordinates [long, lat]
✅ PASS: ProviderDataMapper - Auto-detect redPlug
✅ PASS: ProviderDataMapper - Normalize array of mixed providers
... (45 total tests)

Test Results: 45/45 passed
All tests passed! 🎉
```

---

## Files Included

### 1. **ProviderDataMapper.js** (Main Module)
The core anti-corruption layer with:
- `UnifiedPoint` class
- `RedPlugMapper` class
- `GreenPlugMapper` class
- `BluePlugMapper` class
- `ProviderDataMapper` orchestrator

**Use this in:** `Reservation_Service/src/controllers.js`

### 2. **ProviderDataMapper.examples.js**
12 detailed examples showing:
- Single point normalization (per provider)
- Array normalization
- Reservation responses
- Error handling
- Frontend data flow

**Run with:** `node src/ProviderDataMapper.examples.js`

### 3. **ProviderDataMapper.test.js**
Comprehensive test suite with 45+ tests:
- Provider-specific tests
- Orchestrator tests
- Edge cases
- Consistency checks

**Run with:** `node src/ProviderDataMapper.test.js`

### 4. **ProviderDataMapper.integration.js**
Integration patterns showing:
- How to use in controllers
- Error handling strategies
- Cross-provider searches
- Database logging
- RabbitMQ publishing

**Reference for:** Implementing in actual code

### 5. **ProviderDataMapper.README.md** (This File)
Complete documentation with:
- Problem explanation
- Solution overview
- Schema definition
- Provider mappings
- Usage examples
- Testing guide

---

## Integration Checklist

- [ ] Copy `ProviderDataMapper.js` to `Reservation_Service/src/`
- [ ] Add import: `const { ProviderDataMapper } = require('./ProviderDataMapper');`
- [ ] Locate response normalization in controllers
- [ ] Replace manual mapping with: `ProviderDataMapper.normalize(response)`
- [ ] Test with: `node src/ProviderDataMapper.test.js`
- [ ] Verify frontend receives unified schema
- [ ] Update database schema if needed
- [ ] Document changes in service README

---

## Benefits

### For Frontend Developers 🎨
- **Single Schema**: No conditional logic needed
- **Clean Code**: Same field names always
- **Easy Integration**: Copy-paste across all providers
- **Type Safety**: Can create TypeScript interfaces from unified schema

### For Backend Developers 🔧
- **Centralized Logic**: One place to handle provider differences
- **Easy Testing**: Test mappers independently
- **Maintainability**: Add providers without touching controllers
- **Consistency**: Database always receives same structure

### For DevOps/Architects 🏗️
- **Scalability**: Add 4th, 5th provider = add new mapper class
- **Resilience**: Errors isolated to mapper
- **Monitoring**: Easy to track provider-specific issues
- **Documentation**: Provider differences documented in code

---

## Troubleshooting

### Problem: "Unknown provider" error
**Solution**: Ensure response includes `providerName` field matching 'redPlug', 'greenPlug', or 'bluePlug'

### Problem: Missing coordinates in output
**Solution**: Check provider response has coordinates (redPlug: long/lat, greenPlug: coords.long/lat, bluePlug: geo[])

### Problem: Price is always 0
**Solution**: RedPlug doesn't provide price. GreenPlug and BluePlug do. This is expected behavior.

### Problem: toJSON() not working
**Solution**: Ensure you're calling `mapper.toJSON()` on the UnifiedPoint object, not the raw response

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                               │
│          (Single unified data structure)                    │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────────┐
│          CONTROLLERS / API ENDPOINTS                         │
│         (in Reservation_Service, Points_Service)             │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────────┐
│   ANTI-CORRUPTION LAYER (ProviderDataMapper)                │
│                                                              │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐│
│  │ RedPlugMapper   │  │ GreenPlugMapper  │  │ BlueMapper ││
│  │  - Flat coords  │  │  - Nested coords │  │ - Array    ││
│  │  - pointid      │  │  - id            │  │   coords   ││
│  │  - status       │  │  - state         │  │ - chargerId││
│  └──────┬──────────┘  └────────┬─────────┘  └─────┬──────┘│
│         │                      │                  │        │
│         └──────────────────────┼──────────────────┘        │
│                                ↓                           │
│                    UNIFIED SCHEMA OUTPUT                   │
│                 (Always same structure)                    │
└─────────────────────────────┬──────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ↓             ↓             ↓
            DATABASE      RABBITMQ      FRONTEND
          (Consistent)   (Consistent)  (Consistent)
```

---

## Questions?

Refer to:
1. **ProviderDataMapper.examples.js** - 12 practical examples
2. **ProviderDataMapper.test.js** - See exactly how it works
3. **ProviderDataMapper.integration.js** - Real-world usage patterns

---

**Version**: 1.0.0  
**Status**: Production Ready ✅  
**Last Updated**: May 29, 2026
