import { ATTACHMENT_READY_TIMEOUT_MS, MAX_TOTAL_ATTACHMENTS } from './limits.js';
import { reportSwallow } from '../util/reportSwallow.ts';

export function formatAttachmentSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB';
  if (size >= 1024) return Math.round(size / 1024) + ' KB';
  return size + ' B';
}

/** The model-facing pointer line one durable attachment contributes. */
export function attachmentPointerLine(attachment) {
  const name = String((attachment && attachment.name) || 'file');
  const mime = String((attachment && attachment.mime) || 'application/octet-stream');
  return `[Attached file: "${name}" (${mime}, ${formatAttachmentSize(attachment && attachment.size)}) — fileId: ${attachment.fileId}. Call read_attachment with this fileId to read its contents.]`;
}

/**
 * Bind message-content assembly to the attachment state owner. The builder
 * only sees the small operations it needs and remains independent from XHR,
 * thumbnail lifetime, and composer mutation details.
 */
export function createBuildMessageContent({ getAttachments, waitForReady, supportsImages }) {
  return async function buildMessageContent(text, attachmentSnapshot) {
    const rawText = String(text || '');
    /* A cleared composer must not change the snapshot already claimed by a turn. */
    const turnAttachments = Array.isArray(attachmentSnapshot)
      ? attachmentSnapshot.slice()
      : getAttachments().slice();
    if (!turnAttachments.length) return { rawText, parts: rawText, attachmentList: [] };

    /* Protect this turn from later chip removal or retry operations. */
    for (const attachment of turnAttachments) {
      if (attachment) {
        attachment.sent = true;
        attachment._file = null;
      }
    }

    /* Do not send unresolved file pointers. Abort any upload that misses the
       send window so it cannot leave an unreferenced durable file behind. */
    await waitForReady(turnAttachments, ATTACHMENT_READY_TIMEOUT_MS);
    for (const attachment of turnAttachments) {
      if (attachment && attachment.pending && typeof attachment._abort === 'function') {
        try { attachment._abort(); }
        catch (error) { reportSwallow(error, 'attachments.buildMessageContent.abortStale'); }
      }
    }

    const multimodal = supportsImages();
    const parts = [];
    if (rawText) parts.push({ type: 'text', text: rawText });
    for (const attachment of turnAttachments) appendAttachmentParts(parts, attachment, multimodal);

    const attachmentList = turnAttachments.slice(0, MAX_TOTAL_ATTACHMENTS).map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      docKind: attachment.docKind,
      name: attachment.name,
      mime: attachment.mime,
      fileId: attachment.fileId,
      /* Durable files render from storage. Persist inline bytes only when
         upload failed and the image is the only usable copy this turn. */
      dataUrl: attachment.fileId ? undefined : attachment.dataUrl,
      text: attachment.text,
      truncated: attachment.truncated,
      size: attachment.size,
      error: attachment.error || (attachment.pending ? 'upload_incomplete' : undefined),
    }));

    return { rawText, parts, attachmentList };
  };
}

function appendAttachmentParts(parts, attachment, multimodal) {
  if (!attachment) return;
  if (appendPendingAttachment(parts, attachment)) return;
  appendImagePreview(parts, attachment, multimodal);
  if (appendFilePointer(parts, attachment)) return;
  if (appendUploadFailure(parts, attachment)) return;
  if (appendLegacyText(parts, attachment)) return;
  appendUnavailableImage(parts, attachment, multimodal);
}

function appendPendingAttachment(parts, attachment) {
  if (!attachment.pending) return false;
  parts.push({
    type: 'text',
    text: `[Attached file: "${attachment.name || 'file'}" did not finish uploading in time. Tell the user you could not read it and suggest retrying.]`,
  });
  return true;
}

function appendImagePreview(parts, attachment, multimodal) {
  if (attachment.kind === 'image' && attachment.dataUrl && multimodal) {
    /* Omit `detail`: some providers reject values such as "auto". */
    parts.push({ type: 'image_url', image_url: { url: attachment.dataUrl } });
  }
}

function appendFilePointer(parts, attachment) {
  if (!attachment.fileId) return false;
  parts.push({ type: 'text', text: attachmentPointerLine(attachment) });
  return true;
}

function appendUploadFailure(parts, attachment) {
  if (!attachment.error) return false;
  parts.push({
    type: 'text',
    text: `[Attached file: "${attachment.name || 'file'}" failed to upload (${attachment.error}). Tell the user you cannot read it and suggest retrying.]`,
  });
  return true;
}

function appendLegacyText(parts, attachment) {
  if (!isLegacyTextAttachment(attachment)) return false;
  const label = attachment.docKind
    ? `[Parsed ${String(attachment.docKind).toUpperCase()}: ${attachment.name || 'file'}]`
    : `[Parsed file: ${attachment.name || 'file'}]`;
  parts.push({ type: 'text', text: `${label}\n${attachment.text}` });
  return true;
}

function appendUnavailableImage(parts, attachment, multimodal) {
  if (attachment.kind === 'image' && attachment.dataUrl && !multimodal) {
    parts.push({
      type: 'text',
      text: `[User attached an image "${attachment.name || 'image'}" but it could not be uploaded, so you cannot view it. Tell the user and suggest re-uploading.]`,
    });
  }
}

function isLegacyTextAttachment(attachment) {
  return (attachment.kind === 'text' || attachment.kind === 'document' || attachment.kind === 'pdf')
    && attachment.text;
}
