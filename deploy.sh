#!/usr/bin/env bash
# deploy.sh — sync local source to topodrive.top web root + restart backend
# Usage:  ./deploy.sh                      # build frontend + deploy everything
#   or:   ./deploy.sh /path/to/index.html  # legacy: deploy a single SPA file
#
# Production path: app.topodrive.top is served from
# /var/www/app.topodrive.top/. The frontend/ project bundles with Vite
# to frontend/dist/, and we copy the bundle into that web root.

set -Eeuo pipefail

# ─── Scope selection ───────────────────────────────────────────────────
#   ./deploy.sh                     full release: SPA + backend + migrations
#   ./deploy.sh --site-only         publish only the marketing site
#   ./deploy.sh --site-only --dry-run
#                                   validate the marketing site, write nothing
#   ./deploy.sh /path/to/index.html legacy: publish one prebuilt SPA document
#
# --site-only publishes the static marketing tree (topodrive.top) and
# nothing else: no frontend build, no database migration, no backend
# restart, no nginx reload. It still takes the deploy lock, so it cannot
# interleave with a full release.
#
# --dry-run is only implemented for the site scope. It used to mean "skip
# the merge gate and then deploy everything anyway", which was a footgun;
# outside --site-only it is now refused outright.
deploy_usage() {
  cat <<'EOF'
deploy.sh — publish the Socrates web properties.

Usage:
  ./deploy.sh                          full release: SPA bundle + backend
                                       (frontend build, migrations, restart)
  ./deploy.sh --site-only              publish only the marketing site
                                       (topodrive.top) — no SPA build, no
                                       migration, no backend restart
  ./deploy.sh --site-only --dry-run    validate the marketing site tree and
                                       report what would be published, without
                                       writing anything
  ./deploy.sh --site-only --require-merge-gate
                                       also enforce the repo merge gate on the
                                       site-only path (off by default: no CI
                                       workflow covers site/)
  ./deploy.sh /path/to/index.html      legacy: publish one prebuilt SPA doc

Environment:
  SITE_DIR            source tree for the marketing site
  SITE_WEB_ROOT       published location of the marketing site
  SITE_PUBLIC_URL     public base URL used by the site-only health gate
EOF
}

DEPLOY_SCOPE="full"
DRY_RUN="${DRY_RUN:-0}"
SITE_REQUIRE_MERGE_GATE=0
for arg in "$@"; do
  case "$arg" in
    --site-only)
      DEPLOY_SCOPE="site"
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --require-merge-gate)
      SITE_REQUIRE_MERGE_GATE=1
      ;;
    -h|--help)
      deploy_usage
      exit 0
      ;;
    --*)
      echo "ERROR: unknown option '$arg'" >&2
      echo "Run './deploy.sh --help' for the supported options." >&2
      exit 2
      ;;
    *)
      # Legacy positional: a path to a prebuilt SPA document. Handled
      # further down by the single-file publish path.
      ;;
  esac
done

if [[ "$DRY_RUN" == "1" && "$DEPLOY_SCOPE" != "site" ]]; then
  echo "ERROR: --dry-run is only supported together with --site-only." >&2
  echo "       A full release touches the SPA bundle, the database and the" >&2
  echo "       backend service, and cannot be rehearsed without writing." >&2
  echo "       Use: ./deploy.sh --site-only --dry-run" >&2
  exit 2
fi


# ─── Marketing site publisher ─────────────────────────────────────────
# Publish the static marketing tree into its own web root. Kept above the
# backend build so the --site-only path can publish exactly this tree
# without compiling or restarting anything.

# Snapshot every page and stylesheet we publish, so a failed health gate
# can restore the previous site. backup_previous() only keeps the SPA-style
# index.html, which is not enough to roll back ~50 marketing pages.
backup_site_previous() {
  [[ -d "$SITE_WEB_ROOT" ]] || { echo ""; return 0; }
  local stamp dest f rel
  stamp=$(date +%Y%m%d-%H%M%S)
  dest="$SITE_WEB_ROOT/.previous/site-$stamp"
  $SUDO mkdir -p "$dest"
  while IFS= read -r -d '' f; do
    rel="${f#"$SITE_WEB_ROOT"/}"
    $SUDO mkdir -p "$dest/$(dirname "$rel")"
    $SUDO cp -a "$f" "$dest/$rel"
  done < <(find "$SITE_WEB_ROOT" -maxdepth 3 \( -name '*.html' -o -name '*.css' \) -print0)
  echo "$dest"
}

# Restore the snapshot taken before a failed publish.
restore_site_previous() {
  local snap="$1" f rel
  [[ -n "$snap" && -d "$snap" ]] || return 0
  echo "Restoring the previous marketing site from $snap…" >&2
  while IFS= read -r -d '' f; do
    rel="${f#"$snap"/}"
    $SUDO mkdir -p "$SITE_WEB_ROOT/$(dirname "$rel")"
    $SUDO cp -a "$f" "$SITE_WEB_ROOT/$rel"
  done < <(find "$snap" -type f -print0)
}

# Every internal reference in the published tree must resolve to a file we
# actually publish. nginx serves the tree with
#   try_files $uri $uri.html $uri/ =404
# so a reference is live only when one of those three candidates exists.
site_link_check() {
  local broken=0 checked=0 html ref abs
  while IFS= read -r -d '' html; do
    while IFS= read -r ref; do
      case "$ref" in
        http*|//*|mailto:*|tel:*|data:*|javascript:*) continue ;;
      esac
      [[ "$ref" == \#* ]] && continue
      ref="${ref%%#*}"
      ref="${ref%%\?*}"
      [[ -z "$ref" ]] && continue
      case "$ref" in
        /api/*|/assets/*) continue ;;
      esac
      if [[ "$ref" == /* ]]; then
        abs=$(realpath -m "$SITE_DIR$ref")
      else
        abs=$(realpath -m "$(dirname "$html")/$ref")
      fi
      checked=$((checked + 1))
      if [[ -e "$abs" || -e "$abs.html" || -e "$abs/index.html" ]]; then
        continue
      fi
      echo "  BROKEN ${html#"$SITE_DIR"/} -> $ref" >&2
      broken=$((broken + 1))
    done < <(grep -oE '(href|src)="[^"]*"' "$html" | sed -E 's/^(href|src)="//; s/"$//')
  done < <(find "$SITE_DIR" -name '*.html' -print0)
  echo "  checked $checked internal references across the site tree"
  [[ "$broken" -eq 0 ]]
}

# Assert that the origin actually serves the page we just wrote. The HTML
# is cached at the edge for 5 minutes, so the probe carries a cache-buster
# to read through the CDN to nginx instead of a stale edge copy.
site_content_check() {
  local label="$1" url="$2" needle="$3"
  local body code
  body=$(curl -s --max-time 12 "${url}?cb=$(date +%s%N)" || echo "")
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "${url}?cb=$(date +%s%N)" || echo 000)
  if [[ ! "$code" =~ ^2 ]]; then
    GATE_RESULTS+=("  $label $code  ← FAIL")
    echo "GATE FAIL: $label returned $code ($url)" >&2
    GATE_FAILED=1
    return 1
  fi
  if [[ -n "$needle" && "$body" != *"$needle"* ]]; then
    GATE_RESULTS+=("  $label content MISMATCH  ← FAIL")
    echo "GATE FAIL: $label did not serve the expected content ('$needle') ($url)" >&2
    GATE_FAILED=1
    return 1
  fi
  GATE_RESULTS+=("  $label $code ok")
  return 0
}

# Publish the marketing site and nothing else.
# backup_previous() used to live below the site branch, where the full
# release path called it but the --site-only path could not: bash resolves
# a function at call time, so a definition after the call site is invisible.

backup_previous() {
  local web_root="$1"
  [[ -d "$web_root" ]] || return 0
  $SUDO mkdir -p "$web_root/.previous"
  # Stable-name files (e.g. /var/www/topodrive.top/index.html) copy as
  # themselves; versioned files (index.<TS>.html) keep their timestamp.
  for f in "$web_root"/index*.html "$web_root"/index*.html.gz "$web_root"/index*.html.br "$web_root"/status*.html; do
    [[ -f "$f" ]] || continue
    $SUDO cp -a "$f" "$web_root/.previous/$(basename "$f")"
  done
  if [[ -d "$web_root/assets" ]]; then
    $SUDO rm -rf "$web_root/.previous/assets"
    $SUDO cp -a "$web_root/assets" "$web_root/.previous/assets"
  fi
}

run_site_only_deploy() {
  local snapshot html_pages

  echo "══ marketing site only ══"
  echo "  source:  $SITE_DIR"
  echo "  webroot: $SITE_WEB_ROOT"

  if [[ ! -d "$SITE_DIR" ]]; then
    echo "ERROR: site source directory not found: $SITE_DIR" >&2
    exit 1
  fi

  echo "── pre-flight ──"
  # The repo merge gate covers the SPA and the server; no CI workflow
  # covers site/, so it says nothing about the bytes this path publishes.
  # It is therefore informational here unless the operator asks for it.
  if [[ "$SITE_REQUIRE_MERGE_GATE" == "1" ]]; then
    ci_gate_check "$(dirname "$(readlink -f "$0")")"
  else
    echo "  ci.gate  not applicable — no CI workflow covers site/"
    DEPLOY_CI_GATE_STATUS="not-applicable:site-only"
  fi

  if ! site_link_check; then
    echo "ERROR: refusing to publish — the site tree has unresolved internal references." >&2
    exit 1
  fi

  html_pages=$(find "$SITE_DIR" -name '*.html' | wc -l)
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "── dry run ──"
    echo "  would publish $html_pages HTML pages from $SITE_DIR"
    echo "  no files were written"
    # Must exit the script, not just this function: falling through would
    # continue into the full release pipeline and publish the SPA bundle,
    # the database migrations and the backend as well.
    exit 0
  fi

  # Snapshot first: a failed gate restores from here.
  snapshot=$(backup_site_previous)
  echo "  snapshot: ${snapshot:-<none>}"

  deploy_marketing_site

  echo "── gate ──"
  site_content_check "site home          " "${SITE_PUBLIC_URL%/}/"                          'href="/pricing"'
  site_content_check "site product       " "${SITE_PUBLIC_URL%/}/product"                   'href="/pricing"'
  site_content_check "site zh home       " "${SITE_PUBLIC_URL%/}/zh/"                       'href="/zh/pricing"'
  site_content_check "site research note " "${SITE_PUBLIC_URL%/}/research/memory-recall/"  'The route back to an idea'
  site_content_check "site pricing       " "${SITE_PUBLIC_URL%/}/pricing"                   'Pricing'

  if [[ $GATE_FAILED -ne 0 ]]; then
    echo "ERROR: the marketing site failed its health gate — restoring the previous pages." >&2
    restore_site_previous "$snapshot"
    exit 1
  fi

  # Record the site-only release separately. The main .deploy-state.json
  # describes a full release (SPA bundle, migrations, backend); claiming
  # those checks here would be false.
  local state_tmp commit dirty ts tmp
  state_tmp="${STATE_FILE%.json}.site.json"
  commit=$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse HEAD 2>/dev/null || echo unknown)
  # `grep -c` prints the count but exits 1 when the count is zero, so the
  # fallback must swallow the exit code without printing a second number:
  # `|| echo 0` wrote "0\n0" into the state file and left it unparseable.
  dirty=$(git -C "$(dirname "$(readlink -f "$0")")" status --porcelain=v1 --untracked-files=all 2>/dev/null | grep -c . || true)
  dirty=${dirty:-0}
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  tmp=$(mktemp "${state_tmp}.XXXXXX.tmp")
  cat > "$tmp" <<EOF
{
  "lastSuccessfulSiteDeploy": {
    "commit": "${commit}",
    "worktreeDirtyFiles": ${dirty},
    "timestamp": "${ts}",
    "htmlPages": ${html_pages},
    "snapshot": "${snapshot}",
    "ciGate": "${DEPLOY_CI_GATE_STATUS}",
    "checks": {
      "siteHomeReachable": true,
      "siteProductReachable": true,
      "siteZhHomeReachable": true,
      "siteResearchNoteReachable": true,
      "sitePricingReachable": true,
      "internalReferencesResolved": true
    }
  }
}
EOF
  mv "$tmp" "$state_tmp"

  echo "─── gate ───"
  printf '%s\n' "${GATE_RESULTS[@]}"
  echo "────────────"
  echo "✓ marketing site published ($html_pages pages)"
  echo "  url:    ${SITE_PUBLIC_URL%/}/"
  echo "  state:  $state_tmp"
  echo "  rollback: ${snapshot:-<none>}"
  echo "  note:   edge caches HTML for 5 minutes; a hard refresh may be needed."
  exit 0
}

deploy_marketing_site() {
  if [ -d "$SITE_DIR" ]; then
    backup_previous "$SITE_WEB_ROOT"
    $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/base.css" "$SITE_WEB_ROOT/base.css"
    $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/index.html" "$SITE_WEB_ROOT/index.html"
    for page in pricing guide about contact terms privacy account api-keys profile checkout announcements documents learn principles product research developers; do
      if [ -f "$SITE_DIR/$page.html" ]; then
        $SUDO install -m 644 -o www-data -g www-data "$SITE_DIR/$page.html" "$SITE_WEB_ROOT/$page.html"
      fi
    done
    if [ -d "$SITE_DIR/zh" ]; then
      $SUDO mkdir -p "$SITE_WEB_ROOT/zh"
      for page in index pricing guide about contact terms privacy checkout account api-keys profile announcements documents learn principles product research developers; do
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
}

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
# Where the generated SPA Content-Security-Policy snippet is installed.
# Overridable so the install path can be exercised outside production.
NGINX_SNIPPETS_DIR="${NGINX_SNIPPETS_DIR:-/etc/nginx/snippets}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-${XDG_RUNTIME_DIR:-/tmp}/socrates-deploy.lock}"
STATE_FILE="${STATE_FILE:-/home/ubuntu/User/Socrates/.deploy-state.json}"
BACKEND_ARTIFACT_DIR="${BACKEND_ARTIFACT_DIR:-}"
FRONTEND_ARTIFACT_DIR="${FRONTEND_ARTIFACT_DIR:-}"
ASSET_RETENTION_DAYS="${ASSET_RETENTION_DAYS:-30}"
if [[ ! "$ASSET_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "ERROR: ASSET_RETENTION_DAYS must be a non-negative integer" >&2
  exit 1
fi

# ─── Transient proxy bypass ──────────────────────────────────────
# The deploy gate probes public URLs. A locally configured HTTP(S)_PROXY
# (e.g. a Clash/privoxy sidecar) routes those probes through an egress
# that Cloudflare answers with a 403 challenge, so the gate misreads a
# healthy site as down. Detect a proxy in the environment and temporarily
# unset it for this process only — the parent shell keeps its proxy; the
# values are restored on exit. Set DEPLOY_BYPASS_PROXY=0 to keep using a
# proxy throughout the run (e.g. on hosts that need it to reach npm).
DEPLOY_BYPASS_PROXY="${DEPLOY_BYPASS_PROXY:-1}"
if [[ "$DEPLOY_BYPASS_PROXY" == "1" ]]; then
  PROXY_VARS=(HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy)
  DEPLOY_PROXY_RESTORE=()
  for proxy_var in "${PROXY_VARS[@]}"; do
    if [[ -n "${!proxy_var:-}" ]]; then
      DEPLOY_PROXY_RESTORE+=("$proxy_var=${!proxy_var}")
      unset "$proxy_var"
    fi
  done
  if (( ${#DEPLOY_PROXY_RESTORE[@]} > 0 )); then
    echo "deploy: proxy detected — temporarily bypassing for this run (restored on exit)" >&2
  fi
  restore_deploy_proxy() {
    local assignment
    for assignment in "${DEPLOY_PROXY_RESTORE[@]}"; do
      export "$assignment"
    done
  }
fi

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

# ─── Workspace agent runtime ─────────────────────────────────────────
# The conversational and scheduled workspace agent runs on the Pi coding
# agent. This deploy writes a systemd drop-in with the resolved pi binary,
# the workspace root, and the writable paths; no Codex runtime is installed.
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

# ─── 0a. Merge-gate check: the deployed commit must be green on CI ──────
# The health gates further down verify only that the *running* system answers
# correctly; nothing here can detect that the merge gate has been red for days
# (2026-10-19: 40 consecutive red CI runs on main shipped to production). This
# gate closes that gap: refuse to deploy a commit whose CI has not passed.
#
# Bypasses, in order of intent:
#   DEPLOY_SKIP_CI_CHECK=1  — an explicit, per-invocation override. Logged, and
#                             recorded in .deploy-state.json so an audited
#                             bypass is visible after the fact.
#   --dry-run               — the whole dry-run path is unaffected.
#   Missing git/gh or an unresolvable HEAD fails closed; only the explicit
#                             operator override or dry-run bypasses this gate.
# Treats "no run found for this commit" as a failure: an unpushed or
# force-pushed commit has no gate result, which is exactly the case to catch.
#
# The names below are workflow FILE names, not the `name:` shown in the UI.
# Two reasons: "CI Security" was never one of them, so
# `gh run list --workflow "CI Security"` exits non-zero with "could not find
# any workflows named CI Security" and the gate could never verify anything;
# and the list is space separated, while the Server CI workflow is *named*
# "Server CI" — a name with a space would split into "Server" and "CI", and
# "Server" is not a workflow either. The file names contain no spaces.
# gh accepts either form; the file names are the unambiguous one.
#
# Only workflows that run on EVERY push to main belong here. server-ci.yml is
# filtered to server/**, so a commit that does not touch the server (a
# deploy.sh fix, say) legitimately has no run for it and the gate would
# refuse forever. The server lane is still covered: ci.yml's own Server job
# runs on every commit that touches server/**.
REQUIRED_CI_WORKFLOWS="${REQUIRED_CI_WORKFLOWS:-ci.yml security.yml}"
ci_gate_check() {
  local source_dir="$1"
  local skip="${DEPLOY_SKIP_CI_CHECK:-0}"

  if [[ "$skip" == "1" ]]; then
    echo "  ci.gate  SKIPPED by DEPLOY_SKIP_CI_CHECK=1 (override, will be recorded)" >&2
    DEPLOY_CI_GATE_STATUS="skipped-by-operator"
    return 0
  fi
  if [[ "${1:-}" == "--dry-run" ]] || [[ "${DRY_RUN:-0}" == "1" ]]; then
    return 0
  fi
  if ! command -v git >/dev/null 2>&1 || ! command -v gh >/dev/null 2>&1; then
    echo "ERROR: refusing to deploy — git and gh are required to verify the merge gate." >&2
    echo "       Install the missing command(s), or set DEPLOY_SKIP_CI_CHECK=1 to override deliberately." >&2
    DEPLOY_CI_GATE_STATUS="unverified-missing-git-or-gh"
    return 1
  fi

  local commit
  commit=$(git -C "$source_dir" rev-parse HEAD 2>/dev/null || true)
  if [[ -z "$commit" ]]; then
    echo "ERROR: refusing to deploy — cannot resolve HEAD in $source_dir; cannot verify the merge gate." >&2
    echo "       Ensure this is a valid Git checkout, or set DEPLOY_SKIP_CI_CHECK=1 to override deliberately." >&2
    DEPLOY_CI_GATE_STATUS="unverified-no-head"
    return 1
  fi

  local short="${commit:0:8}"
  local failed=""
  local missing=""
  local errored=""
  for wf in $REQUIRED_CI_WORKFLOWS; do
    # --commit filters to runs for this exact SHA; take the newest attempt.
    # Judge failure by gh's exit status, not by stderr being non-empty: gh can
    # emit warnings on a perfectly good query. Capture stderr separately so an
    # API/network failure is reported as "could not verify" rather than being
    # confused with "no run exists" — they need different operator responses
    # (retry vs. push CI).
    local status err rc
    err=$(mktemp)
    set +e
    status=$(cd "$source_dir" && gh run list --workflow "$wf" --commit "$commit" --limit 1 \
      --json conclusion -q '.[0].conclusion // empty' 2>"$err")
    rc=$?
    set -e
    if [[ $rc -ne 0 ]]; then
      errored="$errored $wf($(head -1 "$err" | tr -d '\n' | cut -c1-80))"
    fi
    rm -f "$err"
    case "$status" in
      success) echo "  ci.gate  $wf: success" ;;
      "")      [[ -z "$errored" ]] && missing="$missing $wf" ;;
      *)       failed="$failed $wf($status)" ;;
    esac
  done

  if [[ -n "$failed" || -n "$missing" ]]; then
    echo "ERROR: refusing to deploy ${short} — merge gate is not green." >&2
    [[ -n "$failed" ]]  && echo "       failing: $failed" >&2
    [[ -n "$missing" ]] && echo "       no completed run for this commit: $missing" >&2
    echo "       Fix CI, or re-run with DEPLOY_SKIP_CI_CHECK=1 to override" >&2
    echo "       deliberately (the override is recorded in .deploy-state.json)." >&2
    DEPLOY_CI_GATE_STATUS="blocked:$failed$missing"
    return 1
  fi
  if [[ -n "$errored" ]]; then
    # Not proof of a red gate, but not proof of a green one either. Fail
    # closed: an unverifiable gate must not silently become a passing gate.
    echo "ERROR: refusing to deploy ${short} — could not verify the merge gate." >&2
    echo "       gh API errors for:$errored" >&2
    echo "       This is a transport failure, not a CI verdict. Retry once" >&2
    echo "       network is healthy, or set DEPLOY_SKIP_CI_CHECK=1 to deploy" >&2
    echo "       deliberately (the override is recorded in .deploy-state.json)." >&2
    DEPLOY_CI_GATE_STATUS="unverified:$errored"
    return 1
  fi

  echo "  ci.gate  all required workflows green for ${short}"
  DEPLOY_CI_GATE_STATUS="green"
  return 0
}

DEPLOY_CI_GATE_STATUS="not-run"

# ─── Shared health-gate helpers ────────────────────────────────────────
# Both the full release and the site-only release assert against live
# URLs. The helper lives here so the site-only path can use it before the
# SPA-specific gates further down are reached.
GATE_FAILED=0
GATE_RESULTS=()
# Public reachability of the status hostname, filled in by
# status_page_gate_check() and recorded in .deploy-state.json.
STATUS_PUBLIC_DNS_STATE="unknown"
STATUS_PUBLIC_REACHABLE=false

gate_check() {
  local label="$1" url="$2"; shift 2
  local code=""
  local attempts=1
  local attempt

  # nginx reloads gracefully and EdgeOne can briefly route a request to an
  # old worker. Retry only the app entry gate so that a short handoff window
  # does not turn an otherwise valid release into a false failure.
  # `mobile api + db` joins it because it closes the same versioned-path run
  # against a backend restarted moments earlier: a cold first request there
  # can exceed the 8s curl budget exactly as it can for mobile.bootstrap.
  case "$label" in
    "app frontend        "|"mobile api + db     "|"status page         ")
      attempts="${APP_GATE_ATTEMPTS:-3}"
      ;;
  esac

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

# ─── Status page gate ──────────────────────────────────────────────────
# The status page is a static artifact: this release installs
# $STATUS_DIR/status.<TS>.html and rewrites the nginx vhost's try_files to
# point at it. Two things can be wrong, and they need different reactions.
#
#   1. The release published a broken artifact — the file was not installed,
#      nginx still resolves try_files to the previous build, the vhost
#      errors, or the status feed behind it is down. That is the release's
#      own responsibility, so it blocks the release.
#
#   2. The public hostname has no DNS record. The zone lives in DNSPod, and a
#      missing A record is repaired in the DNS console — neither the
#      repository nor this script can do it. Blocking every release on that
#      makes the pipeline unshippable, so it is reported loudly and left to
#      the operator instead.
#
# The origin probe talks to the local nginx with the real SNI and Host, so it
# exercises the exact vhost, certificate and try_files path the public
# hostname uses, and it compares the served bytes with the file this release
# installed. A public hostname that resolves but misbehaves stays a hard
# failure.
#
# STATUS_GATE_REQUIRE_PUBLIC=1 restores the strict "the public URL must
# answer 2xx" behaviour even when the hostname does not resolve.
status_page_gate_check() {
  local label="status page         "
  local url="${STATUS_PUBLIC_URL%/}/"
  local scheme="${STATUS_PUBLIC_URL%%://*}"
  local authority="${STATUS_PUBLIC_URL#*://}"
  authority="${authority%%/*}"
  local host="$authority"
  local port=""
  if [[ "$authority" == *:* ]]; then
    port="${authority##*:}"
    host="${authority%%:*}"
  fi
  if [[ -z "$port" ]]; then
    port=443
    [[ "$scheme" == "http" ]] && port=80
  fi

  if [[ "$scheme" != "http" && "$scheme" != "https" ]] || [[ -z "$host" ]] || [[ "$host" == */* ]]; then
    echo "GATE FAIL: STATUS_PUBLIC_URL is not a usable URL ($STATUS_PUBLIC_URL)" >&2
    GATE_RESULTS+=("  $label unusable STATUS_PUBLIC_URL  ← FAIL")
    GATE_FAILED=1
    return 0
  fi

  local probe=(--max-time 8 --noproxy '*' --resolve "$host:$port:127.0.0.1")
  local tmp
  tmp=$(mktemp)
  local code
  code=$(curl -s "${probe[@]}" -o "$tmp" -w '%{http_code}' "$url" || echo 000)
  if [[ ! "$code" =~ ^2 ]]; then
    echo "GATE FAIL: status page origin returned $code ($url via the local nginx vhost)" >&2
    GATE_RESULTS+=("  $label origin $code  ← FAIL")
    GATE_FAILED=1
    rm -f "$tmp"
    return 0
  fi

  if [[ -n "${STATUS_FILE:-}" && -f "$STATUS_DIR/$STATUS_FILE" ]]; then
    local deployed_md5 served_md5
    deployed_md5=$(md5sum "$STATUS_DIR/$STATUS_FILE" | cut -d' ' -f1)
    served_md5=$(md5sum "$tmp" | cut -d' ' -f1)
    if [[ "$deployed_md5" != "$served_md5" ]]; then
      echo "GATE FAIL: status page origin serves $served_md5 but this release installed $deployed_md5 (stale try_files?)" >&2
      GATE_RESULTS+=("  $label artifact MISMATCH  ← FAIL")
      GATE_FAILED=1
      rm -f "$tmp"
      return 0
    fi
    GATE_RESULTS+=("  $label artifact matches $STATUS_FILE")
  fi
  rm -f "$tmp"

  local feed_code
  feed_code=$(curl -s "${probe[@]}" -o /dev/null -w '%{http_code}' "$scheme://$authority/api/status" || echo 000)
  if [[ ! "$feed_code" =~ ^2 ]]; then
    echo "GATE FAIL: status feed returned $feed_code ($scheme://$authority/api/status)" >&2
    GATE_RESULTS+=("  $label feed $feed_code  ← FAIL")
    GATE_FAILED=1
    return 0
  fi
  GATE_RESULTS+=("  $label feed $feed_code")

  local resolved="" dns_rc=0
  if command -v timeout >/dev/null 2>&1; then
    resolved=$(timeout 15 getent hosts "$host" 2>/dev/null) || dns_rc=$?
  else
    resolved=$(getent hosts "$host" 2>/dev/null) || dns_rc=$?
  fi
  resolved=$(printf '%s' "$resolved" | awk 'NR==1{print $1}')
  if [[ "$dns_rc" != "0" && "$dns_rc" != "2" ]]; then
    # The lookup itself failed (resolver down, timeout, ...) — that is not the
    # same as "this hostname has no record", and it must not downgrade a check
    # the release could not perform.
    echo "GATE FAIL: DNS lookup for $host failed (rc=$dns_rc)" >&2
    GATE_RESULTS+=("  $label DNS lookup failed (rc=$dns_rc)  ← FAIL")
    GATE_FAILED=1
    return 0
  fi
  STATUS_PUBLIC_DNS_STATE="unresolved"
  if [[ -n "$resolved" ]]; then
    STATUS_PUBLIC_DNS_STATE="resolved"
    STATUS_PUBLIC_REACHABLE=false
    local failed_before="${GATE_FAILED:-0}"
    gate_check "$label" "$url"
    if [[ "${GATE_FAILED:-0}" == "$failed_before" ]]; then
      STATUS_PUBLIC_REACHABLE=true
    fi
    return 0
  fi

  if [[ "${STATUS_GATE_REQUIRE_PUBLIC:-0}" == "1" ]]; then
    echo "GATE FAIL: status hostname $host does not resolve in DNS (STATUS_GATE_REQUIRE_PUBLIC=1)" >&2
    GATE_RESULTS+=("  $label DNS unresolved (strict)  ← FAIL")
    GATE_FAILED=1
    return 0
  fi

  local app_host app_ip
  app_host="${APP_PUBLIC_URL#*://}"
  app_host="${app_host%%/*}"
  app_host="${app_host%%:*}"
  # `set -o pipefail` makes a failing lookup fail the whole pipeline, so the
  # lookup is guarded — a missing app record only costs the hint line.
  app_ip=$( { getent hosts "$app_host" 2>/dev/null || true; } | awk 'NR==1{print $1}')
  echo "GATE WARN: status hostname $host has no DNS record — the status page is served correctly by the origin, but https://$host/ is unreachable from the public internet." >&2
  if [[ -n "$app_ip" ]]; then
    echo "         fix: add an A record $host -> $app_ip in the DNSPod zone for topodrive.top (DNS console access is required; the repository cannot do it)." >&2
  fi
  GATE_RESULTS+=("  $label origin ok (public DNS missing for $host)")
}

# ─── Site-only release ─────────────────────────────────────────────────
# Everything above this point is scope-neutral: the deploy lock is held,
# sudo has been resolved and the shared gate helpers exist. The site-only
# path publishes the marketing tree and exits — no frontend build, no
# migration, no backend restart, no nginx reload — so the repo merge gate
# (which covers the SPA and the server, not site/) is left to the full
# release below.
if [[ "$DEPLOY_SCOPE" == "site" ]]; then
  run_site_only_deploy
  # run_site_only_deploy always exits. If it ever returns instead, fail
  # loudly rather than falling through into the full release pipeline.
  echo "ERROR: site-only release returned without completing" >&2
  exit 1
fi

ci_gate_check "$(dirname "$(readlink -f "$0")")"

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

# Read the SPA entry filename that nginx currently falls back to. The new
# bundle is copied into the web root and nginx is re-pointed BEFORE the health
# gate runs, so a failed gate has to put the previous entry back — otherwise
# the new SPA stays live against a rolled-back backend, which is a guaranteed
# half-deploy (new UI, old /api/v2).
current_app_index_target() {
  local conf
  for conf in "${APP_NGINX_CONFIGS[@]}"; do
    [[ -f "$conf" ]] || continue
    local found
    found=$($SUDO grep -oE 'try_files[[:space:]]+\$uri[[:space:]]+/index\.[0-9]+\.html;' "$conf" 2>/dev/null | head -1 | grep -oE 'index\.[0-9]+\.html' || true)
    if [[ -n "$found" ]]; then
      echo "$found"
      return 0
    fi
  done
  return 1
}

# Restore the SPA bundle that was live before this deploy.
rollback_frontend() {
  local previous="$1"
  if [[ -z "$previous" ]]; then
    echo "ERROR: no previous SPA entry was recorded; cannot restore the frontend automatically" >&2
    return 1
  fi
  if [[ ! -f "$APP_WEB_ROOT/.previous/$previous" ]]; then
    echo "ERROR: previous SPA entry $previous is missing from $APP_WEB_ROOT/.previous/" >&2
    return 1
  fi

  echo "Restoring the previous SPA entry: $previous" >&2
  $SUDO cp -a "$APP_WEB_ROOT/.previous/$previous" "$APP_WEB_ROOT/$previous"
  for sibling in "$previous.gz" "$previous.br"; do
    if [[ -f "$APP_WEB_ROOT/.previous/$sibling" ]]; then
      $SUDO cp -a "$APP_WEB_ROOT/.previous/$sibling" "$APP_WEB_ROOT/$sibling"
    fi
  done

  if ! set_app_index_target "$previous"; then
    echo "ERROR: failed to re-point nginx at $previous" >&2
    return 1
  fi
  if ! $SUDO nginx -t >/dev/null 2>&1; then
    echo "ERROR: nginx config is invalid after the frontend rollback" >&2
    return 1
  fi
  $SUDO nginx -s reload >/dev/null 2>&1 || echo "WARNING: nginx did not reload after the frontend rollback" >&2
}

# ─── Content-Security-Policy for the SPA document ─────────────────────
#
# Why this lives in deploy.sh: nginx serves the SPA from $APP_WEB_ROOT, so
# the helmet CSP that server/src/app.ts sets never reaches the SPA document
# — it only covers the /api/v2 responses. Verified against production on
# 2026-09-25: `curl -sI https://app.topodrive.top/` returned
# Strict-Transport-Security but NO Content-Security-Policy. Leaving the
# install as a manual operator step would mean the header silently goes
# stale every time frontend/index.html's pre-paint scripts change, because
# the policy pins their sha256 hashes.
#
# ops/nginx/csp-spa.conf is generated by scripts/gen-csp-hashes.mjs from the
# same directive map helmet uses, and `npm run lint` in frontend/ fails when
# the two drift. This function ships that artifact and wires it in.
#
# Safety properties:
#   - Installing the snippet file alone is inert: an nginx snippet that is
#     never `include`d has no effect. So the copy is unconditional and safe.
#   - The `include` lines are inserted by ops/nginx/insert-csp-include.awk,
#     which walks brace depth and edits only location blocks that actually
#     serve HTML. Editing is BACKUP-FIRST and `nginx -t` runs against the
#     result immediately; on any failure the original config is restored
#     before returning non-zero, so a bad edit can never reach
#     `nginx -s reload` further down.
#   - Idempotent per BLOCK, not per file: a config where only one of the two
#     HTML locations carries the include self-heals on the next deploy. A
#     file-level "is the include present anywhere" guard would leave that
#     half-applied state stuck forever.
install_spa_csp() {
  local repo_root="${FRONTEND_DIR%/frontend}"
  local src="$repo_root/ops/nginx/csp-spa.conf"
  local awk_script="$repo_root/ops/nginx/insert-csp-include.awk"
  local snippets_dir="$NGINX_SNIPPETS_DIR"
  local dest="$snippets_dir/socrates-csp-spa.conf"
  local conf backup tmp rc=0

  if [[ ! -f "$src" || ! -f "$awk_script" ]]; then
    echo "WARNING: $src or $awk_script missing — SPA will be served without a CSP." >&2
    echo "         Regenerate with: node scripts/gen-csp-hashes.mjs --update" >&2
    return 0
  fi

  $SUDO mkdir -p "$snippets_dir"
  $SUDO install -m 644 "$src" "$dest"
  echo "  csp:     $dest"

  for conf in "${APP_NGINX_CONFIGS[@]}"; do
    [[ -f "$conf" ]] || continue

    tmp="$(mktemp)"
    if ! $SUDO awk -v snippet="$dest" -f "$awk_script" "$conf" > "$tmp" 2>/dev/null; then
      echo "WARNING: could not compute the CSP include for $conf (unexpected structure)." >&2
      echo "         The SPA keeps serving without a CSP. Add manually inside each" >&2
      echo "         HTML-serving location block:  include $dest;" >&2
      rm -f "$tmp"
      continue
    fi

    # Nothing to do: already wired.
    if $SUDO cmp -s "$tmp" "$conf"; then
      rm -f "$tmp"
      continue
    fi

    backup="${conf}.pre-csp.$$"
    $SUDO cp -a "$conf" "$backup"
    $SUDO install -m 644 "$tmp" "$conf"
    rm -f "$tmp"

    if ! $SUDO nginx -t >/dev/null 2>&1; then
      echo "ERROR: nginx rejected the config after adding the CSP include;" >&2
      echo "       restoring $conf unchanged." >&2
      $SUDO cp -a "$backup" "$conf"
      $SUDO rm -f "$backup"
      rc=1
      continue
    fi

    $SUDO rm -f "$backup"
    echo "  csp:     include wired into $conf"
  done

  return $rc
}

# ─── Brand-asset caching for the SPA vhost ─────────────────────────────
#
# Why this lives in deploy.sh: /logo.png and /favicon.png used to fall
# through to `location /`, whose add_header pins
# `Cache-Control: no-cache, no-store, must-revalidate` — correct for the
# HTML document, wrong for a 2 KB PNG that the boot shell preloads and
# paints in its very first frame. Verified against production on
# 2026-10-11: `curl -sI https://app.topodrive.top/logo.png` answered
# `no-store` with `cf-cache-status: BYPASS`, so every single page load
# re-fetched it from the origin.
#
# ops/nginx/app-performance.conf.example has carried the right block since
# it was written, but nothing ever installs it, and a hand-written vhost
# that predates it never picks it up. This ships it structurally, the same
# way install_spa_csp does:
#   - Editing is BACKUP-FIRST and `nginx -t` runs against the result
#     immediately; on any failure the original config is restored before
#     returning non-zero, so a bad edit can never reach `nginx -s reload`.
#   - Idempotent per FILE: a vhost that already serves any of those
#     filenames from a location of its own is left byte-identical, so this
#     is a no-op over a config that already follows the example.
#   - ops/nginx/insert-static-cache.awk puts the block inside the server{}
#     block that owns the managed SPA fallback, so a file shared by several
#     vhosts is never edited in the wrong one.
install_static_root_cache() {
  local repo_root="${FRONTEND_DIR%/frontend}"
  local awk_script="$repo_root/ops/nginx/insert-static-cache.awk"
  local conf backup tmp rc=0

  if [[ ! -f "$awk_script" ]]; then
    echo "WARNING: $awk_script missing — brand assets keep inheriting location /'s no-store policy." >&2
    return 0
  fi

  for conf in "${APP_NGINX_CONFIGS[@]}"; do
    [[ -f "$conf" ]] || continue

    tmp="$(mktemp)"
    if ! $SUDO awk -f "$awk_script" "$conf" > "$tmp" 2>/dev/null; then
      echo "WARNING: could not compute the brand-asset location for $conf (unexpected structure)." >&2
      echo "         Add it manually from ops/nginx/app-performance.conf.example." >&2
      rm -f "$tmp"
      continue
    fi

    # Nothing to do: already wired.
    if $SUDO cmp -s "$tmp" "$conf"; then
      rm -f "$tmp"
      continue
    fi

    backup="${conf}.pre-static-cache.$$"
    $SUDO cp -a "$conf" "$backup"
    $SUDO install -m 644 "$tmp" "$conf"
    rm -f "$tmp"

    if ! $SUDO nginx -t >/dev/null 2>&1; then
      echo "ERROR: nginx rejected the config after adding the brand-asset location;" >&2
      echo "       restoring $conf unchanged." >&2
      $SUDO cp -a "$backup" "$conf"
      $SUDO rm -f "$backup"
      rc=1
      continue
    fi

    $SUDO rm -f "$backup"
    echo "  static:  brand-asset location wired into $conf"
  done

  return $rc
}

# ─── Edge-cache policy for the static SPA document ─────────────────────
# The SPA HTML is public and contains no user-specific data. Its asset URLs
# are content-hashed and the deploy keeps old assets during the retention
# window, so a short edge TTL is safe and removes a full origin round trip on
# every cold navigation. This matters especially when the hostname is behind
# a CDN whose nearest POP is outside the user's region.
install_spa_cache_policy() {
  local repo_root="${FRONTEND_DIR%/frontend}"
  local awk_script="$repo_root/ops/nginx/insert-spa-cache.awk"
  local conf backup tmp rc=0

  if [[ ! -f "$awk_script" ]]; then
    echo "WARNING: $awk_script missing — SPA HTML keeps its old cache policy." >&2
    return 0
  fi

  for conf in "${APP_NGINX_CONFIGS[@]}"; do
    [[ -f "$conf" ]] || continue

    tmp="$(mktemp)"
    if ! $SUDO awk -f "$awk_script" "$conf" > "$tmp" 2>/dev/null; then
      echo "WARNING: could not compute the SPA cache policy for $conf." >&2
      rm -f "$tmp"
      continue
    fi

    if $SUDO cmp -s "$tmp" "$conf"; then
      rm -f "$tmp"
      continue
    fi

    backup="${conf}.pre-spa-cache.$$"
    $SUDO cp -a "$conf" "$backup"
    $SUDO install -m 644 "$tmp" "$conf"
    rm -f "$tmp"

    if ! $SUDO nginx -t >/dev/null 2>&1; then
      echo "ERROR: nginx rejected the SPA cache policy; restoring $conf unchanged." >&2
      $SUDO cp -a "$backup" "$conf"
      $SUDO rm -f "$backup"
      rc=1
      continue
    fi

    $SUDO rm -f "$backup"
    echo "  cache:   SPA HTML edge policy wired into $conf"
  done

  return $rc
}
# immediately before restart. Keep one known-good dist tree for rollback.
BACKEND_DIST="$SERVER_DIR/dist"
BACKEND_PREVIOUS="$SERVER_DIR/dist.previous"
BACKEND_CANDIDATE=""
BACKEND_SWAPPED=0
BACKEND_STOPPED=0

cleanup_backend_candidate() {
  case "${BACKEND_CANDIDATE:-}" in
    "$SERVER_DIR"/.dist-next.*)
      rm -rf -- "$BACKEND_CANDIDATE"
      ;;
  esac
}
trap 'cleanup_backend_candidate; restore_deploy_proxy' EXIT

rollback_backend() {
  if [[ "$BACKEND_SWAPPED" != "1" ]]; then
    return 0
  fi
  if [[ ! -d "$BACKEND_PREVIOUS" ]]; then
    echo "ERROR: no previous backend build is available for automatic rollback." >&2
    echo "       The failed build stays live at $BACKEND_DIST — restore a known-good build by hand." >&2
    return 1
  fi

  local failed_dist="$SERVER_DIR/dist.failed.$(date +%s).$$"
  if [[ -d "$BACKEND_DIST" ]]; then
    mv "$BACKEND_DIST" "$failed_dist"
  fi
  mv "$BACKEND_PREVIOUS" "$BACKEND_DIST"
  BACKEND_SWAPPED=0

  echo "Restored previous backend build; stopping+starting socrates-api…" >&2
  $SUDO systemctl stop socrates-api 2>/dev/null || true
  BACKEND_STOPPED=1
  if ! $SUDO systemctl start socrates-api; then
    echo "ERROR: previous backend build was restored but failed to start" >&2
  else
    BACKEND_STOPPED=0
  fi
}

handle_deploy_error() {
  local exit_code=$?
  trap - ERR
  rollback_backend || true
  if [[ "$BACKEND_SWAPPED" != "1" && "$BACKEND_STOPPED" == "1" ]]; then
    if $SUDO systemctl is-active --quiet socrates-api; then
      BACKEND_STOPPED=0
    else
      echo "Restarting the existing backend after a pre-swap deploy failure…" >&2
      if $SUDO systemctl start socrates-api; then
        BACKEND_STOPPED=0
      else
        echo "ERROR: existing backend could not be restarted after deploy failure" >&2
      fi
    fi
  fi
  exit "$exit_code"
}
trap handle_deploy_error ERR

# Dependencies are part of the release input. In particular, the TypeScript
# migration adds build-only tooling that will not exist in an older checkout.
# Mavis / opencode shells export `NPM_CONFIG_ALLOW_SCRIPTS` globally so it
# reaches npm's CLI layer; npm 11 then refuses project-scoped installs with
# `EALLOWSCRIPTS` even when package.json declares `allowScripts`. Strip those
# two env entries for the install calls below so the project policy wins.
BACKEND_CANDIDATE=$(mktemp -d "$SERVER_DIR/.dist-next.XXXXXX")
if [[ -n "$BACKEND_ARTIFACT_DIR" && -f "$BACKEND_ARTIFACT_DIR/index.runtime.js" ]]; then
  echo "Using prebuilt backend artifact from $BACKEND_ARTIFACT_DIR…"
  cp -a "$BACKEND_ARTIFACT_DIR"/. "$BACKEND_CANDIDATE"/
else
  echo "Installing backend dependencies from package-lock.json…"
  (cd "$SERVER_DIR" && env -u npm_config_allow_scripts -u NPM_CONFIG_ALLOW_SCRIPTS npm ci --include=dev)
  echo "Building backend candidate (TypeScript)…"
  (cd "$SERVER_DIR" && ./node_modules/.bin/tsc -p tsconfig.build.json --outDir "$BACKEND_CANDIDATE")
fi
if [[ ! -f "$BACKEND_CANDIDATE/index.runtime.js" ]]; then
  echo "ERROR: backend candidate did not contain index.runtime.js" >&2
  exit 1
fi
# P_deploy-swap-verify — stamp the candidate with its source identity so the
# post-swap check below can prove the new tree is what actually landed. (A
# swap that silently leaves stale bytes behind is worse than a loud failure:
# every gate would keep passing against the old code.)
DEPLOY_SOURCE_DIR="$(dirname "$(readlink -f "$0")")"
BACKEND_BUILD_ID="$(git -C "$DEPLOY_SOURCE_DIR" rev-parse HEAD 2>/dev/null || echo unknown)-$(date +%s)"
echo "$BACKEND_BUILD_ID" > "$BACKEND_CANDIDATE/.build-id"

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
# Keep serving while the candidate is built. Constrained legacy hosts can
# explicitly opt into the old downtime tradeoff; prefer CI-built artifacts.
if [[ "${STOP_BACKEND_DURING_BUILD:-0}" == "1" ]]; then
  echo "Stopping backend during build (STOP_BACKEND_DURING_BUILD=1)…"
  $SUDO systemctl stop socrates-api 2>/dev/null || true
  BACKEND_STOPPED=1
fi

SRC_DESC=""
SRC_SIZE=0
SRC_MD5=""
SRC_SHA256=""

# ─── 1. Build the frontend (Vite) ─────────────────────────────────────
# Remember which SPA entry nginx serves right now. The new entry is installed
# and nginx is re-pointed before the health gate, so a failed gate must be
# able to restore this one.
APP_PREVIOUS_TARGET="$(current_app_index_target || true)"

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
  if [[ -n "$FRONTEND_ARTIFACT_DIR" && -f "$FRONTEND_ARTIFACT_DIR/index.html" ]]; then
    echo "Using prebuilt frontend artifact from $FRONTEND_ARTIFACT_DIR…"
    DIST_DIR="$FRONTEND_ARTIFACT_DIR"
  else
    # Production mode: build the Vite bundle and copy dist/* into the web root.
    echo "Installing frontend dependencies from package-lock.json…"
    (cd "$FRONTEND_DIR" && env -u npm_config_allow_scripts -u NPM_CONFIG_ALLOW_SCRIPTS npm ci --include=dev)
    echo "Building frontend (Vite)…"
    (cd "$FRONTEND_DIR" && NODE_OPTIONS="$FRONTEND_NODE_OPTIONS" npm run build 2>&1 | tail -20)
    DIST_DIR="$FRONTEND_DIR/dist"
  fi

  if [[ ! -f "$DIST_DIR/index.html" ]]; then
    echo "ERROR: frontend bundle did not contain $DIST_DIR/index.html" >&2
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

  # Verify no raw TypeScript/JSX/sourcemap files leaked into dist/
  if find "$DIST_DIR" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.map" \) -print -quit 2>/dev/null | grep -q .; then
    echo "ERROR: raw source files or sourcemaps (*.ts, *.tsx, *.jsx, *.map) detected in frontend build dist/" >&2
    exit 1
  fi

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
    [[ "$fname" == "index.html" || "$fname" == "index.html.gz" || "$fname" == "index.html.br" ]] && continue
    $SUDO install -m 644 -o www-data -g www-data "$f" "$APP_WEB_ROOT/$fname"
  done

  $SUDO install -m 644 -o www-data -g www-data "$DIST_DIR/index.html" "$APP_WEB_ROOT/$APP_FILE"
  # gzip sibling for the versioned entry — nginx gzip_static serves
  # index.<TS>.html.gz when the client accepts gzip (requires
  # `gzip_static on` in the HTML-serving location).
  if [[ -f "$DIST_DIR/index.html.gz" ]]; then
    $SUDO install -m 644 -o www-data -g www-data "$DIST_DIR/index.html.gz" "$APP_WEB_ROOT/$APP_FILE.gz"
  fi
  # brotli sibling for the versioned entry — nginx brotli_static serves
  # index.<TS>.html.br when the client accepts brotli.
  if [[ -f "$DIST_DIR/index.html.br" ]]; then
    $SUDO install -m 644 -o www-data -g www-data "$DIST_DIR/index.html.br" "$APP_WEB_ROOT/$APP_FILE.br"
  fi

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
# Published by deploy_marketing_site() (defined above).
deploy_marketing_site


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

# ─── Workspace agent runtime (Pi) ─────────────────────────────────────
# Writes the systemd drop-in: resolved pi binary, workspace root, writable
# paths. No Codex runtime is installed or started.
write_agent_dropin() {
  # Pi Agent runtime for the conversational and scheduled workspace agent.
  # Resolve the binary now so the drop-in pins an absolute path; disable the
  # tool cleanly when the host has no `pi` install instead of failing turns.
  echo "Writing systemd drop-in $CODEX_DROPIN…"
  $SUDO mkdir -p "$(dirname "$CODEX_DROPIN")"

  PI_AGENT_BIN_RESOLVED="${PI_AGENT_BIN:-}"
  if [[ -z "$PI_AGENT_BIN_RESOLVED" ]]; then
    for cand in /home/ubuntu/.volta/bin/pi /home/ubuntu/.npm-global/bin/pi /usr/local/bin/pi /usr/bin/pi; do
      if [[ -x "$cand" ]]; then PI_AGENT_BIN_RESOLVED="$cand"; break; fi
    done
  fi
  if [[ -z "$PI_AGENT_BIN_RESOLVED" ]] && command -v pi >/dev/null 2>&1; then
    PI_AGENT_BIN_RESOLVED="$(command -v pi)"
  fi
  PI_AGENT_ENABLED_VALUE=1
  PI_AGENT_BIN_DIR=""
  if [[ -n "$PI_AGENT_BIN_RESOLVED" && -x "$PI_AGENT_BIN_RESOLVED" ]]; then
    PI_AGENT_BIN_DIR="$(dirname "$PI_AGENT_BIN_RESOLVED")"
  else
    PI_AGENT_ENABLED_VALUE=0
    echo "WARNING: no pi binary found — workspace_agent will be disabled (set PI_AGENT_BIN to enable)" >&2
  fi

  $SUDO tee "$CODEX_DROPIN" >/dev/null <<EOF
[Service]
Environment=WORKSPACE_ROOT=${CODEX_HOME}/workspaces
Environment=PI_AGENT_ENABLED=${PI_AGENT_ENABLED_VALUE}
Environment="PI_AGENT_BIN=${PI_AGENT_BIN_RESOLVED}"
Environment=PATH=${PI_AGENT_BIN_DIR:+${PI_AGENT_BIN_DIR}:}/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# P_embed-killswitch — the vector layer costs one remote embedding call per
# turn on the retrieval path (chat/helpers.ts races it against a 2s budget
# before the first token). Set EMBEDDING_DISABLED=1 to fall back to BM25-only
# retrieval. The provider row, its key, and the 3k+ existing vectors are all
# left intact — unset this and restart to bring the vector layer back.
Environment=EMBEDDING_DISABLED=${EMBEDDING_DISABLED:-1}
ReadWritePaths=${CODEX_HOME}
ReadWritePaths=/home/ubuntu/.pi
EOF
  $SUDO systemctl daemon-reload
  echo "Workspace agent drop-in active (pi=${PI_AGENT_BIN_RESOLVED:-none}, home=${CODEX_HOME})"
}

if ! write_agent_dropin; then
  exit 1
fi

# ─── 3. Build swap: stop first to avoid race with systemd restart ─────
#
# Swapping dist/ while the service is running can cause the new process
# to observe a missing or partially-replaced dist/ directory.  Stop
# the unit first, swap the build tree, then start.
echo "Stopping backend service…"
$SUDO systemctl stop socrates-api 2>/dev/null || true
BACKEND_STOPPED=1

if [[ -d "$BACKEND_PREVIOUS" ]]; then
  rm -rf -- "$BACKEND_PREVIOUS"
fi
if [[ -d "$BACKEND_DIST" ]]; then
  mv "$BACKEND_DIST" "$BACKEND_PREVIOUS"
fi
mv "$BACKEND_CANDIDATE" "$BACKEND_DIST"
BACKEND_CANDIDATE=""
BACKEND_SWAPPED=1
# P_deploy-swap-verify — prove the swap landed before restarting onto it.
# If dist/ does not carry this build's stamp, stop LOUDLY instead of serving
# stale code behind green gates.
if [[ "$(cat "$BACKEND_DIST/.build-id" 2>/dev/null)" != "$BACKEND_BUILD_ID" ]]; then
  echo "ERROR: backend swap verification failed — dist/.build-id does not match this build ($BACKEND_BUILD_ID)" >&2
  echo "       dist/ was NOT updated; refusing to restart onto an unverified tree." >&2
  BACKEND_SWAPPED=0
  exit 1
fi
echo "Backend swap verified (build $BACKEND_BUILD_ID)"
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
BACKEND_STOPPED=0
# Give it a few seconds to bind, then check for startup errors.
sleep 5
if $SUDO systemctl is-active --quiet socrates-api; then
  echo "Backend running (PID $(systemctl show -p MainPID socrates-api --value))"
else
  echo "WARNING: backend failed to start — check 'sudo journalctl -u socrates-api -n 30'"
fi

# ─── 4. Validate nginx + reload ──────────────────────────────────────
# Refresh the SPA Content-Security-Policy snippet first so `nginx -t` below
# validates the config that will actually be reloaded. install_spa_csp is
# idempotent and restores the config itself if its own edit fails to
# validate, so a non-zero return here means "CSP not wired" rather than
# "nginx is broken".
if ! install_spa_csp; then
  echo "WARNING: SPA CSP snippet could not be wired; continuing without it." >&2
fi

# Same contract: idempotent, backup-first, self-restoring. A non-zero return
# means "brand assets still inherit location /'s no-store policy", not
# "nginx is broken" — the warning below is the only consequence.
if ! install_static_root_cache; then
  echo "WARNING: brand-asset caching could not be wired; continuing." >&2
fi

if ! install_spa_cache_policy; then
  echo "WARNING: SPA HTML edge caching could not be wired; continuing." >&2
fi

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
# GATE_FAILED / GATE_RESULTS / gate_check() are defined in the shared
# gate-helper block near the top of this script.
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

# 4.5a-2. Source leak gate: ensure no sourcemaps or raw source files were deployed
if find "$APP_WEB_ROOT" -maxdepth 2 -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.map" \) -print -quit 2>/dev/null | grep -q .; then
  echo "GATE FAIL: source files or sourcemaps leaked into webroot ($APP_WEB_ROOT)" >&2
  GATE_FAILED=1
  GATE_RESULTS+=("  source.leak DETECTED  ← FAIL")
else
  GATE_RESULTS+=("  source.leak ok (no sourcemaps/raw sources in webroot)")
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
      # CDN "JS detection" injections (e.g. Cloudflare's challenge-platform,
      # added when the domain moved behind Cloudflare) append a <script>
      # carrying a per-request nonce before </body>. A raw md5 of the public
      # body can therefore never equal the deployed file. Strip only script
      # blocks that reference the CDN's /cdn-cgi/ namespace — the nonce lives
      # inside that block — so every other byte must still match or the gate
      # fails. Tempered `.(?!</script>)` keeps the match inside one tag.
      perl -0777 -pi -e 's|<script\b[^>]*>(?:(?!</script>).)*cdn-cgi(?:(?!</script>).)*</script>||gs' "$PUBLIC_APP_TMP"
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
status_page_gate_check

# 4.5c. Mobile bootstrap contract through the exact public `/api/v2` path the
# APK and SPA use. This catches stale nginx rewrites, a mismatched APP_URL in
# the systemd environment, or a mobile build pointing at a different origin.
MOBILE_BOOTSTRAP_URL="${MOBILE_API_BASE_URL%/}/mobile/bootstrap"
EXPECTED_WEB_BASE_URL="${APP_PUBLIC_URL%/}"
EXPECTED_MOBILE_API_BASE_URL="${MOBILE_API_BASE_URL%/}"
EXPECTED_CANONICAL_API_BASE_URL="${EXPECTED_WEB_BASE_URL}/api"

mobile_bootstrap_aligned() {
  local body
  body=$(curl -sf --max-time 8 "$MOBILE_BOOTSTRAP_URL" || true)
  [[ -n "$body" ]] || return 1
  echo "$body" | jq -e \
    --arg web "$EXPECTED_WEB_BASE_URL" \
    --arg api "$EXPECTED_MOBILE_API_BASE_URL" \
    --arg canonical "$EXPECTED_CANONICAL_API_BASE_URL" \
    '.ok == true and .contractVersion == 1 and .webBaseUrl == $web and .apiBaseUrl == $api and .canonicalApiBaseUrl == $canonical and .healthPath == "/api/v2/health"' \
    >/dev/null 2>&1
}

# Retried for the same reason as the app entry gate. This runs immediately
# after the backend restart, so a cold process can push one request past the
# 8s curl budget — and `curl -sf` turns that timeout into an EMPTY body, which
# the contract test cannot tell apart from a genuinely missing endpoint.
# Observed 2026-09-28 as a spurious MISALIGNED on a host whose loopback TLS
# handshake alone cost ~600ms while /mobile/bootstrap answered in 1.3ms: a
# latency false negative, retried away here rather than rolled back.
MOBILE_BOOTSTRAP_ATTEMPTS="${APP_GATE_ATTEMPTS:-3}"
MOBILE_BOOTSTRAP_OK=0
for ((attempt = 1; attempt <= MOBILE_BOOTSTRAP_ATTEMPTS; attempt++)); do
  if mobile_bootstrap_aligned; then
    MOBILE_BOOTSTRAP_OK=1
    break
  fi
  if (( attempt < MOBILE_BOOTSTRAP_ATTEMPTS )); then
    sleep "${APP_GATE_RETRY_DELAY_SEC:-2}"
  fi
done

if (( MOBILE_BOOTSTRAP_OK == 1 )); then
  GATE_RESULTS+=("  mobile.bootstrap contract v1 aligned")
else
  echo "GATE FAIL: mobile bootstrap is missing or misaligned after $MOBILE_BOOTSTRAP_ATTEMPTS attempt(s) ($MOBILE_BOOTSTRAP_URL)" >&2
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

# 4.5f. Workspace agent — when Pi is enabled, the resolved binary must be
# executable. Hosts without Pi are a supported configuration: write_agent_dropin
# explicitly disables the runtime, so the deploy gate must not contradict that
# fail-closed state. The durable run API must still be mounted (401 = route
# exists behind auth; 404 = missing).
if [[ "$PI_AGENT_ENABLED_VALUE" == "1" ]]; then
  if [[ -n "$PI_AGENT_BIN_RESOLVED" && -x "$PI_AGENT_BIN_RESOLVED" ]]; then
    GATE_RESULTS+=("  pi.agent $(basename "$PI_AGENT_BIN_RESOLVED") ok")
  else
    echo "GATE FAIL: Pi runtime enabled without an executable binary" >&2
    GATE_FAILED=1
    GATE_RESULTS+=("  pi.agent MISSING  ← FAIL")
  fi
else
  GATE_RESULTS+=("  pi.agent disabled (binary unavailable)")
fi
PI_AGENT_API_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3037/api/agent-runs/capabilities || echo 000)
if [[ "$PI_AGENT_API_CODE" == "401" ]]; then
  GATE_RESULTS+=("  pi.api mounted (auth 401)")
else
  echo "GATE FAIL: /api/agent-runs/capabilities returned $PI_AGENT_API_CODE (expected 401)" >&2
  GATE_FAILED=1
  GATE_RESULTS+=("  pi.api $PI_AGENT_API_CODE  ← FAIL")
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
    "ciGate": "${DEPLOY_CI_GATE_STATUS}",
    "checks": {
      "frontendReachable": true,
      "siteReachable": true,
      "statusReachable": true,
      "statusPublicDns": "${STATUS_PUBLIC_DNS_STATE:-unknown}",
      "statusPublicReachable": ${STATUS_PUBLIC_REACHABLE:-false},
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
      "piAgentEnabled": $([ "$PI_AGENT_ENABLED_VALUE" = "1" ] && echo true || echo false),
      "piAgentApiMounted": $([ "$PI_AGENT_API_CODE" = "401" ] && echo true || echo false)
    }
  }
}
EOF
  mv "$tmp" "$STATE_FILE"
  GATE_RESULTS+=("  state: $STATE_FILE updated")
  if ! $SUDO find "$APP_WEB_ROOT/assets" -type f -mtime +"$ASSET_RETENTION_DAYS" -delete; then
    echo "WARNING: old asset cleanup failed; retained assets remain available" >&2
  fi
  # P_edge-warmup — warm Cloudflare edge cache for the new versioned HTML and newly deployed assets
  (
    # P_warmup-no-trap — this probe runs backgrounded AFTER a green deploy
    # and must never trigger handle_deploy_error: under `set -E` the ERR
    # trap is inherited by subshells, so one benign zero-match grep below
    # (combined with inherited pipefail) would roll back the just-deployed
    # backend ~10s after success. Best-effort by construction from here on.
    trap - ERR
    set +e
    domain="https://app.topodrive.top"
    curl -s -o /dev/null -A "Cloudflare-Edge-Warmer" "$domain/" || true
    if [[ -n "$APP_FILE" && -f "$APP_WEB_ROOT/$APP_FILE" ]]; then
      asset_paths=$(grep -oE '/assets/[a-zA-Z0-9_.-]+\.(js|css|woff2)' "$APP_WEB_ROOT/$APP_FILE" | sort -u)
      for p in $asset_paths; do
        curl -s -o /dev/null -H "Accept-Encoding: gzip, br" "$domain$p" || true
      done
      # P_edge-warmup-fonts — webfonts are referenced from the entry CSS, not
      # the HTML, so the loop above never warms them and each slice's first
      # visitor pays the origin round trip (painful on high-RTT China links).
      # Warm the slices every visitor needs: latin first, then Noto Sans SC
      # 400 (the default CJK weight). Capped and best-effort — this whole
      # probe runs backgrounded and never fails the deploy.
      for css in $asset_paths; do
        case "$css" in
          *.css)
            css_body=$(curl -s --max-time 8 -H "Accept-Encoding: gzip" "$domain$css" || true)
            if [[ -n "$css_body" ]]; then
              font_list=$(echo "$css_body" | grep -oE '/assets/[a-zA-Z0-9_.-]+\.woff2' | sort -u)
              echo "$font_list" | grep 'latin' | head -8 | while IFS= read -r font; do
                [[ -n "$font" ]] || continue
                curl -s -o /dev/null "$domain$font" || true
              done
              echo "$font_list" | grep 'noto-sans-sc' | grep -- '-400-' | head -6 | while IFS= read -r font; do
                [[ -n "$font" ]] || continue
                curl -s -o /dev/null "$domain$font" || true
              done
            fi
            ;;
        esac
      done
    fi
  ) &>/dev/null &
else
  FRONTEND_ROLLBACK_OK=true
  if ! rollback_backend; then
    GATE_RESULTS+=("  backend: NOT restored (no known-good build available — the failed build is still live)")
  fi
  if ! rollback_frontend "$APP_PREVIOUS_TARGET"; then
    FRONTEND_ROLLBACK_OK=false
    GATE_RESULTS+=("  frontend: NOT restored automatically — the new SPA entry is still live")
  fi
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
  echo "The backend build and the SPA entry were restored automatically when a previous build was available." >&2
  if [[ "${FRONTEND_ROLLBACK_OK:-false}" != "true" ]]; then
    echo "The frontend was NOT restored automatically. To restore it by hand:" >&2
    echo "    sudo cp -a $APP_WEB_ROOT/.previous/index.<old-ts>.html $APP_WEB_ROOT/" >&2
    echo "    sudo sed -i 's|/index\\.[0-9]\\+\\.html|/index.<old-ts>.html|' $NGINX_APP_CONF" >&2
    echo "    sudo nginx -s reload" >&2
  fi
  echo "State file $STATE_FILE was NOT updated — last known-good deploy is still recorded there." >&2
  exit 1
fi
