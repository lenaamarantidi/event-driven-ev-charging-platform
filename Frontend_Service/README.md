# Frontend Service

A microservice providing HTML dashboard pages for the Charger.io application with interactive EV charging station discovery.

## Quick Start

### Prerequisites
- RabbitMQ service running (`brew services start rabbitmq` on macOS)
- Points Service containers running (red, green, blue plug services)

### Start the container
```bash
cd Frontend_Service
./start_frontend_service.sh
```

This will:
1. Load Points Service environment variables from docker-compose file
2. Find the first available port starting from 3001
3. Build the Docker image `frontend_service:latest`
4. Start the container with the assigned port
5. Export `FRONTEND_SERVICE_PORT` variable

### Stop the container
```bash
cd Frontend_Service
docker stop frontend-service
```

## What to Expect

After starting, run `docker ps` to see:
```
CONTAINER ID   IMAGE                     COMMAND                  CREATED         STATUS         PORTS                     NAMES
abc123        frontend_service:latest   "docker-entrypoint.s…"   2 seconds ago   Up 1 second   0.0.0.0:3006->3006/tcp    frontend-service
```

The container will be named **`frontend-service`** and will be accessible at `http://localhost:${FRONTEND_SERVICE_PORT}`

## Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Redirects to `/login-register` |
| `GET /login-register` | Login/Signup page with tabs |
| `GET /ev-user` | EV User Dashboard with interactive charging map |
| `GET /operator` | SaaS Plug Operator Dashboard |
| `GET /provider` | Charging Points Provider Dashboard |
| `GET /health` | Health check endpoint |
| `GET /api/points/:provider` | Get normalized points from specific provider (red/green/blue) |
| `GET /api/points` | Get points from all providers in parallel |
| `GET /api/hosts` | Get docker-compose extra_hosts configuration |

## Features

### Interactive EV User Map Dashboard

#### Provider Filtering
- Dropdown selector for Red Plug, Green Plug, or Blue Plug
- Real-time point loading from provider APIs
- Case-insensitive provider name handling

#### Dynamic Statistics
- **Total Points** - All charging stations from provider
- **Available** - Points ready for immediate reservation
- **Reserved** - Points currently held by other users
- **Offline** - Malfunctioning or unavailable points

#### Status-Based Map Filtering
- Click any stat card to filter map display by status
- Auto-zoom to selected point group
- Visual feedback with marker ring colors

#### Point Markers
- Provider-colored dots (Red=#FF4444, Green=#44AA44, Blue=#4444FF)
- Status-based ring colors:
  - **White ring** = Available points
  - **Black ring** = Reserved points
  - **Grey ring** = Offline points
- 40% smaller markers for better density visibility
- Clickable for detailed information

#### Point Details Modal
When clicking a marker, displays:
- **Location Name** (point title)
- **Status Badge** (color-coded: green/orange/red/grey)
- **Full Address**
- **Capacity** (in kW)
- **Connector Type**
- **Price per kWh** (EUR)
- **Reserve Button** (disabled for non-available points)
- **Close Button** (X in top-right corner)

#### Activity Sidebar
- Tracks user interactions with timestamps
- Sorted by most recent first
- Activity types:
  - **clicked** - Point marker clicked (blue label)
  - **attempted** - Reservation attempt (orange label)
  - **successful** - Reservation confirmed (green label)

### Data Normalization
- Normalizes points from three heterogeneous provider APIs:
  - Red Plug: pointid, lat/long fields
  - Green Plug: id, coords.lat/coords.long fields
  - Blue Plug: chargerId, geo[lat,lon] fields
- Optional point normalization via `/api/points/:provider?normalize=true`
- Consistent data structure across all providers

### Responsive Design
- Grid-based layout (map on left, activity sidebar on right)
- Mobile-friendly on tablets and smaller screens
- Animated modal entrance (slide-up)
- Touch-friendly controls

## Docker Compose

Uses `docker-compose.frontend.service.yml`:
- Image: `frontend_service:latest`
- Container: `frontend-service`
- Port: `${FRONTEND_SERVICE_PORT}` (dynamic, default 3006)
- Network: `saasplug-network`
- Environment variables:
  - `PORT` - Service port
  - `NODE_ENV` - Environment (production)
  - `POINTS_CENTRAL_PORT` - Central service port
  - `POINTS_RED_PORT` - Red Plug service port
  - `POINTS_GREEN_PORT` - Green Plug service port
  - `POINTS_BLUE_PORT` - Blue Plug service port
- Extra hosts: Maps provider service names to host-gateway

## Project Structure

```
Frontend_Service/
├── Dockerfile                          # Multi-stage build, includes plugs_api.js
├── package.json                        # Dependencies: express, axios, yaml
├── docker-compose.frontend.service.yml # Service configuration
├── start_frontend_service.sh           # Startup script with env var loading
├── src/
│   ├── index.js                        # Express server, /api endpoints
│   └── map_ui.js                       # Point fetching, provider mapping, normalization
└── pages/
    ├── login-register.html             # Auth interface
    ├── ev-user.html                    # Interactive charging map (main feature)
    ├── operator.html                   # Operator dashboard
    └── provider.html                   # Provider dashboard
```

## Key Dependencies

- **express** - HTTP server framework
- **axios** - HTTP client for Points Service calls
- **yaml** - Docker-compose file parsing
- **leaflet** - Interactive map library (client-side)

## Building from Source

```bash
# From project root
docker build -t frontend_service:latest -f Frontend_Service/Dockerfile .

# Or from Frontend_Service directory (uses project root context)
cd Frontend_Service
docker build --no-cache -t frontend_service:latest -f Dockerfile ..
```

## Troubleshooting

### Container exits immediately
Check logs: `docker logs frontend-service`
Common issues:
- Missing environment variables (POINTS_*_PORT)
- Port already in use
- Points Service containers not running

### No points appear on map
- Verify Points Service containers are running: `docker ps | grep points`
- Check Points Service logs: `docker logs points-blue-service` (etc.)
- Verify RabbitMQ is running: `brew services list | grep rabbitmq`
- Check browser console for API errors

### Blue Plug points in wrong location
- Fixed in this release (was reversed lon/lat ordering)
- Rebuild image: `docker build --no-cache -t frontend_service:latest .`

## Performance Notes

- Points are loaded once on provider selection and cached in JavaScript
- Filtering updates use cached data (no API calls)
- Parallel loading of all three providers: `Promise.all([red, green, blue])`
- Map auto-zoom uses `fitBounds()` with 10% padding

## Future Enhancements

- WebSocket/SSE for real-time point status updates
- Reserve point with duration selector
- Reservation confirmation flow
- User authentication integration
- Search by location name or coordinates
- Advanced filters (price range, power capacity, connector type)
- Route optimization to nearest available point
