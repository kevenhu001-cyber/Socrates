import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/* PATCH /api/users/me — update user preferences / custom instructions */
router.patch('/me', async (req, res, next) => {
  try {
    const db = getDb();
    const patch: Record<string, unknown> = {};
    if (req.body.displayName !== undefined) patch.displayName = req.body.displayName;
    if (req.body.customInstructions !== undefined) patch.customInstructions = req.body.customInstructions;
    if (req.body.preferences !== undefined) patch.preferences = req.body.preferences;
    if (req.body.defaultModel !== undefined) patch.defaultModel = req.body.defaultModel;

    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, req.userId!));
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    return res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      tier: user.tier,
      isGuest: user.isGuest,
      customInstructions: user.customInstructions,
      preferences: user.preferences,
      defaultModel: user.defaultModel,
    });
  } catch (err) { next(err); }
});

export default router;
