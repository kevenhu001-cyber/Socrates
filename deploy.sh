#!/usr/bin/env bash
# deploy.sh — sync local source to topodrive.top web root + restart backend
# Usage:  ./deploy.sh                      # build frontend + deploy everything
#   or:   ./deploy.sh /path/to/index.html  # legacy: deploy a single SPA file
#
# Production path: app.topodrive.top is served from
# /var/www/app.topodrive.top/. The frontend/ project bundles with Vite
# to frontend/dist/, and we copy the bundle into that web root.

set -Eeuo pipefail

FRONTEND_DIR="${FRONTEND_DIR:-/home/ubuntu/User/Socrates/frontend}"
SERVER_DIR="${SERVER_DIR:-/home/ubuntu/User/Socrates/server}"
APP_WEB_ROOT="${APP_WEB_ROOT:-/var/www/app.topodrive.top}"
SITE_WEB_ROOT="${SITE_WEB_ROOT:-/var/www/topodrive.top}"
SITE_DIR="${SITE_DIR:-/home/ubuntu/User/Socrates/site}"
STATUS_DIR="${STATUS_DIR:-/var/www/status.topodrive.top}"
APP_PUBLIC_URL="${APP_PUBLIC_URL:-https://app.topodrive.top}"
SITE_PUBLIC_URL="${SITE_PUBLIC_URL:-https://topodrive.top}"
STATUS_PUBLIC_URL="${STATUS_PUBLIC_URL:-https://status.topodrive.top}"
# The Expo shell, responsive SPA, and backend deliberately share one origin.
# `/api/v2` is the cache-bypass prefix used by both mobile and frontend; nginx
# or Express rewrites it to the canonical `/api` routes internally.
MOBILE_API_BASE_URL="${MOBILE_API_BASE_URL:-${APP_PUBLIC_URL%/}/api/v2}"
NGINX_SITE_CONF="${NGINX_SITE_CONF:-/etc/nginx/sites-available/status.topodrive.top}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-${XDG_RUNTIME_DIR:-/tmp}/socrates-deploy.lock}"
STATE_FILE="${STATE_FILE:-/home/ubuntu/User/Socrates/.deploy-state.json}"
# P_build-heap — the legacy 4 GB ceiling was needed because Rollup walked
# mermaid's 38 lazy diagram imports + cytoscape/fcose/dagre, 4 echarts
# sub-modules + zrender, and the 4.85 MB plotly bundle. With those three
# heavy viz libs moved to the CDN (window.mermaid / window.echarts /
# window.Plotly), the module count dropped from ~3,700 to ~1,100 and
# the build fits comfortably in 1 GB. Keep this override configurable for
# smaller or larger deployment hosts.
FRONTEND_NODE_OPTIONS="${FRONTEND_NODE_OPTIONS:---max-old-space-size=1024}"

if ! command -v flock >/dev/null 2>&1; then
  echo "ERROR: flock is required to serialize deployments" >&2
  exit 1
fi
mkdir -p "$(dirname "$DEPLOY_LOCK_FILE")"
exec 9>"$DEPLOY_LOCK_FILE"
if ! flock -n 9; then
  echo "ERROR: another Socrates deploy is already in progress ($DEPLOY_LOCK_FILE)" >&2
  exit 1
fi

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

# npm itself runs without sudo, but older deployments may have left tens of
# thousands of root-owned files under node_modules. npm ci removes and
# recreates entries, so even one such file can fail the release with EACCES.
# Repair only when residue is actually present, and return ownership to the
# account running this deployment rather than hard-coding a host user.
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$(id -un)}}"
DEPLOY_GROUP="${DEPLOY_GROUP:-$(id -gn "$DEPLOY_USER")}"
repair_node_modules_ownership() {
  local project_dir="$1"
  local modules_dir="$project_dir/node_modules"
  [[ -d "$modules_dir" ]] || return 0
  [[ "$DEPLOY_USER" != "root" ]] || return 0
  if find "$modules_dir" -xdev -user root -print -quit 2>/dev/null | grep -q .; then
    echo "Repairing root-owned dependency files in $modules_dir…"
    $SUDO chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$modules_dir"
  fi
}

repair_node_modules_ownership "$SERVER_DIR"
repair_node_modules_ownership "$FRONTEND_DIR"

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

# ─── 0.5. Memory pressure mitigation ─────────────────────────────────
# Stop the running backend before the heavy frontend build so both
# don't contend for the same ~3.7 GB of RAM.  Vite + Rollup needs up
# to 1 GB just to tree-shake the large visualization libs (plotly,
# mermaid, echarts, three.js).  Stopping the backend first frees its
# ~130 MB resident set; the existing stop/start below becomes a no-op
# until the dist-swap phase. The frontend build also receives an explicit
# 4 GB V8 old-space ceiling; it is a limit, not an up-front allocation.
echo "Stopping backend before frontend build (freeing ~130 MB RSS)…"
$SUDO systemctl stop socrates-api 2>/dev/null || true

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
  (cd "$FRONTEND_DIR" && NODE_OPTIONS="$FRONTEND_NODE_OPTIONS" npm run build 2>&1 | tail -20)
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
  # Copy top-level asset files only. install(1) returns non-zero when its
  # source list contains a directory ("omitting directory"), which under
  # `set -e` aborted the whole deploy mid-copy; nested subdirectories are
  # handled by the recursive loop below.
  while IFS= read -r -d '' asset_file; do
    $SUDO install -m 644 -o www-data -g www-data "$asset_file" "$APP_WEB_ROOT/assets/"
  done < <(find "$DIST_DIR/assets" -maxdepth 1 -type f -print0)

  # Copy nested asset subdirectories (e.g. KaTeX fonts under assets/fonts/)
  # so relative url(fonts/…) references in vendored CSS resolve in the
  # web root too.
  while IFS= read -r -d '' nested_asset; do
    rel="${nested_asset#"$DIST_DIR/assets/"}"
    $SUDO mkdir -p "$APP_WEB_ROOT/assets/$(dirname "$rel")"
    $SUDO install -m 644 -o www-data -g www-data "$nested_asset" "$APP_WEB_ROOT/assets/$rel"
  done < <(find "$DIST_DIR/assets" -mindepth 2 -type f -print0)

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
if [ -d "$SITE_DIR" ]; then
  backup_previous "$SITE_WEB_ROOT"
  $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/base.css" "$SITE_WEB_ROOT/base.css"
  $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/index.html" "$SITE_WEB_ROOT/index.html"
  for page in pricing guide about contact terms privacy account api-keys profile checkout announcements documents learn principles product research; do
    if [ -f "$SITE_DIR/$page.html" ]; then
      $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/$page.html" "$SITE_WEB_ROOT/$page.html"
    fi
  done
  if [ -d "$SITE_DIR/zh" ]; then
    $SUDO mkdir -p "$SITE_WEB_ROOT/zh"
    for page in index pricing guide about contact terms privacy checkout account api-keys profile announcements documents learn principles product research; do
      if [ -f "$SITE_DIR/zh/$page.html" ]; then
        $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/zh/$page.html" "$SITE_WEB_ROOT/zh/$page.html"
      fi
    done
  fi
  # Static assets — images, fonts, and sibling .css/.js the marketing pages
  # reference. Files explicitly copied above are excluded by name so the
  # hard-coded install commands remain the source of truth for those.
  # llms.txt / *.md / *.xml / *.json / *.jsonl are also installed so the
  # site root gains a sitemap, an llms.txt, an OpenAPI reference, and a
  # Markdown twin for agents that prefer non-HTML representations.
  while IFS= read -r -d '' asset; do
    fname=$(basename "$asset")
    case "$fname" in
      *.png|*.ico|*.svg|*.jpg|*.jpeg|*.webp|*.gif|*.woff|*.woff2|*.css|*.js|*.md|*.txt|*.xml|*.json|*.jsonl) ;;
      *) continue ;;
    esac
    # Never overwrite any HTML or the editorial base stylesheet from this loop.
    case "$fname" in
      *.html|base.css) continue ;;
    esac
    $SUDO install -m 644 -o www-data -g www-data "$asset" "$SITE_WEB_ROOT/$fname"
  done < <(find "$SITE_DIR" -maxdepth 1 -type f \
      ! -name '*.html' \
      ! -name 'base.css' \
      ! -name '.*' \
      ! -name '*~' \
      -print0)

  # Markdown side-cars for the HTML pages ship beside the HTML files
  # (e.g. site/pricing.md alongside site/pricing.html). The wildcard
  # loop above only copies top-level files; mirror a parallel tree of
  # .md twins so every page that has one is reachable as <page>.md.
  while IFS= read -r -d '' md_src; do
    rel="${md_src#"$SITE_DIR/"}"
    $SUDO mkdir -p "$SITE_WEB_ROOT/$(dirname "$rel")"
    $SUDO install -m 644 -o www-data -g www-data "$md_src" "$SITE_WEB_ROOT/$rel"
  done < <(find "$SITE_DIR" -type f -name '*.md' \
      ! -path '*/.git/*' \
      -print0)

  # /.well-known/* discovery files (agent-card, api-catalog, security.txt…)
  if [ -d "$SITE_DIR/.well-known" ]; then
    while IFS= read -r -d '' well_known; do
      rel="${well_known#"$SITE_DIR/"}"
      $SUDO mkdir -p "$SITE_WEB_ROOT/$(dirname "$rel")"
      $SUDO install -m 644 -o www-data -g www-data "$well_known" "$SITE_WEB_ROOT/$rel"
    done < <(find "$SITE_DIR/.well-known" -type f -print0)
  fi

  # Copy site/media/ directory (editorial images referenced by new pages)
  if [ -d "$SITE_DIR/media" ]; then
    $SUDO mkdir -p "$SITE_WEB_ROOT/media"
    $SUDO cp -a "$SITE_DIR/media/"* "$SITE_WEB_ROOT/media/"
  fi

  # Copy article subdirectories (research/, learn/, etc.) so each
  # essay/guide page is reachable as /research/<slug>/. nginx's
  # try_files already falls back to index.html inside the directory.
  # `developers`, `api`, and `auth` are also included so their
  # llms.txt indexes (and any future siblings) get copied automatically.
  for sub in research learn announcements guides posts articles developers api auth; do
    if [ -d "$SITE_DIR/$sub" ]; then
      $SUDO mkdir -p "$SITE_WEB_ROOT/$sub"
      $SUDO cp -a "$SITE_DIR/$sub/." "$SITE_WEB_ROOT/$sub/"
    fi
  done

  # Copy translated article subdirectories as well. These live below
  # site/zh/ and must mirror the English directory layout on the public site.
  for sub in research learn announcements guides posts articles developers api auth; do
    if [ -d "$SITE_DIR/zh/$sub" ]; then
      $SUDO mkdir -p "$SITE_WEB_ROOT/zh/$sub"
      $SUDO cp -a "$SITE_DIR/zh/$sub/." "$SITE_WEB_ROOT/zh/$sub/"
    fi
  done
fi

# ─── 2b. Status page (status.topodrive.top) ──────────────────────────
# Uses a versioned filename (status.<TS>.html) so EdgeOne CDN sees a
# new URL on every deploy. nginx's try_files points directly to the
# versioned file — no symlink or status.html needed.
STATUS_SRC="$SERVER_DIR/src/status.html"
if [ -f "$STATUS_SRC" ]; then
  STATUS_TS=$(date +%s)
  STATUS_FILE="status.${STATUS_TS}.html"
  $SUDO install -m 644 -o www-data -g www-data "$STATUS_SRC" "$STATUS_DIR/$STATUS_FILE"
  # Update nginx try_files to point to the new versioned file
  $SUDO sed -ri "s|try_files /status\.[0-9]+\.html =404;|try_files /$STATUS_FILE =404;|" "$NGINX_SITE_CONF"
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
# The candidate was produced by tsc under sudo, so it lands as root:root.
# The systemd unit runs as User=ubuntu and would otherwise get
# ERR_MODULE_NOT_FOUND on dist/index.runtime.js because the directory
# is untraversable. Re-own to the service user before starting.
$SUDO chown -R ubuntu:ubuntu "$BACKEND_DIST"

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
gate_check "app frontend        " "${APP_PUBLIC_URL%/}/"
gate_check "marketing site      " "${SITE_PUBLIC_URL%/}/"
gate_check "status page         " "${STATUS_PUBLIC_URL%/}/"

# 4.5c. Mobile bootstrap contract through the exact public `/api/v2` path the
# APK and SPA use. This catches stale nginx rewrites, a mismatched APP_URL in
# the systemd environment, or a mobile build pointing at a different origin.
MOBILE_BOOTSTRAP_URL="${MOBILE_API_BASE_URL%/}/mobile/bootstrap"
MOBILE_BOOTSTRAP_BODY=$(curl -sf --max-time 8 "$MOBILE_BOOTSTRAP_URL" || true)
EXPECTED_WEB_BASE_URL="${APP_PUBLIC_URL%/}"
EXPECTED_MOBILE_API_BASE_URL="${MOBILE_API_BASE_URL%/}"
EXPECTED_CANONICAL_API_BASE_URL="${EXPECTED_WEB_BASE_URL}/api"
if [[ -n "$MOBILE_BOOTSTRAP_BODY" ]] && echo "$MOBILE_BOOTSTRAP_BODY" | jq -e \
  --arg web "$EXPECTED_WEB_BASE_URL" \
  --arg api "$EXPECTED_MOBILE_API_BASE_URL" \
  --arg canonical "$EXPECTED_CANONICAL_API_BASE_URL" \
  '.ok == true and .contractVersion == 1 and .webBaseUrl == $web and .apiBaseUrl == $api and .canonicalApiBaseUrl == $canonical and .healthPath == "/api/v2/health"' \
  >/dev/null 2>&1; then
  GATE_RESULTS+=("  mobile.bootstrap contract v1 aligned")
else
  echo "GATE FAIL: mobile bootstrap is missing or misaligned ($MOBILE_BOOTSTRAP_URL)" >&2
  GATE_FAILED=1
  GATE_RESULTS+=("  mobile.bootstrap MISALIGNED  ← FAIL")
fi

# Unlike /api/config, /api/health also checks PostgreSQL. Reach it through the
# public versioned prefix so an APK cannot pass deployment while nginx or the
# database path it actually uses is broken.
gate_check "mobile api + db     " "${MOBILE_API_BASE_URL%/}/health"

# 4.5c-2. Phase D — the RFC 8414 discovery document must be live on BOTH
# hosts: static copy on the marketing origin (orank probes this URL) and the
# dynamic Express route on the app origin (real OAuth clients discover here).
# A missing file or a dead proxy turns agent discovery into an HTML 404.
OAUTH_AS_URL="${SITE_PUBLIC_URL%/}/.well-known/oauth-authorization-server"
OAUTH_AS_BODY=$(curl -sf --max-time 8 "$OAUTH_AS_URL" || true)
if [[ -n "$OAUTH_AS_BODY" ]] && echo "$OAUTH_AS_BODY" | jq -e \
  --arg issuer "${APP_PUBLIC_URL%/}/api/oauth" \
  '.issuer == $issuer and (.scopes_supported | length >= 10) and .token_endpoint != null' \
  >/dev/null 2>&1; then
  GATE_RESULTS+=("  oauth-authorization-server metadata ok")
else
  echo "GATE FAIL: oauth AS metadata missing/misaligned ($OAUTH_AS_URL)" >&2
  GATE_FAILED=1
  GATE_RESULTS+=("  oauth AS metadata MISSING     ← FAIL")
fi

# 4.5d. API JSON shape via direct backend port — catches nginx 200'ing
# an HTML error page from wrong upstream. Previously went through the
# now-retired api.topodrive.top virtual host; check the same upstream
# (127.0.0.1:3037) directly instead.
API_BODY=$(curl -sf --max-time 5 http://localhost:3037/api/config || true)
if [[ -n "$API_BODY" ]] && echo "$API_BODY" | jq -e . >/dev/null 2>&1; then
  GATE_RESULTS+=("  api.config JSON ok ($(echo "$API_BODY" | jq -c .))")
else
  echo "GATE FAIL: /api/config returned non-JSON or empty: ${API_BODY:0:120}" >&2
  GATE_FAILED=1
  GATE_RESULTS+=("  api.config INVALID  ← FAIL")
fi

# 4.5e. Direct backend port — disambiguates "nginx broken" vs "backend broken".
DIRECT_API=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3037/api/config || echo 000)
if [[ "$DIRECT_API" =~ ^2 ]]; then
  GATE_RESULTS+=("  backend:3037 $DIRECT_API")
else
  GATE_RESULTS+=("  backend:3037 $DIRECT_API  ← FAIL")
  echo "GATE FAIL: direct backend on :3037 returned $DIRECT_API" >&2
  GATE_FAILED=1
fi

# 4.5f. State file: update only on full success so last-known-good is preserved.
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
      "mobileBootstrapAligned": true,
      "mobileApiDatabaseReachable": true,
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
