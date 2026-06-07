# API Gateway

Production-ready API Gateway for the microservices platform. Single entry point for all backend services.

## Architecture

The gateway follows a clean, modular architecture:

```
API_Gateway/
├── app/
│   ├── __init__.py           # Application package
│   ├── main.py               # FastAPI app and route registration
│   ├── config.py             # Configuration management
│   ├── logger.py             # Logging setup with JSON formatting
│   ├── proxy.py              # Proxy service for request forwarding
│   ├── routes/               # Service-specific route handlers
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── providers.py
│   │   ├── points.py
│   │   ├── reservations.py
│   │   ├── billing.py
│   │   ├── payments.py
│   │   ├── analytics.py
│   │   ├── map.py
│   │   └── provider_api.py
│   └── middleware/           # Request/response middleware
│       ├── __init__.py
│       └── logging.py        # Logging and exception handling
├── requirements.txt          # Python dependencies
├── Dockerfile                # Docker container definition
├── .env.template             # Environment variables template
└── README.md                 # This file
```

## Features

### Core Routing
- Routes to 9 microservices via `/api/{service}/*` paths
- Preserves HTTP methods (GET, POST, PUT, PATCH, DELETE, OPTIONS)
- Forwards headers, query parameters, and request bodies
- Maintains response status codes and content types
- Provides gateway-only health plus upstream service health checks

### Logging & Monitoring
- Structured JSON logging to files and console
- Request/response lifecycle logging with timing
- Separate error log file
- Timestamp, method, path, status code in all logs
- Duration tracking in milliseconds

### Error Handling
- Global exception handling middleware
- Specific error codes:
  - 400: Bad Request
  - 404: Not Found
  - 502: Bad Gateway (forwarding errors)
  - 503: Service Unavailable (connection errors)
  - 504: Gateway Timeout
  - 500: Internal Server Error
- Detailed error responses with context

### Configuration
- Environment variable-based configuration
- Service URL discovery from `.env`
- Customizable request timeout
- Debug and log level settings
- Automatic settings caching

## Setup

### Local Development

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.template .env

# Edit .env for your local setup if needed

# Run
python -m uvicorn app.main:app --reload
```

The gateway will be available at `http://localhost:8000`

### Docker

Build and run with Docker:

```bash
docker build -t api-gateway .
docker run -p 8000:8000 \
  -e AUTH_SERVICE_URL=http://auth-service:3100 \
  -e PROVIDER_SERVICE_URL=http://provider-management-service:3101 \
  api-gateway
```

### Docker Compose

See `docker-compose.yml` in the root directory for full integration with all services.

## Environment Variables

### Application Config
- `APP_NAME`: Application name (default: "API Gateway")
- `APP_VERSION`: Version string (default: "1.0.0")
- `DEBUG`: Enable debug mode (default: "false")
- `PORT`: Port to listen on (default: 8000)
- `HOST`: Host to bind to (default: "0.0.0.0")
- `LOG_LEVEL`: Logging level - DEBUG, INFO, WARNING, ERROR (default: "INFO")

### Request Settings
- `REQUEST_TIMEOUT`: Request timeout in seconds (default: 30)
- `MAX_RETRIES`: Max retry attempts (default: 3)

### Service URLs
- `AUTH_SERVICE_URL`: Auth Service endpoint
- `PROVIDER_SERVICE_URL`: Provider Management Service endpoint
- `POINTS_SERVICE_URL`: Points/Central Service endpoint
- `RESERVATION_SERVICE_URL`: Reservation Service endpoint
- `BILLING_SERVICE_URL`: Billing Service endpoint
- `PAYMENT_SERVICE_URL`: Payment Service endpoint
- `ANALYTICS_SERVICE_URL`: Analytics Service endpoint
- `MAP_SERVICE_URL`: Map UI Service endpoint
- `PROVIDER_API_SERVICE_URL`: Provider API Service endpoint

## API Endpoints

### Gateway Info
```
GET /              # Gateway info and available routes
GET /health        # Health check with service URLs
GET /health/services # Connectivity check for all upstream services
```

### Service Proxies
```
GET /api/auth/*              # Auth Service proxy
GET /api/providers/*         # Provider Management Service proxy
GET /api/points/*            # Points Service proxy
GET /api/reservations/*      # Reservation Service proxy
GET /api/billing/*           # Billing Service proxy
GET /api/payments/*          # Payment Service proxy
GET /api/analytics/*         # Analytics Service proxy
GET /api/map/*               # Map UI Service proxy
GET /api/provider-api/*      # Provider API Service proxy
```

All HTTP methods (GET, POST, PUT, PATCH, DELETE, OPTIONS) are supported for all proxy routes.

## Logging

Logs are stored in the `logs/` directory:

- `api_gateway.log`: All application logs in JSON format
- `api_gateway_errors.log`: Errors only in JSON format

### Log Format

**Console (human-readable):**
```
2026-06-07 12:30:45 - api_gateway - INFO - → GET /api/auth/profile
2026-06-07 12:30:45 - api_gateway - INFO - ← GET /api/auth/profile - 200 (45.23ms)
```

**File (JSON):**
```json
{
  "timestamp": "2026-06-07T12:30:45.123456",
  "level": "INFO",
  "logger": "api_gateway",
  "message": "Response from http://auth-service:3100: 200",
  "method": "GET",
  "path": "/profile",
  "status_code": 200,
  "duration_ms": 45
}
```

## Error Handling

### Service Unavailable (503)
```json
{
  "error": "Service Unavailable",
  "details": "Could not connect to service at http://auth-service:3100",
  "service": "http://auth-service:3100"
}
```

### Gateway Timeout (504)
```json
{
  "error": "Gateway Timeout",
  "details": "Service at http://auth-service:3100 did not respond in time",
  "service": "http://auth-service:3100"
}
```

### Invalid Route (404)
```json
{
  "error": "Not Found",
  "details": "Route /api/invalid does not exist",
  "available_routes": [
    "/api/auth",
    "/api/providers",
    "/api/points",
    "/api/reservations",
    "/api/billing",
    "/api/payments",
    "/api/analytics"
  ]
}
```

## Architecture Details

### ProxyService
Central service for all request forwarding. Handles:
- URL building with query parameters
- Header preparation (removes hop-by-hop headers)
- Request body forwarding
- Error handling with specific error types
- Response streaming

### Middleware Stack
1. **ExceptionHandlingMiddleware**: Global error handler
2. **LoggingMiddleware**: Request/response lifecycle logging

### Route Organization
Each service has a dedicated router module for clarity and maintainability.
Routes are included with `/api` prefix for consistent URL structure.

## Example Request Flow

```
Client Request
    ↓
API Gateway (Port 8000)
    ↓
LoggingMiddleware (log incoming request)
    ↓
Route Handler (e.g., /api/auth/login)
    ↓
ProxyService.forward_request()
    ↓
Backend Service (e.g., Auth Service on 3100)
    ↓
Response
    ↓
LoggingMiddleware (log response with duration)
    ↓
Client Response
```

## Production Considerations

✓ Structured JSON logging for log aggregation  
✓ Health check endpoint for load balancers  
✓ Proper error codes and messages  
✓ Request/response timing for monitoring  
✓ Timeout configuration for reliability  
✓ Environment-based configuration  
✓ Docker and docker-compose ready  
✓ Exception handling and recovery  
✓ Service discovery via environment variables  

## Testing

Health check:
```bash
curl http://localhost:8000/health
```

Example proxy request:
```bash
curl http://localhost:8000/api/auth/profile \
  -H "Authorization: Bearer <token>"
```

Gateway info:
```bash
curl http://localhost:8000/
```

## Development

To run in development mode with auto-reload:

```bash
python -m uvicorn app.main:app --reload --log-level debug
```

To check logs:
```bash
tail -f logs/api_gateway.log
```
