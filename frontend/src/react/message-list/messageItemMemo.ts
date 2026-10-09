import type { LegacyChatMessage } from '../types/domain';
import type { MessageItemProps } from './types';

type LiveFields = LegacyChatMessage & {
  _turnAnchorMinHeight?: number;
  _turnAnchorMarginTop?: number;
  _turnAnchorMode?: 'turn' | 'retry';
  _turnViewportTarget?: number;
  _playbackState?: 'idle' | 'playing' | 'starved' | 'draining' | 'done';
};

function sameRenderPayload(previous: LiveFields, next: LiveFields): boolean {
  return previous.html === next.html
    && previous.rawText === next.rawText
    /* Tool rows come from this array, so it participates in the rendered
       payload even when text and HTML stay unchanged. */
    && previous.toolCalls === next.toolCalls
    && previous.attachments === next.attachments
    && previous.outputMode === next.outputMode
    && previous.canvasId === next.canvasId;
}

function sameMessageState(previous: LiveFields, next: LiveFields): boolean {
  return previous.role === next.role
    && previous.clientId === next.clientId
    && previous.id === next.id
    && previous.type === next.type
    && previous.restoredFromHistory === next.restoredFromHistory
    && previous._liveStatus === next._liveStatus
    && previous._playbackState === next._playbackState;
}

function sameViewportAnchor(previous: LiveFields, next: LiveFields): boolean {
  return previous._turnAnchorMinHeight === next._turnAnchorMinHeight
    && previous._turnAnchorMarginTop === next._turnAnchorMarginTop
    && previous._turnAnchorMode === next._turnAnchorMode
    && previous._turnViewportTarget === next._turnViewportTarget;
}

export function areMessageItemsEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  if (prev.textLength !== next.textLength) return false;
  if (prev.toolRevision !== next.toolRevision) return false;
  if (prev.mathRevision !== next.mathRevision) return false;
  if (prev.renderRevision !== next.renderRevision) return false;
  const previous = prev.message as LiveFields;
  const nextMessage = next.message as LiveFields;
  if (previous._katexRenderedRev !== nextMessage._katexRenderedRev) return false;
  if (previous._renderRev !== nextMessage._renderRev) return false;
  /* Same object, and neither counter moved: nothing rendered can have
     changed, because every field below is derived from the same reference. */
  if (previous === nextMessage) return true;
  return sameRenderPayload(previous, nextMessage)
    && sameMessageState(previous, nextMessage)
    && sameViewportAnchor(previous, nextMessage);
}
