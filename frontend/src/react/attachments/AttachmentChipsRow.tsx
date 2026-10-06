import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  installAttachmentsBridge,
  useAttachments,
  useAttachmentsRemove,
  useAttachmentsRetry,
  useAttachmentsSnapshot,
} from './attachments.bridge';
import { getAttachmentIcon } from './fileIcons';
import { t as _t } from '../legacy/gateway.ts';
import { formatAttachmentSize } from '../../attachments.js';
import type { AttachmentEntry } from './types';

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

const CHIPS_ID = 'composerAttachmentChips';

const SPINNER_HTML = '<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>';
const REMOVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
const RETRY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';

function truncateName(name: string): string {
  if (!name) return 'file';
  return name.length > 60 ? name.slice(0, 57) + '…' : name;
}

interface ChipProps {
  entry: AttachmentEntry;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

/* ChatGPT/Vercel-style meta label: the document/extension tag plus the
   size ("PDF · 2.3 MB"), "Uploading… 42%" while in flight, or a plain
   "Upload failed" the retry button clears. */
/* Legacy .ppt has no server-side text extractor (.doc/.xls parse now,
 * like ODT/ODS/ODP) — the model only ever sees its metadata. Surfaced
 * on the chip so the user learns this before asking about the contents,
 * not after. */
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

function Chip({ entry, onRemove, onRetry }: ChipProps) {
  /* P_perf-blob-url — prefer thumbnailUrl (URL.createObjectURL) for
     the chip <img> source. It's O(1) and the browser lazily decodes
     only what the tile needs. Once the upload resolves, the durable
     /api/v2/files/:id/raw URL (then the inline dataUrl) takes over so
     the chip survives composer resets and reloads. */
  const fileUrl = entry.fileId ? `/api/v2/files/${entry.fileId}/raw` : undefined;
  /* Fallback chain: blob thumbnail → durable raw file → inline dataUrl.
     A source that 404s/decode-fails is blacklisted and the next
     candidate takes over; when nothing loads the kind icon tile shows
     instead of a broken-image glyph. */
  const [badSrc, setBadSrc] = useState<string | null>(null);
  const imgCandidates = [entry.thumbnailUrl, fileUrl, entry.dataUrl]
    .filter((s): s is string => !!s && s !== badSrc);
  const imgSrc = imgCandidates[0];
  const isImage = entry.kind === 'image' && !!imgSrc;
  const progress = Math.min(Math.max(entry.progress ?? 0, 0), 100);
  const baseMeta = entry.pending
    ? `${i18n('chat.attach.uploading', 'Uploading')}… ${Math.round(progress)}%`
    : entry.error
      ? i18n('chat.attach.failed', 'Upload failed')
      : entry.truncated
        ? i18n('chat.attach.truncated', '(truncated)')
        : `${kindLabel(entry)}${entry.size ? ` · ${formatAttachmentSize(entry.size)}` : ''}`;
  const meta = !entry.pending && !entry.error && isLegacyUnreadable(entry)
    ? `${baseMeta} · ${i18n('chat.attach.metadataOnly', 'metadata only — convert to DOCX/XLSX/PPTX or PDF to make it readable')}`
    : baseMeta;

  return (
    <div
      className={`attachment-chip${isImage ? ' is-image' : ''}${entry.error ? ' error' : ''}${entry.pending ? ' pending' : ''}`}
      data-id={entry.id}
      title={entry.error || entry.name || undefined}
    >
      {/* Visual tile — thumbnail for images, kind-tinted icon tile for
          documents; the pending veil + spinner sit on top of it. */}
      <span className="attachment-chip-visual" data-kind={entry.docKind || entry.kind || 'file'}>
        {isImage ? (
          <img
            className="attachment-chip-thumb"
            src={imgSrc}
            alt={entry.name ?? ''}
            onError={() => setBadSrc(imgSrc ?? null)}
          />
        ) : (
          <span
            className="attachment-chip-icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: getAttachmentIcon(entry) }}
          />
        )}
        {entry.pending ? (
          <span className="attachment-chip-veil" aria-hidden="true">
            <span dangerouslySetInnerHTML={{ __html: SPINNER_HTML }} />
          </span>
        ) : null}
      </span>

      {isImage ? null : (
        <span className="attachment-chip-info">
          <span className="attachment-chip-name">{truncateName(entry.name ?? 'file')}</span>
          <span className="attachment-chip-meta">{meta}</span>
        </span>
      )}

      {/* Failed uploads offer an explicit retry — the entry still holds
          its File handle so the user never re-picks the file. */}
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
    </div>
  );
}

interface ChipsRowProps {
  targetId: string;
}

function ChipsRow({ targetId }: ChipsRowProps) {
  // Subscribe so re-renders fire on every attachments mutation.
  useAttachmentsSnapshot();
  const attachments = useAttachments();
  const onRemove = useAttachmentsRemove();
  const onRetry = useAttachmentsRetry();

  // The host element (e.g. #attachmentChips) is the hydration root — we
  // never re-render the host itself, only its children. React keeps the
  // host's id / classes / CSS in sync via attribute reconciliation;
  // mutating the `hidden` class on the host would still be safe via
  // useEffect, but the legacy CSS relies on `.hidden` toggling, so we
  // leave class management to the parent's logic (the host element
  // already gets the right class via React's reconciliation).
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    if (attachments.length > 0) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }, [attachments.length, targetId]);

  const chips = useMemo(
    () =>
      attachments.map((entry) => (
        <Chip key={entry.id} entry={entry} onRemove={onRemove} onRetry={onRetry} />
      )),
    [attachments, onRemove, onRetry],
  );

  // Fragment — the legacy-created host element stays as the React root;
  // we just append chips inside it.
  return <>{chips}</>;
}

export interface AttachmentChipsHandle {
  roots: Root[];
  destroy: () => void;
}

/**
 * Hydrate the single chips container of the single composer shell.
 * Idempotent — second call returns the existing handle. The host keeps
 * its id / classes / CSS — React owns only its direct children (the
 * chip buttons). The legacy renderer in `src/attachments/render.js` is
 * suppressed by a data-attribute guard so the two never collide.
 */
export function hydrateAttachmentChipsRows(): AttachmentChipsHandle | null {
  const target = document.getElementById(CHIPS_ID);

  installAttachmentsBridge();

  const roots: Root[] = [];

  if (target && !hostIsMountedBy(target, 'attachment-chips')) {
    const root = createRoot(target);
    root.render(<ChipsRow targetId={CHIPS_ID} />);
    markHostMountedBy(target, 'attachment-chips');
    roots.push(root);
  }

  if (roots.length === 0) return null;

  return {
    roots,
    destroy: () => {
      roots.forEach((root) => root.unmount());
      if (target) {
        clearHostMounted(target);
      }
    },
  };
}
