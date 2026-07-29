/* ──────────────────────────────────────────────
   Scheduler daemon — executes scheduled_tasks rows.

   Referenced by the scheduled_tasks schema comment: polls for
   overdue tasks (status pending/active with nextRunAt <= now),
   runs each task's prompt through the user's active LLM provider,
   persists the result as a session + messages (so it shows up in
   Recents), and reschedules according to `frequency`.

   Single-process design: one poll interval per server; a claim
   UPDATE guarded on the previous nextRunAt value prevents a task
   from double-running if a poll overlaps a manual "run now".
   ────────────────────────────────────────────── */
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { scheduledTasks, sessions, messages } from '../db/schema.js';
import { getActiveApiKey } from './apiKey.js';
import { callChatCompletion } from './llm.js';

const POLL_INTERVAL_MS = parseInt(process.env.SCHEDULER_POLL_MS || '60000', 10);
const MAX_TASKS_PER_POLL = 10;

type ScheduledTaskRow = typeof scheduledTasks.$inferSelect;

const SCHEDULED_SYSTEM_PROMPT =
  'You are Socrates, an AI learning assistant, running a scheduled background task for the user. ' +
  'Complete the task described in the user message directly and concisely, without asking follow-up ' +
  'questions — nobody is present to answer them. Respond in the same language as the task.';

/**
 * Compute the next run time for a recurring task.
 * Returns null for one-shot / unknown frequencies (task completes after
 * one run). Monthly clamps to the last day of the shorter month
 * (Jan 31 → Feb 28/29) instead of rolling over into March.
 */
export function computeNextRunAt(frequency: string | null | undefined, from: Date = new Date()): Date | null {
  const base = new Date(from.getTime());
  switch (frequency) {
    case 'hourly':
      return new Date(base.getTime() + 3600_000);
    case 'daily':
      return new Date(base.getTime() + 86_400_000);
    case 'weekly':
      return new Date(base.getTime() + 7 * 86_400_000);
    case 'monthly': {
      const next = new Date(base.getTime());
      const day = next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, lastDay));
      return next;
    }
    default:
      return null; // once / custom / unknown → single run
  }
}

/**
 * Execute one task: call the LLM with the task prompt and persist the
 * answer as a session + message pair owned by the task's user. Repeat
 * runs of the same task append to the same session so the history of
 * a recurring briefing stays in one place.
 */
async function executeTask(task: ScheduledTaskRow): Promise<void> {
  const db = getDb();
  const provider = await getActiveApiKey(task.userId);
  if (!provider || !provider.keyPlaintext) {
    throw new Error('No active LLM provider for user');
  }

  const promptText = (task.prompt || '').trim() || task.title;
  const result = await callChatCompletion({
    apiBase: (provider.url || '').replace(/\/+$/, ''),
    apiKey: provider.keyPlaintext,
    model: provider.model,
    messages: [
      { role: 'system', content: SCHEDULED_SYSTEM_PROMPT },
      { role: 'user', content: promptText },
    ],
    maxTokens: 8000,
    temperature: 0.5,
  });

  const content = (result.content || '').trim();
  if (!content) throw new Error('LLM returned an empty response');

  // Reuse the task's session when it still exists; otherwise create one.
  let sessionId = task.sessionId;
  if (sessionId) {
    const [existing] = await db.select({ id: sessions.id }).from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, task.userId)))
      .limit(1);
    if (!existing) sessionId = null;
  }
  if (!sessionId) {
    const [session] = await db.insert(sessions).values({
      userId: task.userId,
      title: `⏰ ${task.title}`,
      topic: task.title,
      mode: 'chat',
      phase: 'chat',
      kind: 'chat',
      preview: content.slice(0, 200),
    }).returning({ id: sessions.id });
    sessionId = session.id;
    await db.update(scheduledTasks)
      .set({ sessionId })
      .where(eq(scheduledTasks.id, task.id));
  } else {
    await db.update(sessions)
      .set({ preview: content.slice(0, 200), updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  await db.insert(messages).values({ sessionId, role: 'user', content: promptText, rawText: promptText });
  await db.insert(messages).values({
    sessionId,
    role: 'assistant',
    content,
    rawText: content,
    type: 'assistant',
    model: provider.model || null,
  });
}

/**
 * Run a task immediately (manual "Run now" from the UI, or a due task
 * claimed by the poll loop). Applies the post-run bookkeeping:
 * lastRunAt / runCount, terminal status for one-shot tasks, and — when
 * `reschedule` is true — the next nextRunAt for recurring tasks.
 * Returns the updated row.
 */
export async function runScheduledTaskNow(
  task: ScheduledTaskRow,
  opts: { reschedule?: boolean } = {},
): Promise<ScheduledTaskRow> {
  const db = getDb();
  const recurringNext = computeNextRunAt(task.frequency, new Date());
  let status: string;
  let nextRunAt: Date | null | undefined;
  try {
    await executeTask(task);
    if (recurringNext) {
      status = 'active';
      nextRunAt = opts.reschedule ? recurringNext : undefined;
    } else {
      status = 'completed';
      nextRunAt = null;
    }
  } catch (err) {
    console.error(`[scheduler] task ${task.id} ("${task.title}") failed:`, (err as Error).message);
    if (recurringNext) {
      // A transient failure must not kill a recurring task — keep it
      // active and try again at the next scheduled slot.
      status = 'active';
      nextRunAt = opts.reschedule ? recurringNext : undefined;
    } else {
      status = 'failed';
      nextRunAt = null;
    }
  }
  const [updated] = await db.update(scheduledTasks)
    .set({
      status,
      lastRunAt: new Date(),
      runCount: (task.runCount || 0) + 1,
      updatedAt: new Date(),
      ...(nextRunAt !== undefined ? { nextRunAt } : {}),
    })
    .where(eq(scheduledTasks.id, task.id))
    .returning();
  return updated;
}

let pollTimer: NodeJS.Timeout | null = null;
let polling = false;

async function pollOnce(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const db = getDb();
    const due = await db.select().from(scheduledTasks)
      .where(and(
        inArray(scheduledTasks.status, ['pending', 'active']),
        isNotNull(scheduledTasks.nextRunAt),
        lte(scheduledTasks.nextRunAt, new Date()),
      ))
      .orderBy(scheduledTasks.nextRunAt)
      .limit(MAX_TASKS_PER_POLL);

    for (const task of due) {
      // Claim: advance nextRunAt before executing, guarded on the value
      // we read, so an overlapping poll / manual run skips this task.
      const claimNext = computeNextRunAt(task.frequency, new Date());
      const [claimed] = await db.update(scheduledTasks)
        .set({ nextRunAt: claimNext, updatedAt: new Date() })
        .where(and(
          eq(scheduledTasks.id, task.id),
          eq(scheduledTasks.nextRunAt, task.nextRunAt!),
          inArray(scheduledTasks.status, ['pending', 'active']),
        ))
        .returning();
      if (!claimed) continue;
      await runScheduledTaskNow(claimed, { reschedule: false });
    }
  } catch (err) {
    console.error('[scheduler] poll failed:', (err as Error).message);
  } finally {
    polling = false;
  }
}

/** Start the poll loop. Idempotent. */
export function startScheduler(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => { void pollOnce(); }, POLL_INTERVAL_MS);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();
  // Catch up on tasks that came due while the server was down.
  void pollOnce();
  console.log(`[scheduler] Started (poll every ${Math.round(POLL_INTERVAL_MS / 1000)}s)`);
}

/** Stop the poll loop. Idempotent. */
export function stopScheduler(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
