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
pids=()

for i in {0..3}; do
  echo "Starting service ${services[$i]} listening at PORT=${free_ports[$i]} with its MARIADB_PORT=${ports[$i]}"

  SERVICE=${services[$i]} \
  PORT=${free_ports[$i]} \
  MARIADB_PORT=${ports[$i]} \
  MARIADB_HOST=localhost \
  BEARER_TOKEN=sk_saas_5dec282b47047b6eced41e64 \
  node src/index.js > "service_$i.log" 2>&1 &

  pids+=($!)
done

echo "NODE PIDs: ${pids[@]} resp. for ${services[@]}"
export ENV_VAR_POINTS_NODE_PIDS="${pids[@]}"
echo $ENV_VAR_POINTS_NODE_PIDS > temp_nodes_pids.log



