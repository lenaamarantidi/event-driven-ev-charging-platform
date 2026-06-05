# API Gateway

Unified API entry point for the microservices platform.

## Features
- Proxy `/api/auth/*` to the Auth Service
- Centralized health endpoint
- CORS enabled

## Run locally
1. Copy `.env.template` to `.env`
2. Install dependencies:
   ```bash
   cd API_Gateway
   npm install
   ```
3. Start the gateway:
   ```bash
   npm start
   ```

## Routes
- `GET /` - gateway info
- `GET /health` - gateway health
- `ANY /api/auth/*` - proxy to Auth Service
