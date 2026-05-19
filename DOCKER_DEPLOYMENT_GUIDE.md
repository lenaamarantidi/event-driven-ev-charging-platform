# Docker & Deployment Guide - SaaS Plug

## 🐳 Docker Deployment

### Quick Start with Docker

```bash
# Single command to build and run all services
docker-compose up --build

# Or in detached mode (background)
docker-compose up -d --build
```

### Building Individual Service Images

```bash
# Build Points Service image
docker build -f Points_Service/Dockerfile -t saas-plug-points:latest .

# Build Reservation Service image
docker build -f Reservation_Service/Dockerfile -t saas-plug-reservation:latest .

# Build API Gateway image
docker build -f API_Gateway/Dockerfile -t saas-plug-gateway:latest .
```

### Running Individual Services

```bash
# Run Points Service
docker run -p 3001:3001 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  saas-plug-points:latest

# Run Reservation Service
docker run -p 3003:3003 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  saas-plug-reservation:latest

# Run API Gateway
docker run -p 8000:8000 \
  -e NODE_ENV=production \
  -e POINTS_SERVICE_URL=http://docker.for.mac.host.internal:3001 \
  -e RESERVATION_SERVICE_URL=http://docker.for.mac.host.internal:3003 \
  saas-plug-gateway:latest
```

---

## 🔍 Docker Compose Commands

### Manage Services

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# View running containers
docker-compose ps

# View service logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f points-service

# Stop all services
docker-compose stop

# Stop and remove all services
docker-compose down

# Remove all data (volumes)
docker-compose down -v

# Restart specific service
docker-compose restart points-service
```

### Health Checks

```bash
# Check container status
docker-compose ps

# Check health of specific container
docker inspect --format='{{.State.Health.Status}}' saas26-11_points-service_1

# View container health logs
docker inspect --format='{{json .State.Health}}' saas26-11_points-service_1 | jq
```

---

## 📊 Monitoring Docker Containers

### View Container Metrics

```bash
# Real-time container stats
docker stats

# Pretty formatted stats
docker stats --format "table {{.Container}}\t{{.MemUsage}}\t{{.CPUPerc}}"

# Save container logs
docker-compose logs > service-logs.txt

# View only errors
docker-compose logs | grep -i error
```

### Accessing Container Shell

```bash
# Shell into Points Service container
docker-compose exec points-service sh

# Install debugging tools inside container (if needed)
apk add --no-cache curl bind-tools

# Test service connectivity
curl http://localhost:3001/api/points
```

---

## 🚀 Kubernetes Deployment

### Option 1: Manual Kubernetes Manifests

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: points-service
  labels:
    app: saas-plug
    tier: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: points-service
  template:
    metadata:
      labels:
        app: points-service
    spec:
      containers:
      - name: points-service
        image: saas-plug-points:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "info"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 5
```

Deploy to Kubernetes:
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### Option 2: Using Helm

```bash
helm install saas-plug ./helm-chart/
helm upgrade saas-plug ./helm-chart/
helm rollback saas-plug
```

---

## 🔐 Production Deployment Checklist

- [ ] Use `.env.production` for environment variables
- [ ] Set `NODE_ENV=production`
- [ ] Use specific image versions (not `latest`)
- [ ] Enable HTTPS/TLS for all external communication
- [ ] Configure resource limits (CPU, Memory)
- [ ] Set up proper logging and monitoring
- [ ] Enable health checks and liveness probes
- [ ] Use private container registry
- [ ] Implement secrets management (Vault, Sealed Secrets)
- [ ] Set up automated backups for reservations
- [ ] Configure rate limiting and DDoS protection
- [ ] Enable security scanning for container images
- [ ] Document deployment procedure
- [ ] Test rollback procedures
- [ ] Monitor error rates and latencies

---

## 📈 Docker Compose with External Services

### With PostgreSQL Database

Add to `docker-compose.yml`:
```yaml
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: saas_user
      POSTGRES_PASSWORD: secure_password
      POSTGRES_DB: saas_central
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U saas_user"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - saas-network

volumes:
  postgres-data:
```

### With RabbitMQ Message Broker

Add to `docker-compose.yml`:
```yaml
  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    healthcheck:
      test: rabbitmq-diagnostics ping
      interval: 30s
      timeout: 10s
      retries: 5
    networks:
      - saas-network

volumes:
  rabbitmq-data:
```

---

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Build Docker images
        run: |
          docker-compose build
      
      - name: Run tests
        run: |
          docker-compose run --rm points-service npm test
      
      - name: Push to registry
        run: |
          docker login -u ${{ secrets.DOCKER_USER }} -p ${{ secrets.DOCKER_PASSWORD }}
          docker-compose push
      
      - name: Deploy to production
        run: |
          docker-compose -f docker-compose.prod.yml up -d
```

---

## 🐛 Troubleshooting Docker Issues

### Container won't start

```bash
# View error logs
docker-compose logs points-service

# Check image exists
docker images | grep saas-plug

# Rebuild image
docker-compose build --no-cache points-service
```

### Port conflicts

```bash
# Find what's using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
```

### Network connectivity issues

```bash
# Inspect network
docker network inspect <network-name>

# Test DNS resolution inside container
docker-compose exec points-service nslookup reservation-service

# Ping another service
docker-compose exec points-service ping -c 3 reservation-service
```

### Memory issues

```bash
# Limit container memory
docker run -m 512m saas-plug-points:latest

# Add to docker-compose.yml:
reservations-service:
  mem_limit: 512m
  memswap_limit: 1g
```

---

## 📝 Useful Docker Commands

```bash
# List all containers (including stopped)
docker ps -a

# Remove unused images
docker image prune

# Remove unused volumes
docker volume prune

# Remove complete docker system data
docker system prune -a

# Inspect container details
docker inspect <container-id>

# Copy files from/to container
docker cp container:/path/to/file ./local/path
docker cp ./local/file container:/path/to/destination

# Execute command in running container
docker exec -it <container-id> <command>

# View image layers
docker history saas-plug-points:latest

# Build with build args
docker build --build-arg NODE_ENV=production -t saas-plug-points:latest .
```

---

## 🚀 Performance Optimization

### Reduce Image Size

```dockerfile
# Use multi-stage build
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
CMD ["npm", "start"]
```

### Caching Strategy

```dockerfile
# Good: Change rarely-modified files later
COPY package*.json ./
RUN npm ci
COPY src ./src

# Bad: Changes src, invalidates npm install cache
COPY src ./src
COPY package*.json ./
RUN npm ci
```

---

## 📞 Support & Resources

- Docker Documentation: https://docs.docker.com/
- Docker Compose: https://docs.docker.com/compose/
- Kubernetes: https://kubernetes.io/docs/
- Container Registry: Docker Hub, ECR, GCR, or private registry
