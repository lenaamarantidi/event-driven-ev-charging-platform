#!/usr/bin/env bash
set -euo pipefail

# Starts MariaDB for Points_Service using docker-compose.mariadb.points.yml.
# This script exports variables used by the compose file, including:
# - points_db_container_name: container_name for the DB
# - local_port: host port mapped to container port 3306
# - MARIADB_* values are optional and can be used by the Node service.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

## down all existing dbs and services
docker compose -f docker-compose.mariadb.points.yml down -v --remove-orphans

## Find 4 completely free ports
START_PORT=3010
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

# Allow overrides from environment; otherwise use defaults.
# Use 4 continuous available host ports for: red/green/blue/central.
points_db_red_port=${points_db_red_port:-${free_ports[0]}}
points_db_green_port=${points_db_green_port:-${free_ports[1]}}
points_db_blue_port=${points_db_blue_port:-${free_ports[2]}}
points_db_central_port=${points_db_central_port:-${free_ports[3]}}

export points_db_red_port
export points_db_green_port
export points_db_blue_port
export points_db_central_port

# Debug: Print the variables to verify they are set
echo " points_db_red_port: $points_db_red_port"
echo " points_db_green_port: $points_db_green_port"
echo " points_db_blue_port: $points_db_blue_port"
echo " points_db_central_port: $points_db_central_port"


docker build --no-cache -t points_service:latest .

docker compose -f docker-compose.mariadb.points.yml up -d

echo "MariaDB points started. Verify with:"
echo "  docker compose -f docker-compose.mariadb.points.yml ps"
