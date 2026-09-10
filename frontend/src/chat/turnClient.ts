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

import { apiFetch, apiFetchRaw } from '../util/api.js';
import { consumeSseBuffer } from '../../../packages/core/src/index.ts';

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
  usage: unknown;
  error: string | null;
}

export interface TurnEventFrame {
  turnId: string;
  sequence: number;
  event: string;
  data: Record<string, unknown>;
}

export function newClientTurnId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createChatTurn(input: {
  clientTurnId: string;
  sessionId?: string | null;
  model?: string | null;
  input?: unknown;
}): Promise<{ turn: ChatTurn; created: boolean }> {
  const res = await apiFetch('/api/chat-turns', {
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

export async function getChatTurn(turnId: string): Promise<{ turn: ChatTurn; events: TurnEventFrame[] }> {
  const res = await apiFetch(`/api/chat-turns/${encodeURIComponent(turnId)}`);
  return { turn: res.turn as ChatTurn, events: (res.events || []) as TurnEventFrame[] };
}

export async function interruptChatTurn(turnId: string): Promise<{ turn: ChatTurn; idempotent: boolean }> {
  const res = await apiFetch(`/api/chat-turns/${encodeURIComponent(turnId)}/interrupt`, {
    method: 'POST',
    body: {},
  });
  return { turn: res.turn as ChatTurn, idempotent: !!res.idempotent };
}

export interface TurnSubscribeHandlers {
  onEvent?: (frame: TurnEventFrame) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
  /** Same SSE frame splitter the chat stream uses. */
  maxEvents?: number;
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
  let resp;
  try {
    resp = await apiFetchRaw(
      `/api/chat-turns/${encodeURIComponent(turnId)}/events?after=${encodeURIComponent(String(Math.max(0, after || 0)))}`,
      { signal: signal || undefined },
    );
  } catch (err) {
    handlers.onError?.(err);
    throw err;
  }
  if (!resp.body || typeof resp.body.getReader !== 'function') {
    handlers.onDone?.();
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let seen = 0;
  const maxEvents = handlers.maxEvents || 10_000;
  const processFrame = (frame: string) => {
    const lines = frame.split('\n');
    let eventName: string | null = null;
    const dataParts: string[] = [];
    for (const line of lines) {
      if (line.indexOf('event:') === 0) eventName = line.slice(6).trim() || eventName;
      else if (line.indexOf('data:') === 0) dataParts.push(line.slice(5).trim());
    }
    if (eventName !== 'turn_event' || !dataParts.length) return;
    try {
      const parsed = JSON.parse(dataParts.join('\n')) as TurnEventFrame;
      if (parsed && typeof parsed.sequence === 'number') {
        seen += 1;
        handlers.onEvent?.(parsed);
      }
    } catch { /* malformed frame — skip */ }
  };
  try {
    for (;;) {
      if (signal?.aborted) break;
      const step = await reader.read();
      if (step.done) break;
      buf += decoder.decode(step.value, { stream: true });
      buf = consumeSseBuffer(buf, processFrame);
      if (seen >= maxEvents) break;
    }
    buf += decoder.decode();
    if (buf && buf.indexOf('data:') >= 0) processFrame(buf);
    handlers.onDone?.();
  } catch (err) {
    handlers.onError?.(err);
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch { /* ignore */ }
  }
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
    localStorage.setItem(pendingKey(sessionId), JSON.stringify(record));
  } catch { /* storage full/blocked — resume just won't survive reload */ }
}

export function loadPendingTurn(sessionId: string): PendingTurn | null {
  try {
    if (!sessionId) return null;
    const raw = localStorage.getItem(pendingKey(sessionId));
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
  } catch { /* ignore */ }
}

export function clearPendingTurn(sessionId: string): void {
  try {
    if (!sessionId) return;
    localStorage.removeItem(pendingKey(sessionId));
  } catch { /* ignore */ }
}
