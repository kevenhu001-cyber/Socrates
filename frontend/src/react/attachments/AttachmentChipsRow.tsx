import { useEffect, useLayoutEffect, useMemo } from 'react';

import {
  useAttachments,
  useAttachmentsRemove,
  useAttachmentsRetry,
  useAttachmentsSnapshot,
} from './attachments.store';
import { AttachmentChip } from './AttachmentChip';
import { syncComposerShellFlags } from '../../ui/composerShape.ts';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

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

  // React owns the attachment row inside the composer root. The outer host
  // keeps its stable id and class because legacy layout code reads both.
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
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: react/attachments/AttachmentChipsRow.tsx:47');
      /* detached shell */
    }
  }, [attachments.length, targetId]);

  const chips = useMemo(
    () =>
      attachments.map((entry) => (
        <AttachmentChip key={entry.id} entry={entry} onRemove={onRemove} onRetry={onRetry} />
      )),
    [attachments, onRemove, onRetry],
  );

  return <>{chips}</>;
}

export function ComposerAttachmentChips() {
  return <ChipsRow targetId={CHIPS_ID} />;
}
