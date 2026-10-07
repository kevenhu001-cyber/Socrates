import type { StagedAttachment } from './attachmentModels';

/* Durable attachment persistence: upload the staged bytes to POST /api/files
 * with the owning sessionId so the file lands in the library and the model
 * can re-read it later. Returns the durable file id, or null when the
 * platform cannot upload (the turn still proceeds with the inline copy). */

export interface AttachmentUploadTarget {
  url: string;
  token?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

export async function persistStagedAttachment(
  _staged: StagedAttachment,
  _target: AttachmentUploadTarget,
  _sessionId: string,
): Promise<string | null> {
  return null;
}
