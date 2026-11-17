import { isExpectedTurnAbort } from '../turn/ui.ts';
import { dispatchTutorTurn } from './tutorFlow.ts';
import { askChatTurn } from '../turn/controller.ts';
import { getAppMode, reportTurnFailure } from './runtime.ts';
import type { SubmitChatMessage, TutorTurnOptions } from './tutorPolicy.ts';
import type { StreamingTurnController } from '../turn/state.ts';

/** The abort surface of a turn created before the send was dispatched. */
export interface DispatchSendTurnInput {
  text: string;
  chatContent: unknown;
  deepResearchOn: boolean;
  precreatedController?: StreamingTurnController | null;
  options?: unknown;
  submitChatMessage?: unknown;
}

async function runChatTurn(
  text: string,
  chatContent: unknown,
  precreatedController?: StreamingTurnController | null,
): Promise<void> {
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
  deepResearchOn,
  precreatedController,
  options,
  submitChatMessage,
}: DispatchSendTurnInput): Promise<void> {
  if (deepResearchOn && text) {
    const { startDeepResearch } = await import('../../agent/researchAgent.ts');
    await startDeepResearch(text);
    return;
  }

  if (getAppMode() === 'chat') {
    await runChatTurn(text, chatContent, precreatedController);
    return;
  }

  /* `options`/`submitChatMessage` arrive untyped from the JS send pipeline;
     the tutor contract is applied at this boundary. */
  await dispatchTutorTurn({
    text,
    chatContent,
    options: (options || {}) as TutorTurnOptions,
    submitChatMessage: submitChatMessage as SubmitChatMessage,
  });
}

export function scheduleSendTurn(dispatch: () => void): void {
  if (getAppMode() === 'chat') dispatch();
  else setTimeout(dispatch, 0);
}
