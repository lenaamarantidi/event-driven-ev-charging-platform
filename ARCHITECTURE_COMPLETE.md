# SaaS-26 Complete Microservices Architecture

## Overview

A complete 8-service microservices architecture for managing electric vehicle charging points across multiple provider APIs. All services implemented with Node.js/Express, provider adapters following Factory Pattern, and unified API Gateway routing.

**Status**: ✅ Core implementation complete. Ready for database integration and deployment.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    API Gateway (8000)                        │
│  Single entry point routing to all microservices             │
└─────┬──────────────────────────────────────────────────┬─────┘
      │                                                  │
      ├─→ Auth Service (3100)                          │
      │   • JWT token management                        │
      │   • Local auth + Google OAuth                   │
      │   • User profiles                               │
      │                                                  │
      ├─→ Provider Management (3101)                    │
      │   • Multi-provider registration & CRUD          │
      │   • Provider adapters (RedPlug/Green/Blue)      │
      │   • Status checking                             │
      │                                                  │
      ├─→ Status Service (3102)                         │
      │   • Provider health monitoring                  │
      │   • Endpoint critical checks                    │
      │   • System status aggregation                   │
      │                                                  │
      ├─→ Collector Service (3104)                      │
      │   • Periodic data import                        │
      │   • Provider adapters + streaming               │
      │   • Statistics & import logs                    │
      │                                                  │
      ├─→ Map Service (3105)                            │
      │   • Geolocation search (Haversine)              │
      │   • Route calculations                          │
      │   • Bookmark management                         │
      │                                                  │
      ├─→ Analytics Service (3106)                      │
      │   • Event tracking & metrics                    │
      │   • Report generation (24h, 7d, 30d)            │
      │   • CSV/JSON export                             │
      │                                                  │
      ├─→ Payment Service (3107)                        │
      │   • Payment processing                          │
      │   • Wallet management                           │
      │   • Subscription handling                       │
      │                                                  │
      ├─→ Billing Service (3108)                        │
      │   • Invoice generation                          │
      │   • Usage tracking & pricing                    │
      │   • Billing cycle management                    │
      │                                                  │
      └─→ Message Broker (3003)                         ← Event System
          • Pub/Sub events
          • Webhook delivery
          • Event history & stats
```

---

## Services Detailed

### 1. Auth Service (Port 3100)

**File**: `Auth_Service/src/index.js` (400+ lines)

**Endpoints**:
```
POST /auth/register         - Register new user
POST /auth/login            - Login with email/password
POST /auth/google           - Google OAuth login
POST /auth/refresh          - Refresh access token
GET  /auth/profile          - Get user profile
PUT  /auth/profile          - Update profile
POST /auth/change-password  - Change password
GET  /health                - Health check
```

**Key Features**:
- JWT token generation with claims
- Bcrypt password hashing
- Google OAuth integration
- Refresh token rotation
- In-memory user storage (upgradeable to database)

**Dependencies**:
```json
{
  "express": "^4.18.2",
  "axios": "^1.4.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "uuid": "^9.0.0"
}
```

---

### 2. Provider Management Service (Port 3101)

**Files**: 
- `Provider_Management_Service/src/index.js` (250+ lines)
- `Provider_Management_Service/src/adapters/providerAdapter.js` (150+ lines)

**Endpoints**:
```
GET    /providers            - List all providers
POST   /providers/register   - Register new provider
GET    /providers/:id        - Get provider details
PUT    /providers/:id        - Update provider
POST   /providers/:id/sync   - Sync from external API
GET    /providers/status/all - Check all provider health
GET    /health               - Health check
```

**Provider Adapters**:
- **RedPlug**: `/points`, `/point/{id}`, `/reserve/{id}`
- **GreenPlug**: `/chargingPoints`, `/chargingPoints/{id}`, `/chargingPoints/{id}/reservations`
- **BluePlug**: `/locations`, `/location/{id}`, `/location/{id}/hold`

**Key Features**:
- Factory Pattern for provider adapters
- Field normalization (email→contactEmail, etc.)
- External provider synchronization
- Status checking per provider
- Provider registry management

**Data Normalization Example**:
```javascript
// Different provider responses → unified format
{
  providerId: string,
  name: string,
  contactEmail: string,      // normalized from email/contactEmail
  phone: string,             // normalized from phone/contact
  apiKey: string,
  status: 'active'|'inactive'
}
```

---

### 3. Collector Service (Port 3104)

**Files**:
- `Collector_Service/src/index.js` (300+ lines)
- `Collector_Service/src/adapters/providerAdapter.js` (180+ lines)

**Endpoints**:
```
POST   /collector/import          - Import from single provider
POST   /collector/import-all      - Import from all 3 providers
GET    /collector/points          - Get collected points
GET    /collector/statistics      - Import statistics
GET    /collector/logs            - Import history
POST   /collector/stream/:provider - Stream data with pagination
GET    /health                    - Health check
```

**Key Features**:
- Parallel collection from all 3 providers
- Data normalization (lat/latitude, lon/longitude, capacity_kw/capacity, etc.)
- Auto-scheduling (default: 1 hour interval, configurable)
- Async generators for batch streaming
- Event publishing to message broker on completion
- Import logging with duration tracking
- Statistics aggregation

**Streaming Endpoint**:
```javascript
// Example: GET /collector/stream/redPlug
// Returns stream of 50-point batches
[
  { pointid, lat, lon, status, capacity_kw, kwh_price },
  { pointid, lat, lon, status, capacity_kw, kwh_price },
  // ... 50 points per batch
]
```

---

### 4. Map Service (Port 3105)

**File**: `Map_UI_Service/src/index.js` (250+ lines)

**Endpoints**:
```
POST   /map/search           - Find nearby charging points
POST   /map/path             - Calculate route between coordinates
POST   /map/layers/:id       - Create/update map layer
GET    /map/layers           - List map layers
POST   /map/bookmarks        - Create bookmark
GET    /map/bookmarks/:userId - User bookmarks
DELETE /map/bookmarks/:userId/:id - Delete bookmark
GET    /health               - Health check
```

**Key Features**:
- Haversine distance calculation (great circle distance)
- Radius-based geospatial search (configurable km radius)
- Provider filtering (search specific provider points)
- Capacity range filtering
- Distance sorting
- Map layer management
- User bookmark persistence

**Search Example**:
```bash
POST /map/search
{
  "lat": 37.9838,
  "lon": 23.7275,
  "radius": 5,           # km
  "provider": "redPlug", # optional
  "capacity_min": 50,    # optional
  "capacity_max": 350    # optional
}

Response:
[
  {
    pointid, provider, lat, lon, distance,
    status, capacity_kw, kwh_price, direction
  },
  // ... sorted by distance
]
```

---

### 5. Analytics Service (Port 3106)

**File**: `Analytics_Service/src/index.js` (280+ lines)

**Endpoints**:
```
POST   /analytics/events         - Track event
GET    /analytics/events         - Query events
GET    /analytics/user/:id       - User analytics
GET    /analytics/providers      - All provider metrics
GET    /analytics/providers/:id  - Specific provider metrics
GET    /analytics/report         - Generate time-period report
POST   /analytics/export         - Export as JSON/CSV
GET    /health                   - Health check
```

**Key Features**:
- Automatic metric aggregation (counts by type, averages)
- User metrics tracking (eventCount, eventTypes, lastEvent)
- Provider metrics (requestCount, avgResponseTime)
- Time-based reporting (24h, 7d, 30d windows)
- Sliding window event storage (last 10,000 events)
- Export to JSON or CSV format

**Metrics Example**:
```javascript
User Metrics:
{
  userId,
  eventCount: 150,
  eventTypes: { search: 50, reserve: 30, payment: 70 },
  lastEvent: timestamp,
  avgEventsPerDay: 5.2
}

Provider Metrics:
{
  provider: "redPlug",
  requestCount: 500,
  avgResponseTime: 245,
  failureRate: 0.02,
  lastRequest: timestamp
}
```

---

### 6. Payment Service (Port 3107)

**File**: `Payment_Service/src/index.js` (300+ lines)

**Endpoints**:
```
POST   /payments/process                 - Process payment
GET    /payments/:id                     - Get transaction
GET    /payments/user/:id                - User transaction history
POST   /payments/wallet/:id              - Topup wallet
GET    /payments/wallet/:id              - Get wallet balance
POST   /payments/subscriptions           - Create subscription
GET    /payments/subscriptions/:userId   - User subscriptions
POST   /payments/refund/:id              - Process refund
GET    /health                           - Health check
```

**Payment Modes**:
1. **Card**: Direct credit card payment
2. **Wallet**: Pay from pre-loaded wallet
3. **Subscription**: Auto-billing based on plan

**Key Features**:
- Multiple payment methods
- Wallet balance management with topup
- Subscription handling with renewal dates
- Refund processing
- Transaction logging with status tracking
- In-memory storage (transaction map, wallet map, subscription map)

**Transaction Structure**:
```javascript
{
  transactionId,
  userId,
  amount,
  currency: "EUR",
  status: "completed"|"processing"|"failed",
  paymentMode: "card"|"wallet"|"subscription",
  cardLast4: "1234",
  failureReason: null,
  timestamp
}
```

---

### 7. Billing Service (Port 3108)

**File**: `Billing_Service/src/index.js` (320+ lines)

**Endpoints**:
```
POST   /billing/invoices              - Create invoice
GET    /billing/invoices/:userId      - User invoices
POST   /billing/invoices/:id/send     - Send invoice (trigger email)
POST   /billing/invoices/:id/paid     - Mark invoice as paid
POST   /billing/usage                 - Record usage (kWh)
GET    /billing/usage/:userId         - User usage history
POST   /billing/cycles                - Create billing cycle
GET    /billing/plans                 - List pricing plans
POST   /billing/plans                 - Create custom plan
GET    /health                        - Health check
```

**Default Pricing Plans**:
```javascript
Basic:      $9.99/month + $0.15/kWh
Premium:    $29.99/month + $0.12/kWh
Enterprise: $99.99/month + $0.10/kWh
```

**Invoice Calculation**:
```javascript
Total = monthlyFee + (usageKwh × pricePerKwh) + taxes (19% VAT)

Status Flow: draft → pending → paid (or overdue)
Due Date: 7 days after billing period
```

**Key Features**:
- Automatic VAT calculation (19%)
- Multiple pricing plans
- Custom plan creation
- Usage tracking per user
- Billing cycle management
- Invoice status workflow

---

### 8. Status Service (Port 3102)

**Files**:
- `Status_Service/src/index.js` (200+ lines)
- `Status_Service/src/adapters/providerAdapter.js` (300+ lines, enhanced)

**Endpoints**:
```
GET    /api/status/all                    - Comprehensive health check all providers
GET    /api/status/:provider/health       - Provider health status
GET    /api/status/:provider/details      - System status with critical endpoints
GET    /api/status                        - Legacy: points by status
GET    /api/status/:provider              - Legacy: provider point count
GET    /api/status/detailed/:provider/:id - Point detail status
GET    /api/status/ping                   - Simple ping
GET    /health                            - Health check
```

**Key Features (NEW)**: 
- Health endpoint checking per provider
- Critical endpoint monitoring
- Response time measurement
- Comprehensive system status aggregation
- Online/offline/degraded status classification
- Parallel provider health checks

**Status Response Example**:
```javascript
{
  timestamp,
  providers: {
    redPlug: {
      provider: "redPlug",
      overallStatus: "healthy",
      health: { status: "online", responseTime: 245 },
      endpoints: {
        listPoints: { status: "ok", responseTime: 234 },
        getPoint: { status: "ok", responseTime: 267 },
        reserve: { status: "ok", responseTime: 289 }
      }
    },
    // greenPlug, bluePlug...
  },
  summary: { healthy: 3, degraded: 0, offline: 0 },
  systemHealth: "operational"
}
```

---

### 9. Message Broker / Event Bus (Port 3003)

**File**: `message_broker/src/index.js` (370+ lines)

**Endpoints**:
```
POST   /api/events/publish           - Publish event
POST   /api/webhooks/subscribe       - Register webhook subscriber
POST   /api/webhooks/unsubscribe    - Remove webhook subscription
GET    /api/events/history           - Get event history
GET    /api/events/stats             - Event statistics
GET    /health                       - Health check
```

**Supported Events**:
- `PointsImported` - from Collector
- `PaymentProcessed` - from Payment
- `InvoiceGenerated` - from Billing
- `ProviderStatusChanged` - from Status
- `ProviderRegistered` - from Provider Mgmt
- Custom events via REST API

**Key Features**:
- EventEmitter-based pub/sub for in-process listeners
- Webhook registration and delivery
- Exponential backoff retry logic (1s, 2s, 4s)
- Event history storage (sliding window, last 1000 events)
- Event statistics (by type, subscriber counts)
- Service-to-service async communication

**Webhook Retry Logic**:
```javascript
Max Retries: 3
Delays: 1s → 2s → 4s
Timeout: 5s per request
```

**Example Flow**:
```javascript
// Service publishes event
POST /api/events/publish
{ "eventType": "PointsImported", "data": { "provider": "redPlug", "count": 500 } }

// Broker delivers to registered webhooks
→ POST https://analytics-service/hooks/points-imported
→ POST https://map-service/hooks/cache-update
→ (Retries on failure)

// History accessible
GET /api/events/history?eventType=PointsImported&limit=50
```

---

### 10. API Gateway (Port 8000)

**File**: `API_Gateway/src/index.js`

**Service Routing**:
```
/api/auth/*              → Auth Service (3100)
/api/providers/*         → Provider Mgmt (3101)
/api/points/*            → Points Service (3001)
/api/status/*            → Status Service (3102)
/api/collector/*         → Collector (3104)
/api/map/*               → Map Service (3105)
/api/analytics/*         → Analytics (3106)
/api/payments/*          → Payment Service (3107)
/api/billing/*           → Billing Service (3108)
/api/events/*            → Message Broker (3003)
/api/webhooks/*          → Message Broker (3003)
/api/reservations/*      → Reservations Service (3009)
```

**Special Endpoints**:
```
GET  /                   - Service discovery
GET  /health             - Comprehensive health check
```

**Health Check Response**:
```javascript
{
  gateway: "ok",
  timestamp,
  services: {
    auth: { status: "ok", ... },
    providers: { status: "ok", ... },
    status: { status: "ok", ... },
    // ... all 8 services
  }
}
```

---

## Provider Adapter Pattern

All services with external API integration use a consistent Factory Pattern:

```javascript
// Usage
const adapter = ProviderAdapterFactory.createAdapter('redPlug');

// Available adapters
- ProviderAdapterFactory.createAdapter('redPlug')
- ProviderAdapterFactory.createAdapter('greenPlug')
- ProviderAdapterFactory.createAdapter('bluePlug')

// Service-specific methods
adapter.checkHealth()           // Status Service
adapter.normalizePoint()        // Collector, Provider Mgmt
adapter.fetchAllPoints()        // Collector
adapter.normalizeReservation()  // Status Service
```

---

## Provider API Differences

| Aspect | RedPlug | GreenPlug | BluePlug |
|--------|---------|-----------|----------|
| **Base URL** | `/redPlug/api` | `/greenPlug/api` | `/bluePlug/api` |
| **List Points** | `/points` | `/chargingPoints` | `/locations` |
| **Get Point** | `/point/{pointid}` | `/chargingPoints/{pointid}` | `/location/{pointid}` |
| **Reserve** | `/reserve/{pointid}` | `/chargingPoints/{pointid}/reservations` | `/location/{pointid}/hold` |
| **ID Field** | `pointid` | `id` or `pointid` | `id` or `pointid` |
| **Location** | `lat`, `lon` | `latitude`, `longitude` | `latitude`, `longitude` |
| **Capacity** | `cap` | `capacity` | `capacity` |

---

## Database Strategy (Implementation Ready)

### Microservices Pattern
Each service has its own database (PostgreSQL recommended):

```
Auth Service DB
├── users (id, email, hashedPassword, profile, lastLogin)
├── refresh_tokens (tokenId, userId, expiresAt)
└── profiles (userId, firstName, lastName, preferences)

Provider Management DB
├── providers (id, name, contactEmail, apiKey, status)
└── external_mappings (internalId, externalId, provider)

Collector Service DB
├── charging_points (pointid, provider, lat, lon, status, capacity_kw, kwh_price, lastImport)
├── import_logs (importId, provider, pointCount, duration, timestamp)
└── statistics (provider, totalPoints, avgImportTime, lastImport)

Billing Service DB
├── invoices (invoiceId, userId, amount, status, dueDate, billingPeriod)
├── usage_records (recordId, userId, kwh, timestamp, reservationId)
└── pricing_plans (planId, name, monthlyFee, pricePerKwh)

Payment Service DB
├── transactions (transactionId, userId, amount, status, paymentMode, timestamp)
├── wallets (userId, balance, lastTopup)
└── subscriptions (subscriptionId, userId, planId, startDate, renewalDate)

Analytics Service DB
├── events (eventId, type, userId, provider, data, timestamp)
└── metrics (provider, metricType, value, period)

Map Service DB
├── map_layers (layerId, name, type, config)
└── user_bookmarks (bookmarkId, userId, lat, lon, name, timestamp)

Status Service DB
├── health_checks (checkId, provider, status, responseTime, timestamp)
└── critical_endpoints (endpointId, provider, endpoint, lastStatus, averageResponseTime)
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone and navigate to workspace
cd saas26-11

# Install services (each service requires npm install in its directory)
cd Auth_Service && npm install
cd ../Provider_Management_Service && npm install
cd ../Collector_Service && npm install
cd ../Map_UI_Service && npm install
cd ../Analytics_Service && npm install
cd ../Payment_Service && npm install
cd ../Billing_Service && npm install
cd ../Status_Service && npm install
cd ../message_broker && npm install
# ... etc for all services
```

### Environment Variables

Create `.env` files in each service directory or set globally:

```bash
# Auth Service
JWT_SECRET=your-secret-key
REFRESH_TOKEN_SECRET=your-refresh-secret

# Provider-specific URLs (format varies per provider)
REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api

# Service ports (defaults: 3100-3108, 3001, 3009)
PORT=3100  # Auth Service
# ... etc

# Database URLs (for future implementation)
AUTH_DB_URL=mysql://auth_user:auth_pass@mariadb-auth:3306/auth_db
COLLECTOR_DB_URL=postgresql://user:pass@localhost:5432/collector_service
# ... etc
```

### Running Services

```bash
# Terminal 1 - Auth Service
cd Auth_Service && npm start
# Auth Service running on port 3100

# Terminal 2 - Provider Management
cd Provider_Management_Service && npm start
# Provider Management running on port 3101

# Terminal 3 - Collector
cd Collector_Service && npm start
# Collector running on port 3104

# ... (start all 8 services)

# Terminal - API Gateway (must start after services)
cd API_Gateway && npm start
# API Gateway running on port 8000

# Now all services accessible via
curl http://localhost:8000/
```

### Testing

```bash
# Health check all services
curl http://localhost:8000/health

# Register user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass123"}'

# Import charging points
curl -X POST http://localhost:8000/api/collector/import-all

# Search nearby points
curl -X POST http://localhost:8000/api/map/search \
  -H "Content-Type: application/json" \
  -d '{"lat":37.98,"lon":23.73,"radius":5}'

# Publish event
curl -X POST http://localhost:8000/api/events/publish \
  -H "Content-Type: application/json" \
  -d '{"eventType":"PointsImported","data":{"count":500}}'
```

---

## Next Steps

### Immediate (Recommended)
1. **Database Integration**
   - Create PostgreSQL databases for each service
   - Replace in-memory storage with database queries
   - Implement connection pooling

2. **Testing**
   - Unit tests for each service
   - Integration tests across services
   - Test with actual provider APIs

### Short-term
1. **Docker Containerization**
   - Dockerfile for each service
   - docker-compose.yml for orchestration
   - Health check endpoints configured

2. **Authentication**
   - API key management
   - Service-to-service authentication
   - Rate limiting

### Medium-term
1. **Monitoring & Logging**
   - Centralized logging (ELK stack or similar)
   - Metrics collection (Prometheus)
   - Distributed tracing (Jaeger)

2. **Caching**
   - Redis for frequently accessed data
   - Cache invalidation strategies
   - CDN for static content

### Long-term
1. **Scalability**
   - Horizontal scaling with load balancers
   - Database replication
   - Microservices orchestration (Kubernetes)

2. **Advanced Features**
   - Real-time notifications (WebSockets)
   - Mobile app integration
   - Payment gateway integration (Stripe, etc.)
   - Advanced analytics & ML

---

## Summary

**8 fully functional microservices** implementing a complete charging point management system:
- ✅ Authentication & Authorization (Auth)
- ✅ Multi-provider management (Provider Mgmt)
- ✅ Data collection & normalization (Collector)
- ✅ Geospatial search & routing (Map)
- ✅ Analytics & reporting (Analytics)
- ✅ Payment processing (Payments)
- ✅ Billing & invoicing (Billing)
- ✅ System health monitoring (Status)
- ✅ Central event pub/sub (Message Broker)
- ✅ Unified API routing (Gateway)

**Ready for**: Database integration, Docker deployment, and production-grade scaling.

