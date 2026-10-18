/* Synchronous drag lifecycle kept on the hot path.
 * Browser drag events are timing-sensitive: dataTransfer must be populated
 * during the original dragstart callback, so these two tiny helpers must not
 * cross an async import boundary. */
export function onSessionDragStart(event: DragEvent, sessionId: string): void {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', sessionId);
  }
  const target = event.target as Element | null;
  if (target) target.classList.add('dragging');
}

export function onSessionDragEnd(event: DragEvent): void {
  const target = event.target as Element | null;
  if (target) target.classList.remove('dragging');
}
