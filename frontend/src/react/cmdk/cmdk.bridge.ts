/**
 * Cmd+K palette bridge — M2 single-bridge migration.
 *
 * Legacy `ui/cmdK.js` publishes palette state through
 * `window.__socratesCmdK.publish(...)`. The factory owns the
 * snapshot/reducer/listener loop; this module adds the legacy alias
 * and the React hooks consumed by `CommandPalette.tsx`.
 *
 * M2 conventions
 *  - `getSnapshot` / `subscribe` / `dispatch` come from the factory.
 *  - `publish` is a thin alias on the window-published bridge for
 *    legacy callers (matches the original `CmdKBridge` interface).
 *  - React subscribers use `useBridge(bridge)` directly; the legacy
 *    `useSyncExternalStore` wrapper is gone.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type {
  CmdKBridge,
  CmdKHit,
  CmdKSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesCmdK?: CmdKBridge;
  }
}

const HIDDEN: CmdKSnapshot = Object.freeze({
  isOpen: false,
  query: '',
  results: Object.freeze([] as ReadonlyArray<CmdKHit>),
  selectedIndex: 0,
  recent: Object.freeze([] as ReadonlyArray<string>),
  revision: 0,
});

type Action = Omit<CmdKSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<CmdKSnapshot, Action>({
  initial: HIDDEN,
  reducer: (state, action) => ({
    ...action,
    results: Object.freeze([...action.results]),
    recent: Object.freeze([...action.recent]),
    revision: state.revision + 1,
  }),
});

const bridge: CmdKBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as CmdKBridge;

export function installCmdKBridge(): CmdKBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesCmdK) {
      window.__socratesCmdK = bridge;
    }
    return window.__socratesCmdK;
  }
  return bridge;
}

export function getCmdKSnapshot(): CmdKSnapshot {
  return installCmdKBridge().getSnapshot();
}

export function subscribeToCmdK(listener: () => void): () => void {
  return installCmdKBridge().subscribe(listener);
}

export function useCmdKSnapshot(): CmdKSnapshot {
  return useBridge(factoryBridge);
}

export function useIsCmdKOpen(): boolean {
  return useBridge(factoryBridge).isOpen;
}

export function useCmdKResults(): ReadonlyArray<CmdKHit> {
  return useBridge(factoryBridge).results;
}

// ── command dispatch (legacy gateway) ───────────────────────────────────

export function useCmdKCommands(): {
  open: () => void;
  close: () => void;
  input: (value: string) => void;
  key: (key: string) => void;
  activate: (index: number) => void;
} {
  return {
    open: () => getLegacyActions().cmdK.openCmdK(),
    close: () => getLegacyActions().cmdK.closeCmdK(),
    input: (value: string) => getLegacyActions().cmdK.onCmdKInput(value),
    key: (key: string) => {
      const event = {
        key,
        preventDefault: () => {
          /* no-op stub for legacy handler compatibility */
        },
      };
      getLegacyActions().cmdK.onCmdKKey(event as unknown as KeyboardEvent);
    },
    activate: (index: number) => getLegacyActions().cmdK.openCmdKResult(index),
  };
}
