import { stateStore } from '../../state/store.js';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';
import type { LegacyChatMessage } from '../types/domain';

/** Persist a canvas edit through the session reducer and refresh React's chat snapshot. */
export function persistCanvasEdit(canvasId: string, editedText: string): boolean {
  if (!canvasId) return false;

  const messages = stateStore.read('messages');
  if (!Array.isArray(messages)) return false;

  const typedMessages = messages as LegacyChatMessage[];
  const index = typedMessages.findIndex((message) => message.canvasId === canvasId);
  if (index < 0) return false;

  const entry = typedMessages[index];
  const result = stateStore.dispatch({
    type: 'session/update-message',
    index,
    ...(typeof entry.clientId === 'string' ? { clientId: entry.clientId } : {}),
    patch: { editedText },
  });
  if (!result) return false;

  publishReactChatRuntime({ type: 'state-synced', reason: 'canvas-edited' });
  return true;
}
