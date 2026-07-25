import { useSyncExternalStore } from 'react';

import {
  getScheduledSnapshot,
  subscribeToScheduled,
} from './scheduledStore';
import type { ScheduledSnapshot } from './types';
import { getLegacyActions } from '../../legacy/gateway';

declare global {
  interface Window {
    openCreateScheduledTask?: () => void;
    openEditScheduledTask?: (id: string) => void;
    toggleScheduledTask?: (id: string, pause: boolean) => void;
    apiFetch?: (path: string, options?: Record<string, unknown>) => Promise<unknown>;
  }
}

export function useScheduledSnapshot(): ScheduledSnapshot {
  return useSyncExternalStore(
    subscribeToScheduled,
    getScheduledSnapshot,
    getScheduledSnapshot,
  );
}

export function useScheduledDispatch() {
  const s = getLegacyActions().scheduled;
  return {
    create: () => s.openCreateScheduledTask(),
    edit: (id: string) => s.openEditScheduledTask(id),
    toggle: (id: string, pause: boolean) => s.toggleScheduledTask(id, pause),
  };
}
