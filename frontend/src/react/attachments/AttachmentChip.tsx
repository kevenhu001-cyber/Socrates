import { Button as UiButton } from '../ui/Button';
import { useState } from 'react';

import { getAttachmentIcon } from './fileIcons';
import { t as translate } from '../legacy/gateway.ts';
import type { AttachmentEntry } from '../../ui/attachmentsState.ts';

interface AttachmentChipProps {
  entry: AttachmentEntry;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

function i18n(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}

const REMOVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
const RETRY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
const ERROR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v6"/><path d="M12 16.8v.2"/></svg>';

function truncateName(name: string): string {
  if (!name) return 'file';
  return name.length > 60 ? name.slice(0, 57) + '…' : name;
}

const LEGACY_UNREADABLE = new Set(['ppt']);

function isLegacyUnreadable(entry: AttachmentEntry): boolean {
  return LEGACY_UNREADABLE.has(String(entry.docKind || '').toLowerCase());
}

function getExtension(name: string | undefined): string {
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

const DOC_EXTS = new Set(['doc', 'docx', 'rtf', 'odt', 'pages']);
const SHEET_EXTS = new Set(['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers']);
const SLIDE_EXTS = new Set(['ppt', 'pptx', 'odp', 'keynote']);
const CODE_EXTS = new Set([
  'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'yaml', 'yml',
  'c', 'cpp', 'rs', 'go', 'java', 'sh', 'sql', 'toml', 'md', 'xml',
]);
const TEXT_EXTS = new Set(['txt', 'log']);

const PDF_KEYS = new Set(['pdf', 'application/pdf']);

function isDoc(docKind: string, ext: string, kind?: string): boolean {
  return DOC_EXTS.has(docKind) || DOC_EXTS.has(ext) || kind === 'document';
}

function isPdf(docKind: string, ext: string, mime: string): boolean {
  return PDF_KEYS.has(docKind) || PDF_KEYS.has(ext) || PDF_KEYS.has(mime);
}

function resolveKindKey(docKind: string, ext: string, mime: string, kind?: string): string {
  if (isPdf(docKind, ext, mime)) return 'pdf';
  if (isDoc(docKind, ext, kind)) return 'document';
  if (SHEET_EXTS.has(docKind) || SHEET_EXTS.has(ext)) return 'spreadsheet';
  if (SLIDE_EXTS.has(docKind) || SLIDE_EXTS.has(ext)) return 'presentation';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'media';
  if (CODE_EXTS.has(ext) || kind === 'code') return 'code';
  if (TEXT_EXTS.has(ext) || mime.startsWith('text/')) return 'text';
  return 'file';
}

const KIND_FALLBACKS: Record<string, string> = {
  pdf: 'PDF',
  document: '文档',
  spreadsheet: '电子表格',
  presentation: '演示文稿',
  image: '图片',
  media: '媒体',
  code: '代码',
  text: '文本',
  file: '文件',
};

function kindCategory(entry: AttachmentEntry): string {
  const docKind = String(entry.docKind || '').toLowerCase();
  const ext = getExtension(entry.name);
  const mime = String(entry.mime || '').toLowerCase();
  const key = resolveKindKey(docKind, ext, mime, entry.kind);
  return i18n(`chat.attach.type.${key}`, KIND_FALLBACKS[key] || '文件');
}

function attachmentMeta(entry: AttachmentEntry): string {
  if (entry.pending) {
    if (entry.stage === 'processing') return i18n('chat.attach.processing', '正在保存…');
    if (entry.stage === 'queued') return `${i18n('chat.attach.queued', '排队中')}…`;
    return `${i18n('chat.attach.uploading', '上传中')}…`;
  }
  if (entry.error) {
    return displayError(entry);
  }
  if (entry.truncated) {
    return i18n('chat.attach.truncated', '（已截断）');
  }
  const category = kindCategory(entry);
  if (isLegacyUnreadable(entry)) {
    return `${category} · ${i18n('chat.attach.metadataOnly', '仅元数据')}`;
  }
  return category;
}

/* Raw server text (an English stack-ish message, a proxy body) is not UI
   copy. The reference card shows a short reason only when the uploader
   classified one, and falls back to the generic line otherwise; the raw
   message stays in the title/aria-label for diagnosis. */
const KNOWN_UPLOAD_ERRORS = [
  'chat.attach.networkError',
  'chat.attach.uploadTimeout',
  'chat.attach.cancelled',
  'chat.attach.failed',
];

function displayError(entry: AttachmentEntry): string {
  const error = String(entry.error || '');
  if (error && KNOWN_UPLOAD_ERRORS.some((key) => i18n(key, '') === error)) return error;
  return i18n('chat.attach.failed', '上传失败');
}

function formatBytes(bytes: number | undefined): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** "PDF · 2.4 MB" — the reference card's sub-caption. */
function fileSubCaption(entry: AttachmentEntry): string {
  const size = formatBytes(entry.size);
  const category = kindCategory(entry);
  if (isLegacyUnreadable(entry)) {
    return `${category} · ${i18n('chat.attach.metadataOnly', '仅元数据')}`;
  }
  return size ? `${category} · ${size}` : category;
}

interface AttachmentChipVisualProps {
  entry: AttachmentEntry;
  imageSrc?: string;
  isImage: boolean;
  canRetry: boolean;
  onImageError: () => void;
}

function UploadSpinner() {
  return <span className="attachment-chip-spinner" aria-hidden="true" />;
}

function AttachmentChipVisual({ entry, imageSrc, isImage, canRetry, onImageError }: AttachmentChipVisualProps) {
  const failed = Boolean(entry.error) && !entry.pending;
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
      ) : failed && canRetry ? null : entry.pending ? (
        <span className="attachment-chip-icon" aria-hidden="true"><UploadSpinner /></span>
      ) : (
        <span className="attachment-chip-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: getAttachmentIcon(entry) }} />
      )}
      {entry.pending && isImage ? (
        <span className="attachment-chip-veil" aria-hidden="true">
          <UploadSpinner />
        </span>
      ) : null}
      {failed && !canRetry && isImage ? (
        <span className="attachment-chip-error-badge" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ERROR_ICON }} />
      ) : null}
    </span>
  );
}

function AttachmentChipActions({ onRemove }: { onRemove: () => void }) {
  return (
    <UiButton
      type="button"
      className="attachment-chip-remove"
      aria-label={i18n('chat.attach.remove.aria', 'Remove attachment')}
      title={i18n('chat.attach.remove.aria', 'Remove attachment')}
      onClick={onRemove}
      dangerouslySetInnerHTML={{ __html: REMOVE_ICON }}
    />
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
  const canRetry = Boolean(entry.error) && !entry.pending;

  return (
    <div
      className={`attachment-chip ${isImage ? 'is-image' : 'is-file'}${entry.error ? ' error' : ''}${entry.pending ? ' pending' : ''}`}
      data-id={entry.id}
      data-stage={entry.pending ? (entry.stage || 'uploading') : entry.error ? 'error' : 'ready'}
      title={entry.error || entry.name || undefined}
      aria-label={isImage ? `${entry.name ?? 'Image'} — ${attachmentMeta(entry)}` : undefined}
      aria-busy={entry.pending ? true : undefined}
    >
      <AttachmentChipVisual
        entry={entry}
        imageSrc={imageSrc}
        isImage={isImage}
        canRetry={canRetry}
        onImageError={() => setBadSources((sources) => [...sources, imageSrc ?? ''])}
      />

      {canRetry ? (
        <UiButton
          type="button"
          className="attachment-chip-retry"
          aria-label={i18n('chat.attach.retry.aria', 'Retry upload')}
          title={entry.error || i18n('chat.attach.retry.aria', 'Retry upload')}
          onClick={() => onRetry(entry.id)}
        >
          <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: RETRY_ICON }} />
          {isImage ? <span className="attachment-chip-failed-reason">{displayError(entry)}</span> : null}
        </UiButton>
      ) : null}

      {isImage ? null : (
        <span className="attachment-chip-info">
          <span className="attachment-chip-name">{truncateName(entry.name ?? 'file')}</span>
          <span className="attachment-chip-meta">
            {entry.pending ? attachmentMeta(entry) : entry.error ? displayError(entry) : fileSubCaption(entry)}
          </span>
        </span>
      )}

      <AttachmentChipActions onRemove={() => onRemove(entry.id)} />
    </div>
  );
}
