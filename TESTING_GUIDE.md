# SaaS Plug - Comprehensive Testing Guide

## 📊 Testing Strategy

This guide provides detailed test scenarios for validating the multi-provider integration with Factory Pattern adapters.

---

## 🧪 Unit Test Scenarios

### Test Suite 1: Provider Adapter Factory

**Objective**: Verify that adapters correctly route to different provider endpoints

**Test Cases**:
```bash
# Test 1.1 - RedPlug Adapter Initialization
curl http://localhost:3001/api/points/redPlug/1

# Test 1.2 - GreenPlug Adapter Initialization  
curl http://localhost:3001/api/points/greenPlug/1

# Test 1.3 - BluePlug Adapter Initialization
curl http://localhost:3001/api/points/bluePlug/1
```

**Expected Result**: Each request returns normalized data from respective provider

---

### Test Suite 2: Data Normalization

**Objective**: Verify that disparate provider responses are normalized to unified schema

**Test Cases**:
```bash
# Test 2.1 - Verify RedPlug Response Structure
curl http://localhost:3001/api/points?provider=redPlug | jq '.points[0]'

# Expected:
# {
#   "pointid": "1",
#   "provider": "redPlug",
#   "lon": 23.73,
#   "lat": 37.97,
#   "status": "available",
#   "capacity_kw": 50,
#   "kwh_price": 0.45,
#   "reservation_end_time": "2024-01-15T10:30:00Z"
# }

# Test 2.2 - Verify GreenPlug Response Structure
curl http://localhost:3001/api/points?provider=greenPlug | jq '.points[0]'

# Test 2.3 - Verify BluePlug Response Structure  
curl http://localhost:3001/api/points?provider=bluePlug | jq '.points[0]'
```

**Expected Result**: All responses have identical field names and structure

---

## 🔄 Integration Test Scenarios

### Test Suite 3: Points Service Aggregation

**Objective**: Verify aggregation across all 3 providers

**Test Case 3.1 - Get All Points**:
```bash
curl http://localhost:3001/api/points | jq '.'

# Expected: Array containing points from all 3 providers
# {
#   "total": 150,
#   "providers": {
#     "redPlug": 50,
#     "greenPlug": 50,
#     "bluePlug": 50
#   },
#   "points": [...]
# }
```

**Test Case 3.2 - Filter by Provider**:
```bash
curl 'http://localhost:3001/api/points?provider=redPlug' | jq '.total'

# Expected: 50 (only RedPlug points)
```

**Test Case 3.3 - Filter by Status**:
```bash
curl 'http://localhost:3001/api/points?status=available' | jq '.total'

# Expected: Number of available points across all providers
```

**Test Case 3.4 - Advanced Search with Multiple Filters**:
```bash
curl 'http://localhost:3001/api/search?provider=greenPlug&status=available&capacity_min=30&capacity_max=100' | jq '.'

# Expected: Array of GreenPlug points that are:
# - Status: available
# - Capacity: 30-100 kW
```

---

### Test Suite 4: Status Service

**Objective**: Verify health checking across providers

**Test Case 4.1 - Check All Providers**:
```bash
curl http://localhost:3002/api/status | jq '.'

# Expected:
# {
#   "status": "healthy",
#   "by_status": {
#     "online": 3,
#     "offline": 0
#   },
#   "providers": {
#     "redPlug": { "status": "online", "lastCheck": "2024-01-15T10:00:00Z" },
#     "greenPlug": { "status": "online", "lastCheck": "2024-01-15T10:00:00Z" },
#     "bluePlug": { "status": "online", "lastCheck": "2024-01-15T10:00:00Z" }
#   }
# }
```

**Test Case 4.2 - Check Specific Provider**:
```bash
curl http://localhost:3002/api/status/redPlug | jq '.'

# Expected: status: "online"
```

**Test Case 4.3 - Get Detailed Point Status**:
```bash
curl http://localhost:3002/api/status/detailed/redPlug/1 | jq '.'

# Expected: Detailed status of specific charging point with current load
```

---

### Test Suite 5: Reservation Service

**Objective**: Verify reservation creation and tracking across providers

**Test Case 5.1 - Reserve from RedPlug**:
```bash
curl -X POST http://localhost:3003/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "redPlug",
    "pointid": "1",
    "minutes": 30,
    "userId": "user123"
  }' | jq '.'

# Expected:
# {
#   "id": "uuid",
#   "provider": "redPlug",
#   "pointid": "1",
#   "status": "success",
#   "reservationTime": "2024-01-15T10:05:00Z",
#   "endTime": "2024-01-15T10:35:00Z",
#   "userId": "user123"
# }
```

**Test Case 5.2 - Reserve from GreenPlug**:
```bash
curl -X POST http://localhost:3003/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "greenPlug",
    "pointid": "5",
    "minutes": 45,
    "userId": "user456"
  }' | jq '.status'

# Expected: "success"
```

**Test Case 5.3 - Reserve from BluePlug**:
```bash
curl -X POST http://localhost:3003/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "bluePlug",
    "pointid": "10",
    "minutes": 60,
    "userId": "user789"
  }' | jq '.id'

# Expected: UUID of new reservation
```

**Test Case 5.4 - Get All Reservations**:
```bash
curl http://localhost:3003/api/reservations | jq '.total'

# Expected: 3 (from test cases 5.1, 5.2, 5.3)
```

**Test Case 5.5 - Filter Reservations by Provider**:
```bash
curl http://localhost:3003/api/reservations/by-provider/redPlug | jq '.total'

# Expected: 1 (only RedPlug reservation)
```

---

### Test Suite 6: API Gateway Routing

**Objective**: Verify that API Gateway correctly routes to all services

**Test Case 6.1 - Health Check**:
```bash
curl http://localhost:8000/health | jq '.services'

# Expected: All 3 services report "ok" status
```

**Test Case 6.2 - Route to Points Service**:
```bash
curl http://localhost:8000/api/points | jq '.total'

# Should get same result as direct Points Service call
```

**Test Case 6.3 - Route to Status Service**:
```bash
curl http://localhost:8000/api/status | jq '.status'

# Should get same result as direct Status Service call
```

**Test Case 6.4 - Route to Reservation Service**:
```bash
curl http://localhost:8000/api/reservations | jq '.total'

# Should get same result as direct Reservation Service call
```

---

## 🔴 Error Handling Tests

### Test Suite 7: Error Scenarios

**Test Case 7.1 - Non-existent Provider**:
```bash
curl http://localhost:3001/api/points/invalidProvider/1

# Expected: 404 - Provider not supported
```

**Test Case 7.2 - Non-existent Point**:
```bash
curl http://localhost:3001/api/points/redPlug/99999

# Expected: 404 - Point not found or empty result
```

**Test Case 7.3 - Service Offline**:
Stop one service, then:
```bash
curl http://localhost:8000/health | jq '.services'

# Expected: Affected service shows "error" status
```

**Test Case 7.4 - Invalid Reservation Request**:
```bash
curl -X POST http://localhost:3003/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "redPlug"
    # Missing required fields
  }'

# Expected: 400 - Bad Request
```

---

## 📈 Performance Tests

### Test Suite 8: Load Testing

**Test Case 8.1 - Concurrent Points Requests**:
```bash
# Using Apache Bench
ab -n 100 -c 10 http://localhost:3001/api/points

# Expected: All requests complete successfully
# Target: < 100ms response time
```

**Test Case 8.2 - Concurrent Aggregation**:
```bash
# Multiple simultaneous requests to aggregation endpoint
for i in {1..20}; do
  curl -s http://localhost:3001/api/points &
done
wait

# Expected: All requests complete, consistent results
```

---

## 🧬 Provider-Specific Test Cases

### Test Suite 9: RedPlug Integration

**Endpoint**: `https://davinci.softlab.ntua.gr/saas26/redPlug/api`

**Test Case 9.1 - Verify Endpoint Names**:
```bash
curl 'http://localhost:3001/api/search?provider=redPlug' | jq '.points[0].provider'

# Expected: "redPlug"
```

**Test Case 9.2 - Verify Capacity Field Mapping**:
```bash
curl 'http://localhost:3001/api/points/redPlug/1' | jq '.'

# Expected: "capacity_kw" field (not "capacity" or "kwhprice")
```

---

### Test Suite 10: GreenPlug Integration

**Endpoint**: `https://davinci.softlab.ntua.gr/saas26/greenPlug/api`

**Test Case 10.1 - Verify Endpoint Names**:
```bash
curl 'http://localhost:3001/api/search?provider=greenPlug' | jq '.points[0].provider'

# Expected: "greenPlug"
```

**Test Case 10.2 - Verify Response Format**:
```bash
curl 'http://localhost:3001/api/points/greenPlug/1' | jq '.'

# Should have normalized fields despite GreenPlug's different naming
```

---

### Test Suite 11: BluePlug Integration

**Endpoint**: `https://davinci.softlab.ntua.gr/saas26/bluePlug/api`

**Test Case 11.1 - Verify Endpoint Names**:
```bash
curl 'http://localhost:3001/api/search?provider=bluePlug' | jq '.points[0].provider'

# Expected: "bluePlug"
```

**Test Case 11.2 - Verify Location Field Mapping**:
```bash
curl 'http://localhost:3001/api/points/bluePlug/1' | jq '.lon, .lat'

# Expected: numeric values mapped from "longitude" and "latitude"
```

---

## 🔍 Debugging Commands

### Check Service Logs
```bash
# Each service outputs logs to console
# Look for:
# - "Service listening on port XXX"
# - API request logs
# - Error messages

tail -f service.log  # If logging to file
```

### Test Direct Provider Communication
```bash
# Test if adapters are calling correct provider endpoints
curl https://davinci.softlab.ntua.gr/saas26/redPlug/api/points

curl https://davinci.softlab.ntua.gr/saas26/greenPlug/api/chargingPoints

curl https://davinci.softlab.ntua.gr/saas26/bluePlug/api/locations
```

### Verify JSON Response Structure
```bash
# Pretty print and validate JSON
curl http://localhost:3001/api/points | jq '.' > response.json

# Check for required fields
jq '.points[0] | keys' response.json
```

---

## ✅ Validation Checklist

Before declaring implementation complete:

- [ ] All 3 providers return data
- [ ] Data is normalized to same schema
- [ ] Points/Status/Reservation services work independently
- [ ] API Gateway routes all requests correctly
- [ ] Aggregation works (combining all providers)
- [ ] Filtering works (by provider, status, capacity)
- [ ] Reservations persist across requests
- [ ] Error handling returns appropriate HTTP codes
- [ ] No provider API URLs hardcoded (all in adapters)
- [ ] All services start without errors

---

## 📝 Test Results Template

```markdown
### Test Execution - [DATE]

**Environment**: 
- Node.js: [VERSION]
- npm: [VERSION]
- OS: [WINDOWS/MAC/LINUX]

**Services Status**:
- [ ] Points Service (3001) - ✅/❌
- [ ] Status Service (3002) - ✅/❌
- [ ] Reservation Service (3003) - ✅/❌
- [ ] API Gateway (8000) - ✅/❌

**Provider Status**:
- [ ] RedPlug - ✅/❌ [Response time: XXms]
- [ ] GreenPlug - ✅/❌ [Response time: XXms]
- [ ] BluePlug - ✅/❌ [Response time: XXms]

**Test Results**:
- [ ] Aggregation Test - ✅/❌
- [ ] Provider-Specific Tests - ✅/❌
- [ ] Reservation Tests - ✅/❌
- [ ] Error Handling - ✅/❌
- [ ] API Gateway Routing - ✅/❌

**Issues Found**:
(None) / [List issues]

**Notes**:
(Add any observations or recommendations)
```

---

## 🚀 Next Steps After Testing

1. **Performance Optimization**
   - Add response caching for frequently accessed points
   - Implement rate limiting per provider

2. **Database Integration**
   - Move reservations from in-memory to database
   - Add historical tracking

3. **Event Publishing**
   - RabbitMQ integration for reservation events
   - Real-time updates to frontend

4. **Security Hardening**
   - Add authentication/authorization
   - Validate all inputs
   - Rate limiting and DDoS protection
