#!/bin/sh
set -eu

cd /opt/autolister-platform
docker compose pull frontend api ebay-bridge
docker compose up -d frontend api ebay-bridge
docker image prune -f --filter until=168h >/dev/null
