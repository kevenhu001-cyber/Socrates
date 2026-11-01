#!/usr/bin/env bash
set -euo pipefail

# Classify changed repository paths into the expensive CI lanes they can
# actually affect. Output is compatible with $GITHUB_OUTPUT.
#
# Safety rule: an unknown path enables every lane. A new source tree can
# therefore waste CI minutes, but it can never silently bypass the gate.

site=false
frontend=false
server=false
shared=false
universal=false
unknown=false

set_all() {
  site=true
  frontend=true
  server=true
  shared=true
  universal=true
}

if [[ "${1:-}" == "--all" ]]; then
  set_all
else
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue

    case "$path" in
      # Documentation / repository metadata. docs/api/openapi.yaml is still
      # guarded by the always-on Repo sanity job.
      docs/*|README.md|README.zh.md|AGENTS.md|CLAUDE.md|.gitignore|.hintrc|\
      .github/PULL_REQUEST_TEMPLATE.md|.github/CODEOWNERS|LICENSE|design-qa.md)
        ;;

      # The classifier and the main workflow are protected by the always-on
      # classifier regression test and YAML parsing; changing them should not
      # wake every heavyweight product lane.
      .github/workflows/ci.yml|scripts/ci-classify.sh|scripts/test-ci-classify.sh)
        ;;

      # Other workflow-only changes are owned by their own workflow or are
      # manually dispatched. Main product CI does not need to rebuild code.
      .github/workflows/*)
        ;;

      # Marketing / documentation site.
      site/*|test/site-*.test.mjs|scripts/sync-site-chrome.mjs)
        site=true
        ;;

      # Root Node tooling is consumed by Repo sanity and Site.
      package.json|package-lock.json)
        site=true
        ;;

      # Universal-App Playwright harness lives under frontend but does not
      # exercise the legacy SPA.
      frontend/e2e/universal-*.spec.mjs|frontend/e2e/_universal-helpers.mjs|\
      frontend/playwright.universal.config.mjs|frontend/scripts/run-universal-smoke.mjs)
        universal=true
        ;;

      # Frontend dependency changes affect both the SPA and the Universal App
      # smoke harness, which installs Playwright from this lockfile.
      frontend/package.json|frontend/package-lock.json)
        frontend=true
        universal=true
        ;;

      frontend/*)
        frontend=true
        ;;

      server/*|prompts/*)
        server=true
        ;;

      apps/socrates/*)
        universal=true
        ;;

      # packages/ is shared source. Be conservative because the dependency
      # graph is intentionally source-linked rather than published packages.
      packages/*)
        frontend=true
        server=true
        shared=true
        universal=true
        ;;

      # Rust protocol is tested directly and the SPA consumes the WASM build.
      tools-rust/*)
        frontend=true
        shared=true
        ;;

      # Shared root guards with known ownership.
      scripts/check-bundle-size.mjs|scripts/check-explicit-any.mjs|\
      scripts/gen-csp-hashes.mjs|scripts/check-doc-paths.mjs|\
      scripts/check-forwarding-shims.mjs)
        frontend=true
        ;;

      scripts/check-packages-dom.mjs)
        frontend=true
        universal=true
        ;;

      scripts/check-drizzle-drift.mjs)
        server=true
        ;;

      scripts/coverage-ratchet.mjs)
        frontend=true
        server=true
        ;;

      # These are executed by the always-on Repo sanity lane.
      scripts/check-openapi-drift.mjs|scripts/generate-site-openapi.mjs|\
      scripts/test-verify-sbom.mjs|scripts/test-deploy-flow.sh|test/site-openapi.test.mjs)
        ;;

      *)
        echo "unclassified CI path: $path — enabling the full gate" >&2
        unknown=true
        ;;
    esac
  done

  if [[ "$unknown" == true ]]; then
    set_all
  fi
fi

printf 'site=%s\n' "$site"
printf 'frontend=%s\n' "$frontend"
printf 'server=%s\n' "$server"
printf 'shared=%s\n' "$shared"
printf 'universal=%s\n' "$universal"
