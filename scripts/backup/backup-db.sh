#!/usr/bin/env bash
# backup-db.sh — Encrypted pg_dump of the production Postgres database
#
# Usage:
#   sudo BACKUP_PASSPHRASE='your-strong-passphrase' ./scripts/backup/backup-db.sh
#   sudo BACKUP_PASSPHRASE='...' ./scripts/backup/backup-db.sh --retention=30
#
# What this does:
#   1. Reads DATABASE_URL from /home/ubuntu/socrates-api.env (the same env
#      file backup-secrets.sh archives).
#   2. Runs pg_dump in custom format (-Fc), then verifies the archive's TOC
#      with pg_restore --list BEFORE encrypting — a dump that cannot be
#      listed cannot be restored, and an encrypted broken dump is worse
#      than a failed backup because it fails silently.
#   3. Writes one GPG-encrypted artefact under /var/backups/socrates/:
#        pg-<HOST>-<TIMESTAMP>.dump.gpg   (plus a MANIFEST embedded in the
#      plaintext stream, recorded alongside as *.manifest.json.gpg)
#   4. Rotates the directory so only the most recent N dumps survive
#      (default 14 — assumes a daily cron; see below).
#
# SECURITY:
#   - Must run as root: the env file is mode 0600 and the backup
#     directory is root-only, same trust boundary as backup-secrets.sh.
#   - BACKUP_PASSPHRASE is required (>= 16 chars). Losing it == losing
#     every backup. Store it in the password manager next to the
#     secrets-backup phrase.
#   - The dump contains all user data: sessions, memories, classroom
#     rosters, uploaded file metadata. Treat the .gpg artefacts as
#     sensitive even though they are encrypted.
#
# Scheduling (choose ONE; do not put the passphrase in a world-readable
# crontab):
#   root crontab (`sudo crontab -e`), referencing a root-only env file:
#     17 3 * * *  set -a; . /root/.socrates-backup.env; set +a; \
#                 /home/ubuntu/User/Socrates/scripts/backup/backup-db.sh \
#                 >>/var/log/socrates-backup.log 2>&1
#   where /root/.socrates-backup.env is mode 0600 containing
#   BACKUP_PASSPHRASE='...'.
#
# Offsite: /var/backups/socrates on the same disk is NOT a disaster
# recovery story — it survives operator error, not host loss. rsync or
# rclone the directory to a second host or object storage; that piece is
# intentionally not scripted here because the destination is a deployment
# decision.
#
# Recovery:
#   gpg --decrypt --passphrase "$BACKUP_PASSPHRASE" \
#       /var/backups/socrates/pg-<HOST>-<TS>.dump.gpg \
#     > /tmp/restore.dump
#   pg_restore --list /tmp/restore.dump          # inspect TOC
#   pg_restore --clean --if-exists --dbname="$DATABASE_URL" /tmp/restore.dump
#   (custom format also allows selective restore: --table=, --schema=)
#
# Companion scripts:
#   - scripts/backup-secrets.sh  — env file + SESSION_SECRET backup
#   - scripts/rotate-secrets.sh  — generate FRESH secrets when needed
#   - scripts/restart-server.sh  — bounce socrates-api after .env change

set -euo pipefail

ENV_FILE="${SOCRATES_ENV_FILE:-/home/ubuntu/socrates-api.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/socrates}"
RETENTION_COUNT="${BACKUP_RETENTION:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HOST_SHORT="$(hostname -s 2>/dev/null || hostname)"

for arg in "$@"; do
  case "$arg" in
    --retention=*) RETENTION_COUNT="${arg#*=}" ;;
    -h|--help)
      sed -n '2,68p' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$RETENTION_COUNT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --retention must be a non-negative integer (got '$RETENTION_COUNT')" >&2
  exit 2
fi

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

for tool in pg_dump pg_restore gpg sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: required tool '$tool' is missing (install postgresql-client + gnupg)" >&2
    exit 1
  fi
done

# DATABASE_URL may be single- or double-quoted in the env file; conninfo
# strings are not quoted, so strip one layer before handing to pg_dump.
DATABASE_URL=$(grep -oP '^DATABASE_URL=\K.*' "$ENV_FILE" | tail -n1 | sed -e 's/^"//' -e "s/^'//" -e 's/"$//' -e "s/'\$//")
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi
# Extract a display name for logs without leaking credentials embedded
# in the URL. Postgres conninfo is URI-shaped: .../<dbname>?<params>.
DB_NAME=$(printf '%s' "$DATABASE_URL" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

WORK_DIR="$(mktemp -d -t socrates-pgbackup.XXXXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

DUMP_FILE="$WORK_DIR/socrates.dump"

# ── Dump ───────────────────────────────────────────────────────────
# Custom format (-Fc): already compressed, selectively restorable, and
# TOC-listable — the three properties that make a backup verifiable.
echo "Running pg_dump for database '$DB_NAME' ..."
pg_dump --format=custom --file="$DUMP_FILE" --dbname="$DATABASE_URL"

# ── Verify before encrypting ───────────────────────────────────────
# A backup you have never verified is a hope, not a backup. Listing the
# TOC proves the archive structure parses and reports its object count.
TOC_ENTRIES=$(pg_restore --list "$DUMP_FILE" | grep -cvE '^;|^$' || true)
if [ "$TOC_ENTRIES" -lt 1 ]; then
  echo "ERROR: pg_restore --list produced an empty TOC — dump is not restorable" >&2
  exit 1
fi

DUMP_SIZE=$(stat -c%s "$DUMP_FILE")
DUMP_SHA256=$(sha256sum "$DUMP_FILE" | awk '{print $1}')

cat > "$WORK_DIR/MANIFEST.json" <<EOF
{
  "host": "$HOST_SHORT",
  "timestamp": "$TIMESTAMP",
  "database": "$DB_NAME",
  "dump_format": "pg_dump custom (-Fc)",
  "dump_size_bytes": $DUMP_SIZE,
  "dump_sha256": "$DUMP_SHA256",
  "toc_entries": $TOC_ENTRIES,
  "pg_dump_version": "$(pg_dump --version | awk '{print $NF}')"
}
EOF

# ── Encrypt ────────────────────────────────────────────────────────
DUMP_ARCHIVE="$BACKUP_DIR/pg-${HOST_SHORT}-${TIMESTAMP}.dump.gpg"
MANIFEST_ARCHIVE="$BACKUP_DIR/pg-${HOST_SHORT}-${TIMESTAMP}.manifest.json.gpg"

gpg --batch --yes --quiet \
    --symmetric --cipher-algo AES256 --compress-algo none \
    --passphrase "$BACKUP_PASSPHRASE" \
    --output "$DUMP_ARCHIVE" \
    "$DUMP_FILE"
chmod 600 "$DUMP_ARCHIVE"
chown root:root "$DUMP_ARCHIVE"

# The manifest is tiny; encrypting it separately keeps it greppable
# without first streaming a multi-GB dump through gpg.
gpg --batch --yes --quiet \
    --symmetric --cipher-algo AES256 --compress-algo none \
    --passphrase "$BACKUP_PASSPHRASE" \
    --output "$MANIFEST_ARCHIVE" \
    "$WORK_DIR/MANIFEST.json"
chmod 600 "$MANIFEST_ARCHIVE"
chown root:root "$MANIFEST_ARCHIVE"

# ── Rotate old backups ─────────────────────────────────────────────
# -t sorts newest-first; tail -n +K skips the first K-1 (newest) entries.
cd "$BACKUP_DIR"
ls -1t pg-*.dump.gpg 2>/dev/null \
  | tail -n +$((RETENTION_COUNT + 1)) \
  | xargs -r -d '\n' rm -f --
ls -1t pg-*.manifest.json.gpg 2>/dev/null \
  | tail -n +$((RETENTION_COUNT + 1)) \
  | xargs -r -d '\n' rm -f --

# ── Report ──────────────────────────────────────────────────────────
echo "╭──────────────────────────────────────────────────────────────╮"
echo "│ Socrates database backup                                      │"
echo "╰──────────────────────────────────────────────────────────────╯"
echo
echo "✓ Encrypted pg_dump (custom format):"
echo "    $DUMP_ARCHIVE"
echo "    ($(stat -c%s "$DUMP_ARCHIVE") bytes encrypted, $DUMP_SIZE plaintext, AES-256)"
echo
echo "  database:             $DB_NAME"
echo "  TOC entries verified: $TOC_ENTRIES"
echo "  dump sha256:          $DUMP_SHA256"
echo "  retention:            $RETENTION_COUNT most recent dumps"
echo
echo "Verify this backup:"
echo "  gpg --decrypt --quiet --passphrase '\$BACKUP_PASSPHRASE' \\"
echo "      $DUMP_ARCHIVE > /tmp/verify.dump \\"
echo "    && pg_restore --list /tmp/verify.dump | head"
echo
echo "Backups in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/pg-*.dump.gpg 2>/dev/null | sed 's/^/  /'
