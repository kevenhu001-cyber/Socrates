import { stateStore } from '../../state/store.ts';
import { hasUsableActive } from '../../config/providers.ts';
import { _origGenerateFollowUp } from '../mocks.ts';
import { notifyMockFallbackOnce } from '../mockFallbackNotice.ts';
import { generateFollowUpStream } from '../../tutor/socraticTurn.ts';
import { toolCallbacksForStream } from '../toolCallbacks.ts';
import { isExpectedTurnAbort } from '../turnUi.ts';
import { addAnchoredAssistant, addStreamingMessage, askChatTurn, reportTurnFailure } from './runtime.ts';
import { advanceTutorNodeIfReady, recordTutorProgress } from './tutorProgress.ts';
import type { SubmitChatMessage, TutorTurnOptions } from './tutorPolicy.ts';
import type { KbNode } from '../teachingPlan.ts';

/** What dispatchSendTurn hands the tutor path. */
export interface DispatchTutorTurnInput {
  text: string;
  chatContent: unknown;
  options: TutorTurnOptions;
  submitChatMessage: SubmitChatMessage;
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

  // Let the tutor interpret short answers and offer the appropriate help.
  await runTutorFollowUp(text, chatContent, options, node, isSubstantive, submitChatMessage);
}
