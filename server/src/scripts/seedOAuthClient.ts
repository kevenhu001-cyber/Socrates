/**
 * Register a first-party OAuth 2.0 client for Phase D.
 *
 * Usage:
 *   npx tsx src/scripts/seedOAuthClient.ts <ownerEmail> <clientId> <name> <redirectUri> [scope,scope,...]
 *
 * Prints the client secret exactly once — only its SHA-256 is stored.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { initDb, closeDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { createOAuthClient } from '../routes/oauth.js';
import { ALL_SCOPES } from '../middleware/scopes.js';

async function main() {
  const [ownerEmail, clientId, name, redirectUri, scopesArg] = process.argv.slice(2);
  if (!ownerEmail || !clientId || !name || !redirectUri) {
    console.error('Usage: npx tsx src/scripts/seedOAuthClient.ts <ownerEmail> <clientId> <name> <redirectUri> [scopes]');
    process.exit(1);
  }
  if (!/^cli_[a-z0-9_-]{3,64}$/.test(clientId)) {
    console.error('clientId must match cli_<lowercase/digits/-/_> (3-64 chars)');
    process.exit(1);
  }
  let redirectUris: URL;
  try {
    redirectUris = new URL(redirectUri);
    if (!['http:', 'https:'].includes(redirectUris.protocol)) throw new Error('scheme');
  } catch {
    console.error('redirectUri must be an absolute http(s) URL');
    process.exit(1);
  }
  void redirectUris;

  const scopes = scopesArg
    ? scopesArg.split(',').map((s) => s.trim()).filter(Boolean)
    : [...ALL_SCOPES];

  initDb(process.env.DATABASE_URL!);
  const { getDb } = await import('../db/index.js');
  const db = getDb();

  const [owner] = await db.select().from(users).where(eq(users.email, ownerEmail.toLowerCase())).limit(1);
  if (!owner) {
    console.error(`No user found with email ${ownerEmail}`);
    process.exit(1);
  }

  const { clientSecret } = await createOAuthClient({
    clientId,
    name,
    redirectUris: [redirectUri],
    allowedScopes: scopes,
    ownerUserId: owner.id,
  });

  console.log(JSON.stringify({
    clientId,
    clientSecret,
    name,
    redirectUris: [redirectUri],
    allowedScopes: scopes,
    note: 'Store clientSecret now — it is not recoverable.',
  }, null, 2));
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
