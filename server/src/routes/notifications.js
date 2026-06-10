import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { notificationTokens } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/* POST /api/notifications/register */
router.post('/register', async (req, res, next) => {
  try {
    const { platform, token, deviceId, channels } = req.body;
    if (!platform || !token) return res.status(400).json({ code: 'BAD_REQUEST', message: 'platform and token required' });
    const db = getDb();
    const [n] = await db.insert(notificationTokens).values({
      userId: req.userId, platform, token, deviceId, channels: channels || [],
    }).returning();
    return res.status(201).json(n);
  } catch (err) { next(err); }
});

/* DELETE /api/notifications/unregister */
router.delete('/unregister', async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(notificationTokens).where(eq(notificationTokens.userId, req.userId));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
