import { memo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

import type { ChatMessage } from '../types/domain';
import { deriveTurnPresentationState } from '../../legacy/turnActivityModel';
import { useMessageContextMenu } from './useMessageContextMenu';
import { TutorMessageActions } from './TutorMessageActions';
import { MessageToolbar } from './MessageToolbar';
import { MessageAttachments } from './MessageAttachments';
import { MessageBody } from './MessageBody';
import { MessageEditForm } from './MessageEditForm';
import { areMessageItemsEqual } from './messageItemMemo';
import type { MessageItemProps } from './types';
import { useMessagePostRender } from './useMessagePostRender';
import { commitUserMessageEdit } from '../../chat/editBranch.ts';
import { stripMarkdown } from '../../render/markdown.ts';
import { i18n } from '../../ui/legacyI18n.ts';

type LiveFields = ChatMessage & {
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

function messageRole(message: ChatMessage): string {
  return typeof message.role === 'string' ? message.role : 'assistant';
}

function messageClientId(message: ChatMessage): string {
  if (typeof message.clientId === 'string') return message.clientId;
  if (typeof message.id === 'string') return message.id;
  return '';
}

function messageBodyFields(message: ChatMessage) {
  return {
    html: typeof message.html === 'string' ? message.html : '',
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
  };
}

function viewportAnchorData(message: LiveFields, hasAnchor: boolean): ViewportAnchorData {
  return {
    className: hasAnchor ? ' turn-viewport-anchor' : '',
    mode: hasAnchor ? message._turnAnchorMode || 'turn' : undefined,
    target:
      hasAnchor && message._turnViewportTarget != null
        ? String(message._turnViewportTarget)
        : undefined,
  };
}

function toolbarRole(role: string): 'user' | 'assistant' {
  return role === 'user' ? 'user' : 'assistant';
}

function turnAnchorOf(message: ChatMessage): TurnAnchor {
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
    style:
      minHeight || marginTop
        ? {
            minHeight: minHeight ? `${minHeight}px` : undefined,
            marginTop: marginTop ? `${marginTop}px` : undefined,
          }
        : undefined,
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

function isRenderable(message: ChatMessage, live: boolean): boolean {
  /* A turn in flight may have no text yet — its status line or running tool
     row is the content until the first token lands. */
  if (live) return true;
  if (typeof message.html === 'string' && message.html.length > 0) return true;
  if (typeof message.rawText === 'string' && message.rawText.length > 0) return true;
  /* Tool-only answers remain visible after settling, including historical
     calls without a persisted textOffset. Layout owns offset recovery. */
  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) return true;
  if (
    message.turnRuntime?.uiSurfaces.some(
      (surface) => surface.phase === 'committed' && surface.nodes.length > 0,
    )
  )
    return true;
  /* Attachment-only user messages still need a row; the chips are their
     entire content. */
  return Array.isArray(message.attachments) && message.attachments.length > 0;
}

function MessageContent({
  editing,
  message,
  role,
  html,
  isLive,
  readOnly,
  declarative,
  bodyRef,
  onCancelEdit,
  onCommitEdit,
}: {
  editing: boolean;
  message: ChatMessage;
  role: string;
  html: string;
  isLive: boolean;
  readOnly: boolean;
  declarative: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
  onCancelEdit: () => void;
  onCommitEdit: (text: string) => void;
}) {
  if (editing && role === 'user') {
    /* The editor replaces the bubble rather than sitting inside it, so the
       user-bubble paint/padding rules cannot leak around the edit surface. */
    return (
      <div className="msg-edit-host">
        <MessageEditForm
          initialText={stripMarkdown(typeof message.rawText === 'string' ? message.rawText : '')}
          cancelLabel={i18n('common.cancel', 'Cancel')}
          submitLabel={i18n('chat.send', 'Send')}
          onCancel={onCancelEdit}
          onCommit={onCommitEdit}
        />
      </div>
    );
  }
  return (
    <MessageBody
      message={message}
      role={role}
      html={html}
      isLive={isLive}
      readOnly={readOnly}
      declarative={declarative}
      bodyRef={bodyRef}
    />
  );
}

function shouldShowToolbar(
  role: string,
  showSettledToolbar: boolean,
  isLive: boolean,
  readOnly: boolean,
  editing: boolean,
): boolean {
  return !readOnly && !editing && (role === 'user' || showSettledToolbar || isLive);
}

function userEditHandler(
  role: string,
  setEditing: (editing: boolean) => void,
): (() => void) | undefined {
  return role === 'user' ? () => setEditing(true) : undefined;
}

const HOVER_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

function subscribeHoverCapable(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(HOVER_POINTER_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function readHoverCapable(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(HOVER_POINTER_QUERY).matches;
}

function useHoverCapable(): boolean {
  return useSyncExternalStore(subscribeHoverCapable, readHoverCapable, () => false);
}

/** Derive visibility once so the row and its toolbar share the same gates.
 * Desktop pointer devices align with ChatGPT: every settled/user message
 * mounts its inline `.msg-toolbar` (revealed on hover/focus-within via CSS)
 * while retaining the right-click context menu on historical rows. Touch
 * devices keep only the latest row's inline bar to avoid visual clutter. */
function messageRowVisibility(
  role: string,
  showSettledToolbar: boolean,
  isLive: boolean,
  readOnly: boolean,
  editing: boolean,
  isLatestOfRole: boolean,
  isDesktopHover: boolean,
) {
  const showContextMenu = !readOnly && !editing && !isLatestOfRole && !isLive;
  return {
    showContextMenu,
    showHistoryToolbar: showContextMenu && !isDesktopHover,
    showToolbar:
      (isLatestOfRole || isDesktopHover) &&
      shouldShowToolbar(role, showSettledToolbar, isLive, readOnly, editing),
    tabIndex: !readOnly && !isLatestOfRole ? 0 : undefined,
  };
}

function MessageItemBase({
  message,
  isLatest,
  isLatestOfRole = isLatest,
  readOnly = false,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const role = messageRole(message);
  /* The chat runtime store gives React an immutable snapshot for this row. */
  const presentation = deriveTurnPresentationState(message);
  const isLive = role === 'assistant' && !presentation.isSettled;
  const clientId = messageClientId(message);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { html, attachments } = messageBodyFields(message);
  const liveMessage = message as LiveFields;
  const turnAnchor = turnAnchorOf(message);
  const hasTurnAnchor = Math.max(turnAnchor.minHeight, turnAnchor.marginTop) > 0;
  const anchorData = viewportAnchorData(liveMessage, hasTurnAnchor);
  /* Keep the declarative tree mounted across the finish boundary so the
     toolbar and cursor transition without replacing the message body. */
  const declarative = usesDeclarativeBody(role);
  const onEdit = userEditHandler(role, setEditing);
  const isDesktopHover = useHoverCapable();
  const visibility = messageRowVisibility(
    role,
    presentation.showToolbar,
    isLive,
    readOnly,
    editing,
    Boolean(isLatestOfRole),
    isDesktopHover,
  );
  const contextMenu = useMessageContextMenu(visibility.showContextMenu);

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
      {...contextMenu.handlers}
      tabIndex={visibility.tabIndex}
      data-client-id={clientId}
      data-react-owned="1"
      data-viewport-anchor={anchorData.mode}
      data-viewport-target={anchorData.target}
      data-stream-settled={streamSettled ? 'true' : undefined}
    >
      {role === 'user' ? <MessageAttachments attachments={attachments} /> : null}
      <MessageContent
        editing={editing}
        message={message}
        role={role}
        html={html}
        isLive={isLive}
        readOnly={readOnly}
        declarative={declarative}
        bodyRef={bodyRef}
        onCancelEdit={() => setEditing(false)}
        onCommitEdit={(text) => {
          setEditing(false);
          commitUserMessageEdit(clientId, text);
        }}
      />
      {!readOnly && !isLive ? (
        <TutorMessageActions message={message} messageId={clientId} isLatest={isLatest} />
      ) : null}
      {visibility.showHistoryToolbar ? (
        <MessageToolbar
          message={message}
          role={toolbarRole(role)}
          isLatest={visibility.showToolbar ? undefined : false}
          onEdit={onEdit}
          contextMenu={contextMenu}
        />
      ) : null}
      {visibility.showToolbar ? (
        <MessageToolbar
          message={message}
          role={toolbarRole(role)}
          pending={isLive}
          isLatest={Boolean(isLatestOfRole)}
          onEdit={onEdit}
        />
      ) : null}
    </div>
  );
}

const MessageItem = memo(MessageItemBase, areMessageItemsEqual);

export { MessageItem };
export type { ChatMessage };
