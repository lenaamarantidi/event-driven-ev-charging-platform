#!/usr/bin/env bash

# Central deployment for saasPlug - Server Edition (Team 11).
#
# What it does:
#   1. Starts Docker services from docker-compose.yml (backends only).
#   2. Resets persisted DB/RabbitMQ volumes by default.
#   3. Seeds the three built-in providers through the existing provider seed script.
#   4. Creates the reserved operator user in Auth DB.
#   5. Loads mock Analytics and Billing data from existing SQL files.
#   6. Triggers Points Service repopulation from the three provider adapters.
#   7. Starts the React frontend (front-end/) on port 3311.
#
# Deployment location: 147.102.112.123:3311
# Backend services: 147.102.112.123:55xx (55xx range for team 11)
#
# Usage:
#   ./deploy.sh
#
# Optional environment:
#   RESET_DATA=0 ./deploy.sh       # keep existing Docker volumes
#   FRONTEND=0 ./deploy.sh         # do not start React frontend
#   OPERATOR_PASSWORD=... ./deploy.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

RESET_DATA="${RESET_DATA:-1}"
FRONTEND="${FRONTEND:-1}"
OPERATOR_USERNAME="${OPERATOR_USERNAME:-operator}"
OPERATOR_EMAIL="${OPERATOR_EMAIL:-operator@charger.io}"
OPERATOR_PASSWORD="${OPERATOR_PASSWORD:-operator123}"

COMPOSE=(docker compose)

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

wait_for_container_health() {
  local container="$1"
  local timeout="${2:-120}"
  local elapsed=0

  log "Waiting for $container to become healthy"
  while [ "$elapsed" -lt "$timeout" ]; do
    local status
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
      echo "  $container: $status"
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  echo "Timed out waiting for $container" >&2
  docker logs --tail=80 "$container" || true
  exit 1
}

wait_for_http() {
  local url="$1"
  local timeout="${2:-120}"
  local elapsed=0

  log "Waiting for HTTP endpoint $url"
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "  ready: $url"
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  echo "Timed out waiting for $url" >&2
  exit 1
}

run_sql_file() {
  local container="$1"
  local database="$2"
  local file="$3"

  if [ ! -f "$file" ]; then
    echo "SQL file not found: $file" >&2
    exit 1
  fi

  log "Loading $file into $database on $container"
  docker exec -i "$container" mariadb -uroot -proot "$database" < "$file"
}

seed_operator_user() {
  log "Creating reserved operator user in Auth DB"

  local password_hash
  password_hash="$("${COMPOSE[@]}" exec -T -e OPERATOR_PASSWORD="$OPERATOR_PASSWORD" auth-service node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync(process.env.OPERATOR_PASSWORD || 'operator123', 12));")"

  docker exec -i saasplug-mariadb-auth mariadb -uroot -proot auth_db <<SQL
INSERT INTO User (username, email, password_hash, first_name, last_name)
VALUES ('$OPERATOR_USERNAME', '$OPERATOR_EMAIL', '$password_hash', 'SaaS', 'Operator')
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  password_hash = VALUES(password_hash),
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  updated_at = CURRENT_TIMESTAMP;
SQL

  echo "  operator login identifier: $OPERATOR_USERNAME or $OPERATOR_EMAIL"
  echo "  operator password: $OPERATOR_PASSWORD"
}

seed_providers() {
  log "Seeding provider accounts with existing Provider Management script"
  "${COMPOSE[@]}" run --rm \
    -e DB_HOST=mariadb-provider \
    -e DB_PORT=3306 \
    -e DB_USER=provider_user \
    -e DB_PASSWORD=provider_pass \
    provider-management-service npm run seed
}

repopulate_points() {
  log "Loading charging points from provider adapters into central Points DB"
  curl -fsS -X POST "http://localhost:5512/db/repopulate" \
    -H "Content-Type: application/json" \
    -d '{}' \
    | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { try { console.log(JSON.stringify(JSON.parse(s), null, 2)); } catch (_) { console.log(s); } });"
}

main() {
  need_command docker
  need_command curl
  need_command node

  if [ "$RESET_DATA" = "1" ]; then
    log "Resetting Docker containers and persisted volumes"
    "${COMPOSE[@]}" down --volumes --remove-orphans
  else
    log "Stopping existing containers without deleting volumes"
    "${COMPOSE[@]}" down --remove-orphans
  fi

  log "Building and starting backend/database containers"
  if ! "${COMPOSE[@]}" up -d --build; then
    log "Initial compose startup hit a dependency timing issue; retrying once"
    sleep 10
    "${COMPOSE[@]}" up -d --build
  fi

  wait_for_container_health saasplug-rabbitmq
  wait_for_container_health saasplug-message-broker
  wait_for_container_health saasplug-mysql-central
  wait_for_container_health saasplug-mariadb-provider
  wait_for_container_health saasplug-mariadb-auth
  wait_for_container_health saasplug-mariadb-analytics
  wait_for_container_health saasplug-mariadb-billing
  wait_for_container_health saasplug-central

  wait_for_http "http://localhost:5517/auth/health"
  wait_for_http "http://localhost:5516/health"
  wait_for_http "http://localhost:5518/health"
  wait_for_http "http://localhost:5514/health"
  wait_for_http "http://localhost:5520/health"
  wait_for_http "http://localhost:5521/health"
  wait_for_http "http://localhost:5522/health"

  seed_providers
  seed_operator_user

  run_sql_file saasplug-mariadb-analytics analytics_db Analytics_Service/db/mock-provider-analytics-seed.sql
  run_sql_file saasplug-mariadb-billing billing_db Billing_Service/db/init.sql

  repopulate_points

  log "Deployment data is ready"
  echo "  Backend examples:"
  echo "    Auth:      http://localhost:5517/auth/health"
  echo "    Points:    http://localhost:5512/api/points"
  echo "    Analytics: http://localhost:5518/health"
  echo "    Billing:   http://localhost:5514/health"
  echo "  Operator credentials:"
  echo "    username: $OPERATOR_USERNAME"
  echo "    email:    $OPERATOR_EMAIL"
  echo "    password: $OPERATOR_PASSWORD"

  if [ "$FRONTEND" = "1" ]; then
    log "Starting React frontend on port 3311"
    cd "$ROOT_DIR/front-end"
    npm install >/dev/null 2>&1
    exec npm run dev -- --host 0.0.0.0
  fi

  echo "Frontend skipped. Run: cd front-end && npm run dev"
}

main "$@"
