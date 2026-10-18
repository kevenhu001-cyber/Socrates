/* session/loader.ts — lightweight session boundary.
 *
 * The full history/exam restore pipeline is intentionally behind a dynamic
 * import. New-chat/session bootstrap needs only resetSessionTransients() and
 * setCurrentSessionId(), so keeping the old all-in-one loader on the static
 * graph made ordinary cold boot pay for history restoration it might never
 * use.
 *
 * loader.impl.ts is an exact implementation copy of the previous loader. The
 * facade keeps public import paths stable while moving its heavy dependency
 * graph to first session restore/switch.
 */
import { stateStore } from '../state/store.js';
import { turnState } from '../chat/turnState.ts';
import { clearComposer } from '../composer/controller.ts';
import { updateComposerBtn } from '../ui/topicSetup.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import type {
  LoadedSession,
  ExamQuestion,
} from './loader.impl.ts';

export type { LoadedSession, ExamDataShape, ExamQuestion } from './loader.impl.ts';

type LoaderImpl = typeof import('./loader.impl.ts');

let _loaderImport: Promise<LoaderImpl> | null = null;
let _loaderModule: LoaderImpl | null = null;

function loadLoaderImpl(): Promise<LoaderImpl> {
  if (!_loaderImport) {
    _loaderImport = import('./loader.impl.ts').then(function (module) {
      _loaderModule = module;
      return module;
    });
    _loaderImport.catch(function (error) {
      _loaderImport = null;
      console.error('[session-loader] failed to load restore runtime', error);
    });
  }
  return _loaderImport;
}

function clearActiveTemplate(): void {
  try {
    if (typeof window !== 'undefined' && typeof window.clearActiveTemplate === 'function') {
      window.clearActiveTemplate();
    }
  } catch (error) {
    reportSwallow(error, 'session/loader.clearActiveTemplate');
  }
}

/* F2c — this is hot-path state cleanup used by both new-chat startup and
 * history switching. It stays synchronous and dependency-light; do not move
 * it behind the restore chunk. */
export function resetSessionTransients(): void {
  stateStore.dispatch({ type: 'state/batch', patch: {
    searchContext: null,
    searchResults: [],
    searchContextAt: 0,
    searchContextCount: 0,
    searchContextQuery: null,
    searchContextError: null,
    lastCallSource: null,
    lastCallError: null,
    sessionTitle: null,
  } });
  try { clearComposer('chat'); } catch (error) { reportSwallow(error, 'session/loader.resetSessionTransients'); }
  try { updateComposerBtn(); } catch (error) { reportSwallow(error, 'session/loader.resetSessionTransients~2'); }
  try { if (turnState.pendingChatContent !== undefined) turnState.pendingChatContent = null; }
  catch (error) { reportSwallow(error, 'session/loader.resetSessionTransients~3'); }
  try { if (turnState.pendingAttachments !== undefined) turnState.pendingAttachments = null; }
  catch (error) { reportSwallow(error, 'session/loader.resetSessionTransients~4'); }
  try { clearActiveTemplate(); }
  catch (error) { reportSwallow(error, 'session/loader.resetSessionTransients~5'); }
}

/* F2d — synchronous session-id mirror used while creating a fresh session.
 * The full restore runtime has the same invariant internally; keeping this
 * helper here prevents chat/sessionBootstrap from retaining that whole graph. */
export function setCurrentSessionId(id: string | null, silent?: boolean): void {
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: id });
  try { (window as Window & { _currentSessionId?: string | null })._currentSessionId = id; }
  catch (error) { reportSwallow(error, 'session/loader.setCurrentSessionId'); }
  if (!silent) publishReactChatRuntime({ type: 'state-synced', reason: 'session-id-changed' });
}

/** Full server-backed session restore; loaded only when actually requested. */
export function loadSession(id: string): Promise<void> {
  return loadLoaderImpl().then(function (module) { return module.loadSession(id); });
}

/** Exam-session restore shares the same deferred restore runtime. */
export function loadExamSession(session: LoadedSession): Promise<void> {
  return loadLoaderImpl().then(function (module) { return module.loadExamSession(session); });
}

/* Public compatibility export. Current first-party code reaches this through
 * loadSession(), but keep the old surface without pinning the implementation
 * into the static graph. */
export function paintRestoredQuestionCard(idx: number, question: ExamQuestion): void {
  if (_loaderModule) {
    _loaderModule.paintRestoredQuestionCard(idx, question);
    return;
  }
  void loadLoaderImpl()
    .then(function (module) { module.paintRestoredQuestionCard(idx, question); })
    .catch(function () { /* loader logs */ });
}

export function reattachPendingTurn(sessionId: string): Promise<void> {
  return loadLoaderImpl().then(function (module) { return module.reattachPendingTurn(sessionId); });
}
