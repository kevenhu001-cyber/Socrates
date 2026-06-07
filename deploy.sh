#!/usr/bin/env bash
# deploy.sh — sync local source to topodrive.top web root
# Usage:  ./deploy.sh
#   or:   ./deploy.sh /path/to/index.html

set -euo pipefail

SRC="${1:-/home/ubuntu/Socrates/index.html}"
APP_DEST="/var/www/app.topodrive.top/index.html"

# 1. Quick sanity check on the source file
if [[ ! -f "$SRC" ]]; then
  echo "ERROR: source not found: $SRC" >&2
  exit 1
fi

# 2. Copy SPA to app subdomain ONLY (app.topodrive.top — SPA learning app)
sudo install -m 644 -o www-data -g www-data "$SRC" "$APP_DEST"

# 3. Copy landing site files (topodrive.top — marketing site)
SITE_DIR="/home/ubuntu/Socrates/site"
if [ -d "$SITE_DIR" ]; then
  sudo install -m 644 -o www-data -g www-data "$SITE_DIR/base.css" "/var/www/topodrive.top/base.css"
  sudo install -m 644 -o www-data -g www-data "$SITE_DIR/index.html" "/var/www/topodrive.top/index.html"
  for page in pricing guide about contact terms privacy account api-keys profile checkout; do
    sudo install -m 644 -o www-data -g www-data "$SITE_DIR/$page.html" "/var/www/topodrive.top/$page.html"
  done
  # Copy zh/ subdirectory (Chinese localized pages)
  if [ -d "$SITE_DIR/zh" ]; then
    sudo mkdir -p "/var/www/topodrive.top/zh"
    for page in index pricing guide about contact terms privacy checkout account api-keys profile; do
      if [ -f "$SITE_DIR/zh/$page.html" ]; then
        sudo install -m 644 -o www-data -g www-data "$SITE_DIR/zh/$page.html" "/var/www/topodrive.top/zh/$page.html"
      fi
    done
  fi
fi

# 3. Validate nginx config (catches any syntax issues)
if ! sudo nginx -t >/dev/null 2>&1; then
  echo "WARNING: nginx config test failed (not related to file copy)" >&2
fi

# 4. Reload nginx (only needed if the site config changes; cheap if not)
sudo nginx -s reload >/dev/null 2>&1 || true

# 5. Report
echo "✓ $SRC → $APP_DEST"
echo "  size:    $(stat -c%s "$APP_DEST") bytes"
echo "  md5:     $(md5sum "$APP_DEST" | cut -d' ' -f1)"
echo "  served:  $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 https://app.topodrive.top/)"
