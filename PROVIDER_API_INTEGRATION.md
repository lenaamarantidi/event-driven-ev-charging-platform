# Provider API Integration Guide

Complete guide for integrating the new OpenAPI 3.1.0 Provider API Service with the EV SaaS platform.

## Overview

The Provider API Service is a new microservice that provides direct, standardized access to three EV charging providers:
- **redPlug**
- **greenPlug** 
- **bluePlug**

It implements the OpenAPI 3.1.0 specification and acts as a unified gateway for provider operations.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                            │
│  Port 3000 - Main entry point for all requests              │
└────┬──────────────────┬──────────────────┬──────────────────┘
     │                  │                  │
     ├──────────────────┼──────────────────┤
     │                  │                  │
┌────▼───────┐  ┌──────▼──────┐  ┌───────▼────────────┐
│ Auth       │  │ Points      │  │ Provider API       │
│ Service    │  │ Service     │  │ Service (NEW)      │
│ Port 3100  │  │ Port 3001   │  │ Port 3200          │
└────────────┘  └─────────────┘  └──────┬─────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
            ┌───────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐
            │ Provider Adapter│  │ redPlug API    │  │ greenPlug API  │
            │ Factory         │  │ (Remote)       │  │ (Remote)       │
            └─────────────────┘  └────────────────┘  └────────────────┘
                                         
                                  ┌──────────────────┐
                                  │ bluePlug API     │
                                  │ (Remote)         │
                                  └──────────────────┘
```

## Service Communication Flow

### Request Flow

```
1. Client Request
   ↓
2. API Gateway (Port 3000)
   - Routes /redPlug/*, /greenPlug/*, /bluePlug/*, /docs to Provider API Service
   ↓
3. Provider API Service (Port 3200)
   - Validates request format
   - Extracts provider name from path
   - Routes to appropriate adapter
   ↓
4. Provider Adapter (ProviderAdapterFactory)
   - Calls external provider API
   - Normalizes response data
   ↓
5. Response to Client
   - Standard JSON format
   - OpenAPI 3.1.0 compliant
```

## Environment Configuration

### Add to `.env` file:

```bash
# Provider API Service
PORT=3200
PROVIDER_API_SERVICE_URL=http://localhost:3200

# Provider Base URLs
REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api

# API Gateway Service URL for inter-service communication
PROVIDER_API_SERVICE_URL=http://provider-api-service:3200
```

## API Endpoints

### Health Check

```bash
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2024-04-28T10:30:00Z",
  "service": "Provider API Service",
  "version": "1.0.0"
}
```

### Documentation

```bash
GET /docs
GET /docs/{provider_name}
GET /docs/{provider_name}.yaml
GET /docs/{provider_name}/postman
```

### redPlug Endpoints

```bash
# List all points
GET /redPlug/api/points
Headers: Authorization: Bearer {token}

# Get point details
GET /redPlug/api/point/{pointid}
Headers: Authorization: Bearer {token}

# Reserve with default 60 minutes
POST /redPlug/api/reserve/{pointid}
Headers: Authorization: Bearer {token}

# Reserve with custom duration
POST /redPlug/api/reserve/{pointid}/{minutes}
Headers: Authorization: Bearer {token}
```

### greenPlug Endpoints

```bash
# List all charging points
GET /greenPlug/api/chargingPoints
Headers: Authorization: Bearer {token}

# Get charging point details
GET /greenPlug/api/chargingPoints/{pointid}
Headers: Authorization: Bearer {token}

# Create reservation
POST /greenPlug/api/chargingPoints/{pointid}/reservations
Headers: Authorization: Bearer {token}
Body: {"duration": 120}
```

### bluePlug Endpoints

```bash
# List all locations
GET /bluePlug/api/locations
Headers: Authorization: Bearer {token}

# Get location status
GET /bluePlug/api/location/{pointid}/status
Headers: Authorization: Bearer {token}

# Reserve charger
POST /bluePlug/api/location/{pointid}/hold?minutes=90
Headers: Authorization: Bearer {token}
```

## Integration with Existing Services

### 1. Reservation Service Integration

The Reservation Service can now use the Provider API:

```javascript
// In Reservation_Service/src/index.js
const providerApiUrl = process.env.PROVIDER_API_SERVICE_URL || 'http://localhost:3200';

async function makeReservation(provider, pointId, duration) {
  try {
    let endpoint;
    if (provider === 'redPlug') {
      endpoint = `/redPlug/api/reserve/${pointId}/${duration}`;
    } else if (provider === 'greenPlug') {
      endpoint = `/greenPlug/api/chargingPoints/${pointId}/reservations`;
      // POST with body for greenPlug
    } else if (provider === 'bluePlug') {
      endpoint = `/bluePlug/api/location/${pointId}/hold?minutes=${duration}`;
    }
    
    const response = await axios.post(`${providerApiUrl}${endpoint}`, {}, {
      headers: { 'Authorization': authToken }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error making reservation:', error);
    throw error;
  }
}
```

### 2. Points Service Integration

The Points Service can sync points data:

```javascript
// In Points_Service/src/index.js
const providerApiUrl = process.env.PROVIDER_API_SERVICE_URL || 'http://localhost:3200';

async function syncChargingPoints(provider) {
  try {
    let endpoint;
    if (provider === 'redPlug') {
      endpoint = `/redPlug/api/points`;
    } else if (provider === 'greenPlug') {
      endpoint = `/greenPlug/api/chargingPoints`;
    } else if (provider === 'bluePlug') {
      endpoint = `/bluePlug/api/locations`;
    }
    
    const response = await axios.get(`${providerApiUrl}${endpoint}`, {
      headers: { 'Authorization': authToken }
    });
    
    // Store normalized points in database
    return response.data;
  } catch (error) {
    console.error('Error syncing points:', error);
    throw error;
  }
}
```

### 3. API Gateway Integration

Routes are already configured in API Gateway:

```javascript
// In API_Gateway/src/index.js
app.use('/redPlug', httpProxy(SERVICES.providerApi, {
  proxyReqPathResolver: (req) => `/redPlug${req.url}`
}));
app.use('/greenPlug', httpProxy(SERVICES.providerApi, {
  proxyReqPathResolver: (req) => `/greenPlug${req.url}`
}));
app.use('/bluePlug', httpProxy(SERVICES.providerApi, {
  proxyReqPathResolver: (req) => `/bluePlug${req.url}`
}));
app.use('/docs', httpProxy(SERVICES.providerApi, {
  proxyReqPathResolver: (req) => `/docs${req.url}`
}));
```

## Response Normalization

The Provider API normalizes responses from different providers into a standard format:

### Charging Point Response

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
  "pricePerKwh": 0.35
}
```

### Reservation Response

```json
{
  "pointid": 123,
  "providerName": "redPlug",
  "status": "reserved",
  "reservedUntil": "2024-04-28T12:00:00Z",
  "pricePerKwh": 0.35
}
```

## Docker Deployment

### Dockerfile for Provider API Service

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY Provider_API_Service/package.json .
RUN npm install --production

COPY Provider_API_Service/src ./src

EXPOSE 3200

CMD ["node", "src/index.js"]
```

### Docker Compose Entry

```yaml
provider-api-service:
  build:
    context: .
    dockerfile: Provider_API_Service/Dockerfile
  ports:
    - "3200:3200"
  environment:
    PORT: 3200
    REDPLUG_BASE_URL: https://davinci.softlab.ntua.gr/saas26/redPlug/api
    GREENPLUG_BASE_URL: https://davinci.softlab.ntua.gr/saas26/greenPlug/api
    BLUEPLUG_BASE_URL: https://davinci.softlab.ntua.gr/saas26/bluePlug/api
  networks:
    - saas-network
```

## Error Handling

All errors return OpenAPI-compliant format:

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

## Testing

### Using cURL

```bash
# List redPlug points
curl -X GET http://localhost:3200/redPlug/api/points \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get documentation
curl -X GET http://localhost:3200/docs

# Make reservation
curl -X POST http://localhost:3200/redPlug/api/reserve/123/90 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using Postman

1. Import Postman collection from `/docs/{provider}/postman`
2. Set `Authorization` header with bearer token
3. Configure environment variables
4. Execute requests

## Monitoring

### Health Check URL

```bash
GET http://localhost:3200/health
```

### API Gateway Health

```bash
GET http://localhost:3000/health
```

Includes health status of all services including Provider API.

## Performance Considerations

- **Timeout**: 5 seconds per external API call
- **Caching**: Implement in Reservation/Points services using Redis
- **Rate Limiting**: Configure in API Gateway
- **Load Balancing**: Run multiple instances behind load balancer

## Security

- Authorization header validation required for all endpoints
- Implement token validation in API Gateway
- Use HTTPS in production
- Validate all input parameters
- Rate limit API calls per user/IP

## Troubleshooting

### Provider API Service not responding

```bash
# Check if service is running
curl http://localhost:3200/health

# Check API Gateway routing
curl http://localhost:3000/docs
```

### Invalid Authorization

- Ensure Authorization header is included
- Token must be valid Bearer token
- Check token expiration

### Provider API Timeout

- Check provider API status
- Verify network connectivity
- Increase timeout in configuration if needed

## Support

For issues or questions:
- Review Provider_API_Service/README.md
- Check API Gateway logs
- Validate provider API connectivity
