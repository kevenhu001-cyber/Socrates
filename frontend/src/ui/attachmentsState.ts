import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export type AttachmentKind = 'image' | 'text' | 'document' | 'file' | 'pdf' | 'unknown';

export interface AttachmentEntry {
  id: string;
  kind: AttachmentKind | string;
  name?: string;
  mime?: string;
  fileId?: string;
  size?: number;
  pending?: boolean;
  progress?: number;
  stage?: 'queued' | 'uploading' | 'processing' | 'done' | 'error';
  loaded?: number;
  total?: number;
  truncated?: boolean;
  error?: string;
  dataUrl?: string;
  thumbnailUrl?: string;
  text?: string;
  docKind?: string;
}

export interface AttachmentsSnapshot {
  attachments: ReadonlyArray<AttachmentEntry>;
  revision: number;
}

type AttachmentsUpdate = Pick<AttachmentsSnapshot, 'attachments'>;

export const attachmentsState = createImmutableBridge<AttachmentsSnapshot, AttachmentsUpdate>({
  initial: { attachments: [], revision: 0 },
  reducer: (_state, update) => ({
    attachments: Object.freeze([...update.attachments]),
  }),
});

export function publishAttachmentsState(attachments: ReadonlyArray<AttachmentEntry>): void {
  attachmentsState.dispatch({ attachments: [...attachments] });
}
