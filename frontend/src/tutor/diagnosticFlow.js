/* tutor/diagnosticFlow.js — extracted from main.js (B4 batch 1).
 * Diagnostic navigation + results + proceed-to-teaching.
 * Zero-behavior-change lift: cross-cluster callbacks (updateKB,
 * updateChatStats, saveCurrentSession, askNextQuestion, cancel/retry/
 * builtin handlers owned by startSession) are resolved via window.*
 * at call time to avoid circular imports with main.js.
 */
import { stateStore } from '../state/store.js';
import { applyDiagnosticResults } from '../chat/diagnosticResults.js';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan } from '../chat/teachingPlan.js';
import { renderDiagResultsScreen } from '../ui/diagnosticResults.js';
import { renderDiagQuestion as renderDiagQuestionUI } from '../ui/diagnosticQuestion.js';
import { formatMsg } from '../render/markdown.js';
import { toggleChatTopBarEls } from '../ui/share.js';
import { updateChatStats } from '../chat/stats.js';
import { updateKB } from '../ui/knowledgePanel.js';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback != null ? fallback : key;
}

function _isZh() {
  try {
    if (typeof window !== 'undefined' && window._currentLang === 'zh') return true;
  } catch (_) {}
  return false;
}

export function stateView() {
  var snapshot = stateStore.getSnapshot();
  return Object.assign({}, snapshot.session, snapshot.kb, snapshot.search, snapshot.call, snapshot.ui, snapshot.exam);
}

export function renderDiagQuestion() {
  var tFn = (typeof window !== 'undefined' && typeof window.t === 'function') ? window.t : function (k) { return _t(k, k); };
  renderDiagQuestionUI(stateView(), tFn, formatMsg);
}

export function skipDiagQuestion() {
  var skippedAnswers = stateStore.read('diagAnswers').slice();
  skippedAnswers[stateStore.read('diagIndex')] = -1;
  stateStore.dispatch({ type: 'state/set', key: 'diagAnswers', value: skippedAnswers });
  if (stateStore.read('diagIndex') < stateStore.read('diagQuestions').length - 1) {
    stateStore.dispatch({ type: 'state/set', key: 'diagIndex', value: stateStore.read('diagIndex') + 1 });
    renderDiagQuestion();
  } else {
    finishDiagnostic();
  }
}

export function selectDiag(idx) {
  var selectedAnswers = stateStore.read('diagAnswers').slice();
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
  document.getElementById('diagnosticView').classList.add('hidden');
  document.getElementById('chatView').classList.remove('hidden');
  toggleChatTopBarEls(true);
  try { updateKB(); } catch (_) {}
  try { updateChatStats(); } catch (_) {}

  /* P_teaching-plan — generate the structured teaching plan from the
     freshly-populated KB. Sub-topics are sorted so blank nodes come
     first (teach the gaps), then fuzzy nodes, with all nodes taught
     from basics regardless of diagnostic result. */
  stateStore.dispatch({ type: 'state/set', key: 'teachingPlan', value: buildTeachingPlanFromKB(stateView()) });
  var teachingPlanSync = syncCurrentNodeFromTeachingPlan(stateView());
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
  try { if (typeof window.saveCurrentSession === 'function') window.saveCurrentSession(); } catch (_) {}

  /* First Socratic question */
  setTimeout(function () {
    try {
      if (typeof window.askNextQuestion === 'function') window.askNextQuestion();
    } catch (_) {}
  }, 400);
}

export function handleDiagnosticCommand(command, button) {
  if (command === 'cancel') {
    if (typeof window.cancelDiagnostic === 'function') window.cancelDiagnostic();
  } else if (command === 'retry') {
    if (typeof window.retryDiagnostic === 'function') window.retryDiagnostic();
  } else if (command === 'builtin') {
    if (typeof window.useBuiltinDiagnostic === 'function') window.useBuiltinDiagnostic();
  } else if (command === 'select') selectDiag(Number(button.getAttribute('data-diag-index')));
  else if (command === 'previous') prevDiagQuestion();
  else if (command === 'next') nextDiagQuestion();
  else if (command === 'skip') skipDiagQuestion();
  else if (command === 'finish') finishDiagnostic();
  else if (command === 'proceed') proceedToTeaching();
}

export function installDiagnosticFlowListeners() {
  var diagnosticView = document.getElementById('diagnosticView');
  if (diagnosticView) diagnosticView.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-diag-command]');
    if (!button || !diagnosticView.contains(button)) return;
    var command = button.getAttribute('data-diag-command');
    handleDiagnosticCommand(command, button);
  });
}
