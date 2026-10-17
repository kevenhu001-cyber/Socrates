import { randomUUID } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { getDb, type Database } from '../../db/index.js';
import { scheduledTaskLeases, scheduledTasks } from '../../db/schema/index.js';
import { Conflict, NotFound } from '../../lib/errors.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type ScheduledLease = typeof scheduledTaskLeases.$inferSelect;
export const SCHEDULED_LEASE_MS = 90_000;

/** Lock ordering is always task -> lease. No provider calls under a lock. */
export async function claimScheduledTask(taskId: string, userId: string, automatic = false): Promise<{ task: ScheduledTask; lease: ScheduledLease } | null> {
  const result = await getDb().transaction(async (tx) => {
    const [task] = await tx.select().from(scheduledTasks)
      .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId))).for('update');
    if (!task) throw new NotFound('Scheduled task not found');
    if (automatic && !['active', 'pending'].includes(task.status)) return null;
    const clock = await tx.execute<{ time: string }>(sql`select clock_timestamp()::text as time`);
    const now = new Date(clock.rows[0].time);
    const [previous] = await tx.select().from(scheduledTaskLeases).where(eq(scheduledTaskLeases.taskId, taskId));
    const expired = previous?.state === 'running' && previous.expiresAt <= now;
    if (previous?.state === 'running' && !expired) return null;
    if (expired && (previous.agentKind === 'codex' || previous.agentKind !== task.agentKind)) {
      // A lost agent may already have changed external systems. Never replay
      // those effects on the strength of an expired database heartbeat alone.
      await tx.update(scheduledTaskLeases).set({ state: 'uncertain', error: 'Agent lease expired; external effects may have completed. Review before manually retrying.', updatedAt: now })
        .where(eq(scheduledTaskLeases.taskId, taskId));
      await tx.update(scheduledTasks).set({ status: 'paused', updatedAt: now }).where(eq(scheduledTasks.id, taskId));
      return { uncertain: true as const };
    }
    if (automatic && !expired && (!task.nextRunAt || task.nextRunAt > now)) return null;
    const values = {
      taskId, executionId: expired ? previous.executionId : randomUUID(),
      ownerToken: randomUUID(), state: 'running',
      agentKind: task.agentKind,
      kind: expired ? previous.kind : automatic ? 'scheduled' : 'manual',
      scheduledFor: expired ? previous.scheduledFor : task.nextRunAt,
      expiresAt: new Date(now.getTime() + SCHEDULED_LEASE_MS),
      attempts: expired ? previous.attempts + 1 : 1, error: null, updatedAt: now,
    };
    const [lease] = await tx.insert(scheduledTaskLeases).values(values)
      .onConflictDoUpdate({ target: scheduledTaskLeases.taskId, set: values }).returning();
    return { task, lease };
  });
  if (result && 'uncertain' in result) throw new Conflict('Agent execution outcome is uncertain; task paused for review');
  return result;
}

export async function renewScheduledTaskLease(lease: ScheduledLease): Promise<boolean> {
  const rows = await getDb().update(scheduledTaskLeases)
    .set({ expiresAt: sql`clock_timestamp() + ${SCHEDULED_LEASE_MS} * interval '1 millisecond'`, updatedAt: sql`clock_timestamp()` })
    .where(and(eq(scheduledTaskLeases.taskId, lease.taskId), eq(scheduledTaskLeases.ownerToken, lease.ownerToken),
      eq(scheduledTaskLeases.state, 'running'), gt(scheduledTaskLeases.expiresAt, sql`clock_timestamp()`)))
    .returning({ id: scheduledTaskLeases.taskId });
  return rows.length === 1;
}

/** All task/result writes are fenced by the current owner, including writes
 * after an upstream call ignored cancellation. The callback must do DB work only. */
export async function withScheduledTaskLease<T>(lease: ScheduledLease, work: (tx: Transaction, task: ScheduledTask) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    const [task] = await tx.select().from(scheduledTasks).where(eq(scheduledTasks.id, lease.taskId)).for('update');
    if (!task) throw new NotFound('Scheduled task not found');
    const [owned] = await tx.select().from(scheduledTaskLeases)
      .where(and(eq(scheduledTaskLeases.taskId, lease.taskId), eq(scheduledTaskLeases.ownerToken, lease.ownerToken),
        eq(scheduledTaskLeases.state, 'running'), gt(scheduledTaskLeases.expiresAt, sql`clock_timestamp()`))).for('update');
    if (!owned) throw new Conflict('Scheduled execution lease was lost');
    return work(tx, task);
  });
}
