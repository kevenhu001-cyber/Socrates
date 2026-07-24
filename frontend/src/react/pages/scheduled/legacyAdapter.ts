import { useSyncExternalStore } from 'react';

import {
  getScheduledSnapshot,
  subscribeToScheduled,
} from './scheduledStore';
import type { ScheduledSnapshot } from './types';

declare global {
  interface Window {
    openCreateScheduledTask?: () => void;
    openEditScheduledTask?: (id: string) => void;
    toggleScheduledTask?: (id: string, pause: boolean) => void;
    apiFetch?: (path: string, options?: Record<string, unknown>) => Promise<unknown>;
    t?: (key: string) => string;
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
  return {
    create: () => { if (typeof window.openCreateScheduledTask === 'function') window.openCreateScheduledTask(); },
    edit: (id: string) => { if (typeof window.openEditScheduledTask === 'function') window.openEditScheduledTask(id); },
    toggle: (id: string, pause: boolean) => { if (typeof window.toggleScheduledTask === 'function') window.toggleScheduledTask(id, pause); },
  };
}
