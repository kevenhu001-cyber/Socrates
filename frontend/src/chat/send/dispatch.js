import { isExpectedTurnAbort } from '../turnUi.js';
import { dispatchTutorTurn } from './tutorFlow.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import {
  askChatTurn,
  getAppMode,
  isDeepResearchOn,
  reportTurnFailure,
} from './runtime.js';

async function runChatTurn(text, chatContent, precreatedController) {
  try {
    await askChatTurn(text, chatContent, precreatedController);
  } catch (error) {
    // The gate or a newer turn already owns expected abort feedback.
    if (!isExpectedTurnAbort(error)) reportTurnFailure(error, 'sendPipeline.dispatchChatTurn');
  }
}

export async function dispatchSendTurn({
  text,
  chatContent,
  precreatedController,
  options,
  submitChatMessage,
}) {
  if (isDeepResearchOn() && text) {
    if (precreatedController) {
      try { precreatedController.abort(); }
      catch (error) { reportSwallow(error, 'sendPipeline.deepResearch.abortPrecreated'); }
    }
    if (typeof window.startDeepResearch === 'function') {
      await window.startDeepResearch(text);
    }
    return;
  }

  if (getAppMode() === 'chat') {
    await runChatTurn(text, chatContent, precreatedController);
    return;
  }

  await dispatchTutorTurn({ text, chatContent, options, submitChatMessage });
}

export function scheduleSendTurn(dispatch) {
  if (getAppMode() === 'chat') dispatch();
  else setTimeout(dispatch, 0);
}
