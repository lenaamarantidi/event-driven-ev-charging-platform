# Points Service

A microservice handling points/charging stations data with multiple service instances for different providers.

## Quick Start

### Start all containers (services + databases)
```bash
cd Points_Service
./start-points-services-and-dbs-containers.sh
```

This will:
1. Find 4 free ports starting from 3001
2. Build the Docker image `points_service:latest`
3. Start 4 service containers (green, red, blue, central)
4. Export all necessary environment variables

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
CONTAINER ID   IMAGE                     COMMAND                  CREATED         STATUS         PORTS                     NAMES
abc123        points_service:latest     "node src/index.js"       5 seconds ago   Up 4 seconds   0.0.0.0:3001->3001/tcp    points-green-service
def456        points_service:latest     "node src/index.js"       5 seconds ago   Up 4 seconds   0.0.0.0:3002->3002/tcp    points-red-service
ghi789        points_service:latest     "node src/index.js"       5 seconds ago   Up 4 seconds   0.0.0.0:3003->3003/tcp    points-blue-service
jkl012        points_service:latest     "node src/index.js"       5 seconds ago   Up 4 seconds   0.0.0.0:3004->3004/tcp    points-central-service
mno345        mariadb:11                 "docker-entrypoint.s…"    5 seconds ago   Up 4 seconds   0.0.0.0:3005->3306/tcp    points-green
pqr678        mariadb:11                 "docker-entrypoint.s…"    5 seconds ago   Up 4 seconds   0.0.0.0:3006->3306/tcp    points-red
stu901        mariadb:11                 "docker-entrypoint.s…"    5 seconds ago   Up 4 seconds   0.0.0.0:3007->3306/tcp    points-blue
vwx234        mariadb:11                 "docker-entrypoint.s…"    5 seconds ago   Up 4 seconds   0.0.0.0:3008->3306/tcp    points-central
```

## Container Names

### Service Containers
- `points-green-service`
- `points-red-service`
- `points-blue-service`
- `points-central-service`

### Database Containers
- `points-green` (MariaDB)
- `points-red` (MariaDB)
- `points-blue` (MariaDB)
- `points-central` (MariaDB)

## Available API Endpoints

### GET /api/points
**Description:** Retrieve all charging points
**Response:**
```json
{
  "points": [
    {
      "id": "string",
      "provider": "red|green|blue|central",
      "name": "string",
      "latitude": number,
      "longitude": number,
      "status": "available|occupied|maintenance",
      "capacity_kw": number,
      "address": "string"
    }
  ]
}
```

### GET /api/points/:id
**Description:** Retrieve a specific charging point by ID
**Response:** Single point object

### GET /api/points/filter
**Description:** Filter points by criteria
**Query Parameters:**
- `provider` (string): Filter by provider
- `status` (string): Filter by status
- `capacity_min` (number): Minimum capacity in kW
- `capacity_max` (number): Maximum capacity in kW
- `latitude` (number): Latitude for proximity search
- `longitude` (number): Longitude for proximity search
- `radius` (number): Radius in km for proximity search

### GET /api/health
**Description:** Health check endpoint
**Response:**
```json
{
  "status": "healthy",
  "service": "Points Service",
  "provider": "red|green|blue|central",
  "timestamp": "ISO date string"
}
```

### PUT /db/points/:pointId
**Description:** Update a specific charging point
**Request Body:** Any combination of point fields:
- `status` (string): available, reserved, offline, etc.
- `capacity_kw` (number): Capacity in kW
- `kwh_price` (number): Price per kWh
- `connector` (string): Connector type
- `location_name` (string): Location name
- `address` (string): Address
- `reservation_end_time` (string): Reservation end time
- `lon` (number): Longitude
- `lat` (number): Latitude

**Special Behavior:**
- If service is `redPlug`, `greenPlug`, or `bluePlug`: Also updates central DB
- If service is `central`: Finds the provider from `provider_name` and updates that service's DB
- Returns update results from all affected services

**Response:**
```json
{
  "message": "Point update operation completed",
  "currentService": {
    "service": "greenPlug",
    "updated": true,
    "point": { ... }
  },
  "centralService": {
    "service": "central",
    "updated": true,
    "result": { ... }
  }
}
```

### POST /db/repopulate
**Description:** Repopulate points database from provider APIs
**Request Body (optional):**
```json
{
  "points": ["id1", "id2", ...]  // Filter to specific point IDs
}
```

**Special Behavior for Central Service:**
- When `SERVICE=central`: Repopulates from all 3 providers (redPlug, greenPlug, bluePlug)
- Triggers repopulation on individual service containers via HTTP
- Fetches points from all services and aggregates in central DB
- Also calls `repopulate_central()` to ensure cross-service sync

**Response:**
```json
{
  "service": "central",
  "providers": [
    { "plugKey": "redPlug", "fetched": 100, "newCount": 100 },
    { "plugKey": "greenPlug", "fetched": 150, "newCount": 150 },
    { "plugKey": "bluePlug", "fetched": 120, "newCount": 120 }
  ],
  "allSuccess": true,
  "centralRepopulate": {
    "message": "Central DB repopulated from all 3 services",
    "totalPoints": 370,
    "success": true
  }
}
```

## Helper Functions

### repopulate(service, filterIds)
Helper function to repopulate points from a specific provider API.
- Fetches points from provider API
- Filters by point IDs if provided
- Inserts/updates points in the database
- Returns payload with counts and metadata

### repopulate_central(req)
Helper function to repopulate central DB by fetching from all 3 individual services via HTTP.
- Triggers repopulation on red, green, blue service containers
- Waits for repopulation to complete
- Fetches points from each service via `/api/points`
- Aggregates and inserts all points into central DB
- Converts ISO datetime strings to MySQL format

### scheduleReservationExpiry(pointId, reservationEndTime)
Enhanced to update all relevant services when reservation expires:
- Updates current service's DB when reservation expires
- If current service is red/green/blue: Also updates central DB via PUT `/db/points/:pointId`
- If current service is central: Finds provider and updates that service's DB via PUT `/db/points/:pointId`

## Docker Compose Files

### docker-compose.points.services.yml
- Image: `points_service:latest`
- Services: 4 instances (green, red, blue, central)
- Each with dynamic port mapping

### docker-compose.mariadb.points.yml
- Image: `mariadb:11`
- Databases: 4 instances (one per provider)
- Each with MySQL on port 3306 mapped to host ports 3005-3008

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service HTTP port | Dynamic (from start script) |
| `SERVICE` | Service identifier | `points-green-service`, etc. |
| `MARIADB_HOST` | Database host | `host.docker.internal` |
| `MARIADB_PORT` | Database port | Dynamic (from start script) |
| `BEARER_TOKEN` | Authentication token | `sk_saas_5dec282b47047b6eced41e64` |
| `POINTS_RED_PORT` | Red service HTTP port | Dynamic (from start script) |
| `POINTS_GREEN_PORT` | Green service HTTP port | Dynamic (from start script) |
| `POINTS_BLUE_PORT` | Blue service HTTP port | Dynamic (from start script) |
| `POINTS_CENTRAL_PORT` | Central service HTTP port | Dynamic (from start script) |

## Notes

- The service rebuilds the image on every start (no cache)
- Each provider has its own service instance and database
- Uses `saasplug-points-network` for internal communication
- Health checks are configured for all containers
- **Cross-Service Synchronization:** When updating points via `PUT /db/points/:pointId` or when reservations expire, the service automatically propagates updates to relevant services (central DB for individual services, or specific service DB for central service)
- **Central Service Aggregation:** The central service can fetch and aggregate points from all 3 individual services via HTTP
