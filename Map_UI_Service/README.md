# Map UI Service

A microservice providing map visualization and location-based services for the Charger.io application.

## Quick Start

### Start the container
```bash
cd Map_UI_Service
./start_map_ui_service.sh
```

This will:
1. Find the first available port starting from 3001
2. Build the Docker image `maps_ui_service:latest`
3. Start the container with the assigned port
4. Export `MAPS_UI_PORT` variable

### Stop the container
```bash
./end_map_ui_service.sh
```

## What to Expect

After starting, run `docker ps` to see:
```
CONTAINER ID   IMAGE                     COMMAND                  CREATED         STATUS         PORTS                     NAMES
abc123        maps_ui_service:latest    "node src/index.js"      5 seconds ago   Up 4 seconds   0.0.0.0:3105->3105/tcp    map-ui-service
```

The container will be named **`map-ui-service`** and will be accessible at `http://localhost:${MAPS_UI_PORT}`

## Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /map/health` | GET | Health check endpoint |

## Docker Compose

Uses `docker-compose.maps.ui.service.yml`:
- Image: `maps_ui_service:latest`
- Container: `map-ui-service`
- Port: `${MAPS_UI_PORT}` (dynamic)
- Network: `saasplug-network`
- Volume: `map-ui-service-data`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service HTTP port | Dynamic (from start script) |
| `NODE_ENV` | Environment mode | `production` |
| `POINTS_SERVICE_URL` | URL to Points Service | `http://host.docker.internal:3001` |
| `MAP_GATEWAY_URL` | Map gateway URL | `https://maps.googleapis.com` |

## Features

- Location-based point searches
- Route calculation
- Map layer management
- User bookmarks
- Statistics tracking
- Health monitoring

## Dependencies

- Requires `Points_Service` to be running for point data
- Uses `host.docker.internal` to access other services on the host machine

## Notes

- The service rebuilds the image on every start (no cache)
- Port is dynamically assigned starting from 3001
- Connected to `saasplug-network` for service-to-service communication