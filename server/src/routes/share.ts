import { Router } from 'express';
import { getDb } from '../db/index.js';
import type { Database } from '../db/index.js';
import { shares, sessions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { generateShareToken } from '../lib/crypto.js';
import { normalizeVisibility } from '../lib/sanitize.js';

const router = Router({ mergeParams: true });

/* Helper — verify the caller owns the session and return it. */
async function getOwnedSession(db: Database, sessionId: string, userId: string) {
  const [session] = await db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  return session || null;
}

/* ─── Session share routes (all require auth) ─── */

/* GET /api/sessions/:id/share — get share info */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    // Only return the share if the caller actually owns the session.
    if (!(await getOwnedSession(db, req.params.id as string, req.userId!))) {
      return res.json({ token: null, visibility: 'private' });
    }
    const [share] = await db.select()
      .from(shares)
      .where(eq(shares.sessionId, req.params.id as string))
      .limit(1);
    return res.json(share || { token: null, visibility: 'private' });
  } catch (err) { next(err); }
});

/* POST /api/sessions/:id/share — create or update share link */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    // Whitelist visibility — see P_share-visibility-enum. Bad
    // input is silently coerced to 'unlisted' rather than 400'd
    // so the SPA can keep working with stale clients that send
    // an old value (e.g. 'link').
    const visibility = normalizeVisibility(req.body && req.body.visibility);

    // Verify ownership
    if (!(await getOwnedSession(db, req.params.id as string, req.userId!))) {
      throw new NotFound('Session not found');
    }

    const token = generateShareToken();

    await db.insert(shares).values({
      token,
      sessionId: req.params.id as string,
      visibility,
    }).onConflictDoUpdate({
      target: shares.sessionId,
      set: { token, visibility },
    });

    return res.status(201).json({ token, url: `/a/${token}`, visibility });
  } catch (err) { next(err); }
});

/* DELETE /api/sessions/:id/share — revoke share link */
router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    // Revocation is restricted to the owner. Without this check,
    // any logged-in user could revoke any session's share.
    if (!(await getOwnedSession(db, req.params.id as string, req.userId!))) {
      throw new NotFound('Session not found');
    }
    await db.delete(shares)
      .where(eq(shares.sessionId, req.params.id as string));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
