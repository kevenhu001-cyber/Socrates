/**
 * chat/turn/abortPath.ts — user-stop (abort) path for addStreamingMessage.
 *
 * User-initiated stop is the second end state for a streaming turn. The
 * bubble keeps any visible text (already-streamed chars are still on
 * screen and saved); an empty placeholder collapses to an invisible stub
 * the next turn's anchor glides past. A partial answer gets a Resend
 * button on top of the streamed HTML so the user can re-run the send
 * path with one click.
 *
 * Extracted from chat/streamingTurn.js during the 2026-10 addStreamingMessage
 * split. The split is structural only: the slot-ownership guard, the
 * partial-text finalize, the superseded-stub retirement, and the
 * legacy-shell eviction all keep their original sequencing.
 */
import { settleTurnRuntime } from '@socrates/core';
import { esc } from '../../render/helpers.ts';
import { buildAssistantHtml } from '../../render/assistantHtml.ts';
import { formatMsgProgressive } from '../../render/markdown.ts';
import { setReactLiveStatus } from '../../ui/messageSnapshot.ts';
import { setChatStopState, markTurnEnded, resendLastUserMessage } from '../turnUi.ts';
import { claimLiveRetry } from '../liveTurn.ts';
import { turnState } from '../turnState.ts';
import { removeSupersededStub } from '../turnAnchor.ts';
import { saveCurrentSession } from '../../session/persistence.ts';
import { stripChatArtifacts } from '../../util/stripChatArtifacts.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';
import { readTurnMessage } from './runtimeState.ts';
import type { TurnMessage, TurnRuntimeState } from './runtimeState.ts';

export interface AbortPath {
  abort(): void;
}

function readAbortedMessage(state: TurnRuntimeState): TurnMessage | null {
  const message = readTurnMessage(state.msgIdx);
  return message && message.clientId === state.clientId ? message : null;
}

function hasVisibleAbortContent(message: TurnMessage | null, visibleText: string): boolean {
  return !!(message && (
    visibleText || message.turnRuntime?.uiSurfaces.some((surface) => surface.phase === 'committed')
  ));
}

function preserveEmptyAbortStub(state: TurnRuntimeState, message: TurnMessage | null): void {
  if (!message || message.type !== 'streaming') return;
  state.patchOwnedMessage({
    rawText: '',
    html: '<span data-turn-stub="1"></span>',
    type: 'assistant',
    _supersededStub: true,
  });
  setTimeout(function () {
    try { removeSupersededStub(state.clientId); } catch { /* already gone */ }
  }, 700);
}

function renderStoppedHtml(state: TurnRuntimeState, stoppedRaw: string, visibleStoppedRaw: string): string {
  try {
    const html = buildAssistantHtml(stoppedRaw);
    return /scaffold-stream-unclosed/.test(html) ? formatMsgProgressive(stoppedRaw) : html;
  } catch {
    try { return formatMsgProgressive(stoppedRaw); }
    catch { return '<p>' + esc(visibleStoppedRaw) + '</p>'; }
  }
}

function bindStoppedResend(state: TurnRuntimeState): void {
  claimLiveRetry(state.ret, function () {
    try { resendLastUserMessage(); } catch { /* resend handler threw */ }
  });
  const delegatedResend = function (event: Event): void {
    const target = event.target as Element | null;
    if (!(target && target.closest && target.closest('[data-chat-resend]'))) return;
    try { state.list.removeEventListener('click', delegatedResend); }
    catch { /* listener already detached */ }
    resendLastUserMessage();
  };
  try { state.list.addEventListener('click', delegatedResend); }
  catch { /* list unavailable */ }
  try { saveCurrentSession(); }
  catch { /* save failed */ }
}

function finalizeStoppedMessage(
  state: TurnRuntimeState,
  message: TurnMessage,
  stoppedRaw: string,
  visibleStoppedRaw: string,
): void {
  const stoppedHtml = renderStoppedHtml(state, stoppedRaw, visibleStoppedRaw);
  const resendHtml = '<div class="msg-error msg-resend" style="margin-top:8px">' +
    '<span class="msg-error-text">' + esc(state.t('chat.stopped') || 'Response stopped') + '</span>' +
    '<button type="button" class="msg-retry-btn chat-resend-btn" data-chat-resend>' +
    esc(state.t('chat.resend') || 'Resend') + '</button>' +
    '</div>';
  const finalized = state.patchOwnedMessage({
    rawText: stoppedRaw,
    html: stoppedHtml + resendHtml,
    type: 'assistant',
    state: 'stopped',
  }) || message;
  setReactLiveStatus(finalized, {
    phase: 'stopped', label: state.t('chat.stopped') || 'Response stopped',
  });
  bindStoppedResend(state);
}

function evictLegacyAbortShell(state: TurnRuntimeState): void {
  requestAnimationFrame(function () {
    try {
      const legacy = state.list.querySelector('[data-client-id="' + state.clientId + '"]');
      if (legacy && !legacy.hasAttribute('data-react-owned') && legacy.parentNode === state.list) {
        state.list.removeChild(legacy);
      }
    } catch { /* legacy shell already gone */ }
  });
}

function releaseActiveAbortTurn(state: TurnRuntimeState): void {
  if (turnState.activeChatCtl !== state.ret) return;
  turnState.chatStreaming = false;
  try { setChatStopState(false); } catch { /* stop state already cleared */ }
  try { markTurnEnded(); } catch { /* turn already ended */ }
}

function publishAbortedTurn(state: TurnRuntimeState): void {
  publishReactChatRuntime({
    type: 'stream-aborted',
    messageId: state.clientId,
    textLength: state.full.length,
  });
  evictLegacyAbortShell(state);
}

/**
 * Build the abort entry point bound to one turn's state. The helper reads and
 * mutates `state._disposed`, `state.finished`, `state.toolRuntime`, etc., so
 * callers see the exact same lifecycle flips the original in-function abort()
 * performed.
 */
export function createAbortPath(state: TurnRuntimeState): AbortPath {
  function abort(): void {
    /* P_session-stream-dispose — flip the sticky flag FIRST so any
       in-flight append()/recordToolUse()/finish() callbacks that
       are already scheduled in the microtask queue (the stream.js
       reader keeps draining the SSE buffer for one or two ticks
       after AbortController.abort()) will short-circuit on their
       own _disposed checks and never touch stateStore.read("messages"). */
    if (state._disposed) return;
    if (state.finished) return;
    state.finished = true;
    state._disposed = true;
    if (state._elapsedTick) clearInterval(state._elapsedTick);
    state.cancelScheduledRender();
    /* Restore the send button — but only if no new stream has
     * already taken over (the new wrapper cancels the OLD
     * controller when the user sends a follow-up, and the new
     * addStreamingMessage has already raised turnState.chatStreaming). */
    releaseActiveAbortTurn(state);
    /* Stop the independent execution stream and any queued delta
       frame before this message can lose ownership of its slot. */
    state.toolRuntime.cancel();
    state.patchOwnedMessage({ turnRuntime: settleTurnRuntime(readTurnMessage(state.msgIdx)?.turnRuntime, 'stopped') });
    /* A user stop is an intentional end state. Keep any visible text as a
     * normal assistant message so it remains on screen and can be saved.
     * P_session-cross-talk — verify the slot still holds OUR placeholder
     * (by clientId) before splicing. If the user switched sessions,
     * stateStore.read("messages") was replaced and msgIdx now points at the new
     * session's message — splicing here would delete the new session's
     * message. The abandoned placeholder is harmless (it's not in the
     * new session's array), so just skip the splice. */
    const abortedMessage = readAbortedMessage(state);
    const stoppedRaw = abortedMessage ? String(state.full || abortedMessage.rawText || '') : String(state.full || '');
    const visibleStoppedRaw = stripChatArtifacts(stoppedRaw)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/gi, '')
      .trim();
    const hasPartial = hasVisibleAbortContent(abortedMessage, visibleStoppedRaw);
    if (abortedMessage && !hasPartial) {
      /* P_supersede-stable — removing the empty placeholder also removes
         the turn's viewport reserve, collapsing the scroll range on the
         send frame. Keep the entry as an invisible stub that still holds
         its reserve; the new turn's anchor glides past it and retires it
         off-screen (removeSupersededStub is the no-new-turn fallback). */
      preserveEmptyAbortStub(state, abortedMessage);
    }
    /* Finalize the partial text before publishing the aborted state. A
       complete scaffold becomes interactive; an open scaffold stays on
       the tolerant progressive renderer so already-streamed fields are
       not replaced by an empty fallback. */
    if (hasPartial && abortedMessage) {
      /* Task 4.1 — Resend affordance. After a user Stop, offer a
         Resend control on the stopped bubble that re-runs the send path
         from the most recent user message with a fresh turn (Req 2.6/2.7).
         Mirrors the recovered-stream `data-stream-retry` pattern: the
         button lives in the message HTML and clicks are delegated on the
         React-owned list. Reuses askChatTurn's AbortController/isUserAbort
         path — no new retry logic. */
      finalizeStoppedMessage(state, abortedMessage, stoppedRaw, visibleStoppedRaw);
    }
    /* Publish first, then remove only a throwaway shell on the next
       frame (a non-React node with our clientId, if one ever exists). */
    publishAbortedTurn(state);
  }
  return { abort };
}
