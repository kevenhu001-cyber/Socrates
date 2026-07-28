#!/usr/bin/env bash
# deploy.sh — sync local source to topodrive.top web root + restart backend
# Usage:  ./deploy.sh                      # build frontend + deploy everything
#   or:   ./deploy.sh /path/to/index.html  # legacy: deploy a single SPA file
#
# Production path: app.topodrive.top is served from
# /var/www/app.topodrive.top/. The frontend/ project bundles with Vite
# to frontend/dist/, and we copy the bundle into that web root.

set -Eeuo pipefail

FRONTEND_DIR="/home/ubuntu/User/Socrates/frontend"
SERVER_DIR="/home/ubuntu/User/Socrates/server"
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

# Build the backend into a candidate directory and only swap it into place
# immediately before restart. Keep one known-good dist tree for rollback.
BACKEND_DIST="$SERVER_DIR/dist"
BACKEND_PREVIOUS="$SERVER_DIR/dist.previous"
BACKEND_CANDIDATE=""
BACKEND_SWAPPED=0

cleanup_backend_candidate() {
  case "${BACKEND_CANDIDATE:-}" in
    "$SERVER_DIR"/.dist-next.*)
      rm -rf -- "$BACKEND_CANDIDATE"
      ;;
  esac
}
trap cleanup_backend_candidate EXIT

rollback_backend() {
  if [[ "$BACKEND_SWAPPED" != "1" ]]; then
    return 0
  fi
  if [[ ! -d "$BACKEND_PREVIOUS" ]]; then
    echo "WARNING: no previous backend build is available for automatic rollback" >&2
    return 0
  fi

  local failed_dist="$SERVER_DIR/dist.failed.$(date +%s).$$"
  if [[ -d "$BACKEND_DIST" ]]; then
    mv "$BACKEND_DIST" "$failed_dist"
  fi
  mv "$BACKEND_PREVIOUS" "$BACKEND_DIST"
  BACKEND_SWAPPED=0

  echo "Restored previous backend build; stopping+starting socrates-api…" >&2
  $SUDO systemctl stop socrates-api 2>/dev/null || true
  if ! $SUDO systemctl start socrates-api; then
    echo "ERROR: previous backend build was restored but failed to start" >&2
  fi
}

handle_deploy_error() {
  local exit_code=$?
  trap - ERR
  rollback_backend
  exit "$exit_code"
}
trap handle_deploy_error ERR

# Dependencies are part of the release input. In particular, the TypeScript
# migration adds build-only tooling that will not exist in an older checkout.
echo "Installing backend dependencies from package-lock.json…"
(cd "$SERVER_DIR" && npm ci --include=dev)

BACKEND_CANDIDATE=$(mktemp -d "$SERVER_DIR/.dist-next.XXXXXX")
echo "Building backend candidate (TypeScript)…"
(cd "$SERVER_DIR" && ./node_modules/.bin/tsc -p tsconfig.build.json --outDir "$BACKEND_CANDIDATE")
if [[ ! -f "$BACKEND_CANDIDATE/index.runtime.js" ]]; then
  echo "ERROR: backend build did not produce index.runtime.js" >&2
  exit 1
fi

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
  echo "Installing frontend dependencies from package-lock.json…"
  (cd "$FRONTEND_DIR" && npm ci --include=dev)
  echo "Building frontend (Vite)…"
  (cd "$FRONTEND_DIR" && npm run build 2>&1 | tail -5)
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

  # Copy static files from Vite's public/ directory (logo, favicon, etc.)
  for f in "$DIST_DIR"/*; do
    [[ -f "$f" ]] || continue
    fname=$(basename "$f")
    [[ "$fname" == "index.html" ]] && continue
    $SUDO install -m 644 -o www-data -g www-data "$f" "$APP_WEB_ROOT/$fname"
  done

  SRC_DESC="vite build → $APP_WEB_ROOT/"
  SRC_SIZE=$(stat -c%s "$APP_WEB_ROOT/index.html")
  SRC_MD5=$(md5sum "$APP_WEB_ROOT/index.html" | cut -d' ' -f1)
fi

# ─── 2. Marketing site (topodrive.top) ───────────────────────────────
SITE_DIR="/home/ubuntu/User/Socrates/site"
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
  # Static assets — logo.png, favicon.png, og-*.png, etc.
  while IFS= read -r -d '' asset; do
    fname=$(basename "$asset")
    case "$fname" in
      *.png|*.ico|*.svg|*.jpg|*.jpeg|*.webp|*.gif|*.woff|*.woff2) ;;
      *) continue ;;
    esac
    $SUDO install -m 644 -o www-data -g www-data "$asset" "$SITE_WEB_ROOT/$fname"
  done < <(find "$SITE_DIR" -maxdepth 1 -type f \
      ! -name '*.html' ! -name '*.css' ! -name '.*' ! -name '*~' \
      -print0)
fi

# ─── 2b. Status page (status.topodrive.top) ──────────────────────────
# Uses a versioned filename (status.<TS>.html) so EdgeOne CDN sees a
# new URL on every deploy. nginx's try_files points directly to the
# versioned file — no symlink or status.html needed.
STATUS_DIR="/var/www/status.topodrive.top"
STATUS_SRC="/home/ubuntu/User/Socrates/server/src/status.html"
if [ -f "$STATUS_SRC" ]; then
  STATUS_TS=$(date +%s)
  STATUS_FILE="status.${STATUS_TS}.html"
  $SUDO install -m 644 -o www-data -g www-data "$STATUS_SRC" "$STATUS_DIR/$STATUS_FILE"
  # Update nginx try_files to point to the new versioned file
  $SUDO sed -ri "s|try_files /status\.[0-9]+\.html =404;|try_files /$STATUS_FILE =404;|" /etc/nginx/sites-available/status.topodrive.top
  echo "  status:  ${STATUS_FILE}"
fi

# ─── 3. Build swap: stop first to avoid race with systemd restart ─────
#
# Swapping dist/ while the service is running can cause the new process
# to observe a missing or partially-replaced dist/ directory.  Stop
# the unit first, swap the build tree, then start.
echo "Stopping backend service…"
$SUDO systemctl stop socrates-api 2>/dev/null || true

if [[ -d "$BACKEND_PREVIOUS" ]]; then
  rm -rf -- "$BACKEND_PREVIOUS"
fi
if [[ -d "$BACKEND_DIST" ]]; then
  mv "$BACKEND_DIST" "$BACKEND_PREVIOUS"
fi
mv "$BACKEND_CANDIDATE" "$BACKEND_DIST"
BACKEND_CANDIDATE=""
BACKEND_SWAPPED=1

echo "Starting backend via systemd…"
if ! $SUDO systemctl start socrates-api; then
  echo "ERROR: backend start failed; rolling back its compiled build" >&2
  rollback_backend
  exit 1
fi
# Give it a few seconds to bind, then check for startup errors.
sleep 5
if $SUDO systemctl is-active --quiet socrates-api; then
  echo "Backend running (PID $(systemctl show -p MainPID socrates-api --value))"
else
  echo "WARNING: backend failed to start — check 'sudo journalctl -u socrates-api -n 30'"
fi

# ─── 4. Validate nginx + reload ──────────────────────────────────────
if ! $SUDO nginx -t >/dev/null 2>&1; then
  echo "WARNING: nginx config test failed (not related to file copy)" >&2
fi

if $SUDO nginx -s reload >/dev/null 2>&1; then
  NGINX_STATUS="reloaded"
else
  NGINX_STATUS="RELOAD FAILED — files are in place but nginx did not pick them up; check 'sudo nginx -t' manually"
fi

# ─── 4.5. Post-deploy health gate ─────────────────────────────────────
# Verify what we just deployed is actually serving correctly. Catches
# silent regressions that earlier deploys missed (e.g. nginx proxy_pass
# pointing at a stale upstream port, copy step silently failing, etc).
# On any gate failure, the state file is left untouched so the last
# known-good deploy stays recorded, and the script exits non-zero.
GATE_FAILED=0
GATE_RESULTS=()

gate_check() {
  local label="$1" url="$2"; shift 2
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$@" "$url" || echo 000)
  if [[ "$code" =~ ^2 ]]; then
    GATE_RESULTS+=("  $label $code")
  else
    GATE_RESULTS+=("  $label $code  ← FAIL")
    echo "GATE FAIL: $label returned $code ($url)" >&2
    GATE_FAILED=1
  fi
}

# 4.5a. Frontend bundle integrity: md5 of just-built == md5 on disk.
if [[ -n "${DIST_DIR:-}" && -f "${DIST_DIR}/index.html" && -f "$APP_WEB_ROOT/index.html" ]]; then
  BUILT_MD5=$(md5sum "$DIST_DIR/index.html" | cut -d' ' -f1)
  DEPLOYED_MD5=$(md5sum "$APP_WEB_ROOT/index.html" | cut -d' ' -f1)
  if [[ "$BUILT_MD5" == "$DEPLOYED_MD5" ]]; then
    GATE_RESULTS+=("  bundle.md5 match ($DEPLOYED_MD5)")
  else
    echo "GATE FAIL: bundle md5 mismatch — built=$BUILT_MD5 deployed=$DEPLOYED_MD5" >&2
    GATE_FAILED=1
    GATE_RESULTS+=("  bundle.md5 MISMATCH  ← FAIL")
  fi
fi

# 4.5b. Public endpoints — catches nginx→wrong port, DNS/SSL/firewall issues.
gate_check "app.topodrive.top   " "https://app.topodrive.top/"
gate_check "topodrive.top       " "https://topodrive.top/"
gate_check "status.topodrive.top" "https://status.topodrive.top/"
gate_check "api.topodrive.top   " "https://api.topodrive.top/api/config"

# 4.5c. API JSON shape — catches nginx 200'ing an HTML error page from wrong upstream.
API_BODY=$(curl -sf --max-time 8 https://api.topodrive.top/api/config || true)
if [[ -n "$API_BODY" ]] && echo "$API_BODY" | jq -e . >/dev/null 2>&1; then
  GATE_RESULTS+=("  api.config JSON ok ($(echo "$API_BODY" | jq -c .))")
else
  echo "GATE FAIL: /api/config returned non-JSON or empty: ${API_BODY:0:120}" >&2
  GATE_FAILED=1
  GATE_RESULTS+=("  api.config INVALID  ← FAIL")
fi

# 4.5d. Direct backend port — disambiguates "nginx broken" vs "backend broken".
DIRECT_API=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3037/api/config || echo 000)
if [[ "$DIRECT_API" =~ ^2 ]]; then
  GATE_RESULTS+=("  backend:3037 $DIRECT_API")
else
  GATE_RESULTS+=("  backend:3037 $DIRECT_API  ← FAIL")
  echo "GATE FAIL: direct backend on :3037 returned $DIRECT_API" >&2
  GATE_FAILED=1
fi

# 4.5e. State file: update only on full success so last-known-good is preserved.
STATE_FILE="/home/ubuntu/User/Socrates/.deploy-state.json"
if [[ $GATE_FAILED -eq 0 ]]; then
  DEPLOY_COMMIT=$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse HEAD 2>/dev/null || echo unknown)
  DEPLOY_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  tmp=$(mktemp "${STATE_FILE}.XXXXXX.tmp")
  cat > "$tmp" <<EOF
{
  "lastSuccessfulDeploy": {
    "commit": "${DEPLOY_COMMIT}",
    "timestamp": "${DEPLOY_TS}",
    "frontendBundleMd5": "${DEPLOYED_MD5:-}",
    "frontendBundleSize": ${SRC_SIZE:-0},
    "srcDesc": "${SRC_DESC:-}",
    "checks": {
      "frontendReachable": true,
      "siteReachable": true,
      "statusReachable": true,
      "apiReachable": true,
      "apiConfigJsonValid": true,
      "backendDirectReachable": true,
      "bundleMd5Integrity": true,
      "nginxReloaded": $([ "$NGINX_STATUS" = "reloaded" ] && echo true || echo false)
    }
  }
}
EOF
  mv "$tmp" "$STATE_FILE"
  GATE_RESULTS+=("  state: $STATE_FILE updated")
else
  rollback_backend
  GATE_RESULTS+=("  state: NOT updated (gate failed — last known-good preserved)")
fi

# ─── 5. Report ────────────────────────────────────────────────────────
if [[ $GATE_FAILED -eq 0 ]]; then
  echo "✓ $SRC_DESC"
  echo "  size:    ${SRC_SIZE:-?} bytes"
  echo "  md5:     ${SRC_MD5:-?}"
  echo "  nginx:   $NGINX_STATUS"
  echo "─── gate ───"
  printf '%s\n' "${GATE_RESULTS[@]}"
  echo "────────────"
  echo "  frontend rollback: sudo cp -a $APP_WEB_ROOT/.previous/* $APP_WEB_ROOT/"
  echo "  backend rollback build: $BACKEND_PREVIOUS"
else
  echo "✗ DEPLOY GATE FAILED ($GATE_FAILED check(s))" >&2
  echo "─── gate ───"
  printf '%s\n' "${GATE_RESULTS[@]}" >&2
  echo "────────────" >&2
  echo "The previous bundle is preserved at $APP_WEB_ROOT/.previous/" >&2
  echo "The backend build was restored automatically when a previous build was available." >&2
  echo "To restore the frontend: sudo cp -a $APP_WEB_ROOT/.previous/* $APP_WEB_ROOT/" >&2
  echo "State file $STATE_FILE was NOT updated — last known-good deploy is still recorded there." >&2
  exit 1
fi
