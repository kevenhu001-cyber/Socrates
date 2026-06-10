import { Router } from 'express';
import { getDb } from '../db/index.js';
import { shares, sessions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { NotFound, Forbidden } from '../lib/errors.js';
import { generateShareToken } from '../lib/crypto.js';

const router = Router();

/* ─── Session share routes (all require auth) ─── */

/* GET /api/sessions/:id/share — get share info */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const [share] = await db.select()
      .from(shares)
      .where(eq(shares.sessionId, req.params.id))
      .limit(1);
    return res.json(share || { token: null, visibility: 'private' });
  } catch (err) { next(err); }
});

/* POST /api/sessions/:id/share — create or update share link */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const { visibility = 'unlisted' } = req.body;

    // Verify ownership
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');

    const token = generateShareToken();

    await db.insert(shares).values({
      token,
      sessionId: req.params.id,
      visibility,
    }).onConflictDoUpdate({
      target: shares.sessionId,
      set: { token, visibility },
    });

    return res.status(201).json({ token, url: `/a/${token}` });
  } catch (err) { next(err); }
});

/* DELETE /api/sessions/:id/share — revoke share link */
router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(shares)
      .where(eq(shares.sessionId, req.params.id));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
