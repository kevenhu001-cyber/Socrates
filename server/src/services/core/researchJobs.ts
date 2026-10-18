import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, sql, asc, desc } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, type Database } from '../../db/index.js';
import { researchJobs, researchJobEvents, sessions, projects, artifacts, messages, type ResearchSteps } from '../../db/schema/index.js';
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js';
import { researchReportToLatex } from './researchArtifact.js';

export const ResearchRequest = z.object({
  query: z.string().trim().min(1).max(1200),
  sessionId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();
export const ResearchRefinementRequest = z.object({
  instruction: z.string().trim().min(1).max(600),
}).strict();
export const ResearchId = z.string().uuid();
export const ResearchCursor = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export type ResearchJob = typeof researchJobs.$inferSelect;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export const RESEARCH_LEASE_MS = 90_000;
export const RESEARCH_MAX_ATTEMPTS = 3;

export function publicResearchJob(job: ResearchJob) {
  const { leaseToken: _token, leaseExpiresAt: _expires, idempotencyKey: _key, userId: _owner, steps, ...rest } = job;
  return { ...rest, focus: steps.focus || null, plan: steps.plan || [], searched: steps.searches?.length || 0, sourceCount: steps.sources?.length || 0 };
}

// Caller holds the job row lock. Event and snapshot commit together so a
// reconnect never observes an event pointing at an uncommitted result.
async function event(tx: Transaction, job: ResearchJob, stage: string, status: string) {
  const sequence = job.eventSequence + 1;
  await tx.insert(researchJobEvents).values({ jobId: job.id, sequence, stage, status });
  await tx.update(researchJobs).set({ eventSequence: sequence, updatedAt: sql`clock_timestamp()` }).where(eq(researchJobs.id, job.id));
}

export async function createResearchJob(userId: string, input: unknown) {
  const parsed = ResearchRequest.safeParse(input);
  if (!parsed.success) throw new BadRequest('Invalid research request', parsed.error.flatten());
  const body = parsed.data;
  return getDb().transaction(async (tx) => {
    // Serialize submissions per user: ownership checks, quota and idempotency
    // remain correct when two tabs submit concurrently.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 17))`);
    const [existing] = await tx.select().from(researchJobs).where(and(eq(researchJobs.userId, userId), eq(researchJobs.idempotencyKey, body.idempotencyKey)));
    if (existing) {
      if (existing.query !== body.query || existing.sessionId !== body.sessionId || existing.projectId !== body.projectId) throw new Conflict('Idempotency key already used for another request');
      return existing;
    }
    if (body.sessionId) {
      const [session] = await tx.select().from(sessions).where(and(eq(sessions.id, body.sessionId), eq(sessions.userId, userId)));
      if (!session || session.projectId !== body.projectId) throw new NotFound('Research session or project not found');
    }
    if (body.projectId) {
      const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, body.projectId), eq(projects.userId, userId)));
      if (!project) throw new NotFound('Research project not found');
    }
    const active = await tx.select({ id: researchJobs.id }).from(researchJobs).where(and(eq(researchJobs.userId, userId), inArray(researchJobs.status, ['queued', 'running']))).limit(3);
    if (active.length >= 3) throw new Conflict('At most three research jobs may be active');
    const [job] = await tx.insert(researchJobs).values({ userId, ...body }).returning();
    await event(tx, job, 'queued', 'queued');
    return { ...job, eventSequence: 1 };
  });
}

export async function getResearchJob(userId: string, id: string) {
  const [job] = await getDb().select().from(researchJobs).where(and(eq(researchJobs.id, id), eq(researchJobs.userId, userId)));
  if (!job) throw new NotFound('Research job not found');
  return job;
}

export async function listResearchJobs(userId: string, sessionId?: string) {
  return getDb().select().from(researchJobs).where(and(eq(researchJobs.userId, userId), sessionId ? eq(researchJobs.sessionId, sessionId) : undefined)).orderBy(desc(researchJobs.createdAt)).limit(50);
}

export async function getResearchResult(userId: string, id: string) {
  const job = await getResearchJob(userId, id);
  if (!job.sessionId || job.status !== 'succeeded') return null;
  const [message] = await getDb().select().from(messages).where(and(eq(messages.sessionId, job.sessionId), eq(messages.clientId, `research-${job.id}`)));
  // A deliberately deleted answer stays deleted; the artifact is still
  // available through the artifact library. Never recreate it on reconnect.
  return message || null;
}

export async function listResearchEvents(userId: string, id: string, after: number) {
  await getResearchJob(userId, id);
  return getDb().select().from(researchJobEvents).where(and(eq(researchJobEvents.jobId, id), gt(researchJobEvents.sequence, after))).orderBy(asc(researchJobEvents.sequence)).limit(100);
}

export async function controlResearchJob(userId: string, id: string, action: 'cancel' | 'retry') {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 17))`);
    const [job] = await tx.select().from(researchJobs).where(and(eq(researchJobs.id, id), eq(researchJobs.userId, userId))).for('update');
    if (!job) throw new NotFound('Research job not found');
    if (action === 'cancel' && ['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    if (action === 'retry' && !['failed', 'cancelled'].includes(job.status)) throw new Conflict('Only failed or cancelled research can be retried');
    if (action === 'retry') {
      const active = await tx.select({ id: researchJobs.id }).from(researchJobs).where(and(eq(researchJobs.userId, userId), inArray(researchJobs.status, ['queued', 'running']))).limit(3);
      if (active.length >= 3) throw new Conflict('At most three research jobs may be active');
    }
    const status = action === 'cancel' ? 'cancelled' : 'queued';
    const [updated] = await tx.update(researchJobs).set({ status, leaseToken: null, leaseExpiresAt: null, error: null,
      ...(action === 'retry' && job.error === 'research_no_sources' ? { steps: { plan: job.steps.plan } } : {}),
      attempts: action === 'retry' ? 0 : job.attempts, completedAt: action === 'cancel' ? new Date() : null }).where(eq(researchJobs.id, id)).returning();
    await event(tx, job, status, status);
    return { ...updated, eventSequence: job.eventSequence + 1 };
  });
}

/**
 * Refine an active task without mutating its worker-owned checkpoint. The
 * current job is fenced and kept as a cancelled history item; the replacement
 * starts from a clean plan with the user's new focus in its durable steps.
 */
export async function refineResearchJob(userId: string, id: string, input: unknown) {
  const parsed = ResearchRefinementRequest.safeParse(input);
  if (!parsed.success) throw new BadRequest('Invalid research refinement', parsed.error.flatten());
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 17))`);
    const [job] = await tx.select().from(researchJobs).where(and(eq(researchJobs.id, id), eq(researchJobs.userId, userId))).for('update');
    if (!job) throw new NotFound('Research job not found');
    if (!['queued', 'running'].includes(job.status)) throw new Conflict('Only active research can be refined');
    const active = await tx.select({ id: researchJobs.id }).from(researchJobs).where(and(
      eq(researchJobs.userId, userId),
      inArray(researchJobs.status, ['queued', 'running']),
      sql`${researchJobs.id} <> ${id}`,
    )).limit(3);
    if (active.length >= 3) throw new Conflict('At most three research jobs may be active');

    const [cancelled] = await tx.update(researchJobs).set({
      status: 'cancelled', leaseToken: null, leaseExpiresAt: null, error: null,
      completedAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()`,
    }).where(eq(researchJobs.id, id)).returning();
    await event(tx, job, 'cancelled', 'cancelled');

    const [replacement] = await tx.insert(researchJobs).values({
      userId: job.userId,
      sessionId: job.sessionId,
      projectId: job.projectId,
      query: job.query,
      idempotencyKey: `refine-${job.id}-${randomUUID()}`,
      steps: { focus: parsed.data.instruction },
    }).returning();
    await event(tx, replacement, 'queued', 'queued');
    return {
      previous: { ...cancelled, eventSequence: job.eventSequence + 1 },
      job: { ...replacement, eventSequence: 1 },
    };
  });
}

export async function claimResearchJob(): Promise<ResearchJob | null> {
  return getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(researchJobs).where(sql`${researchJobs.status} = 'queued' or (${researchJobs.status} = 'running' and ${researchJobs.leaseExpiresAt} <= clock_timestamp())`)
      .orderBy(asc(researchJobs.createdAt)).limit(1).for('update', { skipLocked: true });
    if (!job) return null;
    if (job.attempts >= RESEARCH_MAX_ATTEMPTS) {
      await tx.update(researchJobs).set({ status: 'failed', error: 'research_recovery_exhausted', completedAt: sql`clock_timestamp()`, leaseToken: null, leaseExpiresAt: null }).where(eq(researchJobs.id, job.id));
      await event(tx, job, 'failed', 'failed');
      return null;
    }
    const [claimed] = await tx.update(researchJobs).set({ status: 'running', leaseToken: randomUUID(),
      leaseExpiresAt: sql`clock_timestamp() + ${RESEARCH_LEASE_MS} * interval '1 millisecond'`, attempts: job.attempts + 1 }).where(eq(researchJobs.id, job.id)).returning();
    await event(tx, job, job.attempts ? 'recovering' : 'planning', 'running');
    return { ...claimed, eventSequence: job.eventSequence + 1 };
  });
}

function owned(job: ResearchJob) {
  return and(eq(researchJobs.id, job.id), eq(researchJobs.leaseToken, job.leaseToken!), eq(researchJobs.status, 'running'), gt(researchJobs.leaseExpiresAt, sql`clock_timestamp()`));
}

export async function renewResearchLease(job: ResearchJob) {
  const rows = await getDb().update(researchJobs).set({ leaseExpiresAt: sql`clock_timestamp() + ${RESEARCH_LEASE_MS} * interval '1 millisecond'` }).where(owned(job)).returning({ id: researchJobs.id });
  return rows.length === 1;
}

export async function saveResearchCheckpoint(lease: ResearchJob, steps: ResearchSteps, stage: string, terminal?: { report: string } | { error: string }) {
  return getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(researchJobs).where(owned(lease)).for('update');
    if (!job) throw new Conflict('Research lease was lost');
    let resultArtifactId = job.resultArtifactId;
    if (terminal && 'report' in terminal) {
      let messageId: string | null = null;
      if (job.sessionId) {
        const [message] = await tx.insert(messages).values({ id: job.id, sessionId: job.sessionId,
          clientId: `research-${job.id}`, role: 'assistant', type: 'assistant', content: terminal.report, rawText: terminal.report,
        }).onConflictDoNothing({ target: [messages.sessionId, messages.clientId] }).returning({ id: messages.id });
        messageId = message?.id || null;
        await tx.update(sessions).set({ updatedAt: sql`clock_timestamp()`, preview: terminal.report.slice(0, 200) }).where(eq(sessions.id, job.sessionId));
      }
      const [artifact] = await tx.insert(artifacts).values({ userId: job.userId, sessionId: job.sessionId, projectId: job.projectId,
        messageId, type: 'markdown', language: 'markdown', title: job.query, source: terminal.report }).returning({ id: artifacts.id });
      resultArtifactId = artifact.id;
      await tx.insert(artifacts).values({ userId: job.userId, sessionId: job.sessionId, projectId: job.projectId, messageId,
        type: 'latex', language: 'latex', title: `${job.query} (.tex)`, source: researchReportToLatex(job.query, terminal.report, steps.sources || []),
      });
    }
    const status = terminal ? ('error' in terminal ? 'failed' : 'succeeded') : 'running';
    await tx.update(researchJobs).set({ steps, status, resultArtifactId, error: terminal && 'error' in terminal ? terminal.error : null,
      ...(terminal ? { completedAt: sql`clock_timestamp()`, leaseToken: null, leaseExpiresAt: null } : {}) }).where(eq(researchJobs.id, job.id));
    await event(tx, job, stage, status);
  });
}
