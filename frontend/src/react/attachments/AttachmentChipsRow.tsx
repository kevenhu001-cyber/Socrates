import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  installAttachmentsBridge,
  useAttachments,
  useAttachmentsRemove,
  useAttachmentsSnapshot,
} from './attachments.bridge';
import { getAttachmentIcon } from './fileIcons';
import type { AttachmentEntry } from './types';

const CHIPS_ID = 'attachmentChips';
const TOPIC_CHIPS_ID = 'topicAttachmentChips';

const SPINNER_HTML = '<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>';
const REMOVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

function truncateName(name: string): string {
  if (!name) return 'file';
  return name.length > 60 ? name.slice(0, 57) + '…' : name;
}

interface ChipProps {
  entry: AttachmentEntry;
  onRemove: (id: string) => void;
}

function Chip({ entry, onRemove }: ChipProps) {
  /* P_perf-blob-url — prefer thumbnailUrl (URL.createObjectURL) for
     the chip <img> source. It's O(1) and the browser lazily decodes
     only what the 28×28 chip needs. Falls back to dataUrl once the
     blob URL is revoked after the full base64 read completes. */
  const imgSrc = (entry.thumbnailUrl || entry.dataUrl) ?? undefined;
  const isImage = entry.kind === 'image' && !!imgSrc;
  const showSpinner = !!entry.pending;
  const showProgressBar = !!entry.pending && typeof entry.progress === 'number' && entry.progress >= 0;
  const showTruncatedBadge = !!entry.truncated && !entry.pending;
  const progressWidth = showProgressBar
    ? Math.min(Math.max(entry.progress ?? 0, 0), 100)
    : 0;

  return (
    <div
      className={`attachment-chip${entry.error ? ' error' : ''}${entry.pending ? ' pending' : ''}`}
      data-id={entry.id}
    >
      {showSpinner ? (
        <span
          className="attachment-chip-spinner"
          dangerouslySetInnerHTML={{ __html: SPINNER_HTML }}
        />
      ) : isImage ? (
        <img
          className="attachment-chip-thumb"
          src={imgSrc}
          alt={entry.name ?? ''}
        />
      ) : (
        <span
          className="attachment-chip-icon"
          dangerouslySetInnerHTML={{ __html: getAttachmentIcon(entry) }}
        />
      )}

      <span className="attachment-chip-name">{truncateName(entry.name ?? 'file')}</span>

      {showProgressBar ? (
        <div className="attachment-chip-progress-bar">
          <div
            className="attachment-chip-progress-fill"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      ) : showTruncatedBadge ? (
        <span className="attachment-chip-meta">(truncated)</span>
      ) : null}

      <button
        type="button"
        className="attachment-chip-remove"
        aria-label="Remove attachment"
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
        <Chip key={entry.id} entry={entry} onRemove={onRemove} />
      )),
    [attachments, onRemove],
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
 * Hydrate both legacy chips containers (`#attachmentChips` for the chat
 * composer and `#topicAttachmentChips` for the tutor-mode topic setup).
 * Idempotent — second call returns the existing handle. The host
 * elements keep their id / classes / CSS — React owns only their direct
 * children (the chip buttons). The legacy renderer in
 * `src/attachments/render.js` is suppressed by a data-attribute guard
 * so the two never collide.
 */
export function hydrateAttachmentChipsRows(): AttachmentChipsHandle | null {
  const chatTarget = document.getElementById(CHIPS_ID);
  const topicTarget = document.getElementById(TOPIC_CHIPS_ID);

  installAttachmentsBridge();

  const roots: Root[] = [];

  /* Each host is tagged independently so the registry can mount them as
     separate specs. */
  if (chatTarget && !hostIsMountedBy(chatTarget, 'attachment-chips')) {
    const chatRoot = createRoot(chatTarget);
    chatRoot.render(<ChipsRow targetId={CHIPS_ID} />);
    markHostMountedBy(chatTarget, 'attachment-chips');
    roots.push(chatRoot);
  }

  if (topicTarget && !hostIsMountedBy(topicTarget, 'attachment-chips')) {
    const topicRoot = createRoot(topicTarget);
    topicRoot.render(<ChipsRow targetId={TOPIC_CHIPS_ID} />);
    markHostMountedBy(topicTarget, 'attachment-chips');
    roots.push(topicRoot);
  }

  if (roots.length === 0) return null;

  return {
    roots,
    destroy: () => {
      roots.forEach((root) => root.unmount());
      if (chatTarget) {
        clearHostMounted(chatTarget);
      }
      if (topicTarget) {
        clearHostMounted(topicTarget);
      }
    },
  };
}
