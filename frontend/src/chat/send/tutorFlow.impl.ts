import { stateStore } from '../../state/store.ts';
import { hasUsableActive } from '../../config/providers.ts';
import { _origGenerateFollowUp } from '../mocks.ts';
import { notifyMockFallbackOnce } from '../mockFallbackNotice.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { generateFollowUpStream } from '../../tutor/socraticTurn.ts';
import { toolCallbacksForStream } from '../toolCallbacks.ts';
import { isExpectedTurnAbort } from '../turnUi.ts';
import { getTutorSocratic, addAnchoredAssistant, addStreamingMessage, askChatTurn, translate, reportTurnFailure } from './runtime.ts';
import { advanceTutorNodeIfReady, recordTutorProgress } from './tutorProgress.ts';
import {
  stuckPromptTransition,
  type SubmitChatMessage,
  type TutorTurnOptions,
} from './tutorPolicy.ts';
import type { KbNode } from '../teachingPlan.ts';

/** What dispatchSendTurn hands the tutor path. */
export interface DispatchTutorTurnInput {
  text: string;
  chatContent: unknown;
  options: TutorTurnOptions;
  submitChatMessage: SubmitChatMessage;
}

function invokeTutorPrompt(method: string, context: string, ...args: unknown[]): boolean {
  const tutor = getTutorSocratic() as Record<string, unknown> | null | undefined;
  if (!tutor || typeof tutor[method] !== 'function') return false;
  try {
    (tutor[method] as (...callArgs: unknown[]) => void)(...args);
    return true;
  } catch (error) {
    reportSwallow(error, context);
    return true;
  }
}

function showStuckResponse(text: string): void {
  const transition = stuckPromptTransition({
    stuckCount: stateStore.read('stuckCount'),
    offered: stateStore.read('stuckCheckOffered'),
    rejected: stateStore.read('stuckCheckRejected'),
  });
  const applyTransition = (): void => {
    if (transition.patch) stateStore.dispatch({ type: 'state/batch', patch: transition.patch });
  };

  if (transition.action === 'four-options') {
    if (!invokeTutorPrompt('showFourOptionDialog', 'sendPipeline.fourOptionDialog', text)) {
      addAnchoredAssistant("Let's try a different approach.", 'suggest', [
        { text: translate('tutor.explain'), action: 'explain', primary: true },
        { text: translate('tutor.skip'), action: 'skip' },
        { text: translate('tutor.thinkMore'), action: 'retry' },
      ]);
    }
    applyTransition();
    return;
  }

  if (transition.action === 'explain-prompt') {
    if (!invokeTutorPrompt('showExplainPrompt', 'sendPipeline.explainPrompt')) {
      addAnchoredAssistant("Let's try a different approach.", 'suggest', [
        { text: translate('tutor.explain'), action: 'explain', primary: true },
        { text: translate('tutor.skip'), action: 'skip' },
        { text: translate('tutor.thinkMore'), action: 'retry' },
      ]);
    }
    applyTransition();
    return;
  }

  applyTransition();
  addAnchoredAssistant(translate('tutor.takeTime'));
}

async function runChatFallback(text: string, chatContent: unknown): Promise<void> {
  try { await askChatTurn(text, chatContent); }
  catch (error) {
    if (!isExpectedTurnAbort(error)) reportTurnFailure(error, 'sendPipeline.tutorFallback');
  }
}

async function runTutorFollowUp(
  text: string,
  chatContent: unknown,
  options: TutorTurnOptions,
  node: KbNode | null,
  isSubstantive: boolean,
  submitChatMessage: SubmitChatMessage,
): Promise<void> {
  if (!node) {
    await runChatFallback(text, chatContent);
    stateStore.dispatch({
      type: 'state/set',
      key: 'totalQ',
      value: stateStore.read('totalQ') + 1,
    });
    return;
  }

  if (hasUsableActive()) {
    const streamController = await addStreamingMessage({
      onRetry: () => submitChatMessage(text, options),
    });
    const response = await generateFollowUpStream(
      text,
      node,
      stateStore.read('domain') || '',
      (delta: string) => streamController.append(delta),
      (thinking: string) => streamController.appendThinking(thinking),
      toolCallbacksForStream(streamController),
    );
    if (response && typeof response === 'object' && response.cancelled) {
      streamController.abort();
      return;
    }
    if (response != null) {
      streamController.finish();
    } else if (stateStore.read('lastCallError')) {
      streamController.replaceWithError(
        'No response: ' + stateStore.read('lastCallError'),
        () => submitChatMessage(text, options),
      );
    } else {
      streamController.abort();
      notifyMockFallbackOnce();
      addAnchoredAssistant(_origGenerateFollowUp(text, node, stateStore.read('domain') || ''));
    }
  } else {
    notifyMockFallbackOnce();
    addAnchoredAssistant(_origGenerateFollowUp(text, node, stateStore.read('domain') || ''));
  }

  stateStore.dispatch({
    type: 'state/batch',
    patch: {
      stuckCount: (isSubstantive || options.origin === 'quiz')
        ? 0
        : stateStore.read('stuckCount'),
      totalQ: stateStore.read('totalQ') + 1,
    },
  });
}

function shouldRunTutorFollowUp(isSubstantive: boolean, origin?: string | null): boolean {
  return isSubstantive || stateStore.read('stuckCount') < 3 || origin === 'quiz';
}

export async function dispatchTutorTurn({
  text,
  chatContent,
  options,
  submitChatMessage,
}: DispatchTutorTurnInput): Promise<void> {
  const { node, isSubstantive } = recordTutorProgress(text, options);
  if (advanceTutorNodeIfReady(node, options.origin)) {
    return;
  }

  if (shouldRunTutorFollowUp(isSubstantive, options.origin)) {
    await runTutorFollowUp(text, chatContent, options, node, isSubstantive, submitChatMessage);
  } else {
    showStuckResponse(text);
  }
}
