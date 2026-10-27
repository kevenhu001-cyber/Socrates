import { dispatchSession, sessionStore } from '../../store/index.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';
import type { LegacyChatMessage } from '../types/domain';

/** Persist a canvas edit through the session reducer and refresh React's chat snapshot. */
export function persistCanvasEdit(canvasId: string, editedText: string): boolean {
  if (!canvasId) return false;

  /* The session snapshot is the typed view of the same state the legacy
   * facade reads through `stateStore.read('messages')` — one snapshot,
   * one source, no string key to mistype. */
  const messages = sessionStore.getState().messages;
  if (!Array.isArray(messages)) return false;

  const typedMessages = messages as LegacyChatMessage[];
  const index = typedMessages.findIndex((message) => message.canvasId === canvasId);
  if (index < 0) return false;

  const entry = typedMessages[index];
  const clientId = typeof entry.clientId === 'string' ? entry.clientId : undefined;
  const snapshot = dispatchSession({
    type: 'session/update-message',
    index,
    ...(clientId !== undefined ? { clientId } : {}),
    patch: { editedText },
  });

  /* The reducer refuses the edit when the message changed hands since the
   * index was resolved, so a stale write has to be reported as "not
   * applied" rather than as a successful edit. */
  const updated = snapshot.messages[index] ?? null;
  const result = clientId && entry.clientId !== clientId ? null : updated;
  if (!result) return false;

  publishReactChatRuntime({ type: 'state-synced', reason: 'canvas-edited' });
  return true;
}
