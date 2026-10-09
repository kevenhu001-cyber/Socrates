import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  installAttachmentsBridge,
  useAttachments,
  useAttachmentsRemove,
  useAttachmentsRetry,
  useAttachmentsSnapshot,
} from './attachments.bridge';
import { AttachmentChip } from './AttachmentChip';
import { syncComposerShellFlags } from '../../ui/composerShape.js';

const CHIPS_ID = 'composerAttachmentChips';

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
  /* Shape flags before paint: the shell grid must already be two-row when
     the chips paint, otherwise the first frame flashes single-row. */
  useLayoutEffect(() => {
    try {
      const el = document.getElementById(targetId);
      const shell = el && el.closest ? el.closest('.composer-shell') : null;
      if (shell) syncComposerShellFlags(shell);
      else {
        const fallback = document.getElementById('composerInputWrap');
        if (fallback) syncComposerShellFlags(fallback);
      }
    } catch (_) { /* detached shell */ }
  }, [attachments.length, targetId]);

  const chips = useMemo(
    () =>
      attachments.map((entry) => (
        <AttachmentChip key={entry.id} entry={entry} onRemove={onRemove} onRetry={onRetry} />
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
