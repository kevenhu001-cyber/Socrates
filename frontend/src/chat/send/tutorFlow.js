import { stateStore } from '../../state/store.js';
import { hasUsableActive } from '../../config/providers.js';
import { _origGenerateFollowUp } from '../mocks.js';
import { notifyMockFallbackOnce } from '../mockFallbackNotice.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { generateFollowUpStream } from '../../tutor/socraticTurn.js';
import { toolCallbacksForStream } from '../toolCallbacks.js';
import { isExpectedTurnAbort } from '../turnUi.js';
import { updateChatStats } from '../stats.js';
import { getTutorSocratic, addAnchoredAssistant, addStreamingMessage, askChatTurn, translate, reportTurnFailure } from './runtime.js';
import { advanceTutorNodeIfReady, recordTutorProgress } from './tutorProgress.js';
import { stuckPromptTransition } from './tutorPolicy.js';

function invokeTutorPrompt(method, context, ...args) {
  const tutor = getTutorSocratic();
  if (!tutor || typeof tutor !== 'object' || typeof tutor[method] !== 'function') return false;
  try {
    tutor[method](...args);
    return true;
  } catch (error) {
    reportSwallow(error, context);
    return true;
  }
}

function showStuckResponse(text) {
  const transition = stuckPromptTransition({
    stuckCount: stateStore.read('stuckCount'),
    offered: stateStore.read('stuckCheckOffered'),
    rejected: stateStore.read('stuckCheckRejected'),
  });
  const applyTransition = () => {
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

async function runChatFallback(text, chatContent) {
  try { await askChatTurn(text, chatContent); }
  catch (error) {
    if (!isExpectedTurnAbort(error)) reportTurnFailure(error, 'sendPipeline.tutorFallback');
  }
}

async function runTutorFollowUp(text, chatContent, options, node, isSubstantive, submitChatMessage) {
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
      stateStore.read('domain'),
      (delta) => streamController.append(delta),
      (thinking) => streamController.appendThinking(thinking),
      toolCallbacksForStream(streamController),
    );
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
      addAnchoredAssistant(_origGenerateFollowUp(text, node, stateStore.read('domain')));
    }
  } else {
    notifyMockFallbackOnce();
    addAnchoredAssistant(_origGenerateFollowUp(text, node, stateStore.read('domain')));
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

function shouldRunTutorFollowUp(isSubstantive, origin) {
  return isSubstantive || stateStore.read('stuckCount') < 3 || origin === 'quiz';
}

export async function dispatchTutorTurn({ text, chatContent, options, submitChatMessage }) {
  const { node, isSubstantive } = recordTutorProgress(text, options);
  if (advanceTutorNodeIfReady(node, options.origin)) {
    updateChatStats();
    return;
  }

  if (shouldRunTutorFollowUp(isSubstantive, options.origin)) {
    await runTutorFollowUp(text, chatContent, options, node, isSubstantive, submitChatMessage);
  } else {
    showStuckResponse(text);
  }
  updateChatStats();
}
