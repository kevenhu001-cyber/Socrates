import { useCallback } from 'react';

import {
  getCmdKSnapshot,
  subscribeToCmdK,
} from './cmdKRuntimeStore';
import type { CmdKSnapshot, CmdKHit } from './types';

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
  if (typeof window.openCmdK === 'function') window.openCmdK();
}

function dispatchClose(): void {
  if (typeof window.closeCmdK === 'function') window.closeCmdK();
}

function dispatchInput(value: string): void {
  if (typeof window.onCmdKInput === 'function') window.onCmdKInput(value);
}

function dispatchKey(key: string): void {
  if (typeof window.onCmdKKey !== 'function') return;
  const event = {
    key,
    preventDefault: () => {
      /* no-op stub for legacy handler compatibility */
    },
  };
  window.onCmdKKey(event);
}

function dispatchActivate(index: number): void {
  if (typeof window.openCmdKResult === 'function') window.openCmdKResult(index);
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