#!/usr/bin/env bash
set -euo pipefail

# Find first available port starting from 3001 and start Frontend Service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

START_PORT=3001
MAX_PORT=4000

# Find first available port
port=$START_PORT
while [ $port -le $MAX_PORT ]; do
    if ! lsof -i :"$port" >/dev/null 2>&1; then
        break
    fi
    port=$((port + 1))
done

if [ $port -gt $MAX_PORT ]; then
    echo "ERROR: No available ports found in range $START_PORT-$MAX_PORT" >&2
    exit 1
fi

echo "Found available port: $port"
export FRONTEND_SERVICE_PORT=$port

# Always rebuild image with no cache
echo "Building frontend_service:latest image..."
docker build --no-cache -t frontend_service:latest .

# Start the Frontend Service
docker compose -f docker-compose.frontend.service.yml up -d
