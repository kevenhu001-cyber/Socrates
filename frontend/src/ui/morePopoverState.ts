import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export interface MorePopoverSnapshot {
  isOpen: boolean;
  revision: number;
}

type MorePopoverUpdate = Omit<MorePopoverSnapshot, 'revision'>;

export const morePopoverState = createImmutableBridge<MorePopoverSnapshot, MorePopoverUpdate>({
  initial: { isOpen: false, revision: 0 },
  reducer: (_state, update) => update,
});

export function publishMorePopoverState(isOpen: boolean): void {
  morePopoverState.dispatch({ isOpen });
}
