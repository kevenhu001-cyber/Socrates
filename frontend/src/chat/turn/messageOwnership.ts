import type { TurnMessage } from './runtimeState.ts';
/* Own the session and message slot reserved by one streaming turn. */

/** The per-turn fields the ownership guard reads. */
export interface TurnSlotState {
  msgIdx: number;
  clientId: string;
  _disposed?: boolean;
  finished?: boolean;
}

/** The subset of the state store the guard needs. */
export interface OwnershipStore {
  read(key: string): unknown;
  dispatch(action: unknown): unknown;
}

export interface MessageOwnership {
  ownsMessageSlot(): boolean;
  stillOwnsSlot(): boolean;
  patchOwnedMessage(patch: Record<string, unknown>, deferNotify?: boolean): TurnMessage | null;
}

export function createMessageOwnership(
  state: TurnSlotState,
  ownerSessionId: string | null,
  store: OwnershipStore,
): MessageOwnership {
  function ownsMessageSlot(): boolean {
    if (store.read('currentSessionId') !== ownerSessionId) return false;
    const messages = store.read('messages') as Array<{ clientId?: string }> | null | undefined;
    if (!messages || state.msgIdx < 0 || !messages[state.msgIdx]) return false;
    return messages[state.msgIdx].clientId === state.clientId;
  }

  function stillOwnsSlot(): boolean {
    if (state._disposed || state.finished) return false;
    return ownsMessageSlot();
  }

  function patchOwnedMessage(patch: Record<string, unknown>, deferNotify?: boolean): TurnMessage | null {
    if (!ownsMessageSlot()) return null;
    return store.dispatch({
      type: 'session/update-message',
      index: state.msgIdx,
      clientId: state.clientId,
      patch,
      deferNotify: deferNotify === true,
    }) as TurnMessage | null;
  }

  return { ownsMessageSlot, stillOwnsSlot, patchOwnedMessage };
}
