/* app/widgetSetup.ts — extracted from main.js (B6 batch).
 * Widget/mistake-book runtime wiring. Zero-behavior-change lift.
 * Called once from main.js at the original position to preserve eval order.
 */
import { stateStore } from '../state/store.ts';
import { apiFetch } from '../util/api.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { configureWidgetRuntimeEarly, handleQuizPick } from '../render/widgetScheduler.ts';
import { formatMsg } from '../render/markdown.ts';
import { shouldRequestTutorAfterQuiz } from '../tutor/policy.ts';
import { configureAssistantHtml } from '../render/assistantHtml.ts';
import { configureTurnAnchor } from '../chat/turnAnchor.ts';
import { isMsgListMounted } from '../ui/msgListMount.ts';
import { submitChatMessage } from '../chat/sendPipeline.ts';
import { registerMistakeRedoAction } from '../ui/mistakeBookCommands.ts';
import { t } from '../i18n.ts';
import { addAssistantUiMessage } from '../chat/messages.ts';
import { reportSwallow } from '../util/reportSwallow.ts';


type MistakeBook = ReturnType<typeof import('../ui/mistakeBook.ts')['createMistakeBook']>;
type MistakeRecord = Parameters<MistakeBook['recordMistake']>[0];
let _installedBook: MistakeBook | null = null;
let _bookLoad: Promise<MistakeBook> | null = null;
let _facadeInstalled = false;

/* RN-13 — the mistake book only acts after a wrong quiz answer, a removed
   quiz slot or a redo, never during first paint. Its module (persistence,
   redo flow, i18n tables) is fetched on the first such call; once loaded,
   every call runs synchronously as before. Calls made while the module is
   in flight are replayed in order on the same promise. */
function loadMistakeBook(): Promise<MistakeBook> {
  _bookLoad ??= import('../ui/mistakeBook.ts').then(({ createMistakeBook }) => {
    _installedBook = createMistakeBook({
      stateStore: stateStore,
      apiFetch: apiFetch,
      saveCurrentSession: saveCurrentSession,
      appendAssistantMessage: addAssistantUiMessage,
    });
    return _installedBook;
  }).catch((error: unknown) => {
    _bookLoad = null;
    throw error;
  });
  return _bookLoad;
}

function withMistakeBook(label: string, run: (book: MistakeBook) => void): void {
  if (_installedBook) { run(_installedBook); return; }
  loadMistakeBook().then(run).catch((error: unknown) => reportSwallow(error, label));
}

function recordMistake(record: MistakeRecord): void {
  withMistakeBook('widgetSetup.recordMistake', (book) => book.recordMistake(record));
}

function removeMistakeForQuizSlot(slotId: string): void {
  withMistakeBook('widgetSetup.removeMistakeForQuizSlot', (book) => book.removeMistakeForQuizSlot(slotId));
}

function redoMistake(mistakeId: string): void {
  withMistakeBook('widgetSetup.redoMistake', (book) => book.redoMistake(mistakeId));
}

export function getMistakeBookUI() {
  /* The facade exists from install time, so callers never see a missing
     recorder while the module is still loading. */
  return { recordMistake: _facadeInstalled ? recordMistake : null };
}

export function installWidgetRuntime() {
  /* Legacy widget mounts removed: render/widgets.ts owns mounting via scheduleWidgetMounts. */
  /* P_main-split - Wave 2: mistake-book runtime extracted. */
  configureWidgetRuntimeEarly({
    formatMsg: formatMsg,
    t: t,
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
  _facadeInstalled = true;
  registerMistakeRedoAction(redoMistake);
  return { recordMistake, removeMistakeForQuizSlot, redoMistake };
}
