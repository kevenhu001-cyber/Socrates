import { memo, useLayoutEffect } from 'react';

import type { LegacyChatMessage } from '../types/domain';
import { MessageToolbar } from './MessageToolbar';
import { CanvasBlock } from '../canvas';
import { getLegacyActions } from '../legacy/gateway';

interface MessageItemProps {
  message: LegacyChatMessage;
}

type LiveFields = LegacyChatMessage & {
  _preserveLiveBody?: boolean;
  _liveBodyHandedOff?: boolean;
  _turnAnchorMinHeight?: number;
  _turnAnchorMarginTop?: number;
};

function isRenderable(message: LegacyChatMessage): boolean {
  if (typeof message.html === 'string' && message.html.length > 0) return true;
  if (typeof message.rawText === 'string' && message.rawText.length > 0) return true;
  return false;
}

function MessageItemBase({ message }: MessageItemProps) {
  const role = typeof message.role === 'string' ? message.role : 'assistant';
  const clientId = typeof message.clientId === 'string' ? message.clientId
    : typeof message.id === 'string' ? message.id
    : '';
  const html = typeof message.html === 'string' ? message.html : '';
  const liveMessage = message as LiveFields;
  const preserveLiveBody = Boolean(liveMessage._preserveLiveBody);
  const handoffPending = preserveLiveBody && !liveMessage._liveBodyHandedOff;
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
  const modelLabel = message.modelInfo?.label ?? '';
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  // Post-render hooks the legacy pipeline uses to wire up code-block
  // expand buttons, image lightbox, mermaid render, viz cards. Each is
  // idempotent (the legacy implementations guard with their own
  // dataset flags) so re-running them on every React render is safe.
  useLayoutEffect(() => {
    if (!html || !clientId) return;
    const root = document.querySelector(
      `[data-client-id="${CSS.escape(clientId)}"] .msg-body`,
    ) as HTMLElement | null;
    if (!root) return;
    const pr = getLegacyActions().postRender;
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
  }, [html, clientId, message, message.restoredFromHistory]);

  if (!isRenderable(message)) return null;
  if (!clientId) return null;

  return (
    <div
      className={`msg ${role}${hasTurnAnchor ? ' turn-viewport-anchor' : ''}`}
      style={turnAnchorStyle}
      data-client-id={clientId}
      data-react-owned="1"
      data-live-handoff-pending={handoffPending ? '1' : undefined}
      data-live-handoff-complete={preserveLiveBody && !handoffPending ? '1' : undefined}
    >
      {/* UI-align: model name sits above the body (open-webui pattern:
          avatar+name header row) instead of trailing below it. */}
      {role === 'assistant' && modelLabel ? (
        <div className="msg-model">
          <span className="msg-model-badge" aria-hidden="true">{modelLabel.charAt(0).toUpperCase()}</span>
          {modelLabel}
        </div>
      ) : null}
      {role === 'user' && attachments.length > 0 ? (
        <div className="msg-attachment-chips" aria-label="Attachments">
          {attachments.map((attachment, index) => {
            const key = `${attachment.name ?? 'attachment'}-${index}`;
            const isImage = attachment.kind === 'image'
              || attachment.dataUrl?.startsWith('data:image/');
            return (
              <span className="attachment-chip" key={key}>
                {isImage && attachment.dataUrl ? (
                  <img
                    className="attachment-chip-thumb"
                    src={attachment.dataUrl}
                    alt=""
                  />
                ) : (
                  <span className="attachment-chip-icon" aria-hidden="true">↗</span>
                )}
                <span className="attachment-chip-name">{attachment.name ?? 'file'}</span>
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
      ) : (
        <div
          className="msg-body"
          {...(!preserveLiveBody ? { dangerouslySetInnerHTML: { __html: html } } : {})}
        />
      )}
      <MessageToolbar message={message} role={role === 'user' ? 'user' : 'assistant'} />
    </div>
  );
}

/* The legacy pipeline MUTATES message objects in place — finish() assigns
   state.messages[i].html = finalHtml on the same object React already
   holds (main.js). A reference-equality memo would therefore never see a
   finished answer and would freeze the bubble mid-stream. Compare the
   fields actually rendered instead, and always re-render while a live
   body handoff is pending. */
const MessageItem = memo(MessageItemBase, (prev, next) => {
  const a = prev.message as LiveFields;
  const b = next.message as LiveFields;
  if (a === b) {
    return !a._preserveLiveBody || Boolean(a._liveBodyHandedOff);
  }
  return (
    a.html === b.html
    && a.rawText === b.rawText
    && a.role === b.role
    && a.clientId === b.clientId
    && a.id === b.id
    && a.type === b.type
    && a.outputMode === b.outputMode
    && a.canvasId === b.canvasId
    && a.restoredFromHistory === b.restoredFromHistory
    && a.attachments === b.attachments
    && a.modelInfo?.label === b.modelInfo?.label
    && a._preserveLiveBody === b._preserveLiveBody
    && a._liveBodyHandedOff === b._liveBodyHandedOff
    && a._turnAnchorMinHeight === b._turnAnchorMinHeight
    && a._turnAnchorMarginTop === b._turnAnchorMarginTop
  );
});

export { MessageItem };
export type { LegacyChatMessage };
