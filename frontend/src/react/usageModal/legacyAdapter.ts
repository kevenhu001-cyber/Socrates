import { useSyncExternalStore } from 'react';

import {
  getUsageSnapshot,
  subscribeToUsage,
} from './usageModalStore';
import type { UsageSnapshot } from './types';

declare global {
  interface Window {
    closeUsageModal?: () => void;
    t?: (key: string) => string;
  }
}

export function useUsageSnapshot(): UsageSnapshot {
  return useSyncExternalStore(
    subscribeToUsage,
    getUsageSnapshot,
    getUsageSnapshot,
  );
}

export function useIsUsageOpen(): boolean {
  return useSyncExternalStore(
    subscribeToUsage,
    () => getUsageSnapshot().isOpen,
    () => false,
  );
}

export function useUsageDispatch() {
  return {
    close: () => { if (typeof window.closeUsageModal === 'function') window.closeUsageModal(); },
  };
}
