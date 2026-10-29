import { stateStore } from '../state/store.js';
import { publishReactChatRuntime } from './reactBridge.js';

interface LiveStatusSnapshot {
  phase?: unknown;
  label?: unknown;
  state?: unknown;
  mode?: unknown;
  error?: unknown;
  elapsedSec?: unknown;
  toolName?: unknown;
  retryable?: unknown;
  retryMode?: unknown;
  retryButtonId?: unknown;
}

interface MessageSnapshot {
  clientId?: string;
  id?: string;
  _liveStatus?: LiveStatusSnapshot | null;
  _toolRunRev?: number;
}

const LIVE_STATUS_FIELDS: ReadonlyArray<keyof LiveStatusSnapshot> = [
  'phase', 'label', 'state', 'mode', 'error', 'elapsedSec', 'toolName', 'retryMode', 'retryButtonId',
];

/** Update one message in the authoritative session store by identity. */
export function updateMessageSnapshot(
  message: MessageSnapshot | null | undefined,
  patch: Record<string, unknown>,
  deferNotify?: boolean,
) {
  if (!message) return null;
  const messageId = String(message.clientId || message.id || '');
  const messages = stateStore.read('messages') as MessageSnapshot[];
  let messageIndex = messages.indexOf(message);
  if (messageIndex < 0 && messageId) {
    messageIndex = messages.findIndex((entry) =>
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

function sameLiveStatus(
  previous: LiveStatusSnapshot | null | undefined,
  status: LiveStatusSnapshot | null | undefined,
): boolean {
  if (!previous || !status) return false;
  return LIVE_STATUS_FIELDS.every((field) => previous[field] === status[field]);
}

/** Publish the current live status for a streaming assistant message. */
export function setReactLiveStatus(
  message: MessageSnapshot | null | undefined,
  status: LiveStatusSnapshot | null | undefined,
): void {
  if (!message) return;
  const previous = message._liveStatus;
  if (previous === status || sameLiveStatus(previous, status)) return;

  const messageId = String(message.clientId || message.id || '');
  const updated = updateMessageSnapshot(message, {
    _liveStatus: status,
    _toolRunRev: (message._toolRunRev || 0) + 1,
  }, true);
  if (!updated) return;
  publishReactChatRuntime({ type: 'tool-run-updated', messageId });
}
