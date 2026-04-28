# Provider API Setup Guide

Quick setup guide for the new Provider API Service integration.

## What's New

The Provider API Service provides a unified, OpenAPI 3.1.0 compliant interface to three EV charging providers:
- **redPlug**
- **greenPlug**
- **bluePlug**

## Files Created/Modified

### New Files

```
Provider_API_Service/
├── src/
│   └── index.js          (Main service with all endpoints)
├── package.json          (Service dependencies)
├── README.md             (Service documentation)
└── Dockerfile            (Docker configuration)

PROVIDER_API_INTEGRATION.md  (Complete integration guide)
```

### Modified Files

```
Provider_Management_Service/src/adapters/providerAdapter.js
  - Added: listChargingPoints()
  - Added: getChargingPoint()
  - Added: reserveChargingPoint()
  - Added: normalizeChargingPoint()
  - Added: normalizeReservation()
  - Enhanced endpoints configuration

API_Gateway/src/index.js
  - Added: providerApi service URL
  - Added: Routes for /redPlug, /greenPlug, /bluePlug, /docs
  - Updated: Root endpoint documentation
  - Updated: SERVICES configuration

.env.example
  - Added: PROVIDER_API_SERVICE_URL
  - Added: Port configurations for all services
  - Added: Database URLs
  - Added: JWT configuration

docker-compose.yml
  - Added: provider-api-service container
  - Added: Health check configuration
```

## Quick Start

### 1. Install Dependencies

```bash
cd Provider_API_Service
npm install
```

### 2. Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Provider API Service
PORT=3200

# Provider Base URLs (already configured)
REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api
```

### 3. Start Service

#### Development

```bash
cd Provider_API_Service
npm run dev
```

#### Production

```bash
cd Provider_API_Service
npm start
```

#### Docker

```bash
docker-compose up provider-api-service
```

### 4. Verify

```bash
curl http://localhost:3200/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-04-28T10:30:00Z",
  "service": "Provider API Service",
  "version": "1.0.0"
}
```

## API Usage Examples

### Get Documentation

```bash
curl http://localhost:3200/docs
```

### List redPlug Points

```bash
curl -X GET http://localhost:3200/redPlug/api/points \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Reserve greenPlug Point

```bash
curl -X POST http://localhost:3200/greenPlug/api/chargingPoints/123/reservations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"duration": 120}'
```

### Hold bluePlug Charger

```bash
curl -X POST "http://localhost:3200/bluePlug/api/location/456/hold?minutes=90" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Integration with Existing Services

### Via API Gateway

All Provider API endpoints are automatically routed through the API Gateway:

```bash
# Instead of direct access
curl http://localhost:3200/redPlug/api/points

# Access through gateway
curl http://localhost:3000/redPlug/api/points
```

### From Other Microservices

Services can call Provider API directly:

```javascript
const providerApiUrl = process.env.PROVIDER_API_SERVICE_URL;

const response = await axios.get(`${providerApiUrl}/redPlug/api/points`, {
  headers: { 'Authorization': authToken }
});
```

## Health Check Endpoints

```bash
# Provider API Service health
curl http://localhost:3200/health

# API Gateway health (includes all services)
curl http://localhost:3000/health
```

## Documentation

For detailed information, see:
- [Provider_API_Service/README.md](Provider_API_Service/README.md)
- [PROVIDER_API_INTEGRATION.md](PROVIDER_API_INTEGRATION.md)

## Troubleshooting

### Service won't start

```bash
# Check Node.js version (requires 18+)
node --version

# Check if port 3200 is available
netstat -an | grep 3200

# Check dependencies
npm list
```

### Provider API not responding

```bash
# Verify service is running
curl http://localhost:3200/health

# Check logs
docker logs saasplug-provider-api
```

### Authorization errors

Ensure:
- Authorization header is included: `Authorization: Bearer {token}`
- Token is valid and not expired
- Backend is configured to validate tokens

### Provider connectivity

```bash
# Test provider API connectivity
curl -I https://davinci.softlab.ntua.gr/saas26/redPlug/api/points
curl -I https://davinci.softlab.ntua.gr/saas26/greenPlug/api/chargingPoints
curl -I https://davinci.softlab.ntua.gr/saas26/bluePlug/api/locations
```

## Environment Variables Summary

```env
# Service Port
PORT=3200

# Provider API Base URLs
REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api

# Node Environment
NODE_ENV=production|development
```

## Docker Commands

```bash
# Build image
docker build -f Provider_API_Service/Dockerfile -t saasplug-provider-api .

# Run container
docker run -p 3200:3200 \
  -e REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api \
  -e GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api \
  -e BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api \
  saasplug-provider-api

# Or use docker-compose
docker-compose up provider-api-service
```

## Postman Collection

Import Postman collection:

```bash
curl http://localhost:3200/docs/redPlug/postman
curl http://localhost:3200/docs/greenPlug/postman
curl http://localhost:3200/docs/bluePlug/postman
```

## Performance Notes

- Service timeout: 5 seconds per provider API call
- Recommended load balancer: nginx, HAProxy
- Scale horizontally: Run multiple instances
- Implement caching in calling services for frequently accessed data

## Security Checklist

- ✓ Authorization header validation (must be bearer token)
- ✓ Input parameter validation
- ✓ Provider API timeout protection
- ✓ Error message sanitization
- [ ] Rate limiting (configure in API Gateway)
- [ ] HTTPS in production (configure in load balancer)
- [ ] Token validation middleware (configure in API Gateway)

## Next Steps

1. **Test the API** - Use provided cURL examples or Postman
2. **Integrate with services** - Update Reservation, Points, other services
3. **Monitor health** - Set up monitoring for `/health` endpoint
4. **Scale** - Deploy multiple instances behind load balancer
5. **Document** - Add API documentation to your project wiki

## Support

For issues or questions:
1. Check service logs: `docker logs saasplug-provider-api`
2. Review [PROVIDER_API_INTEGRATION.md](PROVIDER_API_INTEGRATION.md)
3. Check [Provider_API_Service/README.md](Provider_API_Service/README.md)
4. Verify provider API connectivity
5. Check authorization token validity
