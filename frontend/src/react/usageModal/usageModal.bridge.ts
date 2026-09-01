/**
 * Usage modal bridge — M2 single-bridge migration.
 *
 * `ui/usage.js` calls `window.__socratesUsageBridge.publish(...)`; the
 * factory owns the snapshot/reducer loop and `useBridge` powers React
 * subscribers.
 */

import { createImmutableBridge, useBridge, useBridgeSelector } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type { UsageBridge, UsageSnapshot } from './types';

declare global {
  interface Window {
    __socratesUsageBridge?: UsageBridge;
  }
}

type Action = Omit<UsageSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<UsageSnapshot, Action>({
  initial: { isOpen: false, bodyHtml: '', revision: 0 },
  reducer: (_state, action) => action,
});

const bridge: UsageBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as UsageBridge;

export function installUsageBridge(): UsageBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesUsageBridge) {
      window.__socratesUsageBridge = bridge;
    }
    return window.__socratesUsageBridge;
  }
  return bridge;
}

export function getUsageSnapshot(): UsageSnapshot {
  return installUsageBridge().getSnapshot();
}

export function subscribeToUsage(listener: () => void): () => void {
  return installUsageBridge().subscribe(listener);
}

export function useUsageSnapshot(): UsageSnapshot {
  return useBridge(factoryBridge);
}

export function useIsUsageOpen(): boolean {
  return useBridgeSelector(factoryBridge, (snapshot) => snapshot.isOpen);
}

export function useUsageDispatch(): { close: () => void } {
  return {
    close: () => getLegacyActions().navigation.closeUsageModal(),
  };
}
