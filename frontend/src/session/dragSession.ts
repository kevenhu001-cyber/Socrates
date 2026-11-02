/* Synchronous drag lifecycle kept on the hot path.
 * Browser drag events are timing-sensitive: dataTransfer must be populated
 * during the original dragstart callback, so these two tiny helpers must not
 * cross an async import boundary.
 *
 * RN-10: the faded "dragging" look is React state on the row
 * (react/session-list/SessionRow.tsx → ConversationRow), not a class this
 * helper toggles on the DOM. */
export function onSessionDragStart(event: DragEvent, sessionId: string): void {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', sessionId);
  }
}

export function onSessionDragEnd(_event: DragEvent): void {
  /* Nothing to undo: the row clears its own dragging state. */
}
