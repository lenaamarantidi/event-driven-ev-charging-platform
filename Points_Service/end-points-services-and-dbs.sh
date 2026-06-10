#!/usr/bin/env bash
set -euo pipefail

# Stop and remove Points Service containers
echo "Stopping Points Service containers..."

# Stop all points service containers
for service in points-green-service points-red-service points-blue-service points-central-service; do
    docker stop $service || true
    docker rm -f $service || true
    echo "Stopped $service"
done

# Stop and remove DB containers
echo "Stopping Points DB containers..."
for db in points-red points-green points-blue points-central; do
    docker stop $db || true
    docker rm -f $db || true
    echo "Stopped $db"
done

echo "Points Service and DB containers stopped."
