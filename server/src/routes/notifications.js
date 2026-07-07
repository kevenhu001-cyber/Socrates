import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { notificationTokens } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { BadRequest } from '../lib/errors.js';

/* P_notifications-zod
 * Previous gap: POST /api/notifications/register accepted `req.body.token` and
 * `req.body.platform` as raw user input with no validation. That let clients
 * submit oversized blobs, type-confused objects (PG would coerce arrays to
 * "[object Array]" in TEXT columns), or arbitrary string payloads into a
 * column whose downstream consumers trust the shape. The zod schema below
 * is the validation boundary; `strict()` rejects unknown keys so we never
 * silently accept a renamed/extra field that future code might assume is
 * safe. The DB NOT NULL constraints on (token, platform) are the source
 * of truth for required fields; zod mirrors them.
 */
const NotificationRegisterSchema = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(['web', 'ios', 'android']),
}).strict();

const router = Router();
router.use(requireAuth);

/* POST /api/notifications/register */
router.post('/register', async (req, res, next) => {
  try {
    const parsed = NotificationRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest('Invalid notification payload: ' + (parsed.error.issues[0]?.message || 'validation failed'));
    }
    const { token, platform } = parsed.data;
    const { deviceId, channels } = req.body;
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
