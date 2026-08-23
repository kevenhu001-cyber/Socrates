import type { Request, Response, NextFunction } from 'express';
import { Forbidden, Unauthorized } from '../lib/errors.js';

/* Closed scope vocabulary for the OAuth authorization server and the
 * scoped agent API keys. Every granted scope must come from this list —
 * anything else is rejected at issuance time, so a scope stored in the DB
 * can always be checked verbatim here. */
export const ALL_SCOPES = [
  'chat:read', 'chat:write',
  'memory:read', 'memory:write',
  'sessions:read', 'sessions:write',
  'files:read', 'files:write',
  'projects:read', 'projects:write',
] as const;

export type Scope = (typeof ALL_SCOPES)[number];

export const ALL_SCOPES_SET: ReadonlySet<string> = new Set(ALL_SCOPES);

/** Human-readable one-liners used on the consent screen and in docs. */
export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  'chat:read': 'Read your chat sessions and messages.',
  'chat:write': 'Send messages on your behalf.',
  'memory:read': 'Read your cross-session memory notes.',
  'memory:write': 'Add or update your cross-session memory notes.',
  'sessions:read': 'List your tutoring sessions and their metadata.',
  'sessions:write': 'Create or modify tutoring sessions.',
  'files:read': 'Download files you uploaded or that Socrates produced for you.',
  'files:write': 'Upload files into your account.',
  'projects:read': 'List your projects.',
  'projects:write': 'Create or modify your projects.',
};

/**
 * Validate a requested/granted scope list against the closed vocabulary.
 * Returns the deduplicated grant list, or null when any entry is unknown
 * (callers turn null into an invalid_scope / INVALID_INPUT error).
 */
export function parseScopes(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') return null;
    const scope = raw.trim();
    if (!ALL_SCOPES_SET.has(scope)) return null;
    seen.add(scope);
  }
  return [...seen];
}

/**
 * Parse a space-separated OAuth scope parameter ("chat:read memory:read").
 * Returns null when the value is malformed or contains an unknown scope.
 */
export function parseScopeParam(value: unknown): string[] | null {
  if (typeof value !== 'string' || !value.trim()) return [];
  return parseScopes(value.trim().split(/\s+/));
}

/**
 * Express middleware factory: requires the request to carry a resolved auth
 * context (set by requireAuth in middleware/auth.ts) whose granted scopes
 * cover every scope named here. Session-cookie and mobile-bearer callers are
 * the account owner and hold all scopes; agent-key callers only hold the
 * scopes minted onto their key.
 */
export function requireScope(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const granted = req.authScopes;
    if (!granted) {
      res.set('WWW-Authenticate', `Bearer realm="socrates", error="invalid_token", error_description="authentication required"`);
      return next(new Unauthorized('Authentication required'));
    }
    const missing = required.filter((s) => !granted.has(s));
    if (missing.length > 0) {
      // RFC 6750 §3 — insufficient_scope travels with a WWW-Authenticate challenge.
      res.set('WWW-Authenticate', `Bearer realm="socrates", error="insufficient_scope", scope="${missing.join(' ')}"`);
      return next(new Forbidden('INSUFFICIENT_SCOPE', `Missing required scope(s): ${missing.join(' ')}`));
    }
    next();
  };
}

/**
 * Route-family gate used right after `requireAuth` inside a resource router
 * (sessions/chat/memory/files/projects). Safe methods demand "<res>:read",
 * mutating ones "<res>:write". Session-cookie and mobile-bearer callers hold
 * every scope, so this is transparent to them; agent keys are constrained to
 * what their key was minted with.
 */
export function resourceScope(resource: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    const needed = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
      ? `${resource}:read`
      : `${resource}:write`;
    return requireScope(needed)(req, res, next);
  };
}
