#!/bin/sh
set -eu

# Run as root on the existing AutoLister host after publishing the new images.
platform_dir=/opt/autolister-platform
compose_source=/tmp/autolister-repricer-compose.yml
updater_source=/tmp/autolister-repricer-update.sh
test -s "$compose_source"
test -s "$updater_source"
test -s "$platform_dir/.env"

python3 - <<'PY'
from pathlib import Path
values = {}
for line in Path('/opt/autolister-platform/.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('\"\x27')
for key in ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'EBAY_LEGACY_OWNER_USER_ID', 'EBAY_BRIDGE_SHARED_SECRET']:
    if not values.get(key):
        raise SystemExit('Required server setting missing: ' + key)
print('Required server settings present.')
print('Rainforest configured:', bool(values.get('RAINFOREST_API_KEY')))
PY

backup_dir="$platform_dir/backups/repricer-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup_dir"
cp "$platform_dir/compose.yml" "$backup_dir/compose.yml"
cp /usr/local/sbin/autolister-update "$backup_dir/autolister-update"
cp /etc/nginx/sites-enabled/saas-backend "$backup_dir/nginx-saas-backend"
install -o root -g root -m 0644 "$compose_source" "$platform_dir/compose.yml"
install -o root -g root -m 0755 "$updater_source" /usr/local/sbin/autolister-update

python3 - <<'PY'
from pathlib import Path
path = Path('/etc/nginx/sites-enabled/saas-backend')
text = path.read_text()
if 'location ^~ /api/tracked-products' not in text:
    marker = '    location = /api/lead {'
    if text.count(marker) != 1:
        raise SystemExit('Unexpected Nginx structure; inspect before changing routes.')
    routes = '''    location ^~ /api/tracked-products {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_read_timeout 300s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ^~ /api/cron/ { return 404; }
    location ^~ /api/internal/ { return 404; }
'''
    path.write_text(text.replace(marker, routes + marker))
PY

cd "$platform_dir"
docker compose config --quiet
nginx -t
docker compose pull frontend ebay-bridge repricer-cron
docker compose up -d frontend ebay-bridge repricer-cron
systemctl reload nginx
docker compose ps frontend ebay-bridge repricer-cron
printf 'Configuration backup: %s\n' "$backup_dir"
