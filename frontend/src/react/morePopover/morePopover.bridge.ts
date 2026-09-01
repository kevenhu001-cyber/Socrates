/**
 * More popover bridge — M2 single-bridge migration.
 *
 * Legacy `ui/sidebar/morePopover.js` publishes open/close through
 * `window.__socratesMorePopoverBridge.publish(...)`.
 */

import { createImmutableBridge, useBridge, useBridgeSelector } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type {
  MorePopoverAction,
  MorePopoverBridge,
  MorePopoverSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesMorePopoverBridge?: MorePopoverBridge;
  }
}

type Action = Omit<MorePopoverSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<MorePopoverSnapshot, Action>({
  initial: { isOpen: false, revision: 0 },
  reducer: (_state, action) => action,
});

const bridge: MorePopoverBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as MorePopoverBridge;

export function installMorePopoverBridge(): MorePopoverBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesMorePopoverBridge) {
      window.__socratesMorePopoverBridge = bridge;
    }
    return window.__socratesMorePopoverBridge;
  }
  return bridge;
}

export function getMorePopoverSnapshot(): MorePopoverSnapshot {
  return installMorePopoverBridge().getSnapshot();
}

export function subscribeToMorePopover(listener: () => void): () => void {
  return installMorePopoverBridge().subscribe(listener);
}

export function useMorePopoverSnapshot(): MorePopoverSnapshot {
  return useBridge(factoryBridge);
}

export function useIsMorePopoverOpen(): boolean {
  return useBridgeSelector(factoryBridge, (snapshot) => snapshot.isOpen);
}

export function useMorePopoverDispatch(): { pick: (action: MorePopoverAction) => void } {
  const nav = getLegacyActions().navigation;
  return {
    pick: (action: MorePopoverAction) => {
      nav.closeMorePopover();
      switch (action) {
        /* The desktop shell trims the sidebar nav to the five primary
           destinations, so Plugins and Exam route through here — without them the
           two panels had no entry point at all above 768px. */
        case 'plugins':
          nav.openNav('plugins');
          return;
        case 'exam':
          nav.openNav('exam');
          return;
        case 'skills':
          nav.openPromptTemplatesModal();
          return;
        case 'settings':
          nav.openSettings();
          return;
        case 'display':
          nav.toggleDisplayPrefs();
          return;
        case 'shortcuts':
          nav.openCheatsheet();
          return;
        case 'signout':
          nav.signOut();
          return;
      }
    },
  };
}
