/* Own the session and message slot reserved by one streaming turn. */
export function createMessageOwnership(state, ownerSessionId, store) {
  function ownsMessageSlot() {
    if (store.read('currentSessionId') !== ownerSessionId) return false;
    var messages = store.read('messages');
    if (state.msgIdx < 0 || !messages[state.msgIdx]) return false;
    return messages[state.msgIdx].clientId === state.clientId;
  }

  function stillOwnsSlot() {
    if (state._disposed || state.finished) return false;
    return ownsMessageSlot();
  }

  function patchOwnedMessage(patch, deferNotify) {
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
