import { reportSwallow } from '../../util/reportSwallow.ts';

type StreamingTurnModule = typeof import('./streaming.ts');
type CreateStreamingMessage = StreamingTurnModule['addStreamingMessage'];

let pendingImport: Promise<StreamingTurnModule> | null = null;
let streamingModule: StreamingTurnModule | null = null;

function loadStreamingTurn(): Promise<StreamingTurnModule> {
  pendingImport ??= import('./streaming.ts')
    .then((module) => {
      streamingModule = module;
      return module;
    })
    .catch((error: unknown) => {
      pendingImport = null;
      reportSwallow(error, 'chat/turn/loadStreamingTurn');
      throw error;
    });
  return pendingImport;
}

export function prefetchStreamingTurn(): void {
  void loadStreamingTurn().catch(() => {
    // empty-catch: intentional — the loader reports the failure and lets the next send retry.
  });
}

/** Preserve synchronous placeholder insertion for existing warm callers. */
export function addStreamingMessage(
  ...args: Parameters<CreateStreamingMessage>
): ReturnType<CreateStreamingMessage> | Promise<ReturnType<CreateStreamingMessage>> {
  if (streamingModule) return streamingModule.addStreamingMessage(...args);
  return loadStreamingTurn().then((module) => module.addStreamingMessage(...args));
}
