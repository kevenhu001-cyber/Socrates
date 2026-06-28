import { Router } from 'express';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { mistakes } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

const CreateMistakeSchema = z.object({
  sessionId: z.string().uuid().optional().nullable(),
  nodeName: z.string().max(500).optional().nullable(),
  questionContent: z.string().min(1).max(200000),
  userAnswer: z.string().max(200000).optional().nullable(),
  correctAnswer: z.string().max(200000).optional().nullable(),
  source: z.enum(['quiz', 'practice', 'manual']).optional().default('quiz'),
}).passthrough();

const UpdateMistakeSchema = z.object({
  isResolved: z.boolean().optional(),
  resolvedAt: z.string().datetime().optional().nullable(),
}).passthrough();

const router = Router();

router.use(requireAuth);

/* ─── List mistakes for the current user ─── */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { resolved, nodeName, sessionId } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);

    const conditions = [eq(mistakes.userId, req.userId)];
    if (resolved !== undefined) {
      // Accept 'true'/'false'/'1'/'0'
      const flag = resolved === 'true' || resolved === '1';
      conditions.push(eq(mistakes.isResolved, flag));
    }
    if (typeof nodeName === 'string' && nodeName.length > 0) {
      conditions.push(eq(mistakes.nodeName, nodeName));
    }
    if (typeof sessionId === 'string' && isUuid(sessionId)) {
      conditions.push(eq(mistakes.sessionId, sessionId));
    }

    const where = and(...conditions);

    const [totalRow] = await db.select({ total: count() })
      .from(mistakes)
      .where(where);

    const items = await db.select()
      .from(mistakes)
      .where(where)
      .orderBy(desc(mistakes.collectedAt))
      .limit(limit)
      .offset(offset);

    return res.json({ items, total: Number(totalRow?.total ?? 0) });
  } catch (err) { next(err); }
});

/* ─── Create a mistake ─── */
router.post('/', async (req, res, next) => {
  try {
    const db = getDb();
    const parsed = CreateMistakeSchema.parse(req.body);
    if (!parsed.questionContent) throw new BadRequest('questionContent is required');

    const [created] = await db.insert(mistakes).values({
      userId: req.userId,
      sessionId: parsed.sessionId || null,
      nodeName: parsed.nodeName || null,
      questionContent: parsed.questionContent,
      userAnswer: parsed.userAnswer || null,
      correctAnswer: parsed.correctAnswer || null,
      source: parsed.source || 'quiz',
    }).returning();

    return res.status(201).json(created);
  } catch (err) { next(err); }
});

/* ─── Update a mistake (mainly to mark resolved) ─── */
router.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Mistake not found');
    const db = getDb();
    const parsed = UpdateMistakeSchema.parse(req.body);

    // Ensure ownership before updating.
    const [existing] = await db.select({ userId: mistakes.userId })
      .from(mistakes)
      .where(eq(mistakes.id, req.params.id))
      .limit(1);
    if (!existing || existing.userId !== req.userId) {
      throw new NotFound('Mistake not found');
    }

    const patch = {};
    if (parsed.isResolved !== undefined) {
      patch.isResolved = parsed.isResolved;
      // When marking resolved, stamp resolvedAt unless caller overrides.
      if (parsed.isResolved && parsed.resolvedAt === undefined) {
        patch.resolvedAt = new Date();
      } else if (!parsed.isResolved) {
        patch.resolvedAt = null;
      }
    }
    if (parsed.resolvedAt !== undefined) {
      patch.resolvedAt = parsed.resolvedAt ? new Date(parsed.resolvedAt) : null;
    }

    const [updated] = await db.update(mistakes)
      .set(patch)
      .where(eq(mistakes.id, req.params.id))
      .returning();

    return res.json(updated);
  } catch (err) { next(err); }
});

/* ─── Delete a mistake ─── */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Mistake not found');
    const db = getDb();
    // Re-check ownership in the DELETE predicate (defense in depth).
    const [deleted] = await db.delete(mistakes)
      .where(and(eq(mistakes.id, req.params.id), eq(mistakes.userId, req.userId)))
      .returning({ id: mistakes.id });
    if (!deleted) throw new NotFound('Mistake not found');
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
