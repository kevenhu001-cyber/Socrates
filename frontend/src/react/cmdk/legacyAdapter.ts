import { useCallback } from 'react';

import {
  getCmdKSnapshot,
  subscribeToCmdK,
} from './cmdKRuntimeStore';
import type { CmdKSnapshot, CmdKHit } from './types';
import { getLegacyActions } from '../legacy/gateway';

declare global {
  interface Window {
    openCmdK?: () => void;
    closeCmdK?: () => void;
    onCmdKInput?: (value: string) => void;
    onCmdKKey?: (event: { key: string; preventDefault: () => void }) => void;
    openCmdKResult?: (index: number) => void;
    loadSession?: (id: string) => void;
    esc?: (value: unknown) => string;
  }
}

/**
 * Legacy dispatch surface — every action the palette can take is already
 * a window.* function exported by src/ui/cmdK.js via windowExports.js.
 * Re-using those entry points keeps a single state machine (the legacy
 * module) and a single render target (the React root) — React owns the
 * DOM, legacy owns the data.
 */
function dispatchOpen(): void {
  getLegacyActions().cmdK.openCmdK();
}

function dispatchClose(): void {
  getLegacyActions().cmdK.closeCmdK();
}

function dispatchInput(value: string): void {
  getLegacyActions().cmdK.onCmdKInput(value);
}

function dispatchKey(key: string): void {
  const event = {
    key,
    preventDefault: () => {
      /* no-op stub for legacy handler compatibility */
    },
  };
  getLegacyActions().cmdK.onCmdKKey(event as unknown as KeyboardEvent);
}

function dispatchActivate(index: number): void {
  getLegacyActions().cmdK.openCmdKResult(index);
}

export function useCmdKCommands(): {
  open: () => void;
  close: () => void;
  input: (value: string) => void;
  key: (key: string) => void;
  activate: (index: number) => void;
} {
  return {
    open: useCallback(dispatchOpen, []),
    close: useCallback(dispatchClose, []),
    input: useCallback(dispatchInput, []),
    key: useCallback(dispatchKey, []),
    activate: useCallback(dispatchActivate, []),
  };
}

export function useCmdKSnapshot(): CmdKSnapshot {
  return useSyncExternalStoreWrapper(getCmdKSnapshot, subscribeToCmdK);
}

export function useIsCmdKOpen(): boolean {
  return useSyncExternalStoreWrapper(
    () => getCmdKSnapshot().isOpen,
    subscribeToCmdK,
  );
}

export function useCmdKResults(): ReadonlyArray<CmdKHit> {
  return useSyncExternalStoreWrapper(
    () => getCmdKSnapshot().results,
    subscribeToCmdK,
  );
}

// --- internals ----------------------------------------------------------

import { useSyncExternalStore } from 'react';

function useSyncExternalStoreWrapper<T>(
  get: () => T,
  subscribe: (listener: () => void) => () => void,
): T {
  return useSyncExternalStore(subscribe, get, get);
}