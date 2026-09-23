import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/me/preferences', async (req, res, next) => {
  try {
    const [user] = await getDb().select({ preferences: users.preferences }).from(users).where(eq(users.id, req.userId!)).limit(1);
    return res.json({ preferences: user?.preferences || {} });
  } catch (error) { next(error); }
});

router.patch('/me/preferences', async (req, res, next) => {
  try {
    const allowed = ['theme', 'language', 'notifications', 'imageModel', 'voiceLanguage'];
    const input = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const patch: Record<string, unknown> = {};
    for (const key of allowed) if (input[key] !== undefined) patch[key] = input[key];
    if (patch.theme !== undefined && !['system', 'light', 'dark'].includes(String(patch.theme))) return res.status(400).json({ code: 'INVALID_PREFERENCE', message: 'Invalid theme' });
    if (patch.language !== undefined && !['zh', 'en'].includes(String(patch.language))) return res.status(400).json({ code: 'INVALID_PREFERENCE', message: 'Invalid language' });
    if (patch.notifications !== undefined && typeof patch.notifications !== 'boolean') return res.status(400).json({ code: 'INVALID_PREFERENCE', message: 'Invalid notifications preference' });
    if (patch.imageModel !== undefined && (typeof patch.imageModel !== 'string' || patch.imageModel.length > 120)) return res.status(400).json({ code: 'INVALID_PREFERENCE', message: 'Invalid image model' });
    if (patch.voiceLanguage !== undefined && !['auto', 'zh-CN', 'en-US'].includes(String(patch.voiceLanguage))) return res.status(400).json({ code: 'INVALID_PREFERENCE', message: 'Invalid voice language' });
    const db = getDb();
    const preferences = await db.transaction(async (tx) => {
      const [user] = await tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, req.userId!)).for('update').limit(1);
      const current = user?.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences) ? user.preferences : {};
      const nextPrefs = { ...current, ...patch };
      await tx.update(users).set({ preferences: nextPrefs }).where(eq(users.id, req.userId!));
      return nextPrefs;
    });
    return res.json({ preferences });
  } catch (error) { next(error); }
});

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
