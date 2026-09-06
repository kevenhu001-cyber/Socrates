/* app/widgetSetup.js — extracted from main.js (B6 batch).
 * Widget/mistake-book runtime wiring. Zero-behavior-change lift.
 * Called once from main.js at the original position to preserve eval order.
 */
import { stateStore } from '../state/store.js';
import { apiFetch } from '../util/api.js';
import { saveCurrentSession } from '../session/persistence.js';
import { mountQuizWidget, mountPracticeWidget, configureWidgetRuntime } from '../render/widgets.js';
import { scrollContainer } from '../ui/scroll.js';
import { createMistakeBook } from '../ui/mistakeBook.js';
import { formatMsg } from '../render/markdown.js';
import { handleQuizPick } from '../render/widgets.js';
import { shouldRequestTutorAfterQuiz } from '../tutor/policy.js';
import { updateKB } from '../ui/knowledgePanel.js';
import { updateChatStats } from '../chat/stats.js';
import { configureAssistantHtml } from '../render/assistantHtml.ts';
import { configureTurnAnchor } from '../chat/turnAnchor.ts';
import { isMsgListMounted } from '../react/message-list/MessageList.tsx';
import { submitChatMessage } from '../chat/sendPipeline.js';

var _installedBook = null;

export function getMistakeBookUI() {
  if (_installedBook) {
    return {
      updateMistakesBadge: _installedBook.updateMistakesBadge,
      renderMistakes: _installedBook.renderMistakes,
    };
  }
  return { updateMistakesBadge: null, renderMistakes: null };
}

export function installWidgetRuntime() {
  /* Legacy widget mounts removed: render/widgets.js owns mounting via scheduleWidgetMounts. */
  /* P_main-split - Wave 2: mistake-book runtime extracted. */
  var mistakeBook = createMistakeBook({
    stateStore: stateStore,
    apiFetch: apiFetch,
    saveCurrentSession: saveCurrentSession,
    mountQuizWidget: mountQuizWidget,
    mountPracticeWidget: mountPracticeWidget,
    scrollContainer: scrollContainer,
    getTutorSocratic: function () { return window.tutorSocratic; },
  });
  var recordMistake = mistakeBook.recordMistake;
  var removeMistakeForQuizSlot = mistakeBook.removeMistakeForQuizSlot;
  /* Note: updateMistakesBadge/renderMistakes from the mistake book are
     bridged to window by main.js (window.updateMistakesBadge etc.);
     installWidgetRuntime only wires the runtimes. */
  configureWidgetRuntime({
    formatMsg: formatMsg,
    t: window.t,
    submitChatMessage: submitChatMessage,
    stateStore: stateStore,
    recordMistake: recordMistake,
    removeMistakeForQuizSlot: removeMistakeForQuizSlot,
    handleQuizPick: handleQuizPick,
    shouldRequestTutorAfterQuiz: shouldRequestTutorAfterQuiz,
    updateKB: updateKB,
    updateChatStats: updateChatStats,
    saveCurrentSession: saveCurrentSession,
  });
  configureAssistantHtml({
    recordMistake: recordMistake,
  });
  configureTurnAnchor({
    isMsgListMounted: isMsgListMounted,
  });
  _installedBook = mistakeBook;
  /* Bridge timing: installWidgetRuntime runs from main.js body (after all
     imports), so these window assignments land before any event handler
     or React gateway read. legacyBridge only re-exports the getter. */
  try {
    window.renderMistakes = mistakeBook.renderMistakes;
    window.updateMistakesBadge = mistakeBook.updateMistakesBadge;
  } catch (_) {}
  return mistakeBook;
}
