#!/usr/bin/env bash
set -euo pipefail

# Starts MariaDB for Points_Service using docker-compose.mariadb.points.yml.
# This script exports variables used by the compose file, including:
# - points_db_container_name: container_name for the DB
# - local_port: host port mapped to container port 3306
# - MARIADB_* values are optional and can be used by the Node service.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

## find listening ports of mariadb containers up
declare -a ports=()
services=(points-green points-red points-blue points-central)

for service in "${services[@]}"; do
  port=$(docker ps \
    --filter "name=$service" \
    --format '{{.Ports}}' |
    sed -E 's/.*:([0-9]+)->[0-9]+\/tcp.*/\1/')

  ports+=("$port")
  echo "mariadb points containers port:  ${port} -> ${service}"
done

echo "mariadb points containers ports:  ${ports[@]}"


## Find 4 completely free ports
START_PORT=3001
COUNT=4

found=0
port=$START_PORT
free_ports=()

while [ $found -lt $COUNT ]; do
  if ! lsof -i :"$port" >/dev/null 2>&1; then
    free_ports+=("$port")
    found=$((found + 1))
  fi

  port=$((port + 1))
done

echo "free ports found: ${free_ports[@]}"

count=${#free_ports[@]}
if [[ $count -lt 4 ]]; then
  echo "ERROR: expected 4 free ports, found ${count}: ${free_ports[*]}" >&2
  exit 1
fi

# Start 4 service instances. We map:
# - PORT (service HTTP port)  -> free_ports[i]
# - MARIADB_PORT (host DB port) -> ports[i] (ports exposed by the DB containers)
# Each instance runs `node src/index.js` in its own process/container context,
# and uses SERVICE=${services[i]} so it behaves like the corresponding plug service.
pids=()

for i in {0..3}; do
  service_upper=$(echo "${services[$i]}" | tr '[:lower:]-' '[:upper:]_')

  eval "export ${service_upper}_SERVICE='${services[$i]}-service'"
  eval "export ${service_upper}_PORT='${free_ports[$i]}'"
  eval "export ${service_upper}_MARIADB_PORT='${ports[$i]}'"

  echo "POINTS VARIABLES for ${services[$i]} service:"
  eval "echo ${service_upper}_SERVICE=\$${service_upper}_SERVICE"
  eval "echo ${service_upper}_PORT=\$${service_upper}_PORT"
  eval "echo ${service_upper}_MARIADB_PORT=\$${service_upper}_MARIADB_PORT"
done

# Export compose variables expected by docker-compose.points.services.yml
# It uses POINTS_*_PORT/POINTS_*_SERVICE/POINTS_*_MARIADB_PORT.
export POINTS_GREEN_PORT=${free_ports[0]}
export POINTS_RED_PORT=${free_ports[1]}
export POINTS_BLUE_PORT=${free_ports[2]}
export POINTS_CENTRAL_PORT=${free_ports[3]}

export POINTS_GREEN_SERVICE=points-green-service
export POINTS_RED_SERVICE=points-red-service
export POINTS_BLUE_SERVICE=points-blue-service
export POINTS_CENTRAL_SERVICE=points-central-service

export POINTS_GREEN_MARIADB_PORT=${ports[0]}
export POINTS_RED_MARIADB_PORT=${ports[1]}
export POINTS_BLUE_MARIADB_PORT=${ports[2]}
export POINTS_CENTRAL_MARIADB_PORT=${ports[3]}

export MARIADB_HOST=host.docker.internal
export BEARER_TOKEN=sk_saas_5dec282b47047b6eced41e64

# Always rebuild image with no cache (like docker build --no-cache -t points_service:latest .)
echo "Building points_service:latest image..."
docker build --no-cache -t points_service:latest .

docker compose -f docker-compose.points.services.yml up -d




