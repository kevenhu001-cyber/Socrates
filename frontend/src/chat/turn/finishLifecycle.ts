/* Finish, persist, publish, and release one streaming turn. */
import { stateStore } from '../../state/store.ts';
import { turnState } from '../turnState.ts';
import { setChatStopState, markTurnEnded } from '../turnUi.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.ts';
import { announceTranscript } from '../../ui/liveRegion.js';
import { saveCurrentSessionAfterPaint } from '../../session/persistence.ts';
import { appendLocalMemory } from '../../storage/localMemory.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { dequeuePrompt } from '../promptQueue.ts';
import { readTurnMessage } from './runtimeState.ts';
import type { TurnRuntimeState } from './runtimeState.ts';
import type { FinishRender, FinishRenderResult } from './finishRender.ts';
import type { FinishViewport } from './finishViewport.ts';

interface BranchState {
  currentIndex: number;
  variants: Array<{
    rawText?: string;
    html?: string | null;
    reasoningContent?: string | null;
    toolCalls?: unknown;
    turnRuntime?: unknown;
  }>;
}

function updateActiveBranchVariant(state: TurnRuntimeState, visibleFinal: string | null): void {
  const current = readTurnMessage(state.msgIdx);
  const branch = current?.branchInfo as BranchState | undefined;
  if (!current || !branch || !Array.isArray(branch.variants)) return;
  const active = branch.variants[branch.currentIndex];
  if (!active) return;
  active.rawText = state.full;
  active.html = visibleFinal;
  active.reasoningContent = state.fullReasoning || null;
  active.toolCalls = current.toolCalls;
  active.turnRuntime = current.turnRuntime;
}

function releaseFinishedTurn(state: TurnRuntimeState): void {
  if (turnState.activeChatCtl !== state.ret) return;
  turnState.chatStreaming = false;
  try { setChatStopState(false); }
  catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.setChatStopState'); }
  try { markTurnEnded(); }
  catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.markTurnEnded'); }
  turnState.activeChatCtl = null;

  const currentSessionId = stateStore.read('currentSessionId') as string | null;
  const nextPrompt = dequeuePrompt(currentSessionId);
  if (!nextPrompt) return;
  setTimeout(() => {
    try {
      const win = window as Window & { submitChatMessage?: (text: string, options: { bypassQueue: boolean }) => unknown };
      if (typeof win.submitChatMessage === 'function') {
        void win.submitChatMessage(nextPrompt.text, { bypassQueue: true });
      }
    } catch (error) {
      reportSwallow(error, 'streamingTurn.finishAfterRender.drainPromptQueue');
    }
  }, 50);
}

/**
 * Run non-visual finish work once the settled frame has painted: one
 * animation frame, then a macrotask. A hidden tab gets no frames, so it runs
 * the work on the next macrotask; a fallback timer bounds a throttled rAF.
 */
function runAfterFinishPaint(work: () => void): void {
  let done = false;
  let fallback: ReturnType<typeof setTimeout> | null = null;
  const run = (): void => {
    if (done) return;
    done = true;
    if (fallback !== null) clearTimeout(fallback);
    work();
  };
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (hidden || typeof requestAnimationFrame !== 'function') {
    setTimeout(run, 0);
    return;
  }
  fallback = setTimeout(run, 250);
  requestAnimationFrame(() => { setTimeout(run, 0); });
}

export interface FinishLifecycle {
  finish(): void;
}

export function createFinishLifecycle(
  state: TurnRuntimeState,
  ownerSessionId: string | null,
  finishRender: FinishRender,
  finishViewport: FinishViewport,
): FinishLifecycle {
  function finish(): void {
    if (state._disposed) return;

    /* A late [DONE] can arrive after the session changes. Abandon it before
       saving, updating memory, or writing into a reused message index. */
    if (stateStore.read('currentSessionId') !== ownerSessionId || !state.ownsMessageSlot()) {
      state.finished = true;
      state._disposed = true;
      if (state._elapsedTick) clearInterval(state._elapsedTick);
      state.cancelScheduledRender();
      state.toolRuntime.dispose();
      publishReactChatRuntime({
        type: 'stream-aborted',
        messageId: state.clientId,
        textLength: state.full.length,
        reason: 'session-replaced',
      });
      return;
    }
    if (state.finished) return;

    const player = state._streamPlayer;
    // Upstream has finished: commit the full answer before releasing the turn.
    // Decorative playback must not delay persistence or the next queued prompt.
    if (player) player.flushNow();
    finishBody();
  }

  function finishBody(): void {
    if (state.finished) return;
    // Measure the painted turn before completion changes status or tool rows.
    finishViewport.capture();
    state.finished = true;
    state._disposed = true;
    state.toolRuntime.dispose();
    if (state._elapsedTick) clearInterval(state._elapsedTick);
    state.cancelScheduledRender();

    let renderResult: FinishRenderResult | undefined;
    try {
      renderResult = finishRender.run();
    } catch {
      console.log('[finish] render error');
      const current = readTurnMessage(state.msgIdx);
      const toolRunRev = (current && current._toolRunRev) || 0;
      state.patchOwnedMessage({
        html: null,
        rawText: state.full,
        type: 'assistant',
        reasoningContent: state.fullReasoning || null,
        _liveStatus: null,
        _streamSettled: true,
        _toolRunRev: toolRunRev + 1,
      });
    }

    finishAfterRender(renderResult);
    publishReactChatRuntime({
      type: 'stream-finished',
      messageId: state.clientId,
      textLength: state.full.length,
    });
  }

  function finishAfterRender(renderResult: FinishRenderResult | undefined): void {
    const visibleFinal = renderResult ? renderResult.visibleFinal : null;
    updateActiveBranchVariant(state, visibleFinal);

    /* P_stream-finish-paint — the settled snapshot reaches React as a
       microtask after this task, so any synchronous work left here delays
       the final frame and the finished answer visibly hangs for a beat.
       Bookkeeping that nothing on screen depends on (the local transcript
       mirror, the screen-reader announcement, the session save) runs right
       after that frame paints instead. */
    const full = state.full;
    const finishedSessionId = stateStore.read('currentSessionId') as string | null;
    runAfterFinishPaint(() => {
      if (stateStore.read('currentSessionId') !== finishedSessionId) return;
      try { appendLocalMemory('assistant', full); }
      catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.appendLocalMemory'); }
      try {
        if (typeof visibleFinal === 'string' && visibleFinal.trim()) {
          announceTranscript(visibleFinal);
        }
      } catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.announceTranscript'); }
    });

    const kbNodes = stateStore.read('kbNodes') as readonly unknown[];
    if (stateStore.read('phase') === 'chat'
      || (stateStore.read('topic') && kbNodes.length)) {
      saveCurrentSessionAfterPaint();
    }

    /* An older turn must not clear the Stop control installed by a newer
       turn that started before this one finished unwinding. */
    releaseFinishedTurn(state);

    finishViewport.settle();
  }

  return { finish };
}
