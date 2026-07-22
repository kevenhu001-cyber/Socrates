#!/usr/bin/env bash
# backup-secrets.sh — Encrypt and archive socrates-api.env + SESSION_SECRET
#
# Usage:
#   sudo BACKUP_PASSPHRASE='your-strong-passphrase' ./scripts/backup-secrets.sh
#   sudo BACKUP_PASSPHRASE='...' ./scripts/backup-secrets.sh --no-session-secret-only
#
# What this does:
#   1. Reads /home/ubuntu/socrates-api.env (contains SESSION_SECRET,
#      DATABASE_URL, BEAGLE_SYSTEM_KEY, SMTP_PASS, GITHUB_CLIENT_SECRET,
#      etc.).
#   2. Writes two GPG-encrypted artefacts under /var/backups/socrates/:
#        a. socrates-env-<TIMESTAMP>.tar.gz.gpg  — full env + checksum + host
#        b. session-secret-<TIMESTAMP>.txt.gpg  — SESSION_SECRET alone
#   3. Rotates the directory so only the most recent 7 of each survive.
#
# SECURITY:
#   - Must run as root (the env file is mode 0600 owned by the service
#     account; the backup directory is also root-only).
#   - BACKUP_PASSPHRASE is required. The script refuses to fall back to
#     an empty string or a hard-coded value. Use a long random phrase
#     and store it in your password manager (1Password / Bitwarden /
#     pass / etc.) — losing it == losing the backups.
#   - The SESSION_SECRET-alone artefact is more sensitive than the full
#     env: it decrypts every user's stored LLM API key on its own.
#     Keep it offline (paper, encrypted USB) where practical.
#
# Recovery:
#   # Full env:
#   gpg --decrypt --passphrase "$BACKUP_PASSPHRASE" \
#       /var/backups/socrates/socrates-env-YYYYMMDDTHHMMSSZ.tar.gz.gpg \
#     | tar xzf - -C /tmp/recover && cat /tmp/recover/socrates-api.env
#
#   # SESSION_SECRET only:
#   gpg --decrypt --passphrase "$BACKUP_PASSPHRASE" \
#       /var/backups/socrates/session-secret-YYYYMMDDTHHMMSSZ.txt.gpg
#
# Companion scripts:
#   - scripts/rotate-secrets.sh   — generate FRESH secrets when needed
#   - scripts/restart-server.sh   — bounce socrates-api after .env change

set -euo pipefail

ENV_FILE="/home/ubuntu/socrates-api.env"
BACKUP_DIR="/var/backups/socrates"
RETENTION_COUNT="${BACKUP_RETENTION:-7}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HOST_SHORT="$(hostname -s 2>/dev/null || hostname)"
WANT_SESSION_SECRET_ONLY=1

for arg in "$@"; do
  case "$arg" in
    --no-session-secret-only) WANT_SESSION_SECRET_ONLY=0 ;;
    --retention=*) RETENTION_COUNT="${arg#*=}" ;;
    -h|--help)
      sed -n '2,35p' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

# ── Preflight ──────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: must run as root (reads $ENV_FILE, writes $BACKUP_DIR)" >&2
  exit 1
fi

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "ERROR: BACKUP_PASSPHRASE env var is required." >&2
  echo "       Pick a long random phrase and store it in your password manager." >&2
  echo "       Example:  openssl rand -base64 48" >&2
  exit 1
fi

if [ "${#BACKUP_PASSPHRASE}" -lt 16 ]; then
  echo "ERROR: BACKUP_PASSPHRASE is too short (got ${#BACKUP_PASSPHRASE} chars, need >= 16)." >&2
  exit 1
fi

if [ ! -r "$ENV_FILE" ]; then
  echo "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi

for tool in gpg tar sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: required tool '$tool' is missing" >&2
    exit 1
  fi
done

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

WORK_DIR="$(mktemp -d -t socrates-backup.XXXXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

# ── Stage the artefacts ────────────────────────────────────────────
mkdir -p "$WORK_DIR/env"
cp "$ENV_FILE" "$WORK_DIR/env/socrates-api.env"
chmod 600 "$WORK_DIR/env/socrates-api.env"

# Integrity metadata. The checksum covers the env file as it sat on
# disk before encryption — useful for proving the backup matches the
# source at backup time.
ENV_SIZE=$(stat -c%s "$ENV_FILE")
ENV_SHA256=$(sha256sum "$ENV_FILE" | awk '{print $1}')
SESSION_SECRET=$(grep -oP '^SESSION_SECRET=\K.*' "$ENV_FILE" || true)
if [ -z "$SESSION_SECRET" ]; then
  echo "ERROR: SESSION_SECRET not found in $ENV_FILE" >&2
  exit 1
fi

cat > "$WORK_DIR/MANIFEST.json" <<EOF
{
  "host": "$HOST_SHORT",
  "timestamp": "$TIMESTAMP",
  "env_file": "socrates-api.env",
  "env_size_bytes": $ENV_SIZE,
  "env_sha256": "$ENV_SHA256",
  "session_secret_present": true,
  "session_secret_length": ${#SESSION_SECRET}
}
EOF

# ── Encrypt full env bundle ────────────────────────────────────────
ENV_ARCHIVE="$BACKUP_DIR/socrates-env-${HOST_SHORT}-${TIMESTAMP}.tar.gz.gpg"

cd "$WORK_DIR"
tar czf - env MANIFEST.json \
  | gpg --batch --yes --quiet \
        --symmetric --cipher-algo AES256 --compress-algo none \
        --passphrase "$BACKUP_PASSPHRASE" \
        --output "$ENV_ARCHIVE"
chmod 600 "$ENV_ARCHIVE"
chown root:root "$ENV_ARCHIVE"

# ── Encrypt SESSION_SECRET alone (offline-friendly quick recovery) ──
if [ "$WANT_SESSION_SECRET_ONLY" -eq 1 ]; then
  SS_ARCHIVE="$BACKUP_DIR/session-secret-${HOST_SHORT}-${TIMESTAMP}.txt.gpg"
  printf '%s' "$SESSION_SECRET" \
    | gpg --batch --yes --quiet \
          --symmetric --cipher-algo AES256 --compress-algo none \
          --passphrase "$BACKUP_PASSPHRASE" \
          --output "$SS_ARCHIVE"
  chmod 600 "$SS_ARCHIVE"
  chown root:root "$SS_ARCHIVE"
fi

# ── Rotate old backups ─────────────────────────────────────────────
cd "$BACKUP_DIR"
# -t sorts newest-first; tail -n +K skips the first K-1 (newest) entries.
ls -1t socrates-env-*.tar.gz.gpg 2>/dev/null \
  | tail -n +$((RETENTION_COUNT + 1)) \
  | xargs -r -d '\n' rm -f --

if [ "$WANT_SESSION_SECRET_ONLY" -eq 1 ]; then
  ls -1t session-secret-*.txt.gpg 2>/dev/null \
    | tail -n +$((RETENTION_COUNT + 1)) \
    | xargs -r -d '\n' rm -f --
fi

# ── Report ──────────────────────────────────────────────────────────
echo "╭──────────────────────────────────────────────────────────────╮"
echo "│ Socrates secret backup                                        │"
echo "╰──────────────────────────────────────────────────────────────╯"
echo
echo "✓ Encrypted full env bundle:"
echo "    $ENV_ARCHIVE"
echo "    ($(stat -c%s "$ENV_ARCHIVE") bytes, AES-256 symmetric)"
echo
if [ "$WANT_SESSION_SECRET_ONLY" -eq 1 ]; then
  echo "✓ Encrypted SESSION_SECRET alone:"
  echo "    $SS_ARCHIVE"
  echo "    ($(stat -c%s "$SS_ARCHIVE") bytes)"
  echo
fi
echo "  source env sha256:  $ENV_SHA256"
echo "  retention:          $RETENTION_COUNT most recent of each kind"
echo
echo "Verify a backup:"
echo "  gpg --decrypt --quiet --passphrase '\$BACKUP_PASSPHRASE' \\"
echo "      $ENV_ARCHIVE | tar tzf -"
echo
echo "Backups in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/socrates-env-*.tar.gz.gpg 2>/dev/null | sed 's/^/  /'