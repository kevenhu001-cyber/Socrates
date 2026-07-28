import { useLayoutEffect } from 'react';

import type { LegacyChatMessage } from '../types/domain';
import { MessageToolbar } from './MessageToolbar';
import { getLegacyActions } from '../legacy/gateway';

interface MessageItemProps {
  message: LegacyChatMessage;
}

function isRenderable(message: LegacyChatMessage): boolean {
  if (typeof message.html === 'string' && message.html.length > 0) return true;
  if (typeof message.rawText === 'string' && message.rawText.length > 0) return true;
  return false;
}

function MessageItem({ message }: MessageItemProps) {
  const role = typeof message.role === 'string' ? message.role : 'assistant';
  const clientId = typeof message.clientId === 'string' ? message.clientId
    : typeof message.id === 'string' ? message.id
    : '';
  const html = typeof message.html === 'string' ? message.html : '';
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
    <div className={`msg ${role}`} data-client-id={clientId} data-react-owned="1">
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
      <div
        className="msg-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <MessageToolbar message={message} role={role === 'user' ? 'user' : 'assistant'} />
    </div>
  );
}

export { MessageItem };
export type { LegacyChatMessage };
