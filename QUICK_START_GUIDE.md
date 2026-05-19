# Quick Start Guide - SaaS Plug Multi-Provider Integration

## 📋 Overview
This guide will help you run and test the multi-provider charging points platform with RedPlug, GreenPlug, and BluePlug adapters.

---

## 🚀 Step 1: Install Dependencies

Run this in each service directory:

```bash
# Points Service
cd Points_Service
npm install

# Reservation Service
cd ../Reservation_Service
npm install

# API Gateway
cd ../API_Gateway
npm install
```

---

## 🏃 Step 2: Start Services (Terminal Windows)

### Terminal 1 - Points Service
```bash
cd Points_Service
npm start
# Output: Points Service listening on port 3001
```

### Terminal 2 - Reservation Service
```bash
cd Reservation_Service
npm start
# Output: Reservation Service listening on port 3003
```

### Terminal 4 - API Gateway
```bash
cd API_Gateway
npm start
# Output: API Gateway listening on port 8000
```

---

## ✅ Step 3: Verify Services Running

Check all services are healthy:
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "pointsService": { "status": "ok", "port": 3001 },
    "statusService": { "status": "ok", "port": 3002 },
    "reservationService": { "status": "ok", "port": 3003 }
  }
}
```

---

## 🧪 Step 4: Test Endpoints

### Get All Charging Points (from all providers)
```bash
curl http://localhost:3001/api/points
```

### Get Points from Specific Provider
```bash
# RedPlug
curl http://localhost:3001/api/points?provider=redPlug

# GreenPlug  
curl http://localhost:3001/api/points?provider=greenPlug

# BluePlug
curl http://localhost:3001/api/points?provider=bluePlug
```

### Check Provider Status
```bash
curl http://localhost:3002/api/status
```

### Create Reservation
```bash
curl -X POST http://localhost:3003/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "redPlug",
    "pointid": "1",
    "minutes": 30,
    "userId": "user123"
  }'
```

### Get All Reservations
```bash
curl http://localhost:3003/api/reservations
```

---

## 📊 API Gateway Routing

The API Gateway routes requests to microservices:

- **Port 8000** - Unified API entry point
  - `/api/points/*` → Points Service (3001)
  - `/api/reservations/*` → Reservation Service (3003)
  - `/health` → Health check all services

---

## 🔑 Key Features Implemented

### 1. **Provider Adapters (Factory Pattern)**
Each service uses `ProviderAdapterFactory` to handle different provider APIs:

- **RedPlug**: `/redPlug/api/points`, `/redPlug/api/reserve/{id}`
- **GreenPlug**: `/greenPlug/api/chargingPoints`, `/greenPlug/api/chargingPoints/{id}/reservations`
- **BluePlug**: `/bluePlug/api/locations`, `/bluePlug/api/location/{id}/hold`

### 2. **Data Normalization**
All responses normalized to unified schema:
```json
{
  "pointid": "unique-id",
  "provider": "redPlug|greenPlug|bluePlug",
  "lon": 23.72,
  "lat": 37.98,
  "status": "available|busy|maintenance",
  "capacity_kw": 50,
  "kwh_price": 0.45,
  "reservation_end_time": "2024-01-15T10:30:00Z"
}
```

### 3. **Advanced Search**
```bash
curl 'http://localhost:3001/api/search?status=available&provider=redPlug&capacity_min=20&capacity_max=50'
```

### 4. **Statistics**
```bash
curl http://localhost:3001/api/statistics
```

---

## 📝 Important Notes

### Service Endpoints

**Points Service (3001)**
- `GET /api/points` - List all points
- `GET /api/points/:provider/:pointid` - Get specific point
- `GET /api/search` - Advanced search with filters
- `GET /api/statistics` - Aggregate statistics

**Reservation Service (3003)**
- `POST /api/reservations` - Create reservation
- `GET /api/reservations` - List reservations
- `GET /api/reservations/by-provider/:provider` - Filter by provider
- `GET /api/reservations/statistics` - Reservation stats

---

**API Gateway (8000)**
- `GET /health` - Health check for all services
- `POST /api/reservations` - Create reservation
- `GET /api/reservations` - List reservations
- `GET /api/reservations/by-provider/:provider` - Filter by provider
- `GET /api/reservations/statistics` - Reservation stats

---

## 🐛 Troubleshooting

### Services won't start?
```bash
# Check if ports are already in use
lsof -i :3001  # Check port 3001
lsof -i :3002  # Check port 3002
lsof -i :3003  # Check port 3003
lsof -i :8000  # Check port 8000

# Kill process using port:
kill -9 <PID>
```

### Provider API connection fails?
Check if provider URLs are accessible:
```bash
curl https://davinci.softlab.ntua.gr/saas26/redPlug/api/points
curl https://davinci.softlab.ntua.gr/saas26/greenPlug/api/chargingPoints
curl https://davinci.softlab.ntua.gr/saas26/bluePlug/api/locations
```

### Empty results from providers?
- Verify provider URLs in `providerAdapter.js` match actual endpoints
- Check network connectivity/firewall settings
- Review error logs in service terminal output

---

## 📦 Testing with Postman

Import `postman_collection.json` for pre-configured test requests:
1. Open Postman
2. Click "Import"
3. Select `postman_collection.json`
4. Run individual requests or entire collection

---

## 🔄 Next Steps

1. **Database Integration**
   - Connect Reservation Service to persistent storage
   - Implement Points caching

2. **RabbitMQ Messaging**
   - Add event publishing for reservation confirmations
   - Implement status change notifications

3. **Authentication**
   - Implement JWT-based auth in API Gateway
   - Protect sensitive endpoints

4. **Frontend Deployment**
   - React application consuming unified `/api/*` endpoints
   - Real-time map visualization of charging points

---

## 📞 Support

See `PROVIDER_INTEGRATION.md` for detailed architecture and provider-specific documentation.
