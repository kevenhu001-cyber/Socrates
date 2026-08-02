/**
 * Shared contracts for the attachment-chip row React migration boundary.
 *
 * The legacy module (`src/attachments.js`) owns the pending-attachment
 * store; the renderer in `src/attachments/render.js` mirrors it into
 * `#attachmentChips` and `#topicAttachmentChips`. This module describes
 * what the React compatibility root needs to know to render the same
 * rows.
 */

export type AttachmentKind = 'image' | 'text' | 'document' | 'unknown';

export interface AttachmentEntry {
  id: string;
  kind: AttachmentKind | string;
  name?: string;
  mime?: string;
  size?: number;
  pending?: boolean;
  progress?: number;
  truncated?: boolean;
  error?: string;
  dataUrl?: string;
  /** URL.createObjectURL for instant chip display — O(1), no
   *  base64 decode needed for the 28×28 thumbnail. Populated on
   *  pending stub, revoked once the full dataUrl is ready. */
  thumbnailUrl?: string;
  text?: string;
  docKind?: string;
}

export interface AttachmentsSnapshot {
  attachments: ReadonlyArray<AttachmentEntry>;
  revision: number;
}

export interface AttachmentsBridge {
  getSnapshot: () => AttachmentsSnapshot;
  publish: (snapshot: Omit<AttachmentsSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesAttachmentsBridge?: AttachmentsBridge;
  }
}