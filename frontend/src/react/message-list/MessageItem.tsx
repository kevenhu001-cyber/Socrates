import { memo, useLayoutEffect } from 'react';

import { hasTurnStructure, type ToolCallRecord } from '../tool-run/toolRunModel';
import { AssistantTurn } from '../tool-run/AssistantTurn';
import type { LegacyChatMessage } from '../types/domain';
import { MessageToolbar } from './MessageToolbar';
import { CanvasBlock } from '../canvas';
import { getLegacyActions } from '../legacy/gateway';
import { getAttachmentIcon } from '../attachments/fileIcons';

interface MessageItemProps {
  message: LegacyChatMessage;
  /**
   * `(message.rawText || '').length` as the list last read it. The streaming
   * pipeline writes `rawText` onto the object React already holds, so length —
   * not identity — is what proves the text moved.
   */
  textLength: number;
  /** `message._toolRunRev` as the list last read it; bumped by toolRuntime. */
  toolRevision: number;
}

type LiveFields = LegacyChatMessage & {
  _turnAnchorMinHeight?: number;
  _turnAnchorMarginTop?: number;
  /** Which anchor rule produced the reserve — see `data-viewport-anchor`. */
  _turnAnchorMode?: 'turn' | 'retry';
  /** px from the scroller's top edge the anchored row aims for. */
  _turnViewportTarget?: number;
};

function isRenderable(message: LegacyChatMessage, live: boolean): boolean {
  /* A turn that is still in flight may legitimately have no text yet — the
     status line ("Waiting for the model…", a running tool row) is the content
     until the first token lands. */
  if (live) return true;
  if (typeof message.html === 'string' && message.html.length > 0) return true;
  if (typeof message.rawText === 'string' && message.rawText.length > 0) return true;
  /* P_file-attachments — a user message that carries ONLY attachments
     (image/file with no caption) must still render: the chips are its
     entire content. Without this the row vanished the moment it was
     sent — the "uploaded image never shows in history" report. */
  if (Array.isArray(message.attachments) && message.attachments.length > 0) return true;
  return false;
}

function MessageItemBase({ message, textLength }: MessageItemProps) {
  const role = typeof message.role === 'string' ? message.role : 'assistant';
  /* The streaming pipeline no longer paints its own bubble when React owns
     #msgList: this entry IS the live answer, laid out from the same
     `rawText` + `toolCalls` as a finalized one. */
  const isLive = role === 'assistant' && message.type === 'streaming' && message._streamSettled !== true;
  const clientId = typeof message.clientId === 'string' ? message.clientId
    : typeof message.id === 'string' ? message.id
    : '';
  const html = typeof message.html === 'string' ? message.html : '';
  const liveMessage = message as LiveFields;
  const turnAnchorMinHeight = Number.isFinite(liveMessage._turnAnchorMinHeight)
    ? Math.max(0, Number(liveMessage._turnAnchorMinHeight))
    : 0;
  const turnAnchorMarginTop = Number.isFinite(liveMessage._turnAnchorMarginTop)
    ? Math.max(0, Number(liveMessage._turnAnchorMarginTop))
    : 0;
  const hasTurnAnchor = turnAnchorMinHeight > 0 || turnAnchorMarginTop > 0;
  const turnAnchorStyle = hasTurnAnchor ? {
    minHeight: turnAnchorMinHeight ? `${turnAnchorMinHeight}px` : undefined,
    marginTop: turnAnchorMarginTop ? `${turnAnchorMarginTop}px` : undefined,
  } : undefined;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  /* True when this turn's tool calls can be laid out from data or when
     rawText is present. Keeping declarative mode active across the finish
     boundary ensures the DOM container and component tree remain mounted
     seamlessly, preventing remount-driven visual flickers. */
  const declarative = role === 'assistant'
    && (isLive
      || (typeof message.rawText === 'string' && message.rawText.length > 0)
      || hasTurnStructure(
        typeof message.rawText === 'string' ? message.rawText : '',
        message.toolCalls as ToolCallRecord[] | undefined,
      ));

  // Post-render hooks the legacy pipeline uses to wire up code-block
  // expand buttons, image lightbox, mermaid render, viz cards. Each is
  // idempotent (the legacy implementations guard with their own
  // dataset flags) so re-running them on every React render is safe.
  useLayoutEffect(() => {
    if ((!html && !isLive) || !clientId) return;
    const root = document.querySelector(
      `[data-client-id="${CSS.escape(clientId)}"] .msg-body`,
    ) as HTMLElement | null;
    if (!root) return;
    const pr = getLegacyActions().postRender;
    /* Reclaim rendered viz/mermaid cards BEFORE the pending queues drain:
       a placeholder adopted here must not also get a fresh handshake. */
    try { pr.reclaimVizCards?.(root); } catch (_) { /* hook unavailable */ }
    try { pr.processPendingMermaid?.(); } catch (_) { /* hook unavailable */ }
    try { pr.processPendingViz?.(root); } catch (_) { }
    try { pr.processPendingVizActions?.(root); } catch (_) { }
    try { pr.wireCodeBlockHeaders?.(root); } catch (_) { }
    try { pr.wireMsgBodyImages?.(root); } catch (_) { }
    if (message.restoredFromHistory) {
      try {
        pr.restorePersistedMessageExtras?.(
          root,
          message as unknown as Record<string, unknown>,
          `history-${clientId}`,
        );
      } catch (_) { /* optional legacy renderer unavailable */ }
    }
    /* `textLength` is in the deps because a live answer grows in place: the
       message object is mutated rather than replaced, so nothing else here
       changes identity between frames. It never moves on a finalized entry,
       which costs this effect nothing on history. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, clientId, textLength, message, message.restoredFromHistory]);

  if (!isRenderable(message, isLive)) return null;
  if (!clientId) return null;

  /* Streaming needs the bubble laid out at its real height even when it is
     scrolled off-screen, or scrollHeight goes stale and auto-scroll
     undershoots the bottom (the reason the legacy bubble set this too). */
  const bubbleStyle = isLive
    ? { ...(turnAnchorStyle || {}), contentVisibility: 'visible' as const }
    : turnAnchorStyle;

  /* P_finish-stream-boundary — the bubble is "settled" as soon as finish()
     runs (cursor is going, toolbar is coming). The CSS uses this attribute
     to fade the toolbar in / cursor out without a remount. */
  const streamSettled = !isLive && role === 'assistant';

  return (
    <div
      className={`msg ${role}${hasTurnAnchor ? ' turn-viewport-anchor' : ''}`}
      style={bubbleStyle}
      data-client-id={clientId}
      data-react-owned="1"
      data-viewport-anchor={hasTurnAnchor ? liveMessage._turnAnchorMode || 'turn' : undefined}
      data-viewport-target={hasTurnAnchor && liveMessage._turnViewportTarget != null
        ? String(liveMessage._turnViewportTarget)
        : undefined}
      data-stream-settled={streamSettled ? 'true' : undefined}
    >
      {role === 'user' && attachments.length > 0 ? (
        <div className="msg-attachment-chips" aria-label="Attachments">
          {attachments.map((attachment, index) => {
            const key = `${attachment.id ?? attachment.name ?? 'attachment'}-${index}`;
            const isImage = attachment.kind === 'image'
              || attachment.dataUrl?.startsWith('data:image/');
            /* P_file-attachments — the durable file is the canonical
               source: /api/v2/files/:id/raw serves the original upload
               for thumbnails and click-through, so history reloads and
               non-multimodal turns still show the attachment. dataUrl
               remains the fallback for legacy inline rows. */
            const fileUrl = attachment.fileId
              ? `/api/v2/files/${attachment.fileId}/raw`
              : undefined;
            const imgSrc = attachment.dataUrl || (isImage ? fileUrl : undefined);
            const inner = (
              <>
                {imgSrc ? (
                  <img
                    className="attachment-chip-thumb"
                    src={imgSrc}
                    alt=""
                  />
                ) : (
                  <span
                    className="attachment-chip-icon"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: getAttachmentIcon(attachment) }}
                  />
                )}
                <span className="attachment-chip-name">{attachment.name ?? 'file'}</span>
              </>
            );
            return fileUrl ? (
              <a
                className="attachment-chip attachment-chip-link"
                key={key}
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
              </a>
            ) : (
              <span className="attachment-chip" key={key}>
                {inner}
              </span>
            );
          })}
        </div>
      ) : null}
      {message.outputMode === 'canvas' && message.canvasId && role === 'assistant' ? (
        <CanvasBlock
          message={message}
          html={html}
          canvasId={message.canvasId}
          originalText={typeof message.rawText === 'string' ? message.rawText : ''}
        />
      ) : declarative ? (
        /* A turn that fired tools lays out from toolCalls[], not from the
           html string that used to carry a second copy of those rows.
           `is-declarative` scopes the stylesheet block that re-enables the
           per-row meta/chevron the "screenshot-faithful" pass hid — see the
           end of styles.css. */
        <div className="msg-body is-declarative">
          <AssistantTurn message={message} live={isLive} />
        </div>
      ) : (
        <div className="msg-body" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {/* P_finish-stream-boundary — keep the toolbar in the same React tree
          on every render. During streaming a CSS rule hides it (opacity 0,
          pointer-events none) and the `data-stream-settled` attribute on the
          bubble fades it in once finish() has produced the final html. The
          cursor and the toolbar never coexist on screen and the row never
          remounts, so end-of-stream is one continuous frame. */}
      {role === 'user' ? (
        <MessageToolbar message={message} role="user" />
      ) : (
        <MessageToolbar message={message} role="assistant" />
      )}
    </div>
  );
}

/* The legacy pipeline MUTATES message objects in place — finish() assigns
   state.messages[i].html = finalHtml on the same object React already
   holds (main.js). A reference-equality memo would therefore never see a
   finished answer and would freeze the bubble mid-stream. Compare the
   fields actually rendered instead.

   `textLength` / `toolRevision` carry the two mutations that leave no
   trace on any comparable field: streamed text appended to rawText, and a
   tool call settling inside the SAME toolCalls array. The list reads them
   each render, so a turn whose only change is invisible to identity still
   repaints — and a turn with no change at all does not. (`_liveStatus`
   updates bump `toolRevision` too, via setReactLiveStatus.) */
const MessageItem = memo(MessageItemBase, (prev, next) => {
  if (prev.textLength !== next.textLength) return false;
  if (prev.toolRevision !== next.toolRevision) return false;
  const a = prev.message as LiveFields;
  const b = next.message as LiveFields;
  /* Same object, and neither counter moved: nothing rendered can have
     changed, because every field below is derived from the same reference. */
  if (a === b) return true;
  return (
    a.html === b.html
    && a.rawText === b.rawText
    /* The declarative renderer draws tool rows from this array, so it is part
       of what's rendered: a new array must re-render even when html/rawText
       did not move. */
    && a.toolCalls === b.toolCalls
    && a.role === b.role
    && a.clientId === b.clientId
    && a.id === b.id
    && a.type === b.type
    && a.outputMode === b.outputMode
    && a.canvasId === b.canvasId
    && a.restoredFromHistory === b.restoredFromHistory
    && a.attachments === b.attachments
    && a._liveStatus === b._liveStatus
    && a._turnAnchorMinHeight === b._turnAnchorMinHeight
    && a._turnAnchorMarginTop === b._turnAnchorMarginTop
    && a._turnAnchorMode === b._turnAnchorMode
    && a._turnViewportTarget === b._turnViewportTarget
  );
});

export { MessageItem };
export type { LegacyChatMessage };
