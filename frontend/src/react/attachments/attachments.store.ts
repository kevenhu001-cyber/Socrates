import { useBridge, useBridgeSelector } from '../../store/index.ts';
import { attachmentsState } from '../../legacy/attachmentsState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { AttachmentEntry, AttachmentsSnapshot } from '../../legacy/attachmentsState.ts';

export function getAttachmentsSnapshot(): AttachmentsSnapshot {
  return attachmentsState.getSnapshot();
}

export function subscribeToAttachments(listener: () => void): () => void {
  return attachmentsState.subscribe(listener);
}

export function useAttachmentsSnapshot(): AttachmentsSnapshot {
  return useBridge(attachmentsState);
}

export function useAttachments(): ReadonlyArray<AttachmentEntry> {
  return useBridgeSelector(attachmentsState, (snapshot) => snapshot.attachments);
}

export function useAttachmentsRemove(): (id: string) => void {
  return (id: string) => {
    getLegacyActions().composer.removeAttachment(id);
    getLegacyActions().composer.renderAttachmentChips?.();
  };
}

/* Failed uploads retain their source File, so retry can resume the same job. */
export function useAttachmentsRetry(): (id: string) => void {
  return (id: string) => {
    getLegacyActions().composer.retryAttachment?.(id);
    getLegacyActions().composer.renderAttachmentChips?.();
  };
}
