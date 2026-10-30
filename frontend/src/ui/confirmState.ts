import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export interface ConfirmSnapshot {
  open: boolean;
  title: string;
  msg: string;
  danger: boolean;
  revision: number;
}

export type ConfirmStateUpdate = Omit<ConfirmSnapshot, 'revision'>;

export const confirmState = createImmutableBridge<ConfirmSnapshot, ConfirmStateUpdate>({
  initial: { open: false, title: '', msg: '', danger: false, revision: 0 },
  reducer: (_state, action) => action,
});

let returnFocusElement: HTMLElement | null = null;

/** Publish modal state through the shared module instance, without a window slot. */
export function publishConfirmState(snapshot: ConfirmStateUpdate): void {
  if (snapshot.open && !confirmState.getSnapshot().open) {
    const activeElement = typeof document === 'undefined' ? null : document.activeElement;
    const HTMLElementType = typeof document === 'undefined' ? undefined : document.defaultView?.HTMLElement;
    returnFocusElement = HTMLElementType && activeElement instanceof HTMLElementType
      ? activeElement
      : null;
  }
  confirmState.dispatch(snapshot);
}

export function getConfirmReturnFocus(): HTMLElement | null {
  return returnFocusElement?.isConnected ? returnFocusElement : null;
}
