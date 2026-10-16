import type { Request, Response, NextFunction } from 'express';
import { Forbidden, Unauthorized } from '../lib/errors.js';

export { ALL_SCOPES, ALL_SCOPES_SET, SCOPE_DESCRIPTIONS, parseScopes, parseScopeParam } from '../lib/authScopes.js';
export type { Scope } from '../lib/authScopes.js';

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
