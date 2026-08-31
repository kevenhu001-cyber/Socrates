/**
 * Share modal bridge — M2 single-bridge migration.
 *
 * Legacy `ui/share.js` publishes share-link state through
 * `window.__socratesShareBridge.publish(...)`. The factory owns the
 * snapshot/reducer/listener loop; this module adds the legacy alias
 * and the React hooks consumed by `ShareModal.tsx`.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type { ShareBridge, ShareSnapshot, ShareVisibility } from './types';

declare global {
  interface Window {
    __socratesShareBridge?: ShareBridge;
  }
}

const HIDDEN: ShareSnapshot = Object.freeze({
  isOpen: false,
  visibility: 'public',
  shareToken: null,
  shareUrl: '',
  status: '',
  error: '',
  revision: 0,
});

type Action = Omit<ShareSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<ShareSnapshot, Action>({
  initial: HIDDEN,
  reducer: (state, action) => ({ ...action, revision: state.revision + 1 }),
});

const bridge: ShareBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as ShareBridge;

export function installShareBridge(): ShareBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesShareBridge) {
      window.__socratesShareBridge = bridge;
    }
    return window.__socratesShareBridge;
  }
  return bridge;
}

export function getShareSnapshot(): ShareSnapshot {
  return installShareBridge().getSnapshot();
}

export function subscribeToShare(listener: () => void): () => void {
  return installShareBridge().subscribe(listener);
}

export function useShareSnapshot(): ShareSnapshot {
  return useBridge(factoryBridge);
}

export function useIsShareOpen(): boolean {
  return useBridge(factoryBridge).isOpen;
}

export function useShareDispatch() {
  const s = getLegacyActions().share;
  return {
    selectVis: (vis: ShareVisibility) => s.selectShareVis(vis),
    createLink: () => s.createShareLink(),
    copyLink: () => s.copyShareLink(),
    revokeLink: () => s.revokeShareLink(),
    close: () => s.closeShareModal(),
  };
}
