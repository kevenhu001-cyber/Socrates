/**
 * Admin gate middleware for the operator config routes
 * (/api/system-models, /api/embedding-config).
 *
 * The operator console is behind the independent ADMIN_PASSWORD
 * credential (services/adminAuth.ts), not the user session: an
 * operator who does not want a full user account still gets the
 * console, and a leaked admin password does not compromise any
 * user row.
 *
 * Token sources, in order:
 *   1. X-Admin-Token request header (what the SPA sends from its
 *      in-memory token variable).
 *   2. socrates_admin_session httpOnly cookie (set by /api/admin-auth/
 *      login — covers a page reload).
 *
 * The user session cookie is NOT accepted. This is deliberate: the
 * /admin page must be reachable even when the operator is logged
 * out of the user account, and an authenticated user session must
 * never silently grant admin powers.
 */
import type { Request, Response, NextFunction } from 'express';
import { Forbidden } from '../lib/errors.js';
import {
  verifyAdminSessionToken,
  extractAdminToken,
} from '../services/adminAuth.js';

export async function requireAdminSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractAdminToken(req);
    if (!token || !verifyAdminSessionToken(token)) {
      throw new Forbidden('Admin session required — sign in at /admin.');
    }
    return next();
  } catch (err) { next(err); }
}
