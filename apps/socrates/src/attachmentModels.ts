import type { Attachment } from '@socrates/contracts';

/* Staged composer attachments for the Universal App. Platform pickers
 * (attachments.web/native.ts) produce these; the composer holds them until
 * send, when documents resolve to extracted text and everything lands on
 * the turn's user message. Images ride as data URLs (model content parts);
 * documents ride as extracted/plain text ([Parsed …] blocks). Nothing here
 * touches the DOM — web file reading stays in attachments.web.ts. */

export type StagedKind = 'image' | 'document' | 'text';

/** Raw picker output; documents resolve to text at send time. */
export interface PickedFile {
  name: string;
  mime: string;
  size: number;
  stagedKind: StagedKind;
  dataUrl?: string;
  text?: string;
  /** Native cache URI for the send-time extract upload. */
  nativeUri?: string;
  /** Web File for the send-time extract upload. */
  webFile?: File;
}
export interface StagedAttachment {
  localId: string;
  name: string;
  mime: string;
  size: number;
  stagedKind: StagedKind;
  /** Images: data URL for model content parts. */
  dataUrl?: string;
  /** Resolved model-readable text (extracted or read directly). */
  text?: string;
  truncated?: boolean;
  /** Server-known kinds only after a real parse; kept for parity. */
  docKind?: string;
  /** Send-time extract payloads (never persisted, never rendered). */
  nativeUri?: string;
  webFile?: File;
}

/** 25 MB matches the /api/files per-file cap. */
export const ATTACH_MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TEXT_MIMES = ['text/plain', 'text/markdown', 'text/csv'];
const TEXT_EXTS = ['.txt', '.md', '.markdown', '.csv', '.json', '.log'];

export function stagedKindFor(mime: string, name: string): StagedKind {
  const normalized = mime.toLowerCase().split(';')[0].trim();
  if (IMAGE_MIMES.includes(normalized)) return 'image';
  if (TEXT_MIMES.includes(normalized) || TEXT_EXTS.some((ext) => name.toLowerCase().endsWith(ext))) return 'text';
  return 'document';
}

export function stagedToMessageAttachment(staged: StagedAttachment): Attachment {
  return {
    id: staged.localId,
    kind: staged.stagedKind === 'image' ? 'image' : staged.stagedKind === 'text' ? 'text' : 'document',
    name: staged.name,
    mime: staged.mime,
    size: staged.size,
    ...(staged.dataUrl ? { dataUrl: staged.dataUrl } : {}),
    ...(staged.text !== undefined ? { text: staged.text } : {}),
    ...(staged.truncated ? { truncated: true } : {}),
    ...(staged.docKind ? { docKind: staged.docKind } : {}),
  };
}

export function describeStaged(staged: StagedAttachment): string {
  if (staged.stagedKind === 'image') return `${staged.name} (image)`;
  if (staged.text !== undefined) return `${staged.name} (${Math.round(staged.text.length / 1024)} KB of text)`;
  return `${staged.name} (document — text extracts on send)`;
}
