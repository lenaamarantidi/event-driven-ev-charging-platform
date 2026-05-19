#!/usr/bin/env bash
set -euo pipefail

createdb_if_missing() {
  local dbname="$1"
  if ! psql -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbname'" | grep -q 1; then
    echo "Creating database: $dbname"
    createdb -U "$POSTGRES_USER" "$dbname"
  else
    echo "Database already exists: $dbname"
  fi
}

create_extensions() {
  local dbname="$1"
  echo "Creating extensions in $dbname"
  psql -U "$POSTGRES_USER" -d "$dbname" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
  if [ "$dbname" = "points_service" ]; then
    psql -U "$POSTGRES_USER" -d "$dbname" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
  fi
}

createdb_if_missing points_service
createdb_if_missing reservations_service
createdb_if_missing billing_db

create_extensions points_service
create_extensions reservations_service
create_extensions billing_db
