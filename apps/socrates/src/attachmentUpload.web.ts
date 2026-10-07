import type { StagedAttachment } from './attachmentModels';
import type { AttachmentUploadTarget } from './attachmentUpload';

/* Web upload: images carry a data URL, plain text carries a string and
 * documents carry the original File. All three become a Blob so the same
 * multipart request works. */

async function blobFor(staged: StagedAttachment): Promise<Blob | null> {
  if (staged.webFile) return staged.webFile;
  if (staged.dataUrl) {
    const response = await fetch(staged.dataUrl);
    return response.ok ? response.blob() : null;
  }
  if (staged.text !== undefined) return new Blob([staged.text], { type: staged.mime || 'text/plain' });
  return null;
}

export async function persistStagedAttachment(
  staged: StagedAttachment,
  target: AttachmentUploadTarget,
  sessionId: string,
): Promise<string | null> {
  const blob = await blobFor(staged);
  if (!blob) return null;
  const form = new FormData();
  form.append('file', blob, staged.name);
  form.append('sessionId', sessionId);
  const fetcher = target.fetch ?? globalThis.fetch.bind(globalThis);
  // No explicit Content-Type: the runtime sets the multipart boundary.
  const response = await fetcher(target.url, { method: 'POST', body: form as unknown as BodyInit });
  const body = await response.json().catch(() => null) as { id?: string } | null;
  return response.ok && body?.id ? body.id : null;
}
