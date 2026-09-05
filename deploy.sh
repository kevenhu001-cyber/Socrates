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
NGINX_APP_CONF="${NGINX_APP_CONF:-/etc/nginx/sites-available/app.topodrive.top}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-${XDG_RUNTIME_DIR:-/tmp}/socrates-deploy.lock}"
STATE_FILE="${STATE_FILE:-/home/ubuntu/User/Socrates/.deploy-state.json}"

# The app nginx config is normally a symlink from sites-enabled to
# sites-available, but older hosts have used a copied file instead. Keep the
# active config and its source config aligned when both exist.
APP_NGINX_CONFIGS=("$NGINX_APP_CONF")
APP_ENABLED_CONF="/etc/nginx/sites-enabled/$(basename "$NGINX_APP_CONF")"
APP_CONF_REAL=$(readlink -f "$NGINX_APP_CONF" 2>/dev/null || echo "$NGINX_APP_CONF")
APP_ENABLED_CONF_REAL=$(readlink -f "$APP_ENABLED_CONF" 2>/dev/null || echo "$APP_ENABLED_CONF")
if [[ "$APP_ENABLED_CONF" != "$NGINX_APP_CONF" && -f "$APP_ENABLED_CONF" && "$APP_ENABLED_CONF_REAL" != "$APP_CONF_REAL" ]]; then
  APP_NGINX_CONFIGS+=("$APP_ENABLED_CONF")
fi
# P_build-heap — the legacy 4 GB ceiling was needed because Rollup walked
# mermaid's 38 lazy diagram imports + cytoscape/fcose/dagre, 4 echarts
# sub-modules + zrender, and the 4.85 MB plotly bundle. With those three
# heavy viz libs moved to the CDN (window.mermaid / window.echarts /
# window.Plotly), the module count dropped from ~3,700 to ~1,100 and
# the build fits comfortably in 1 GB. Keep this override configurable for
# smaller or larger deployment hosts.
FRONTEND_NODE_OPTIONS="${FRONTEND_NODE_OPTIONS:---max-old-space-size=1024}"

# ─── Codex harness (embedded agent runtime) ─────────────────────────
# CODEX_ENABLED=0 skips binary install + systemd drop-in + gates.
# The install itself is idempotent and version-pinned; bump CODEX_VERSION
# to upgrade the embedded codex-app-server package.
CODEX_ENABLED="${CODEX_ENABLED:-1}"
CODEX_VERSION="${CODEX_VERSION:-0.149.1}"
CODEX_INSTALL_DIR="${CODEX_INSTALL_DIR:-/opt/socrates-codex}"
CODEX_HOME="${CODEX_HOME:-/var/lib/socrates-codex}"
CODEX_DROPIN="${CODEX_DROPIN:-/etc/systemd/system/socrates-api.service.d/codex.conf}"

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

# Backup previous deployment so a bad build can be reverted. The
# .previous/ folder holds the prior filename + content pair so a
# rollback restores the exact bundle the previous deploy shipped
# (matching the nginx try_files sed target).
#
# For the SPA (app.topodrive.top) the active file is a versioned
# `index.<TS>.html` written by this deploy script; the previous
# filename will differ. We copy every `index.*.html` in the webroot
# to .previous/ using its existing name so the rollback path
# `cp -a .previous/index.<old-ts>.html .` followed by `sed` to
# repoint nginx try_files is symmetric with the deploy path.
backup_previous() {
  local web_root="$1"
  [[ -d "$web_root" ]] || return 0
  $SUDO mkdir -p "$web_root/.previous"
  # Stable-name files (e.g. /var/www/topodrive.top/index.html) copy as
  # themselves; versioned files (index.<TS>.html) keep their timestamp.
  for f in "$web_root"/index*.html "$web_root"/status*.html; do
    [[ -f "$f" ]] || continue
    $SUDO cp -a "$f" "$web_root/.previous/$(basename "$f")"
  done
  if [[ -d "$web_root/assets" ]]; then
    $SUDO rm -rf "$web_root/.previous/assets"
    $SUDO cp -a "$web_root/assets" "$web_root/.previous/assets"
  fi
}

# Point the SPA fallback at the exact entry written by this deploy. Older
# versions only replaced the /__APP_INDEX__ placeholder, so the first
# versioned deploy permanently pinned nginx to that one filename. Also remove
# the $uri/ directory candidate: when the web root has no stable index.html,
# a request for / matches the directory and nginx returns 403 instead of the
# versioned SPA entry.
set_app_index_target() {
  local app_file="$1"
  local conf
  local found=0
  local app_fallback_expr

  app_fallback_expr='s#^([[:space:]]*try_files[[:space:]]+)\$uri([[:space:]]+\$uri/)?[[:space:]]+/(__APP_INDEX__|index\.[0-9]+\.html);[[:space:]]*$#\1\$uri /'"$app_file"';#'

  for conf in "${APP_NGINX_CONFIGS[@]}"; do
    [[ -f "$conf" ]] || continue
    if ! $SUDO grep -Eq \
      '^[[:space:]]*try_files[[:space:]]+\$uri([[:space:]]+\$uri/)?[[:space:]]+/(__APP_INDEX__|index\.[0-9]+\.html);[[:space:]]*$' \
      "$conf"; then
      continue
    fi

    found=1
    $SUDO sed -E -i "$app_fallback_expr" "$conf"

    if ! $SUDO grep -Fq "try_files \$uri /$app_file;" "$conf"; then
      echo "ERROR: nginx SPA fallback was not updated in $conf" >&2
      return 1
    fi
  done

  if [[ "$found" != "1" ]]; then
    echo "ERROR: no managed SPA fallback found in nginx app config(s): ${APP_NGINX_CONFIGS[*]}" >&2
    echo "       Expected try_files \$uri [\$uri/] /__APP_INDEX__ or /index.<timestamp>.html" >&2
    return 1
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

# ─── 0.4. Database migrations ─────────────────────────────────────────
# The backend code expects columns / tables that only exist after the
# matching Drizzle migration has run. Without this step, the running
# API throws `Failed query: column "..." does not exist` on every
# request that touches a freshly-added schema surface (sessions POST,
# scheduled_tasks poll, agent_runs restart, etc.) and the SPA surfaces
# it as a 500 with the error stack in journalctl.
#
# We run migrations AFTER the backend npm ci (tsx needs the runtime
# deps) but BEFORE stopping the live service. The script invokes
# `db:migrate`, which uses `drizzle-orm/node-postgres/migrator` and
# is idempotent — already-applied migrations (matching hash +
# created_at in drizzle.__drizzle_migrations) are skipped silently.
#
# Skip with SKIP_DB_MIGRATE=1 if the operator already ran migrations
# out-of-band (e.g. a manual `psql` patch). Default is to migrate.
if [[ "${SKIP_DB_MIGRATE:-0}" != "1" ]]; then
  echo "Running database migrations…"
  if ! (cd "$SERVER_DIR" && npm run db:migrate); then
    echo "ERROR: database migration failed; aborting deploy before swap" >&2
    echo "  → fix the migration error and re-run, or set SKIP_DB_MIGRATE=1 if the schema is already current" >&2
    exit 1
  fi
fi

# ─── 0.4b. Post-migration schema gate ───────────────────────────────
# db:migrate skips already-applied migrations silently, which also hides
# a migration that was never registered in drizzle/meta/_journal.json.
# Verify the relations the current backend requires (tts_results,
# session_chunks, embedding_config) BEFORE stopping the live service.
# Skip with SKIP_SCHEMA_VERIFY=1 only when the operator has verified
# the schema out-of-band.
if [[ "${SKIP_SCHEMA_VERIFY:-0}" != "1" ]]; then
  echo "Verifying deployed schema…"
  if ! (cd "$SERVER_DIR" && npx tsx scripts/verify-deploy-schema.ts); then
    echo "ERROR: schema verification failed; aborting deploy before swap" >&2
    echo "  → register the missing migration in server/drizzle/meta/_journal.json and re-run," >&2
    echo "    or set SKIP_SCHEMA_VERIFY=1 if the schema was verified out-of-band" >&2
    exit 1
  fi
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
  # Legacy mode: deploy a single index.html file directly. Mirror the
  # production-mode versioning so the nginx try_files sentinel can be
  # rewritten to a real filename even in this path.
  LEGACY_SRC="$1"
  echo "Legacy mode: deploying single file $LEGACY_SRC"
  backup_previous "$APP_WEB_ROOT"
  APP_TS=$(date +%s)
  APP_FILE="index.${APP_TS}.html"
  while [[ -e "$APP_WEB_ROOT/$APP_FILE" ]]; do
    APP_TS=$((APP_TS + 1))
    APP_FILE="index.${APP_TS}.html"
  done
  $SUDO install -m 644 -o www-data -g www-data "$LEGACY_SRC" "$APP_WEB_ROOT/$APP_FILE"
  set_app_index_target "$APP_FILE"
  SRC_DESC="$LEGACY_SRC"
  SRC_SIZE=$(stat -c%s "$APP_WEB_ROOT/$APP_FILE")
  SRC_MD5=$(md5sum "$APP_WEB_ROOT/$APP_FILE" | cut -d' ' -f1)
  SRC_SHA256=$(sha256sum "$APP_WEB_ROOT/$APP_FILE" | cut -d' ' -f1)
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

  # The /admin operator console ships inside the SPA bundle
  # (#adminPanel in index.html + the AdminPage island). If the marker
  # is missing, the build predates the admin console or the page was
  # dropped — abort before the bundle reaches the web root.
  if ! grep -q "adminPanel" "$DIST_DIR/index.html"; then
    echo "ERROR: built bundle has no admin console entry (#adminPanel missing from dist/index.html)" >&2
    exit 1
  fi

  # Snapshot the previous bundle (filename + content) so a rollback can
  # restore the exact prior version. See the rollback block at the end
  # of this script for the restore + nginx re-point sequence.
  backup_previous "$APP_WEB_ROOT"

  # Versioned SPA entry. Writes the freshly-built index.html to
  # `index.<TS>.html` (timestamp seconds since epoch) so each deploy
  # gets a fresh CDN cache key on the SPA HTML response, and so the
  # nginx SPA fallback below is rewritten to point at exactly this file.
  # The managed fallback pattern in $NGINX_APP_CONF must exist as a unique
  # line — see set_app_index_target for the migration-safe rewrite.
  APP_TS=$(date +%s)
  APP_FILE="index.${APP_TS}.html"
  while [[ -e "$APP_WEB_ROOT/$APP_FILE" ]]; do
    APP_TS=$((APP_TS + 1))
    APP_FILE="index.${APP_TS}.html"
  done

  # Wipe + copy the bundle (versioned index.<TS>.html + assets/) so we
  # don't leave stale hash-named JS files behind after a code change.
  $SUDO rm -rf "$APP_WEB_ROOT/assets"
  $SUDO install -m 644 -o www-data -g www-data "$DIST_DIR/index.html" "$APP_WEB_ROOT/$APP_FILE"
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

  # Repoint the nginx SPA fallback at the freshly deployed versioned file.
  # This handles both the initial placeholder and a previous timestamp, and
  # also keeps copied sites-enabled configs in sync with sites-available.
  set_app_index_target "$APP_FILE"

  SRC_DESC="vite build → $APP_WEB_ROOT/$APP_FILE"
  SRC_SIZE=$(stat -c%s "$APP_WEB_ROOT/$APP_FILE")
  SRC_MD5=$(md5sum "$APP_WEB_ROOT/$APP_FILE" | cut -d' ' -f1)
  SRC_SHA256=$(sha256sum "$APP_WEB_ROOT/$APP_FILE" | cut -d' ' -f1)
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

# ─── 2c. Codex harness (embedded agent runtime) ──────────────────────
# Installs the pinned codex-app-server Linux package (idempotent, SHA256-
# verified) and seeds an independent CODEX_HOME, then points the backend at
# them via a systemd drop-in so the next `systemctl start` below picks them
# up. The harness is lazy — it only spawns when a user opens the Codex
# panel — so a failed install must fail the deploy, not the first request.
# Detect a host-provided Codex so we don't re-download the pinned package.
# The deploy may run as root, but the binary is owned/run by the deploy
# user (ubuntu), so resolve it from that account's PATH. Falls back to a
# set of well-known install locations, then to a PATH lookup.
detect_local_codex() {
  local u="${DEPLOY_USER:-$(id -un)}"
  local p=""
  # Prefer the deploy user's login shell PATH (npm-global, volta, …).
  if command -v sudo >/dev/null 2>&1 && [[ "$u" != "$(id -un)" ]]; then
    p=$(sudo -u "$u" bash -lc 'command -v codex-app-server || command -v codex' 2>/dev/null || true)
  fi
  if [[ -z "$p" ]]; then
    for cand in \
      "/home/ubuntu/.npm-global/bin/codex" \
      "/usr/local/bin/codex" "/usr/local/bin/codex-app-server" \
      "/usr/bin/codex" "/usr/bin/codex-app-server"; do
      [[ -x "$cand" ]] && { p="$cand"; break; }
    done
  fi
  if [[ -z "$p" ]]; then
    p=$(command -v codex-app-server 2>/dev/null || command -v codex 2>/dev/null || true)
  fi
  [[ -n "$p" ]] || return 0
  # Normalize symlinks so the recorded path is stable, then confirm -V works.
  if command -v readlink >/dev/null 2>&1; then
    p=$(readlink -f "$p" 2>/dev/null || echo "$p")
  fi
  if [[ -x "$p" ]] && "$p" -V >/dev/null 2>&1; then
    # The codex CLI exposes the server as a subcommand; the harness appends
    # `--listen stdio://`, which the CLI rejects at top level. Record the
    # subcommand with the binary (mirrors install-codex.sh), or the systemd
    # drop-in would spawn `codex --listen …` and every workspace task would
    # fail during initialization.
    if [[ "$(basename "$p")" != "codex-app-server" ]]; then
      echo "$p app-server"
    else
      echo "$p"
    fi
  fi
}

install_codex_harness() {
  # Auto-detect a locally installed Codex; if present, point the harness at
  # it and skip the GitHub download entirely.
  local local_codex
  local_codex=$(detect_local_codex || true)
  if [[ -n "$local_codex" ]]; then
    echo "Detected local Codex at $local_codex — skipping download."
    export CODEX_APP_SERVER_BIN="$local_codex"
  else
    echo "No local Codex found — will download pinned codex-app-server $CODEX_VERSION."
  fi

  echo "Installing Codex harness (codex-app-server $CODEX_VERSION)…"
  if ! "$SERVER_DIR/scripts/install-codex.sh" --install; then
    echo "ERROR: Codex harness install failed" >&2
    return 1
  fi

  # The binary the backend will actually spawn: prefer the exact command
  # install-codex.sh resolved and verified (it carries the `app-server`
  # subcommand for CLI installs), then the env detection, then the package.
  local codex_bin=""
  if [[ -f "${CODEX_INSTALL_DIR}/.bin-path" ]]; then
    codex_bin=$(cat "${CODEX_INSTALL_DIR}/.bin-path")
  fi
  codex_bin="${codex_bin:-${CODEX_APP_SERVER_BIN:-${CODEX_INSTALL_DIR}/bin/codex-app-server}}"

  # systemd drop-in — set after the service unit is already installed so
  # this deploy never edits the unit file itself (upgrades/removals keep
  # working, and `systemctl cat socrates-api` shows the split config).
  # The CODEX_APP_SERVER_BIN value is quoted: a CLI-derived command carries
  # the `app-server` subcommand after a space and must stay one assignment.
  echo "Writing systemd drop-in $CODEX_DROPIN…"
  $SUDO mkdir -p "$(dirname "$CODEX_DROPIN")"
  $SUDO tee "$CODEX_DROPIN" >/dev/null <<EOF
[Service]
Environment=CODEX_ENABLED=1
Environment="CODEX_APP_SERVER_BIN=${codex_bin}"
Environment=CODEX_HOME=${CODEX_HOME}
Environment=CODEX_WORKSPACE_ROOT=${CODEX_HOME}/workspaces
Environment=PATH=${CODEX_INSTALL_DIR}/bin:${CODEX_INSTALL_DIR}/codex-path:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EOF
  $SUDO systemctl daemon-reload
  echo "Codex harness drop-in active (bin=${codex_bin}, home=${CODEX_HOME})"
}

if [[ "$CODEX_ENABLED" != "0" ]]; then
  if ! install_codex_harness; then
    exit 1
  fi
else
  echo "Codex harness skipped (CODEX_ENABLED=0)"
  if [[ -f "$CODEX_DROPIN" ]]; then
    echo "Removing stale Codex drop-in $CODEX_DROPIN…"
    $SUDO rm -f "$CODEX_DROPIN"
    $SUDO systemctl daemon-reload
  fi
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
  NGINX_STATUS="CONFIG TEST FAILED"
  echo "ERROR: nginx config test failed; keeping the old nginx workers" >&2
elif $SUDO nginx -s reload >/dev/null 2>&1; then
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
  local code=""
  local attempts=1
  local attempt

  # nginx reloads gracefully and EdgeOne can briefly route a request to an
  # old worker. Retry only the app entry gate so that a short handoff window
  # does not turn an otherwise valid release into a false failure.
  if [[ "$label" == "app frontend        " ]]; then
    attempts="${APP_GATE_ATTEMPTS:-3}"
  fi

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$@" "$url" || echo 000)
    if [[ "$code" =~ ^2 ]]; then
      GATE_RESULTS+=("  $label $code")
      return 0
    fi
    if (( attempt < attempts )); then
      sleep "${APP_GATE_RETRY_DELAY_SEC:-2}"
    fi
  done

  GATE_RESULTS+=("  $label $code  ← FAIL")
  echo "GATE FAIL: $label returned $code ($url)" >&2
  GATE_FAILED=1
}

if [[ "$NGINX_STATUS" != "reloaded" ]]; then
  GATE_RESULTS+=("  nginx reload $NGINX_STATUS  ← FAIL")
  GATE_FAILED=1
fi

# 4.5a. Frontend bundle integrity: the just-built entry must exist on disk
# and match byte-for-byte. Previously a missing file skipped this check.
# The deployed file is the versioned `index.<TS>.html` written by this
# deploy; we look it up via $APP_FILE if set, otherwise fall back to
# the legacy stable-name `index.html` (legacy single-file mode).
APP_DEPLOYED_PATH="$APP_WEB_ROOT/${APP_FILE:-index.html}"
if [[ -n "${DIST_DIR:-}" ]]; then
  if [[ ! -f "${DIST_DIR}/index.html" || ! -f "$APP_DEPLOYED_PATH" ]]; then
    echo "GATE FAIL: deployed frontend entry is missing ($APP_DEPLOYED_PATH)" >&2
    GATE_FAILED=1
    GATE_RESULTS+=("  bundle.file MISSING  ← FAIL")
  else
    BUILT_MD5=$(md5sum "$DIST_DIR/index.html" | cut -d' ' -f1)
    DEPLOYED_MD5=$(md5sum "$APP_DEPLOYED_PATH" | cut -d' ' -f1)
    if [[ "$BUILT_MD5" == "$DEPLOYED_MD5" ]]; then
      GATE_RESULTS+=("  bundle.md5 match ($DEPLOYED_MD5)")
    else
      echo "GATE FAIL: bundle md5 mismatch — built=$BUILT_MD5 deployed=$DEPLOYED_MD5" >&2
      GATE_FAILED=1
      GATE_RESULTS+=("  bundle.md5 MISMATCH  ← FAIL")
    fi
  fi
fi

# 4.5b. Public endpoints — catches nginx→wrong port, DNS/SSL/firewall issues.
# Include the unique release timestamp so an EdgeOne cache entry for `/` from
# a previous release cannot make a broken fallback look healthy.
APP_FRONTEND_GATE_URL="${APP_PUBLIC_URL%/}/"
if [[ -n "${APP_TS:-}" ]]; then
  APP_FRONTEND_GATE_URL="${APP_FRONTEND_GATE_URL}?__socrates_deploy=${APP_TS}"
fi
gate_check "app frontend        " "$APP_FRONTEND_GATE_URL"

# The status-only gate above is not enough: it could still serve an older
# cached 200. Compare the public root response with the exact entry deployed
# in this release, including the trailing bytes in the response body.
if [[ -n "${APP_FILE:-}" && -f "$APP_DEPLOYED_PATH" ]]; then
  PUBLIC_APP_TMP=$(mktemp)
  PUBLIC_APP_MD5=""
  PUBLIC_APP_MATCH=0
  for attempt in 1 2 3; do
    if curl -sfL --max-time 8 "$APP_FRONTEND_GATE_URL" -o "$PUBLIC_APP_TMP"; then
      PUBLIC_APP_MD5=$(md5sum "$PUBLIC_APP_TMP" | cut -d' ' -f1)
      if [[ "$PUBLIC_APP_MD5" == "${DEPLOYED_MD5:-}" ]]; then
        PUBLIC_APP_MATCH=1
        break
      fi
    fi
    if (( attempt < 3 )); then
      sleep "${APP_GATE_RETRY_DELAY_SEC:-2}"
    fi
  done
  if [[ "$PUBLIC_APP_MATCH" == "1" ]]; then
    GATE_RESULTS+=("  public bundle matches $APP_FILE")
  elif [[ -n "$PUBLIC_APP_MD5" ]]; then
    echo "GATE FAIL: public app bundle mismatch — public=$PUBLIC_APP_MD5 deployed=${DEPLOYED_MD5:-unknown}" >&2
    GATE_FAILED=1
    GATE_RESULTS+=("  public bundle MISMATCH  ← FAIL")
  else
    echo "GATE FAIL: public app bundle could not be downloaded ($APP_FRONTEND_GATE_URL)" >&2
    GATE_FAILED=1
    GATE_RESULTS+=("  public bundle UNAVAILABLE  ← FAIL")
  fi
  rm -f "$PUBLIC_APP_TMP"
fi

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

# 4.5e-2. Admin console surface — the operator status endpoint is
# public (200 + { configured, ipAllowed }); the config routes must
# fail closed for unauthenticated callers (403 from
# requireAdminSession, never 200). An unconfigured console
# (ADMIN_PASSWORD unset) is an expected operator state, not a gate
# failure — it is recorded below and surfaced as an action item.
ADMIN_CONSOLE_CONFIGURED=false
ADMIN_STATUS_BODY=$(curl -sf --max-time 5 http://localhost:3037/api/admin-auth/status || true)
if [[ -n "$ADMIN_STATUS_BODY" ]] && echo "$ADMIN_STATUS_BODY" | jq -e 'has("configured") and has("ipAllowed")' >/dev/null 2>&1; then
  GATE_RESULTS+=("  admin.status ok ($(echo "$ADMIN_STATUS_BODY" | jq -c .))")
  if echo "$ADMIN_STATUS_BODY" | jq -e '.configured == true' >/dev/null 2>&1; then
    ADMIN_CONSOLE_CONFIGURED=true
  fi
else
  echo "GATE FAIL: /api/admin-auth/status missing or malformed" >&2
  GATE_FAILED=1
  GATE_RESULTS+=("  admin.status INVALID  ← FAIL")
fi

ADMIN_GATE_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3037/api/embedding-config || echo 000)
if [[ "$ADMIN_GATE_CODE" == "403" ]]; then
  GATE_RESULTS+=("  admin.config fail-closed (403)")
else
  echo "GATE FAIL: /api/embedding-config returned $ADMIN_GATE_CODE unauthenticated (expected 403)" >&2
  GATE_FAILED=1
  GATE_RESULTS+=("  admin.config $ADMIN_GATE_CODE  ← FAIL")
fi

# 4.5f. Codex harness — pinned binary + CODEX_HOME ready, and the backend's
# codex router is mounted (401 = route exists behind auth; 404 = missing).
if [[ "$CODEX_ENABLED" != "0" ]]; then
  if "$SERVER_DIR/scripts/install-codex.sh" --check; then
    GATE_RESULTS+=("  codex.harness $CODEX_VERSION ok")
  else
    echo "GATE FAIL: codex harness check failed (run 'sudo $SERVER_DIR/scripts/install-codex.sh --install')" >&2
    GATE_FAILED=1
    GATE_RESULTS+=("  codex.harness INVALID  ← FAIL")
  fi
  CODEX_API_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3037/api/codex/capabilities || echo 000)
  if [[ "$CODEX_API_CODE" == "401" ]]; then
    GATE_RESULTS+=("  codex.api mounted (auth 401)")
  else
    echo "GATE FAIL: /api/codex/capabilities returned $CODEX_API_CODE (expected 401)" >&2
    GATE_FAILED=1
    GATE_RESULTS+=("  codex.api $CODEX_API_CODE  ← FAIL")
  fi
fi

# 4.5g. State file: update only on full success so last-known-good is preserved.
if [[ $GATE_FAILED -eq 0 ]]; then
  DEPLOY_SOURCE_DIR="$(dirname "$(readlink -f "$0")")"
  DEPLOY_COMMIT=$(git -C "$DEPLOY_SOURCE_DIR" rev-parse HEAD 2>/dev/null || echo unknown)
  DEPLOY_WORKTREE_STATUS=$(git -C "$DEPLOY_SOURCE_DIR" status --porcelain=v1 --untracked-files=all 2>/dev/null || true)
  if [[ -n "$DEPLOY_WORKTREE_STATUS" ]]; then
    DEPLOY_SOURCE_DIRTY=true
  else
    DEPLOY_SOURCE_DIRTY=false
  fi
  DEPLOY_SOURCE_FINGERPRINT=$(
    {
      git -C "$DEPLOY_SOURCE_DIR" rev-parse HEAD 2>/dev/null || true
      git -C "$DEPLOY_SOURCE_DIR" diff --no-ext-diff --binary HEAD 2>/dev/null || true
      git -C "$DEPLOY_SOURCE_DIR" status --porcelain=v1 --untracked-files=all 2>/dev/null || true
    } | sha256sum | cut -d' ' -f1
  )
  if [[ "$DEPLOY_SOURCE_DIRTY" == "true" ]]; then
    echo "WARNING: deploying a dirty worktree; recording source fingerprint $DEPLOY_SOURCE_FINGERPRINT" >&2
  fi
  DEPLOY_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  tmp=$(mktemp "${STATE_FILE}.XXXXXX.tmp")
  cat > "$tmp" <<EOF
{
  "lastSuccessfulDeploy": {
    "commit": "${DEPLOY_COMMIT}",
    "sourceDirty": ${DEPLOY_SOURCE_DIRTY},
    "sourceFingerprint": "${DEPLOY_SOURCE_FINGERPRINT}",
    "timestamp": "${DEPLOY_TS}",
    "frontendEntry": "${APP_FILE:-index.html}",
    "frontendBundleMd5": "${DEPLOYED_MD5:-}",
    "frontendBundleSha256": "${SRC_SHA256:-}",
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
      "adminStatusReachable": true,
      "adminConfigFailClosed": true,
      "adminConsoleConfigured": ${ADMIN_CONSOLE_CONFIGURED:-false},
      "schemaTablesVerified": $([ "${SKIP_SCHEMA_VERIFY:-0}" = "1" ] && echo false || echo true),
      "bundleMd5Integrity": true,
      "nginxReloaded": $([ "$NGINX_STATUS" = "reloaded" ] && echo true || echo false),
      "codexHarness": $([ "$CODEX_ENABLED" != "0" ] && echo true || echo false),
      "codexApiMounted": $([ "$CODEX_ENABLED" != "0" ] && [ "$CODEX_API_CODE" = "401" ] && echo true || echo false)
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
  if [[ "${ADMIN_CONSOLE_CONFIGURED:-false}" != "true" ]]; then
    echo "  operator action: ADMIN_PASSWORD is not set — the /admin console is disabled."
    echo "    Set ADMIN_PASSWORD (8+ chars) and ADMIN_IP_ALLOWLIST in the service env,"
    echo "    then restart socrates-api to enable the operator console."
  fi
  # Rollback path for the versioned SPA entry. .previous/ holds the
  # prior index.<TS>.html filename + content, so the restore must also
  # repoint the nginx try_files sentinel to that filename and reload.
  echo "  frontend rollback:"
  echo "    ls $APP_WEB_ROOT/.previous/index.*.html  # pick the prior TS"
  echo "    sudo cp -a \$TS_FILE $APP_WEB_ROOT/"
  echo "    sudo sed -i 's|/index\\.[0-9]\\+\\.html|/\${TS}|' $NGINX_APP_CONF"
  echo "    sudo nginx -s reload"
  echo "  backend rollback build: $BACKEND_PREVIOUS"
else
  echo "✗ DEPLOY GATE FAILED ($GATE_FAILED check(s))" >&2
  echo "─── gate ───"
  printf '%s\n' "${GATE_RESULTS[@]}" >&2
  echo "────────────" >&2
  echo "The previous bundle (versioned filename + content) is preserved at $APP_WEB_ROOT/.previous/" >&2
  echo "The backend build was restored automatically when a previous build was available." >&2
  echo "To restore the frontend, copy the prior index.<TS>.html back and re-point nginx:" >&2
  echo "    sudo cp -a $APP_WEB_ROOT/.previous/index.<old-ts>.html $APP_WEB_ROOT/" >&2
  echo "    sudo sed -i 's|/index\\.[0-9]\\+\\.html|/index.<old-ts>.html|' $NGINX_APP_CONF" >&2
  echo "    sudo nginx -s reload" >&2
  echo "State file $STATE_FILE was NOT updated — last known-good deploy is still recorded there." >&2
  exit 1
fi
