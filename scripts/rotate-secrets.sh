#!/usr/bin/env bash
# rotate-secrets.sh — Generate fresh secrets for the .env file.
#
# Usage: ./scripts/rotate-secrets.sh
#
# What this does:
#   1. Generates a fresh SESSION_SECRET (64-char hex).
#   2. Generates a fresh GITHUB_CLIENT_SECRET (placeholder — you must
#      mint a real one at https://github.com/settings/developers).
#   3. Generates a fresh OPENCLAW_MINIMAX_VERIFIER (PKCE verifier).
#   4. Prints the new values WITHOUT overwriting the existing .env.
#      You decide what to copy over.
#
# SECURITY: After running this, you MUST also:
#   - Revoke and reissue the BEAGLE_SYSTEM_KEY at your provider's dashboard
#     (this script CANNOT do that for you — it has no provider credentials).
#   - Rotate the SMTP_PASSWORD at your mail provider.
#   - Restart the Socrates server so it picks up the new SESSION_SECRET.
#     ALL EXISTING SESSIONS WILL BE INVALIDATED — users have to log in again.
#
# The new .env file must be readable only by the service account that runs
# node. The script never touches the existing file.

set -euo pipefail

# Use Node.js (already installed) for cryptographically secure random bytes.
generate_hex() {
  local bytes="${1:-32}"
  node -e "console.log(require('crypto').randomBytes($bytes).toString('hex'))"
}

generate_urlsafe() {
  local bytes="${1:-32}"
  node -e "console.log(require('crypto').randomBytes($bytes).toString('base64url'))"
}

echo "╭──────────────────────────────────────────────────────────────╮"
echo "│ Socrates — secret rotation helper                             │"
echo "╰──────────────────────────────────────────────────────────────╯"
echo
echo "These values are FRESHLY GENERATED. Treat them as live credentials."
echo "Do not paste them into chat / ticketing systems. Do not commit them."
echo

echo "# 1. SESSION_SECRET (64-char hex)"
echo "#    Used to derive the AES-256-GCM key for at-rest encryption of"
echo "#    user-supplied LLM API keys (server/src/lib/crypto.js)."
echo "#    Rotating this invalidates every existing user session and"
echo "#    makes all stored API keys un-decryptable (you would need a"
echo "#    re-encryption job that re-encrypts each key under the new"
echo "#    HKDF-derived key — out of scope for this script)."
echo
NEW_SESSION_SECRET=$(generate_hex 32)
echo "SESSION_SECRET=${NEW_SESSION_SECRET}"
echo
echo "# 2. GITHUB_CLIENT_SECRET"
echo "#    Mint a fresh one at https://github.com/settings/developers"
echo "#    (Developer settings → OAuth Apps → your app → Generate a new"
echo "#    client secret). The current value is exposed in your local"
echo "#    .env and must be rotated."
echo
echo "GITHUB_CLIENT_SECRET=<mint-fresh-at-github-settings/developers>"
echo
echo "# 3. OPENCLAW_MINIMAX_VERIFIER (PKCE code_verifier, ~43 chars)"
echo "#    Rotating this immediately invalidates any in-flight OAuth code"
echo "#    exchange that an attacker captured before rotation."
echo
NEW_PKCE=$(generate_urlsafe 32)
echo "OPENCLAW_MINIMAX_VERIFIER=${NEW_PKCE}"
echo
echo "# 4. SMTP_PASSWORD"
echo "#    Rotate at your mail provider (smtp.exmail.qq.com in this build)."
echo "#    Once rotated, the next outbound mail will use the new password."
echo
echo "SMTP_PASS=<rotate-at-mail-provider>"
echo
echo "# 5. BEAGLE_SYSTEM_KEY"
echo "#    Rotate at your LLM provider's dashboard. This is the key for"
echo "#    the built-in \"Beagle\" LLM provider auto-seeded at boot."
echo "#    Mark the old key as disabled BEFORE deploying the new .env so"
echo "#    a parallel deployment cannot drain both."
echo
echo "BEAGLE_SYSTEM_KEY=<rotate-at-provider-dashboard>"
echo
echo "──────────────────────────────────────────────────────────────"
echo "Next steps:"
echo "  1. Open server/.env in an editor owned by root:"
echo "       sudoedit /home/ubuntu/Socrates/server/.env"
echo "  2. Replace the values above (or your rotated provider values)."
echo "  3. Save with mode 0600:"
echo "       sudo chmod 600 /home/ubuntu/Socrates/server/.env"
echo "  4. Restart the server:"
echo "       sudo systemctl restart socrates   # or pm2 / docker restart"
echo "  5. Verify /api/health is still 200:"
echo "       curl -fsSL https://app.topodrive.top/api/health"
echo "  6. Invalidate old sessions explicitly by truncating auth_sessions:"
echo "       sudo -u postgres psql -d socrates -c 'TRUNCATE auth_sessions;'"
echo