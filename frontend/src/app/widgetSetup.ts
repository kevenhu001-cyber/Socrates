/* app/widgetSetup.ts — extracted from main.js (B6 batch).
 * Widget/mistake-book runtime wiring. Zero-behavior-change lift.
 * Called once from main.js at the original position to preserve eval order.
 */
import { stateStore } from '../state/store.ts';
import { apiFetch } from '../util/api.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { mountQuizWidget, mountPracticeWidget, configureWidgetRuntimeEarly, handleQuizPick } from '../render/widgetScheduler.ts';
import { scrollContainer } from '../ui/scroll.ts';
import { createMistakeBook } from '../ui/mistakeBook.ts';
import { formatMsg } from '../render/markdown.ts';
import { shouldRequestTutorAfterQuiz } from '../tutor/policy.ts';
import { updateKB } from '../ui/knowledgePanel.ts';
import { configureAssistantHtml } from '../render/assistantHtml.ts';
import { configureTurnAnchor } from '../chat/turnAnchor.ts';
import { isMsgListMounted } from '../ui/msgListMount.ts';
import { submitChatMessage } from '../chat/sendPipeline.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


let _installedBook: { recordMistake: any; updateMistakesBadge: any; renderMistakes: any; removeMistakeForQuizSlot?: (slotId: any) => void; }|null = null;

export function getMistakeBookUI() {
  if (_installedBook) {
    return {
      recordMistake: _installedBook.recordMistake,
      updateMistakesBadge: _installedBook.updateMistakesBadge,
      renderMistakes: _installedBook.renderMistakes,
    };
  }
  return { recordMistake: null, updateMistakesBadge: null, renderMistakes: null };
}

export function installWidgetRuntime() {
  /* Legacy widget mounts removed: render/widgets.ts owns mounting via scheduleWidgetMounts. */
  /* P_main-split - Wave 2: mistake-book runtime extracted. */
  const mistakeBook = createMistakeBook({
    stateStore: stateStore,
    apiFetch: apiFetch,
    saveCurrentSession: saveCurrentSession,
    mountQuizWidget: mountQuizWidget,
    mountPracticeWidget: mountPracticeWidget,
    scrollContainer: scrollContainer,
    getTutorSocratic: function () { return browserWindow.tutorSocratic; },
  });
  const recordMistake = mistakeBook.recordMistake;
  const removeMistakeForQuizSlot = mistakeBook.removeMistakeForQuizSlot;
  /* Note: updateMistakesBadge/renderMistakes from the mistake book are
     bridged to window by main.js (window.updateMistakesBadge etc.);
     installWidgetRuntime only wires the runtimes. */
  configureWidgetRuntimeEarly({
    formatMsg: formatMsg,
    t: browserWindow.t,
    submitChatMessage: submitChatMessage,
    stateStore: stateStore,
    recordMistake: recordMistake,
    removeMistakeForQuizSlot: removeMistakeForQuizSlot,
    handleQuizPick: handleQuizPick,
    shouldRequestTutorAfterQuiz: shouldRequestTutorAfterQuiz,
    updateKB: updateKB,
    saveCurrentSession: saveCurrentSession,
  });
  configureAssistantHtml({
    recordMistake: (record) => recordMistake({ ...record }),
  });
  configureTurnAnchor({
    isMsgListMounted: isMsgListMounted,
  });
  _installedBook = mistakeBook;
  /* Bridge timing: installWidgetRuntime runs from main.js body (after all
     imports), so these window assignments land before any event handler
     or React gateway read. legacyBridge only re-exports the getter. */
  try {
    browserWindow.renderMistakes = mistakeBook.renderMistakes;
    browserWindow.updateMistakesBadge = mistakeBook.updateMistakesBadge;
  } catch (_) { /* empty-catch: intentional — window assignment in headless environments */ }
  return mistakeBook;
}
