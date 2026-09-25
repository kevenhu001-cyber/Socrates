#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

make_fixture() {
  local name="$1"
  local base="$WORK/$name"
  mkdir -p "$base"/{bin,frontend,server/node_modules/.bin,server/src,app-root/assets,site-root,status-root,etc}
  printf 'old backend\n' > "$base/server/dist-marker"
  mkdir -p "$base/server/dist"
  mv "$base/server/dist-marker" "$base/server/dist/index.runtime.js"
  printf 'old frontend\n' > "$base/app-root/index.html"
  printf 'old asset\n' > "$base/app-root/assets/old.js"
  printf 'aged asset\n' > "$base/app-root/assets/aged.js"
  touch -d '40 days ago' "$base/app-root/assets/aged.js"
  printf '<html>status</html>\n' > "$base/server/src/status.html"
  printf 'try_files /status.1.html =404;\n' > "$base/etc/status.conf"
  # App nginx config with the managed SPA fallback that deploy.sh
  # set_app_index_target() rewrites to the freshly deployed entry.
  printf 'try_files $uri $uri/ /__APP_INDEX__;\n' > "$base/etc/app.conf"

  tr -d '\r' < "$ROOT/deploy.sh" > "$base/deploy.sh"
  chmod +x "$base/deploy.sh"

  cat > "$base/server/node_modules/.bin/tsc" <<'SH'
#!/usr/bin/env bash
set -e
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--outDir" ]]; then out="$2"; shift 2; else shift; fi
done
mkdir -p "$out"
printf 'new backend\n' > "$out/index.runtime.js"
SH

  cat > "$base/bin/npm" <<'SH'
#!/usr/bin/env bash
set -e
if [[ "${1:-}" == "run" && "${2:-}" == "build" ]]; then
  if [[ "${NODE_OPTIONS:-}" != *"--max-old-space-size=1024"* ]]; then
    echo "frontend build heap limit missing: ${NODE_OPTIONS:-unset}" >&2
    exit 1
  fi
  mkdir -p dist/assets
  printf '<html><div id="adminPanel"></div>new frontend</html>\n' > dist/index.html
  printf 'new asset\n' > dist/assets/app.js
fi
SH

  cat > "$base/bin/npx" <<'SH'
#!/usr/bin/env bash
# Schema verification (tsx scripts/verify-deploy-schema.ts) has no
# fixture DB; treat it as passed — the flow test covers lock, gates,
# cleanup, and rollback, not the schema gate itself.
exit 0
SH

  cat > "$base/bin/systemctl" <<'SH'
#!/usr/bin/env bash
case "${1:-}" in
  is-active) exit 0 ;;
  show) printf '4242\n' ;;
  *) exit 0 ;;
esac
SH

  cat > "$base/bin/nginx" <<'SH'
#!/usr/bin/env bash
exit 0
SH

  cat > "$base/bin/flock" <<'SH'
#!/usr/bin/env bash
if [[ "${MOCK_FLOCK_HELD:-0}" == "1" ]]; then exit 1; fi
exit 0
SH

  cat > "$base/bin/curl" <<'SH'
#!/usr/bin/env bash
# Mimic `curl -o <file>`: the deploy's public-bundle gate downloads the
# live entry and compares its md5 with the freshly deployed index.<TS>.html,
# which the npm build mock below writes as '<html>new frontend</html>\n'.
output_file=""
prev_arg=""
for arg in "$@"; do
  if [[ "$prev_arg" == "-o" ]]; then
    output_file="$arg"
    break
  fi
  prev_arg="$arg"
done
if [[ -n "$output_file" ]]; then
  printf '<html><div id="adminPanel"></div>new frontend</html>\n' > "$output_file"
fi
if [[ "${MOCK_GATE_FAIL:-0}" == "1" && "$*" == *"https://app.topodrive.top/"* ]]; then
  printf '503'
  exit 0
fi
if [[ "$*" == *"api/embedding-config"* ]]; then
  # The deploy's admin fail-closed gate expects the ungated config
  # surface to reject anonymous callers with 403.
  printf '403'
elif [[ "$*" == *"api/agent-runs/capabilities"* ]]; then
  # The fixture intentionally has no Pi binary. Mirror the live API's
  # fail-closed response when the workspace-agent runtime is unavailable.
  printf '401'
elif [[ "$*" == *"-w"* ]]; then
  printf '200'
elif [[ "$*" == *"mobile/bootstrap"* ]]; then
  # The deploy's mobile-bootstrap contract gate validates the exact
  # public /api/v2 payload shape, so the mock must mirror a live
  # backend response.
  printf '%s' '{"ok":true,"contractVersion":1,"webBaseUrl":"https://app.topodrive.top","apiBaseUrl":"https://app.topodrive.top/api/v2","canonicalApiBaseUrl":"https://app.topodrive.top/api","healthPath":"/api/v2/health"}'
else
  printf '{"ok":true}'
fi
SH

  cat > "$base/bin/jq" <<'SH'
#!/usr/bin/env bash
cat >/dev/null
printf '{"ok":true}\n'
SH

  cat > "$base/bin/chown" <<'SH'
#!/usr/bin/env bash
exit 0
SH

  cat > "$base/bin/install" <<'SH'
#!/usr/bin/env bash
set -e
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|-o|-g) shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
dest="${args[${#args[@]}-1]}"
unset 'args[${#args[@]}-1]'
if [[ "$dest" == */app-root/index.*.html && ! -f "$(dirname "$dest")/assets/app.js" ]]; then
  echo 'frontend entry published before assets' >&2
  exit 1
fi
mkdir -p "$(dirname "$dest")"
if [[ ${#args[@]} -gt 1 || -d "$dest" ]]; then
  mkdir -p "$dest"
  cp "${args[@]}" "$dest/"
else
  cp "${args[0]}" "$dest"
fi
SH

  cat > "$base/bin/sudo" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-n" ]]; then shift; fi
"$@"
SH

  chmod +x "$base/bin/"* "$base/server/node_modules/.bin/tsc"
  printf '%s\n' "$base"
}

run_deploy() {
  local base="$1"
  shift
  env \
    PATH="$base/bin:/usr/bin:/bin" \
    FRONTEND_DIR="$base/frontend" \
    SERVER_DIR="$base/server" \
    APP_WEB_ROOT="$base/app-root" \
    SITE_WEB_ROOT="$base/site-root" \
    SITE_DIR="$base/no-site" \
    STATUS_DIR="$base/status-root" \
    NGINX_SITE_CONF="$base/etc/status.conf" \
    NGINX_APP_CONF="$base/etc/app.conf" \
    DEPLOY_LOCK_FILE="$base/deploy.lock" \
    STATE_FILE="$base/deploy-state.json" \
    DEPLOY_USER="tester" \
    DEPLOY_GROUP="tester" \
    CODEX_ENABLED="0" \
    PI_AGENT_BIN="$base/no-pi" \
    CODEX_DROPIN="$base/etc/codex.conf" \
    "$@" \
    "$base/deploy.sh"
}

success_base=$(make_fixture success)
run_deploy "$success_base" >"$success_base/output.log"
grep -q 'new backend' "$success_base/server/dist/index.runtime.js"
grep -q 'old backend' "$success_base/server/dist.previous/index.runtime.js"
grep -q 'old asset' "$success_base/app-root/assets/old.js"
grep -q 'new asset' "$success_base/app-root/assets/app.js"
test ! -e "$success_base/app-root/assets/aged.js"
# The app entry is deployed as a versioned index.<TS>.html (CDN cache-bust);
# there is no stable index.html any more.
if ! grep -rlq 'new frontend' "$success_base/app-root"/index.*.html; then
  echo "new frontend entry missing from versioned index.*.html" >&2
  exit 1
fi
grep -q '"lastSuccessfulDeploy"' "$success_base/deploy-state.json"
grep -q 'mobile.bootstrap contract v1 aligned' "$success_base/output.log"
grep -q '"mobileBootstrapAligned": true' "$success_base/deploy-state.json"
grep -q 'admin.status ok' "$success_base/output.log"
grep -q 'admin.config fail-closed (403)' "$success_base/output.log"
grep -q 'pi.agent disabled (binary unavailable)' "$success_base/output.log"
grep -q '"adminConfigFailClosed": true' "$success_base/deploy-state.json"
grep -q '"schemaTablesVerified": true' "$success_base/deploy-state.json"
if compgen -G "$success_base/server/.dist-next.*" >/dev/null; then
  echo "candidate cleanup failed on success" >&2
  exit 1
fi

rollback_base=$(make_fixture rollback)
if run_deploy "$rollback_base" MOCK_GATE_FAIL=1 >"$rollback_base/output.log" 2>&1; then
  echo "health-gate failure unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'old backend' "$rollback_base/server/dist/index.runtime.js"
grep -q 'old asset' "$rollback_base/app-root/assets/old.js"
test -e "$rollback_base/app-root/assets/aged.js"
test ! -e "$rollback_base/deploy-state.json"
if compgen -G "$rollback_base/server/.dist-next.*" >/dev/null; then
  echo "candidate cleanup failed on rollback" >&2
  exit 1
fi

lock_base=$(make_fixture lock)
if run_deploy "$lock_base" MOCK_FLOCK_HELD=1 >"$lock_base/output.log" 2>&1; then
  echo "lock contention unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'another Socrates deploy is already in progress' "$lock_base/output.log"

echo "deploy flow: success, lock contention, health gate, cleanup, and rollback passed"
