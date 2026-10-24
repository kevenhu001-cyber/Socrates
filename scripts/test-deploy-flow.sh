#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

make_fixture() {
  local name="$1"
  local base="$WORK/$name"
  mkdir -p "$base"/{bin,frontend,server/node_modules/.bin,server/src,app-root/assets,site-root,status-root,etc,ops/nginx}
  cp "$ROOT/ops/nginx/insert-spa-cache.awk" "$base/ops/nginx/insert-spa-cache.awk"
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
  # set_app_index_target() rewrites to the freshly deployed entry. Keep the
  # two HTML locations here so the edge-cache installer gets a positive test,
  # not just the missing-script warning path.
  cat > "$base/etc/app.conf" <<'NGINX'
server {
  location / {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    try_files $uri $uri/ /__APP_INDEX__;
  }
  location ~ ^/index\.[0-9]+\.html$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
  }
}
NGINX
  printf 'active\n' > "$base/systemctl.state"
  git -C "$base" init -q
  git -C "$base" -c user.name=Fixture -c user.email=fixture@example.test commit --allow-empty -qm fixture
  : > "$base/systemctl.log"

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
  if [[ "${STOP_BACKEND_DURING_BUILD:-0}" != "1" && "$(cat "$SYSTEMCTL_STATE")" != "active" ]]; then
    echo "backend must remain active during the frontend build" >&2
    exit 1
  fi
  if [[ "${MOCK_FRONTEND_BUILD_FAIL:-0}" == "1" ]]; then
    echo "mock frontend build failure" >&2
    exit 1
  fi
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
  stop)
    printf 'stop\n' >> "$SYSTEMCTL_LOG"
    printf 'inactive\n' > "$SYSTEMCTL_STATE"
    ;;
  start)
    printf 'start\n' >> "$SYSTEMCTL_LOG"
    printf 'active\n' > "$SYSTEMCTL_STATE"
    ;;
  is-active)
    [[ "$(cat "$SYSTEMCTL_STATE")" == "active" ]]
    ;;
  show) printf '4242\n' ;;
  *) exit 0 ;;
esac
SH

  cat > "$base/bin/gh" <<'SH'
#!/usr/bin/env bash
if [[ "${MOCK_GH_ERROR:-0}" == "1" ]]; then
  echo 'mock API unavailable' >&2
  exit 1
fi
case "${MOCK_GH_RESULT:-success}" in
  success) printf 'success\n' ;;
  failure) printf 'failure\n' ;;
  missing) : ;;
  *) printf '%s\n' "$MOCK_GH_RESULT" ;;
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
# The status-page gate probes the status origin through --resolve and the
# public hostname without it. Serve the artifact this release installed for
# the origin probe, so the gate's byte comparison compares real content, and
# let each path be broken independently.
if [[ "$*" == *"status.topodrive.top"* ]]; then
  if [[ "$*" == *"/api/status"* ]]; then
    if [[ "${MOCK_STATUS_FEED_FAIL:-0}" == "1" ]]; then
      printf '503'
      exit 0
    fi
    printf '200'
    exit 0
  fi
  if [[ "$*" == *"--resolve"* ]]; then
    if [[ -n "$output_file" ]]; then
      status_artifact=$(ls -1 "$STATUS_DIR"/status.*.html 2>/dev/null | head -1)
      if [[ -n "$status_artifact" ]]; then
        cat "$status_artifact" > "$output_file"
      else
        printf '<html>status</html>\n' > "$output_file"
      fi
      if [[ "${MOCK_STATUS_ARTIFACT_FAIL:-0}" == "1" ]]; then
        printf '<html>stale artifact</html>\n' > "$output_file"
      fi
    fi
    printf '200'
    exit 0
  fi
  if [[ "${MOCK_STATUS_PUBLIC_FAIL:-0}" == "1" ]]; then
    printf '503'
    exit 0
  fi
  printf '200'
  exit 0
fi
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

  cat > "$base/bin/getent" <<'SH'
#!/usr/bin/env bash
# The status-page gate resolves the public hostname before deciding whether a
# missing DNS record may pass the gate. Default to "does not resolve" so the
# fixture exercises the DNS-missing path; MOCK_STATUS_DNS=resolved flips it.
if [[ "${MOCK_STATUS_DNS:-missing}" == "resolved" ]]; then
  printf '203.0.113.10   %s\n' "${2:-unknown}"
fi
exit 0
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
    SYSTEMCTL_STATE="$base/systemctl.state" \
    SYSTEMCTL_LOG="$base/systemctl.log" \
    DEPLOY_USER="tester" \
    DEPLOY_GROUP="tester" \
    CODEX_ENABLED="0" \
    PI_AGENT_BIN="$base/no-pi" \
    CODEX_DROPIN="$base/etc/codex.conf" \
    "$@" \
    "$base/deploy.sh"
}

# Exercise the real deploy.sh gate through its normal invocation. A skip is
# auditable, green proceeds, while red/missing/API-error remain fail closed.
ci_skip_base=$(make_fixture ci-skip)
run_deploy "$ci_skip_base" DEPLOY_SKIP_CI_CHECK=1 >"$ci_skip_base/output.log" 2>&1
grep -q 'ci.gate  SKIPPED by DEPLOY_SKIP_CI_CHECK=1' "$ci_skip_base/output.log"
grep -q '"ciGate": "skipped-by-operator"' "$ci_skip_base/deploy-state.json"

ci_success_base=$(make_fixture ci-success)
run_deploy "$ci_success_base" >"$ci_success_base/output.log" 2>&1
grep -q 'all required workflows green' "$ci_success_base/output.log"
grep -q '"ciGate": "green"' "$ci_success_base/deploy-state.json"

for ci_case in failure missing unverifiable cancelled in-progress unknown; do
  ci_base=$(make_fixture "ci-$ci_case")
  case "$ci_case" in
    failure) ci_env=(MOCK_GH_RESULT=failure) ;;
    missing) ci_env=(MOCK_GH_RESULT=missing) ;;
    unverifiable) ci_env=(MOCK_GH_ERROR=1) ;;
    cancelled) ci_env=(MOCK_GH_RESULT=cancelled) ;;
    in-progress) ci_env=(MOCK_GH_RESULT=in_progress) ;;
    unknown) ci_env=(MOCK_GH_RESULT=queued) ;;
  esac
  if run_deploy "$ci_base" "${ci_env[@]}" >"$ci_base/output.log" 2>&1; then
    echo "CI gate $ci_case unexpectedly succeeded" >&2
    exit 1
  fi
  case "$ci_case" in
    failure|cancelled|in-progress|unknown) grep -q 'failing:.*ci\.yml(' "$ci_base/output.log" ;;
    missing) grep -q 'no completed run for this commit:.*ci\.yml' "$ci_base/output.log" ;;
    unverifiable) grep -q 'could not verify the merge gate' "$ci_base/output.log" ;;
  esac
done

# Probe the actual gate function in a clean child shell so missing commands and
# an invalid checkout can be tested without changing deploy's full-run fixture.
ci_gate_source="$WORK/ci-gate.sh"
{ echo 'REQUIRED_CI_WORKFLOWS="ci.yml security.yml"'; awk '/^ci_gate_check\(\)/,/^}/' "$ROOT/deploy.sh"; } > "$ci_gate_source"
mkdir -p "$WORK/only-git" "$WORK/only-gh" "$WORK/only-gh-bin"
cat > "$WORK/only-gh-bin/git" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-C" && "${3:-}" == "rev-parse" ]]; then printf 'deadbeef12345678\n'; else exit 1; fi
SH
cat > "$WORK/only-gh-bin/gh" <<'SH'
#!/usr/bin/env bash
printf 'success\n'
SH
chmod +x "$WORK/only-gh-bin/"*
for missing_case in gh git head; do
  case "$missing_case" in
    gh) test_path="$WORK/only-gh-bin"; rm -f "$test_path/gh" ;;
    git) test_path="$WORK/only-gh-bin"; rm -f "$test_path/git" ;;
    head) test_path="$WORK/only-gh-bin"; cat > "$test_path/git" <<'SH'
#!/usr/bin/env bash
exit 1
SH
      chmod +x "$test_path/git" ;;
  esac
  if env PATH="$test_path" /bin/bash -c 'source "$1"; DEPLOY_CI_GATE_STATUS=not-run; ci_gate_check /not/a/repo' _ "$ci_gate_source" >"$WORK/ci-$missing_case.log" 2>&1; then
    echo "CI gate missing-$missing_case unexpectedly succeeded" >&2
    exit 1
  fi
  case "$missing_case" in
    head) grep -q 'refusing to deploy' "$WORK/ci-$missing_case.log" ;;
    *) grep -q 'git and gh are required' "$WORK/ci-$missing_case.log" ;;
  esac
done

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
grep -q 'cache:   SPA HTML edge policy wired' "$success_base/output.log"
grep -q 'CDN-Cache-Control "public, max-age=60' "$success_base/etc/app.conf"
if grep -q 'no-cache\|no-store' "$success_base/etc/app.conf"; then
  echo "stale SPA no-cache policy survived deployment" >&2
  exit 1
fi
grep -q '"adminConfigFailClosed": true' "$success_base/deploy-state.json"
grep -q '"schemaTablesVerified": true' "$success_base/deploy-state.json"
if compgen -G "$success_base/server/.dist-next.*" >/dev/null; then
  echo "candidate cleanup failed on success" >&2
  exit 1
fi

# The status-page gate separates a broken artifact (blocking) from a missing
# public DNS record (reported, not blocking): the zone lives in DNSPod, so a
# missing A record cannot be repaired from the repository or from deploy.sh.
status_dns_missing_base=$(make_fixture status-dns-missing)
run_deploy "$status_dns_missing_base" >"$status_dns_missing_base/output.log" 2>&1
grep -q 'GATE WARN: status hostname status.topodrive.top has no DNS record' "$status_dns_missing_base/output.log"
grep -q 'public DNS missing for status.topodrive.top' "$status_dns_missing_base/output.log"
grep -q '"statusPublicDns": "unresolved"' "$status_dns_missing_base/deploy-state.json"

status_dns_strict_base=$(make_fixture status-dns-strict)
if run_deploy "$status_dns_strict_base" STATUS_GATE_REQUIRE_PUBLIC=1 >"$status_dns_strict_base/output.log" 2>&1; then
  echo "status gate strict mode unexpectedly succeeded without a DNS record" >&2
  exit 1
fi
grep -q 'status hostname status.topodrive.top does not resolve in DNS' "$status_dns_strict_base/output.log"

status_artifact_base=$(make_fixture status-artifact-mismatch)
if run_deploy "$status_artifact_base" MOCK_STATUS_ARTIFACT_FAIL=1 >"$status_artifact_base/output.log" 2>&1; then
  echo "status artifact mismatch unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'status page origin serves' "$status_artifact_base/output.log"

status_feed_base=$(make_fixture status-feed-failure)
if run_deploy "$status_feed_base" MOCK_STATUS_FEED_FAIL=1 >"$status_feed_base/output.log" 2>&1; then
  echo "status feed failure unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'GATE FAIL: status feed returned 503' "$status_feed_base/output.log"

status_public_base=$(make_fixture status-public-broken)
if run_deploy "$status_public_base" MOCK_STATUS_DNS=resolved MOCK_STATUS_PUBLIC_FAIL=1 >"$status_public_base/output.log" 2>&1; then
  echo "broken public status page unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'GATE FAIL: status page' "$status_public_base/output.log"

build_failure_base=$(make_fixture build-failure)
if run_deploy "$build_failure_base" MOCK_FRONTEND_BUILD_FAIL=1 >"$build_failure_base/output.log" 2>&1; then
  echo "frontend build failure unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'mock frontend build failure' "$build_failure_base/output.log"
grep -q 'old backend' "$build_failure_base/server/dist/index.runtime.js"
if [[ "$(cat "$build_failure_base/systemctl.state")" != "active" ]]; then
  echo "backend remained stopped after frontend build failure" >&2
  exit 1
fi
build_failure_starts=$(grep -c '^start$' "$build_failure_base/systemctl.log" || true)
if [[ "$build_failure_starts" != "0" || -s "$build_failure_base/systemctl.log" ]]; then
  echo "build failure must not stop or restart the live backend" >&2
  exit 1
fi
if compgen -G "$build_failure_base/server/.dist-next.*" >/dev/null; then
  echo "candidate cleanup failed after frontend build failure" >&2
  exit 1
fi

legacy_build_failure_base=$(make_fixture legacy-build-failure)
if run_deploy "$legacy_build_failure_base" STOP_BACKEND_DURING_BUILD=1 MOCK_FRONTEND_BUILD_FAIL=1 >"$legacy_build_failure_base/output.log" 2>&1; then
  echo "legacy frontend build failure unexpectedly succeeded" >&2
  exit 1
fi
test "$(cat "$legacy_build_failure_base/systemctl.state")" == "active"
test "$(grep -c '^start$' "$legacy_build_failure_base/systemctl.log")" == "1"

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

echo "deploy flow: CI gate skip/success/failure/missing/unverifiable, success, lock contention, health gate, cleanup, rollback, and the status-page gate (DNS missing/strict/artifact/feed/public) passed"
