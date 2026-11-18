import { useBridge } from '../../store/useBridge.ts';
import { confirmState, getConfirmReturnFocus } from '../../legacy/confirmState.ts';
import type { ConfirmSnapshot } from '../../legacy/confirmState.ts';

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
