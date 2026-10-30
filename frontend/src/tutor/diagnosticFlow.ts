/* tutor/diagnosticFlow.ts — extracted from main.js (B4 batch 1).
 * Diagnostic navigation + results + proceed-to-teaching.
 * Zero-behavior-change lift: cross-cluster callbacks (updateKB,
 * saveCurrentSession, askNextQuestion, cancel/retry/
 * builtin handlers owned by startSession) are resolved via window.*
 * at call time to avoid circular imports with main.js.
 */
import { stateStore } from '../state/store.ts';
import { applyDiagnosticResults } from '../chat/diagnosticResults.ts';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan } from '../chat/teachingPlan.ts';
import { renderDiagResultsScreen } from '../ui/diagnosticResults.ts';
import { renderDiagQuestion as renderDiagQuestionUI } from '../ui/diagnosticQuestion.ts';
import { formatMsg } from '../render/markdown.ts';
import { updateKB } from '../ui/knowledgePanel.ts';
import { activateMainView } from '../ui/mainViewController.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function _t(key: string, fallback?: string | null) {
  try {
    if (typeof window !== 'undefined' && typeof browserWindow.t === 'function') {
      const v = browserWindow.t(key);
      if (v && v !== key) return v;
    }
  } catch (error) { reportSwallow(error, 'tutor/diagnosticFlow.ts:23'); }
  return fallback != null ? fallback : key;
}

function _isZh() {
  try {
    if (typeof window !== 'undefined' && browserWindow._currentLang === 'zh') return true;
  } catch (error) { reportSwallow(error, 'tutor/diagnosticFlow.ts:30'); }
  return false;
}

export function stateView() {
  const snapshot = stateStore.getSnapshot();
  return Object.assign({}, snapshot.session, snapshot.kb, snapshot.search, snapshot.call, snapshot.ui, snapshot.exam);
}

export function renderDiagQuestion() {
  const tFn = (typeof window !== 'undefined' && typeof browserWindow.t === 'function') ? browserWindow.t : function (k: any) { return _t(k, k); };
  renderDiagQuestionUI(stateView(), tFn, formatMsg);
}

export function skipDiagQuestion() {
  const skippedAnswers = stateStore.read('diagAnswers').slice();
  skippedAnswers[stateStore.read('diagIndex')] = -1;
  stateStore.dispatch({ type: 'state/set', key: 'diagAnswers', value: skippedAnswers });
  if (stateStore.read('diagIndex') < stateStore.read('diagQuestions').length - 1) {
    stateStore.dispatch({ type: 'state/set', key: 'diagIndex', value: stateStore.read('diagIndex') + 1 });
    renderDiagQuestion();
  } else {
    finishDiagnostic();
  }
}

export function selectDiag(idx: number) {
  const selectedAnswers = stateStore.read('diagAnswers').slice();
  selectedAnswers[stateStore.read('diagIndex')] = idx;
  stateStore.dispatch({ type: 'state/set', key: 'diagAnswers', value: selectedAnswers });
  renderDiagQuestion();
}

export function prevDiagQuestion() {
  if (stateStore.read('diagIndex') > 0) {
    stateStore.dispatch({ type: 'state/set', key: 'diagIndex', value: stateStore.read('diagIndex') - 1 });
    renderDiagQuestion();
  }
}

export function nextDiagQuestion() {
  if (stateStore.read('diagAnswers')[stateStore.read('diagIndex')] === undefined) return;
  stateStore.dispatch({ type: 'state/set', key: 'diagIndex', value: stateStore.read('diagIndex') + 1 });
  renderDiagQuestion();
}

export function finishDiagnostic() {
  if (stateStore.read('diagAnswers')[stateStore.read('diagIndex')] === undefined) return;
  stateStore.dispatch({
    type: 'state/set', key: 'kbNodes', value: applyDiagnosticResults(stateView())
  });
  renderDiagResultsScreen(stateView(), _isZh());
}

/* P_test-interpretation — proceed from the results screen to the actual
   teaching phase. Separated from finishDiagnostic so the user has a
   moment to read the interpretation before teaching begins. */
export function proceedToTeaching() {
  if (stateStore.read('phase') !== 'diagnostic') return;
  activateMainView('chatView', document);
  try { updateKB(); } catch (error) { reportSwallow(error, 'tutor/diagnosticFlow.ts:89'); }

  /* P_teaching-plan — generate the structured teaching plan from the
     freshly-populated KB. Sub-topics are sorted so blank nodes come
     first (teach the gaps), then fuzzy nodes, with all nodes taught
     from basics regardless of diagnostic result. */
  stateStore.dispatch({ type: 'state/set', key: 'teachingPlan', value: buildTeachingPlanFromKB(stateView()) });
  const teachingPlanSync = syncCurrentNodeFromTeachingPlan(stateView());
  if (teachingPlanSync) {
    stateStore.dispatch({ type: 'state/batch', patch: teachingPlanSync });
  }
  /* Task 2.1 — start the new session at the motivate stage. */
  stateStore.dispatch({
    type: 'state/batch', patch: {
      teachingStage: 'motivate', currentExampleIdx: 0, practiceAttempts: 0, phase: 'chat'
    }
  });
  /* AUDIT-R5 — diagnostic is over; the session now lives in the chat
     view, so persist phase="chat" (loadSession also uses this as the
     signal that the conversation is resumable). */
  try { if (typeof browserWindow.saveCurrentSession === 'function') browserWindow.saveCurrentSession(); } catch (error) { reportSwallow(error, 'tutor/diagnosticFlow.ts:109'); }

  /* First Socratic question */
  const sessionId = stateStore.read('currentSessionId');
  setTimeout(function () {
    if (stateStore.read('currentSessionId') !== sessionId || stateStore.read('phase') !== 'chat') return;
    try {
      if (typeof browserWindow.askNextQuestion === 'function') browserWindow.askNextQuestion();
    } catch (error) { reportSwallow(error, 'tutor/diagnosticFlow.ts:115'); }
  }, 400);
}

export function handleDiagnosticCommand(command: string, button: { getAttribute: (arg0: string) => any; }) {
  if (command === 'cancel') {
    if (typeof browserWindow.cancelDiagnostic === 'function') browserWindow.cancelDiagnostic();
  } else if (command === 'retry') {
    if (typeof browserWindow.retryDiagnostic === 'function') browserWindow.retryDiagnostic();
  } else if (command === 'builtin') {
    if (typeof browserWindow.useBuiltinDiagnostic === 'function') browserWindow.useBuiltinDiagnostic();
  } else if (command === 'select') selectDiag(Number(button.getAttribute('data-diag-index')));
  else if (command === 'previous') prevDiagQuestion();
  else if (command === 'next') nextDiagQuestion();
  else if (command === 'skip') skipDiagQuestion();
  else if (command === 'finish') finishDiagnostic();
  else if (command === 'proceed') proceedToTeaching();
}

export function installDiagnosticFlowListeners() {
  const diagnosticView = document.getElementById('diagnosticView');
  if (diagnosticView) diagnosticView.addEventListener('click', function (event) {
    const button = (event.target as Element)!.closest && (event.target as Element)!.closest('[data-diag-command]');
    if (!button || !diagnosticView.contains(button)) return;
    const command = button.getAttribute('data-diag-command');
    handleDiagnosticCommand(command!, button);
  });
}
