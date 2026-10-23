/**
 * Chat Turns — durable async chat execution (M1).
 *
 * One row per user turn. POST creates the row idempotently on
 * (userId, clientTurnId); the LLM worker (M2) appends sequenced events
 * and the client (re)subscribes with ?after=. Mirrors the
 * agent_runs/agent_run_events contract without sharing its Codex
 * workspace semantics.
 */

import { and, asc, desc, eq, gt, inArray, lt, max, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { chatTurnEvents, chatTurns, sessions } from '../../db/schema/index.js';
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js';
import { isUuid } from '../../lib/validate.js';

export const CHAT_TURN_STATUSES = [
  'queued',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'interrupted',
] as const;

export type ChatTurnStatus = (typeof CHAT_TURN_STATUSES)[number];

export interface ChatTurnEvent {
  turnId: string;
  sequence: number;
  event: string;
  data: Record<string, unknown>;
}

type RuntimeSubscriber = (event: ChatTurnEvent) => void;

const subscribers = new Map<string, Set<RuntimeSubscriber>>();
const sequenceQueues = new Map<string, Promise<void>>();
const MAX_EVENT_PAYLOAD_CHARS = 120_000;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function boundPayload(payload: Record<string, unknown>): Record<string, unknown> {
  try {
    const text = JSON.stringify(payload);
    if (text.length <= MAX_EVENT_PAYLOAD_CHARS) return payload;
    return { truncated: true, preview: text.slice(0, MAX_EVENT_PAYLOAD_CHARS) };
  } catch {
    return { unserializable: true };
  }
}

function publishToSubscribers(event: ChatTurnEvent) {
  const set = subscribers.get(event.turnId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(event);
    } catch (err) {
      console.warn('[chat-turns] subscriber failed:', (err as Error).message);
    }
  }
}

export function subscribeToChatTurn(turnId: string, listener: RuntimeSubscriber): () => void {
  let set = subscribers.get(turnId);
  if (!set) {
    set = new Set();
    subscribers.set(turnId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) subscribers.delete(turnId);
  };
}

/** Persist an event in sequence and notify live SSE subscribers. */
export function publishChatTurnEvent(
  turnId: string,
  event: string,
  data: Record<string, unknown> = {},
): Promise<ChatTurnEvent> {
  // Preserve invocation order within one worker, while the parent-row lock
  // below provides allocation safety across independent processes.
  const previous = sequenceQueues.get(turnId) || Promise.resolve();
  const next = previous.then(() => persistChatTurnEvent(turnId, event, data));
  const settled = next.then(() => undefined, () => undefined).finally(() => {
    if (sequenceQueues.get(turnId) === settled) sequenceQueues.delete(turnId);
  });
  sequenceQueues.set(turnId, settled);
  return next;
}

async function persistChatTurnEvent(turnId: string, event: string, data: Record<string, unknown>): Promise<ChatTurnEvent> {
  const runtimeEvent = await getDb().transaction(async (tx) => {
    // The parent row is the cross-process serialization point. Hold the
    // lock only for sequence allocation + insert, never during LLM work.
    const [turn] = await tx.select({ id: chatTurns.id }).from(chatTurns)
      .where(eq(chatTurns.id, turnId)).for('update');
    if (!turn) throw new NotFound('Chat turn not found');
    const [last] = await tx
      .select({ sequence: max(chatTurnEvents.sequence) })
      .from(chatTurnEvents)
      .where(eq(chatTurnEvents.turnId, turnId));
    const sequence = Number(last?.sequence || 0) + 1;
    const payload = boundPayload(asRecord(data));
    await tx.insert(chatTurnEvents).values({ turnId, sequence, event, payload });
    const runtimeEvent: ChatTurnEvent = { turnId, sequence, event, data: payload };
    return runtimeEvent;
  });
  publishToSubscribers(runtimeEvent);
  return runtimeEvent;
}

export interface CreateChatTurnInput {
  userId: string;
  clientTurnId: string;
  sessionId?: string | null;
  model?: string | null;
  inputSnapshot?: unknown;
}

async function resolveSession(userId: string, sessionId: string | null | undefined) {
  if (sessionId == null) return null;
  if (!isUuid(sessionId)) throw new BadRequest('Invalid sessionId');
  const db = getDb();
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  if (!row) throw new NotFound('Session not found');
  return row;
}

/**
 * Create a turn idempotently: retrying POST with the same clientTurnId
 * returns the original row instead of opening a second LLM call.
 */
export async function createChatTurn(input: CreateChatTurnInput) {
  const clientTurnId = String(input.clientTurnId || '').trim();
  if (!clientTurnId) throw new BadRequest('clientTurnId is required');
  if (clientTurnId.length > 200) throw new BadRequest('clientTurnId is too long');
  const session = await resolveSession(input.userId, input.sessionId ?? null);
  const db = getDb();
  const model = typeof input.model === 'string' ? input.model.slice(0, 200) : null;
  const result = await db.transaction(async (tx) => {
    const [turn] = await tx
      .insert(chatTurns)
      .values({
        userId: input.userId,
        sessionId: session?.id || null,
        clientTurnId,
        status: 'queued',
        model,
        inputSnapshot: (input.inputSnapshot ?? null) as never,
      })
      .onConflictDoNothing({ target: [chatTurns.userId, chatTurns.clientTurnId] })
      .returning();
    if (!turn) {
      const [existing] = await tx.select().from(chatTurns)
        .where(and(eq(chatTurns.userId, input.userId), eq(chatTurns.clientTurnId, clientTurnId))).limit(1);
      if (!existing) throw new Error('Unable to resolve chat turn conflict');
      if (existing.sessionId !== (session?.id || null)) throw new Conflict('clientTurnId is already bound to another session');
      return { turn: existing, created: false };
    }
    await tx.insert(chatTurnEvents).values({
      turnId: turn.id, sequence: 1, event: 'turn_created',
      payload: { sessionId: turn.sessionId, clientTurnId, model },
    });
    return { turn, created: true };
  });
  if (result.created) publishToSubscribers({
    turnId: result.turn.id, sequence: 1, event: 'turn_created',
    data: { sessionId: result.turn.sessionId, clientTurnId, model },
  });
  return result;
}

async function loadTurn(turnId: string, userId: string) {
  if (!isUuid(turnId)) throw new NotFound('Chat turn not found');
  const db = getDb();
  const [turn] = await db
    .select()
    .from(chatTurns)
    .where(and(eq(chatTurns.id, turnId), eq(chatTurns.userId, userId)))
    .limit(1);
  if (!turn) throw new NotFound('Chat turn not found');
  return turn;
}

export async function getChatTurn(userId: string, turnId: string) {
  return loadTurn(turnId, userId);
}

/** A turn is executed once. Reconnects read its event log; an interrupted
 * turn is never automatically re-executed because tools may have side effects. */
export async function claimChatTurnExecution(userId: string, turnId: string): Promise<void> {
  const [claimed] = await getDb().update(chatTurns)
    .set({ status: 'running', updatedAt: sql`now()` })
    .where(and(eq(chatTurns.id, turnId), eq(chatTurns.userId, userId), eq(chatTurns.status, 'queued')))
    .returning({ id: chatTurns.id });
  if (claimed) return;
  await loadTurn(turnId, userId);
  throw new Conflict('This turn has already been claimed. Reconnect to its events or create a new turn to retry.');
}

export async function touchChatTurnExecution(userId: string, turnId: string): Promise<boolean> {
  const rows = await getDb().update(chatTurns).set({ updatedAt: sql`now()` })
    .where(and(eq(chatTurns.id, turnId), eq(chatTurns.userId, userId), eq(chatTurns.status, 'running')))
    .returning({ id: chatTurns.id });
  return rows.length === 1;
}

/**
 * One execution-heartbeat tick.
 *
 * The turn is only aborted when the server can prove the turn is no longer
 * ours (the touch affected no row: another worker took it over, or it was
 * interrupted). A heartbeat that FAILS is not proof of anything: the signal
 * this aborts IS the upstream fetch signal, so aborting on a transient
 * database error truncates an answer the provider is still billing for. A
 * failed tick therefore leaves the turn running; if the database really is
 * gone, recoverStaleChatTurns() reclaims it once the heartbeat window
 * expires.
 */
export async function runExecutionHeartbeat(
  controller: AbortController,
  touch: () => Promise<boolean>,
): Promise<void> {
  try {
    const owned = await touch();
    if (!owned) controller.abort('turn_interrupted');
  } catch (err) {
    console.warn('[chat-turns] execution heartbeat failed (turn left running):', (err as Error).message);
  }
}

/** The claim also covers preparation: RAG expansion/provider prelude can
 * itself spend upstream tokens, so it must not run for losing retries. */
export async function withChatTurnExecution<T>(userId: string, turnId: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  await claimChatTurnExecution(userId, turnId);
  const controller = new AbortController();
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void runExecutionHeartbeat(
      controller,
      () => touchChatTurnExecution(userId, turnId),
    ).finally(() => { renewing = false; });
  }, 20_000);
  heartbeat.unref();
  try { return await work(controller.signal); }
  catch (err) {
    await setChatTurnStatus(turnId, 'failed', { error: (err as Error).message }).catch(() => {});
    throw err;
  } finally { clearInterval(heartbeat); }
}

export async function recoverStaleChatTurns(staleAfterMs = 120_000): Promise<number> {
  const rows = await getDb().update(chatTurns)
    .set({ status: 'interrupted', error: 'Execution heartbeat expired; retry explicitly with a new turn.', completedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(chatTurns.status, 'running'), lt(chatTurns.updatedAt, sql`now() - ${staleAfterMs} * interval '1 millisecond'`)))
    .returning({ id: chatTurns.id });
  for (const row of rows) {
    await publishChatTurnEvent(row.id, 'turn_interrupted', { status: 'interrupted', reason: 'heartbeat_expired' });
  }
  return rows.length;
}

let recoveryTimer: ReturnType<typeof setInterval> | null = null;
export function startChatTurnRecovery(): void {
  if (recoveryTimer) return;
  const recover = () => { void recoverStaleChatTurns().catch((err) => console.warn('[chat-turns] recovery failed:', (err as Error).message)); };
  recoveryTimer = setInterval(recover, 30_000);
  recoveryTimer.unref();
  recover();
}
export function stopChatTurnRecovery(): void {
  if (recoveryTimer) clearInterval(recoveryTimer);
  recoveryTimer = null;
}

export async function listChatTurnEvents(
  userId: string,
  turnId: string,
  after = 0,
  limit = 500,
) {
  await loadTurn(turnId, userId);
  const db = getDb();
  const safeAfter = Math.max(0, Math.floor(Number(after) || 0));
  const safeLimit = Math.min(500, Math.max(1, Math.floor(Number(limit) || 500)));
  const rows = await db
    .select({
      sequence: chatTurnEvents.sequence,
      event: chatTurnEvents.event,
      payload: chatTurnEvents.payload,
    })
    .from(chatTurnEvents)
    .where(and(eq(chatTurnEvents.turnId, turnId), gt(chatTurnEvents.sequence, safeAfter)))
    .orderBy(asc(chatTurnEvents.sequence))
    .limit(safeLimit);
  return rows
    .map((row) => ({
      turnId,
      sequence: Number(row.sequence),
      event: String(row.event),
      data: asRecord(row.payload),
    }));
}

export async function setChatTurnStatus(
  turnId: string,
  status: ChatTurnStatus,
  patch: Partial<{ fullText: string | null; fullReasoning: string | null; toolCalls?: unknown[]; turnRuntime?: unknown; error: string | null }> = {},
) {
  if (!CHAT_TURN_STATUSES.includes(status)) throw new BadRequest('Invalid status');
  const db = getDb();
  const terminal = status === 'completed' || status === 'failed' || status === 'interrupted';
  await db
    .update(chatTurns)
    .set({
      status,
      ...(patch.fullText !== undefined ? { fullText: patch.fullText } : {}),
      ...(patch.fullReasoning !== undefined ? { fullReasoning: patch.fullReasoning } : {}),
      ...(patch.toolCalls !== undefined ? { toolCalls: patch.toolCalls as never } : {}),
      ...(patch.turnRuntime !== undefined ? { turnRuntime: patch.turnRuntime } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(terminal ? { completedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    // A late worker must never turn an explicit Stop/recovery interruption
    // into success (or resurrect a completed turn).
    .where(and(eq(chatTurns.id, turnId), inArray(chatTurns.status, ['queued', 'running'])));
}

export async function interruptChatTurn(userId: string, turnId: string) {
  const turn = await loadTurn(turnId, userId);
  if (turn.status === 'completed' || turn.status === 'failed' || turn.status === 'interrupted') {
    return { turn, idempotent: true };
  }
  await setChatTurnStatus(turn.id, 'interrupted');
  await publishChatTurnEvent(turn.id, 'turn_interrupted', { status: 'interrupted' });
  const [updated] = await getDb()
    .select()
    .from(chatTurns)
    .where(and(eq(chatTurns.id, turn.id), eq(chatTurns.userId, userId)))
    .limit(1);
  return { turn: updated || { ...turn, status: 'interrupted' }, idempotent: false };
}

export async function listChatTurns(
  userId: string,
  opts: { sessionId?: string; limit?: number } = {},
) {
  const db = getDb();
  const limit = Math.min(50, Math.max(1, Math.floor(Number(opts.limit) || 20)));
  if (opts.sessionId) {
    if (!isUuid(opts.sessionId)) throw new BadRequest('Invalid sessionId');
    return db
      .select()
      .from(chatTurns)
      .where(and(eq(chatTurns.userId, userId), eq(chatTurns.sessionId, opts.sessionId)))
      .orderBy(desc(chatTurns.startedAt))
      .limit(limit);
  }
  return db
    .select()
    .from(chatTurns)
    .where(eq(chatTurns.userId, userId))
    .orderBy(desc(chatTurns.startedAt))
    .limit(limit);
}
