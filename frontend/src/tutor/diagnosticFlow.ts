/* tutor/diagnosticFlow.ts — extracted from main.js (B4 batch 1).
 * Diagnostic navigation + results + proceed-to-teaching.
 * Zero-behavior-change lift: cross-cluster callbacks (saveCurrentSession,
 * askNextQuestion, cancel/retry/
 * builtin handlers owned by startSession) are resolved via window.*
 * at call time to avoid circular imports with main.js.
 */
import {
  callBridge,
  dispatchKb,
  dispatchPatches,
  dispatchSession,
  examBridge,
  kbBridge,
  searchBridge,
  sessionBridge,
  uiBridge,
} from '../store/index.ts';
import { setDiagnosticCommandHandler } from '../react/tutor/diagnosticHost.tsx';
import type { DiagnosticCommand } from '../react/tutor/DiagnosticView.tsx';
import { applyDiagnosticResults } from '../chat/diagnosticResults.ts';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan } from '../chat/teachingPlan.ts';
import { renderDiagResultsScreen } from '../ui/diagnosticResults.ts';
import { renderDiagQuestion as renderDiagQuestionUI } from '../ui/diagnosticQuestion.ts';
import { activateMainView } from '../ui/mainViewController.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { askNextQuestion } from './socraticTurn.ts';
import { t } from '../i18n/index.ts';
import {
  cancelDiagnosticAction,
  retryDiagnosticAction,
  useBuiltinDiagnosticAction,
} from './diagnosticRegistry.ts';
import { getCurrentLanguage } from '../i18n/languageState.ts';

function _t(key: string, fallback?: string | null) {
  try {
    const v = t(key);
    if (v && v !== key) return v;
  } catch (error) {
    reportSwallow(error, 'tutor/diagnosticFlow.ts:23');
  }
  return fallback != null ? fallback : key;
}

function _isZh() {
  return getCurrentLanguage() === 'zh';
}

export function stateView() {
  return Object.assign(
    {},
    sessionBridge.getSnapshot(),
    kbBridge.getSnapshot(),
    searchBridge.getSnapshot(),
    callBridge.getSnapshot(),
    uiBridge.getSnapshot(),
    examBridge.getSnapshot(),
  );
}

export function renderDiagQuestion() {
  renderDiagQuestionUI(stateView(), (k: string) => _t(k, k));
}

export function skipDiagQuestion() {
  const skippedAnswers = sessionBridge.getSnapshot().diagAnswers.slice();
  skippedAnswers[sessionBridge.getSnapshot().diagIndex] = -1;
  dispatchSession({ type: 'session/set', key: 'diagAnswers', value: skippedAnswers });
  if (
    sessionBridge.getSnapshot().diagIndex <
    sessionBridge.getSnapshot().diagQuestions.length - 1
  ) {
    dispatchSession({
      type: 'session/set',
      key: 'diagIndex',
      value: sessionBridge.getSnapshot().diagIndex + 1,
    });
    renderDiagQuestion();
  } else {
    finishDiagnostic();
  }
}

export function selectDiag(idx: number) {
  const selectedAnswers = sessionBridge.getSnapshot().diagAnswers.slice();
  selectedAnswers[sessionBridge.getSnapshot().diagIndex] = idx;
  dispatchSession({ type: 'session/set', key: 'diagAnswers', value: selectedAnswers });
  renderDiagQuestion();
}

export function prevDiagQuestion() {
  if (sessionBridge.getSnapshot().diagIndex > 0) {
    dispatchSession({
      type: 'session/set',
      key: 'diagIndex',
      value: sessionBridge.getSnapshot().diagIndex - 1,
    });
    renderDiagQuestion();
  }
}

export function nextDiagQuestion() {
  if (sessionBridge.getSnapshot().diagAnswers[sessionBridge.getSnapshot().diagIndex] === undefined)
    return;
  dispatchSession({
    type: 'session/set',
    key: 'diagIndex',
    value: sessionBridge.getSnapshot().diagIndex + 1,
  });
  renderDiagQuestion();
}

export function finishDiagnostic() {
  if (sessionBridge.getSnapshot().diagAnswers[sessionBridge.getSnapshot().diagIndex] === undefined)
    return;
  dispatchKb({
    type: 'kb/set',
    key: 'kbNodes',
    value: applyDiagnosticResults(stateView()),
  });
  renderDiagResultsScreen(stateView(), _isZh(), { status: 'loading' });
  void loadDiagnosticInsight();
}

/* RN-6 — the gap reasons and the next step are written by the model from
   the learner's answers; the screen shows its computed copy until they land
   (or if they never do). Only applies while this results screen is up. */
async function loadDiagnosticInsight() {
  const sessionId = sessionBridge.getSnapshot().currentSessionId;
  const { generateDiagnosticInsight } = await import('./diagnosticInsight.ts');
  const insight = await generateDiagnosticInsight();
  if (
    sessionBridge.getSnapshot().currentSessionId !== sessionId ||
    sessionBridge.getSnapshot().phase !== 'diagnostic'
  )
    return;
  renderDiagResultsScreen(
    stateView(),
    _isZh(),
    insight
      ? {
          status: 'ready',
          summary: insight.summary,
          nextStep: insight.nextStep,
          reasons: insight.reasons,
        }
      : { status: 'none' },
  );
}

/* P_test-interpretation — proceed from the results screen to the actual
   teaching phase. Separated from finishDiagnostic so the user has a
   moment to read the interpretation before teaching begins. */
export function proceedToTeaching() {
  if (sessionBridge.getSnapshot().phase !== 'diagnostic') return;
  activateMainView('chatView', document);
  /* P_teaching-plan — generate the structured teaching plan from the
     freshly-populated KB. Sub-topics are sorted so blank nodes come
     first (teach the gaps), then fuzzy nodes, with all nodes taught
     from basics regardless of diagnostic result. */
  dispatchSession({
    type: 'session/set',
    key: 'teachingPlan',
    value: buildTeachingPlanFromKB(stateView()),
  });
  const teachingPlanSync = syncCurrentNodeFromTeachingPlan(stateView());
  if (teachingPlanSync) {
    dispatchPatches({
      session: { teachingPlan: teachingPlanSync.teachingPlan },
      kb: { currentNode: teachingPlanSync.currentNode },
    });
  }
  /* Task 2.1 — start the new session at the motivate stage. */
  dispatchPatches({
    session: {
      teachingStage: 'motivate',
      currentExampleIdx: 0,
      practiceAttempts: 0,
      phase: 'chat',
    },
  });
  /* AUDIT-R5 — diagnostic is over; the session now lives in the chat
     view, so persist phase="chat" (loadSession also uses this as the
     signal that the conversation is resumable). */
  try {
    saveCurrentSession();
  } catch (error) {
    reportSwallow(error, 'tutor/diagnosticFlow.ts:109');
  }

  /* First Socratic question */
  const sessionId = sessionBridge.getSnapshot().currentSessionId;
  setTimeout(function () {
    if (
      sessionBridge.getSnapshot().currentSessionId !== sessionId ||
      sessionBridge.getSnapshot().phase !== 'chat'
    )
      return;
    try {
      askNextQuestion();
    } catch (error) {
      reportSwallow(error, 'tutor/diagnosticFlow.ts:115');
    }
  }, 400);
}

export function handleDiagnosticCommand(command: DiagnosticCommand, index?: number) {
  if (command === 'cancel') {
    cancelDiagnosticAction();
  } else if (command === 'retry') {
    retryDiagnosticAction();
  } else if (command === 'builtin') {
    useBuiltinDiagnosticAction();
  } else if (command === 'select' && typeof index === 'number') selectDiag(index);
  else if (command === 'previous') prevDiagQuestion();
  else if (command === 'next') nextDiagQuestion();
  else if (command === 'skip') skipDiagQuestion();
  else if (command === 'finish') finishDiagnostic();
  else if (command === 'proceed') proceedToTeaching();
}

export function installDiagnosticFlowActions() {
  setDiagnosticCommandHandler(handleDiagnosticCommand);
}
