# API Reference - Quick Guide

## Base URL
```
http://localhost:8000
```

## Authentication Service (`/api/auth`)

### Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}

Response:
{
  "userId": "uuid-...",
  "email": "user@example.com",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}

Response: (same as register)
```

### Google OAuth
```bash
POST /api/auth/google
Content-Type: application/json

{
  "googleToken": "google-oauth-token"
}

Response: (JWT tokens)
```

### Get Profile
```bash
GET /api/auth/profile
Authorization: Bearer <accessToken>

Response:
{
  "userId": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+30210..."
}
```

---

## Provider Management (`/api/providers`)

### List All Providers
```bash
GET /api/providers
Authorization: Bearer <accessToken>

Response:
[
  {
    "providerId": "prov-001",
    "name": "RedPlug",
    "contactEmail": "contact@redplug.com",
    "phone": "+30210...",
    "status": "active",
    "totalPoints": 145
  },
  // ...
]
```

### Register New Provider
```bash
POST /api/providers/register
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "NewProvider",
  "contactEmail": "contact@newprov.com",
  "phone": "+30210...",
  "apiKey": "sk_live_..."
}

Response:
{
  "providerId": "prov-xxx",
  "name": "NewProvider",
  "status": "active",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Sync from External Provider
```bash
POST /api/providers/{providerId}/sync
Authorization: Bearer <accessToken>

Response:
{
  "synced": 500,
  "duration": "2.5s",
  "status": "success",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Check Provider Status
```bash
GET /api/providers/status/all
Authorization: Bearer <accessToken>

Response:
{
  "providers": {
    "redPlug": { "status": "online", "responseTime": 245 },
    "greenPlug": { "status": "online", "responseTime": 234 },
    "bluePlug": { "status": "online", "responseTime": 267 }
  },
  "systemHealth": "operational"
}
```

---

## Map Service (`/api/map`)

### Search Nearby Points
```bash
POST /api/map/search
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "lat": 37.9838,
  "lon": 23.7275,
  "radius": 5,
  "provider": "redPlug",        # optional
  "capacity_min": 50,           # optional
  "capacity_max": 350           # optional
  "limit": 50                   # optional
}

Response:
[
  {
    "pointid": "rp-001",
    "provider": "redPlug",
    "lat": 37.9845,
    "lon": 23.7290,
    "distance": 0.8,            # km
    "capacity_kw": 150,
    "kwh_price": 0.32,
    "status": "available"
  },
  // ... sorted by distance
]
```

### Calculate Route
```bash
POST /api/map/path
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "startLat": 37.9838,
  "startLon": 23.7275,
  "endLat": 37.9900,
  "endLon": 23.7350
}

Response:
{
  "distance": 0.75,             # km
  "duration": "5 min",
  "waypoints": [
    { "lat": 37.9838, "lon": 23.7275 },
    { "lat": 37.9900, "lon": 23.7350 }
  ]
}
```

### Save Bookmark
```bash
POST /api/map/bookmarks
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "lat": 37.9838,
  "lon": 23.7275,
  "name": "Home"
}

Response:
{
  "bookmarkId": "bm-001",
  "name": "Home",
  "lat": 37.9838,
  "lon": 23.7275,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

---

## Analytics (`/api/analytics`)

### Track Event
```bash
POST /api/analytics/events
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "eventType": "search",
  "userId": "user-123",
  "provider": "redPlug",
  "data": {
    "radius": 5,
    "resultsCount": 15
  }
}

Response: 201 Created
```

### Get Event History
```bash
GET /api/analytics/events?eventType=search&limit=50
Authorization: Bearer <accessToken>

Response:
{
  "events": [
    {
      "eventId": "evt-001",
      "type": "search",
      "userId": "user-123",
      "provider": "redPlug",
      "timestamp": "2024-01-01T12:00:00Z"
    },
    // ...
  ]
}
```

### Generate Report
```bash
GET /api/analytics/report?period=7d
Authorization: Bearer <accessToken>

Response:
{
  "period": "7d",
  "totalEvents": 1500,
  "eventsByType": {
    "search": 800,
    "reserve": 400,
    "payment": 300
  },
  "topProviders": [
    { "provider": "redPlug", "events": 600 },
    { "provider": "greenPlug", "events": 450 }
  ]
}
```

### Export Events
```bash
POST /api/analytics/export
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "format": "csv",             # or "json"
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}

Response:
(CSV file download)
```

---

## Payments (`/api/payments`)

### Process Payment
```bash
POST /api/payments/process
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "userId": "user-123",
  "amount": 50.00,
  "currency": "EUR",
  "paymentMode": "card",    # "card", "wallet", "subscription"
  "cardToken": "tok_visa",  # if card
  "metadata": {
    "reservationId": "res-001"
  }
}

Response:
{
  "transactionId": "txn-001",
  "status": "completed",
  "amount": 50.00,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Topup Wallet
```bash
POST /api/payments/wallet/{userId}
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "amount": 100.00,
  "currency": "EUR"
}

Response:
{
  "userId": "user-123",
  "newBalance": 150.00,
  "topupAmount": 100.00,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Get Wallet Balance
```bash
GET /api/payments/wallet/{userId}
Authorization: Bearer <accessToken>

Response:
{
  "userId": "user-123",
  "balance": 150.00,
  "currency": "EUR",
  "lastTopup": "2024-01-01T10:00:00Z"
}
```

### Create Subscription
```bash
POST /api/payments/subscriptions
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "userId": "user-123",
  "planId": "plan-premium",
  "billingCycle": "monthly"    # "monthly", "yearly"
}

Response:
{
  "subscriptionId": "sub-001",
  "planId": "plan-premium",
  "status": "active",
  "startDate": "2024-01-01T00:00:00Z",
  "renewalDate": "2024-02-01T00:00:00Z"
}
```

---

## Billing (`/api/billing`)

### Create Invoice
```bash
POST /api/billing/invoices
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "userId": "user-123",
  "billingPeriod": "2024-01",
  "usageKwh": 250,
  "planId": "plan-basic"
}

Response:
{
  "invoiceId": "inv-001",
  "invoiceNumber": "INV-2024-001",
  "userId": "user-123",
  "amount": 67.50,                # 9.99 + 250*0.15 + 19% VAT
  "status": "pending",
  "dueDate": "2024-01-08",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Get User Invoices
```bash
GET /api/billing/invoices/{userId}
Authorization: Bearer <accessToken>

Response:
{
  "invoices": [
    {
      "invoiceId": "inv-001",
      "amount": 67.50,
      "status": "paid"
    },
    // ...
  ],
  "summary": {
    "totalBilled": 500.00,
    "paidAmount": 350.00,
    "pendingAmount": 150.00
  }
}
```

### Mark Invoice as Paid
```bash
POST /api/billing/invoices/{invoiceId}/paid
Authorization: Bearer <accessToken>

Response:
{
  "invoiceId": "inv-001",
  "status": "paid",
  "paidDate": "2024-01-03T12:00:00Z"
}
```

### Get Pricing Plans
```bash
GET /api/billing/plans
Authorization: Bearer <accessToken>

Response:
[
  {
    "planId": "plan-basic",
    "name": "Basic",
    "monthlyFee": 9.99,
    "pricePerKwh": 0.15
  },
  {
    "planId": "plan-premium",
    "name": "Premium",
    "monthlyFee": 29.99,
    "pricePerKwh": 0.12
  },
  {
    "planId": "plan-enterprise",
    "name": "Enterprise",
    "monthlyFee": 99.99,
    "pricePerKwh": 0.10
  }
]
```

---

## Collector (`/api/collector`)

### Import from Single Provider
```bash
POST /api/collector/import
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "provider": "redPlug"
}

Response:
{
  "importId": "imp-001",
  "provider": "redPlug",
  "pointsImported": 500,
  "duration": "2.3s",
  "status": "completed",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Import from All Providers
```bash
POST /api/collector/import-all
Authorization: Bearer <accessToken>

Response:
{
  "imports": {
    "redPlug": { "pointsImported": 500, "status": "completed" },
    "greenPlug": { "pointsImported": 450, "status": "completed" },
    "bluePlug": { "pointsImported": 380, "status": "completed" }
  },
  "totalPoints": 1330,
  "duration": "6.8s",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Get Import Statistics
```bash
GET /api/collector/statistics
Authorization: Bearer <accessToken>

Response:
{
  "statistics": {
    "redPlug": {
      "totalImports": 45,
      "totalPoints": 22500,
      "avgImportTime": "2.4s",
      "lastImport": "2024-01-01T11:00:00Z"
    },
    // ...
  }
}
```

### Stream Points
```bash
GET /api/collector/stream/redPlug
Authorization: Bearer <accessToken>

Response: (Streaming - returns batches of 50 points)
[
  { "pointid": "rp-001", "lat": 37.98, "lon": 23.72, "capacity_kw": 150 },
  // ... 50 points
]
[
  { "pointid": "rp-051", "lat": 37.99, "lon": 23.73, "capacity_kw": 200 },
  // ... next 50 points
]
```

---

## Status Monitoring (`/api/status`)

### Comprehensive Health Check
```bash
GET /api/status/all
Authorization: Bearer <accessToken>

Response:
{
  "timestamp": "2024-01-01T12:00:00Z",
  "providers": {
    "redPlug": {
      "overallStatus": "healthy",
      "health": { "status": "online", "responseTime": 245 },
      "endpoints": {
        "listPoints": { "status": "ok", "responseTime": 234 },
        "getPoint": { "status": "ok", "responseTime": 267 },
        "reserve": { "status": "ok", "responseTime": 289 }
      }
    },
    // ... greenPlug, bluePlug
  },
  "summary": { "healthy": 3, "degraded": 0, "offline": 0 },
  "systemHealth": "operational"
}
```

### Provider Health
```bash
GET /api/status/{provider}/health
Authorization: Bearer <accessToken>

Response:
{
  "provider": "redPlug",
  "status": "online",
  "statusCode": 200,
  "responseTime": 245,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Provider Detailed Status
```bash
GET /api/status/{provider}/details
Authorization: Bearer <accessToken>

Response: (Includes all critical endpoints)
{
  "provider": "redPlug",
  "overallStatus": "healthy",
  "health": { ... },
  "endpoints": { ... }
}
```

---

## Message Broker / Events (`/api/events`, `/api/webhooks`)

### Publish Event
```bash
POST /api/events/publish
Content-Type: application/json

{
  "eventType": "PointsImported",
  "data": {
    "provider": "redPlug",
    "count": 500
  }
}

Response:
{
  "id": "evt-...",
  "type": "PointsImported",
  "data": { ... },
  "timestamp": "2024-01-01T12:00:00Z",
  "processed": false
}
```

### Subscribe to Events (Webhook)
```bash
POST /api/webhooks/subscribe
Content-Type: application/json

{
  "eventType": "PointsImported",
  "serviceId": "analytics-service",
  "webhookUrl": "http://analytics-service:3106/hooks/points-imported"
}

Response:
{
  "subscribedTo": "PointsImported",
  "serviceId": "analytics-service",
  "webhookUrl": "http://analytics-service:3106/hooks/points-imported"
}
```

### Get Event History
```bash
GET /api/events/history?eventType=PointsImported&limit=50

Response:
{
  "count": 50,
  "events": [
    {
      "id": "evt-001",
      "type": "PointsImported",
      "data": { ... },
      "timestamp": "2024-01-01T12:00:00Z"
    },
    // ...
  ]
}
```

### Get Event Statistics
```bash
GET /api/events/stats

Response:
{
  "totalEvents": 5243,
  "eventsByType": {
    "PointsImported": 45,
    "PaymentProcessed": 1230,
    "InvoiceGenerated": 856
  },
  "subscribers": {
    "PointsImported": 3,
    "PaymentProcessed": 2
  }
}
```

---

## Common HTTP Status Codes

```
200 OK                  - Request successful
201 Created             - Resource created
400 Bad Request         - Invalid request data
401 Unauthorized        - Missing/invalid authentication
403 Forbidden           - Authenticated but not authorized
404 Not Found           - Resource not found
500 Internal Server Error - Server error
503 Service Unavailable - Service down
```

---

## Error Response Format

```json
{
  "error": "Error message",
  "details": "Additional details",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

---

## Rate Limiting (Future Implementation)

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

---

## Example Workflows

### Complete User Journey

1. **Register**
   ```bash
   POST /api/auth/register
   ```

2. **Login**
   ```bash
   POST /api/auth/login
   ```

3. **Search for Charging Points**
   ```bash
   POST /api/map/search
   ```

4. **Make Payment**
   ```bash
   POST /api/payments/process
   ```

5. **Track Event**
   ```bash
   POST /api/analytics/events
   ```

6. **Check Billing**
   ```bash
   GET /api/billing/invoices/{userId}
   ```

---

## Testing Commands

```bash
# Health check
curl http://localhost:8000/health | jq

# Service discovery
curl http://localhost:8000/ | jq

# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass123"}' | jq

# Get providers status
curl http://localhost:8000/api/providers/status/all \
  -H "Authorization: Bearer YOUR_TOKEN" | jq

# Search points
curl -X POST http://localhost:8000/api/map/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"lat":37.98,"lon":23.72,"radius":5}' | jq
```

---

**API Documentation Last Updated**: January 2024
**Services**: 8 Microservices + Message Broker
**Status**: Production Ready (Database integration pending)

