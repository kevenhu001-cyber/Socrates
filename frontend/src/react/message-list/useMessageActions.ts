import type { LegacyChatMessage } from '../types/domain';
import type { MessageToolbarCallbacks } from './types';
import { getLegacyActions } from '../legacy/gateway';

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
    getLegacyActions().messages.showToast?.('Copied');
  } catch (_) {
    getLegacyActions().messages.showToast?.('Copy failed');
  }
}

function doCopy(message: LegacyChatMessage): void {
  const text = plainTextOf(message);
  if (!text) {
    getLegacyActions().messages.showToast?.('Nothing to copy');
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(
      () => getLegacyActions().messages.showToast?.('Copied to clipboard'),
      () => fallbackCopy(text),
    );
  } else {
    fallbackCopy(text);
  }
}

function doReadAloud(message: LegacyChatMessage, ev: React.MouseEvent<HTMLButtonElement>): void {
  const text = plainTextOf(message);
  const legacy = getLegacyActions();
  if (typeof legacy.messages.toggleReadAloud !== 'function') return;
  /* P_tts-persist — forward the message id so /api/tts can persist
     the synthesized audio in tts_results. The toolbar onReadAloud
     callback is only attached to assistant messages that have an id
     (see useMessageToolbarCallbacks), so messageIdOf(message) is
     guaranteed to be defined here. */
  const id = messageIdOf(message);
  if (id) legacy.messages.toggleReadAloud(ev.currentTarget, text, id);
  else legacy.messages.toggleReadAloud(ev.currentTarget, text);
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
  const legacy = id ? getLegacyActions() : null;

  return {
    onCopy: () => doCopy(message),
    onEdit: role === 'user' && legacy
      ? () => legacy.messages.editUserMessage(id!)
      : undefined,
    onDelete: role === 'user' && legacy
      ? () => legacy.messages.deleteUserMessage(id!)
      : undefined,
    onShare: role === 'assistant'
      ? () => getLegacyActions().messages.openShareModal()
      : undefined,
    onRegenerate: role === 'assistant' && legacy
      ? () => legacy.messages.regenerateAssistantMessage(id!)
      : undefined,
    onThumbsUp: role === 'assistant' && legacy
      ? () => legacy.messages.sendFeedback(id!, 'up')
      : undefined,
    onThumbsDown: role === 'assistant' && legacy
      ? () => legacy.messages.sendFeedback(id!, 'down')
      : undefined,
    onBranch: role === 'assistant' && legacy
      ? () => legacy.messages.branchFromMessage(id!)
      : undefined,
    onReExplain: role === 'assistant' && legacy
      ? () => legacy.messages.branchFromMessage(id!, { reExplain: true })
      : undefined,
    onReadAloud: role === 'assistant' && id
      ? (ev: React.MouseEvent<HTMLButtonElement>) => doReadAloud(message, ev)
      : undefined,
  };
}
