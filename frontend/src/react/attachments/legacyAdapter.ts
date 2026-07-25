import { useSyncExternalStore } from 'react';

import {
  getAttachmentsSnapshot,
  subscribeToAttachments,
} from './attachmentsStore';
import type {
  AttachmentsSnapshot,
  AttachmentEntry,
} from './types';
import { getLegacyActions } from '../legacy/gateway';

declare global {
  interface Window {
    removeAttachment?: (id: string) => boolean;
  }

  interface Window {
    /* Legacy render entry — kept so React mode can call it after
       removeAttachment to refresh any out-of-band side effects
       (refreshAllSendBtns). It's a no-op in React mode because the
       render guard short-circuits the DOM write. */
    renderAttachmentChips?: () => void;
  }
}

export function useAttachmentsSnapshot(): AttachmentsSnapshot {
  return useSyncExternalStore(subscribeToAttachments, getAttachmentsSnapshot, getAttachmentsSnapshot);
}

export function useAttachments(): ReadonlyArray<AttachmentEntry> {
  return useSyncExternalStore(
    subscribeToAttachments,
    () => getAttachmentsSnapshot().attachments,
    () => [],
  );
}

export function useAttachmentsRemove(): (id: string) => void {
  return (id: string) => {
    getLegacyActions().composer.removeAttachment(id);
    getLegacyActions().composer.renderAttachmentChips?.();
  };
}