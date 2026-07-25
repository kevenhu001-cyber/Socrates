import { useSyncExternalStore } from 'react';

import {
  getUsageSnapshot,
  subscribeToUsage,
} from './usageModalStore';
import type { UsageSnapshot } from './types';
import { getLegacyActions } from '../legacy/gateway';

declare global {
  interface Window {
    closeUsageModal?: () => void;
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
    close: () => getLegacyActions().navigation.closeUsageModal(),
  };
}
