# SaaS Plug - Multi-Provider Charging Points Platform

🚀 **Advanced microservices architecture for managing EV charging points from multiple providers (RedPlug, GreenPlug, BluePlug) with unified API**

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Services](#services)
- [Provider Integration](#provider-integration)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Support](#support)

---

## 📊 Overview

SaaS Plug is a platform that abstracts the complexity of integrating with multiple EV charging point providers. Despite each provider having different API endpoint naming conventions, SaaS Plug presents a **unified, normalized API** to clients.

### Key Problem Solved

Different charging point providers use incompatible API contracts:
- **RedPlug**: Uses `/points`, `/reserve/{id}`
- **GreenPlug**: Uses `/chargingPoints`, `/chargingPoints/{id}/reservations`  
- **BluePlug**: Uses `/locations`, `/location/{id}/hold`

**Solution**: Factory Pattern-based adapter layer that abstracts provider differences and normalizes responses to unified schema.

---

## 🏗️ Architecture

### Microservices Architecture

```
┌─────────────────────────────────────────────────────┐
│                   API Gateway (Port 8000)           │
│              (HTTP Proxy & Routing)                 │
└──────────────────────┬──────────────────────────────┘
                       │
     ┌─────────────────┼─────────────────┐
     │                 │                 │
     ▼                 ▼                 ▼
┌──────────┐    ┌──────────┐    ┌──────────────┐
│ Points   │    │ Status   │    │ Reservation  │
│ Service  │    │ Service  │    │ Service      │
│ (3001)   │    │ (3002)   │    │ (3003)       │
└────┬─────┘    └────┬─────┘    └──────┬───────┘
     │               │                   │
     └───────────────┼───────────────────┘
                     │
         ┌───────────┴────────────┬──────────────┐
         │                        │              │
    ┌────▼────┐           ┌──────▼─────┐   ┌───▼────┐
    │Provider │           │  Provider  │   │Provider│
    │Adapter  │           │  Adapter   │   │Adapter │
    │Factory  │           │  Factory   │   │Factory │
    └────┬────┘           └──────┬─────┘   └───┬────┘
         │                       │             │
    ┌────▼────┐           ┌──────▼─────┐   ┌───▼────┐
    │RedPlug  │           │ GreenPlug  │   │BluePlug│
    │API      │           │ API        │   │API     │
    └─────────┘           └────────────┘   └────────┘
```

### Provider Abstraction Layer

Each service includes a **ProviderAdapterFactory** that:
1. Maps provider-specific endpoints to unified methods
2. Normalizes disparate response formats
3. Handles provider-specific error cases
4. Provides unified error handling

---

## ✨ Features

### ✅ Completed Features

- **Unified API Gateway** - Single entry point for all microservices
- **Multi-Provider Support** - RedPlug, GreenPlug, BluePlug
- **Provider Adapter Factory** - Abstrats provider API differences
- **Points Aggregation** - Combines points from all providers
- **Advanced Search** - Filter by status, provider, capacity
- **Statistics** - Aggregate metrics by provider/status
- **Health Checking** - Periodic provider availability monitoring
- **Reservation Management** - Create and track reservations
- **Data Normalization** - All responses in unified schema
- **Docker Support** - Full containerization with docker-compose
- **Comprehensive Testing** - Postman collection and test guide

### 🚧 Planned Features

- [ ] Database Persistence - PostgreSQL integration
- [ ] Message Queue - RabbitMQ for event publishing
- [ ] Authentication/Authorization - JWT-based security
- [ ] Real-time Notifications - WebSocket updates
- [ ] Admin Dashboard - Provider management and analytics
- [ ] Mobile App - Native iOS/Android applications
- [ ] GraphQL API - Alternative query interface
- [ ] Caching Layer - Redis for performance optimization

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Docker & Docker Compose (optional)

### Option 1: Manual Setup

#### 1. Install Dependencies

```bash
# Windows
./setup.bat

# macOS/Linux
bash setup.sh

# Or manually
cd Points_Service && npm install
cd ../Reservation_Service && npm install
cd ../API_Gateway && npm install
```

#### 2. Start Services (in separate terminals)

```bash
# Terminal 1 - Points Service
cd Points_Service && npm start

# Terminal 2 - Reservation Service
cd Reservation_Service && npm start

# Terminal 3 - API Gateway
cd API_Gateway && npm start
```

#### 3. Verify Services

```bash
# Check health of all services
curl http://localhost:8000/health

# Expected response:
# {
#   "status": "healthy",
#   "services": {
#     "pointsService": { "status": "ok", "port": 3001 },
#     "reservationService": { "status": "ok", "port": 3003 }
#   }
# }
```

### Option 2: Docker Deployment

```bash
# Start all services with docker-compose
docker-compose up --build

# Services will be automatically started and configured
# API Gateway available at http://localhost:8000
```

---

## 📁 Project Structure

```
saas26-11/
├── Points_Service/              # Charging points aggregation
│   ├── src/
│   │   ├── index.js            # Main service
│   │   └── adapters/
│   │       └── providerAdapter.js  # Factory pattern implementation
│   ├── package.json
│   └── Dockerfile
│
│   ├── src/
│   │   ├── index.js
│   │   └── adapters/
│   │       └── providerAdapter.js
│   ├── package.json
│   └── Dockerfile
│
├── Reservation_Service/         # Reservation management
│   ├── src/
│   │   ├── index.js
│   │   └── adapters/
│   │       └── providerAdapter.js
│   ├── package.json
│   └── Dockerfile
│
├── API_Gateway/                 # Unified API entry point
│   ├── src/
│   │   └── index.js            # HTTP proxy routing
│   ├── package.json
│   └── Dockerfile
│
├── frontend/                    # React application (frontend code)
├── Auth_Service/                # Authentication service
├── Billing_Service/             # Billing management
├── message_broker/              # RabbitMQ configuration
│
├── docker-compose.yml           # Multi-container orchestration
├── .dockerignore                # Docker build optimization
├── .env.example                 # Configuration template
│
├── QUICK_START_GUIDE.md         # Getting started guide
├── PROVIDER_INTEGRATION.md      # Provider API documentation
├── TESTING_GUIDE.md             # Comprehensive testing guide
├── DOCKER_DEPLOYMENT_GUIDE.md   # Docker & deployment instructions
├── ARCHITECTURE.md              # Architecture details
│
├── postman_collection.json      # Pre-configured API tests
├── setup.sh                     # Bash setup script
├── setup.bat                    # Batch setup script (Windows)
├── setup.ps1                    # PowerShell setup script
│
└── LICENSE                      # MIT License
```

---

## 🔧 Services

### Points Service (Port 3001)

**Manages charging point aggregation and search across all providers**

**Key Endpoints**:
- `GET /api/points` - List all charging points (aggregated)
- `GET /api/points/:provider/:pointid` - Get specific point
- `GET /api/search` - Advanced search with filters
- `GET /api/statistics` - Aggregate statistics

**Key Features**:
- Aggregates points from RedPlug, GreenPlug, BluePlug
- Normalizes different response formats
- Advanced filtering (status, provider, capacity)
- Real-time statistics

---

### Reservation Service (Port 3003)

**Handles reservations across all providers**

**Key Endpoints**:
- `POST /api/reservations` - Create reservation
- `GET /api/reservations` - List reservations
- `GET /api/reservations/by-provider/:provider` - Filter by provider
- `GET /api/reservations/statistics` - Reservation metrics

**Key Features**:
- Create reservations on any provider
- Track reservation status
- Provider-specific reservation normalization
- Reservation history and statistics

---

### API Gateway (Port 8000)

**Single entry point routing to all microservices**

**Key Endpoints**:
- `/api/points/*` → Points Service (3001)
- `/api/reservations/*` → Reservation Service (3003)
- `GET /health` - Health check for all services

**Key Features**:
- HTTP proxy-based routing via `express-http-proxy`
- Centralized health monitoring
- Request/response logging

**Handles reservations across all providers**

**Key Endpoints**:
- `POST /api/reservations` - Create reservation
- `GET /api/reservations` - List reservations
- `GET /api/reservations/by-provider/:provider` - Filter by provider
- `GET /api/reservations/statistics` - Reservation metrics

**Key Features**:
- Create reservations on any provider
- Track reservation status
- Provider-specific reservation normalization
- Reservation history and statistics

---

### API Gateway (Port 8000)

**Single entry point routing to all microservices**

**Key Endpoints**:
- `/api/points/*` → Points Service (3001)
- `/api/status/*` → Status Service (3002)
- `/api/reservations/*` → Reservation Service (3003)
- `GET /health` - Health check for all services

**Key Features**:
- HTTP proxy-based routing via `express-http-proxy`
- Centralized health monitoring
- Request/response logging
- Error aggregation

---

## 🔌 Provider Integration

### Provider API Mapping

Each provider uses different endpoint naming despite providing identical functionality:

| Operation | RedPlug | GreenPlug | BluePlug |
|-----------|---------|-----------|----------|
| List Points | `/points` | `/chargingPoints` | `/locations` |
| Get Point | `/point/{id}` | `/chargingPoints/{id}` | `/location/{id}` |
| Reserve | `/reserve/{id}` | `/chargingPoints/{id}/reservations` | `/location/{id}/hold` |

### Unified Response Schema

All providers normalized to:
```json
{
  "pointid": "unique-id",
  "provider": "redPlug|greenPlug|bluePlug",
  "lon": 23.72,
  "lat": 37.98,
  "status": "available|busy|maintenance",
  "capacity_kw": 50,
  "kwh_price": 0.45,
  "reservation_end_time": "2024-01-15T10:30:00Z"
}
```

### Factory Pattern Implementation

The `ProviderAdapterFactory` class provides:
- Provider-specific configuration
- Endpoint URL construction
- Response normalization
- Error handling

See [PROVIDER_INTEGRATION.md](PROVIDER_INTEGRATION.md) for detailed documentation.

---

## 📡 API Documentation

### Example Requests

**Get all available charging points:**
```bash
curl http://localhost:3001/api/points?status=available
```

**Get points from specific provider:**
```bash
curl http://localhost:3001/api/points?provider=redPlug
```

**Advanced search:**
```bash
curl 'http://localhost:3001/api/search?status=available&provider=greenPlug&capacity_min=30&capacity_max=100'
```

**Check provider status:**
```bash
curl http://localhost:3002/api/status
```

**Create reservation:**
```bash
curl -X POST http://localhost:3003/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "bluePlug",
    "pointid": "1",
    "minutes": 30,
    "userId": "user123"
  }'
```

**List reservations:**
```bash
curl http://localhost:3003/api/reservations
```

See [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) for more examples.

---

## 🧪 Testing

### Manual Testing

Use the pre-configured Postman collection:
1. Import `postman_collection.json` into Postman
2. Execute test requests for each endpoint

### Automated Testing Script

```bash
bash tests/run-all-tests.sh

# or manually with curl
curl -w "\n" http://localhost:8000/health
curl -w "\n" http://localhost:3001/api/points
curl -w "\n" http://localhost:3002/api/status
curl -w "\n" http://localhost:3003/api/reservations
```

### Comprehensive Test Suite

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for:
- Unit test scenarios
- Integration tests
- Performance tests  
- Provider-specific tests
- Error handling tests
- Load testing guide

---

## 🐳 Deployment

### Local Development

```bash
docker-compose up --build
```

### Production Deployment

See [DOCKER_DEPLOYMENT_GUIDE.md](DOCKER_DEPLOYMENT_GUIDE.md) for:
- Kubernetes deployment
- CI/CD integration (GitHub Actions)
- Environment configuration
- Security best practices
- Monitoring setup
- Troubleshooting guide

### Environment Configuration

Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env

# Edit .env with your values
REDPLUG_BASE_URL=https://your-redplug-api.com
GREENPLUG_BASE_URL=https://your-greenplug-api.com
BLUEPLUG_BASE_URL=https://your-blueplug-api.com
```

---

## 🔒 Security Considerations

### Current Implementation
- Services communicate via HTTP (fine for local development)
- No authentication/authorization implemented yet
- No request validation

### Production Requirements
- [ ] Enable HTTPS/TLS for all communication
- [ ] Implement JWT-based authentication
- [ ] Add input validation and sanitization
- [ ] Implement rate limiting
- [ ] Add DDoS protection
- [ ] Use secrets management (Vault, sealed secrets)
- [ ] Enable security headers (CORS, CSP, etc.)
- [ ] Regular security audits and penetration testing

---

## 📈 Performance Optimization

### Current
- Real-time API calls to providers
- In-memory reservation storage

### Recommended
- Response caching (Redis)
- Database persistence (PostgreSQL)  
- Async message processing (RabbitMQ)
- API request batching
- Connection pooling
- Load balancing

---

## 🐛 Troubleshooting

### Services won't start?

```bash
# Check if ports are available
lsof -i :3001
lsof -i :3002  
lsof -i :3003
lsof -i :8000

# Kill conflicting process
kill -9 <PID>
```

### Provider API connection fails?

```bash
# Test provider connectivity
curl https://davinci.softlab.ntua.gr/saas26/redPlug/api/points

# Check service logs for detailed errors
docker logs <service-name>
```

### Docker containers won't connect?

```bash
# Check network
docker network inspect saas26-11_saas-network

# Verify service DNS resolution
```

See [DOCKER_DEPLOYMENT_GUIDE.md](DOCKER_DEPLOYMENT_GUIDE.md#-troubleshooting-docker-issues) for more troubleshooting.

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📚 Documentation

- [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) - Getting started
- [PROVIDER_INTEGRATION.md](PROVIDER_INTEGRATION.md) - Provider API details
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing strategies
- [DOCKER_DEPLOYMENT_GUIDE.md](DOCKER_DEPLOYMENT_GUIDE.md) - Deployment guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture deep dive

---

## 📞 Support

For issues, questions, or suggestions:
1. Check existing documentation
2. Review test cases for examples
3. Check Docker logs: `docker-compose logs <service>`
4. Create an issue on GitHub

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🎯 Roadmap

### Phase 1: Current ✅
- [x] Multi-provider API abstraction
- [x] Microservices architecture
- [x] Docker containerization
- [x] Comprehensive documentation

### Phase 2: Database & Messaging 
- [ ] PostgreSQL integration
- [ ] RabbitMQ messaging
- [ ] Data persistence
- [ ] Event-driven architecture

### Phase 3: Security & Authentication
- [ ] JWT authentication
- [ ] Role-based access control
- [ ] API key management
- [ ] Rate limiting

### Phase 4: Advanced Features
- [ ] GraphQL API
- [ ] Real-time notifications
- [ ] Admin dashboard
- [ ] Analytics and reporting

### Phase 5: Mobile & Scaling
- [ ] Native mobile apps
- [ ] Kubernetes orchestration
- [ ] Auto-scaling setup
- [ ] Global CDN integration

---

## 👥 Team

- **Architecture**: Multi-provider EV charging points integration
- **Tech Stack**: Node.js, Express, Docker, Microservices
- **Providers**: RedPlug, GreenPlug, BluePlug

---

<div align="center">

**Made with ❤️ for seamless EV charging integration**

[⬆ Back to top](#saas-plug---multi-provider-charging-points-platform)

</div>
