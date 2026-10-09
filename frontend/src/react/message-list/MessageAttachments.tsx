import { useState } from 'react';

import { getAttachmentIcon, type IconSource } from '../attachments/fileIcons';
import { t } from '../legacy/gateway.ts';
import type { LegacyChatMessage } from '../types/domain';

type MessageAttachment = NonNullable<LegacyChatMessage['attachments']>[number];

function MessageAttachmentThumb({
  attachment,
  fileUrl,
  isImage,
}: {
  attachment: MessageAttachment;
  fileUrl?: string;
  isImage: boolean;
}) {
  /* dataUrl first (works when the file row is gone), then the durable raw URL.
     A failed source falls back to the kind icon tile rather than leaving a
     broken-image glyph inside history bubbles. */
  const [badSrc, setBadSrc] = useState<string | null>(null);
  const imgSrc = [attachment.dataUrl, isImage ? fileUrl : undefined]
    .filter((source): source is string => !!source && source !== badSrc)[0];
  if (!imgSrc) {
    const iconSource: IconSource = {
      kind: attachment.kind || '',
      docKind: attachment.docKind,
      mime: attachment.mime,
      name: attachment.name || '',
    };
    return (
      <span
        className="attachment-chip-icon"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: getAttachmentIcon(iconSource) }}
      />
    );
  }
  return (
    <img
      className="attachment-chip-thumb"
      src={imgSrc}
      alt=""
      onError={() => setBadSrc(imgSrc)}
    />
  );
}

export function MessageAttachments({ attachments }: { attachments: readonly MessageAttachment[] }) {
  if (!attachments.length) return null;

  return (
    <div className="msg-attachment-chips" aria-label={t('chrome.attachments')} data-i18n-aria="chrome.attachments">
      {attachments.map((attachment, index) => {
        const key = `${attachment.id ?? attachment.name ?? 'attachment'}-${index}`;
        const isImage = attachment.kind === 'image'
          || Boolean(attachment.dataUrl?.startsWith('data:image/'));
        /* Legacy Office rows carry metadata only (no extractor) — hover
           explains why the model can't quote them. */
        const legacyKind = String(attachment.docKind || '').toLowerCase();
        const legacyNotice = ['ppt'].includes(legacyKind)
          ? (t('chat.attach.metadataOnly') !== 'chat.attach.metadataOnly'
            ? String(t('chat.attach.metadataOnly'))
            : 'metadata only — convert to DOCX/XLSX/PPTX or PDF to make it readable')
          : undefined;
        const fileUrl = attachment.fileId
          ? `/api/v2/files/${attachment.fileId}/raw`
          : undefined;
        const inner = (
          <>
            <MessageAttachmentThumb attachment={attachment} fileUrl={fileUrl} isImage={isImage} />
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
            title={legacyNotice || (attachment.name ?? undefined)}
          >
            {inner}
          </a>
        ) : (
          <span className="attachment-chip" key={key} title={legacyNotice}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
