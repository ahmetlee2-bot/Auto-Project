#!/bin/sh
set -eu

cd /opt/autolister-platform
docker compose pull frontend api ebay-bridge repricer-cron
docker compose up -d frontend api ebay-bridge repricer-cron
docker image prune -f --filter until=168h >/dev/null
