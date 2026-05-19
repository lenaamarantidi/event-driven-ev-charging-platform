# SaaS Plug - Microservices Architecture

Advanced microservices platform για τη διαχείριση σημείων φόρτισης ηλεκτρικών οχημάτων από 3 παρόχους με διαφορετικά API contracts.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      API Gateway (8000)                       │
│                    Single Entry Point                          │
└─────┬──────────────┬──────────────┬──────────────┬────────────┘
      │              │              │              │
      ▼              ▼              ▼              ▼
┌─────────────┐ ┌──────────┐ ┌────────────┐ ┌─────────┐
│   Points    │ │  Status  │ │Reservation │ │  Map    │
│  Service    │ │ Service  │ │ Service    │ │ Service │
│ (3001)      │ │ (3002)   │ │ (3003)     │ │ (3006)  │
└─┬───────────┘ └──────────┘ └────────────┘ └─────────┘
  │
  └──────────────────────────────────────────┐
                                             │
          ┌─────────────────────────────────┐
          │    EXTERNAL PROVIDERS           │
          │ ┌──────┬──────┬──────────────┐  │
          │ │  Red │Green │ Blue         │  │
          │ │ Plug │ Plug │ Plug         │  │
          │ └──────┴──────┴──────────────┘  │
          └─────────────────────────────────┘
```

## 🔌 Provider API Mapping

**Το κύριο πρόβλημα**: Κάθε πάροχος χρησιμοποιεί διαφορετικά endpoint names για τις **ίδιες** λειτουργίες.

### RedPlug Endpoints
```
GET  /redPlug/api/points              → Λίστα όλων των σημείων
GET  /redPlug/api/point/{pointid}     → Λεπτομέρειες σημείου
POST /redPlug/api/reserve/{pointid}   → Κράτηση χωρίς διάρκεια
POST /redPlug/api/reserve/{pointid}/{minutes} → Κράτηση με διάρκεια
```

### GreenPlug Endpoints
```
GET  /greenPlug/api/chargingPoints    → Λίστα όλων των σημείων
GET  /greenPlug/api/chargingPoints/{pointid} → Λεπτομέρειες σημείου
POST /greenPlug/api/chargingPoints/{pointid}/reservations → Κράτηση χωρίς διάρκεια
POST /greenPlug/api/chargingPoints/{pointid}/reservations/{minutes} → Κράτηση με διάρκεια
```

### BluePlug Endpoints
```
GET  /bluePlug/api/locations          → Λίστα όλων των σημείων
GET  /bluePlug/api/location/{pointid} → Λεπτομέρειες σημείου
POST /bluePlug/api/location/{pointid}/hold → Κράτηση χωρίς διάρκεια
POST /bluePlug/api/location/{pointid}/hold/{minutes} → Κράτηση με διάρκεια
```

## 🔧 Factory Pattern Solution

Ο κώδικας χρησιμοποιεί **ProviderAdapterFactory** που κάνει mapping των διαφόρων endpoints:

```javascript
// adapters/providerAdapter.js
const adapter = ProviderAdapterFactory.createAdapter('redPlug');
const url = adapter.getListPointsUrl(); // /redPlug/api/points

const adapter = ProviderAdapterFactory.createAdapter('greenPlug');
const url = adapter.getListPointsUrl(); // /greenPlug/api/chargingPoints

const adapter = ProviderAdapterFactory.createAdapter('bluePlug');
const url = adapter.getListPointsUrl(); // /bluePlug/api/locations
```

## 🚀 Services

### 1. **API Gateway** (Port 8000)
**Unified entry point** για όλα τα requests

```bash
# Health check όλων των services
curl http://localhost:8000/health

# Routing examples
GET  http://localhost:8000/api/points         → Points Service (3001)
POST http://localhost:8000/api/reservations   → Reservation Service (3003)
GET  http://localhost:8000/api/map            → Map Service (3006)
```

### 2. **Points Service** (Port 3001)
Aggregates points από όλους τους παρόχους

```bash
# Λήψη όλων των σημείων (aggregated)
GET /api/points
# Returns: { total: 250, points: [...] }

# Λήψη σημείων φιλτραρισμένα κατά status
GET /api/points?status=available
GET /api/points?status=charging

# Λήψη σημείων από συγκεκριμένο παροχό
GET /api/points?provider=redPlug

# Λήψη συγκεκριμένου σημείου από παροχό
GET /api/points/redPlug/1
GET /api/points/greenPlug/42
GET /api/points/bluePlug/7

# Search φιλτραρισμένα
GET /api/search?status=available&provider=red&capacity_min=20

# Statistics
GET /api/statistics
# Returns: { total_points, by_provider, by_status, avg_capacity_kw }
```

### 3. **Reservation Service** (Port 3003)
Κρατήσεις σημείων σε όλους τους παρόχους

```bash
# Δημιουργία κράτησης
POST /api/reservations
{
  "provider": "redPlug",      # ή "greenPlug" ή "bluePlug"
  "pointid": "1",
  "minutes": 30,              # optional
  "userId": "user123"         # optional
}

# Returns:
# {
#   "reservation_id": "uuid",
#   "success": true,
#   "status": "reserved",
#   "reservation_end_time": "2025-11-10 19:00"
# }

# Λήψη όλων των κρατήσεων
GET /api/reservations

# Φιλτραρισμένες κρατήσεις
GET /api/reservations?provider=redPlug
```
Κρατήσεις σημείων σε όλους τους παρόχους

```bash
# Δημιουργία κράτησης
POST /api/reservations
{
  "provider": "redPlug",      # ή "greenPlug" ή "bluePlug"
  "pointid": "1",
  "minutes": 30,              # optional
  "userId": "user123"         # optional
}

# Returns:
# {
#   "reservation_id": "uuid",
#   "success": true,
#   "status": "reserved",
#   "reservation_end_time": "2025-11-10 19:00"
# }

# Λήψη όλων των κρατήσεων
GET /api/reservations

# Φιλτραρισμένες κρατήσεις
GET /api/reservations?provider=redPlug
GET /api/reservations?status=success
GET /api/reservations?user_id=user123

# Λήψη συγκεκριμένης κράτησης
GET /api/reservations/:id

# Κρατήσεις συγκεκριμένου παρόχου
GET /api/reservations/by-provider/redPlug

# Statistics κρατήσεων
GET /api/reservations/statistics
# Returns: { total, by_status, by_provider, success_rate }
```

## 📊 Provider Adapter Architecture

### File Structure
```
Points_Service/
├── src/
│   ├── index.js
│   └── adapters/
│       └── providerAdapter.js
└── package.json

Reservation_Service/
├── src/
│   ├── index.js
│   └── adapters/
│       └── providerAdapter.js
└── package.json

API_Gateway/
├── src/
│   └── index.js
└── package.json
```

### Provider Configuration Example
```javascript
// From providerAdapter.js
const providerConfigs = {
  redPlug: {
    name: 'redPlug',
    baseUrl: 'https://davinci.softlab.ntua.gr/saas26/redPlug/api',
    endpoints: {
      listPoints: '/points',
      getPoint: '/point/{pointid}',
      reserve: '/reserve/{pointid}',
      reserveWithMinutes: '/reserve/{pointid}/{minutes}'
    }
  },
  greenPlug: {
    name: 'greenPlug',
    baseUrl: 'https://davinci.softlab.ntua.gr/saas26/greenPlug/api',
    endpoints: {
      listPoints: '/chargingPoints',
      getPoint: '/chargingPoints/{pointid}',
      reserve: '/chargingPoints/{pointid}/reservations',
      reserveWithMinutes: '/chargingPoints/{pointid}/reservations/{minutes}'
    }
  },
  bluePlug: {
    name: 'bluePlug',
    baseUrl: 'https://davinci.softlab.ntua.gr/saas26/bluePlug/api',
    endpoints: {
      listPoints: '/locations',
      getPoint: '/location/{pointid}',
      reserve: '/location/{pointid}/hold',
      reserveWithMinutes: '/location/{pointid}/hold/{minutes}'
    }
  }
};
```

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd Points_Service && npm install
cd ../Status_Service && npm install
cd ../Reservation_Service && npm install
cd ../API_Gateway && npm install
```

### 2. Start Services
```bash
# Terminal 1: Points Service
cd Points_Service
npm start

# Terminal 2: Status Service
cd Status_Service
npm start

# Terminal 3: Reservation Service  
cd Reservation_Service
npm start

# Terminal 4: API Gateway
cd API_Gateway
npm start
```

### 3. Test Endpoints
```bash
# Test via Gateway
curl http://localhost:8000/api/points

# Test direct service
curl http://localhost:3001/api/points

# Check health
curl http://localhost:8000/health
```

## 📝 Environment Variables

```env
# Provider APIs (default to external URLs)
REDPLUG_API_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_API_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_API_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api

# Service URLs (for inter-service communication)
POINTS_SERVICE_URL=http://localhost:3001
RESERVATION_SERVICE_URL=http://localhost:3003

# Server Ports
PORT=8000  # Gateway
```

## 💡 Key Design Patterns

### 1. **Factory Pattern** (ProviderAdapterFactory)
Creates appropriate adapter για κάθε παροχό

### 2. **Adapter Pattern** (ProviderAdapter)
Normalizes requests/responses ανά παροχό

### 3. **Aggregation Pattern** (Points Service)
Combines data από multiple sources

### 4. **API Gateway Pattern** (API Gateway)
Single entry point με routing

## 🔍 Data Normalization

Ο κώδικας κάνει normalize των διαφόρων response formats:

```javascript
// RedPlug response
{
  pointid: 1,
  lon: "23.7345",
  lat: "37.9838",
  status: "available",
  cap: 50,
  kwhprice: 0.59
}

// GreenPlug response
{
  pointid: 1,
  lon: "23.7345",
  lat: "37.9838",
  status: "available",
  cap: 50,
  kwhprice: 0.59
}

// BluePlug response
{
  pointid: 1,
  longitude: "23.7345",
  latitude: "37.9838",
  status: "available",
  capacity: 50,
  price: 0.59
}

↓ Normalize to:

{
  pointid: 1,
  provider: "bluePlug",
  lon: "23.7345",
  lat: "37.9838",
  status: "available",
  capacity_kw: 50,
  kwh_price: 0.59
}
```

## 📈 Flow Examples

### Example 1: Search All Available Points
```
User → GET /api/points?status=available
     → API Gateway (8000)
     → Points Service (3001)
     → ProviderAdapterFactory
       ├─ RedPlug Adapter → GET /redPlug/api/points → normalize
       ├─ GreenPlug Adapter → GET /greenPlug/api/chargingPoints → normalize
       └─ BluePlug Adapter → GET /bluePlug/api/locations → normalize
     → Aggregate results
     → Return unified response
```

### Example 2: Reserve Point from GreenPlug
```
User → POST /api/reservations
        { provider: "greenPlug", pointid: "42", minutes: 30 }
     → API Gateway (8000)
     → Reservation Service (3003)
     → ProviderAdapter for greenPlug
     → POST /greenPlug/api/chargingPoints/42/reservations/30
     → Parse response
     → Return result
```

## 🔐 Error Handling

Services handle provider-specific errors:

```
Provider API returns 404 → Normalize to: { error: "Point not found" }
Provider API returns 400 → Normalize to: { error: "Invalid request" }
Provider API times out → Retry or fail gracefully
Network error → Log and return error
```

## 📞 Support

For issues or questions about provider APIs, download the OpenAPI schemas from:
- [RedPlug Documentation](https://davinci.softlab.ntua.gr/saas26/redPlug/docs)
- [GreenPlug Documentation](https://davinci.softlab.ntua.gr/saas26/greenPlug/docs)
- [BluePlug Documentation](https://davinci.softlab.ntua.gr/saas26/bluePlug/docs)

---

**Version**: 1.0.0  
**Last Updated**: April 2026  
**Status**: Ready for Integration ✓
