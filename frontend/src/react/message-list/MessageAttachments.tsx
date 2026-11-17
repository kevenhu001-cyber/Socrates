import { useState } from 'react';
import { FileCard, getFileExtension, formatFileSize } from '../attachments/FileCard';
import { t } from '../legacy/gateway.ts';
import { canPreviewDocument, openDocumentPreview } from '../../legacy/docPreview.ts';
import type { ChatMessage } from '../types/domain';

type MessageAttachment = NonNullable<ChatMessage['attachments']>[number];

const PHOTO_ERROR_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="36"
    height="36"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 17 4.5-4.5 3 3L15 12l5 5" />
    <path d="M17 7v3.5M17 13.2v.3" />
  </svg>
);

function isImageAttachment(attachment: MessageAttachment): boolean {
  return attachment.kind === 'image' || Boolean(attachment.dataUrl?.startsWith('data:image/'));
}

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

  /* A broken or missing image keeps the picture frame and shows the
     photo-error glyph, exactly like the reference message file. Falling
     back to a document card made the same image change shape depending on
     whether its bytes had loaded yet. */
  if (!imgSrc || loadError) {
    return (
      <div
        className="msg-attachment-image-card msg-attachment-image-error"
        role="img"
        aria-label={name}
        title={name}
      >
        {PHOTO_ERROR_ICON}
      </div>
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

/** The reference pins the .ppt notice to its metadata-only limitation. */
function legacyPptNotice(attachment: MessageAttachment): string | undefined {
  const legacyKind = String(attachment.docKind || '').toLowerCase();
  if (!['ppt'].includes(legacyKind)) return undefined;
  return t('chat.attach.metadataOnly') !== 'chat.attach.metadataOnly'
    ? String(t('chat.attach.metadataOnly'))
    : 'metadata only — convert to DOCX/XLSX/PPTX or PDF';
}

/* Documents open the in-app preview drawer instead of forcing a download;
   only formats with no engine and no server text keep the raw link. The
   composer chips stay untouched (reference behavior: drafts only remove). */
function previewTrigger(attachment: MessageAttachment): { href?: string; onOpen?: () => void } {
  const fileId = attachment.fileId;
  if (!fileId) return {};
  const previewable = canPreviewDocument({
    fileId,
    name: attachment.name ?? 'file',
    mime: attachment.mime,
    size: attachment.size,
    docKind: attachment.docKind,
  });
  if (!previewable) return { href: `/api/v2/files/${fileId}/raw` };
  return {
    onOpen: () => {
      void openDocumentPreview({
        fileId,
        name: attachment.name ?? 'file',
        mime: attachment.mime,
        size: attachment.size,
        docKind: attachment.docKind,
      });
    },
  };
}

export function MessageAttachments({ attachments }: { attachments: readonly MessageAttachment[] }) {
  if (!attachments.length) return null;

  /* The reference shrinks image previews to 64px once the same message also
     carries a document, so a mixed message reads as one row of files rather
     than a wall of thumbnails. */
  const hasDocuments = attachments.some((attachment) => !isImageAttachment(attachment));

  return (
    <div
      className={`msg-attachment-chips${hasDocuments ? ' msg-attachment-chips--with-documents' : ''}`}
      aria-label={t('chrome.attachments')}
      data-i18n-aria="chrome.attachments"
    >
      {attachments.map((attachment, index) => {
        const key = `${attachment.id ?? attachment.name ?? 'attachment'}-${index}`;
        const isImage = isImageAttachment(attachment);

        const fileUrl = attachment.fileId ? `/api/v2/files/${attachment.fileId}/raw` : undefined;

        if (isImage) {
          return <MessageImageAttachment key={key} attachment={attachment} fileUrl={fileUrl} />;
        }

        const ext = getFileExtension(attachment.name || attachment.docKind || '');
        const size = formatFileSize(attachment.size);
        const subCaption =
          legacyPptNotice(attachment) || [ext, size].filter(Boolean).join(' · ') || ext;
        const { href, onOpen } = previewTrigger(attachment);

        return (
          <FileCard
            key={key}
            name={attachment.name ?? 'file'}
            size={attachment.size}
            subCaption={subCaption}
            href={href}
            onOpen={onOpen}
            className="msg-attachment-card"
          />
        );
      })}
    </div>
  );
}
