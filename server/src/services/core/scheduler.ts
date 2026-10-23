/* ──────────────────────────────────────────────
   Scheduler daemon — executes scheduled_tasks rows.

   Referenced by the scheduled_tasks schema comment: polls for
   overdue tasks (status pending/active with nextRunAt <= now),
   runs each task's prompt through the user's active LLM provider,
   persists the result as a session + messages (so it shows up in
   Recents), and reschedules according to `frequency`.

   Database leases serialize manual and scheduled runs across processes.
   nextRunAt advances only when results and completion commit together.
   ────────────────────────────────────────────── */
import { and, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { Conflict, NotFound } from '../../lib/errors.js';
import { claimScheduledTask, renewScheduledTaskLease, withScheduledTaskLease, type ScheduledLease } from './scheduledTaskLease.js';
import { scheduledTasks, scheduledTaskLeases, sessions, messages, users } from '../../db/schema/index.js';
import { getActiveApiKey } from './apiKey.js';
import { callChatCompletion } from './llm.js';
import {
  WORKSPACE_AGENT_BACKGROUND_ENABLED,
  createAgentRun,
  ensureSessionWorkspaceForSession,
  runAgentTurn,
} from '../tools/agentRuntime.js';
import {
  SERVER_SYSTEM_POLICY,
  appendFinalOutputConstraints,
  injectUserContext,
} from '../../lib/chatPolicy.js';

const POLL_INTERVAL_MS = parseInt(process.env.SCHEDULER_POLL_MS || '60000', 10);
const MAX_TASKS_PER_POLL = 10;

type ScheduledTaskRow = typeof scheduledTasks.$inferSelect;

/* P_scheduler-mode-marker — the scheduler runs without /api/chat, so we
 * can't use prependTeacherModePrompt(). Instead we splice the mode
 * prompt into the canonical first system message with a stable marker
 * so it lands below SERVER_SYSTEM_POLICY but above any client text,
 * matching the documented priority chain. */
const SCHEDULED_MODE_MARKER = '[Server policy: scheduled-mode]';
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
 * Execute provider work outside transactions. Result persistence and
 * scheduling bookkeeping happen together in the fenced completion below.
 */
interface ExecutionOutcome { runId?: string; awaitingApproval?: boolean; content?: string; promptText?: string; model?: string | null; sessionId?: string | null }

async function executeTask(task: ScheduledTaskRow, lease: ScheduledLease, signal: AbortSignal): Promise<ExecutionOutcome> {
  const db = getDb();
  const [owner] = await db.select().from(users).where(eq(users.id, task.userId)).limit(1);
  if (!owner) throw new NotFound('Task owner no longer exists');
  let agentRunId: string | undefined;
  let content = '';
  let sessionId = task.sessionId;

  /* The workspace agent needs its session before thread/start so the first turn gets the
   * same isolated directory as retries and later scheduled runs. Native
   * tasks can continue creating their result session after completion. */
  if (task.agentKind === 'codex') {
    if (!WORKSPACE_AGENT_BACKGROUND_ENABLED) throw new Error('Workspace agent background runs are disabled');
    if (sessionId) {
      const [existing] = await db.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, task.userId)))
        .limit(1);
      if (!existing) sessionId = null;
    }
    if (!sessionId) {
      sessionId = await withScheduledTaskLease(lease, async (tx) => {
        const [session] = await tx.insert(sessions).values({
          userId: task.userId, title: `⏰ ${task.title}`, topic: task.title,
          mode: 'chat', phase: 'chat', kind: 'chat', projectId: task.projectId,
        }).returning({ id: sessions.id });
        await tx.update(scheduledTasks).set({ sessionId: session.id }).where(eq(scheduledTasks.id, task.id));
        return session.id;
      });
    }
    await ensureSessionWorkspaceForSession(task.userId, sessionId, task.projectId || null);
  }

  if (task.agentKind === 'codex') {
    /* A workspace execution is never automatically replayed after lease
     * loss. Its run history is retained for review of possible side effects. */
    const created = await createAgentRun({
      userId: task.userId,
      task: (task.prompt || '').trim() || task.title,
      sessionId,
      projectId: task.projectId,
      kind: 'scheduled',
      source: 'scheduled',
    });
    agentRunId = created.run.id;
    await withScheduledTaskLease(lease, async (tx) => {
      await tx.update(scheduledTasks).set({ lastRunId: agentRunId }).where(eq(scheduledTasks.id, task.id));
    });
    const rawPolicy = task.runPolicy && typeof task.runPolicy === 'object' && !Array.isArray(task.runPolicy)
      ? task.runPolicy as Record<string, unknown>
      : {};
    const policyDuration = Number(rawPolicy.maxDurationMs);
    const controller = new AbortController();
    const policyTimer = Number.isFinite(policyDuration) && policyDuration >= 60_000
      ? setTimeout(() => controller.abort('scheduled_policy_timeout'), Math.min(policyDuration, 900_000))
      : null;
    policyTimer?.unref?.();
    let result;
    try {
      result = await runAgentTurn(agentRunId, task.userId, undefined, AbortSignal.any([signal, controller.signal]));
    } finally {
      if (policyTimer) clearTimeout(policyTimer);
    }
    if (result.status === 'awaiting_approval') {
      return { runId: agentRunId, awaitingApproval: true, sessionId };
    }
    if (result.status !== 'completed') throw new Error(result.error || `Agent run ${result.status}`);
    content = (result.output || result.summary || '').trim();
    if (!content) throw new Error('The agent returned an empty response');
  }
  const provider = await getActiveApiKey(task.userId);
  if (task.agentKind !== 'codex' && (!provider || !provider.keyPlaintext)) {
    throw new Error('No active LLM provider for user');
  }

  const promptText = (task.prompt || '').trim() || task.title;
  /* P_scheduler-safety — assemble a system prompt that mirrors the
   * /api/chat order: SERVER_SYSTEM_POLICY first, then the scheduler
   * mode prompt with its stable marker, then the user-context block
   * (date / display name / image-description rule), and finally the
   * FINAL_OUTPUT_CONSTRAINTS no-dash/no-emoji block closes the prompt.
   * Earlier revisions skipped every one of those, so a scheduled
   * task whose title or prompt was authored as a system override
   * would silently land as the only instruction. The local variable
   * is named `chatMessages` to avoid shadowing the `messages`
   * drizzle table imported above (which db.insert expects). */
  let chatMessages: Parameters<typeof injectUserContext>[0] = [
    {
      role: 'system',
      content: `${SERVER_SYSTEM_POLICY}\n\n${SCHEDULED_MODE_MARKER}\n${SCHEDULED_SYSTEM_PROMPT}`,
    },
    { role: 'user', content: promptText },
  ];
  chatMessages = injectUserContext(chatMessages, owner);
  chatMessages = appendFinalOutputConstraints(chatMessages);

  if (task.agentKind !== 'codex') {
    const result = await callChatCompletion({
      apiBase: (provider!.url || '').replace(/\/+$/, ''),
      apiKey: provider!.keyPlaintext!,
      model: provider!.model,
      userId: task.userId,
      messages: chatMessages,
      maxTokens: 8000,
      temperature: 0.5,
      signal,
    });

    content = (result.content || '').trim();
    if (!content) throw new Error('LLM returned an empty response');
  }

  return { runId: agentRunId, content, promptText, model: provider?.model || null, sessionId };
}

const activeControllers = new Set<AbortController>();

/** Claim before provider work. A native retry retains its execution ID;
 * result messages, runCount, nextRunAt and lease completion commit together. */
export async function runScheduledTaskNow(
  input: ScheduledTaskRow,
  opts: { reschedule?: boolean; automatic?: boolean } = {},
): Promise<ScheduledTaskRow> {
  const claimed = await claimScheduledTask(input.id, input.userId, opts.automatic);
  if (!claimed) {
    if (opts.automatic) return input;
    throw new Conflict('Scheduled task is already running');
  }
  const { task, lease } = claimed;
  const controller = new AbortController();
  activeControllers.add(controller);
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void renewScheduledTaskLease(lease).then((owned) => {
      if (!owned) controller.abort('scheduled_lease_lost');
    }).catch(() => controller.abort('scheduled_lease_lost')).finally(() => { renewing = false; });
  }, 20_000);
  heartbeat.unref();
  const deadline = setTimeout(() => controller.abort('scheduled_execution_timeout'), 900_000);
  deadline.unref();
  try {
    let outcome: ExecutionOutcome = {};
    let failure: string | null = null;
    try {
      outcome = await executeTask(task, lease, controller.signal);
    } catch (err) {
      failure = (err as Error).message;
      console.error(`[scheduler] task ${task.id} failed:`, failure);
    }
    if (controller.signal.aborted && ['scheduled_lease_lost', 'scheduler_shutdown'].includes(controller.signal.reason)) {
      throw new Conflict('Scheduled execution stopped without owning a valid lease');
    }
    return await withScheduledTaskLease(lease, async (tx, current) => {
      const now = new Date();
      let sessionId = outcome.sessionId || current.sessionId;
      if (!failure && !outcome.awaitingApproval) {
        if (sessionId) {
          const [existing] = await tx.select({ id: sessions.id }).from(sessions)
            .where(and(eq(sessions.id, sessionId), eq(sessions.userId, task.userId))).limit(1);
          if (!existing) sessionId = null;
        }
        if (!sessionId) {
          const [session] = await tx.insert(sessions).values({
            userId: task.userId, title: `⏰ ${task.title}`, topic: task.title,
            mode: 'chat', phase: 'chat', kind: 'chat', projectId: current.projectId,
          }).returning({ id: sessions.id });
          sessionId = session.id;
        }
        await tx.insert(messages).values([
          { sessionId, role: 'user', content: outcome.promptText!, rawText: outcome.promptText!, clientId: `sched-${lease.executionId}-user` },
          { sessionId, role: 'assistant', content: outcome.content!, rawText: outcome.content!, type: 'assistant', model: outcome.model, agentRunId: outcome.runId || null, clientId: `sched-${lease.executionId}-assistant` },
        ]).onConflictDoNothing({ target: [messages.sessionId, messages.clientId] });
        await tx.update(sessions).set({ preview: outcome.content!.slice(0, 200), updatedAt: now }).where(eq(sessions.id, sessionId));
      }
      const patch: Partial<Omit<typeof scheduledTasks.$inferInsert, 'runCount'>> & { runCount: ReturnType<typeof sql> } = {
        lastRunAt: now, runCount: sql`${scheduledTasks.runCount} + 1`, updatedAt: now,
      };
      if (sessionId) patch.sessionId = sessionId;
      if (outcome.runId) patch.lastRunId = outcome.runId;
      if (outcome.awaitingApproval) {
        patch.status = 'paused'; patch.nextRunAt = null;
      } else if (current.status === task.status && current.nextRunAt?.getTime() === task.nextRunAt?.getTime()) {
        // Preserve a user's pause/reschedule made while the provider was busy.
        const recurringNext = computeNextRunAt(current.frequency, now);
        patch.status = current.status === 'paused' ? 'paused' : recurringNext ? 'active' : failure ? 'failed' : 'completed';
        if (!recurringNext) patch.nextRunAt = null;
        else if (lease.kind === 'scheduled' || opts.reschedule) patch.nextRunAt = recurringNext;
      }
      const [updated] = await tx.update(scheduledTasks).set(patch).where(eq(scheduledTasks.id, task.id)).returning();
      await tx.update(scheduledTaskLeases).set({ state: failure ? 'failed' : 'completed', error: failure, updatedAt: now })
        .where(and(eq(scheduledTaskLeases.taskId, task.id), eq(scheduledTaskLeases.ownerToken, lease.ownerToken)));
      return updated;
    });
  } catch (error) {
    /* The provider may already have completed. A failed result transaction
     * must not become an unbounded sequence of paid model replays on lease
     * expiry. Fence the quarantine by the same owner token; never overwrite
     * a replacement worker's state or resume a user-paused task.
     *
     * A controlled stop is NOT a result-persistence failure. `scheduler_shutdown`
     * and `scheduled_lease_lost` abort the run deliberately; quarantining them
     * would permanently disable the user's recurring task, because
     * claimScheduledTask only re-claims 'active'/'pending' tasks — a task left
     * 'paused' with nextRunAt=null is never picked up again. Every deploy that
     * landed during an in-flight run would silently kill that schedule. Leave
     * the task runnable so the next poll re-claims it once the lease expires. */
    if (controller.signal.aborted) {
      console.warn(
        `[scheduler] task ${task.id} stopped without a result (${String(controller.signal.reason)}); leaving the schedule runnable`,
      );
    } else {
      await withScheduledTaskLease(lease, async (tx, current) => {
        await tx.update(scheduledTasks).set({ status: 'paused', nextRunAt: null, updatedAt: new Date() }).where(eq(scheduledTasks.id, current.id));
        await tx.update(scheduledTaskLeases).set({ state: 'failed', error: 'Result persistence failed; review before manually retrying.', updatedAt: new Date() })
          .where(and(eq(scheduledTaskLeases.taskId, current.id), eq(scheduledTaskLeases.ownerToken, lease.ownerToken)));
      }).catch((quarantineError) => console.warn('[scheduler] unable to fence failed completion:', (quarantineError as Error).message));
    }
    throw error;
  } finally {
    clearInterval(heartbeat); clearTimeout(deadline); activeControllers.delete(controller);
  }
}

let pollTimer: NodeJS.Timeout | null = null;
let polling = false;
let stopping = false;

export async function pollScheduledTasksOnce(): Promise<void> {
  if (polling || stopping) return;
  polling = true;
  try {
    const db = getDb();
    const rows = await db.select({ task: scheduledTasks }).from(scheduledTasks)
      .leftJoin(scheduledTaskLeases, eq(scheduledTaskLeases.taskId, scheduledTasks.id))
      .where(and(
        inArray(scheduledTasks.status, ['pending', 'active']),
        or(
          and(isNotNull(scheduledTasks.nextRunAt), lte(scheduledTasks.nextRunAt, sql`clock_timestamp()`)),
          and(eq(scheduledTaskLeases.state, 'running'), lte(scheduledTaskLeases.expiresAt, sql`clock_timestamp()`)),
        ),
        or(isNull(scheduledTaskLeases.taskId), ne(scheduledTaskLeases.state, 'running'), lte(scheduledTaskLeases.expiresAt, sql`clock_timestamp()`)),
      ))
      .orderBy(scheduledTasks.nextRunAt).limit(MAX_TASKS_PER_POLL);
    for (const { task } of rows) {
      if (stopping) break;
      try { await runScheduledTaskNow(task, { automatic: true }); }
      catch (err) { console.warn(`[scheduler] task ${task.id} claim/execution skipped:`, (err as Error).message); }
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
  if (process.env.SCHEDULER_ENABLED === '0' || process.env.SCHEDULER_ENABLED === 'false') return;
  stopping = false;
  pollTimer = setInterval(() => { void pollScheduledTasksOnce(); }, POLL_INTERVAL_MS);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();
  // Catch up on tasks that came due while the server was down.
  void pollScheduledTasksOnce();
  console.log(`[scheduler] Started (poll every ${Math.round(POLL_INTERVAL_MS / 1000)}s)`);
}

/** Stop the poll loop. Idempotent. */
export function stopScheduler(): void {
  stopping = true;
  abortActiveScheduledRuns('scheduler_shutdown');
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Abort every in-flight scheduled run with the given reason. A deliberate
 *  stop is not a result-persistence failure: the run keeps the lease, so the
 *  task must stay runnable for the next poll instead of being quarantined. */
export function abortActiveScheduledRuns(reason: string): void {
  for (const controller of activeControllers) controller.abort(reason);
}
