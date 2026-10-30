import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export type ComposerMode = 'topic' | 'chat';

export interface ComposerToolsSnapshot {
  isOpen: boolean;
  mode: ComposerMode | null;
  triggerId: string | null;
  revision: number;
}

type ComposerToolsUpdate = Omit<ComposerToolsSnapshot, 'revision'>;

export const composerToolsState = createImmutableBridge<ComposerToolsSnapshot, ComposerToolsUpdate>({
  initial: { isOpen: false, mode: null, triggerId: null, revision: 0 },
  reducer: (_state, update) => update,
});

export function publishComposerToolsState(update: ComposerToolsUpdate): void {
  composerToolsState.dispatch(update);
}
