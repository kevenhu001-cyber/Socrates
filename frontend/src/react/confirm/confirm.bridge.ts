/**
 * Confirm bridge — M4 step 4.5c.
 *
 * The legacy `ui/confirm.js` publisher calls
 * `window.__socratesConfirmBridge.publish(...)`. The M1 factory owns
 * the snapshot/reducer/listener loop; this module wraps it with the
 * legacy `publish` alias and exposes a React hook built on `useBridge`.
 *
 * The snapshot carries `{ open, title, msg, danger }` only. React owns
 * the overlay skeleton; legacy keeps the `showConfirm` Promise resolver
 * and publishes visibility + copy.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type { ConfirmBridge, ConfirmSnapshot } from './types';

declare global {
  interface Window {
    __socratesConfirmBridge?: ConfirmBridge;
  }
}

type Action = Omit<ConfirmSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<ConfirmSnapshot, Action>({
  initial: { open: false, title: '', msg: '', danger: false, revision: 0 },
  reducer: (_state, action) => action,
});

let returnFocusElement: HTMLElement | null = null;

const bridge: ConfirmBridge = Object.assign(factoryBridge, {
  publish: (snapshot: Action) => {
    // Capture at publication, before an exiting menu can move focus again or
    // the deferred modal runtime finishes loading. Keep DOM out of snapshots.
    if (snapshot.open && !factoryBridge.getSnapshot().open) {
      returnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    factoryBridge.dispatch(snapshot);
  },
}) as ConfirmBridge;

export function getConfirmReturnFocus(): HTMLElement | null {
  return returnFocusElement?.isConnected ? returnFocusElement : null;
}

export function installConfirmBridge(): ConfirmBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesConfirmBridge) {
      window.__socratesConfirmBridge = bridge;
    }
    return window.__socratesConfirmBridge;
  }
  return bridge;
}

export function getConfirmSnapshot(): ConfirmSnapshot {
  return installConfirmBridge().getSnapshot();
}

export function subscribeToConfirm(listener: () => void): () => void {
  return installConfirmBridge().subscribe(listener);
}

export function useConfirmSnapshot(): ConfirmSnapshot {
  return useBridge(factoryBridge);
}
