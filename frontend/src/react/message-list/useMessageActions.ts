import { stripIntelligenceUiBlocks } from '@socrates/core';
import type { LegacyChatMessage } from '../types/domain';
import type { MessageToolbarCallbacks } from './types';
import { getLegacyActions, i18n } from '../legacy/gateway.ts';
import { stripHtmlTags } from '../../util/stripHtml.ts';

function messageIdOf(message: LegacyChatMessage): string | null {
  if (message.id) return message.id;
  if (message.clientId) return message.clientId;
  return null;
}

function plainTextOf(message: LegacyChatMessage): string {
  let text = '';
  if (typeof message.rawText === 'string' && message.rawText.length > 0) {
    text = stripIntelligenceUiBlocks(message.rawText);
  } else if (typeof message.html === 'string' && message.html.length > 0) {
    text = stripHtmlToText(message.html);
  }
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();
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
    return stripHtmlTags(html).replace(/&nbsp;/g, ' ').trim();
  }
}

function fallbackCopy(text: string): void {
  void import('../legacy-controls/clipboardTextarea').then(({ copyTextWithShadcnTextarea }) => copyTextWithShadcnTextarea(text)).then(
    () => getLegacyActions().messages.showToast?.(i18n('clipboard.copied', 'Copied to clipboard')),
    () => getLegacyActions().messages.showToast?.(i18n('clipboard.failed', 'Copy failed')),
  );
}

function doCopy(message: LegacyChatMessage): void {
  const text = plainTextOf(message);
  if (!text) {
    getLegacyActions().messages.showToast?.(i18n('clipboard.nothing', 'Nothing to copy'));
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(
      () => getLegacyActions().messages.showToast?.(i18n('clipboard.copied', 'Copied to clipboard')),
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

function userMessageCallbacks(
  role: string,
  id: string | null,
  legacy: ReturnType<typeof getLegacyActions> | null,
): Pick<MessageToolbarCallbacks, 'onEdit' | 'onDelete'> {
  if (role !== 'user' || !id || !legacy) return {};
  return {
    onEdit: () => legacy.messages.editUserMessage(id),
    onDelete: () => legacy.messages.deleteUserMessage(id),
  };
}

function assistantMessageCallbacks(
  message: LegacyChatMessage,
  role: string,
  id: string | null,
  legacy: ReturnType<typeof getLegacyActions> | null,
): Pick<MessageToolbarCallbacks, 'onShare' | 'onRegenerate' | 'onThumbsUp' | 'onThumbsDown' | 'onBranch' | 'onReExplain' | 'onReadAloud' | 'onSwitchBranch'> {
  if (role !== 'assistant') return {};
  const callbacks: Pick<MessageToolbarCallbacks, 'onShare' | 'onRegenerate' | 'onThumbsUp' | 'onThumbsDown' | 'onBranch' | 'onReExplain' | 'onReadAloud' | 'onSwitchBranch'> = {
    onShare: () => getLegacyActions().messages.openShareModal(),
  };
  if (!id || !legacy) return callbacks;
  return {
    ...callbacks,
    onRegenerate: () => legacy.messages.regenerateAssistantMessage(id),
    onThumbsUp: () => legacy.messages.sendFeedback(id, 'up'),
    onThumbsDown: () => legacy.messages.sendFeedback(id, 'down'),
    onBranch: () => legacy.messages.branchFromMessage(id),
    onReExplain: () => legacy.messages.branchFromMessage(id, { reExplain: true }),
    onReadAloud: (event) => doReadAloud(message, event),
    onSwitchBranch: (targetIndex) => legacy.messages.switchMessageBranch(id, targetIndex),
  };
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
    ...userMessageCallbacks(role, id, legacy),
    ...assistantMessageCallbacks(message, role, id, legacy),
  };
}
