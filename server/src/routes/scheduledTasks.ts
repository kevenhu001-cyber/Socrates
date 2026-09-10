import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { projects, scheduledTasks, sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { WORKSPACE_AGENT_BACKGROUND_ENABLED } from '../services/agentRuntime.js';

const router = Router();
router.use(requireAuth);

const FREQUENCIES = ['once', 'hourly', 'daily', 'weekly', 'monthly', 'custom'];
const STATUSES = ['pending', 'active', 'paused', 'completed', 'failed'];

/* Normalise a client-supplied nextRunAt value. The form sends an ISO
   string; an empty string / null clears the field. Throws on garbage
   so a bad value never reaches the timestamp column. */
function parseNextRunAt(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  if (isNaN(date.getTime())) throw new BadRequest('nextRunAt is not a valid date');
  return date;
}

/* GET /api/scheduled-tasks — list user's scheduled tasks */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(scheduledTasks)
      .where(eq(scheduledTasks.userId, req.userId!))
      .orderBy(desc(scheduledTasks.nextRunAt));
    return res.json({ tasks: rows });
  } catch (err) { next(err); }
});

/* POST /api/scheduled-tasks — create */
router.post('/', async (req, res, next) => {
  try {
    const { title, prompt, sessionId, projectId, cronExpression, frequency, nextRunAt, agentKind, runPolicy, notificationConfig } = req.body;
    if (!title || !String(title).trim()) throw new BadRequest('title is required');
    const freq = frequency || 'once';
    if (!FREQUENCIES.includes(freq)) throw new BadRequest('frequency must be one of: ' + FREQUENCIES.join(', '));
    /* Default the first run to "now" so a task created without an
       explicit time still executes on the next scheduler poll instead
       of sitting dormant forever with a NULL nextRunAt. */
    const firstRun = parseNextRunAt(nextRunAt) || new Date();
    const db = getDb();
    const normalizedAgentKind = agentKind === 'codex' ? 'codex' : 'native';
    if (normalizedAgentKind === 'codex' && !WORKSPACE_AGENT_BACKGROUND_ENABLED) {
      throw new BadRequest('Codex background runs are disabled');
    }
    if (sessionId) {
      const [session] = await db.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.id, String(sessionId)), eq(sessions.userId, req.userId!))).limit(1);
      if (!session) throw new NotFound('Session not found');
    }
    if (projectId) {
      const [project] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, String(projectId)), eq(projects.userId, req.userId!))).limit(1);
      if (!project) throw new NotFound('Project not found');
    }
    /* Scheduled policy is server-owned. A client may request a small,
       declarative allowlist, but cannot set Codex's sandbox, cwd, provider,
       or approval policy. Unattended runs still pause on side effects. */
    const safePolicy = runPolicy && typeof runPolicy === 'object' && !Array.isArray(runPolicy)
      ? {
          allowedActions: Array.isArray(runPolicy.allowedActions) ? runPolicy.allowedActions.slice(0, 30).map(String) : [],
          maxDurationMs: Number.isFinite(Number(runPolicy.maxDurationMs)) ? Math.min(900_000, Math.max(60_000, Number(runPolicy.maxDurationMs))) : null,
        }
      : {};
    const safeNotifications = notificationConfig && typeof notificationConfig === 'object' && !Array.isArray(notificationConfig)
      ? { enabled: notificationConfig.enabled !== false, channels: Array.isArray(notificationConfig.channels) ? notificationConfig.channels.slice(0, 5).map(String) : [] }
      : { enabled: true, channels: [] };
    const [task] = await db.insert(scheduledTasks).values({
      userId: req.userId!,
      title: String(title).trim(),
      prompt: prompt || '',
      sessionId: sessionId || null,
      projectId: projectId || null,
      agentKind: normalizedAgentKind,
      runPolicy: safePolicy,
      notificationConfig: safeNotifications,
      cronExpression: cronExpression || null,
      frequency: freq,
      status: 'active',
      nextRunAt: firstRun,
    }).returning();
    return res.status(201).json(task);
  } catch (err) { next(err); }
});

/* PATCH /api/scheduled-tasks/:id — update */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [existing] = await db.select().from(scheduledTasks)
      .where(and(eq(scheduledTasks.id, req.params.id), eq(scheduledTasks.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('Scheduled task not found');
    const patch: Record<string, unknown> = {};
    for (const key of ['title', 'prompt', 'sessionId', 'projectId', 'cronExpression', 'frequency', 'status', 'agentKind']) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.agentKind !== undefined && patch.agentKind !== 'native' && patch.agentKind !== 'codex') {
      throw new BadRequest('agentKind must be native or codex');
    }
    if (patch.agentKind === 'codex' && !WORKSPACE_AGENT_BACKGROUND_ENABLED) {
      throw new BadRequest('Codex background runs are disabled');
    }
    if (patch.projectId) {
      const [project] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, String(patch.projectId)), eq(projects.userId, req.userId!))).limit(1);
      if (!project) throw new NotFound('Project not found');
    }
    if (patch.sessionId) {
      const [session] = await db.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.id, String(patch.sessionId)), eq(sessions.userId, req.userId!))).limit(1);
      if (!session) throw new NotFound('Session not found');
    }
    if (req.body.runPolicy !== undefined) {
      const policy = req.body.runPolicy;
      patch.runPolicy = policy && typeof policy === 'object' && !Array.isArray(policy)
        ? { allowedActions: Array.isArray(policy.allowedActions) ? policy.allowedActions.slice(0, 30).map(String) : [], maxDurationMs: Number.isFinite(Number(policy.maxDurationMs)) ? Math.min(900_000, Math.max(60_000, Number(policy.maxDurationMs))) : null }
        : {};
    }
    if (req.body.notificationConfig !== undefined) {
      const notifications = req.body.notificationConfig;
      patch.notificationConfig = notifications && typeof notifications === 'object' && !Array.isArray(notifications)
        ? { enabled: notifications.enabled !== false, channels: Array.isArray(notifications.channels) ? notifications.channels.slice(0, 5).map(String) : [] }
        : { enabled: true, channels: [] };
    }
    if (patch.frequency !== undefined && !FREQUENCIES.includes(String(patch.frequency))) {
      throw new BadRequest('frequency must be one of: ' + FREQUENCIES.join(', '));
    }
    if (patch.status !== undefined && !STATUSES.includes(String(patch.status))) {
      throw new BadRequest('status must be one of: ' + STATUSES.join(', '));
    }
    if (req.body.nextRunAt !== undefined) {
      patch.nextRunAt = parseNextRunAt(req.body.nextRunAt);
    }
    /* Resuming a task that has no future run slot (paused past its
       time, or a completed/failed one-shot being re-armed) would
       otherwise never fire again — give it an immediate slot. */
    if (patch.status === 'active' && patch.nextRunAt === undefined) {
      const current = existing.nextRunAt ? new Date(existing.nextRunAt) : null;
      if (!current || current.getTime() <= Date.now()) patch.nextRunAt = new Date();
    }
    patch.updatedAt = new Date();
    await db.update(scheduledTasks).set(patch).where(eq(scheduledTasks.id, req.params.id));
    const [updated] = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* POST /api/scheduled-tasks/:id/run — execute immediately.
   Runs the task synchronously (LLM call included) and returns the
   updated row; the recurring schedule is left untouched so a manual
   run never shifts the next planned slot. */
router.post('/:id/run', async (req, res, next) => {
  try {
    const db = getDb();
    const [task] = await db.select().from(scheduledTasks)
      .where(and(eq(scheduledTasks.id, req.params.id), eq(scheduledTasks.userId, req.userId!)))
      .limit(1);
    if (!task) throw new NotFound('Scheduled task not found');
    const { runScheduledTaskNow } = await import('../services/scheduler.js');
    const updated = await runScheduledTaskNow(task, { reschedule: false });
    return res.json(updated);
  } catch (err) { next(err); }
});

/* DELETE /api/scheduled-tasks/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(scheduledTasks)
      .where(and(eq(scheduledTasks.id, req.params.id), eq(scheduledTasks.userId, req.userId!)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
