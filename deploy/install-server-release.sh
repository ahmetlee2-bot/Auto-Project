#!/bin/sh
set -eu

platform_dir=/opt/autolister-platform
compose_source=/tmp/compose.yml.new
bridge_env_source=/tmp/ebay-bridge.env.new

test -s "$compose_source"
test -s "$bridge_env_source"

sudo install -o root -g root -m 0644 "$compose_source" "$platform_dir/compose.yml"
sudo install -o root -g root -m 0600 "$bridge_env_source" "$platform_dir/ebay-bridge.env"

if ! sudo grep -q '^EBAY_BRIDGE_SHARED_SECRET=' "$platform_dir/.env"; then
  secret="$(openssl rand -hex 32)"
  printf '\nEBAY_BRIDGE_SHARED_SECRET=%s\n' "$secret" | sudo tee -a "$platform_dir/.env" >/dev/null
fi

if sudo grep -q '^ALLOW_LIVE_PUBLISH=' "$platform_dir/ebay-bridge.env"; then
  sudo sed -i 's/^ALLOW_LIVE_PUBLISH=.*/ALLOW_LIVE_PUBLISH=false/' "$platform_dir/ebay-bridge.env"
else
  printf '\nALLOW_LIVE_PUBLISH=false\n' | sudo tee -a "$platform_dir/ebay-bridge.env" >/dev/null
fi

sudo chmod 0600 "$platform_dir/.env" "$platform_dir/ebay-bridge.env"

required_keys='EBAY_CLIENT_ID EBAY_CLIENT_SECRET EBAY_REFRESH_TOKEN EBAY_PAYMENT_POLICY_ID EBAY_RETURN_POLICY_ID EBAY_FULFILLMENT_POLICY_ID EBAY_MERCHANT_LOCATION_KEY'
for key in $required_keys; do
  if ! sudo awk -F= -v key="$key" '$1 == key && length($2) > 0 { found=1 } END { exit found ? 0 : 1 }' "$platform_dir/ebay-bridge.env"; then
    echo "Missing required bridge setting: $key" >&2
    exit 1
  fi
done

if ! sudo awk -F= '$1 == "EBAY_LEGACY_OWNER_USER_ID" && length($2) > 0 { found=1 } END { exit found ? 0 : 1 }' "$platform_dir/.env"; then
  echo 'Missing EBAY_LEGACY_OWNER_USER_ID in server .env' >&2
  exit 1
fi

sudo sh -c "cd '$platform_dir' && docker compose config --quiet"
sudo sh -c "cd '$platform_dir' && docker compose pull frontend api ebay-bridge"
sudo sh -c "cd '$platform_dir' && docker compose up -d redis ebay-bridge api frontend"
sudo sh -c "cd '$platform_dir' && docker compose ps"
