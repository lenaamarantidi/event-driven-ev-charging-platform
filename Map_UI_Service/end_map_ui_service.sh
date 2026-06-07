#!/usr/bin/env bash
set -euo pipefail

echo "Stopping Map UI Service..."
docker stop map-ui-service || true
docker rm -f map-ui-service || true
echo "Map UI Service stopped."