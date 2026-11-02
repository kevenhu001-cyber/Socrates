/**
 * RN-4 — the selected learning mode and what choosing one does in the web
 * shell. The five modes map onto capabilities that already exist; none of
 * them changes a prompt in prompts/ or on the server:
 *
 *   think     the question chain under each tutor reply (socraticMastery);
 *   recall    a guiding request for flashcards — the tutor prompt already
 *             allows <flashcard> scaffolds (RN-3 FlashcardCard);
 *   connect   the knowledge map side panel (built per tutor session);
 *   diagnose  the diagnostic that every new tutor session runs first, or a
 *             guiding request inside a session;
 *   mistakes  the mistake book side panel; unresolved mistakes become the
 *             chain's next questions and open the existing redo flow.
 *
 * Every mode lives in Tutor mode, so choosing one from Chat switches modes
 * through the existing toggle (the header Chat / Tutor switch is unchanged).
 */
import {
  DEFAULT_LEARNING_MODE,
  isLearningModeId,
  learningModeAction,
  type LearningModeId,
} from '@socrates/ui/think-model';
import { focusComposer, getComposerMarkdown, setComposerMarkdown, type ComposerSurface } from '../composer/controller.ts';
import { setSidebarPanelView } from '../sidebar/sidebar.store.ts';
import { getAppMode } from '../config/providers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

const STORAGE_KEY = 'socrates-learning-mode';

function readStored(): LearningModeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLearningModeId(value) ? value : DEFAULT_LEARNING_MODE;
  } catch (_) {
    return DEFAULT_LEARNING_MODE;
  }
}

let current: LearningModeId = readStored();
const listeners = new Set<() => void>();

export function getLearningMode(): LearningModeId {
  return current;
}

export function subscribeLearningMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLearningMode(id: LearningModeId): void {
  if (id === current) return;
  current = id;
  try { localStorage.setItem(STORAGE_KEY, id); }
  catch (error) { reportSwallow(error, 'tutor/learningMode.persist'); }
  listeners.forEach((listener) => listener());
}

function translate(key: string): string {
  const t = (window as unknown as { t?: (k: string) => string }).t;
  const value = typeof t === 'function' ? t(key) : '';
  return value && value !== key ? value : '';
}

/** Put a guiding request in the composer, after any draft, without sending it. */
function prefill(surface: ComposerSurface, promptKey: string): void {
  const prompt = translate(promptKey);
  if (!prompt) return;
  const draft = getComposerMarkdown(surface).trimEnd();
  if (draft.endsWith(prompt)) {
    focusComposer(surface);
    return;
  }
  setComposerMarkdown(surface, draft ? `${draft}\n\n${prompt}` : prompt);
  focusComposer(surface);
}

/** Show a tutor side panel, opening the sidebar first when it is collapsed. */
async function openTutorPanel(panel: 'knowledge' | 'mistakes'): Promise<void> {
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
    if (action.kind === 'prompt') prefill(composer, action.promptKey);
    else if (action.kind === 'panel') await openTutorPanel(action.panel);
    else focusComposer(composer);
  } catch (error) {
    reportSwallow(error, 'tutor/learningMode.choose');
  }
}
