# Reservation_Service

**Port**: 3106  
**Database**: MariaDB `reservation_db` (isolated)  
**Architecture**: Microservice with Provider Adapters  
**Communication**: REST API (unified) + RabbitMQ (events)

---

## 📋 Overview

The **Reservation_Service** is the critical component that handles EV charging point reservations for the saasPlug platform. It provides:

1. **Unified API** - Frontend sends a single request format
2. **Provider Adapters** - Maps unified request to 3 different provider APIs (redPlug, greenPlug, bluePlug)
3. **Async Publishing** - Publishes `reservation_successful` events to RabbitMQ for Billing & Analytics services
4. **Local History** - Maintains isolated MariaDB database with all reservation attempts

---

## 🔄 Request Flow

```
Frontend
  │
  └─→ POST /api/reserve (unified format)
       ├─ providerName: "redPlug" | "greenPlug" | "bluePlug"
       ├─ pointId: "123"
       ├─ duration: 60 (minutes)
       └─ userId: "user-uuid" (optional)
       │
       ├→ Reservation_Service
       │  └─ Maps to provider-specific API call
       │  ├─ Provider API (redPlug/greenPlug/bluePlug)
       │  └─ Returns response
       │
       ├→ Log to MariaDB (reservation_logs)
       │
       ├→ Publish to RabbitMQ (async, non-blocking)
       │  └─ routing key: "reservation_successful"
       │  └─ consumers: Billing_Service, Analytics_Service
       │
       └─ Return success response
```

---

## 🔌 Provider-Specific API Mapping

### **1. RedPlug**

**Unified Request:**
```json
{
  "providerName": "redPlug",
  "pointId": "123",
  "duration": 60
}
```

**Maps to:**
```
POST /redPlug/api/reserve/123/60
Authorization: Bearer {REDPLUG_API_KEY}
```

**Response Format:**
```json
{
  "pointid": 123,
  "status": "reserved",
  "reservationendtime": "2026-05-28T15:30:00Z",
  "long": 23.7275,
  "lat": 37.9838
}
```

---

### **2. GreenPlug**

**Unified Request:**
```json
{
  "providerName": "greenPlug",
  "pointId": "123",
  "duration": 60
}
```

**Maps to:**
```
POST /greenPlug/api/chargingPoints/123/reservations
Authorization: Bearer {GREENPLUG_API_KEY}
Content-Type: application/json

{
  "duration": 60
}
```

**Response Format:**
```json
{
  "id": 123,
  "state": "reserved",
  "reservedUntil": "2026-05-28T15:30:00Z",
  "kwhRateEur": 0.25,
  "coords": {
    "long": 23.7275,
    "lat": 37.9838
  }
}
```

---

### **3. BluePlug**

**Unified Request:**
```json
{
  "providerName": "bluePlug",
  "pointId": "123",
  "duration": 60
}
```

**Maps to:**
```
POST /bluePlug/api/location/123/hold?minutes=60
Authorization: Bearer {BLUEPLUG_API_KEY}
```

**Response Format:**
```json
{
  "chargerId": 123,
  "currentStatus": "reserved",
  "reservationEnd": "2026-05-28T15:30:00Z",
  "pricePerKwh": 0.30,
  "geo": [23.7275, 37.9838]
}
```

---

## 📊 Database Schema

### `reservation_logs` Table

```sql
-- Stores all reservation attempts (successful & failed)
CREATE TABLE reservation_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  reservation_id VARCHAR(36) UNIQUE,          -- UUID
  provider_id INT,                            -- 1=red, 2=green, 3=blue
  provider_name VARCHAR(50),                  -- redPlug, greenPlug, bluePlug
  point_id VARCHAR(100),                      -- Point ID from provider
  duration INT,                               -- Minutes
  user_id VARCHAR(36),                        -- User ID (optional)
  status VARCHAR(50),                         -- pending, confirmed, failed
  reservation_details JSON,                   -- Full API response
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## 📡 RabbitMQ Event Publishing

### Event: `reservation_successful`

**Exchange:** Both `billing_exchange` and `analytics_exchange`  
**Routing Key:** `reservation_successful`  
**Payload:**

```json
{
  "type": "reservation_successful",
  "reservationId": "550e8400-e29b-41d4-a716-446655440000",
  "providerId": 1,
  "providerName": "redPlug",
  "pointId": "123",
  "duration": 60,
  "timestamp": "2026-05-28T14:30:00Z",
  "action_type": "reservation_made",
  "event_metadata": {
    "reservation_id": "550e8400-e29b-41d4-a716-446655440000",
    "provider_id": 1,
    "point_id": "123",
    "duration_minutes": 60
  }
}
```

**Consumers:**
- ✅ **Billing_Service** - Uses to create billable_event (€0.50 per reservation)
- ✅ **Analytics_Service** - Uses to update analytics_logs & analytics_daily

---

## 🚀 Endpoints

### POST `/api/reserve` - Create Reservation

**Request:**
```bash
curl -X POST http://localhost:3106/api/reserve \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "redPlug",
    "pointId": "123",
    "duration": 60,
    "userId": "user-uuid-123"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "reservationId": "550e8400-e29b-41d4-a716-446655440000",
  "providerId": 1,
  "providerName": "redPlug",
  "pointId": "123",
  "duration": 60,
  "reservationDetails": {
    "pointid": 123,
    "status": "reserved",
    "reservationendtime": "2026-05-28T15:30:00Z",
    "location": { "long": 23.7275, "lat": 37.9838 }
  },
  "message": "Reservation successful. Event published to billing & analytics services."
}
```

**Error Response (400/500):**
```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "provider": "redPlug",
  "details": { ... provider API error response ... }
}
```

---

### GET `/api/reservations` - List Recent Reservations

```bash
curl http://localhost:3106/api/reservations
```

**Response:**
```json
{
  "success": true,
  "count": 42,
  "reservations": [
    {
      "reservation_id": "550e8400-e29b-41d4-a716-446655440000",
      "provider_name": "redPlug",
      "point_id": "123",
      "duration": 60,
      "status": "confirmed",
      "created_at": "2026-05-28 14:30:00"
    }
  ]
}
```

---

### GET `/api/reservations/:reservationId` - Get Details

```bash
curl http://localhost:3106/api/reservations/550e8400-e29b-41d4-a716-446655440000
```

---

### GET `/health` - Health Check

```bash
curl http://localhost:3106/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "Reservation_Service",
  "port": 3106,
  "database": "reservation_db",
  "timestamp": "2026-05-28T14:30:00.000Z"
}
```

---

## ⚙️ Configuration

Copy `.env.template` to `.env` and configure:

```env
# Server
PORT=3106

# MariaDB
DB_HOST=localhost
DB_PORT=3306
DB_USER=reservation_user
DB_PASSWORD=reservation_pass
DB_NAME=reservation_db

# RabbitMQ
RABBITMQ_URL=amqp://localhost

# External Providers (API Base URLs & Keys)
REDPLUG_BASE_URL=http://localhost:8001
REDPLUG_API_KEY=your-api-key

GREENPLUG_BASE_URL=http://localhost:8002
GREENPLUG_API_KEY=your-api-key

BLUEPLUG_BASE_URL=http://localhost:8003
BLUEPLUG_API_KEY=your-api-key
```

**Postman / API Key instructions**

- Φορτώστε στο Postman τις συλλογές που έχουν δοθεί για την εργασία.
- Μπορείτε επίσης να εισάγετε απευθείας αυτήν τη συλλογή:
  - `Reservation_Service/reservation-service-postman-collection.json`
- Βρείτε τη μεταβλητή `apiKey` στις Postman Variables και αντικαταστήστε το `sk_saas_replace_me` με το API key ομάδας:

```text
sk_saas_5dec282b47047b6eced41e64
```

- Στον τοπικό `.env`, χρησιμοποιήστε το ίδιο κλειδί για τους παρόχους:

```env
REDPLUG_API_KEY=sk_saas_5dec282b47047b6eced41e64
GREENPLUG_API_KEY=sk_saas_5dec282b47047b6eced41e64
BLUEPLUG_API_KEY=sk_saas_5dec282b47047b6eced41e64
```

- Τρέξτε το API όπως περιγράφεται στην τεκμηρίωση της εργασίας.

---

## 🏗️ Project Structure

```
Reservation_Service/
├── src/
│   ├── index.js           # Express server & routes
│   ├── db.js              # MariaDB connection & schema init
│   ├── controllers.js      # Provider adapter logic
│   └── rabbitmq.js        # RabbitMQ event publisher
├── db/
│   └── schema.sql         # Database schema (MariaDB)
├── package.json           # Dependencies
├── .env.template          # Configuration template
└── README.md             # This file
```

---

## 🔧 Installation & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database
```sql
-- MariaDB
CREATE DATABASE reservation_db CHARACTER SET utf8mb4;
CREATE USER 'reservation_user'@'localhost' IDENTIFIED BY 'reservation_pass';
GRANT ALL PRIVILEGES ON reservation_db.* TO 'reservation_user'@'localhost';
FLUSH PRIVILEGES;

-- Run schema.sql
mysql -u reservation_user -p reservation_db < db/schema.sql
```

Or use the automated script:
```bash
# Windows
setup_databases.bat

# Linux/macOS
bash setup_databases.sh
```

### 3. Copy Environment File
```bash
cp .env.template .env
```

Update with your configuration.

### 4. Start Service
```bash
npm start
```

You should see:
```
✓ Reservation_Service started on http://localhost:3106
✓ Database: reservation_db
✓ RabbitMQ: Connected
```

---

## 📝 Key Features

✅ **Provider Abstraction** - Frontend doesn't need to know provider APIs  
✅ **Unified Interface** - Same request format for all providers  
✅ **Error Handling** - Graceful failure with detailed error messages  
✅ **Async Publishing** - Non-blocking RabbitMQ event publishing  
✅ **Database Isolation** - Separate MariaDB database  
✅ **API Key Support** - Each provider has its own API key  
✅ **Timeout Protection** - 10-second timeout for provider API calls  
✅ **Comprehensive Logging** - All attempts logged (success & failure)  
✅ **Health Checks** - `/health` endpoint for monitoring

---

## 🔐 Security Considerations

- API keys stored in `.env` file (never commit to git)
- All communication with providers over HTTPS (in production)
- Authorization header used for provider authentication
- Timeout protection against slow provider APIs
- Input validation on all endpoints

---

## 📚 Integration with Other Services

### Billing_Service
- Consumes `reservation_successful` event
- Creates billable_event with amount €0.50
- Used for invoice generation

### Analytics_Service
- Consumes `reservation_successful` event  
- Logs as "reservation_made" action
- Updates daily aggregates

### Frontend
- Calls `POST /api/reserve` with unified format
- Receives response with reservation details
- Displays confirmation to user

---

## 🧪 Testing

### Test Reservation (cURL)
```bash
curl -X POST http://localhost:3106/api/reserve \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "redPlug",
    "pointId": "123",
    "duration": 60
  }'
```

### Test Health
```bash
curl http://localhost:3106/health
```

### View Reservations
```bash
curl http://localhost:3106/api/reservations
```

---

## 📊 Database Queries

### Get all reservations for today
```sql
SELECT * FROM reservation_logs 
WHERE DATE(created_at) = CURDATE()
ORDER BY created_at DESC;
```

### Get reservations by provider
```sql
SELECT * FROM reservation_logs 
WHERE provider_name = 'redPlug'
ORDER BY created_at DESC;
```

### Get failed reservations
```sql
SELECT * FROM reservation_logs 
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Daily statistics
```sql
SELECT 
  DATE(created_at) as date,
  provider_name,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM reservation_logs
GROUP BY DATE(created_at), provider_name
ORDER BY date DESC;
```

---

**Version**: 1.0.0  
**Last Updated**: May 29, 2026  
**Status**: ✅ Production Ready
