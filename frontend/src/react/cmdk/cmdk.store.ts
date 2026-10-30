import { useBridge, useBridgeSelector } from '../../lib/bridge';
import { cmdKState } from '../../ui/cmdKState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { CmdKHit, CmdKSnapshot } from '../../ui/cmdKState.ts';

export function getCmdKSnapshot(): CmdKSnapshot {
  return cmdKState.getSnapshot();
}

export function subscribeToCmdK(listener: () => void): () => void {
  return cmdKState.subscribe(listener);
}

export function useCmdKSnapshot(): CmdKSnapshot {
  return useBridge(cmdKState);
}

export function useIsCmdKOpen(): boolean {
  return useBridgeSelector(cmdKState, (snapshot) => snapshot.isOpen);
}

export function useCmdKResults(): ReadonlyArray<CmdKHit> {
  return useBridgeSelector(cmdKState, (snapshot) => snapshot.results);
}

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
