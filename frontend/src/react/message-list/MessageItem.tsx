import { memo, useRef } from 'react';

import { hasTurnStructure, type ToolCallRecord } from '../tool-run/toolRunModel';
import type { LegacyChatMessage } from '../types/domain';
import { deriveTurnPresentationState } from '../../ui/turnActivityModel';
import { MessageToolbar } from './MessageToolbar';
import { MessageAttachments } from './MessageAttachments';
import { MessageBody } from './MessageBody';
import { TutorMessageActions } from './TutorMessageActions';
import { areMessageItemsEqual } from './messageItemMemo';
import type { MessageItemProps } from './types';
import { useMessagePostRender } from './useMessagePostRender';

type LiveFields = LegacyChatMessage & {
  _turnAnchorMinHeight?: number;
  _turnAnchorMarginTop?: number;
  /** Which anchor rule produced the reserve — see `data-viewport-anchor`. */
  _turnAnchorMode?: 'turn' | 'retry';
  /** px from the scroller's top edge the anchored row aims for. */
  _turnViewportTarget?: number;
};

interface TurnAnchor {
  minHeight: number;
  marginTop: number;
  style?: { minHeight?: string; marginTop?: string };
}

interface ViewportAnchorData {
  className: string;
  mode?: string;
  target?: string;
}

function messageRole(message: LegacyChatMessage): string {
  return typeof message.role === 'string' ? message.role : 'assistant';
}

function messageClientId(message: LegacyChatMessage): string {
  if (typeof message.clientId === 'string') return message.clientId;
  if (typeof message.id === 'string') return message.id;
  return '';
}

function viewportAnchorData(message: LiveFields, hasAnchor: boolean): ViewportAnchorData {
  return {
    className: hasAnchor ? ' turn-viewport-anchor' : '',
    mode: hasAnchor ? message._turnAnchorMode || 'turn' : undefined,
    target: hasAnchor && message._turnViewportTarget != null
      ? String(message._turnViewportTarget)
      : undefined,
  };
}

function toolbarRole(role: string): 'user' | 'assistant' {
  return role === 'user' ? 'user' : 'assistant';
}

function turnAnchorOf(message: LegacyChatMessage): TurnAnchor {
  const liveMessage = message as LiveFields;
  const minHeight = Number.isFinite(liveMessage._turnAnchorMinHeight)
    ? Math.max(0, Number(liveMessage._turnAnchorMinHeight))
    : 0;
  const marginTop = Number.isFinite(liveMessage._turnAnchorMarginTop)
    ? Math.max(0, Number(liveMessage._turnAnchorMarginTop))
    : 0;
  return {
    minHeight,
    marginTop,
    style: minHeight || marginTop ? {
      minHeight: minHeight ? `${minHeight}px` : undefined,
      marginTop: marginTop ? `${marginTop}px` : undefined,
    } : undefined,
  };
}

function usesDeclarativeBody(role: string): boolean {
  if (role !== 'assistant') return false;
  /* One assistant turn surface owns the complete lifecycle. Keeping the
     renderer stable across live, settled, and history snapshots prevents the
     answer from switching from the declarative body to a second innerHTML
     surface at the end of a turn. */
  return true;
}

function isRenderable(message: LegacyChatMessage, live: boolean): boolean {
  /* A turn in flight may have no text yet — its status line or running tool
     row is the content until the first token lands. */
  if (live) return true;
  if (typeof message.html === 'string' && message.html.length > 0) return true;
  if (typeof message.rawText === 'string' && message.rawText.length > 0) return true;
  /* A native tool can be the entire assistant answer. Once streaming settles,
     that turn still has visible declarative content even with zero prose.
     Without this check the row (and Intelligent UI attached to it) disappears
     exactly at the live -> settled boundary. */
  if (hasTurnStructure(
    typeof message.rawText === 'string' ? message.rawText : '',
    message.toolCalls as ReadonlyArray<ToolCallRecord> | undefined,
  )) return true;
  /* Older tool-only rows may not have a persisted textOffset. They still
     have visible legacy HTML and must remain in the same assistant surface. */
  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) return true;
  if (message.turnRuntime?.uiSurfaces.some((surface) => surface.phase === 'committed' && surface.nodes.length > 0)) return true;
  /* Attachment-only user messages still need a row; the chips are their
     entire content. */
  return Array.isArray(message.attachments) && message.attachments.length > 0;
}

function MessageItemBase({ message, isLatest }: MessageItemProps) {
  const role = messageRole(message);
  /* The chat runtime store gives React an immutable snapshot for this row. */
  const presentation = deriveTurnPresentationState(message);
  const isLive = role === 'assistant' && !presentation.isSettled;
  const clientId = messageClientId(message);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const html = typeof message.html === 'string' ? message.html : '';
  const liveMessage = message as LiveFields;
  const turnAnchor = turnAnchorOf(message);
  const hasTurnAnchor = turnAnchor.minHeight > 0 || turnAnchor.marginTop > 0;
  const anchorData = viewportAnchorData(liveMessage, hasTurnAnchor);
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  /* Keep the declarative tree mounted across the finish boundary so the
     toolbar and cursor transition without replacing the message body. */
  const declarative = usesDeclarativeBody(role);

  useMessagePostRender(message, html, clientId, isLive, bodyRef);

  if (!isRenderable(message, isLive) || !clientId) return null;

  /* Streaming bubbles remain in layout even when scrolled off-screen so the
     transcript's scrollHeight stays accurate while tokens arrive. */
  const bubbleStyle = isLive
    ? { ...(turnAnchor.style || {}), contentVisibility: 'visible' as const }
    : turnAnchor.style;
  const streamSettled = !isLive && role === 'assistant';

  return (
    <div
      className={`msg ${role}${anchorData.className}`}
      style={bubbleStyle}
      data-client-id={clientId}
      data-react-owned="1"
      data-viewport-anchor={anchorData.mode}
      data-viewport-target={anchorData.target}
      data-stream-settled={streamSettled ? 'true' : undefined}
    >
      {role === 'user' ? <MessageAttachments attachments={attachments} /> : null}
      <MessageBody
        message={message}
        role={role}
        html={html}
        isLive={isLive}
        declarative={declarative}
        bodyRef={bodyRef}
      />
      <TutorMessageActions message={message} messageId={clientId} isLatest={isLatest} />
      {role === 'user' || presentation.showToolbar || isLive ? <MessageToolbar message={message} role={toolbarRole(role)} pending={isLive} isLatest={isLatest} /> : null}
    </div>
  );
}

const MessageItem = memo(MessageItemBase, areMessageItemsEqual);

export { MessageItem };
export type { LegacyChatMessage };
