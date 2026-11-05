/**
 * RN-6 — "Find gaps" inside a session runs a fresh formal diagnostic: new
 * AI questions on the session topic, the same results screen (now with the
 * AI-written gap reasons and next step), and "Start" re-plans the lesson
 * from the updated map. Cancelling returns to the conversation untouched;
 * unlike the cold-start diagnostic it never deletes the session.
 */
import { stateStore } from '../state/store.ts';
import { activateMainView } from '../ui/mainViewController.ts';
import { clearDiagnosticScreen, showDiagnosticError, showDiagnosticLoading, updateDiagnosticProgress } from '../ui/diagnosticScreen.ts';
import { registerDiagnosticActions } from './diagnosticRegistry.ts';
import { renderDiagQuestion } from './diagnosticFlow.ts';
import { buildFallbackDiagnosticQuestions } from './policy.ts';
import { getCurrentLanguage } from '../i18n/languageState.ts';
import { t } from '../i18n.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

const RERUN_QUESTION_COUNT = 5;

function translate(key: string, fallback: string): string {
  const value = t(key);
  return value && value !== key ? value : fallback;
}

let runToken = 0;

function backToLesson(): void {
  runToken += 1;
  stateStore.dispatch({ type: 'state/batch', patch: { phase: 'chat', diagQuestions: [], diagAnswers: [], diagIndex: 0 } });
  clearDiagnosticScreen();
  activateMainView('chatView', document);
}

async function generate(token: number, sessionId: unknown, topic: string): Promise<void> {
  stateStore.dispatch({ type: 'state/batch', patch: { diagIndex: 0, diagAnswers: [], lastCallError: null } });
  showDiagnosticLoading();
  updateDiagnosticProgress(20, translate('chat.generatingQuestions', 'Generating questions…'));
  const stale = () => token !== runToken || stateStore.read('currentSessionId') !== sessionId || stateStore.read('phase') !== 'diagnostic';
  let questions: unknown[] | null = null;
  try {
    const { generateDiagnosticQuestions } = await import('../chat/diagnosticGenerator.ts');
    questions = await generateDiagnosticQuestions(
      topic,
      getCurrentLanguage(),
      (step, total, question) => {
        if (stale()) return;
        const label = translate(question ? 'chat.generatedQ' : 'chat.generatingQ', '{n}/{total}');
        updateDiagnosticProgress(20 + Math.round(75 * step / total), label.replace('{n}', String(step)).replace('{total}', String(total)));
      },
      stale,
      RERUN_QUESTION_COUNT,
    );
  } catch (error) {
    reportSwallow(error, 'tutor/diagnosticRerun.generate');
  }
  if (stale()) return;
  if (questions && questions.length) {
    stateStore.dispatch({ type: 'state/set', key: 'diagQuestions', value: questions });
    updateDiagnosticProgress(100, translate('diag.ready', 'Ready'));
    renderDiagQuestion();
    return;
  }
  showDiagnosticError(String(stateStore.read('lastCallError') || ''));
}

export async function rerunDiagnostic(): Promise<void> {
  const sessionId = stateStore.read('currentSessionId');
  const topic = String(stateStore.read('domain') || stateStore.read('topic') || '').trim();
  if (!sessionId || !topic || stateStore.read('phase') !== 'chat') return;
  const token = ++runToken;
  stateStore.dispatch({ type: 'state/batch', patch: { phase: 'diagnostic', diagCancel: false, diagQuestions: [], diagAnswers: [], diagIndex: 0 } });
  activateMainView('diagnosticView', document);
  registerDiagnosticActions({
    cancel: backToLesson,
    retry: () => { void generate(++runToken, sessionId, topic); },
    builtin: () => {
      if (stateStore.read('phase') !== 'diagnostic') return;
      stateStore.dispatch({ type: 'state/batch', patch: {
        diagIndex: 0,
        diagAnswers: [],
        diagQuestions: buildFallbackDiagnosticQuestions(topic, RERUN_QUESTION_COUNT, getCurrentLanguage() === 'zh'),
      } });
      renderDiagQuestion();
    },
  });
  await generate(token, sessionId, topic);
}
