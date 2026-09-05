/**
 * Scheduled page bridge — M2 single-bridge migration.
 *
 * The legacy scheduler publisher uses
 * `window.__socratesScheduledBridge.publish(...)`. The factory owns the
 * snapshot/reducer/listener loop; this module adds the legacy alias and
 * the React hooks consumed by `ScheduledPage.tsx`.
 */

import { createImmutableBridge, useBridge } from '../../../lib/bridge';
import { getLegacyActions } from '../../legacy/gateway';
import type {
  ScheduledBridge,
  ScheduledSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesScheduledBridge?: ScheduledBridge;
  }
}

type Action = Omit<ScheduledSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<ScheduledSnapshot, Action>({
  initial: { tasks: [], loading: false, error: null, revision: 0 },
  reducer: (_state, action) => ({
    ...action,
    tasks: Object.freeze([...action.tasks]),
  }),
});

const bridge: ScheduledBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as ScheduledBridge;

export function installScheduledBridge(): ScheduledBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesScheduledBridge) {
      window.__socratesScheduledBridge = bridge;
    }
    return window.__socratesScheduledBridge;
  }
  return bridge;
}

export function getScheduledSnapshot(): ScheduledSnapshot {
  return installScheduledBridge().getSnapshot();
}

export function subscribeToScheduled(listener: () => void): () => void {
  return installScheduledBridge().subscribe(listener);
}

export function useScheduledSnapshot(): ScheduledSnapshot {
  return useBridge(factoryBridge);
}

export function useScheduledDispatch() {
  const s = getLegacyActions().scheduled;
  return {
    create: (initialPrompt?: string) => s.openCreateScheduledTask(initialPrompt),
    edit: (id: string) => s.openEditScheduledTask(id),
    toggle: (id: string, pause: boolean) => s.toggleScheduledTask(id, pause),
    run: (id: string) => s.runScheduledTask(id),
    remove: (id: string) => s.deleteScheduledTask(id),
  };
}
