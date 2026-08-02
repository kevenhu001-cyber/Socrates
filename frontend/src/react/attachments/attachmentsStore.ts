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

/* RAF-throttled commit — rapid progress updates (FileReader fires
   dozens of events per second per file) would otherwise trigger a
   React re-render on every tick, thrashing layout. RAF coalesces
   all updates within a frame into a single notification. */
let _commitRaf = 0;
let _pendingCommit: Omit<AttachmentsSnapshot, 'revision'> | null = null;

function flushCommit(): void {
  _commitRaf = 0;
  if (!_pendingCommit) return;
  const next = _pendingCommit;
  _pendingCommit = null;
  snapshot = Object.freeze({
    attachments: Object.freeze([...next.attachments]),
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function commit(next: Omit<AttachmentsSnapshot, 'revision'>): void {
  _pendingCommit = next;
  if (!_commitRaf) {
    _commitRaf = requestAnimationFrame(flushCommit);
  }
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