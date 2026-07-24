import { useEffect } from 'react';

import type { LegacyChatMessage } from '../types/domain';
import { MessageToolbar } from './MessageToolbar';

interface MessageItemProps {
  message: LegacyChatMessage;
}

declare global {
  interface Window {
    processPendingMermaid?: () => void;
    processPendingViz?: () => void;
    processPendingVizActions?: () => void;
    wireCodeBlockHeaders?: (root: HTMLElement) => void;
    wireMsgBodyImages?: (root: HTMLElement) => void;
  }
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

  // Post-render hooks the legacy pipeline uses to wire up code-block
  // expand buttons, image lightbox, mermaid render, viz cards. Each is
  // idempotent (the legacy implementations guard with their own
  // dataset flags) so re-running them on every React render is safe.
  useEffect(() => {
    if (!html) return;
    const root = document.querySelector(
      `[data-client-id="${CSS.escape(clientId)}"] .msg-body`,
    ) as HTMLElement | null;
    if (!root) return;
    try { window.processPendingMermaid?.(); } catch (_) { /* hook unavailable */ }
    try { window.processPendingViz?.(); } catch (_) { }
    try { window.processPendingVizActions?.(); } catch (_) { }
    try { window.wireCodeBlockHeaders?.(root); } catch (_) { }
    try { window.wireMsgBodyImages?.(root); } catch (_) { }
  }, [html, clientId]);

  if (!isRenderable(message)) return null;
  if (!clientId) return null;

  return (
    <div className={`msg ${role}`} data-client-id={clientId}>
      <div
        className="msg-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {role === 'assistant' && modelLabel ? (
        <div className="msg-model">{modelLabel}</div>
      ) : null}
      <MessageToolbar message={message} role={role === 'user' ? 'user' : 'assistant'} />
    </div>
  );
}

export { MessageItem };
export type { LegacyChatMessage };
