# Provider API Service

Direct EV charging provider API service implementing OpenAPI 3.1.0 specification for redPlug, greenPlug, and bluePlug providers.

## Overview

This service exposes unified REST API endpoints for interacting with multiple EV charging providers:
- **redPlug** - via `/redPlug/api/*` endpoints
- **greenPlug** - via `/greenPlug/api/*` endpoints  
- **bluePlug** - via `/bluePlug/api/*` endpoints

## Features

✓ OpenAPI 3.1.0 compliant endpoints
✓ Unified request/response normalization
✓ Authorization header support
✓ Provider-agnostic integration
✓ Health check endpoint
✓ API documentation endpoints
✓ Postman collection support

## Port

Default: **3200**

Configure via `PORT` environment variable.

## Environment Variables

```env
PORT=3200
REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api
```

## API Endpoints

### Health Check

```
GET /health
```

Returns service health status.

### Documentation

```
GET /docs
GET /docs/{provider_name}
GET /docs/{provider_name}.yaml
GET /docs/{provider_name}/postman
```

### redPlug Endpoints

```
GET    /redPlug/api/points                    - List charging points
GET    /redPlug/api/point/{pointid}           - Get point details
POST   /redPlug/api/reserve/{pointid}         - Reserve point (default 60 min)
POST   /redPlug/api/reserve/{pointid}/{minutes} - Reserve point with duration
```

### greenPlug Endpoints

```
GET    /greenPlug/api/chargingPoints          - List charging points
GET    /greenPlug/api/chargingPoints/{pointid} - Get point details
POST   /greenPlug/api/chargingPoints/{pointid}/reservations - Create reservation
```

### bluePlug Endpoints

```
GET    /bluePlug/api/locations                - List locations
GET    /bluePlug/api/location/{pointid}/status - Get location status
POST   /bluePlug/api/location/{pointid}/hold?minutes=60 - Reserve charger
```

## Request Examples

### List redPlug Points

```bash
curl -X GET http://localhost:3200/redPlug/api/points \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Point Details

```bash
curl -X GET http://localhost:3200/redPlug/api/point/123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Reserve Point

```bash
curl -X POST http://localhost:3200/redPlug/api/reserve/123/90 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### GreenPlug Reservation

```bash
curl -X POST http://localhost:3200/greenPlug/api/chargingPoints/456/reservations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"duration": 120}'
```

### BluePlug Hold Charger

```bash
curl -X POST "http://localhost:3200/bluePlug/api/location/789/hold?minutes=90" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Response Format

All successful responses return JSON with provider-normalized data:

```json
{
  "pointid": 123,
  "providerName": "redPlug",
  "status": "available",
  "reservedUntil": null,
  "capacity": 22,
  "connector": "Type 2",
  "locationName": "Downtown Station",
  "address": "123 Main St",
  "pricePerKwh": null
}
```

## Error Handling

Errors return OpenAPI-compliant error responses:

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

## Installation

```bash
npm install
```

## Running

```bash
# Development
npm run dev

# Production
npm start
```

## Integration with API Gateway

Add to API Gateway `src/index.js`:

```javascript
app.use('/api/providers', httpProxy(SERVICES.providerApi, {
  proxyReqPathResolver: (req) => {
    return req.url;
  }
}));
```

Update `.env`:

```env
PROVIDER_API_URL=http://localhost:3200
```

## Notes

- All endpoints support `Authorization` header for bearer token authentication
- Response normalization handles differences between provider APIs
- Error messages provide detailed validation feedback
- Suitable for load balancing and horizontal scaling
