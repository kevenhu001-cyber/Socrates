/**
 * chat/turnClient.ts — M1 async turn HTTP client.
 *
 * Thin wrapper over apiFetch/apiFetchRaw for the detached turn API:
 *   POST /api/chat-turns (idempotent on clientTurnId)
 *   GET  /api/chat-turns/:id
 *   GET  /api/chat-turns/:id/events?after= (SSE, re-attachable)
 *   POST /api/chat-turns/:id/interrupt
 *
 * Plus a localStorage pending-turn pointer so a reload/reconnect can
 * re-attach to the same turn instead of opening a second LLM call.
 * M1 ships the client only; turnController switches to it in M2.
 */

import { apiFetch, apiFetchRaw } from '../util/api.ts';
import { batchPeek, batchRemoveItem, batchSetItem } from '../batchStorage.ts';
import { consumeSseBuffer } from '../../../packages/core/src/index.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

export interface ChatTurn {
  id: string;
  sessionId: string | null;
  clientTurnId: string;
  status: string;
  model: string | null;
  generation: number;
  fullText: string | null;
  fullReasoning: string | null;
  toolCalls: unknown[];
  turnRuntime?: import("@socrates/contracts").TurnRuntime | null;
  usage: unknown;
  error: string | null;
}

export interface TurnEventFrame {
  turnId: string;
  sequence: number;
  event: string;
  data: Record<string, unknown>;
}

interface ChatTurnCreateResponse { turn: ChatTurn; created?: boolean }
interface ChatTurnReadResponse { turn: ChatTurn; events?: TurnEventFrame[] }
interface ChatTurnInterruptResponse { turn: ChatTurn; idempotent?: boolean }

export function newClientTurnId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    reportSwallow(error, 'empty catch: chat/turnClient.ts:47');
    /* fall through */
  }
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createChatTurn(input: {
  clientTurnId: string;
  sessionId?: string | null;
  model?: string | null;
  input?: unknown;
}): Promise<{ turn: ChatTurn; created: boolean }> {
  const res = await apiFetch<ChatTurnCreateResponse>('/api/chat-turns', {
    method: 'POST',
    body: {
      clientTurnId: input.clientTurnId,
      sessionId: input.sessionId ?? null,
      model: input.model ?? null,
      input: input.input ?? null,
    },
  });
  return { turn: res.turn as ChatTurn, created: !!res.created };
}

export async function getChatTurn(turnId: string, signal?: AbortSignal | null): Promise<{ turn: ChatTurn; events: TurnEventFrame[] }> {
  const res = await apiFetch<ChatTurnReadResponse>(`/api/chat-turns/${encodeURIComponent(turnId)}`, { signal });
  return { turn: res.turn as ChatTurn, events: (res.events || []) as TurnEventFrame[] };
}

export async function interruptChatTurn(turnId: string): Promise<{ turn: ChatTurn; idempotent: boolean }> {
  const res = await apiFetch<ChatTurnInterruptResponse>(`/api/chat-turns/${encodeURIComponent(turnId)}/interrupt`, {
    method: 'POST',
    body: {},
  });
  return { turn: res.turn as ChatTurn, idempotent: !!res.idempotent };
}

/**
 * Stop a server turn the client is abandoning.
 *
 * A retry renews clientTurn.id and opens a NEW server turn; the previous one
 * keeps generating upstream tokens until the server's stale-turn reclaim runs
 * (120 s). With several attempts allowed per user action that is several
 * concurrent paid generations for one question.
 *
 * Best-effort by design: the interrupt is fire-and-forget, so a failed call
 * never delays or breaks the retry. The server-side reclaim stays the
 * backstop, and marking the turn 'interrupted' makes the next execution
 * heartbeat drop the upstream request.
 *
 * Only call this for a turn this client created and is replacing. When the
 * next attempt rebinds the SAME turn (an explicit turnId), interrupting it
 * would kill the attempt that is about to start.
 */
export function abandonServerTurn(turnId: string | null | undefined): void {
  if (!turnId) return;
  void interruptChatTurn(turnId).catch((error) => {
    reportSwallow(error, 'chat/turnClient.abandonServerTurn');
  });
}

export interface TurnSubscribeHandlers {
  onEvent?: (frame: TurnEventFrame) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
  /** Same SSE frame splitter the chat stream uses. */
  maxEvents?: number;
}

function parseTurnEventFrame(frame: string): TurnEventFrame | null {
  const lines = frame.split('\n');
  let eventName: string | null = null;
  const dataParts: string[] = [];
  for (const line of lines) {
    if (line.indexOf('event:') === 0) eventName = line.slice(6).trim() || eventName;
    else if (line.indexOf('data:') === 0) dataParts.push(line.slice(5).trim());
  }
  if (eventName !== 'turn_event' || !dataParts.length) return null;
  try {
    const parsed = JSON.parse(dataParts.join('\n')) as TurnEventFrame;
    return parsed && typeof parsed.sequence === 'number' ? parsed : null;
  } catch (error) {
    reportSwallow(error, 'empty catch: chat/turnClient.ts:126');
    /* malformed frame — skip */
  }
  return null;
}

async function readTurnEventStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | null,
  handlers: TurnSubscribeHandlers,
): Promise<void> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let seen = 0;
  const maxEvents = handlers.maxEvents || 10_000;
  const processFrame = (frame: string): void => {
    const parsed = parseTurnEventFrame(frame);
    if (!parsed) return;
    seen += 1;
    handlers.onEvent?.(parsed);
  };
  for (;;) {
    if (signal?.aborted) break;
    const step = await reader.read();
    if (step.done) break;
    buffer += decoder.decode(step.value, { stream: true });
    buffer = consumeSseBuffer(buffer, processFrame);
    if (seen >= maxEvents) break;
  }
  buffer += decoder.decode();
  if (buffer && buffer.indexOf('data:') >= 0) processFrame(buffer);
}

async function consumeTurnEventStream(
  resp: Response,
  signal: AbortSignal | null,
  handlers: TurnSubscribeHandlers,
): Promise<void> {
  if (!resp.body || typeof resp.body.getReader !== 'function') {
    handlers.onDone?.();
    return;
  }
  const reader = resp.body.getReader();
  try {
    await readTurnEventStream(reader, signal, handlers);
    handlers.onDone?.();
  } catch (err) {
    handlers.onError?.(err);
    throw err;
  } finally {
    try { reader.releaseLock(); }
    catch (error) {
      reportSwallow(error, 'empty catch: chat/turnClient.ts:175', 'expected');
      /* ignore */
    }
  }
}

/**
 * Subscribe to a turn's event stream from `after` (inclusive-exclusive:
 * server sends sequence > after). Resolves when the stream ends or the
 * signal aborts. Closing here never interrupts the server turn — call
 * interruptChatTurn for that, or just re-subscribe with a newer `after`.
 */
export async function subscribeChatTurnEvents(
  turnId: string,
  after: number,
  signal: AbortSignal | null,
  handlers: TurnSubscribeHandlers = {},
): Promise<void> {
  let response: Response;
  try {
    response = await apiFetchRaw(
      `/api/chat-turns/${encodeURIComponent(turnId)}/events?after=${encodeURIComponent(String(Math.max(0, after || 0)))}`,
      { signal: signal || undefined },
    );
  } catch (err) {
    handlers.onError?.(err);
    throw err;
  }
  await consumeTurnEventStream(response, signal, handlers);
}

/* ── Pending-turn pointer (localStorage) ────────────────────────── */

const PENDING_KEY_PREFIX = 'socrates-pending-turn:';

export interface PendingTurn {
  turnId: string;
  clientTurnId: string;
  sessionId: string;
  lastSeq: number;
  updatedAt: number;
}

export function pendingKey(sessionId: string): string {
  return `${PENDING_KEY_PREFIX}${sessionId}`;
}

export function savePendingTurn(sessionId: string, pointer: Omit<PendingTurn, 'sessionId' | 'updatedAt'>): void {
  try {
    if (!sessionId || !pointer.turnId) return;
    const record: PendingTurn = { ...pointer, sessionId, updatedAt: Date.now() };
    /* P_batch-storage — the pending-turn pointer is rewritten on
       every turn-bump (interrupt, retry, re-attach) — 1–5 writes per
       session switch. localStorage.setItem is synchronous and forces
       a storage commit, so a burst would serialise on the main
       thread. batchSetItem coalesces all writes from one microtask
       into a single setItem loop; the resume pointer is read on
       next load so the slight delay is invisible. */
    batchSetItem(pendingKey(sessionId), JSON.stringify(record));
  } catch (error) {
    reportSwallow(error, 'empty catch: chat/turnClient.ts:232');
    /* storage full/blocked — resume just won't survive reload */
  }
}

export function loadPendingTurn(sessionId: string): PendingTurn | null {
  try {
    if (!sessionId) return null;
    const raw = batchPeek(pendingKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingTurn;
    if (!parsed || parsed.turnId == null || parsed.sessionId !== sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function bumpPendingSeq(sessionId: string, lastSeq: number): void {
  try {
    const cur = loadPendingTurn(sessionId);
    if (!cur) return;
    savePendingTurn(sessionId, { turnId: cur.turnId, clientTurnId: cur.clientTurnId, lastSeq });
  } catch (error) {
    reportSwallow(error, 'empty catch: chat/turnClient.ts:253', 'expected');
    /* ignore */
  }
}

/**
 * Drop the session's pending-turn pointer. With `clientTurnId`, only when
 * the pointer still belongs to that turn: a superseded turn unwinds after
 * the next one may already have bound, and clearing unconditionally there
 * erased the live turn's pointer (no Stop, no re-attach after reload).
 */
export function clearPendingTurn(sessionId: string, clientTurnId?: string): void {
  try {
    if (!sessionId) return;
    if (clientTurnId) {
      const current = loadPendingTurn(sessionId);
      if (current && current.clientTurnId !== clientTurnId) return;
    }
    batchRemoveItem(pendingKey(sessionId));
  } catch (error) {
    reportSwallow(error, 'empty catch: chat/turnClient.ts:270', 'expected');
    /* ignore */
  }
}
