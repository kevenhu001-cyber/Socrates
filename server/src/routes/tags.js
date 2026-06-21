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

    // Atomic tag assignment: delete old links, fetch existing tags
    // in one SELECT, bulk-INSERT any missing tags, bulk-INSERT the new
    // links. All steps run in one transaction so a mid-loop failure
    // rolls back cleanly instead of leaving a partial tag set.
    await db.transaction(async (tx) => {
      await tx.delete(sessionTags).where(eq(sessionTags.sessionId, req.params.id));

      const names = tagNames.slice(0, 12);
      if (names.length === 0) return;

      const existingTags = await tx.select().from(tags)
        .where(and(eq(tags.userId, req.userId), inArray(tags.name, names)));
      const existingByName = new Map(existingTags.map(t => [t.name, t]));

      const missingNames = names.filter(n => !existingByName.has(n));
      let createdTags = [];
      if (missingNames.length > 0) {
        createdTags = await tx.insert(tags)
          .values(missingNames.map(name => ({ userId: req.userId, name })))
          .returning();
        for (const t of createdTags) existingByName.set(t.name, t);
      }

      const links = names.map(n => {
        const t = existingByName.get(n);
        return t ? { sessionId: req.params.id, tagId: t.id } : null;
      }).filter(Boolean);
      if (links.length > 0) {
        await tx.insert(sessionTags).values(links);
      }
    });

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
