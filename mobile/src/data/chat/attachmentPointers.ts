import type { Attachment, Message } from '@socrates/contracts';
import type { ChatHistoryMessage } from '@socrates/core';
import { CHAT_HISTORY_MAX_TURNS } from '@socrates/core';

function pointerFor(attachment: Attachment): string | null {
  const fileId = attachment.fileId?.trim();
  if (!fileId) return null;
  // Keep filenames on one line and inside the quoted pointer syntax consumed by
  // the server's read_attachment routing hint.
  const name = String(attachment.name || 'attachment').replace(/[\r\n"]+/g, ' ').trim().slice(0, 160) || 'attachment';
  const mime = String(attachment.mime || 'application/octet-stream').replace(/[\r\n\[\]]+/g, ' ').slice(0, 100);
  const size = Number.isFinite(attachment.size) ? Math.max(0, attachment.size) : 0;
  return `[Attached file: "${name}" (${mime}, ${size} bytes) — fileId: ${fileId}]`;
}

/**
 * `@socrates/core` reconstructs inline image data and extracted document text,
 * but intentionally does not know about server file pointers. Add those only in
 * the mobile transport so persisted large images can be read by the existing
 * server `read_attachment` tool without changing shared/core or Web behavior.
 */
export function appendAttachmentPointers(
  history: ChatHistoryMessage[],
  messages: Message[],
): ChatHistoryMessage[] {
  const source = messages.length > CHAT_HISTORY_MAX_TURNS * 2
    ? messages.slice(-CHAT_HISTORY_MAX_TURNS * 2)
    : messages;
  const userMessages = source.filter((message) => {
    if (message.role !== 'user') return false;
    const text = String(message.rawText || message.content || '').trim();
    return Boolean(text || message.attachments?.length);
  });
  let userIndex = 0;
  return history.map((entry) => {
    if (entry.role !== 'user') return entry;
    const sourceMessage = userMessages[userIndex++];
    const pointers = (sourceMessage?.attachments || []).map(pointerFor).filter((value): value is string => Boolean(value));
    if (!pointers.length) return entry;
    const pointerText = pointers.join('\n');
    if (Array.isArray(entry.content)) {
      return { ...entry, content: [...entry.content, { type: 'text', text: pointerText }] };
    }
    return { ...entry, content: entry.content ? `${entry.content}\n\n${pointerText}` : pointerText };
  });
}
