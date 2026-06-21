#!/usr/bin/env bash
# deploy.sh — sync local source to topodrive.top web root
# Usage:  ./deploy.sh                      # build frontend + deploy everything
#   or:   ./deploy.sh /path/to/index.html  # legacy: deploy a single SPA file
#
# Production path: app.topodrive.top is served from
# /var/www/app.topodrive.top/. The frontend/ project bundles with Vite
# to frontend/dist/, and we copy the bundle into that web root.

set -euo pipefail

FRONTEND_DIR="/home/ubuntu/Socrates/frontend"
APP_WEB_ROOT="/var/www/app.topodrive.top"

# ─── 1. Build the frontend (Vite) ─────────────────────────────────────
if [[ "${1:-}" != "" && -f "${1}" ]]; then
  # Legacy mode: deploy a single index.html file directly.
  LEGACY_SRC="$1"
  echo "Legacy mode: deploying single file $LEGACY_SRC"
  sudo install -m 644 -o www-data -g www-data "$LEGACY_SRC" "$APP_WEB_ROOT/index.html"
  SRC_DESC="$LEGACY_SRC"
  SRC_SIZE=$(stat -c%s "$LEGACY_SRC")
  SRC_MD5=$(md5sum "$LEGACY_SRC" | cut -d' ' -f1)
else
  # Production mode: build the Vite bundle and copy dist/* into the web root.
  echo "Building frontend (Vite)…"
  (cd "$FRONTEND_DIR" && npx vite build 2>&1 | tail -5)
  DIST_DIR="$FRONTEND_DIR/dist"

  # Wipe + copy the bundle (index.html + assets/) so we don't leave
  # stale hash-named JS files behind after a code change.
  sudo rm -rf "$APP_WEB_ROOT/assets"
  sudo install -m 644 -o www-data -g www-data "$DIST_DIR/index.html" "$APP_WEB_ROOT/index.html"
  sudo mkdir -p "$APP_WEB_ROOT/assets"
  sudo install -m 644 -o www-data -g www-data "$DIST_DIR"/assets/* "$APP_WEB_ROOT/assets/"

  SRC_DESC="vite build → $APP_WEB_ROOT/"
  SRC_SIZE=$(stat -c%s "$APP_WEB_ROOT/index.html")
  SRC_MD5=$(md5sum "$APP_WEB_ROOT/index.html" | cut -d' ' -f1)
fi

# ─── 2. Marketing site (topodrive.top) ───────────────────────────────
SITE_DIR="/home/ubuntu/Socrates/site"
if [ -d "$SITE_DIR" ]; then
  sudo install -m 644 -o www-data -g www-data "$SITE_DIR/base.css" "/var/www/topodrive.top/base.css"
  sudo install -m 644 -o www-data -g www-data "$SITE_DIR/index.html" "/var/www/topodrive.top/index.html"
  for page in pricing guide about contact terms privacy account api-keys profile checkout; do
    sudo install -m 644 -o www-data -g www-data "$SITE_DIR/$page.html" "/var/www/topodrive.top/$page.html"
  done
  if [ -d "$SITE_DIR/zh" ]; then
    sudo mkdir -p "/var/www/topodrive.top/zh"
    for page in index pricing guide about contact terms privacy checkout account api-keys profile; do
      if [ -f "$SITE_DIR/zh/$page.html" ]; then
        sudo install -m 644 -o www-data -g www-data "$SITE_DIR/zh/$page.html" "/var/www/topodrive.top/zh/$page.html"
      fi
    done
  fi
fi

# ─── 3. Validate nginx + reload ──────────────────────────────────────
if ! sudo nginx -t >/dev/null 2>&1; then
  echo "WARNING: nginx config test failed (not related to file copy)" >&2
fi

if sudo nginx -s reload >/dev/null 2>&1; then
  NGINX_STATUS="reloaded"
else
  NGINX_STATUS="RELOAD FAILED — files are in place but nginx did not pick them up; check 'sudo nginx -t' manually"
fi

# ─── 4. Report ────────────────────────────────────────────────────────
echo "✓ $SRC_DESC"
echo "  size:    $SRC_SIZE bytes"
echo "  md5:     $SRC_MD5"
echo "  served:  $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 https://app.topodrive.top/)"
echo "  nginx:   $NGINX_STATUS"
