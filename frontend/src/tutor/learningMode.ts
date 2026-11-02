/**
 * RN-4 / RN-6 — what choosing a learning mode does in the web shell.
 *
 * The mode itself is state (learningModeState.ts) that rides on every tutor
 * turn as `learningMode`; the server-owned prompt for that mode decides what
 * the model writes. Choosing a mode never pre-fills fixed copy. Inside a
 * session some modes also act at once:
 *
 *   think     focus the composer; the question chain under each reply
 *             carries the model's own next questions;
 *   recall    run one tutor turn in recall mode (3–5 AI-written flashcards);
 *   connect   open the knowledge map and ask the model to add or update its
 *             definitions and "why connected" links for this conversation;
 *   diagnose  run a fresh formal diagnostic (questions, results and the
 *             AI-written gap reasons and next step);
 *   mistakes  open the mistake book; unresolved mistakes become the chain's
 *             next questions.
 *
 * On the landing page there is no session yet: the choice is remembered and
 * shapes the session that the next topic starts.
 *
 * Every mode lives in Tutor mode, so choosing one from Chat switches modes
 * through the existing toggle (the header Chat / Tutor switch is unchanged).
 */
import { learningModeAction, type LearningModeId } from '@socrates/ui/think-model';
import { setLearningMode } from './learningModeState.ts';
import { focusComposer, type ComposerSurface } from '../composer/controller.ts';
import { setSidebarPanelView } from '../sidebar/sidebar.store.ts';
import { getAppMode } from '../config/providers.ts';
import { stateStore } from '../state/store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

export { getLearningMode, setLearningMode, subscribeLearningMode } from './learningModeState.ts';

/** Show a tutor side panel, opening the sidebar first when it is collapsed. */
export async function openTutorPanel(panel: 'knowledge' | 'mistakes'): Promise<void> {
  setSidebarPanelView(panel);
  const sidebar = document.getElementById('sidebar');
  if (sidebar?.classList.contains('collapsed')) {
    const { toggleSidebar } = await import('../sidebar/sidebar.service.ts');
    toggleSidebar();
  }
}

async function ensureTutorMode(): Promise<boolean> {
  if (getAppMode() === 'tutor') return true;
  const { toggleAppMode } = await import('../app/lifecycle/mode.ts');
  await toggleAppMode('tutor');
  return getAppMode() === 'tutor';
}

/** A tutor session with a lesson in progress (not the landing page, not mid-diagnostic). */
function inLesson(): boolean {
  return !!stateStore.read('currentSessionId') && stateStore.read('phase') === 'chat'
    && Array.isArray(stateStore.read('kbNodes')) && stateStore.read('kbNodes').length > 0;
}

/**
 * Select a mode and run its entry action. `surface` is where the control
 * sits: `home` (landing composer) or `session` (conversation composer).
 */
export async function chooseLearningMode(id: LearningModeId, surface: 'home' | 'session'): Promise<void> {
  if (!await ensureTutorMode()) return;
  setLearningMode(id);
  const action = learningModeAction(id, surface);
  const composer: ComposerSurface = surface === 'home' ? 'topic' : 'chat';
  try {
    if (action.kind === 'panel') {
      await openTutorPanel(action.panel);
      if (action.refresh === 'concepts' && inLesson()) {
        const { refreshConceptMap } = await import('./conceptMap.ts');
        void refreshConceptMap('conversation');
      }
    } else if (action.kind === 'turn' && inLesson()) {
      const { runLearningModeTurn } = await import('./socraticTurn.ts');
      void runLearningModeTurn({ learningMode: id });
    } else if (action.kind === 'diagnostic' && inLesson()) {
      const { rerunDiagnostic } = await import('./diagnosticRerun.ts');
      void rerunDiagnostic();
    } else {
      focusComposer(composer);
    }
  } catch (error) {
    reportSwallow(error, 'tutor/learningMode.choose');
  }
}
