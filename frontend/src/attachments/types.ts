import type { Attachment } from '@socrates/contracts';

/** Composer ownership and upload lifecycle are local; persisted fields use the wire contract. */
export interface PendingAttachment extends Attachment {
  pending?: boolean;
  progress?: number;
  stage?: 'queued' | 'uploading' | 'processing' | 'done' | 'error';
  loaded?: number;
  total?: number;
  error?: string;
  sent?: boolean;
  thumbnailUrl?: string;
  _sig?: string;
  _file?: File | null;
  _cancelled?: boolean;
  _abort?: () => void;
}
export interface UploadOutcome {
  ok?: boolean;
  error?: string;
  cancelled?: boolean;
  fileId?: string;
  mimeType?: string;
  size?: number;
  kind?: string;
}
export interface AddFilesResult { added: number; rejected: string[] }
export type UploadProgress = (percent: number, loaded?: number, total?: number) => void;
export type MessageContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
