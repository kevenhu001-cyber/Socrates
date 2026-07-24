import type {
  AttachmentsBridge,
  AttachmentsSnapshot,
  AttachmentEntry,
} from './types';

type Listener = () => void;

const EMPTY: AttachmentsSnapshot = Object.freeze({
  attachments: Object.freeze([] as ReadonlyArray<AttachmentEntry>),
  revision: 0,
});

let snapshot: AttachmentsSnapshot = EMPTY;
const listeners = new Set<Listener>();

function commit(next: Omit<AttachmentsSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    attachments: Object.freeze([...next.attachments]),
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

export function installAttachmentsBridge(): AttachmentsBridge {
  const existing = window.__socratesAttachmentsBridge;
  if (existing) return existing;
  const bridge: AttachmentsBridge = {
    getSnapshot: () => snapshot,
    publish: commit,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  window.__socratesAttachmentsBridge = bridge;
  return bridge;
}

export function getAttachmentsSnapshot(): AttachmentsSnapshot {
  return installAttachmentsBridge().getSnapshot();
}

export function subscribeToAttachments(listener: Listener): () => void {
  return installAttachmentsBridge().subscribe(listener);
}