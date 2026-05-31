/**
 * INTEGRATION GUIDE: Three Microservices for saasPlug
 * 
 * Services Included:
 * 1. Provider_Management_Service (Port 3105)
 * 2. Analytics_Service (Port 3102)
 * 3. Billing_Service (Port 3103)
 * 
 * Architecture: Microservices with RabbitMQ async communication
 * Databases: Isolated MariaDB for each service
 */

# =====================================================
# SERVICE SUMMARY
# =====================================================

## 1. PROVIDER_MANAGEMENT_SERVICE (Port 3105)
**Purpose**: UC03 - Register EV charging providers to saasPlug

### Database: provider_mgmt_db (Isolated)
- `providers` table: Stores provider registration data
- `provider_webhooks` table: Optional webhook configuration

### Main Endpoint:
```
POST /api/providers/register
```

### Request Body:
```json
{
  "provider_name": "Tesla Charging Network",
  "base_url": "https://api.tesla-charging.com",
  "api_key": "sk_test_abc123xyz",
  "endpoint_list_points": "/api/v1/charging-points",
  "endpoint_point_details": "/api/v1/charging-points/{id}",
  "endpoint_reserve": "/api/v1/reservations",
  "endpoint_reserve_duration": "/api/v1/reservations/with-duration"
}
```

### Additional Endpoints:
- `GET /api/providers` - List all providers
- `GET /api/providers/:providerId` - Get provider details
- `POST /api/providers/:providerId/suspend` - Suspend a provider
- `GET /health` - Health check

### Events Published:
- `provider.registered` → analytics_exchange (when provider registers)

---

## 2. ANALYTICS_SERVICE (Port 3102)
**Purpose**: UC04 - View provider analytics (searches, point views, reservations)

### Database: analytics_db (Isolated)
- `analytics_logs` table: Individual event logs
- `analytics_summary` table: Aggregated metrics
- `analytics_daily` table: Daily breakdown

### Main Endpoint:
```
GET /api/analytics/provider/:providerId
```

### Query Parameters:
- `period`: daily, weekly, monthly (default: monthly)
- `startDate`, `endDate`: Custom date range (YYYY-MM-DD)

### Response Example:
```json
{
  "provider_id": 1,
  "period": "monthly",
  "date_range": {
    "from": "2026-05-01",
    "to": "2026-06-01"
  },
  "summary": {
    "total_searches": 1250,
    "total_point_views": 3400,
    "total_reservations": 450
  },
  "daily_breakdown": [
    {
      "date": "2026-05-28",
      "searches_count": 45,
      "point_views_count": 120,
      "reservations_count": 15
    }
  ]
}
```

### Additional Endpoints:
- `GET /api/analytics/provider/:providerId/daily` - Daily breakdown
- `GET /api/analytics/global` - All providers combined
- `GET /health` - Health check

### Events Consumed:
- `point_viewed` ← From Points/Search service
- `reservation_made` ← From Reservation service
- `search_performed` ← From Search service

---

## 3. BILLING_SERVICE (Port 3103)
**Purpose**: UC05 - Generate and serve invoices based on reservations

### Database: billing_db (Isolated)
- `billable_events` table: Per-reservation charges
- `invoices` table: Monthly invoices
- `invoice_line_items` table: Detailed charges
- `pricing_config` table: Configurable pricing

### Main Endpoint:
```
GET /api/billing/invoice/:providerId
```

### Response Example:
```json
{
  "invoice_id": 42,
  "provider_id": 1,
  "billing_period": {
    "start": "2026-05-01",
    "end": "2026-06-01"
  },
  "summary": {
    "subtotal": 225.50,
    "tax_amount": 47.36,
    "tax_rate": "21%",
    "grand_total": 272.86
  },
  "line_items": [
    {
      "description": "Reservation Services (451 reservations)",
      "quantity": 451,
      "unit_price": 0.50,
      "line_total": 225.50
    }
  ],
  "metadata": {
    "status": "draft",
    "event_count": 451,
    "issued_at": "2026-05-28T14:30:00Z",
    "due_date": "2026-06-28",
    "paid_at": null
  }
}
```

### Additional Endpoints:
- `GET /api/billing/invoices/:providerId` - All invoices for provider
- `POST /api/billing/invoices/:providerId/:invoiceId/mark-paid` - Mark as paid
- `GET /api/billing/summary/:providerId` - Billing summary
- `GET /health` - Health check

### Pricing Configuration (Configurable):
- Default: €0.50 per reservation
- Can be customized per provider or globally
- Includes 21% VAT calculation

### Events Consumed:
- `reservation_successful` ← From Reservation service
- `payment.processed` ← From Payment service

---

# =====================================================
# SETUP INSTRUCTIONS
# =====================================================

## Prerequisites
- Node.js 14+ and npm
- MariaDB 10.5+
- RabbitMQ 3.8+

## 1. Database Setup

### Create MariaDB databases:
```sql
-- Provider Management Database
CREATE DATABASE IF NOT EXISTS provider_mgmt_db;
CREATE USER 'provider_mgmt_user'@'localhost' IDENTIFIED BY 'provider_mgmt_pass';
GRANT ALL PRIVILEGES ON provider_mgmt_db.* TO 'provider_mgmt_user'@'localhost';

-- Analytics Database
CREATE DATABASE IF NOT EXISTS analytics_db;
CREATE USER 'analytics_user'@'localhost' IDENTIFIED BY 'analytics_pass';
GRANT ALL PRIVILEGES ON analytics_db.* TO 'analytics_user'@'localhost';

-- Billing Database
CREATE DATABASE IF NOT EXISTS billing_db;
CREATE USER 'billing_user'@'localhost' IDENTIFIED BY 'billing_pass';
GRANT ALL PRIVILEGES ON billing_db.* TO 'billing_user'@'localhost';

FLUSH PRIVILEGES;
```

### Run SQL schemas (or they'll auto-initialize):
```bash
mysql -u root -p < Provider_Management_Service/db/schema.sql
mysql -u root -p < Analytics_Service/db/schema.sql
mysql -u root -p < Billing_Service/db/schema.sql
```

## 2. RabbitMQ Setup

Ensure RabbitMQ is running (Docker):
```bash
docker run -d \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

Or use system package manager:
```bash
# Ubuntu/Debian
sudo apt-get install rabbitmq-server
sudo systemctl start rabbitmq-server
```

## 3. Install Dependencies

For each service:
```bash
cd Provider_Management_Service && npm install
cd Analytics_Service && npm install
cd Billing_Service && npm install
```

### Required npm packages (package.json):
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "amqplib": "^0.10.3"
  }
}
```

## 4. Environment Configuration

Create `.env` files for each service:

### Provider_Management_Service/.env
```
PORT=3105
DB_HOST=localhost
DB_PORT=3306
DB_USER=provider_mgmt_user
DB_PASSWORD=provider_mgmt_pass
DB_NAME=provider_mgmt_db
RABBITMQ_URL=amqp://localhost
```

### Analytics_Service/.env
```
PORT=3102
DB_HOST=localhost
DB_PORT=3306
DB_USER=analytics_user
DB_PASSWORD=analytics_pass
DB_NAME=analytics_db
RABBITMQ_URL=amqp://localhost
```

### Billing_Service/.env
```
PORT=3103
DB_HOST=localhost
DB_PORT=3306
DB_USER=billing_user
DB_PASSWORD=billing_pass
DB_NAME=billing_db
RABBITMQ_URL=amqp://localhost
```

## 5. Start Services

Each service starts its own server and automatically:
1. Initializes database schema
2. Tests database connection
3. Connects to RabbitMQ
4. Starts consuming/publishing events

```bash
# Terminal 1: Provider Management Service
cd Provider_Management_Service
node src/index.js

# Terminal 2: Analytics Service
cd Analytics_Service
node src/index.js

# Terminal 3: Billing Service
cd Billing_Service
node src/index.js
```

Or with npm scripts (add to package.json):
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  }
}
```

---

# =====================================================
# MESSAGE FLOW & EVENT ROUTING
# =====================================================

## Provider Registration Flow:
```
POST /api/providers/register (Provider_Management_Service)
  ↓
Saves to provider_mgmt_db.providers
  ↓
Publishes provider.registered event
  ↓
RabbitMQ provider_exchange → provider.registered
```

## Analytics Event Flow:
```
Other services (Points, Reservations, Search)
  ↓
Publish events: point_viewed, reservation_made, search_performed
  ↓
RabbitMQ analytics_exchange
  ↓
Analytics_Service consumes & logs to analytics_db.analytics_logs
  ↓
GET /api/analytics/provider/:providerId aggregates data
```

## Billing Event Flow:
```
Reservation_Service publishes reservation_successful
  ↓
RabbitMQ billing_exchange
  ↓
Billing_Service consumes & creates billable_event
  ↓
GET /api/billing/invoice/:providerId calculates invoice
  ↓
Returns invoice with line items and 21% VAT
```

---

# =====================================================
# TESTING THE SERVICES
# =====================================================

## 1. Register a Provider:
```bash
curl -X POST http://localhost:3105/api/providers/register \
  -H "Content-Type: application/json" \
  -d '{
    "provider_name": "EuroCharger",
    "base_url": "https://api.eurocharhger.eu",
    "api_key": "sk_live_test123",
    "endpoint_list_points": "/api/v2/points",
    "endpoint_point_details": "/api/v2/points/{id}",
    "endpoint_reserve": "/api/v2/reserve",
    "endpoint_reserve_duration": "/api/v2/reserve/duration"
  }'
```

## 2. Check Provider Analytics:
```bash
curl http://localhost:3102/api/analytics/provider/1?period=monthly
```

## 3. Get Current Invoice:
```bash
curl http://localhost:3103/api/billing/invoice/1
```

## 4. Health Checks:
```bash
curl http://localhost:3105/health
curl http://localhost:3102/health
curl http://localhost:3103/health
```

---

# =====================================================
# PROFESSOR'S CONSTRAINTS COMPLIANCE
# =====================================================

✓ Stack: Node.js, Express.js, MariaDB
✓ Database Isolation: Each microservice has its own completely isolated database
✓ RabbitMQ Integration: Asynchronous communication via message broker
✓ No Real-time Blocking Calls: All inter-service communication is async via RabbitMQ
✓ UTF-8 JSON Responses: All API responses are UTF-8 JSON
✓ Provider Registration: Stores provider name, baseURL, apiKey, and 4 endpoints
✓ Analytics: Aggregates provider-specific metrics (searches, point views, reservations)
✓ Async Analytics: RabbitMQ consumer processes events asynchronously
✓ Billing: Per-reservation cost calculation (€0.50 default, configurable)
✓ Monthly Invoice Generation: Calculates current month invoice with VAT
✓ Dead Letter Queues: Failed messages sent to DLQ for monitoring

---

# =====================================================
# ARCHITECTURE DIAGRAM
# =====================================================

```
┌─────────────────────────────────────────────────────────────┐
│                    SAASPLUG MICROSERVICES                   │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│ Provider API Clients │
└──────────────────────┘
          │
          ├──────────────────────────────────────────────┐
          │                                              │
    ┌─────────────────────────────┐                     │
    │ Provider_Management_Service │                     │
    │         (Port 3105)          │                     │
    ├─────────────────────────────┤                     │
    │  POST /register             │                     │
    │  GET /providers             │                     │
    └─────────────────────────────┘                     │
         │                                              │
         │ RabbitMQ Event                               │
         │ provider.registered                           │
         │                                              │
         ▼                                              │
    ┌─────────────────────────────┐                     │
    │   Analytics_Service         │                     │
    │      (Port 3102)            │                     │
    ├─────────────────────────────┤                     │
    │ GET /analytics/provider/:id │ ◄───────────────────┘
    │ GET /analytics/global       │
    └─────────────────────────────┘
         │
         ├─ provider_mgmt_db (Isolated)
         ├─ analytics_db (Isolated)
         └─ RabbitMQ Events:
            - point_viewed
            - reservation_made
            - search_performed

    ┌─────────────────────────────┐
    │    Billing_Service          │
    │       (Port 3103)           │
    ├─────────────────────────────┤
    │ GET /billing/invoice/:id    │
    │ GET /billing/invoices/:id   │
    └─────────────────────────────┘
         │
         ├─ billing_db (Isolated)
         └─ RabbitMQ Events:
            - reservation_successful
            - payment.processed

┌─────────────────────────────────────────────────────────────┐
│                  SHARED INFRASTRUCTURE                      │
├─────────────────────────────────────────────────────────────┤
│  MariaDB (3 isolated databases)                             │
│  RabbitMQ (Topic Exchanges & DLQ)                           │
└─────────────────────────────────────────────────────────────┘
```

---

# =====================================================
# TROUBLESHOOTING
# =====================================================

## Service won't start:
1. Check MariaDB is running: `mysql -u root -p -e "SELECT 1;"`
2. Check RabbitMQ is running: `rabbitmqctl status`
3. Check ports are available: `netstat -tuln | grep 3105`
4. Review error logs in console output

## Events not being consumed:
1. Check RabbitMQ connections: `rabbitmqctl list_connections`
2. Check queue bindings: `rabbitmqctl list_bindings`
3. Verify events have correct routing keys
4. Check Dead Letter Queue for failed messages

## Database connection errors:
1. Verify credentials in .env files
2. Check user privileges: `SHOW GRANTS FOR 'provider_mgmt_user'@'localhost';`
3. Test connection: `mysql -u provider_mgmt_user -p -h localhost provider_mgmt_db`

---

**Version**: 1.0.0
**Last Updated**: May 28, 2026
**Maintainer**: Senior Backend Engineer
