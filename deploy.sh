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
SITE_WEB_ROOT="/var/www/topodrive.top"

# ─── 0. Preflight: detect sudo + dry-run ──────────────────────────────
SUDO=""
if command -v sudo >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null; then
    SUDO="sudo"
  else
    echo "ERROR: 'sudo' is required but not passwordless. Run as root," >&2
    echo "       grant NOPASSWD via /etc/sudoers, or set SUDO='' and run" >&2
    echo "       this script as root." >&2
    exit 1
  fi
else
  # No sudo binary at all — assume we are already root.
  SUDO=""
fi

# Backup previous deployment so a bad build can be reverted with a
# single `cp -a .previous/* .` . The .previous/ folder is created on
# the first deploy and rotated on each subsequent one (so we keep
# just the immediately previous copy, not an unbounded history).
backup_previous() {
  local web_root="$1"
  [[ -d "$web_root" ]] || return 0
  if [[ -f "$web_root/index.html" ]]; then
    $SUDO mkdir -p "$web_root/.previous"
    $SUDO cp -a "$web_root/index.html" "$web_root/.previous/index.html"
    if [[ -d "$web_root/assets" ]]; then
      $SUDO rm -rf "$web_root/.previous/assets"
      $SUDO cp -a "$web_root/assets" "$web_root/.previous/assets"
    fi
  fi
}

# ─── 1. Build the frontend (Vite) ─────────────────────────────────────
if [[ "${1:-}" != "" && -f "${1}" ]]; then
  # Legacy mode: deploy a single index.html file directly.
  LEGACY_SRC="$1"
  echo "Legacy mode: deploying single file $LEGACY_SRC"
  backup_previous "$APP_WEB_ROOT"
  $SUDO install -m 644 -o www-data -g www-data "$LEGACY_SRC" "$APP_WEB_ROOT/index.html"
  SRC_DESC="$LEGACY_SRC"
  SRC_SIZE=$(stat -c%s "$LEGACY_SRC")
  SRC_MD5=$(md5sum "$LEGACY_SRC" | cut -d' ' -f1)
else
  # Production mode: build the Vite bundle and copy dist/* into the web root.
  echo "Building frontend (Vite)…"
  (cd "$FRONTEND_DIR" && npx vite build 2>&1 | tail -5)
  DIST_DIR="$FRONTEND_DIR/dist"

  if [[ ! -f "$DIST_DIR/index.html" ]]; then
    echo "ERROR: Vite build did not produce $DIST_DIR/index.html" >&2
    exit 1
  fi

  # Snapshot the previous bundle so the operator can roll back with
  # `sudo cp -a /var/www/app.topodrive.top/.previous/* /var/www/app.topodrive.top/`
  # if the new build has a regression.
  backup_previous "$APP_WEB_ROOT"

  # Wipe + copy the bundle (index.html + assets/) so we don't leave
  # stale hash-named JS files behind after a code change.
  $SUDO rm -rf "$APP_WEB_ROOT/assets"
  $SUDO install -m 644 -o www-data -g www-data "$DIST_DIR/index.html" "$APP_WEB_ROOT/index.html"
  $SUDO mkdir -p "$APP_WEB_ROOT/assets"
  $SUDO install -m 644 -o www-data -g www-data "$DIST_DIR"/assets/* "$APP_WEB_ROOT/assets/"

  SRC_DESC="vite build → $APP_WEB_ROOT/"
  SRC_SIZE=$(stat -c%s "$APP_WEB_ROOT/index.html")
  SRC_MD5=$(md5sum "$APP_WEB_ROOT/index.html" | cut -d' ' -f1)
fi

# ─── 2. Marketing site (topodrive.top) ───────────────────────────────
SITE_DIR="/home/ubuntu/Socrates/site"
if [ -d "$SITE_DIR" ]; then
  backup_previous "$SITE_WEB_ROOT"
  $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/base.css" "$SITE_WEB_ROOT/base.css"
  $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/index.html" "$SITE_WEB_ROOT/index.html"
  for page in pricing guide about contact terms privacy account api-keys profile checkout; do
    $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/$page.html" "$SITE_WEB_ROOT/$page.html"
  done
  if [ -d "$SITE_DIR/zh" ]; then
    $SUDO mkdir -p "$SITE_WEB_ROOT/zh"
    for page in index pricing guide about contact terms privacy checkout account api-keys profile; do
      if [ -f "$SITE_DIR/zh/$page.html" ]; then
        $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/zh/$page.html" "$SITE_WEB_ROOT/zh/$page.html"
      fi
    done
  fi
fi

# ─── 3. Validate nginx + reload ──────────────────────────────────────
if ! $SUDO nginx -t >/dev/null 2>&1; then
  echo "WARNING: nginx config test failed (not related to file copy)" >&2
fi

if $SUDO nginx -s reload >/dev/null 2>&1; then
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
echo "  rollback (if needed): sudo cp -a $APP_WEB_ROOT/.previous/* $APP_WEB_ROOT/"
