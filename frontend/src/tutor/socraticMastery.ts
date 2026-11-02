import { setComposerMarkdown } from '../composer/controller.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getAppMode } from '../config/providers.ts';
import type { ChainCandidate } from '@socrates/ui/think-model';
import { followQuestionChain, syncQuestionChain } from './questionChain.ts';
import { requestMistakeRedo } from '../ui/mistakeBookCommands.ts';
import { extractNextQuestions } from '@socrates/core/learningBlocks';

/* RN-7 — the tutor mode is read from the typed mode preference, never from
   a header button's class; the stage pill itself is rendered by the React
   top bar from the session store (react/topbar/TopBar.tsx). */
function isTutorSurface(): boolean {
  return document.documentElement.dataset.mainView === 'tutor' || getAppMode() === 'tutor';
}

export function syncSocraticMasteryUI(): void {
  if (!isTutorSurface()) clearSocraticSuggestions();
}

/**
 * Follow one question down the chain. Ask candidates go out as the next
 * turn through the normal send path; mistake candidates open the existing
 * mistake-book redo flow. Either way the question joins the chain.
 */
export function followChainCandidate(candidate: ChainCandidate): void {
  followQuestionChain(candidate.text);
  if (candidate.kind === 'mistake') {
    requestMistakeRedo(candidate.id.replace(/^mistake:/, ''));
    return;
  }
  void import('../chat/sendPipeline.ts').then(({ submitChatMessage }) => submitChatMessage(candidate.text))
    .catch((error) => {
      reportSwallow(error, 'tutor/socraticMastery:followChain');
      /* Sending failed to load: leave the question in the composer instead. */
      setComposerMarkdown('chat', candidate.text);
    });
}

/**
 * Show the question chain under the reply that just finished. The next
 * questions are the ones the model wrote for this reply (RN-6
 * `<next-questions>` block, parsed by the shared normalizer). A reply
 * without a usable block offers no ask questions: there is no fixed
 * fallback copy. The chain itself (and mistake candidates in the mistakes
 * mode) still shows.
 */
export function showSocraticSuggestions(replyText?: string | null): void {
  const isTutor = isTutorSurface();

  const container = document.getElementById('socraticSuggestions');
  if (!container || !isTutor) return;

  const parsed = extractNextQuestions(replyText ?? '');
  const prompts = parsed.status === 'ok' ? parsed.questions : [];
  syncQuestionChain();
  void import('../react/tutor/socraticSuggestionsHost').then(({ renderSocraticSuggestions }) => {
    if (!container.isConnected || container.classList.contains('hidden')) return;
    renderSocraticSuggestions(container, prompts, followChainCandidate);
  }).catch((error) => reportSwallow(error, 'tutor/socraticMastery:renderSuggestions'));

  container.classList.remove('hidden');
}

export function clearSocraticSuggestions(): void {
  const container = document.getElementById('socraticSuggestions');
  if (container) {
    container.classList.add('hidden');
    void import('../react/tutor/socraticSuggestionsHost').then(({ clearSocraticSuggestions }) => {
      clearSocraticSuggestions(container);
    }).catch((error) => reportSwallow(error, 'tutor/socraticMastery:clearSuggestions'));
  }
}
