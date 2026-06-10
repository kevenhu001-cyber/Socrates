import { Router } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { tags, sessionTags, sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

/* PUT /api/sessions/:id/tags — set tags on a session */
router.put('/sessions/:id/tags', async (req, res, next) => {
  try {
    const db = getDb();
    const { tags: tagNames = [] } = req.body;
    if (!Array.isArray(tagNames)) return res.status(400).json({ code: 'BAD_REQUEST', message: 'tags must be an array' });

    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId))).limit(1);
    if (!session) throw new NotFound('Session not found');

    // Remove existing tags
    await db.delete(sessionTags).where(eq(sessionTags.sessionId, req.params.id));

    // Create or find tags
    for (const name of tagNames.slice(0, 12)) {
      let [tag] = await db.select().from(tags)
        .where(and(eq(tags.userId, req.userId), eq(tags.name, name))).limit(1);
      if (!tag) {
        [tag] = await db.insert(tags).values({ userId: req.userId, name }).returning();
      }
      await db.insert(sessionTags).values({ sessionId: req.params.id, tagId: tag.id });
    }

    return res.json({ tags: tagNames });
  } catch (err) { next(err); }
});

/* GET /api/tags — list user's tag vocabulary */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(tags).where(eq(tags.userId, req.userId));
    return res.json({ tags: rows.map(t => ({ name: t.name, color: t.color })) });
  } catch (err) { next(err); }
});

export default router;
