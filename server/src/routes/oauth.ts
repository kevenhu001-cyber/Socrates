import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  oauthClients,
  oauthAuthorizationCodes,
  oauthAccessTokens,
} from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseScopeParam, ALL_SCOPES_SET } from '../middleware/scopes.js';
import { rotateCsrfToken } from '../middleware/csrf.js';
import { oauthRegisterLimiter } from '../middleware/rateLimit.js';
import { sha256Hex } from '../services/agentKeys.js';
import {
  ACCESS_TOKEN_TTL_S,
  issueTokenPair,
  refreshWithinWindow,
  revokeTokenValue,
} from '../services/oauthTokens.js';
import {
  OAUTH_ISSUER,
  wwwAuthenticateChallenge,
} from '../lib/oauthMeta.js';

const router = Router();

/* ── Lifetimes ─────────────────────────────────────────────── */
const CODE_TTL_MS = 10 * 60 * 1000;

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
/* RFC 7636 §4.2 — only S256 is accepted; "plain" is deliberately unsupported. */
const CHALLENGE_METHOD = 'S256';

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function timingSafeHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function s256Challenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

/** Body fields arrive via urlencoded OR json parsing; coerce to a single string. */
function firstStr(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

type OAuthClient = typeof oauthClients.$inferSelect;

/* ── Client registry helpers ───────────────────────────────── */

export async function createOAuthClient(params: {
  clientId: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  ownerUserId?: string | null;
  homepageUrl?: string | null;
  logoUrl?: string | null;
  requirePkce?: boolean;
  requireConsent?: boolean;
}): Promise<{ client: OAuthClient; clientSecret: string }> {
  const clientSecret = randomToken();
  const db = getDb();
  const [client] = await db
    .insert(oauthClients)
    .values({
      clientId: params.clientId,
      // Only the SHA-256 digest is persisted; the secret is returned once.
      clientSecretHash: sha256Hex(clientSecret),
      name: params.name,
      homepageUrl: params.homepageUrl ?? null,
      logoUrl: params.logoUrl ?? null,
      redirectUris: params.redirectUris,
      allowedScopes: params.allowedScopes,
      requirePkce: params.requirePkce ?? true,
      requireConsent: params.requireConsent ?? true,
      ownerUserId: params.ownerUserId ?? null,
    })
    .returning();
  return { client, clientSecret };
}

/**
 * RFC 7591 §2 dynamic client registration — the machine-readable entry
 * point advertised as agent_auth.register_uri in the AS metadata. Open but
 * tightly rate-limited per IP; issued clients carry PKCE + consent by
 * default and can be adopted (or revoked) by an operator later.
 */
router.post('/register', oauthRegisterLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientName = firstStr(req.body?.client_name)?.trim();
    if (!clientName || clientName.length > 100) {
      return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'client_name is required (max 100 chars).' });
    }

    const rawUris = req.body?.redirect_uris;
    if (!Array.isArray(rawUris) || rawUris.length === 0 || rawUris.length > 10) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be an array of 1-10 absolute URLs.' });
    }
    const redirectUris: string[] = [];
    for (const raw of rawUris) {
      if (typeof raw !== 'string') {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris entries must be strings.' });
      }
      let parsed: URL;
      try { parsed = new URL(raw); } catch {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `Not an absolute URL: ${raw.slice(0, 100)}` });
      }
      // Loopback may be http (native-app flow, RFC 8252); everything else must be https.
      const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must use https (http only for loopback).' });
      }
      redirectUris.push(raw);
    }

    const scopes = parseScopeParam(
      Array.isArray(req.body?.scope)
        ? req.body.scope.join(' ')
        : typeof req.body?.scope === 'string' ? req.body.scope : undefined,
    );
    const allowedScopes = scopes && scopes.length > 0 ? scopes : [...ALL_SCOPES_SET];

    const clientId = `cli_${crypto.randomBytes(9).toString('hex')}`;
    const { client, clientSecret } = await createOAuthClient({
      clientId,
      name: clientName,
      redirectUris,
      allowedScopes,
      ownerUserId: null,
      requirePkce: true,
      requireConsent: true,
    });

    return res.status(201).json({
      client_id: client.clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      scope: client.allowedScopes.join(' '),
    });
  } catch (err) { next(err); }
});

/**
 * RFC 6749 §2.3.1 — client credentials via HTTP Basic (preferred) or
 * client_secret_post. Returns null when credentials are absent/mismatched.
 */
async function authenticateClient(req: Request): Promise<OAuthClient | null> {
  let clientId: string | null = null;
  let clientSecret: string | null = null;

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') {
    const basic = /^Basic\s+(.+)$/i.exec(authorization.trim());
    if (basic) {
      try {
        const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        if (idx >= 0) {
          clientId = safeDecode(decoded.slice(0, idx));
          clientSecret = safeDecode(decoded.slice(idx + 1));
        }
      } catch (_) { /* fall through to body credentials */ }
    }
  }

  if (!clientId || !clientSecret) {
    clientId = firstStr(req.body?.client_id);
    clientSecret = firstStr(req.body?.client_secret);
  }
  if (!clientId || !clientSecret) return null;

  const db = getDb();
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  if (!client || client.revokedAt) return null;
  if (!timingSafeHex(sha256Hex(clientSecret), client.clientSecretHash)) return null;
  return client;
}

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

/* ── Shared authorize-parameter validation ─────────────────── */

type AuthorizeParams = {
  client: OAuthClient;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
};

type AuthorizeFailure =
  | { kind: 'bad_request'; message: string }
  | { kind: 'redirect'; redirectUri: string; error: string; description: string; state: string };

/**
 * Validates every parameter an attacker can influence BEFORE any redirect or
 * code issuance happens. A mismatched redirect_uri must never be followed —
 * we render a plain error page instead of leaking codes to open redirects.
 */
async function validateAuthorizeParams(
  rawClientId: string | null,
  rawRedirectUri: string | null,
  rawResponseType: string | null,
  rawScope: string | null,
  rawState: string | null,
  rawCodeChallenge: string | null,
  rawCodeChallengeMethod: string | null,
): Promise<{ ok: true; params: AuthorizeParams } | { ok: false; failure: AuthorizeFailure }> {
  if (!rawClientId || !rawRedirectUri) {
    return { ok: false, failure: { kind: 'bad_request', message: 'client_id and redirect_uri are required.' } };
  }
  const db = getDb();
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, rawClientId))
    .limit(1);
  if (!client || client.revokedAt) {
    return { ok: false, failure: { kind: 'bad_request', message: 'Unknown OAuth client.' } };
  }
  // Exact-match against the registered list only.
  if (!client.redirectUris.includes(rawRedirectUri)) {
    return { ok: false, failure: { kind: 'bad_request', message: 'redirect_uri is not registered for this client.' } };
  }
  if (rawResponseType !== 'code') {
    return {
      ok: false,
      failure: {
        kind: 'redirect', redirectUri: rawRedirectUri,
        error: 'unsupported_response_type', description: 'Only response_type=code is supported.',
        state: rawState ?? '',
      },
    };
  }
  const scopes = parseScopeParam(rawScope);
  if (!scopes || scopes.length === 0 || !scopes.every((s) => client.allowedScopes.includes(s))) {
    return {
      ok: false,
      failure: {
        kind: 'redirect', redirectUri: rawRedirectUri,
        error: 'invalid_scope', description: 'Requested scope is empty or outside the client allow-list.',
        state: rawState ?? '',
      },
    };
  }
  let codeChallenge: string | null = null;
  let codeChallengeMethod: string | null = null;
  if (client.requirePkce) {
    if (!rawCodeChallenge) {
      return {
        ok: false,
        failure: {
          kind: 'redirect', redirectUri: rawRedirectUri,
          error: 'invalid_request', description: 'PKCE code_challenge is required for this client.',
          state: rawState ?? '',
        },
      };
    }
    if (rawCodeChallengeMethod !== CHALLENGE_METHOD) {
      return {
        ok: false,
        failure: {
          kind: 'redirect', redirectUri: rawRedirectUri,
          error: 'invalid_request', description: `code_challenge_method must be ${CHALLENGE_METHOD}.`,
          state: rawState ?? '',
        },
      };
    }
    if (!/^[A-Za-z0-9\-_]{43}$/.test(rawCodeChallenge)) {
      return {
        ok: false,
        failure: {
          kind: 'redirect', redirectUri: rawRedirectUri,
          error: 'invalid_request', description: 'Malformed code_challenge.',
          state: rawState ?? '',
        },
      };
    }
    codeChallenge = rawCodeChallenge;
    codeChallengeMethod = CHALLENGE_METHOD;
  }
  return {
    ok: true,
    params: {
      client,
      redirectUri: rawRedirectUri,
      scopes,
      state: rawState ?? '',
      codeChallenge,
      codeChallengeMethod,
    },
  };
}

function redirectToClient(res: Response, params: AuthorizeParams, extra: Record<string, string>) {
  const target = new URL(params.redirectUri);
  for (const [k, v] of Object.entries(extra)) target.searchParams.set(k, v);
  if (params.state) target.searchParams.set('state', params.state);
  // RFC 9207 — explicit issuer so clients can reject mix-up attacks.
  target.searchParams.set('iss', OAUTH_ISSUER);
  return res.redirect(302, target.toString());
}

function renderErrorPage(res: Response, status: number, title: string, message: string) {
  return res.status(status).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} — Socrates</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#faf7f2;color:#1f1b16;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{max-width:32rem;padding:2rem}h1{font-size:1.25rem}p{line-height:1.6;color:#5c5347}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`);
}

/* ── GET /api/oauth/authorize — consent screen ─────────────── */

router.get('/authorize', requireAuth, async (req, res, next) => {
  try {
    const verdict = await validateAuthorizeParams(
      firstStr(req.query.client_id),
      firstStr(req.query.redirect_uri),
      firstStr(req.query.response_type),
      firstStr(req.query.scope),
      firstStr(req.query.state),
      firstStr(req.query.code_challenge),
      firstStr(req.query.code_challenge_method),
    );
    if (!verdict.ok) {
      const f = verdict.failure;
      if (f.kind === 'redirect') {
        return redirectToClient(res, {
          client: null as unknown as OAuthClient,
          redirectUri: f.redirectUri, scopes: [], state: f.state,
          codeChallenge: null, codeChallengeMethod: null,
        }, { error: f.error, error_description: f.description });
      }
      return renderErrorPage(res, 400, 'Authorization request failed', f.message);
    }

    const { params } = verdict;
    // Trusted first-party clients may skip the interactive consent step.
    if (!params.client.requireConsent) {
      return await issueCodeAndRedirect(req, res, params);
    }

    // Fresh double-submit pair for the no-JS consent form: the cookie carries
    // one half, the hidden field the other; POST compares them itself because
    // a plain form cannot send X-CSRF-Token headers. rotateCsrfToken returns
    // the value — a plain res.cookie() would leave req.cookies untouched.
    const csrfToken = rotateCsrfToken(res, req);
    const scopeItems = params.scopes.map((s) => `
        <li><code>${escapeHtml(s)}</code></li>`).join('');
    return res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Authorize ${escapeHtml(params.client.name)} — Socrates</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#faf7f2;color:#1f1b16;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:1rem}
.card{background:#fff;border:1px solid #e5ddd0;border-radius:14px;max-width:30rem;width:100%;padding:2rem}
h1{font-size:1.15rem;margin:0 0 .25rem}p{color:#5c5347;line-height:1.55;margin:.35rem 0 1.1rem;font-size:.92rem}
ul{margin:0 0 1.4rem;padding-left:1.2rem;line-height:1.9}code{background:#f3ede3;padding:.1rem .35rem;border-radius:5px;font-size:.85em}
.row{display:flex;gap:.75rem}button{flex:1;padding:.7rem 0;border-radius:10px;border:1px solid transparent;font-size:.95rem;cursor:pointer}
.allow{background:#1f1b16;color:#faf7f2}.deny{background:transparent;color:#1f1b16;border-color:#d8cdba}
small{display:block;margin-top:1.2rem;color:#8a7f70;font-size:.78rem;line-height:1.5}
</style></head><body>
<div class="card">
  <h1>Authorize ${escapeHtml(params.client.name)}?</h1>
  <p>This agent is asking to act on your Socrates account${params.client.homepageUrl ? ` (<a href="${escapeHtml(params.client.homepageUrl)}" rel="noopener noreferrer">${escapeHtml(new URL(params.client.homepageUrl).host)}</a>)` : ''}. It will receive a scoped token that can be revoked at any time.</p>
  <ul>${scopeItems}</ul>
  <form method="post" action="/api/oauth/authorize">
    <input type="hidden" name="client_id" value="${escapeHtml(params.client.clientId)}">
    <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
    <input type="hidden" name="scope" value="${escapeHtml(params.scopes.join(' '))}">
    <input type="hidden" name="state" value="${escapeHtml(params.state)}">
    <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge ?? '')}">
    <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod ?? '')}">
    <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}">
    <div class="row">
      <button class="deny" type="submit" name="decision" value="deny">Deny</button>
      <button class="allow" type="submit" name="decision" value="allow">Allow</button>
    </div>
  </form>
  <small>Signed in as ${escapeHtml(req.user?.email ?? '')}. You are granting access for a single session; revisit this page any time you re-authorize.</small>
</div>
</body></html>`);
  } catch (err) { next(err); }
});

async function issueCodeAndRedirect(req: Request, res: Response, params: AuthorizeParams) {
  const code = randomToken();
  const db = getDb();
  await db.insert(oauthAuthorizationCodes).values({
    // Only the SHA-256 of the code is stored — a DB leak cannot mint tokens.
    codeHash: sha256Hex(code),
    clientId: params.client.clientId,
    userId: req.userId!,
    redirectUri: params.redirectUri,
    scopes: params.scopes,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return redirectToClient(res, params, { code });
}

/* ── POST /api/oauth/authorize — consent decision ──────────── */

router.post('/authorize', requireAuth, async (req, res, next) => {
  try {
    // Manual double-submit: this route rides the sid cookie but a plain HTML
    // form cannot send the X-CSRF-Token header, so the global csrf middleware
    // is bypassed (OAUTH_TOKEN_PATHS) and the hidden field is compared here.
    const submitted = firstStr(req.body?.csrf_token);
    const cookieToken = req.cookies?.csrf;
    if (typeof cookieToken !== 'string' || !submitted || !timingSafeHex(submitted, cookieToken)) {
      return renderErrorPage(res, 403, 'Request blocked', 'CSRF validation failed. Go back, reload the authorization page, and try again.');
    }

    const decision = firstStr(req.body?.decision);
    const verdict = await validateAuthorizeParams(
      firstStr(req.body?.client_id),
      firstStr(req.body?.redirect_uri),
      'code',
      firstStr(req.body?.scope),
      firstStr(req.body?.state),
      firstStr(req.body?.code_challenge),
      firstStr(req.body?.code_challenge_method),
    );
    if (!verdict.ok) {
      const f = verdict.failure;
      if (f.kind === 'redirect') {
        return redirectToClient(res, {
          client: null as unknown as OAuthClient,
          redirectUri: f.redirectUri, scopes: [], state: f.state,
          codeChallenge: null, codeChallengeMethod: null,
        }, { error: f.error, error_description: f.description });
      }
      return renderErrorPage(res, 400, 'Authorization request failed', f.message);
    }

    if (decision === 'allow') {
      return await issueCodeAndRedirect(req, res, verdict.params);
    }
    return redirectToClient(res, verdict.params, {
      error: 'access_denied',
      error_description: 'The resource owner denied the request.',
    });
  } catch (err) { next(err); }
});

/* ── Token-endpoint plumbing ───────────────────────────────── */

function tokenError(res: Response, status: number, error: string, description?: string, basicChallenge = false) {
  if (basicChallenge) res.set('WWW-Authenticate', wwwAuthenticateChallenge());
  return res.status(status).json({ error, ...(description ? { error_description: description } : {}) });
}

type TokenRow = typeof oauthAccessTokens.$inferSelect;

/* ── POST /api/oauth/token ─────────────────────────────────── */

router.post('/token', async (req, res, next) => {
  try {
    const client = await authenticateClient(req);
    if (!client) {
      return tokenError(res, 401, 'invalid_client', 'Client authentication failed.', Boolean(req.headers.authorization));
    }

    const grantType = firstStr(req.body?.grant_type);

    if (grantType === 'authorization_code') {
      const code = firstStr(req.body?.code);
      const verifier = firstStr(req.body?.code_verifier);
      const redirectUri = firstStr(req.body?.redirect_uri);
      if (!code || !verifier || !redirectUri) {
        return tokenError(res, 400, 'invalid_request', 'code, code_verifier and redirect_uri are required.');
      }

      const db = getDb();
      // Atomic single-use consumption — a replayed concurrent request loses
      // the UPDATE race and finds zero rows.
      const consumed = await db
        .update(oauthAuthorizationCodes)
        .set({ consumedAt: new Date() })
        .where(and(
          eq(oauthAuthorizationCodes.codeHash, sha256Hex(code)),
          isNull(oauthAuthorizationCodes.consumedAt),
        ))
        .returning();
      const row = consumed[0];
      if (!row || row.expiresAt < new Date()) {
        return tokenError(res, 400, 'invalid_grant', 'Authorization code is invalid, expired, or already used.');
      }
      if (row.clientId !== client.clientId) {
        return tokenError(res, 400, 'invalid_grant', 'Authorization code was issued to another client.');
      }
      if (row.redirectUri !== redirectUri) {
        return tokenError(res, 400, 'invalid_grant', 'redirect_uri does not match the authorization request.');
      }
      if (!VERIFIER_RE.test(verifier)) {
        return tokenError(res, 400, 'invalid_request', 'Malformed code_verifier.');
      }
      if (!row.codeChallenge || !timingSafeHex(s256Challenge(verifier), row.codeChallenge)) {
        return tokenError(res, 400, 'invalid_grant', 'PKCE verification failed.');
      }

      const { accessToken, refreshToken } = await issueTokenPair({
        clientId: client.clientId,
        userId: row.userId,
        scopes: row.scopes,
      });
      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_S,
        refresh_token: refreshToken,
        scope: row.scopes.join(' '),
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = firstStr(req.body?.refresh_token);
      if (!refreshToken) {
        return tokenError(res, 400, 'invalid_request', 'refresh_token is required.');
      }
      const db = getDb();
      const [row] = await db
        .select()
        .from(oauthAccessTokens)
        .where(and(
          eq(oauthAccessTokens.refreshTokenHash, sha256Hex(refreshToken)),
          eq(oauthAccessTokens.clientId, client.clientId),
          isNull(oauthAccessTokens.revokedAt),
        ))
        .limit(1);
      if (!row || !refreshWithinWindow(row)) {
        return tokenError(res, 400, 'invalid_grant', 'Refresh token is invalid, expired, or revoked.');
      }

      // Rotation: the presented refresh token dies with this exchange, so a
      // replayed one can never extend a session beyond the original window.
      await db
        .update(oauthAccessTokens)
        .set({ revokedAt: new Date() })
        .where(eq(oauthAccessTokens.tokenHash, row.tokenHash));

      // A rotated family inherits the ORIGINAL window anchor.
      const refreshed = await issueTokenPair({
        clientId: client.clientId,
        userId: row.userId,
        scopes: row.scopes,
        refreshWindowAnchor: row.createdAt,
      });
      return res.json({
        access_token: refreshed.accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_S,
        refresh_token: refreshed.refreshToken,
        scope: row.scopes.join(' '),
      });
    }

    return tokenError(res, 400, 'unsupported_grant_type', 'Supported grant types: authorization_code, refresh_token.');
  } catch (err) { next(err); }
});

/* ── POST /api/oauth/revoke (RFC 7009) ─────────────────────── */

router.post('/revoke', async (req, res, next) => {
  try {
    const client = await authenticateClient(req);
    if (!client) {
      return tokenError(res, 401, 'invalid_client', 'Client authentication failed.', Boolean(req.headers.authorization));
    }
    const token = firstStr(req.body?.token);
    if (!token) return tokenError(res, 400, 'invalid_request', 'token is required.');

    // RFC 7009 §2.1 — revoking either half of a pair kills both halves, and
    // a not-found or foreign-client token still yields a calm 200 so the
    // endpoint cannot be used to probe token existence.
    await revokeTokenValue(client.clientId, token);

    return res.status(200).json({});
  } catch (err) { next(err); }
});

export default router;
