# Deployment Guide

## Prerequisites

- **Node.js**: 18.0.0 or higher
- **npm**: 9.0.0 or higher
- **Database**: PostgreSQL 12+ (optional for MVP, in-memory storage available)
- **Package Manager**: npm (included with Node.js)

Verify installation:
```bash
node --version    # Should be v18.x or higher
npm --version     # Should be 9.x or higher
```

---

## Local Development Setup

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd saas26-11
```

### Step 2: Install Dependencies for All Services

```bash
# Create an install script to save time
./scripts/install-all.sh

# Or manually:
for dir in Auth_Service Provider_Management_Service Collector_Service Map_UI_Service Analytics_Service Payment_Service Billing_Service message_broker API_Gateway; do
  cd $dir && npm install && cd ..
done
```

### Step 3: Configure Environment Variables

Create `.env` files in each service directory:

**Auth_Service/.env**:
```
PORT=3100
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
REFRESH_TOKEN_SECRET=your-refresh-token-secret-key
NODE_ENV=development
```

**Provider_Management_Service/.env**:
```
PORT=3101
REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api
NODE_ENV=development
```

**Collector_Service/.env**:
```
PORT=3104
REDPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_BASE_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api
COLLECTION_INTERVAL_MS=3600000
NODE_ENV=development
```

**Map_UI_Service/.env**:
```
PORT=3105
POINTS_SERVICE_URL=http://localhost:3001
NODE_ENV=development
```

**Analytics_Service/.env**:
```
PORT=3106
NODE_ENV=development
```

**Payment_Service/.env**:
```
PORT=3107
NODE_ENV=development
```

**Billing_Service/.env**:
```
PORT=3108
NODE_ENV=development
```

**message_broker/.env**:
```
PORT=3003
NODE_ENV=development
```

**API_Gateway/.env**:
```
PORT=3003
NODE_ENV=development
```

**API_Gateway/.env**:
```
PORT=8000
POINTS_SERVICE_URL=http://localhost:3001
AUTH_SERVICE_URL=http://localhost:3100
PROVIDER_MGMT_SERVICE_URL=http://localhost:3101
COLLECTOR_SERVICE_URL=http://localhost:3104
MAP_SERVICE_URL=http://localhost:3105
ANALYTICS_SERVICE_URL=http://localhost:3106
PAYMENT_SERVICE_URL=http://localhost:3107
BILLING_SERVICE_URL=http://localhost:3108
MESSAGE_BROKER_URL=http://localhost:3003
NODE_ENV=development
```

### Step 4: Start Services

**Option A: Terminal-by-Terminal (Easy for Development)**

Open terminals for each service:

```bash
# Terminal 1
cd Auth_Service && npm start

# Terminal 2
cd Provider_Management_Service && npm start

# Terminal 3
cd Collector_Service && npm start

# Terminal 4
cd Map_UI_Service && npm start

# Terminal 5
cd Analytics_Service && npm start

# Terminal 6
cd Payment_Service && npm start

# Terminal 7
cd Billing_Service && npm start

# Terminal 8
cd message_broker && npm start

# Terminal 10 (START LAST!)
cd API_Gateway && npm start
```

**Option B: Using npm-run-all (Production-like)**

Install globally:
```bash
npm install -g npm-run-all
```

Create `package.json` in root:
```json
{
  "name": "saas-26-all",
  "scripts": {
    "start:auth": "cd Auth_Service && npm start",
    "start:providers": "cd Provider_Management_Service && npm start",
    "start:collector": "cd Collector_Service && npm start",
    "start:map": "cd Map_UI_Service && npm start",
    "start:analytics": "cd Analytics_Service && npm start",
    "start:payments": "cd Payment_Service && npm start",
    "start:billing": "cd Billing_Service && npm start",
    "start:broker": "cd message_broker && npm start",
    "start:gateway": "cd API_Gateway && npm start",
    "start:all": "npm-run-all --parallel start:auth start:providers start:collector start:map start:analytics start:payments start:billing start:broker start:gateway"
  }
}
```

Then start all:
```bash
npm run start:all
```

**Option C: Docker Compose (Recommended for Production)**

Create `docker-compose.yml` in root:
```yaml
version: '3.8'

services:
  auth:
    build: ./Auth_Service
    ports:
      - "3100:3100"
    environment:
      PORT: 3100
      JWT_SECRET: ${JWT_SECRET}
    networks:
      - saas26-network

  providers:
    build: ./Provider_Management_Service
    ports:
      - "3101:3101"
    environment:
      PORT: 3101
      REDPLUG_BASE_URL: ${REDPLUG_BASE_URL}
      GREENPLUG_BASE_URL: ${GREENPLUG_BASE_URL}
      BLUEPLUG_BASE_URL: ${BLUEPLUG_BASE_URL}
    networks:
      - saas26-network

  # ... (add all 8 services)

  gateway:
    build: ./API_Gateway
    ports:
      - "8000:8000"
    environment:
      PORT: 8000
      AUTH_SERVICE_URL: http://auth:3100
      PROVIDER_MGMT_SERVICE_URL: http://providers:3101
      # ... (all service URLs)
    depends_on:
      - auth
      - providers
      - collector
      - map
      - analytics
      - payments
      - billing
      - status
      - broker
    networks:
      - saas26-network

networks:
  saas26-network:
    driver: bridge
```

Start with Docker:
```bash
docker-compose up -d
docker-compose logs -f
```

### Step 5: Verify Installation

```bash
# Check all services are running
curl http://localhost:8000/health

# Response should show all 8 services
{
  "gateway": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "services": {
    "auth": { "status": "ok" },
    "providers": { "status": "ok" },
    "status": { "status": "ok" },
    "collector": { "status": "ok" },
    "map": { "status": "ok" },
    "analytics": { "status": "ok" },
    "payments": { "status": "ok" },
    "billing": { "status": "ok" }
  }
}
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All environment variables configured
- [ ] Database initialized (if using PostgreSQL)
- [ ] Secrets stored in secure vault (not in .env files)
- [ ] SSL/TLS certificates configured
- [ ] Rate limiting configured
- [ ] Monitoring setup (logs, metrics, traces)
- [ ] Backup strategy in place
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Deployment rollback plan ready

### Deployment Options

#### Option 1: Cloud Platform (Heroku/Railway/Render)

Each service can be deployed independently:

```bash
# Example: Deploy Auth Service to Heroku
cd Auth_Service
heroku create saas26-auth
git push heroku main

# Repeat for each service
```

#### Option 2: Virtual Machines (AWS EC2/DigitalOcean)

```bash
# On each VM
cd /opt/saas26
git clone <repo>

# Install services
./scripts/install-all.sh

# Create system service for each
sudo cp systemd/auth.service /etc/systemd/system/
sudo systemctl enable auth.service
sudo systemctl start auth.service

# ... repeat for all services
```

#### Option 3: Kubernetes

Create `k8s/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth
        image: saas26/auth:latest
        ports:
        - containerPort: 3100
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-secret
```

Deploy:
```bash
kubectl apply -f k8s/

# Scale services
kubectl scale deployment auth-service --replicas=3
```

#### Option 4: Docker on Server

```bash
# Build images
docker-compose build

# Push to registry
docker tag saas26-auth:latest myregistry/saas26-auth:latest
docker push myregistry/saas26-auth:latest

# On production server
docker pull myregistry/saas26-auth:latest
docker-compose up -d
```

### Load Balancing

Configure reverse proxy (Nginx/HAProxy):

```nginx
upstream api_gateway {
  server localhost:8000;
  server localhost:8001;
  server localhost:8002;
}

server {
  listen 80;
  server_name api.saas26.com;

  location / {
    proxy_pass http://api_gateway;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

## Lab Deployment (softlab) — Oμάδα 11

- Συνδεθείτε στο WiFi του εργαστηρίου: `softlab`.
- Στον server του εργαστηρίου (147.102.112.123) χρησιμοποιήστε τα διαπιστευτήρια της ομάδας:
  - **username**: `saas2611`
  - **password**: `5dec282b47047b6eced41e64`
  (Ο κωδικός είναι το τμήμα του API key μετά το `sk_saas_`.)
- Από εκεί μπορείτε να κάνετε `git pull` και `docker compose up -d` για να σηκώσετε τις υπηρεσίες.
- Παρακαλούμε ρυθμίστε το δημόσιο port της κύριας διεπαφής (frontend) σε `33xx` όπου `xx` ο αριθμός της ομάδας — για εμάς: `3311`.
  - Η εφαρμογή της ομάδας θα είναι ορατή στο δίκτυο του softlab στο: `147.102.112.123:3311`.
- Στο ριζικό `.env` (παράδειγμα: `.env`) έχουμε προ-συμπληρώσει τις μεταβλητές για την ομάδα 11, συμπεριλαμβανομένου του `FRONTEND_SERVICE_PORT=3311` και του `API_KEY`.

Παραδείγματα εντολών στον server του εργαστηρίου:
```bash
# ενημέρωση κώδικα
git pull origin main

# εκκίνηση με docker compose
docker compose up -d --build

# έλεγχος logs
docker compose ps
docker compose logs -f
```


### SSL/TLS Configuration

```bash
# Get certificate (Let's Encrypt)
sudo certbot certonly --standalone -d api.saas26.com

# Configure in nginx.conf
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/api.saas26.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/api.saas26.com/privkey.pem;
```

### Database Setup

```bash
# PostgreSQL
psql -U postgres

# Create databases
CREATE DATABASE auth_service;
CREATE DATABASE collector_service;
CREATE DATABASE billing_service;
CREATE DATABASE payment_service;
CREATE DATABASE analytics_service;
CREATE DATABASE provider_mgmt_service;
CREATE DATABASE map_service;

# Run migrations (when implemented)
npm run migrate
```

### Monitoring & Logging

#### Application Logging

```bash
# Install logging stack
npm install winston winston-daily-rotate-file

# Configure logging in each service
const logger = createLogger({
  defaultMeta: { service: 'auth-service' },
  transports: [
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      level: 'error'
    }),
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log'
    })
  ]
});
```

#### Metrics (Prometheus)

```bash
npm install prom-client

# Endpoint: GET /metrics
```

#### Distributed Tracing (Jaeger)

```bash
npm install jaeger-client

# All requests traced across services
```

### Health Checks

Each service exposes health endpoint:
```bash
GET /health

Response:
{
  "status": "ok",
  "service": "auth-service",
  "port": 3100,
  "uptime": 3600,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

Use with orchestration:
```yaml
# Docker Compose
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check port conflicts
lsof -i :3100

# Check logs
npm start -- --debug

# May need to kill existing process
kill -9 <PID>
```

### Services Can't Communicate

```bash
# Check networking
curl http://localhost:3001/health
curl http://auth:3100/health    # From Docker

# Check firewall rules
sudo ufw status
```

### Database Connection Issues

```bash
# Test connection
psql -h localhost -U postgres -d auth_service

# Check connection string
echo $DATABASE_URL
```

### Memory Issues

```bash
# Monitor memory
free -h
docker stats

# Increase Node.js heap
NODE_OPTIONS=--max-old-space-size=4096 npm start
```

---

## Performance Tuning

### Node.js Cluster Mode

```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  app.listen(PORT);
}
```

### Connection Pooling

```javascript
const pool = new Pool({
  max: 20,
  idle: 30000,
  connectionTimeoutMillis: 5000
});
```

### Caching Strategy

Implement Redis:
```bash
docker run -d -p 6379:6379 redis:latest

npm install redis

// In service
const redis = require('redis');
const client = redis.createClient();
```

### Rate Limiting

```bash
npm install express-rate-limit

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100  // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## Rollback Strategy

### Keep Multiple Versions

```bash
docker tag saas26-auth:latest saas26-auth:v1.2.3
docker push saas26-auth:v1.2.3:latest
```

### Blue-Green Deployment

```bash
# Deploy to green environment
docker-compose -f docker-compose.green.yml up -d

# Test
curl http://green.api.com/health

# Switch traffic
# ... update load balancer

# Keep blue available for rollback
```

### Database Migrations

```bash
# Always test migrations
npm run migrate:test

# Keep rollback scripts
npm run migrate:rollback

# Version your migrations
```

---

## Continuous Integration/Deployment

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Build services
        run: docker-compose build
      
      - name: Push to registry
        run: |
          docker login -u ${{ secrets.DOCKER_USER }} -p ${{ secrets.DOCKER_PASS }}
          docker-compose push
      
      - name: Deploy to production
        run: |
          ssh user@api.saas26.com 'cd /opt/saas26 && docker-compose pull && docker-compose up -d'
```

---

## Cost Optimization

- Use spot instances for non-critical services
- Implement auto-scaling based on CPU/memory
- Use CDN for static content
- Archive old logs to S3
- Right-size database instances

---

## Support & Maintenance

### Regular Tasks

- [ ] Monitor error rates
- [ ] Review AWS/server bills
- [ ] Check for security updates
- [ ] Backup databases
- [ ] Update dependencies monthly
- [ ] Review performance metrics
- [ ] Clean up old logs
- [ ] Test disaster recovery

### Escalation Process

1. **Warning**: Alert on dashboard
2. **Critical**: Page on-call engineer
3. **Severe**: Activate incident response team
4. **Post-Incident**: Root cause analysis

---

**Last Updated**: January 2024
**Version**: 1.0.0
**Supported Environments**: Development, Staging, Production

