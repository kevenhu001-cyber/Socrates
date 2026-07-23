import type { users, authSessions } from '../db/schema.js';

/** A full user row as stored in the database (the `req.user` shape). */
export type User = typeof users.$inferSelect;

/** An auth-session row keyed by the `sid` cookie. */
export type AuthSession = typeof authSessions.$inferSelect;

/** Standard JSON error payload returned by the error middleware. */
export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
