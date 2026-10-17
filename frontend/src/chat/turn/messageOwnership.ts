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
  patchOwnedMessage(patch: unknown, deferNotify?: boolean): unknown;
}

export function createMessageOwnership(
  state: TurnSlotState,
  ownerSessionId: string,
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

  function patchOwnedMessage(patch: unknown, deferNotify?: boolean): unknown {
    if (!ownsMessageSlot()) return null;
    return store.dispatch({
      type: 'session/update-message',
      index: state.msgIdx,
      clientId: state.clientId,
      patch,
      deferNotify: deferNotify === true,
    });
  }

  return { ownsMessageSlot, stillOwnsSlot, patchOwnedMessage };
}
