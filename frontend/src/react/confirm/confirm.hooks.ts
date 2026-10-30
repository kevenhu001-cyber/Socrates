import { useBridge } from '../../lib/bridge/useBridge.ts';
import { confirmState, getConfirmReturnFocus } from '../../ui/confirmState.ts';
import type { ConfirmSnapshot } from '../../ui/confirmState.ts';

export { getConfirmReturnFocus };

export function getConfirmSnapshot(): ConfirmSnapshot {
  return confirmState.getSnapshot();
}

export function subscribeToConfirm(listener: () => void): () => void {
  return confirmState.subscribe(listener);
}

export function useConfirmSnapshot(): ConfirmSnapshot {
  return useBridge(confirmState);
}
