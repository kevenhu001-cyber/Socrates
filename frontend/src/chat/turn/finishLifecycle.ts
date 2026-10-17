/* Finish, persist, publish, and release one streaming turn. */
import { stateStore } from '../../state/store.js';
import { turnState } from '../turnState.ts';
import { setChatStopState, markTurnEnded } from '../turnUi.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';
import { announceTranscript } from '../../ui/liveRegion.js';
import { saveCurrentSession } from '../../session/persistence.ts';
import { appendLocalMemory } from '../../storage/localMemory.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { readTurnMessage } from './runtimeState.ts';
import type { TurnRuntimeState } from './runtimeState.ts';
import type { FinishRender, FinishRenderResult } from './finishRender.ts';
import type { FinishViewport } from './finishViewport.ts';

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
    if (state._smooth && player && player.playedLen() < player.totalLen()) {
      state._finishContinuation = finishBody;
      player.beginDrain();
      return;
    }
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
    try { appendLocalMemory('assistant', state.full); }
    catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.appendLocalMemory'); }

    const visibleFinal = renderResult ? renderResult.visibleFinal : null;
    try {
      if (typeof visibleFinal === 'string' && visibleFinal.trim()) {
        announceTranscript(visibleFinal);
      }
    } catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.announceTranscript'); }

    const kbNodes = stateStore.read('kbNodes') as readonly unknown[];
    if (stateStore.read('phase') === 'chat'
      || (stateStore.read('topic') && kbNodes.length)) {
      saveCurrentSession();
    }

    /* An older turn must not clear the Stop control installed by a newer
       turn that started before this one finished unwinding. */
    if (turnState.activeChatCtl === state.ret) {
      turnState.chatStreaming = false;
      try { setChatStopState(false); }
      catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.setChatStopState'); }
      try { markTurnEnded(); }
      catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.markTurnEnded'); }
      turnState.activeChatCtl = null;
    }

    finishViewport.settle();
  }

  return { finish };
}
