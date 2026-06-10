#!/usr/bin/env bash
set -euo pipefail

echo "Stopping Frontend Service..."
docker stop frontend-service || true
docker rm -f frontend-service || true
echo "Frontend Service stopped."
