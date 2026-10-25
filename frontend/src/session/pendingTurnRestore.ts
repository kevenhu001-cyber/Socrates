/* Re-attach detached chat turns after reload or reconnect. The session loader
 * owns when this runs; this module owns pending-turn transport and replay. */
import { stateStore } from '../state/store.js';
import { quietTurn } from '../chat/turnUi.ts';
import { buildUserContentParts } from '../chat/history.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
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
  let usedFallback = false;
  const runFallback = (): void => {
    if (usedFallback) return;
    /* Never touch another session: the fallback appends to the CURRENT
       transcript, so it must not run after the user switched away. */
    if (stateStore.read('currentSessionId') !== sessionId) return;
    usedFallback = true;
    if (typeof fallback !== 'function') return;
    try { fallback(); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.fallback'); }
  };
  let pending: ReturnType<typeof loadPendingTurn>;
  try { pending = loadPendingTurn(sessionId); } catch { runFallback(); return; }
  if (!pending || (!pending.turnId && !pending.clientTurnId)) { runFallback(); return; }
  let snapshot: { turn: ChatTurn; events: TurnEventFrame[] } | null = null;
  try {
    if (pending.turnId) {
      snapshot = await getChatTurn(pending.turnId);
    } else if (pending.clientTurnId) {
      const resTurn = await createChatTurn({ clientTurnId: pending.clientTurnId, sessionId });
      if (resTurn && resTurn.turn && resTurn.turn.id) {
        pending.turnId = resTurn.turn.id;
        savePendingTurn(sessionId, { turnId: pending.turnId, clientTurnId: pending.clientTurnId, lastSeq: 0 });
        snapshot = await getChatTurn(pending.turnId);
      }
    }
  } catch {
    try { clearPendingTurn(sessionId); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~1'); }
    runFallback();
    return;
  }
  if (!snapshot || !snapshot.turn) { runFallback(); return; }
  const turn = snapshot.turn;
  if (turn.sessionId && turn.sessionId !== sessionId) {
    try { clearPendingTurn(sessionId); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~2'); }
    runFallback();
    return;
  }
  if (stateStore.read('currentSessionId') !== sessionId) return;
  const win = window as PendingRestoreWindow;

  if (turn.status === 'completed') {
    try {
      const full = turn.fullText || '';
      if (full) {
        const msgs = storedMessages();
        let already = false;
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i] && msgs[i].role === 'assistant' && msgs[i].rawText === full) { already = true; break; }
        }
        if (!already && typeof win.addMessage === 'function') {
          win.addMessage('assistant', full);
          try { publishReactChatRuntime({ type: 'state-synced', reason: 'pending-turn-completed' }); }
          catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~3'); }
        }
      } else {
        /* Completed but empty: this module has nothing to show, so the
           partial-answer fallback owns the recovery. */
        runFallback();
      }
    } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~4'); }
    try { clearPendingTurn(sessionId); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~5'); }
    return;
  }
  if (turn.status === 'failed' || turn.status === 'interrupted') {
    try { clearPendingTurn(sessionId); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~6'); }
    /* The turn is dead: this module cannot own the recovery, so the
       partial-answer fallback does. */
    runFallback();
    return;
  }
  if (typeof win.addStreamingMessage !== 'function') { runFallback(); return; }
  /* The retry closure is shared by the live bubble and by the error
     affordance that replaces it, so a failed re-attach still offers a
     working Retry button. */
  const retryThisTurn = function (): void {
    try {
      let lastUserEntry: StoredMessage | null = null;
      let lastUser: string | null = null;
      const list = storedMessages();
      for (let ui = list.length - 1; ui >= 0; ui--) {
        if (list[ui] && list[ui].role === 'user') {
          lastUserEntry = list[ui];
          lastUser = lastUserEntry.rawText || null;
          break;
        }
      }
      if (lastUser && typeof win.askChatTurn === 'function') {
        /* Same slicing hazard as the recovered-stream retry above: carry
           the stored multimodal parts through the replay. */
        let lastUserParts = null;
        try { lastUserParts = buildUserContentParts(lastUser, lastUserEntry && lastUserEntry.attachments); } catch { lastUserParts = null; }
        quietTurn(win.askChatTurn(lastUser, lastUserParts));
      }
    } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~7'); }
  };
  const ctl = await win.addStreamingMessage({
    onRetry: retryThisTurn,
  });
  const subAbort = new AbortController();
  let maxSeq = Number(pending.lastSeq) || 0;

  function applyFrame(frame: TurnEventFrame): void {
    if (!frame || stateStore.read('currentSessionId') !== sessionId) {
      try { subAbort.abort('session-switch'); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~8'); }
      return;
    }
    try {
      const data = frame.data || {};
      if (frame.event === 'content' && typeof data.delta === 'string') ctl.append(data.delta);
      else if (frame.event === 'reasoning' && typeof data.delta === 'string') ctl.appendThinking(data.delta);
      else if (frame.event === 'tool_use') {
        const calls: unknown[] = Array.isArray(data) ? data : ((data.calls as unknown[]) || [data]);
        for (let ci = 0; ci < calls.length; ci++) { try { ctl.recordToolUse(calls[ci]); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~9'); } }
      }
      else if (frame.event === 'tool_result') ctl.recordToolResult(data);
      else if (frame.event === 'tool_approval' && typeof ctl.recordToolApproval === 'function') ctl.recordToolApproval(data);
      else if (frame.event === 'tool_progress' && ctl.recordToolProgress) ctl.recordToolProgress(data);
      else if (frame.event === 'execution_start' && ctl.recordExecutionStart) ctl.recordExecutionStart(data);
      else if (frame.event === 'agent_step' && typeof ctl.recordAgentStep === 'function') ctl.recordAgentStep(data);
      else if (frame.event === 'agent_plan' && typeof ctl.recordAgentPlan === 'function') ctl.recordAgentPlan(data);
      else if (frame.event === 'turn_done') {
        ctl.finish();
        try { clearPendingTurn(sessionId); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~10'); }
        try { subAbort.abort('done'); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~11'); }
        return;
      } else if (frame.event === 'turn_failed') {
        /* P_failed-turn-not-success — a failed turn must NOT be finalized
           through the success path: that renders the truncated answer as a
           normal reply, clears the error state and saves it as a good
           message, so the user never learns the turn failed. Replace the
           bubble with the error affordance instead. */
        try {
          if (typeof ctl.replaceWithError === 'function') {
            ctl.replaceWithError('The response failed. Tap Retry to try again.', retryThisTurn);
          } else {
            ctl.finish();
          }
        } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~12'); }
        try { clearPendingTurn(sessionId); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~13'); }
        try { subAbort.abort('done'); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~14'); }
        return;
      }
      if (typeof frame.sequence === 'number' && frame.sequence > maxSeq) {
        maxSeq = frame.sequence;
        try { bumpPendingSeq(sessionId, maxSeq); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~15'); }
      }
    } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~16'); }
  }

  try {
    const replay = snapshot.events || [];
    for (let r = 0; r < replay.length; r++) applyFrame(replay[r]);
    if (stateStore.read('currentSessionId') !== sessionId) {
      try { subAbort.abort('session-switch'); } catch (error) { reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~17'); }
      return;
    }
    await subscribeChatTurnEvents(pending.turnId, maxSeq, subAbort.signal, {
      onEvent: applyFrame,
      onError: function () { /* empty-catch: intentional — replay errors are reported by the outer catch */ },
    });
  } catch (error) {
    reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~18');
    /* P_subscribe-failure-not-stuck — the bubble was opened BEFORE the
       subscription, and it owns the live spinner, the Stop button and the
       1 Hz elapsed timer. If the subscription fails and we simply return,
       the bubble spins forever with no way to stop it: only the next send
       resets the turn state. Close it with the error affordance. */
    try {
      if (typeof ctl.replaceWithError === 'function') {
        ctl.replaceWithError('Lost the connection to the model. Tap Retry to try again.', retryThisTurn);
      } else {
        ctl.finish();
      }
    } catch (caught) { reportSwallow(caught, 'session/pendingTurnRestore.reattachPendingTurn~19'); }
    try { clearPendingTurn(sessionId); } catch (caught) { reportSwallow(caught, 'session/pendingTurnRestore.reattachPendingTurn~20'); }
    try { subAbort.abort('subscribe-failed'); } catch (caught) { reportSwallow(caught, 'session/pendingTurnRestore.reattachPendingTurn~21'); }
  }
}
