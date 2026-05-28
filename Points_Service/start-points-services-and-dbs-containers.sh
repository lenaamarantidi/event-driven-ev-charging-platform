#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "=== Starting MariaDB containers ==="
./start-mariadb-points-dbs-containers.sh

echo ""
echo "=== Starting Points Service containers ==="
./start-points-services-containers.sh

echo ""
echo "=== All services started ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
