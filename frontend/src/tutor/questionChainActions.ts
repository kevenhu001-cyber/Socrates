import { setComposerMarkdown } from '../composer/controller.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import type { ChainCandidate } from '@socrates/ui/think-model';
import { followQuestionChain } from './questionChain.ts';
import { requestMistakeRedo } from '../ui/mistakeBookCommands.ts';

/** Follow a suggested question or turn an unresolved mistake into a redo. */
export function followChainCandidate(candidate: ChainCandidate): void {
  followQuestionChain(candidate.text);
  if (candidate.kind === 'mistake') {
    requestMistakeRedo(candidate.id.replace(/^mistake:/, ''));
    return;
  }
  void import('../chat/sendPipeline.ts').then(({ submitChatMessage }) => submitChatMessage(candidate.text))
    .catch((error) => {
      reportSwallow(error, 'tutor/questionChainActions:followChain');
      /* Sending failed to load: leave the question in the composer instead. */
      setComposerMarkdown('chat', candidate.text);
    });
}
