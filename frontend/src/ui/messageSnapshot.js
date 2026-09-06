import { stateStore } from '../state/store.js';
import { publishReactChatRuntime } from './reactBridge.js';

/** Update one message in the authoritative session store by identity. */
export function updateMessageSnapshot(message, patch, deferNotify) {
  if (!message) return null;
  const messageId = String(message.clientId || message.id || '');
  let messageIndex = stateStore.read('messages').indexOf(message);
  if (messageIndex < 0 && messageId) {
    messageIndex = stateStore.read('messages').findIndex((entry) =>
      entry && String(entry.clientId || entry.id || '') === messageId,
    );
  }
  if (messageIndex < 0) return null;
  return stateStore.dispatch({
    type: 'session/update-message',
    index: messageIndex,
    clientId: message.clientId || undefined,
    patch,
    deferNotify: deferNotify === true,
  });
}

/** Publish the current live status for a streaming assistant message. */
export function setReactLiveStatus(message, status) {
  if (!message) return;
  const previous = message._liveStatus;
  if (previous === status) return;
  if (previous && status
      && previous.phase === status.phase
      && previous.label === status.label
      && previous.state === status.state
      && previous.error === status.error
      && previous.elapsedSec === status.elapsedSec) return;

  const messageId = String(message.clientId || message.id || '');
  const updated = updateMessageSnapshot(message, {
    _liveStatus: status,
    _toolRunRev: (message._toolRunRev || 0) + 1,
  }, true);
  if (!updated) return;
  publishReactChatRuntime({ type: 'tool-run-updated', messageId });
}

/** Publish a thinking-panel lifecycle event without making the panel mandatory. */
export function publishThinkingPanelEvent(event) {
  try {
    const bridge = window.__socratesThinkingPanelBridge;
    if (bridge && typeof bridge.publish === 'function') bridge.publish(event);
  } catch (_) { /* optional React panel */ }
}

/** Notify the thinking panel that a new turn has started. */
export function publishThinkingTurnStart() {
  publishThinkingPanelEvent({ type: 'turn-start' });
}
