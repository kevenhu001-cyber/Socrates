import type { User } from './http.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth/optionalAuth; null when unauthenticated. */
      userId: string | null;
      /** The authenticated user row, or null when unauthenticated. */
      user: User | null;
      /** Per-request correlation id set by the requestId middleware. */
      id?: string;
      /**
       * Scopes granted to the resolved credential. Session-cookie and
       * mobile-bearer callers hold every scope (they are the account owner);
       * agent-key callers only hold the scopes minted onto their key.
       * Undefined until requireAuth/optionalAuth resolves a credential.
       */
      authScopes?: Set<string>;
      /** Which credential kind authenticated this request. */
      authKind?: 'session' | 'mobile_bearer' | 'agent_key' | 'oauth_token';
    }
  }
}

export {};
