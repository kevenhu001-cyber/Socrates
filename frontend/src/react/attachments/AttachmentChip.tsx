import { useState } from 'react';

import { getAttachmentIcon } from './fileIcons';
import { t as translate } from '../legacy/gateway.ts';
import { formatAttachmentSize } from '../../attachments.js';
import type { AttachmentEntry } from './types';

interface AttachmentChipProps {
  entry: AttachmentEntry;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

function i18n(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}

const SPINNER_HTML = '<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>';
const REMOVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
const RETRY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';

function truncateName(name: string): string {
  if (!name) return 'file';
  return name.length > 60 ? name.slice(0, 57) + '…' : name;
}

const LEGACY_UNREADABLE = new Set(['ppt']);

function isLegacyUnreadable(entry: AttachmentEntry): boolean {
  return LEGACY_UNREADABLE.has(String(entry.docKind || '').toLowerCase());
}

function kindLabel(entry: AttachmentEntry): string {
  if (entry.docKind) return String(entry.docKind).toUpperCase();
  const name = String(entry.name || '');
  const dot = name.lastIndexOf('.');
  if (dot > 0) {
    const ext = name.slice(dot + 1);
    if (ext.length >= 1 && ext.length <= 5) return ext.toUpperCase();
  }
  return String(entry.kind || 'file').toUpperCase();
}

function attachmentMeta(entry: AttachmentEntry): string {
  const progress = Math.min(Math.max(entry.progress ?? 0, 0), 100);
  const baseMeta = entry.pending
    ? entry.stage === 'processing'
      ? i18n('chat.attach.processing', 'Saving…')
      : entry.stage === 'queued'
      ? `${i18n('chat.attach.queued', 'Queued')}… ${Math.round(progress)}%`
      : `${i18n('chat.attach.uploading', 'Uploading')}… ${Math.round(progress)}%`
    : entry.error
      ? i18n('chat.attach.failed', 'Upload failed')
      : entry.truncated
        ? i18n('chat.attach.truncated', '(truncated)')
        : `${kindLabel(entry)}${entry.size ? ` · ${formatAttachmentSize(entry.size)}` : ''}`;
  const meta = !entry.pending && !entry.error && isLegacyUnreadable(entry)
    ? `${baseMeta} · ${i18n('chat.attach.metadataOnly', 'metadata only — convert to DOCX/XLSX/PPTX or PDF to make it readable')}`
    : baseMeta;
  return meta;
}

interface AttachmentChipVisualProps {
  entry: AttachmentEntry;
  imageSrc?: string;
  isImage: boolean;
  onImageError: () => void;
}

function AttachmentChipVisual({ entry, imageSrc, isImage, onImageError }: AttachmentChipVisualProps) {
  return (
    <span className="attachment-chip-visual" data-kind={entry.docKind || entry.kind || 'file'}>
      {isImage && imageSrc ? (
        <img
          className="attachment-chip-thumb"
          decoding="async"
          src={imageSrc}
          alt={entry.name ?? ''}
          onError={onImageError}
        />
      ) : (
        <span className="attachment-chip-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: getAttachmentIcon(entry) }} />
      )}
      {entry.pending ? (
        <span className="attachment-chip-veil" aria-hidden="true">
          <span dangerouslySetInnerHTML={{ __html: SPINNER_HTML }} />
        </span>
      ) : null}
    </span>
  );
}

function pendingProgressLabel(entry: AttachmentEntry, progress: number): string {
  const pct = `${Math.round(progress)}%`;
  if (entry.stage === 'processing') return i18n('chat.attach.processing', 'Saving…');
  return entry.stage === 'queued'
    ? `${i18n('chat.attach.queued', 'Queued')} ${pct}`
    : `${i18n('chat.attach.uploading', 'Uploading')} ${pct}`;
}

function pendingProgressbarProps(entry: AttachmentEntry, progress: number, label: string) {
  return entry.pending
    ? {
        role: 'progressbar',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(progress),
        'aria-label': `${entry.name ?? 'file'} — ${label}`,
      }
    : {};
}

/* Determinate upload progress for a pending chip: a hairline bar for
   every kind, plus a % badge on image chips (their name+meta column
   stays hidden, so the veil spinner alone used to be the only signal). */
function AttachmentChipProgress({ entry, progress, isImage }: {
  entry: AttachmentEntry;
  progress: number;
  isImage: boolean;
}) {
  if (!entry.pending) return null;
  return (
    <>
      {isImage ? (
        <span className="attachment-chip-pct" aria-hidden="true">{`${Math.round(progress)}%`}</span>
      ) : null}
      <span className="attachment-chip-progress" {...pendingProgressbarProps(entry, progress, pendingProgressLabel(entry, progress))}>
        <span className="attachment-chip-progress-fill" style={{ width: `${progress}%` }} />
      </span>
    </>
  );
}
function AttachmentChipActions({ entry, onRemove, onRetry }: AttachmentChipProps) {
  return (
    <>
      {entry.error && !entry.pending ? (
        <button
          type="button"
          className="attachment-chip-retry"
          aria-label={i18n('chat.attach.retry.aria', 'Retry upload')}
          title={entry.error}
          onClick={() => onRetry(entry.id)}
          dangerouslySetInnerHTML={{ __html: RETRY_ICON }}
        />
      ) : null}
      <button
        type="button"
        className="attachment-chip-remove"
        aria-label={i18n('chat.attach.remove.aria', 'Remove attachment')}
        onClick={() => onRemove(entry.id)}
        dangerouslySetInnerHTML={{ __html: REMOVE_ICON }}
      />
    </>
  );
}

export function AttachmentChip({ entry, onRemove, onRetry }: AttachmentChipProps) {
  /* P_perf-blob-url — the browser lazily decodes only what the tile needs.
     After upload, the durable raw URL and then inline dataUrl take over. */
  const fileUrl = entry.fileId ? `/api/v2/files/${entry.fileId}/raw` : undefined;
  /* Try blob thumbnail → durable raw file → inline dataUrl; blacklist a
     failed source so the next candidate can take over. */
  const [badSources, setBadSources] = useState<string[]>([]);
  const imageSrc = [entry.thumbnailUrl, fileUrl, entry.dataUrl]
    .find((source) => !!source && !badSources.includes(source));
  const isImage = entry.kind === 'image';
  const progress = entry.pending ? Math.min(Math.max(entry.progress ?? 0, 0), 100) : 0;

  return (
    <div
      className={`attachment-chip${isImage ? ' is-image' : ''}${entry.error ? ' error' : ''}${entry.pending ? ' pending' : ''}`}
      data-id={entry.id}
      title={entry.error || entry.name || undefined}
      aria-label={isImage ? `${entry.name ?? 'Image'} — ${attachmentMeta(entry)}` : undefined}
    >
      <AttachmentChipVisual entry={entry} imageSrc={imageSrc} isImage={isImage} onImageError={() => setBadSources((sources) => [...sources, imageSrc ?? ''])} />

      {isImage ? null : (
        <span className="attachment-chip-info">
          <span className="attachment-chip-name">{truncateName(entry.name ?? 'file')}</span>
          <span className="attachment-chip-meta">{attachmentMeta(entry)}</span>
        </span>
      )}

      <AttachmentChipProgress entry={entry} progress={progress} isImage={isImage} />

      <AttachmentChipActions entry={entry} onRemove={onRemove} onRetry={onRetry} />
    </div>
  );
}
