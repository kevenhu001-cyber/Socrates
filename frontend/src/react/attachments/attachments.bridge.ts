/**
 * Attachments bridge — M2 single-bridge migration.
 *
 * Legacy `src/attachments.js` publishes the in-flight attachment list
 * through `window.__socratesAttachmentsBridge.publish(...)`. The factory
 * coalesces dispatch calls per animation frame, so the dedicated RAF
 * throttle from `attachmentsStore.ts` is gone — `createImmutableBridge`
 * does the same coalescing out of the box.
 *
 * M2 conventions
 *  - `getSnapshot` / `subscribe` / `dispatch` come from the factory.
 *  - `publish` is a thin alias for legacy callers.
 *  - React subscribers use `useBridge(bridge)` directly.
 */

import { createImmutableBridge, useBridge, useBridgeSelector } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type {
  AttachmentsBridge,
  AttachmentsSnapshot,
  AttachmentEntry,
} from './types';

declare global {
  interface Window {
    __socratesAttachmentsBridge?: AttachmentsBridge;
  }
}

const INITIAL: AttachmentsSnapshot = {
  attachments: [],
  revision: 0,
};

type Action = Omit<AttachmentsSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<AttachmentsSnapshot, Action>({
  initial: INITIAL,
  reducer: (_state, action) => ({
    ...action,
    attachments: Object.freeze([...action.attachments]),
  }),
});

const bridge: AttachmentsBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as AttachmentsBridge;

export function installAttachmentsBridge(): AttachmentsBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesAttachmentsBridge) {
      window.__socratesAttachmentsBridge = bridge;
    }
    return window.__socratesAttachmentsBridge;
  }
  return bridge;
}

export function getAttachmentsSnapshot(): AttachmentsSnapshot {
  return installAttachmentsBridge().getSnapshot();
}

export function subscribeToAttachments(listener: () => void): () => void {
  return installAttachmentsBridge().subscribe(listener);
}

export function useAttachmentsSnapshot(): AttachmentsSnapshot {
  return useBridge(factoryBridge);
}

export function useAttachments(): ReadonlyArray<AttachmentEntry> {
  return useBridgeSelector(factoryBridge, (snapshot) => snapshot.attachments);
}

export function useAttachmentsRemove(): (id: string) => void {
  return (id: string) => {
    getLegacyActions().composer.removeAttachment(id);
    getLegacyActions().composer.renderAttachmentChips?.();
  };
}
