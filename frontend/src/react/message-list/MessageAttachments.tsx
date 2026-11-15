import { useState } from 'react';
import { FileCard, getFileExtension, formatFileSize } from '../attachments/FileCard';
import { t } from '../legacy/gateway.ts';
import type { LegacyChatMessage } from '../types/domain';

type MessageAttachment = NonNullable<LegacyChatMessage['attachments']>[number];

function MessageImageAttachment({
  attachment,
  fileUrl,
}: {
  attachment: MessageAttachment;
  fileUrl?: string;
}) {
  const [loadError, setLoadError] = useState(false);
  const imgSrc = attachment.dataUrl || fileUrl;
  const name = attachment.name || 'image';

  if (!imgSrc || loadError) {
    const ext = getFileExtension(name) || 'PNG';
    return (
      <FileCard
        name={name}
        size={attachment.size}
        subCaption={ext}
        href={fileUrl}
        className="msg-attachment-card"
      />
    );
  }

  const imageElem = (
    <div className="msg-attachment-image-card" title={name}>
      <img
        className="msg-attachment-img"
        src={imgSrc}
        alt={name}
        onError={() => setLoadError(true)}
      />
    </div>
  );

  if (fileUrl) {
    return (
      <a
        className="msg-attachment-image-link"
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={name}
      >
        {imageElem}
      </a>
    );
  }

  return imageElem;
}

export function MessageAttachments({ attachments }: { attachments: readonly MessageAttachment[] }) {
  if (!attachments.length) return null;

  return (
    <div className="msg-attachment-chips" aria-label={t('chrome.attachments')} data-i18n-aria="chrome.attachments">
      {attachments.map((attachment, index) => {
        const key = `${attachment.id ?? attachment.name ?? 'attachment'}-${index}`;
        const isImage = attachment.kind === 'image'
          || Boolean(attachment.dataUrl?.startsWith('data:image/'));

        const fileUrl = attachment.fileId
          ? `/api/v2/files/${attachment.fileId}/raw`
          : undefined;

        if (isImage) {
          return (
            <MessageImageAttachment
              key={key}
              attachment={attachment}
              fileUrl={fileUrl}
            />
          );
        }

        const legacyKind = String(attachment.docKind || '').toLowerCase();
        const legacyNotice = ['ppt'].includes(legacyKind)
          ? (t('chat.attach.metadataOnly') !== 'chat.attach.metadataOnly'
            ? String(t('chat.attach.metadataOnly'))
            : 'metadata only — convert to DOCX/XLSX/PPTX or PDF')
          : undefined;

        const ext = getFileExtension(attachment.name || attachment.docKind || '');
        const size = formatFileSize(attachment.size);
        const subCaption = legacyNotice || [ext, size].filter(Boolean).join(' · ') || ext;

        return (
          <FileCard
            key={key}
            name={attachment.name ?? 'file'}
            size={attachment.size}
            subCaption={subCaption}
            href={fileUrl}
            className="msg-attachment-card"
          />
        );
      })}
    </div>
  );
}
