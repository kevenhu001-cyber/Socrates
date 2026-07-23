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
    }
  }
}

export {};
