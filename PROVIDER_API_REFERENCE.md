# Provider API Quick Reference

**Fast lookup guide for Provider API endpoints and usage**

---

## Service Information

| Item | Value |
|------|-------|
| **Service Name** | Provider API Service |
| **Port** | 3200 |
| **API Version** | 1.0.0 |
| **OpenAPI** | 3.1.0 |
| **Status Endpoint** | GET /health |

---

## Endpoint Summary

### redPlug Endpoints

```
GET    /redPlug/api/points
GET    /redPlug/api/point/{pointid}
POST   /redPlug/api/reserve/{pointid}
POST   /redPlug/api/reserve/{pointid}/{minutes}
```

### greenPlug Endpoints

```
GET    /greenPlug/api/chargingPoints
GET    /greenPlug/api/chargingPoints/{pointid}
POST   /greenPlug/api/chargingPoints/{pointid}/reservations
```

### bluePlug Endpoints

```
GET    /bluePlug/api/locations
GET    /bluePlug/api/location/{pointid}/status
POST   /bluePlug/api/location/{pointid}/hold
```

### Documentation Endpoints

```
GET    /health
GET    /docs
GET    /docs/{provider_name}
GET    /docs/{provider_name}.yaml
GET    /docs/{provider_name}/postman
```

---

## Common Request Headers

```
Authorization: Bearer {token}
Content-Type: application/json
```

---

## Response Formats

### Success (200)

```json
{
  "pointid": 123,
  "providerName": "redPlug",
  "status": "available",
  "capacity": 22,
  "connector": "Type 2",
  "locationName": "Station Name",
  "address": "Address",
  "pricePerKwh": 0.35
}
```

### Error (422)

```json
{
  "detail": [
    {
      "loc": ["path", "pointid"],
      "msg": "Invalid point ID",
      "type": "value_error"
    }
  ]
}
```

---

## Quick cURL Examples

### List Points

```bash
# redPlug
curl -X GET http://localhost:3200/redPlug/api/points \
  -H "Authorization: Bearer {token}"

# greenPlug
curl -X GET http://localhost:3200/greenPlug/api/chargingPoints \
  -H "Authorization: Bearer {token}"

# bluePlug
curl -X GET http://localhost:3200/bluePlug/api/locations \
  -H "Authorization: Bearer {token}"
```

### Get Point Details

```bash
# redPlug
curl -X GET http://localhost:3200/redPlug/api/point/123 \
  -H "Authorization: Bearer {token}"

# greenPlug
curl -X GET http://localhost:3200/greenPlug/api/chargingPoints/456 \
  -H "Authorization: Bearer {token}"

# bluePlug
curl -X GET http://localhost:3200/bluePlug/api/location/789/status \
  -H "Authorization: Bearer {token}"
```

### Make Reservation

```bash
# redPlug (60 min default)
curl -X POST http://localhost:3200/redPlug/api/reserve/123 \
  -H "Authorization: Bearer {token}"

# redPlug (custom duration)
curl -X POST http://localhost:3200/redPlug/api/reserve/123/90 \
  -H "Authorization: Bearer {token}"

# greenPlug
curl -X POST http://localhost:3200/greenPlug/api/chargingPoints/456/reservations \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"duration": 120}'

# bluePlug (query parameter)
curl -X POST "http://localhost:3200/bluePlug/api/location/789/hold?minutes=90" \
  -H "Authorization: Bearer {token}"
```

### Documentation

```bash
# List all endpoints
curl http://localhost:3200/docs

# Get provider spec
curl http://localhost:3200/docs/redPlug

# Get Postman collection
curl http://localhost:3200/docs/redPlug/postman
```

---

## Environment Variables

```env
PORT=3200
REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api
```

---

## Start Service

### Development

```bash
cd Provider_API_Service
npm install
npm run dev
```

### Production

```bash
cd Provider_API_Service
npm install
npm start
```

### Docker

```bash
docker-compose up provider-api-service
```

---

## Node.js Integration

```javascript
const axios = require('axios');

const API_URL = 'http://localhost:3200';

// List points
async function listPoints(provider, token) {
  const endpoints = {
    redPlug: '/redPlug/api/points',
    greenPlug: '/greenPlug/api/chargingPoints',
    bluePlug: '/bluePlug/api/locations'
  };
  
  const response = await axios.get(`${API_URL}${endpoints[provider]}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.data;
}

// Get point
async function getPoint(provider, pointId, token) {
  const endpoints = {
    redPlug: `/redPlug/api/point/${pointId}`,
    greenPlug: `/greenPlug/api/chargingPoints/${pointId}`,
    bluePlug: `/bluePlug/api/location/${pointId}/status`
  };
  
  const response = await axios.get(`${API_URL}${endpoints[provider]}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.data;
}

// Reserve point
async function reserve(provider, pointId, duration, token) {
  let url, body = {};
  
  if (provider === 'redPlug') {
    url = `/redPlug/api/reserve/${pointId}/${duration}`;
  } else if (provider === 'greenPlug') {
    url = `/greenPlug/api/chargingPoints/${pointId}/reservations`;
    body = { duration };
  } else if (provider === 'bluePlug') {
    url = `/bluePlug/api/location/${pointId}/hold?minutes=${duration}`;
  }
  
  const response = await axios.post(`${API_URL}${url}`, body, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.data;
}
```

---

## JavaScript/TypeScript Types

```typescript
interface ChargingPoint {
  pointid: number;
  providerName: 'redPlug' | 'greenPlug' | 'bluePlug';
  status: string;
  reservedUntil: string | null;
  capacity: number;
  connector: string | null;
  locationName: string | null;
  address: string | null;
  pricePerKwh?: number | null;
}

interface Reservation {
  pointid: number;
  providerName: 'redPlug' | 'greenPlug' | 'bluePlug';
  status: string;
  reservedUntil: string;
  pricePerKwh?: number;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  version: string;
}
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Server Error |

---

## Common Issues

### "Authorization required"
→ Add `Authorization: Bearer {token}` header

### "Invalid point ID"
→ Verify pointid is numeric and valid

### "Connection refused"
→ Ensure service is running on port 3200

### "Provider API timeout"
→ Check provider API connectivity
→ Service timeout is 5 seconds

---

## Testing

### Health Check
```bash
curl http://localhost:3200/health
```

Should return 200 with status "healthy"

### API Gateway Routing
```bash
curl http://localhost:3000/redPlug/api/points \
  -H "Authorization: Bearer {token}"
```

---

## Documentation Links

| Document | Purpose |
|----------|---------|
| [Provider_API_Service/README.md](Provider_API_Service/README.md) | Complete service docs |
| [PROVIDER_API_INTEGRATION.md](PROVIDER_API_INTEGRATION.md) | Integration guide |
| [PROVIDER_API_SETUP.md](PROVIDER_API_SETUP.md) | Setup guide |
| [PROVIDER_API_SUMMARY.md](PROVIDER_API_SUMMARY.md) | Summary of changes |

---

## Support

For detailed information:
1. Check service logs: `docker logs saasplug-provider-api`
2. Review documentation files
3. Test connectivity to provider APIs
4. Verify authorization tokens
5. Check environment variables
