/* app/widgetSetup.ts — extracted from main.js (B6 batch).
 * Widget/mistake-book runtime wiring. Zero-behavior-change lift.
 * Called once from main.js at the original position to preserve eval order.
 */
import { stateStore } from '../state/store.ts';
import { apiFetch } from '../util/api.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { configureWidgetRuntimeEarly, handleQuizPick } from '../render/widgetScheduler.ts';
import { createMistakeBook } from '../ui/mistakeBook.ts';
import { formatMsg } from '../render/markdown.ts';
import { shouldRequestTutorAfterQuiz } from '../tutor/policy.ts';
import { configureAssistantHtml } from '../render/assistantHtml.ts';
import { configureTurnAnchor } from '../chat/turnAnchor.ts';
import { isMsgListMounted } from '../ui/msgListMount.ts';
import { submitChatMessage } from '../chat/sendPipeline.ts';
import { registerMistakeRedoAction } from '../ui/mistakeBookCommands.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { addAssistantUiMessage } from '../chat/messages.ts';


type MistakeBook = ReturnType<typeof createMistakeBook>;
let _installedBook: MistakeBook | null = null;

export function getMistakeBookUI() {
  if (_installedBook) {
    return { recordMistake: _installedBook.recordMistake };
  }
  return { recordMistake: null };
}

export function installWidgetRuntime() {
  /* Legacy widget mounts removed: render/widgets.ts owns mounting via scheduleWidgetMounts. */
  /* P_main-split - Wave 2: mistake-book runtime extracted. */
  const mistakeBook = createMistakeBook({
    stateStore: stateStore,
    apiFetch: apiFetch,
    saveCurrentSession: saveCurrentSession,
    appendAssistantMessage: addAssistantUiMessage,
  });
  const recordMistake = mistakeBook.recordMistake;
  const removeMistakeForQuizSlot = mistakeBook.removeMistakeForQuizSlot;
  configureWidgetRuntimeEarly({
    formatMsg: formatMsg,
    t: browserWindow.t,
    submitChatMessage: submitChatMessage,
    stateStore: stateStore,
    recordMistake: recordMistake,
    removeMistakeForQuizSlot: removeMistakeForQuizSlot,
    handleQuizPick: handleQuizPick,
    shouldRequestTutorAfterQuiz: shouldRequestTutorAfterQuiz,
    saveCurrentSession: saveCurrentSession,
  });
  configureAssistantHtml({
    recordMistake: (record) => recordMistake({ ...record }),
  });
  configureTurnAnchor({
    isMsgListMounted: isMsgListMounted,
  });
  _installedBook = mistakeBook;
  registerMistakeRedoAction(mistakeBook.redoMistake);
  return mistakeBook;
}
