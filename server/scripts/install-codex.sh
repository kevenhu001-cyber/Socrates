#!/usr/bin/env bash
# install-codex.sh — install/verify the embedded Codex agent runtime on Linux.
#
# The Socrates backend embeds the open-source OpenAI Codex harness
# (codex-app-server) as its agent runtime. This script installs the official
# prebuilt release package — codex-app-server + codex-code-mode-host + bwrap +
# rg + zsh — into CODEX_INSTALL_DIR with SHA256 verification, and seeds an
# independent CODEX_HOME with a minimal config.toml so the harness never reads
# a developer's personal ~/.codex (no plugins, no OAuth, no MCP servers).
#
# Usage:
#   install-codex.sh --install     # download + verify + install + seed home (default)
#   install-codex.sh --check       # exit 0 if the pinned version + CODEX_HOME are ready
#   install-codex.sh --uninstall   # remove install dir + CODEX_HOME + cache
#
# Env:
#   CODEX_VERSION      release tag version (default: 0.149.1)
#   CODEX_REPO         GitHub repo (default: openai/codex)
#   CODEX_INSTALL_DIR  package install root (default: /opt/socrates-codex)
#   CODEX_HOME         independent harness home (default: /var/lib/socrates-codex)
#   CODEX_ARCH         (default: x86_64)
#   CODEX_MIRROR       optional base URL mirroring github.com/<repo>/releases/download
#
# Exit codes: 0 ok, 1 error, 2 checksum mismatch / version mismatch (--check).

set -Eeuo pipefail

CODEX_VERSION="${CODEX_VERSION:-0.149.1}"
CODEX_REPO="${CODEX_REPO:-openai/codex}"
CODEX_TAG="rust-v${CODEX_VERSION}"
CODEX_ARCH="${CODEX_ARCH:-x86_64}"
PLATFORM="unknown-linux-musl"
PACKAGE_NAME="codex-app-server-package-${CODEX_ARCH}-${PLATFORM}.tar.gz"
SUMS_NAME="codex-package_SHA256SUMS"

CODEX_INSTALL_DIR="${CODEX_INSTALL_DIR:-/opt/socrates-codex}"
CODEX_HOME="${CODEX_HOME:-/var/lib/socrates-codex}"
CODEX_CACHE_DIR="${CODEX_INSTALL_DIR}/.cache"
CODEX_WORKSPACES="${CODEX_HOME}/workspaces"

RELEASE_URL_BASE="${CODEX_MIRROR:-https://github.com/${CODEX_REPO}/releases/download/${CODEX_TAG}}"

BIN_PATH="${CODEX_INSTALL_DIR}/bin/codex-app-server"
VERSION_MARKER="${CODEX_INSTALL_DIR}/.version"
# When a host-provided Codex is used (auto-detected or pinned via
# CODEX_APP_SERVER_BIN), we record its absolute path here so --check can
# verify it without the downloaded package being present.
LOCAL_BIN_MARKER="${CODEX_INSTALL_DIR}/.bin-path"
CONFIG_PATH="${CODEX_HOME}/config.toml"

# Resolve a locally-installed Codex binary without downloading anything.
# Honors CODEX_APP_SERVER_BIN (absolute path) first, then falls back to a
# PATH lookup. Prints the absolute path on stdout, or nothing if none is
# usable. The binary must answer `-V` to be considered healthy.
detect_local_codex() {
  local candidate=""
  if [[ -n "${CODEX_APP_SERVER_BIN:-}" ]]; then
    candidate="$CODEX_APP_SERVER_BIN"
  else
    candidate=$(command -v codex-app-server 2>/dev/null || command -v codex 2>/dev/null || true)
  fi
  [[ -n "$candidate" ]] || return 0
  # An already-configured value may carry the subcommand ("… app-server").
  # Verify the executable itself, then re-attach the argument on output.
  local candidate_args=""
  if [[ "$candidate" == *" "* ]]; then
    candidate_args="${candidate#* }"
    candidate="${candidate%% *}"
  fi
  # Normalize symlinks so the recorded path is stable.
  if command -v readlink >/dev/null 2>&1; then
    candidate=$(readlink -f "$candidate" 2>/dev/null || echo "$candidate")
  fi
  [[ -x "$candidate" ]] || return 0
  "$candidate" -V >/dev/null 2>&1 || return 0
  # The standalone codex-app-server speaks the protocol directly. The
  # codex CLI exposes the same server as a subcommand, so the recorded
  # command must include it — the harness appends `--listen stdio://`,
  # which the CLI rejects at top level.
  if [[ -z "$candidate_args" ]] && [[ "$(basename "$candidate")" != codex-app-server ]]; then
    candidate_args="app-server"
  fi
  if [[ -n "$candidate_args" ]]; then
    echo "$candidate $candidate_args"
  else
    echo "$candidate"
  fi
}

# ─── sudo detection (mirrors deploy.sh) ─────────────────────────────
SUDO=""
if command -v sudo >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null; then
    SUDO="sudo"
  else
    echo "ERROR: 'sudo' is required but not passwordless. Run as root or grant NOPASSWD." >&2
    exit 1
  fi
fi

log() { echo "[codex-install] $*"; }
err() { echo "[codex-install] ERROR: $*" >&2; }

require_curl() {
  command -v curl >/dev/null 2>&1 || { err "curl is required"; exit 1; }
}

download() { # url dest
  local url="$1" dest="$2"
  if [[ -f "$dest" ]] && [[ -s "$dest" ]]; then return 0; fi
  log "downloading $(basename "$dest")…"
  local code
  code=$(curl -fL --retry 3 --connect-timeout 20 --max-time 600 -o "$dest" -w '%{http_code}' "$url" 2>/dev/null) || {
    rm -f "$dest"
    err "download failed ($url)"
    exit 1
  }
  [[ "$code" =~ ^2 ]] || { rm -f "$dest"; err "download returned $code ($url)"; exit 1; }
}

verify_checksum() { # file name
  local file="$1" name="$2"
  local sums="${CODEX_CACHE_DIR}/${SUMS_NAME}"
  mkdir -p "$CODEX_CACHE_DIR"
  download "${RELEASE_URL_BASE}/${SUMS_NAME}" "$sums"
  local expected
  expected=$(awk -v n="$name" '$2 == n { print $1 }' "$sums") || true
  if [[ -z "$expected" ]]; then
    err "no checksum entry for ${name} in ${SUMS_NAME}"
    exit 2
  fi
  local actual
  actual=$(sha256sum "$file" | awk '{ print $1 }')
  if [[ "$actual" != "$expected" ]]; then
    err "checksum mismatch for ${name}: expected ${expected}, got ${actual}"
    exit 2
  fi
  log "checksum ok: ${name} (${actual:0:16}…)"
}

seed_codex_home() {
  if [[ ! -d "$CODEX_HOME" ]]; then
    $SUDO mkdir -p "$CODEX_HOME"
    $SUDO chmod 750 "$CODEX_HOME"
  fi
  if [[ ! -f "$CONFIG_PATH" ]]; then
    log "seeding ${CONFIG_PATH}"
    $SUDO tee "$CONFIG_PATH" >/dev/null <<EOF
# Socrates-managed Codex harness home — generated by install-codex.sh.
# Per-thread providers/keys/policies are injected by the backend at
# thread/start time; this file only pins the server-side defaults.

model_provider = "openai"
model = "gpt-5.1-codex"
model_reasoning_effort = "medium"

[features]
plugins = false
EOF
  fi
  if [[ ! -d "$CODEX_WORKSPACES" ]]; then
    $SUDO mkdir -p "$CODEX_WORKSPACES"
    $SUDO chmod 750 "$CODEX_WORKSPACES"
  fi
  $SUDO chown -R "$(id -un):$(id -gn)" "$CODEX_HOME" 2>/dev/null || true
}

do_install() {
  require_curl

  # ── Local Codex auto-detection (skip the download entirely) ─────────
  # If the host already has a usable codex-app-server/codex (e.g. the npm
  # global @openai/codex package) we prefer it over re-downloading the
  # pinned release. Driven by CODEX_APP_SERVER_BIN or a PATH lookup.
  local local_bin
  local_bin=$(detect_local_codex || true)
  if [[ -n "$local_bin" ]]; then
    log "using locally-installed Codex: $local_bin (skipping download)"
    $SUDO mkdir -p "$CODEX_INSTALL_DIR"
    echo "$local_bin" | $SUDO tee "$LOCAL_BIN_MARKER" >/dev/null
    # A host-provided binary supersedes any stale downloaded version marker.
    $SUDO rm -f "$VERSION_MARKER"
    seed_codex_home
    # The recorded command may include the `app-server` subcommand; the
    # -V smoke test runs against the executable itself.
    if ! "${local_bin%% *}" -V >/dev/null 2>&1; then
      err "local codex binary failed the -V smoke test"
      exit 1
    fi
    log "local Codex ready (no download): $local_bin"
    return 0
  fi

  mkdir -p "$CODEX_CACHE_DIR"

  # Idempotent: skip the download when the pinned version is already installed.
  if [[ -f "$VERSION_MARKER" ]] && [[ "$(cat "$VERSION_MARKER")" == "$CODEX_VERSION" ]] \
     && [[ -x "$BIN_PATH" ]]; then
    log "codex-app-server ${CODEX_VERSION} already installed (${CODEX_INSTALL_DIR})"
    seed_codex_home
    return 0
  fi

  local tarball="${CODEX_CACHE_DIR}/${PACKAGE_NAME}"
  download "${RELEASE_URL_BASE}/${PACKAGE_NAME}" "$tarball"
  verify_checksum "$tarball" "$PACKAGE_NAME"

  local staging
  staging=$(mktemp -d "${CODEX_CACHE_DIR}/staging.XXXXXX")
  log "extracting ${PACKAGE_NAME}…"
  tar -xzf "$tarball" -C "$staging"

  [[ -x "$staging/bin/codex-app-server" ]] || { err "package missing bin/codex-app-server"; exit 1; }

  if [[ -d "$CODEX_INSTALL_DIR" ]]; then
    $SUDO rm -rf "$CODEX_INSTALL_DIR"
  fi
  $SUDO mkdir -p "$CODEX_INSTALL_DIR"
  $SUDO cp -a "$staging/." "$CODEX_INSTALL_DIR/"
  rm -rf "$staging"

  # Keep the package layout intact so the binary resolves its bundled
  # resources (bwrap, rg, zsh) via codex-package.json relative paths.
  echo "$CODEX_VERSION" | $SUDO tee "$VERSION_MARKER" >/dev/null

  seed_codex_home

  # Smoke test: the binary must answer -V (cheap, no server start).
  if ! "$BIN_PATH" -V >/dev/null 2>&1; then
    err "installed binary failed the -V smoke test"
    exit 1
  fi
  log "installed codex-app-server ${CODEX_VERSION} → ${CODEX_INSTALL_DIR}"
  log "CODEX_HOME ready at ${CODEX_HOME}"
}

do_check() {
  local ok=1
  local bp=""
  if [[ -f "$LOCAL_BIN_MARKER" ]]; then
    bp=$(cat "$LOCAL_BIN_MARKER")
  fi

  if [[ -n "$bp" ]]; then
    # Local / host-provided Codex recorded at install time. The value may
    # carry the `app-server` subcommand, so check the executable alone.
    local bp_exe="${bp%% *}"
    if [[ ! -x "$bp_exe" ]]; then
      err "recorded local codex binary not executable: ${bp_exe}"
      ok=0
    elif ! "$bp_exe" -V >/dev/null 2>&1; then
      err "recorded local codex binary crashed on -V: ${bp_exe}"
      ok=0
    fi
  else
    # Downloaded package mode.
    if [[ ! -x "$BIN_PATH" ]]; then
      err "binary not found: ${BIN_PATH}"
      ok=0
    fi
    if [[ ! -f "$VERSION_MARKER" ]] || [[ "$(cat "$VERSION_MARKER")" != "$CODEX_VERSION" ]]; then
      err "installed version does not match CODEX_VERSION=${CODEX_VERSION}"
      ok=0
    fi
    if [[ "$ok" == "1" ]] && ! "$BIN_PATH" -V >/dev/null 2>&1; then
      err "installed binary is not executable / crashed on -V"
      ok=0
    fi
  fi

  if [[ ! -f "$CONFIG_PATH" ]]; then
    err "CODEX_HOME config missing: ${CONFIG_PATH}"
    ok=0
  fi

  if [[ "$ok" == "1" ]]; then
    if [[ -n "$bp" ]]; then
      log "codex harness (local) ok (${bp}, home ${CODEX_HOME})"
    else
      log "codex harness ${CODEX_VERSION} ok (${CODEX_INSTALL_DIR}, home ${CODEX_HOME})"
    fi
    return 0
  fi
  return 1
}

do_uninstall() {
  $SUDO rm -rf "$CODEX_INSTALL_DIR"
  if [[ -d "$CODEX_HOME" ]]; then
    $SUDO rm -rf "$CODEX_HOME"
  fi
  log "removed ${CODEX_INSTALL_DIR} and ${CODEX_HOME}"
}

MODE="${1:---install}"
case "$MODE" in
  --install)  do_install ;;
  --check)    do_check ;;
  --detect)   detect_local_codex ;;
  --uninstall) do_uninstall ;;
  *) err "unknown mode: $MODE (use --install | --check | --detect | --uninstall)"; exit 1 ;;
esac