import { useAttachments, useAttachmentsRemove, useAttachmentsRetry } from './attachments.store';
import { AttachmentChip } from './AttachmentChip';

/** The parent frame owns visibility from the same attachment store. */
export function ComposerAttachmentChips() {
  const attachments = useAttachments();
  const onRemove = useAttachmentsRemove();
  const onRetry = useAttachmentsRetry();

  return (
    <>
      {attachments.map((entry) => (
        <AttachmentChip key={entry.id} entry={entry} onRemove={onRemove} onRetry={onRetry} />
      ))}
    </>
  );
}
