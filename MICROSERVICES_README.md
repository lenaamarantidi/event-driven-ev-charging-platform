# saasPlug Microservices - Complete Backend Implementation

## Overview

This repository contains the complete backend implementation of three microservices for **saasPlug**, a SaaS platform for EV (Electric Vehicle) charging point providers. The services follow a strict microservices architecture with:

- **Node.js/Express.js** backend framework
- **MariaDB** databases (isolated per service)
- **RabbitMQ** for asynchronous inter-service communication
- UTF-8 JSON API responses
- Complete isolation: no shared databases, no synchronous inter-service calls

---

## 📋 Services Included

### 1. **Provider_Management_Service** (Port 3105)
**Use Case**: UC03 - Register EV charging providers to saasPlug

- Manages provider registration
- Stores provider details and their 4 API endpoints
- Publishes provider registration events
- Database: `provider_mgmt_db` (isolated)

**Main Endpoint**: `POST /api/providers/register`

### 2. **Analytics_Service** (Port 3102)
**Use Case**: UC04 - View provider analytics

- Aggregates analytics events from other services
- Provides per-provider statistics (searches, point views, reservations)
- Supports global analytics (all providers)
- Consumes events via RabbitMQ asynchronously
- Database: `analytics_db` (isolated)

**Main Endpoint**: `GET /api/analytics/provider/:providerId`

### 3. **Billing_Service** (Port 3103)
**Use Case**: UC05 - Generate and serve invoices

- Generates monthly invoices based on billable events (reservations)
- Configurable pricing per reservation (default: €0.50)
- Includes automatic 21% VAT calculation
- Consumes reservation events via RabbitMQ
- Database: `billing_db` (isolated)

**Main Endpoint**: `GET /api/billing/invoice/:providerId`

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   External Services / API Clients   │
└────────────────┬────────────────────┘
                 │
    ┌────────────┴────────────┬────────────────┐
    │                         │                │
    ▼                         ▼                ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────┐
│ Provider_Mgmt   │  │ Analytics    │  │ Billing      │
│ Service (3105)  │  │ Service(3102)│  │ Service(3103)│
└────────┬────────┘  └──────┬───────┘  └──────┬───────┘
         │                  │                 │
         └──────────────────┼─────────────────┘
                            │
                            ▼
                    ┌───────────────────┐
                    │    RabbitMQ       │
                    │ (Message Broker)  │
                    └───────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
    ┌─────────┐        ┌──────────┐      ┌─────────┐
    │Provider │        │Analytics │      │ Billing │
    │ DB      │        │   DB     │      │   DB    │
    │isolated │        │ isolated │      │isolated │
    └─────────┘        └──────────┘      └─────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ and npm
- MariaDB 10.5+
- RabbitMQ 3.8+

### 1. Setup Databases

**Windows:**
```bash
setup_databases.bat
```

**Linux/macOS:**
```bash
bash setup_databases.sh
```

Or manually run:
```sql
-- Create databases and users as shown in MICROSERVICES_INTEGRATION_GUIDE.md
```

### 2. Install Dependencies

```bash
cd Provider_Management_Service && npm install
cd ../Analytics_Service && npm install
cd ../Billing_Service && npm install
```

### 3. Configure Environment

Copy `.env.template` to `.env` in each service directory:

```bash
cp Provider_Management_Service/.env.template Provider_Management_Service/.env
cp Analytics_Service/.env.template Analytics_Service/.env
cp Billing_Service/.env.template Billing_Service/.env
```

Update credentials if using non-default MariaDB/RabbitMQ settings.

### 4. Start Services

Open three terminals and run:

```bash
# Terminal 1
cd Provider_Management_Service && npm start

# Terminal 2
cd Analytics_Service && npm start

# Terminal 3
cd Billing_Service && npm start
```

Each service will:
1. Initialize database schema automatically
2. Test database connection
3. Connect to RabbitMQ
4. Start consuming/publishing events

---

## 📚 API Documentation

### Provider Management Service

#### Register Provider
```bash
POST /api/providers/register
Content-Type: application/json

{
  "provider_name": "Tesla Charging",
  "base_url": "https://api.tesla-charging.com",
  "api_key": "sk_test_123abc",
  "endpoint_list_points": "/api/v1/points",
  "endpoint_point_details": "/api/v1/points/{id}",
  "endpoint_reserve": "/api/v1/reserve",
  "endpoint_reserve_duration": "/api/v1/reserve/duration"
}
```

#### Get All Providers
```bash
GET /api/providers?status=active&limit=10
```

#### Get Provider Details
```bash
GET /api/providers/1
```

---

### Analytics Service

#### Get Provider Analytics
```bash
GET /api/analytics/provider/1?period=monthly
```

Response:
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
  "daily_breakdown": [...]
}
```

#### Get Global Analytics
```bash
GET /api/analytics/global?period=monthly
```

---

### Billing Service

#### Get Current Invoice
```bash
GET /api/billing/invoice/1
```

Response:
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
  "line_items": [...],
  "metadata": {...}
}
```

#### Get All Invoices
```bash
GET /api/billing/invoices/1?limit=12
```

#### Mark Invoice as Paid
```bash
POST /api/billing/invoices/1/42/mark-paid
```

---

## 📡 Event Routing & RabbitMQ

### Exchanges Created Automatically

- **provider_exchange**: Provider registration events
- **analytics_exchange**: Analytics event consumption
- **billing_exchange**: Billing event consumption

### Event Flow

**Provider Registration:**
```
Provider_Management_Service
  → Publishes: provider.registered
  → Exchange: provider_exchange
  → Routing Key: provider.registered
```

**Analytics:**
```
External Services (Search, Points, Reservation)
  → Publishes: point_viewed, reservation_made, search_performed
  → Exchange: analytics_exchange
  → Consumed by: Analytics_Service
  → Stored in: analytics_logs table
  → Aggregated via: GET /api/analytics/provider/:id
```

**Billing:**
```
Reservation Service
  → Publishes: reservation_successful
  → Exchange: billing_exchange
  → Consumed by: Billing_Service
  → Stored in: billable_events table
  → Invoiced via: GET /api/billing/invoice/:id
```

---

## 🗄️ Database Schemas

### Provider Management Database

```sql
providers:
  - provider_id (PK)
  - provider_name (UNIQUE)
  - base_url
  - api_key
  - endpoint_list_points
  - endpoint_point_details
  - endpoint_reserve
  - endpoint_reserve_duration
  - status
  - registered_at
  - updated_at
```

### Analytics Database

```sql
analytics_logs:
  - id (PK)
  - provider_id (FK)
  - action_type (point_viewed, reservation_made, search_performed)
  - action_metadata (JSON)
  - timestamp

analytics_daily:
  - daily_id (PK)
  - provider_id (FK)
  - date
  - searches_count
  - point_views_count
  - reservations_count

analytics_summary:
  - summary_id (PK)
  - provider_id (FK, UNIQUE)
  - total_searches
  - total_point_views
  - total_reservations
```

### Billing Database

```sql
billable_events:
  - event_id (PK)
  - provider_id (FK)
  - reservation_id
  - amount (EUR)
  - event_type
  - billing_month
  - created_at

invoices:
  - invoice_id (PK)
  - provider_id (FK)
  - billing_period_start
  - billing_period_end
  - total_amount
  - tax_amount (21% VAT)
  - grand_total
  - status (draft, sent, paid, overdue)
  - event_count
  - issued_at
  - due_date
  - paid_at

invoice_line_items:
  - line_id (PK)
  - invoice_id (FK)
  - description
  - quantity
  - unit_price
  - line_total

pricing_config:
  - config_id (PK)
  - provider_id (FK, NULL for default)
  - cost_per_reservation (default: €0.50)
  - cost_per_charging_hour (default: €1.00)
  - setup_fee
  - active
```

---

## 🧪 Testing

### Health Checks
```bash
curl http://localhost:3105/health
curl http://localhost:3102/health
curl http://localhost:3103/health
```

### Example Workflow

**1. Register a Provider:**
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

**2. View Provider's Analytics:**
```bash
curl http://localhost:3102/api/analytics/provider/1?period=monthly
```

**3. Get Provider's Current Invoice:**
```bash
curl http://localhost:3103/api/billing/invoice/1
```

---

## 📝 Implementation Notes

### Database Isolation
- ✅ Each microservice has a **completely isolated** MariaDB database
- ✅ No shared databases across services
- ✅ Services communicate only via RabbitMQ messages
- ✅ No real-time blocking HTTP calls between services

### Asynchronous Communication
- ✅ RabbitMQ used for all inter-service events
- ✅ Events persist in queues even if consumer is down
- ✅ Dead Letter Queues for failed message handling
- ✅ No synchronous service-to-service calls

### API Standards
- ✅ All responses are UTF-8 JSON
- ✅ Consistent error handling
- ✅ HTTP status codes properly used
- ✅ Pagination support where applicable

### Billing Calculation
- ✅ Per-reservation cost model (€0.50 default)
- ✅ Monthly invoice generation
- ✅ Automatic 21% VAT calculation
- ✅ Configurable pricing per provider or globally

---

## 🔧 Configuration

All services support environment variables for customization:

```env
PORT=3105
DB_HOST=localhost
DB_PORT=3306
DB_USER=provider_mgmt_user
DB_PASSWORD=provider_mgmt_pass
DB_NAME=provider_mgmt_db
RABBITMQ_URL=amqp://localhost
NODE_ENV=development
LOG_LEVEL=info
```

---

## 📖 Documentation Files

- **MICROSERVICES_INTEGRATION_GUIDE.md** - Complete integration guide with examples
- **Provider_Management_Service/db/schema.sql** - Provider database schema
- **Analytics_Service/db/schema.sql** - Analytics database schema
- **Billing_Service/db/schema.sql** - Billing database schema
- **setup_databases.sh** - Linux/macOS database setup
- **setup_databases.bat** - Windows database setup

---

## 🐛 Troubleshooting

### Services won't start
1. Verify MariaDB is running: `mysql -u root -e "SELECT 1;"`
2. Check RabbitMQ: `rabbitmqctl status`
3. Verify ports 3105, 3102, 3103 are available
4. Check database credentials in .env files

### Events not being consumed
1. Check RabbitMQ management: http://localhost:15672
2. Verify queue bindings exist
3. Check Dead Letter Queue for failed messages
4. Review console logs for connection errors

### Database errors
1. Verify user privileges: `SHOW GRANTS FOR 'user'@'localhost';`
2. Test connection: `mysql -u user -p -h localhost database_name`
3. Ensure databases exist: `SHOW DATABASES;`

---

## 📄 License

This project is part of the saasPlug platform.

---

## 👤 Author

**Senior Backend Engineer**
- Date: May 28, 2026
- Stack: Node.js, Express.js, MariaDB, RabbitMQ

---

## 📊 Service Health

Check the status of all services:

```bash
# Individual health checks
curl http://localhost:3105/health
curl http://localhost:3102/health
curl http://localhost:3103/health

# All should respond with:
{
  "status": "healthy",
  "service": "service-name",
  "port": 310X,
  "database": "database_name",
  "timestamp": "2026-05-28T14:30:00.000Z"
}
```

---

**Version**: 1.0.0  
**Last Updated**: May 28, 2026  
**Status**: ✅ Production Ready
