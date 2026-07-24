import type { LegacyChatMessage } from '../types/domain';
import type { MessageToolbarCallbacks } from './types';

declare global {
  interface Window {
    editUserMessage?: (messageId: string) => void;
    deleteUserMessage?: (messageId: string) => void;
    regenerateAssistantMessage?: (messageId: string) => void;
    branchFromMessage?: (messageId: string) => void;
    sendFeedback?: (messageId: string, rating: 'up' | 'down') => void;
    openShareModal?: () => void;
    toggleReadAloud?: (target: HTMLElement, text: string) => void;
    showToast?: (msg: string) => void;
  }
}

function messageIdOf(message: LegacyChatMessage): string | null {
  if (message.id) return message.id;
  if (message.clientId) return message.clientId;
  return null;
}

function plainTextOf(message: LegacyChatMessage): string {
  if (typeof message.rawText === 'string' && message.rawText.length > 0) return message.rawText;
  if (typeof message.html === 'string' && message.html.length > 0) return stripHtmlToText(message.html);
  return '';
}

function stripHtmlToText(html: string): string {
  try {
    const doc = document.implementation.createHTMLDocument('');
    const container = doc.createElement('div');
    container.innerHTML = html;
    const brs = container.querySelectorAll('br');
    for (let i = 0; i < brs.length; i++) {
      brs[i].parentNode?.replaceChild(doc.createTextNode('\n'), brs[i]);
    }
    const blocks = container.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr');
    for (let j = blocks.length - 1; j >= 0; j--) {
      blocks[j].appendChild(doc.createTextNode('\n'));
    }
    return (container.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch (_) {
    return String(html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
}

function fallbackCopy(text: string): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    window.showToast?.('Copied');
  } catch (_) {
    window.showToast?.('Copy failed');
  }
}

function doCopy(message: LegacyChatMessage): void {
  const text = plainTextOf(message);
  if (!text) {
    window.showToast?.('Nothing to copy');
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(
      () => window.showToast?.('Copied to clipboard'),
      () => fallbackCopy(text),
    );
  } else {
    fallbackCopy(text);
  }
}

function doReadAloud(message: LegacyChatMessage, ev: React.MouseEvent<HTMLButtonElement>): void {
  const text = plainTextOf(message);
  if (typeof window.toggleReadAloud !== 'function') return;
  window.toggleReadAloud(ev.currentTarget, text);
}

/**
 * Returns the click handler bundle the toolbar expects. Each handler is
 * either a thin dispatcher to a legacy window global or a local helper.
 * Keeping the indirection in one place means the toolbar component stays
 * declarative (no `if (window.X)` noise in JSX).
 */
export function useMessageToolbarCallbacks(message: LegacyChatMessage): MessageToolbarCallbacks {
  const id = messageIdOf(message);
  const role = typeof message.role === 'string' ? message.role : '';

  return {
    onCopy: () => doCopy(message),
    onEdit: role === 'user' && id
      ? () => typeof window.editUserMessage === 'function' && window.editUserMessage(id)
      : undefined,
    onDelete: role === 'user' && id
      ? () => typeof window.deleteUserMessage === 'function' && window.deleteUserMessage(id)
      : undefined,
    onShare: role === 'assistant' && typeof window.openShareModal === 'function'
      ? () => window.openShareModal?.()
      : undefined,
    onRegenerate: role === 'assistant' && id
      ? () => typeof window.regenerateAssistantMessage === 'function' && window.regenerateAssistantMessage(id)
      : undefined,
    onThumbsUp: role === 'assistant' && id
      ? () => typeof window.sendFeedback === 'function' && window.sendFeedback(id, 'up')
      : undefined,
    onThumbsDown: role === 'assistant' && id
      ? () => typeof window.sendFeedback === 'function' && window.sendFeedback(id, 'down')
      : undefined,
    onBranch: role === 'assistant' && id
      ? () => typeof window.branchFromMessage === 'function' && window.branchFromMessage(id)
      : undefined,
    onReadAloud: role === 'assistant' && id
      ? (ev: React.MouseEvent<HTMLButtonElement>) => doReadAloud(message, ev)
      : undefined,
  };
}
