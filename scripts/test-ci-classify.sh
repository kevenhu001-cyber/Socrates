#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLASSIFIER="$ROOT/scripts/ci-classify.sh"

assert_case() {
  local name="$1"
  local paths="$2"
  local expected="$3"
  local actual
  actual="$(printf '%s\n' "$paths" | bash "$CLASSIFIER")"
  if [[ "$actual" != "$expected" ]]; then
    echo "::error title=CI classifier regression::$name" >&2
    echo "paths:" >&2
    printf '  %s\n' "$paths" >&2
    echo "expected:" >&2
    printf '%s\n' "$expected" >&2
    echo "actual:" >&2
    printf '%s\n' "$actual" >&2
    exit 1
  fi
}

none=$'site=false\nfrontend=false\nserver=false\nshared=false\nuniversal=false'
server_only=$'site=false\nfrontend=false\nserver=true\nshared=false\nuniversal=false'
frontend_only=$'site=false\nfrontend=true\nserver=false\nshared=false\nuniversal=false'
universal_only=$'site=false\nfrontend=false\nserver=false\nshared=false\nuniversal=true'
site_only=$'site=true\nfrontend=false\nserver=false\nshared=false\nuniversal=false'
frontend_universal=$'site=false\nfrontend=true\nserver=false\nshared=false\nuniversal=true'
frontend_shared=$'site=false\nfrontend=true\nserver=false\nshared=true\nuniversal=false'
shared_source=$'site=false\nfrontend=true\nserver=true\nshared=true\nuniversal=true'
frontend_server=$'site=false\nfrontend=true\nserver=true\nshared=false\nuniversal=false'
all=$'site=true\nfrontend=true\nserver=true\nshared=true\nuniversal=true'

assert_case "docs only stays cheap" "README.md" "$none"
assert_case "OpenAPI docs stay in Repo sanity" "docs/api/openapi.yaml" "$none"
assert_case "server source only wakes Server" "server/src/index.runtime.ts" "$server_only"
assert_case "prompt changes wake Server" "prompts/teacher-mode.md" "$server_only"
assert_case "SPA source only wakes Frontend" "frontend/src/main.tsx" "$frontend_only"
assert_case "Universal Playwright spec only wakes Universal App" "frontend/e2e/universal-auth.spec.mjs" "$universal_only"
assert_case "frontend lockfile wakes SPA and Universal harness" "frontend/package-lock.json" "$frontend_universal"
assert_case "site source only wakes Site" "site/index.html" "$site_only"
assert_case "Universal App source only wakes Universal App" "apps/socrates/App.tsx" "$universal_only"
assert_case "shared package source expands to every consumer" "packages/core/src/toolRun.ts" "$shared_source"
assert_case "Rust source wakes SPA WASM and shared protocol" "tools-rust/crates/protocol/src/lib.rs" "$frontend_shared"
assert_case "coverage guard wakes both covered products" "scripts/coverage-ratchet.mjs" "$frontend_server"
assert_case "main workflow change is self-tested without full rebuild" ".github/workflows/ci.yml" "$none"
assert_case "multiple independent paths compose scopes" $'server/src/index.ts\nfrontend/src/main.tsx' "$frontend_server"
assert_case "unknown path fails safe to full gate" "new-runtime/entry.ts" "$all"

forced="$(bash "$CLASSIFIER" --all)"
if [[ "$forced" != "$all" ]]; then
  echo "::error::--all must enable every lane" >&2
  exit 1
fi

echo "CI path classifier: all regression cases passed"
