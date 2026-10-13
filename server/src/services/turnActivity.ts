import type { PublicTurnActivity } from '../../../packages/contracts/src/turnActivity.js';

/** Emits observations at provider/tool boundaries, never private reasoning. */
export function createTurnActivityController(emit: (activity: PublicTurnActivity) => void) {
  let previous: PublicTurnActivity | null = null;
  const publish = (activity: PublicTurnActivity) => {
    if (previous?.type === 'done') return;
    if (JSON.stringify(previous) === JSON.stringify(activity)) return;
    previous = activity;
    emit(activity);
  };
  return {
    thinking: () => publish({ type: 'thinking' }),
    synthesizing: () => publish({ type: 'synthesizing' }),
    tool: (toolCallId: string, toolName: string) => publish({ type: 'tool', toolCallId, toolName }),
    done: (durationMs: number) => publish({ type: 'done', durationMs }),
  };
}
