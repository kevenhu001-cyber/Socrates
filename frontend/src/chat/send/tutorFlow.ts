import type { SubmitChatMessage, TutorTurnOptions } from './tutorPolicy.ts';

/** What dispatchSendTurn hands the Tutor path. */
export interface DispatchTutorTurnInput {
  text: string;
  chatContent: unknown;
  options: TutorTurnOptions;
  submitChatMessage: SubmitChatMessage;
}

type TutorFlowRuntime = typeof import('./tutorFlow.impl.ts');
let runtimeImport: Promise<TutorFlowRuntime> | null = null;

function loadRuntime(): Promise<TutorFlowRuntime> {
  if (!runtimeImport) {
    const pending = import('./tutorFlow.impl.ts');
    runtimeImport = pending;
    void pending.catch((error) => {
      if (runtimeImport === pending) runtimeImport = null;
      console.error('[tutor] failed to load send flow', error);
    });
  }
  return runtimeImport;
}

export async function dispatchTutorTurn(input: DispatchTutorTurnInput): Promise<void> {
  const runtime = await loadRuntime();
  await runtime.dispatchTutorTurn(input);
}
