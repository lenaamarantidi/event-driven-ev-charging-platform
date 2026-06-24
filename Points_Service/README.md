# Points Service

A microservice handling EV charging station data with multiple service instances for different providers (Red Plug, Green Plug, Blue Plug) and a central aggregation service.

## Quick Start

### Prerequisites
- RabbitMQ service running (`brew services start rabbitmq` on macOS)

### Start all containers (services + databases)
```bash
cd Points_Service
./start-points-services-and-dbs-containers.sh
```

This will:
1. Find 4 free ports starting from 3001
2. Build the Docker image `points_service:latest`
3. Start 4 service containers (green=3001, red=3002, blue=3003, central=3004)
4. Start 4 MariaDB containers (3010, 3011, 3012, 3013)
5. Export all necessary environment variables

### Start only services (without DBs)
```bash
docker compose -f docker-compose.points.services.yml up -d
```

### Start only databases
```bash
docker compose -f docker-compose.mariadb.points.yml up -d
```

### Stop all containers
```bash
./end-points-services-and-dbs.sh
```

## What to Expect

After starting all containers, run `docker ps` to see:
```
CONTAINER ID   IMAGE                COMMAND                  STATUS         PORTS
abc123        points_service       "node src/index.js"      Up 4s          0.0.0.0:3001->3001/tcp    points-green-service
def456        points_service       "node src/index.js"      Up 4s          0.0.0.0:3002->3002/tcp    points-red-service
ghi789        points_service       "node src/index.js"      Up 4s          0.0.0.0:3003->3003/tcp    points-blue-service
jkl012        points_service       "node src/index.js"      Up 4s          0.0.0.0:3004->3004/tcp    points-central-service
mno345        mariadb:11          "docker-entrypoint.s…"   Up 4s          0.0.0.0:3010->3306/tcp    points-green
pqr678        mariadb:11          "docker-entrypoint.s…"   Up 4s          0.0.0.0:3011->3306/tcp    points-red
stu901        mariadb:11          "docker-entrypoint.s…"   Up 4s          0.0.0.0:3012->3306/tcp    points-blue
vwx234        mariadb:11          "docker-entrypoint.s…"   Up 4s          0.0.0.0:3013->3306/tcp    points-central
```

## Container Architecture

### Service Containers (4 instances)
- **points-green-service** (port 3001) - Green Plug provider
- **points-red-service** (port 3002) - Red Plug provider
- **points-blue-service** (port 3003) - Blue Plug provider
- **points-central-service** (port 3004) - Central aggregator

### Database Containers (4 instances)
- **points-green** (port 3010) - Green service DB
- **points-red** (port 3011) - Red service DB
- **points-blue** (port 3012) - Blue service DB
- **points-central** (port 3013) - Central aggregation DB

## Available API Endpoints

### Provider Data Endpoints

#### GET /plugApi/points
**Description:** Get all points in provider format (raw from API)
**Response:** Provider-specific JSON structure with provider metadata

#### GET /plugApi/points/:pointId
**Description:** Get specific point details from provider API
**Response:** Provider-specific point structure

#### GET /api/points
**Description:** Get all points with optional filtering
**Query Parameters:**
- `provider` - Filter by provider name
- `status` - Filter by status (available, reserved, offline, etc.)
- `avail` - Availability filter (available, occupied, unavailable)
- `connectorType` - Connector type filter (Type2, Type3, CHAdeMO, CCS2)
- `lat`, `lon`, `radius` - Proximity search
- `costMin`, `costMax` - Price range filter
- `powerMin`, `powerMax` - Capacity range filter
- `type` - Charger type (AC, DC)
- `limit` - Limit number of results

#### GET /api/points/:pointId
**Description:** Get specific point details (normalized format)
**Response:**
```json
{
  "id": "point_id",
  "provider_name": "redPlug|greenPlug|bluePlug",
  "lat": number,
  "lon": number,
  "status": "available|reserved|offline|...",
  "capacity": number,
  "price": number,
  "location_name": "string",
  "connector": "string",
  "address": "string",
  "reservation_end_time": "ISO string or null"
}
```

#### GET /api/points/events
**Description:** Server-Sent Events stream for real-time point updates
**Response:** Event stream with point status changes

### Database Management Endpoints

#### PUT /db/points/:pointId
**Description:** Update a specific charging point in database
**Request Body:** Any combination of fields:
```json
{
  "status": "available|reserved|offline",
  "capacity_kw": number,
  "kwh_price": number,
  "connector": "string",
  "location_name": "string",
  "address": "string",
  "reservation_end_time": "ISO string or null",
  "lon": number,
  "lat": number
}
```

**Special Behavior:**
- If current service is red/green/blue: Also updates central DB via HTTP
- If current service is central: Finds provider and updates that service's DB via HTTP
- Triggers cross-service synchronization automatically

**Response:**
```json
{
  "message": "Point updated successfully",
  "point": { ... }
}
```

#### POST /db/repopulate
**Description:** Repopulate points database from provider APIs
**Request Body (optional):**
```json
{
  "points": ["id1", "id2", ...]
}
```

**Central Service Special Behavior:**
- Fetches points from all 3 providers in parallel
- Aggregates into single central database
- Handles format normalization across providers
- Converts provider timestamps to MySQL format

**Response:**
```json
{
  "service": "central",
  "transport": "HTTP|broker",
  "fetched": 370,
  "newCount": 370,
  "skippedCount": 0,
  "success": true
}
```

#### POST /api/points/:pointId/reserve
**Description:** Reserve a charging point via provider API
**Request Body:**
```json
{
  "duration": 60,  // or "minutes": 60
}
```

**Response:**
```json
{
  "pointId": "3249146",
  "provider": "bluePlug",
  "status": "reserved|held",
  "reservationEndTime": "ISO string",
  "expiresIn": "3600 seconds",
  "message": "Point reserved successfully"
}
```

**Features:**
- Updates local and central DB automatically
- Schedules automatic expiry timer
- Publishes reservation success to RabbitMQ
- Provider-specific duration handling (query param, URL path, body)

#### POST /api/points/:pointId/reserve/:minutes
**Description:** Reserve a point with minutes in URL path
**Response:** Same as POST /api/points/:pointId/reserve

### Health & Status

#### GET /health
**Description:** Health check endpoint
**Response:**
```json
{
  "status": "ok|error",
  "service": "points-service",
  "port": 3001,
  "database": "connected|disconnected",
  "timestamp": "ISO date string"
}
```

## Data Normalization

Supports three heterogeneous provider APIs with automatic normalization:

### Red Plug Format
```json
{
  "pointid": "123",
  "providerName": "redPlug",
  "lat": 37.9,
  "long": 23.7,
  "status": "available",
  "cap": 22,
  "locationName": "Station A",
  "connector": "Type2",
  "address": "Address",
  "reservationendtime": "2026-06-23 07:16"
}
```

### Green Plug Format
```json
{
  "id": "456",
  "providerName": "greenPlug",
  "coords": { "lat": 37.9, "long": 23.7 },
  "state": "available",
  "cap": 22,
  "kwhRateEur": 0.59,
  "locationName": "Station B",
  "connectorType": "Type2",
  "address": "Address",
  "reservedUntil": "2026-06-23T07:16:00Z"
}
```

### Blue Plug Format
```json
{
  "chargerId": "789",
  "providerName": "bluePlug",
  "geo": [23.7, 37.9],  // [lon, lat]
  "currentStatus": "available",
  "cap": 22,
  "pricePerKwh": 0.59,
  "locationName": "Station C",
  "connector": "Type2",
  "address": "Address",
  "reservationEnd": "2026-06-23 07:16"
}
```

### Normalized Format (output)
```json
{
  "id": "point_id",
  "provider_name": "redPlug|greenPlug|bluePlug",
  "lat": 37.9,
  "lon": 23.7,
  "status": "available",
  "capacity": 22,
  "price": 0.59,
  "location_name": "Station",
  "connector": "Type2",
  "address": "Address",
  "reservation_end_time": "2026-06-23T07:16:00.000Z"
}
```

## Cross-Service Synchronization

### Update Propagation
When updating a point via `PUT /db/points/:pointId`:
- **From individual service (red/green/blue):** Updates local DB + central DB
- **From central service:** Updates central DB + specific provider's DB

### Reservation Expiry
When a reservation expires:
- Updates local DB status to "available"
- Queries provider API for current status
- **If individual service:** Also updates central DB
- **If central service:** Finds provider and updates that service's DB
- Clears reservation_end_time in both DBs

### Automatic Sync
- RabbitMQ publishes reservation success events
- Services can subscribe to updates
- Scheduled data sync: 02:00, 10:00, 18:00 UTC (configurable)

## Project Structure

```
Points_Service/
├── Dockerfile                          # Multi-stage build
├── package.json                        # Dependencies
├── docker-compose.points.services.yml  # 4 service containers
├── docker-compose.mariadb.points.yml   # 4 database containers
├── start-points-services-and-dbs-containers.sh
├── end-points-services-and-dbs.sh
├── src/
│   ├── index.js                        # Express server, API endpoints
│   ├── plugs_api.js                    # Provider API configs, normalization
│   ├── rabbitmq.js                     # RabbitMQ client
│   └── util.js                         # Utilities
└── db/
    └── schema.sql                      # Database schema
```

## Key Dependencies

- **express** - HTTP server framework
- **mysql2** - MariaDB driver
- **axios** - HTTP client for provider API calls
- **amqplib** - RabbitMQ client
- **uuid** - Generate unique IDs

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service HTTP port | Dynamic |
| `SERVICE` | Service identifier | points-green-service, etc. |
| `MARIADB_HOST` | Database host | host.docker.internal |
| `MARIADB_PORT` | Database port | Dynamic |
| `MARIADB_USER` | DB username | root |
| `MARIADB_PASSWORD` | DB password | root |
| `MARIADB_DB` | Database name | green/red/blue/central |
| `BEARER_TOKEN` | Provider API auth | sk_saas_5dec282b47047b6eced41e64 |
| `RABBITMQ_URL` | RabbitMQ connection | amqp://guest:guest@host.docker.internal:5672 |
| `POINTS_RED_PORT` | Red service port | Dynamic |
| `POINTS_GREEN_PORT` | Green service port | Dynamic |
| `POINTS_BLUE_PORT` | Blue service port | Dynamic |
| `POINTS_CENTRAL_PORT` | Central service port | Dynamic |

## Troubleshooting

### Container won't start
- Check logs: `docker logs points-central-service`
- Verify RabbitMQ is running: `brew services list`
- Verify MariaDB ports are available

### Reservation not updating across services
- Check RabbitMQ connection in logs
- Verify HTTP endpoints are accessible: `curl http://localhost:3002/health` (etc.)
- Check central DB: `docker exec points-central mysql -uroot -proot central -e "SELECT * FROM points WHERE point_id='123'"`

### Blue Plug points in wrong location
- This was a bug (reversed lon/lat) - fixed in latest build
- Rebuild: `docker build -t points_service:latest .`
- Repopulate: `POST /db/repopulate`

## Notes

- Service rebuilds image on every start (no cache)
- Cross-service HTTP calls use `host.docker.internal` for docker-to-host routing
- Each provider has separate database for data isolation
- Central service can be queried for aggregated view
- Automatic reservation expiry timer enforces time constraints
- Data normalization allows heterogeneous provider APIs to work seamlessly
