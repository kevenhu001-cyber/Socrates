/* Re-attach detached chat turns after reload or reconnect. The session loader
 * owns when this runs; this module owns pending-turn transport and replay. */
import { stateStore } from '../state/store.ts';
import { quietTurn } from '../chat/turnUi.ts';
import { buildUserContentParts } from '../chat/history.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import {
  bumpPendingSeq,
  clearPendingTurn,
  createChatTurn,
  getChatTurn,
  loadPendingTurn,
  savePendingTurn,
  subscribeChatTurnEvents,
  type ChatTurn,
  type TurnEventFrame,
} from '../chat/turnClient.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

/** The subset of the streaming-turn controller this module drives. */
interface StreamingTurnController {
  append(delta: string): void;
  appendThinking(delta: string): void;
  recordToolUse(call: unknown): void;
  recordToolResult(data: unknown): void;
  recordToolApproval?(data: unknown): void;
  recordToolProgress?(data: unknown): void;
  recordExecutionStart?(data: unknown): void;
  recordAgentStep?(data: unknown): void;
  recordAgentPlan?(data: unknown): void;
  finish(): void;
  /** Finalize the bubble as an error: clears the live spinner and the elapsed
   *  timer, keeps the partial text, and renders a Retry affordance. */
  replaceWithError?(message: string, retry?: () => unknown): void;
}

/** Chat bridges published by the legacy shell (main.js / legacyBridge.js). */
interface PendingRestoreWindow extends Window {
  addMessage?: (role: string, text: string) => void;
  addStreamingMessage?: (options: { onRetry: () => void }) => Promise<StreamingTurnController>;
  askChatTurn?: (text: string, parts: unknown) => unknown;
}

/** A message row as read from the store; only these fields are used. */
interface StoredMessage {
  role?: string;
  rawText?: string | null;
  attachments?: unknown;
}

function storedMessages(): StoredMessage[] {
  const messages = stateStore.read('messages');
  return Array.isArray(messages) ? (messages as StoredMessage[]) : [];
}

type PendingTurnRecord = NonNullable<ReturnType<typeof loadPendingTurn>>;
type PendingSnapshot = { turn: ChatTurn; events: TurnEventFrame[] };

function createFallbackRunner(sessionId: string, fallback?: () => void): () => void {
  let used = false;
  return () => {
    if (used || stateStore.read('currentSessionId') !== sessionId) return;
    used = true;
    if (typeof fallback !== 'function') return;
    try { fallback(); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.fallback'); }
  };
}

function clearPendingSafely(sessionId: string, context: string): void {
  try { clearPendingTurn(sessionId); } catch (error) { reportSwallow(error, context); }
}

async function resolvePendingSnapshot(sessionId: string, pending: PendingTurnRecord): Promise<PendingSnapshot | null> {
  if (pending.turnId) return getChatTurn(pending.turnId);
  if (!pending.clientTurnId) return null;
  const created = await createChatTurn({ clientTurnId: pending.clientTurnId, sessionId });
  if (!created?.turn?.id) return null;
  pending.turnId = created.turn.id;
  savePendingTurn(sessionId, { turnId: pending.turnId, clientTurnId: pending.clientTurnId, lastSeq: 0 });
  return getChatTurn(pending.turnId);
}

function restoreCompletedTurn(
  sessionId: string,
  turn: ChatTurn,
  win: PendingRestoreWindow,
  runFallback: () => void,
): void {
  try {
    const full = turn.fullText || '';
    if (!full) {
      runFallback();
    } else if (typeof win.addMessage === 'function' && !hasAssistantMessage(full)) {
      win.addMessage('assistant', full);
      try { publishReactChatRuntime({ type: 'state-synced', reason: 'pending-turn-completed' }); }
      catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~3'); }
    }
  } catch (error) {
    reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~4');
  }
  clearPendingSafely(sessionId, 'session/pendingTurnRestore.reattachPendingTurn~5');
}

function hasAssistantMessage(text: string): boolean {
  return storedMessages().some((message) => Boolean(message && message.role === 'assistant' && message.rawText === text));
}

function retryPendingTurn(win: PendingRestoreWindow): () => void {
  return () => {
    try {
      const messages = storedMessages();
      const lastUser = [...messages].reverse().find((message) => Boolean(message && message.role === 'user'));
      const text = lastUser?.rawText || '';
      if (!text || typeof win.askChatTurn !== 'function') return;
      let parts = null;
      try { parts = buildUserContentParts(text, lastUser?.attachments); } catch { parts = null; }
      quietTurn(win.askChatTurn(text, parts));
    } catch (error) {
      reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~7');
    }
  };
}

interface FrameReplayContext {
  sessionId: string;
  ctl: StreamingTurnController;
  retryThisTurn: () => void;
  signal: AbortController;
}

function showTurnFailure(sessionId: string, ctl: StreamingTurnController, retry: () => void, signal: AbortController): void {
  try {
    if (typeof ctl.replaceWithError === 'function') {
      ctl.replaceWithError('The response failed. Tap Retry to try again.', retry);
    } else {
      ctl.finish();
    }
  } catch (error) {
    reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~12');
  }
  clearPendingSafely(sessionId, 'session/pendingTurnRestore.reattachPendingTurn~13');
  try { signal.abort('done'); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~14'); }
}

type TurnEventApplier = (data: Record<string, unknown>, context: FrameReplayContext) => boolean;

function replayToolUse(data: Record<string, unknown>, context: FrameReplayContext): boolean {
  const calls: unknown[] = Array.isArray(data) ? data : ((data.calls as unknown[]) || [data]);
  calls.forEach((call) => {
    try { context.ctl.recordToolUse(call); }
    catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~9'); }
  });
  return false;
}

function completeRecoveredTurn(_data: Record<string, unknown>, context: FrameReplayContext): boolean {
  context.ctl.finish();
  clearPendingSafely(context.sessionId, 'session/pendingTurnRestore.reattachPendingTurn~10');
  try { context.signal.abort('done'); }
  catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~11'); }
  return true;
}

const turnEventAppliers: Record<string, TurnEventApplier> = {
  content: (data, { ctl }) => {
    if (typeof data.delta === 'string') ctl.append(data.delta);
    return false;
  },
  reasoning: (data, { ctl }) => {
    if (typeof data.delta === 'string') ctl.appendThinking(data.delta);
    return false;
  },
  tool_use: replayToolUse,
  tool_result: (data, { ctl }) => { ctl.recordToolResult(data); return false; },
  tool_approval: (data, { ctl }) => {
    if (typeof ctl.recordToolApproval === 'function') ctl.recordToolApproval(data);
    return false;
  },
  tool_progress: (data, { ctl }) => { ctl.recordToolProgress?.(data); return false; },
  execution_start: (data, { ctl }) => { ctl.recordExecutionStart?.(data); return false; },
  agent_step: (data, { ctl }) => { ctl.recordAgentStep?.(data); return false; },
  agent_plan: (data, { ctl }) => { ctl.recordAgentPlan?.(data); return false; },
  turn_done: completeRecoveredTurn,
  turn_failed: (_data, { sessionId, ctl, retryThisTurn, signal }) => {
    showTurnFailure(sessionId, ctl, retryThisTurn, signal);
    return true;
  },
};

function applyTurnEvent(frame: TurnEventFrame, context: FrameReplayContext): boolean {
  const apply = turnEventAppliers[frame.event];
  return apply ? apply(frame.data || {}, context) : false;
}

function createFrameApplier(
  context: FrameReplayContext,
  initialSequence: number,
): { applyFrame(frame: TurnEventFrame): void; getSequence(): number } {
  let maxSeq = initialSequence;
  function applyFrame(frame: TurnEventFrame): void {
    if (!frame || stateStore.read('currentSessionId') !== context.sessionId) {
      try { context.signal.abort('session-switch'); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~8'); }
      return;
    }
    try {
      if (applyTurnEvent(frame, context)) return;
      if (typeof frame.sequence !== 'number' || frame.sequence <= maxSeq) return;
      maxSeq = frame.sequence;
      try { bumpPendingSeq(context.sessionId, maxSeq); }
      catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~15'); }
    } catch (error) {
      reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~16');
    }
  }
  return { applyFrame, getSequence: () => maxSeq };
}

function settleDisconnectedTurn(sessionId: string, ctl: StreamingTurnController, retry: () => void, signal: AbortController): void {
  try {
    if (typeof ctl.replaceWithError === 'function') {
      ctl.replaceWithError('Lost the connection to the model. Tap Retry to try again.', retry);
    } else {
      ctl.finish();
    }
  } catch (error) {
    reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~19');
  }
  clearPendingSafely(sessionId, 'session/pendingTurnRestore.reattachPendingTurn~20');
  try { signal.abort('subscribe-failed'); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~21'); }
}

async function followPendingTurn(
  sessionId: string,
  pending: PendingTurnRecord,
  snapshot: PendingSnapshot,
  ctl: StreamingTurnController,
  retry: () => void,
): Promise<void> {
  if (!pending.turnId) return;
  const signal = new AbortController();
  const replay = createFrameApplier({ sessionId, ctl, retryThisTurn: retry, signal }, Number(pending.lastSeq) || 0);
  try {
    for (const frame of snapshot.events || []) replay.applyFrame(frame);
    if (stateStore.read('currentSessionId') !== sessionId) {
      try { signal.abort('session-switch'); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~17'); }
      return;
    }
    await subscribeChatTurnEvents(pending.turnId, replay.getSequence(), signal.signal, {
      onEvent: replay.applyFrame,
      onError: function () { /* empty-catch: intentional — replay errors are reported by the outer catch */ },
    });
  } catch (error) {
    reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~18');
    settleDisconnectedTurn(sessionId, ctl, retry, signal);
  }
}

/* M2 async — re-attach a detached turn after reload/reconnect.
 * Cases:
 *   completed + fullText → append once (deduped by exact rawText) so
 *     the answer the server finished while we were gone is visible.
 *   failed/interrupted  → drop the pointer; the in-place error affordance
 *     from the original tab (or streamingText recovery) owns the UX.
 *   open                → open a live bubble and tail events from lastSeq.
 * All paths are best-effort and session-scoped: if the user switches
 * sessions mid-tail the subscription aborts and the bubble's
 * stillOwnsSlot guard keeps the writes inert.
 *
 * P_single-recovery-owner — a session must be recovered by exactly one
 * owner. The interrupted-response fallback (a partial bubble with its own
 * Retry button) and this live re-attach (a bubble that replays the same
 * answer) would otherwise both render the same text, and the fallback's
 * Retry button aborts this bubble. This module wins whenever it can take
 * ownership, and calls `fallback` only when it cannot. */
export async function reattachPendingTurn(sessionId: string, fallback?: () => void): Promise<void> {
  const runFallback = createFallbackRunner(sessionId, fallback);
  let pending: ReturnType<typeof loadPendingTurn>;
  try { pending = loadPendingTurn(sessionId); } catch { runFallback(); return; }
  if (!pending || (!pending.turnId && !pending.clientTurnId)) { runFallback(); return; }
  let snapshot: PendingSnapshot | null;
  try {
    snapshot = await resolvePendingSnapshot(sessionId, pending);
  } catch {
    clearPendingSafely(sessionId, 'session/pendingTurnRestore.reattachPendingTurn~1');
    runFallback();
    return;
  }
  if (!snapshot || !snapshot.turn) { runFallback(); return; }
  const turn = snapshot.turn;
  if (turn.sessionId && turn.sessionId !== sessionId) {
    clearPendingSafely(sessionId, 'session/pendingTurnRestore.reattachPendingTurn~2');
    runFallback();
    return;
  }
  if (stateStore.read('currentSessionId') !== sessionId) return;
  const win = window as PendingRestoreWindow;

  if (turn.status === 'completed') {
    restoreCompletedTurn(sessionId, turn, win, runFallback);
    return;
  }
  if (turn.status === 'failed' || turn.status === 'interrupted') {
    clearPendingSafely(sessionId, 'session/pendingTurnRestore.reattachPendingTurn~6');
    /* The turn is dead: this module cannot own the recovery, so the
       partial-answer fallback does. */
    runFallback();
    return;
  }
  if (typeof win.addStreamingMessage !== 'function') { runFallback(); return; }
  /* The retry closure is shared by the live bubble and by the error
     affordance that replaces it, so a failed re-attach still offers a
     working Retry button. */
  const retry = retryPendingTurn(win);
  const ctl = await win.addStreamingMessage({ onRetry: retry });
  await followPendingTurn(sessionId, pending, snapshot, ctl, retry);
}
