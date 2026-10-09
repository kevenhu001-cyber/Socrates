/* Finish, persist, publish, and release one streaming turn. */
import { stateStore } from '../../state/store.js';
import { turnState } from '../turnState.js';
import { setChatStopState, markTurnEnded } from '../turnUi.js';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';
import { announceTranscript } from '../../ui/liveRegion.js';
import { saveCurrentSession } from '../../session/persistence.js';
import { updateChatStats } from '../stats.js';
import { appendLocalMemory } from '../../storage/localMemory.js';
import { esc } from '../../render/helpers.js';
import { stripChatArtifacts } from '../../util/stripChatArtifacts.js';
import { reportSwallow } from '../../util/reportSwallow.ts';

export function createFinishLifecycle(state, ownerSessionId, finishRender, finishViewport) {
  function finish() {
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

    const player = state._streamScheduler;
    if (state._smooth && player.playedLen() < player.totalLen()) {
      state._finishContinuation = finishBody;
      player.beginDrain();
      return;
    }
    player.flushNow();
    finishBody();
  }

  function finishBody() {
    if (state.finished) return;
    state.finished = true;
    state._disposed = true;
    state._publishThinkingPanelEnd();
    state.toolRuntime.dispose();
    if (state._elapsedTick) clearInterval(state._elapsedTick);
    state.cancelScheduledRender();

    let renderResult;
    try {
      renderResult = finishRender.run();
    } catch {
      console.log('[finish] render error');
      const fallbackHtml = '<p>' + esc(stripChatArtifacts(state.full)
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/gi, '')) + '</p>';
      const current = stateStore.read('messages')[state.msgIdx];
      const toolRunRev = (current && current._toolRunRev) || 0;
      state.patchOwnedMessage({
        html: fallbackHtml,
        rawText: state.full,
        type: 'assistant',
        reasoningContent: state.fullReasoning || null,
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

  function finishAfterRender(renderResult) {
    try { appendLocalMemory('assistant', state.full); }
    catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.appendLocalMemory'); }

    const visibleFinal = renderResult ? renderResult.visibleFinal : null;
    try {
      if (typeof visibleFinal === 'string' && visibleFinal.trim()) {
        announceTranscript(visibleFinal);
      }
    } catch (error) { reportSwallow(error, 'streamingTurn.finishAfterRender.announceTranscript'); }

    if (stateStore.read('phase') === 'chat'
      || (stateStore.read('topic') && stateStore.read('kbNodes').length)) {
      saveCurrentSession();
    }
    updateChatStats();

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

    finishViewport.capture();
    finishViewport.settle();
  }

  return { finish };
}
