/**
 * Chat Turns — durable async chat execution (M1).
 *
 * One row per user turn. POST creates the row idempotently on
 * (userId, clientTurnId); the LLM worker (M2) appends sequenced events
 * and the client (re)subscribes with ?after=. Mirrors the
 * agent_runs/agent_run_events contract without sharing its Codex
 * workspace semantics.
 */

import { and, asc, desc, eq, max } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { chatTurnEvents, chatTurns, sessions } from '../db/schema.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

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
const sequenceQueues = new Map<string, Promise<unknown>>();
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
  const previous = sequenceQueues.get(turnId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const db = getDb();
    const [last] = await db
      .select({ sequence: max(chatTurnEvents.sequence) })
      .from(chatTurnEvents)
      .where(eq(chatTurnEvents.turnId, turnId));
    const sequence = Number(last?.sequence || 0) + 1;
    const payload = boundPayload(asRecord(data));
    await db.insert(chatTurnEvents).values({ turnId, sequence, event, payload });
    const runtimeEvent: ChatTurnEvent = { turnId, sequence, event, data: payload };
    publishToSubscribers(runtimeEvent);
    return runtimeEvent;
  });
  sequenceQueues.set(turnId, next);
  void next.finally(() => {
    if (sequenceQueues.get(turnId) === next) sequenceQueues.delete(turnId);
  });
  return next as Promise<ChatTurnEvent>;
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
  const [existing] = await db
    .select()
    .from(chatTurns)
    .where(and(eq(chatTurns.userId, input.userId), eq(chatTurns.clientTurnId, clientTurnId)))
    .limit(1);
  if (existing) return { turn: existing, created: false };
  const model = typeof input.model === 'string' ? input.model.slice(0, 200) : null;
  const [turn] = await db
    .insert(chatTurns)
    .values({
      userId: input.userId,
      sessionId: session?.id || null,
      clientTurnId,
      status: 'queued',
      model,
      inputSnapshot: (input.inputSnapshot ?? null) as never,
    })
    .returning();
  if (!turn) throw new Error('Unable to create chat turn');
  await publishChatTurnEvent(turn.id, 'turn_created', {
    sessionId: turn.sessionId,
    clientTurnId,
    model,
  });
  return { turn, created: true };
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
    .where(eq(chatTurnEvents.turnId, turnId))
    .orderBy(asc(chatTurnEvents.sequence));
  return rows
    .filter((row) => Number(row.sequence) > safeAfter)
    .slice(0, safeLimit)
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
  patch: Partial<{ fullText: string | null; fullReasoning: string | null; error: string | null }> = {},
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
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(terminal ? { completedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(chatTurns.id, turnId));
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
