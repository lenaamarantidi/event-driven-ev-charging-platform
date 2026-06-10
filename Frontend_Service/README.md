# Frontend Service

A microservice providing HTML dashboard pages for the Charger.io application.

## Quick Start

### Start the container
```bash
cd Frontend_Service
./start_frontend_service.sh
```

This will:
1. Find the first available port starting from 3001
2. Build the Docker image `frontend_service:latest`
3. Start the container with the assigned port
4. Export `FRONTEND_SERVICE_PORT` variable

### Stop the container
```bash
./end_frontend_service.sh
```

## What to Expect

After starting, run `docker ps` to see:
```
CONTAINER ID   IMAGE                     COMMAND                  CREATED         STATUS         PORTS                     NAMES
abc123        frontend_service:latest   "docker-entrypoint.s…"   2 seconds ago   Up 1 second   0.0.0.0:3001->3001/tcp    frontend-service
```

The container will be named **`frontend-service`** and will be accessible at `http://localhost:${FRONTEND_SERVICE_PORT}`

## Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Redirects to `/login-register` |
| `GET /login-register` | Login/Signup page with tabs |
| `GET /ev-user` | EV User Dashboard with interactive map |
| `GET /operator` | SaaS Plug Operator Dashboard |
| `GET /provider` | Charging Points Provider Dashboard |
| `GET /health` | Health check endpoint |

## Features

### Interactive Map (EV User Dashboard)
- OpenStreetMap base layer
- Custom pin markers
- `addMarkerByCoords(lat, lng, title)` - Add pins at specific coordinates
- Add Random Pin button
- Clear All button

### Login/Register Page
- Tabbed interface (Login / Sign Up)
- Full Name, Email, Password, Confirm Password fields
- User Type dropdown (EV User, Operator, Provider)
- Google OAuth button placeholder

## Docker Compose

Uses `docker-compose.frontend.service.yml`:
- Image: `frontend_service:latest`
- Container: `frontend-service`
- Port: `${FRONTEND_SERVICE_PORT}` (dynamic, default falls back to 3000)
- Network: `saasplug-network`
- Volume: `frontend-service-data`

## Notes

- The service rebuilds the image on every start (no cache)
- All HTML/CSS/JS is served from the `pages/` directory
- Environment variable `PORT` must match `FRONTEND_SERVICE_PORT`
