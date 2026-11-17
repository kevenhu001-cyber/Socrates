/**
 * Superseded placeholder rows: hide them without moving the transcript, then
 * drop them from the session state.
 */
import { dispatchSession, sessionStore } from '../../../store/index.ts';
import { publishReactChatRuntime } from '../../../ui/reactBridge.ts';
import { writeScrollTop } from '../../../ui/scrollCoordinator.ts';
import { suppressScrollPositionIntent } from '../../../ui/scrollPill.ts';
import type { MessageEntry } from '../../../ui/messageActions.ts';
import type { TurnAnchorList } from './ownership.ts';

function hideStubAndPreserveScroll(list: TurnAnchorList, row: HTMLElement): void {
  const users = list.querySelectorAll('.msg.user');
  const reference = users.length ? (users[users.length - 1] as HTMLElement) : null;
  const referenceTop = reference ? reference.getBoundingClientRect().top : null;
  row.style.display = 'none';
  if (!reference || referenceTop == null) return;
  const drift = reference.getBoundingClientRect().top - referenceTop;
  if (Math.abs(drift) <= 0.5) return;
  suppressScrollPositionIntent(200);
  writeScrollTop(list, Math.max(0, list.scrollTop + drift), 'turn');
}

function removeSupersededMessage(id: string): void {
  const messages = sessionStore.getState().messages as MessageEntry[];
  const index = messages.findIndex((entry) => entry && entry.clientId === id);
  if (index < 0) return;
  dispatchSession({ type: 'session/remove-message-at', index, clientId: id });
  publishReactChatRuntime({ type: 'state-synced', reason: 'superseded-stub-removed' });
}

/**
 * Remove a superseded empty placeholder (kept as an invisible layout stub)
 * once it is spent. Defers while a send anchor is gliding so the
 * compensation write cannot cancel the motion; safe to call repeatedly.
 */
export function removeSupersededStub(clientId: string): void {
  const list =
    typeof document !== 'undefined'
      ? (document.getElementById('msgList') as TurnAnchorList | null)
      : null;
  if (!list) return;
  if (list.dataset && list.dataset.turnAnchorSettling === 'true') {
    setTimeout(() => removeSupersededStub(clientId), 300);
    return;
  }
  const id = String(clientId || '');
  if (!id) return;
  const esc =
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
  const row = list.querySelector(`.msg[data-client-id="${esc}"]`) as HTMLElement | null;
  if (!row) return;
  hideStubAndPreserveScroll(list, row);
  removeSupersededMessage(id);
}
